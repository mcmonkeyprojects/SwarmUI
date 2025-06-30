﻿using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.IO;
using System.Net.WebSockets;
using System.Text.RegularExpressions;

namespace SwarmUI.WebAPI;

[API.APIClass("API routes related to handling models (including loras, wildcards, etc).")]
public static class ModelsAPI
{
    public static long ModelEditID = 0;

    public static void Register()
    {
        API.RegisterAPICall(ListModels, false, Permissions.FundamentalModelAccess);
        API.RegisterAPICall(DescribeModel, false, Permissions.FundamentalModelAccess);
        API.RegisterAPICall(ListLoadedModels, false, Permissions.FundamentalModelAccess);
        API.RegisterAPICall(SelectModel, true, Permissions.LoadModelsNow);
        API.RegisterAPICall(SelectModelWS, true, Permissions.LoadModelsNow);
        API.RegisterAPICall(DeleteWildcard, true, Permissions.EditWildcards);
        API.RegisterAPICall(TestPromptFill, false, Permissions.FundamentalModelAccess);
        API.RegisterAPICall(EditWildcard, true, Permissions.EditWildcards);
        API.RegisterAPICall(EditModelMetadata, true, Permissions.EditModelMetadata);
        API.RegisterAPICall(DoModelDownloadWS, true, Permissions.DownloadModels);
        API.RegisterAPICall(GetModelHash, true, Permissions.EditModelMetadata);
        API.RegisterAPICall(ForwardMetadataRequest, false, Permissions.EditModelMetadata);
        API.RegisterAPICall(DeleteModel, false, Permissions.DeleteModels);
        API.RegisterAPICall(RenameModel, false, Permissions.DeleteModels);
    }

    /// <summary>Map of unique registration IDs to extra model provider functions.</summary>
    public static ConcurrentDictionary<string, Func<string, Dictionary<string, JObject>>> ExtraModelProviders = new()
    {
        ["remote_swarm"] = InternalSwarmRemoteModels
    };

    public static Dictionary<string, JObject> InternalSwarmRemoteModels(string subtype)
    {
        SwarmSwarmBackend[] backends = [.. Program.Backends.RunningBackendsOfType<SwarmSwarmBackend>().Where(b => b.RemoteModels is not null)];
        IEnumerable<Dictionary<string, JObject>> sets = backends.Select(b => b.RemoteModels.GetValueOrDefault(subtype)).Where(b => b is not null);
        if (sets.IsEmpty())
        {
            return [];
        }
        return sets.Aggregate((a, b) => a.Union(b).PairsToDictionary(false));
    }

    public static Dictionary<string, JObject> InternalExtraModels(string subtype)
    {
        List<Dictionary<string, JObject>> provided = [];
        foreach (string provider in ExtraModelProviders.Keys)
        {
            try
            {
                Dictionary<string, JObject> result = ExtraModelProviders[provider](subtype);
                if (result is not null)
                {
                    provided.Add(result);
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Failed to load extra models from provider '{provider}': {ex.ReadableString()}");
            }
        }
        return provided.Aggregate((a, b) => a.Union(b).PairsToDictionary(false));
    }

    /// <summary>Placeholder model indicating the lack of a model.</summary>
    public static T2IModel NoneModel = new(null, null, "(ERROR_NONE_MODEL_USED_LITERALLY)", "(None)") { Description = "No model selected." };

    [API.APIDescription("Returns a full description for a single model.",
        """
            "model":
            {
                "name": "namehere",
                "title": "titlehere",
                "author": "authorhere",
                "description": "descriptionhere",
                "preview_image": "data:image/jpg;base64,abc123",
                "loaded": false, // true if any backend has the model loaded currently
                "architecture": "archhere", // model class ID
                "class": "classhere", // user-friendly class name
                "compat_class": "compatclasshere", // compatibility class name
                "standard_width": 1024,
                "standard_height": 1024,
                "license": "licensehere",
                "date": "datehere",
                "usage_hint": "usagehinthere",
                "trigger_phrase": "triggerphrasehere",
                "merged_from": "mergedfromhere",
                "tags": ["tag1", "tag2"],
                "is_supported_model_format": true,
                "is_negative_embedding": false,
                "local": true // false means remote servers (Swarm-API-Backend) have this model, but this server does not
            }
        """
        )]
    public static async Task<JObject> DescribeModel(Session session,
        [API.APIParameter("Full filepath name of the model being requested.")] string modelName,
        [API.APIParameter("What model sub-type to use, can be eg `LoRA` or `Wildcards` or etc.")] string subtype = "Stable-Diffusion")
    {
        if (!Program.T2IModelSets.TryGetValue(subtype, out T2IModelHandler handler) && subtype != "Wildcards")
        {
            return new JObject() { ["error"] = "Invalid sub-type." };
        }
        modelName = modelName.Replace('\\', '/');
        while (modelName.Contains("//"))
        {
            modelName = modelName.Replace("//", "/");
        }
        modelName = modelName.TrimStart('/');
        if (session.User.IsAllowedModel(modelName))
        {
            using ManyReadOneWriteLock.ReadClaim claim = Program.RefreshLock.LockRead();
            if (subtype == "Wildcards")
            {
                WildcardsHelper.Wildcard card = WildcardsHelper.GetWildcard(modelName);
                if (card is not null)
                {
                    return card.GetNetObject();
                }
            }
            else if (subtype == "Stable-Diffusion" && modelName.ToLowerFast() == "(none)")
            {
                return new JObject() { ["model"] = NoneModel.ToNetObject() };
            }
            else if (handler.Models.TryGetValue(modelName + ".safetensors", out T2IModel model))
            {
                return new JObject() { ["model"] = model.ToNetObject() };
            }
            else if (handler.Models.TryGetValue(modelName, out model))
            {
                return new JObject() { ["model"] = model.ToNetObject() };
            }
            else if (InternalExtraModels(subtype).TryGetValue(modelName + ".safetensors", out JObject remoteModel))
            {
                return new JObject() { ["model"] = remoteModel };
            }
            else if (InternalExtraModels(subtype).TryGetValue(modelName, out remoteModel))
            {
                return new JObject() { ["model"] = remoteModel };
            }
        }
        Logs.Debug($"Request for {subtype} model {modelName} rejected as not found.");
        return new JObject() { ["error"] = "Model not found." };
    }

    public enum ModelHistorySortMode { Name, Title, DateCreated, DateModified }

    public record struct ModelListEntry(string Name, string Title, long TimeCreated, long TimeModified, JObject NetData);

    [API.APIDescription("Returns a list of models available on the server within a given folder, with their metadata.",
        """
            "folders": ["folder1", "folder2"],
            "files":
            [
                {
                    "name": "namehere",
                    // etc., see `DescribeModel` for the full model description
                }
            ]
        """
        )]
    public static async Task<JObject> ListModels(Session session,
        [API.APIParameter("What folder path to search within. Use empty string for root.")] string path,
        [API.APIParameter("Maximum depth (number of recursive folders) to search.")] int depth,
        [API.APIParameter("Model sub-type - `LoRA`, `Wildcards`, etc.")] string subtype = "Stable-Diffusion",
        [API.APIParameter("What to sort the list by - `Name`, `DateCreated`, or `DateModified.")] string sortBy = "Name",
        [API.APIParameter("If true, allow remote models. If false, only local models.")] bool allowRemote = true,
        [API.APIParameter("If true, the sorting should be done in reverse.")] bool sortReverse = false,
        [API.APIParameter("If true, provide model images in raw data format. If false, use URLs.")] bool dataImages = false)
    {
        if (!Enum.TryParse(sortBy, true, out ModelHistorySortMode sortMode))
        {
            return new JObject() { ["error"] = $"Invalid sort mode '{sortBy}'." };
        }
        if (!Program.T2IModelSets.TryGetValue(subtype, out T2IModelHandler handler) && subtype != "Wildcards")
        {
            return new JObject() { ["error"] = "Invalid sub-type." };
        }
        depth = Math.Clamp(depth, 1, 20);
        path = path.Replace('\\', '/');
        if (path != "")
        {
            path += '/';
        }
        while (path.Contains("//"))
        {
            path = path.Replace("//", "/");
        }
        path = path.TrimStart('/');
        HashSet<string> folders = [];
        List<ModelListEntry> files = [];
        HashSet<string> dedup = [];
        bool tryMatch(string name)
        {
            if (!name.StartsWith(path) || name.Length <= path.Length || !session.User.IsAllowedModel(name))
            {
                return false;
            }
            string part = name[path.Length..];
            int slashes = part.CountCharacter('/');
            if (slashes > 0)
            {
                string folderPart = part.BeforeLast('/');
                string[] subfolders = folderPart.Split('/');
                for (int i = 1; i <= depth && i <= subfolders.Length; i++)
                {
                    folders.Add(string.Join('/', subfolders[..i]));
                }
            }
            return slashes < depth && dedup.Add(name);
        }
        int sanityCap = Program.ServerSettings.Performance.ModelListSanityCap;
        using ManyReadOneWriteLock.ReadClaim claim = Program.RefreshLock.LockRead();
        if (subtype == "Wildcards")
        {
            foreach (string file in WildcardsHelper.ListFiles)
            {
                if (tryMatch(file))
                {
                    WildcardsHelper.Wildcard card = WildcardsHelper.GetWildcard(file);
                    files.Add(new(card.Name, card.Name.AfterLast('/'), card.TimeCreated, card.TimeModified, card.GetNetObject(dataImages)));
                    if (files.Count > sanityCap)
                    {
                        break;
                    }
                }
            }
        }
        else
        {
            foreach (T2IModel possible in handler.Models.Values)
            {
                if (tryMatch(possible.Name))
                {
                    files.Add(new(possible.Name, possible.Title, possible.Metadata?.TimeCreated ?? long.MaxValue, possible.Metadata?.TimeModified ?? long.MaxValue, possible.ToNetObject(dataImgs: dataImages)));
                    if (files.Count > sanityCap)
                    {
                        break;
                    }
                }
            }
        }
        if (allowRemote)
        {
            foreach ((string name, JObject possible) in InternalExtraModels(subtype))
            {
                if (tryMatch(name))
                {
                    JObject toAdd = possible;
                    if (!dataImages && toAdd.TryGetValue("preview_image", out JToken previewImg) && previewImg.ToString().StartsWith("data:"))
                    {
                        toAdd = toAdd.DeepClone() as JObject;
                        toAdd["preview_image"] = $"/ViewSpecial/{subtype}/{name}";
                    }
                    files.Add(new(name, name.AfterLast('/'), long.MaxValue, long.MaxValue, toAdd));
                    if (files.Count > sanityCap)
                    {
                        break;
                    }
                }
            }
        }
        if (sortMode == ModelHistorySortMode.Name)
        {
            files = [.. files.OrderBy(a => a.Name)];
        }
        else if (sortMode == ModelHistorySortMode.Title)
        {
            files = [.. files.OrderBy(a => a.Title).ThenBy(a => a.Name)];
        }
        else if (sortMode == ModelHistorySortMode.DateCreated)
        {
            files = [.. files.OrderByDescending(a => a.TimeCreated).ThenBy(a => a.Name)];
        }
        else if (sortMode == ModelHistorySortMode.DateModified)
        {
            files = [.. files.OrderByDescending(a => a.TimeModified).ThenBy(a => a.Name)];
        }
        if (sortReverse)
        {
            files.Reverse();
        }
        Utilities.QuickGC(); // (Could potentially be quite large data, so encourage GC to not slam RAM from listing out model data)
        return new JObject()
        {
            ["folders"] = JArray.FromObject(folders.ToList()),
            ["files"] = JArray.FromObject(files.Select(f => f.NetData).ToList())
        };
    }

    [API.APIDescription("Returns a list of currently loaded Stable-Diffusion models (ie at least one backend has it loaded).",
        """
            "models":
            [
                {
                    "name": "namehere",
                    // see `DescribeModel` for the full model description
                }
            ]
            """
        )]
    public static async Task<JObject> ListLoadedModels(Session session)
    {
        using ManyReadOneWriteLock.ReadClaim claim = Program.RefreshLock.LockRead();
        List<T2IModel> matches = [.. Program.MainSDModels.Models.Values.Where(m => m.AnyBackendsHaveLoaded && session.User.IsAllowedModel(m.Name))];
        return new JObject()
        {
            ["models"] = JArray.FromObject(matches.Select(m => m.ToNetObject()).ToList())
        };
    }

    [API.APIDescription("Forcibly loads a model immediately on some or all backends.", "\"success\": true")]
    public static async Task<JObject> SelectModel(Session session,
        [API.APIParameter("The full filepath of the model to load.")] string model,
        [API.APIParameter("The ID of a backend to load the model on, or null to load on all.")] string backendId = null)
    {
        using ManyReadOneWriteLock.ReadClaim claim = Program.RefreshLock.LockRead();
        return (await API.RunWebsocketHandlerCallDirect(SelectModelInternal, session, (model, backendId)))[0];
    }

    [API.APIDescription("Forcibly loads a model immediately on some or all backends, with live status updates over websocket.", "\"success\": true")]
    public static async Task<JObject> SelectModelWS(WebSocket socket, Session session, string model)
    {
        using ManyReadOneWriteLock.ReadClaim claim = Program.RefreshLock.LockRead();
        await API.RunWebsocketHandlerCallWS(SelectModelInternal, session, (model, (string)null), socket);
        await socket.SendJson(BasicAPIFeatures.GetCurrentStatusRaw(session), API.WebsocketTimeout);
        return null;
    }

    public static bool TryGetRefusalForModel(Session session, string name, out JObject refusal)
    {
        if (!session.User.IsAllowedModel(name))
        {
            Logs.Warning($"Rejected model access for model '{name}' from user {session.User.UserID}");
            refusal = new JObject() { ["error"] = "Model not found." };
            return true;
        }
        if (string.IsNullOrWhiteSpace(name))
        {
            refusal = new JObject() { ["error"] = "Invalid empty name." };
            return true;
        }
        refusal = null;
        return false;
    }

    /// <summary>Internal handler of the stable-diffusion model-load API route.</summary>
    public static async Task SelectModelInternal(Session session, (string, string) data, Action<JObject> output, bool isWS)
    {
        (string model, string backendId) = data;
        Logs.Verbose($"API request to select model '{model}' on backend '{backendId}' from user '{session.User.UserID}'");
        if (TryGetRefusalForModel(session, model, out JObject refusal))
        {
            Logs.Verbose("SelectModel refused generically");
            output(refusal);
            return;
        }
        if (!Program.MainSDModels.Models.TryGetValue(model + ".safetensors", out T2IModel actualModel) && !Program.MainSDModels.Models.TryGetValue(model, out actualModel))
        {
            Logs.Verbose("SelectModel refused due to unrecognized model");
            output(new JObject() { ["error"] = "Model not found." });
            return;
        }
        using Session.GenClaim claim = session.Claim(0, Program.Backends.T2IBackends.Count, 0, 0);
        if (isWS)
        {
            output(BasicAPIFeatures.GetCurrentStatusRaw(session));
        }
        if (!(await Program.Backends.LoadModelOnAll(actualModel, backendId is null ? null : (b => $"{b.ID}" == backendId))))
        {
            Logs.Verbose("SelectModel refused due to LoadModel returning false");
            output(new JObject() { ["error"] = "Model failed to load." });
            return;
        }
        Logs.Verbose("SelectModel succeeded");
        output(new JObject() { ["success"] = true });
    }

    [API.APIDescription("Deletes a wildcard file.", "\"success\": true")]
    public static async Task<JObject> DeleteWildcard(Session session,
        [API.APIParameter("Exact filepath name of the wildcard.")] string card)
    {
        card = Utilities.StrictFilenameClean(card);
        if (TryGetRefusalForModel(session, card, out JObject refusal))
        {
            return refusal;
        }
        if (!File.Exists($"{WildcardsHelper.Folder}/{card}.txt"))
        {
            return new JObject() { ["error"] = "Model not found." };
        }
        File.Delete($"{WildcardsHelper.Folder}/{card}.txt");
        if (File.Exists($"{WildcardsHelper.Folder}/{card}.jpg"))
        {
            File.Delete($"{WildcardsHelper.Folder}/{card}.jpg");
        }
        WildcardsHelper.WildcardFiles.TryRemove(card.ToLowerFast(), out _);
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Tests how a prompt fills. Useful for testing wildcards, `<random:...`, etc.",
        """
            "result": "your filled prompt"
        """)]
    public static async Task<JObject> TestPromptFill(Session session,
        [API.APIParameter("The prompt to fill.")] string prompt)
    {
        T2IParamInput input = new(session);
        input.Set(T2IParamTypes.Seed, Random.Shared.Next(int.MaxValue));
        input.Set(T2IParamTypes.Prompt, prompt);
        input.Set(T2IParamTypes.NegativePrompt, "");
        input.PreparsePromptLikes();
        return new JObject() { ["result"] = input.Get(T2IParamTypes.Prompt) };
    }

    [API.APIDescription("Edits a wildcard file.", "\"success\": true")]
    public static async Task<JObject> EditWildcard(Session session,
        [API.APIParameter("Exact filepath name of the wildcard.")] string card,
        [API.APIParameter("Newline-separated string listing of wildcard options.")] string options,
        [API.APIParameter("Image-data-string of a preview, or null to not change.")] string preview_image = null,
        [API.APIParameter("Optional raw text of metadata to inject to the preview image.")] string preview_image_metadata = null)
    {
        card = Utilities.StrictFilenameClean(card);
        if (TryGetRefusalForModel(session, card, out JObject refusal))
        {
            return refusal;
        }
        string path = $"{WildcardsHelper.Folder}/{card}.txt";
        string folder = Path.GetDirectoryName(path);
        Directory.CreateDirectory(folder);
        File.WriteAllBytes(path, StringConversionHelper.UTF8Encoding.GetBytes(options));
        if (!string.IsNullOrWhiteSpace(preview_image))
        {
            Image img = Image.FromDataString(preview_image).ToMetadataJpg(preview_image_metadata);
            File.WriteAllBytes($"{WildcardsHelper.Folder}/{card}.jpg", img.ImageData);
        }
        WildcardsHelper.WildcardFiles[card.ToLowerFast()] = new WildcardsHelper.Wildcard() { Name = card };
        Interlocked.Increment(ref ModelEditID);
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Modifies the metadata of a model. Returns before the file update is necessarily saved.", "\"success\": true")]
    public static async Task<JObject> EditModelMetadata(Session session,
        [API.APIParameter("Exact filepath name of the model.")] string model,
        [API.APIParameter("New model `title` metadata value.")] string title,
        [API.APIParameter("New model `author` metadata value.")] string author,
        [API.APIParameter("New model `architecture` metadata value (architecture ID).")] string type,
        [API.APIParameter("New model `description` metadata value.")] string description,
        [API.APIParameter("New model `standard_width` metadata value.")] int standard_width,
        [API.APIParameter("New model `standard_height` metadata value.")] int standard_height,
        [API.APIParameter("New model `usage_hint` metadata value.")] string usage_hint,
        [API.APIParameter("New model `date` metadata value.")] string date,
        [API.APIParameter("New model `license` metadata value.")] string license,
        [API.APIParameter("New model `trigger_phrase` metadata value.")] string trigger_phrase,
        [API.APIParameter("New model `prediction_type` metadata value.")] string prediction_type,
        [API.APIParameter("New model `tags` metadata value (comma-separated list).")] string tags,
        [API.APIParameter("New model `preview_image` metadata value (image-data-string format, or null to not change).")] string preview_image = null,
        [API.APIParameter("Optional raw text of metadata to inject to the preview image.")] string preview_image_metadata = null,
        [API.APIParameter("New model `is_negative_embedding` metadata value.")] bool is_negative_embedding = false,
        [API.APIParameter("The model's sub-type, eg `Stable-Diffusion`, `LoRA`, etc.")] string subtype = "Stable-Diffusion")
    {
        using ManyReadOneWriteLock.ReadClaim claim = Program.RefreshLock.LockRead();
        if (!Program.T2IModelSets.TryGetValue(subtype, out T2IModelHandler handler))
        {
            return new JObject() { ["error"] = "Invalid sub-type." };
        }
        if (TryGetRefusalForModel(session, model, out JObject refusal))
        {
            return refusal;
        }
        if (!handler.Models.TryGetValue(model, out T2IModel actualModel))
        {
            return new JObject() { ["error"] = "Model not found." };
        }
        lock (handler.ModificationLock)
        {
            actualModel.Title = string.IsNullOrWhiteSpace(title) ? null : title;
            actualModel.Description = description;
            if (!string.IsNullOrWhiteSpace(type))
            {
                actualModel.ModelClass = T2IModelClassSorter.ModelClasses.GetValueOrDefault(type);
            }
            if (standard_width > 0)
            {
                actualModel.StandardWidth = standard_width;
            }
            if (standard_height > 0)
            {
                actualModel.StandardHeight = standard_height;
            }
            actualModel.Metadata ??= new();
            if (!string.IsNullOrWhiteSpace(preview_image))
            {
                Image img = Image.FromDataString(preview_image).ToMetadataJpg(preview_image_metadata);
                if (img is not null)
                {
                    actualModel.PreviewImage = img.AsDataString();
                    actualModel.Metadata.PreviewImage = actualModel.PreviewImage;
                }
            }
            actualModel.Metadata.Author = author;
            actualModel.Metadata.UsageHint = usage_hint;
            actualModel.Metadata.Date = date;
            actualModel.Metadata.License = license;
            actualModel.Metadata.TriggerPhrase = trigger_phrase;
            actualModel.Metadata.Tags = string.IsNullOrWhiteSpace(tags) ? null : tags.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            actualModel.Metadata.IsNegativeEmbedding = is_negative_embedding;
            actualModel.Metadata.PredictionType = string.IsNullOrWhiteSpace(prediction_type) ? null : prediction_type;
        }
        handler.ResetMetadataFrom(actualModel);
        _ = Utilities.RunCheckedTask(() => actualModel.ResaveModel(), "model resave");
        Interlocked.Increment(ref ModelEditID);
        return new JObject() { ["success"] = true };
    }

    public static AsciiMatcher TokenTextLimiter = new(AsciiMatcher.BothCaseLetters + AsciiMatcher.Digits + " -_.,/");

    [API.APIDescription("Downloads a model to the server, with websocket progress updates.\nNote that this does not trigger a model refresh itself, you must do that after a 'success' reply.", "")]
    public static async Task<JObject> DoModelDownloadWS(Session session, WebSocket ws,
        [API.APIParameter("The URL to download a model from.")] string url,
        [API.APIParameter("The model's sub-type, eg `Stable-Diffusion`, `LoRA`, etc.")] string type,
        [API.APIParameter("The filename to use for the model.")] string name,
        [API.APIParameter("Optional raw text of JSON metadata to inject to the model.")] string metadata = null)
    {
        if (!url.StartsWith("http://") && !url.StartsWith("https://"))
        {
            await ws.SendJson(new JObject() { ["error"] = "Invalid URL." }, API.WebsocketTimeout);
            return null;
        }
        name = Utilities.StrictFilenameClean(name.Replace(' ', '_'));
        if (TryGetRefusalForModel(session, name, out JObject refusal))
        {
            await ws.SendJson(refusal, API.WebsocketTimeout);
            return null;
        }
        if (!Program.T2IModelSets.TryGetValue(type, out T2IModelHandler handler))
        {
            await ws.SendJson(new JObject() { ["error"] = "Invalid type." }, API.WebsocketTimeout);
            return null;
        }
        string originalUrl = url;
        url = url.Before('#');
        Dictionary<string, string> headers = [];
        if (url.StartsWith("https://civitai.com/"))
        {
            string civitaiApiKey = session.User.GetGenericData("civitai_api", "key");
            if (!string.IsNullOrEmpty(civitaiApiKey))
            {
                if (!url.Contains("?token=") && !url.Contains("&token="))
                {
                    url += (url.Contains('?') ? "&token=" : "?token=") + TokenTextLimiter.TrimToMatches(civitaiApiKey);
                    Logs.Debug($"Added Civitai API Key to download request. Original URL: {originalUrl}");
                }
            }
        }
        else if (url.StartsWith("https://huggingface.co/"))
        {
            string hfApiKey = session.User.GetGenericData("huggingface_api", "key");
            if (!string.IsNullOrEmpty(hfApiKey))
            {
                headers["Authorization"] = $"Bearer {TokenTextLimiter.TrimToMatches(hfApiKey)}";
                Logs.Debug($"Added HuggingFace API Key to download request.");
            }
        }
        try
        {
            string outPath = $"{handler.DownloadFolderPath}/{name}.safetensors";
            if (File.Exists(outPath))
            {
                await ws.SendJson(new JObject() { ["error"] = "Model at that save path already exists." }, API.WebsocketTimeout);
                return null;
            }
            string tempPath = $"{handler.DownloadFolderPath}/{name}.download.tmp";
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
            Directory.CreateDirectory(Path.GetDirectoryName(outPath));
            using CancellationTokenSource canceller = new();
            Task downloading = Utilities.DownloadFile(url, tempPath, (progress, total, perSec) =>
            {
                ws.SendJson(new JObject()
                {
                    ["current_percent"] = progress / (double)total,
                    ["overall_percent"] = 0.2,
                    ["per_second"] = perSec
                }, API.WebsocketTimeout).Wait();
            }, canceller, originalUrl, headers: headers);
            Task listenForSignal = Utilities.RunCheckedTask(async () =>
            {
                while (true)
                {
                    while (ws.State == WebSocketState.Connecting)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(0.1), Program.GlobalProgramCancel);
                    }
                    if (ws.State != WebSocketState.Open || ws.CloseStatus.HasValue || downloading.IsCompleted)
                    {
                        break;
                    }
                    JObject data = await ws.ReceiveJson(1024 * 1024, true);
                    if (data is null)
                    {
                        continue;
                    }
                    Logs.Verbose($"Model download websocket inbound: {data}");
                    if (data.TryGetValue("signal", out JToken signal))
                    {
                        string cmd = $"{signal}".ToLowerFast();
                        if (cmd == "cancel")
                        {
                            canceller.Cancel();
                        }
                    }
                }
            });
            await downloading;
            File.Move(tempPath, outPath);
            if (!string.IsNullOrWhiteSpace(metadata))
            {
                File.WriteAllText($"{handler.DownloadFolderPath}/{name}.swarm.json", metadata);
            }
            if (Program.ServerSettings.Paths.DownloaderAlwaysResave)
            {
                using (ManyReadOneWriteLock.WriteClaim claim = Program.RefreshLock.LockWrite())
                {
                    handler.Refresh();
                }
                if (handler.Models.TryGetValue($"{name}.safetensors", out T2IModel model))
                {
                    model.ResaveModel();
                }
                else
                {
                    Logs.Warning($"Could not resave model '{name}.safetensors' as it has not shown up in the backing handler. Something may have gone wrong.");
                }
            }
            await ws.SendJson(new JObject() { ["success"] = true }, API.WebsocketTimeout);
        }
        catch (SwarmReadableErrorException userErr)
        {
            Logs.Warning($"Failed to download the model due to: {userErr.Message}");
            await ws.SendJson(new JObject() { ["error"] = userErr.Message }, API.WebsocketTimeout);
            return null;
        }
        catch (TaskCanceledException)
        {
            Logs.Info("Download was cancelled.");
            await ws.SendJson(new JObject() { ["error"] = "Download was cancelled." }, API.WebsocketTimeout);
            return null;
        }
        catch (Exception ex)
        {
            Logs.Warning($"Failed to download the model due to internal exception: {ex.ReadableString()}");
            await ws.SendJson(new JObject() { ["error"] = "Failed to download the model due to internal exception." }, API.WebsocketTimeout);
        }
        return null;
    }

    [API.APIDescription("Gets or creates a valid tensor hash for the requested model.", "\"hash\": \"0xABC123\"")]
    public static async Task<JObject> GetModelHash(Session session,
        [API.APIParameter("Full filepath name of the model being requested.")] string modelName,
        [API.APIParameter("What model sub-type to use, can be eg `LoRA` or `Stable-Diffusion` or etc.")] string subtype = "Stable-Diffusion")
    {
        if (!Program.T2IModelSets.TryGetValue(subtype, out T2IModelHandler handler))
        {
            return new JObject() { ["error"] = "Invalid sub-type." };
        }
        T2IModel match = null;
        if (session.User.IsAllowedModel(modelName))
        {
            if (handler.Models.TryGetValue(modelName + ".safetensors", out T2IModel model))
            {
                match = model;
            }
            else if (handler.Models.TryGetValue(modelName, out model))
            {
                match = model;
            }
        }
        if (match is null)
        {
            return new JObject() { ["error"] = "Model not found." };
        }
        return new JObject() { ["hash"] = match.GetOrGenerateTensorHashSha256() };
    }

    public static AsciiMatcher MetadataUrlAllowedChars = new(AsciiMatcher.BothCaseLetters + AsciiMatcher.Digits + "/\\-_.?=&%");

    [API.APIDescription("Forwards a metadata request, eg to civitai API.", "")]
    public static async Task<JObject> ForwardMetadataRequest(Session session, string url)
    {
        if (!url.StartsWithFast("https://civitai.com/"))
        {
            return new JObject() { ["error"] = "Invalid URL." };
        }
        string resp;
        try
        {
            resp = await Utilities.UtilWebClient.GetStringAsync(url);
        }
        catch (Exception ex)
        {
            Logs.Warning($"While making metadata request to '{url}', got exception: {ex.ReadableString()}");
            return new JObject() { ["error"] = $"{ex.GetType().Name}: {ex.Message}" };
        }
        try
        {
            return new JObject() { ["response"] = resp.ParseToJson() };
        }
        catch (Exception ex)
        {
            Logs.Warning($"While parsing JSON response from '{url}', got exception: {ex.ReadableString()}");
            return new JObject() { ["error"] = $"{ex.GetType().Name}: {ex.Message}" };
        }
    }

    /// <summary>Internal call for model/image delete to clean up folders recursively.</summary>
    static void AutoFolderRemove(T2IModelHandler handler, string path)
    {
        if (Directory.EnumerateFileSystemEntries(path).Any())
        {
            return;
        }
        string proper = Path.GetFullPath(path);
        if (handler.FolderPaths.Any(preserve => Path.GetFullPath(preserve) == proper))
        {
            return;
        }
        string parent = Path.GetDirectoryName(path);
        Directory.Delete(path);
        AutoFolderRemove(handler, parent);
    }

    [API.APIDescription("Deletes a model from storage.", "\"success\": \"true\"")]
    public static async Task<JObject> DeleteModel(Session session,
        [API.APIParameter("Full filepath name of the model being deleted.")] string modelName,
        [API.APIParameter("What model sub-type to use, can be eg `LoRA` or `Stable-Diffusion` or etc.")] string subtype = "Stable-Diffusion")
    {
        if (!Program.T2IModelSets.TryGetValue(subtype, out T2IModelHandler handler))
        {
            return new JObject() { ["error"] = "Invalid sub-type." };
        }
        using ManyReadOneWriteLock.ReadClaim claim = Program.RefreshLock.LockRead();
        T2IModel match = null;
        if (session.User.IsAllowedModel(modelName))
        {
            if (handler.Models.TryGetValue(modelName + ".safetensors", out T2IModel model))
            {
                match = model;
            }
            else if (handler.Models.TryGetValue(modelName, out model))
            {
                match = model;
            }
        }
        if (match is null)
        {
            return new JObject() { ["error"] = "Model not found." };
        }
        Action<string> deleteFile = Program.ServerSettings.Paths.RecycleDeletedImages ? Utilities.SendFileToRecycle : File.Delete;
        void doDelete(string path)
        {
            deleteFile(path);
            string fileBase = Path.GetFullPath(path).BeforeLast('.');
            foreach (string str in T2IModelHandler.AllModelAttachedExtensions)
            {
                string altFile = $"{fileBase}{str}";
                if (File.Exists(altFile))
                {
                    deleteFile(altFile);
                }
            }
            AutoFolderRemove(handler, Path.GetDirectoryName(path));
        }
        doDelete(match.RawFilePath);
        if (Program.ServerSettings.Paths.EditMetadataAcrossAllDups)
        {
            foreach (string altPath in match.OtherPaths)
            {
                doDelete(altPath);
            }
        }
        handler.Models.Remove(match.Name, out _);
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Renames a model file, moving it within the model folder (allowing change of subfolders).", "\"success\": \"true\"")]
    public static async Task<JObject> RenameModel(Session session,
        [API.APIParameter("Full filepath name of the model being renamed.")] string oldName,
        [API.APIParameter("New full filepath name for the model.")] string newName,
        [API.APIParameter("What model sub-type to use, can be eg `LoRA` or `Stable-Diffusion` or etc.")] string subtype = "Stable-Diffusion")
    {
        if (!Program.T2IModelSets.TryGetValue(subtype, out T2IModelHandler handler))
        {
            return new JObject() { ["error"] = "Invalid sub-type." };
        }
        using ManyReadOneWriteLock.ReadClaim claim = Program.RefreshLock.LockRead();
        T2IModel match = null;
        if (session.User.IsAllowedModel(oldName))
        {
            if (handler.Models.TryGetValue(oldName + ".safetensors", out T2IModel model))
            {
                oldName += ".safetensors";
                match = model;
            }
            else if (handler.Models.TryGetValue(oldName, out model))
            {
                match = model;
            }
        }
        if (match is null)
        {
            return new JObject() { ["error"] = "Model not found." };
        }
        (string oldNameNoExt, string ext) = match.Name.BeforeAndAfterLast('.');
        newName = newName.BeforeLast('.');
        newName = Utilities.StrictFilenameClean(newName).Trim().Trim('/').Replace(' ', '_');
        if (string.IsNullOrWhiteSpace(newName) || !session.User.IsAllowedModel(oldName))
        {
            return new JObject() { ["error"] = "Model new name is not valid." };
        }
        if (handler.Models.TryGetValue(newName + ".safetensors", out _) || handler.Models.TryGetValue(newName, out _))
        {
            return new JObject() { ["error"] = "Model new name is already taken by an existing model." };
        }
        if (!match.RawFilePath.EndsWith(oldName))
        {
            Logs.Debug($"Model path {match.RawFilePath} does not end with {oldName}??");
            return new JObject() { ["error"] = "Paths are being mishandled by the system. Cannot rename. (Please report this bug)" };
        }
        void doMoveNow(string oldPath)
        {
            string relevantRoot = oldPath[..^oldName.Length];
            Directory.CreateDirectory($"{relevantRoot}/{Path.GetDirectoryName(newName)}");
            File.Move(oldPath, $"{relevantRoot}/{newName}.{ext}");
            foreach (string str in T2IModelHandler.AllModelAttachedExtensions)
            {
                string altFile = $"{relevantRoot}/{oldNameNoExt}{str}";
                if (File.Exists(altFile))
                {
                    File.Move(altFile, $"{relevantRoot}/{newName}{str}");
                }
            }
            AutoFolderRemove(handler, Path.GetDirectoryName(oldPath));
        }
        doMoveNow(match.RawFilePath);
        if (Program.ServerSettings.Paths.EditMetadataAcrossAllDups)
        {
            foreach (string altPath in match.OtherPaths)
            {
                doMoveNow(altPath);
            }
        }
        Interlocked.Increment(ref ModelEditID);
        return new JObject() { ["success"] = true };
    }
}
