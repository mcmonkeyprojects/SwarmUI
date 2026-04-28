using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Media;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.Data;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using Image = SwarmUI.Utils.Image;
using ISImage = SixLabors.ImageSharp.Image;
using ISImageRGBA = SixLabors.ImageSharp.Image<SixLabors.ImageSharp.PixelFormats.Rgba32>;

namespace SwarmUI.WebAPI;

[API.APIClass("API routes for actual text-to-image processing and directly related features.")]
public static class T2IAPI
{
    private const string MissingModelInputErrorMessage = "No model input given. Did your UI load properly?";

    public static void Register()
    {
        // TODO: Some of these shouldn't be here?
        API.RegisterAPICall(GenerateText2Image, true, Permissions.BasicImageGeneration);
        API.RegisterAPICall(GenerateText2ImageWS, true, Permissions.BasicImageGeneration);
        API.RegisterAPICall(AddImageToHistory, true, Permissions.BasicImageGeneration);
        API.RegisterAPICall(ListImages, false, Permissions.ViewImageHistory);
        API.RegisterAPICall(ListImagesV2, false, Permissions.ViewImageHistory);
        API.RegisterAPICall(ToggleImageStarred, true, Permissions.UserStarImages);
        API.RegisterAPICall(OpenImageFolder, true, Permissions.LocalImageFolder);
        API.RegisterAPICall(DeleteImage, true, Permissions.UserDeleteImage);
        API.RegisterAPICall(CreateHistoryFolder, true, Permissions.UserDeleteImage);
        API.RegisterAPICall(RenameHistoryFolder, true, Permissions.UserDeleteImage);
        API.RegisterAPICall(MoveHistoryImage, true, Permissions.UserDeleteImage);
        API.RegisterAPICall(ExportHistoryZip, true, Permissions.ViewImageHistory);
        API.RegisterAPICall(ListT2IParams, false, Permissions.FundamentalGenerateTabAccess);
        API.RegisterAPICall(TriggerRefresh, true, Permissions.FundamentalGenerateTabAccess); // Intentionally weird perm here: internal check for readonly vs true refresh
    }

    [API.APIDescription("Generate images from text prompts, with WebSocket updates. This is the most important route inside of Swarm.",
        """
            // A status update, contains a full `GetCurrentStatus` response, but pushed actively whenever status changes during generation
            "status":
            {
                "waiting_gens": 1,
                "loading_models": 0,
                "waiting_backends": 1,
                "live_gens": 0
            },
            "backend_status":
            {
                "status": "running",
                "class": "",
                "message": "",
                "any_loading": false
            },
            "supported_features": ["featureid", ...]

            // A progress update
            "gen_progress":
            {
                "batch_index": "0", // which image index within the batch is being updated here
                "overall_percent": 0.1, // eg how many nodes into a workflow graph, as a fraction from 0 to 1
                "current_percent": 0.0, // how far within the current node, as a fraction from 0 to 1
                "preview": "data:image/jpeg;base64,abc123" // a preview image (data-image-url), if available. If there's no preview, this key is omitted.
            }

            // An image generation result
            "image":
            {
                "image": "View/local/raw/2024-01-02/0304-a photo of a cat-etc-1.png", // the image file path, GET this path to read the image content. In some cases can be a 'data:...' encoded image.
                "batch_index": "0", // which image index within the batch this is
                "metadata": "{ ... }" // image metadata string, usually a JSON blob stringified. Not guaranteed to be.
            }

            // After image generations, sometimes there are images to discard (eg scoring extension may discard images below a certain score)
            "discard_indices": [0, 1, 2, ...] // batch indices of images to discard, if any
        """)]
    public static async Task<JObject> GenerateText2ImageWS(WebSocket socket, Session session,
        [API.APIParameter("The number of images to generate.")] int images,
        [API.APIParameter("Raw mapping of input should contain general T2I parameters (see listing on Generate tab of main interface) to values, eg `{ \"prompt\": \"a photo of a cat\", \"model\": \"OfficialStableDiffusion/sd_xl_base_1.0\", \"steps\": 20, ... }`. Note that this is the root raw map, ie all params go on the same level as `images`, `session_id`, etc.\nThe key 'extra_metadata' may be used to apply extra internal metadata as a JSON string:string map.")] JObject rawInput)
    {
        static bool hasFollowupPayload(JObject input)
        {
            foreach (JProperty prop in input.Properties())
            {
                if (prop.Name is "session_id" or "type" or "timestamp" or "signal")
                {
                    continue;
                }
                return true;
            }
            return false;
        }
        static JObject prepareFollowupInput(JObject priorInput, JObject updatedInput)
        {
            JObject prepared = (JObject)updatedInput.DeepClone();
            // Follow-up generate payloads are full requests in practice, except model can occasionally be omitted.
            // Preserve only that field so default/disabled params from an earlier run do not leak into the next one.
            if (!hasUsableModel(prepared) && hasUsableModel(priorInput) && priorInput.TryGetValue("model", out JToken priorModel))
            {
                prepared["model"] = priorModel.DeepClone();
            }
            foreach (JProperty prop in updatedInput.Properties())
            {
                if (prop.Name is "session_id" or "type" or "timestamp" or "signal")
                {
                    continue;
                }
                if (prop.Value.Type != JTokenType.Null)
                {
                    continue;
                }
                prepared.Remove(prop.Name);
            }
            return prepared;
        }
        static bool hasUsableModel(JObject input)
        {
            if (!input.TryGetValue("model", out JToken modelToken))
            {
                return false;
            }
            return !string.IsNullOrWhiteSpace(modelToken?.ToString());
        }

        using CancellationTokenSource cancelTok = new();
        bool retain = false, ended = false;
        using CancellationTokenSource linked = CancellationTokenSource.CreateLinkedTokenSource(Program.GlobalProgramCancel, cancelTok.Token);
        SharedGenT2IData data = new();
        ConcurrentDictionary<Task, Task> tasks = [];
        JObject latestInput = (JObject)rawInput.DeepClone();
        static int guessBatchSize(JObject input)
        {
            if (input.TryGetValue("batchsize", out JToken batch))
            {
                return batch.Value<int>();
            }
            return 1;
        }
        _ = Utilities.RunCheckedTask(async () =>
        {
            try
            {
                int batchOffset = images * guessBatchSize(rawInput);
                while (!cancelTok.IsCancellationRequested)
                {
                    byte[] rec = await socket.ReceiveData(Program.ServerSettings.Network.MaxReceiveBytes, linked.Token);
                    Volatile.Write(ref retain, true);
                    if (socket.State != WebSocketState.Open || cancelTok.IsCancellationRequested || Volatile.Read(ref ended))
                    {
                        return;
                    }
                    JObject newInput = StringConversionHelper.UTF8Encoding.GetString(rec).ParseToJson();
                    if (newInput.TryGetValue("type", out JToken controlType))
                    {
                        string controlTypeText = controlType?.ToString();
                        if (string.Equals(controlTypeText, "ping", StringComparison.OrdinalIgnoreCase))
                        {
                            JObject pong = new()
                            {
                                ["type"] = "pong"
                            };
                            if (newInput.TryGetValue("timestamp", out JToken timestamp))
                            {
                                pong["timestamp"] = timestamp;
                            }
                            await socket.SendJson(pong, API.WebsocketTimeout);
                            Volatile.Write(ref retain, false);
                            continue;
                        }
                        if (string.Equals(controlTypeText, "pong", StringComparison.OrdinalIgnoreCase))
                        {
                            Volatile.Write(ref retain, false);
                            continue;
                        }
                    }
                    if (newInput.TryGetValue("signal", out JToken signalToken))
                    {
                        string signalText = signalToken?.ToString();
                        if (string.Equals(signalText, "cancel", StringComparison.OrdinalIgnoreCase) || string.Equals(signalText, "interrupt", StringComparison.OrdinalIgnoreCase))
                        {
                            session.Interrupt();
                            Volatile.Write(ref retain, false);
                            continue;
                        }
                    }
                    if (!hasFollowupPayload(newInput))
                    {
                        Logs.Verbose($"Ignoring non-generation follow-up payload on GenerateText2ImageWS for user {session.User.UserID}, keys=[{newInput.Properties().Select(p => p.Name).JoinString(", ")}]");
                        Volatile.Write(ref retain, false);
                        continue;
                    }
                    JObject mergedInput = prepareFollowupInput(latestInput, newInput);
                    if (!hasUsableModel(mergedInput))
                    {
                        string rawModel = newInput.TryGetValue("model", out JToken rawModelToken) ? rawModelToken?.ToString() : null;
                        Logs.Warning($"Ignoring follow-up generation payload with no usable model on GenerateText2ImageWS for user {session.User.UserID}, raw_model='{rawModel ?? "<null>"}', keys=[{newInput.Properties().Select(p => p.Name).JoinString(", ")}]");
                        Volatile.Write(ref retain, false);
                        continue;
                    }
                    int newImages = mergedInput.TryGetValue("images", out JToken imageToken) ? imageToken.Value<int>() : 1;
                    if (newImages <= 0)
                    {
                        Logs.Verbose($"Ignoring follow-up generation payload with non-positive image count on GenerateText2ImageWS for user {session.User.UserID}, keys=[{newInput.Properties().Select(p => p.Name).JoinString(", ")}]");
                        Volatile.Write(ref retain, false);
                        continue;
                    }
                    Task handleMore = API.RunWebsocketHandlerCallWS(GenT2I_Internal, session, (newImages, mergedInput, data, batchOffset), socket);
                    tasks.TryAdd(handleMore, handleMore);
                    latestInput = mergedInput;
                    Volatile.Write(ref retain, false);
                    batchOffset += newImages * guessBatchSize(mergedInput);
                }
            }
            catch (TaskCanceledException)
            {
                return;
            }
            finally
            {
                Volatile.Write(ref retain, false);
            }
        });
        Task handle = API.RunWebsocketHandlerCallWS(GenT2I_Internal, session, (images, rawInput, data, 0), socket);
        tasks.TryAdd(handle, handle);
        while (Volatile.Read(ref retain) || tasks.Any())
        {
            await Task.WhenAny(tasks.Keys.ToList());
            foreach (Task t in tasks.Keys.Where(t => t.IsCompleted).ToList())
            {
                tasks.TryRemove(t, out _);
            }
            if (tasks.IsEmpty())
            {
                await socket.SendJson(new JObject() { ["socket_intention"] = "close" }, API.WebsocketTimeout);
                await Task.Delay(TimeSpan.FromSeconds(2)); // Give 2 seconds to allow a new gen request before actually closing
                if (tasks.IsEmpty())
                {
                    Volatile.Write(ref ended, true);
                }
            }
        }
        await socket.SendJson(BasicAPIFeatures.GetCurrentStatusRaw(session), API.WebsocketTimeout);
        return null;
    }

    [API.APIDescription("Generate images from text prompts, directly as an HTTP route. See the examples in the API docs root page.",
        """
            "images":
            [
                "View/local/raw/2024-01-02/0304-a photo of a cat-etc-1.png", // the image file path, GET this path to read the image content. In some cases can be a 'data:...' encoded image.
            ]
        """)]
    public static async Task<JObject> GenerateText2Image(Session session,
        [API.APIParameter("The number of images to generate.")] int images,
        [API.APIParameter("Raw mapping of input should contain general T2I parameters (see listing on Generate tab of main interface) to values, eg `{ \"prompt\": \"a photo of a cat\", \"model\": \"OfficialStableDiffusion/sd_xl_base_1.0\", \"steps\": 20, ... }`. Note that this is the root raw map, ie all params go on the same level as `images`, `session_id`, etc.\nThe key 'extra_metadata' may be used to apply extra internal metadata as a JSON string:string map.")] JObject rawInput)
    {
        List<JObject> outputs = await API.RunWebsocketHandlerCallDirect(GenT2I_Internal, session, (images, rawInput, new SharedGenT2IData(), 0));
        Dictionary<int, string> imageOutputs = [];
        int[] discards = null;
        foreach (JObject obj in outputs)
        {
            if (obj.ContainsKey("error"))
            {
                return obj;
            }
            if (obj.TryGetValue("image", out JToken image) && obj.TryGetValue("batch_index", out JToken index))
            {
                imageOutputs.Add((int)index, image.ToString());
            }
            if (obj.TryGetValue("discard_indices", out JToken discard))
            {
                discards = [.. discard.Values<int>()];
            }
        }
        if (discards is not null)
        {
            foreach (int x in discards)
            {
                imageOutputs.Remove(x);
            }
        }
        return new JObject() { ["images"] = new JArray(imageOutputs.Values.ToArray()) };
    }

    public static HashSet<string> AlwaysTopKeys = [];

    private static string SummarizeDiagnosticString(string value, int maxLength = 140)
    {
        if (value is null)
        {
            return "<null>";
        }
        if (value.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            string mime = value.After("data:").Before(';');
            return $"<{mime} data-url, {value.Length} chars>";
        }
        string normalized = value.Replace('\r', ' ').Replace('\n', ' ').Trim();
        if (normalized.Length <= maxLength)
        {
            return normalized;
        }
        return $"{normalized[..maxLength]}... ({normalized.Length} chars)";
    }

    private static JToken SummarizeDiagnosticToken(JToken token, int depth = 0)
    {
        if (token is null || token.Type == JTokenType.Null)
        {
            return JValue.CreateNull();
        }
        if (depth >= 3)
        {
            return $"{token.Type}";
        }
        return token.Type switch
        {
            JTokenType.String => SummarizeDiagnosticString(token.ToString()),
            JTokenType.Integer or JTokenType.Float or JTokenType.Boolean => token.DeepClone(),
            JTokenType.Array => new JObject()
            {
                ["type"] = "array",
                ["count"] = ((JArray)token).Count,
                ["items"] = new JArray(((JArray)token).Take(6).Select(t => SummarizeDiagnosticToken(t, depth + 1)))
            },
            JTokenType.Object => new JObject(((JObject)token).Properties().Take(24).Select(prop =>
                new JProperty(prop.Name, SummarizeDiagnosticToken(prop.Value, depth + 1)))),
            _ => SummarizeDiagnosticString(token.ToString())
        };
    }

    private static JObject BuildRawInputDiagnosticSummary(JObject rawInput)
    {
        JObject summary = [];
        foreach (JProperty prop in rawInput.Properties().Take(48))
        {
            summary[prop.Name] = SummarizeDiagnosticToken(prop.Value);
        }
        if (rawInput.Count > 48)
        {
            summary["__truncated__"] = $"{rawInput.Count - 48} more key(s)";
        }
        return summary;
    }

    private static JObject BuildGenerationDiagnosticData(Session session, JObject rawInput, T2IParamInput userInput, string rawModel, T2IModel parsedModel, string stage)
    {
        string prompt = userInput?.Get(T2IParamTypes.Prompt, rawInput.TryGetValue("prompt", out JToken promptToken) ? promptToken?.ToString() : null);
        string negativePrompt = userInput?.Get(T2IParamTypes.NegativePrompt, rawInput.TryGetValue("negativeprompt", out JToken negativeToken) ? negativeToken?.ToString() : null);
        int imageCount = userInput?.Get(T2IParamTypes.Images, rawInput.TryGetValue("images", out JToken imagesToken) ? imagesToken.Value<int>() : 1) ?? 1;
        int steps = userInput?.Get(T2IParamTypes.Steps, rawInput.TryGetValue("steps", out JToken stepsToken) ? stepsToken.Value<int>() : 20) ?? 20;
        string[] rawKeys = rawInput.Properties().Select(p => p.Name).Take(64).ToArray();
        string[] parsedKeys = userInput?.InternalSet?.ValuesInput?.Keys?.OrderBy(k => k, StringComparer.OrdinalIgnoreCase).Take(64).ToArray() ?? [];
        return new JObject()
        {
            ["stage"] = stage,
            ["session_id"] = session.ID,
            ["user_id"] = session.User.UserID,
            ["request_id"] = userInput?.UserRequestId ?? 0,
            ["raw_model"] = rawModel is null ? JValue.CreateNull() : rawModel,
            ["parsed_model"] = parsedModel?.Name is null ? JValue.CreateNull() : parsedModel.Name,
            ["images"] = imageCount,
            ["steps"] = steps,
            ["raw_keys"] = JArray.FromObject(rawKeys),
            ["parsed_param_keys"] = JArray.FromObject(parsedKeys),
            ["prompt_length"] = prompt?.Length ?? 0,
            ["negative_prompt_length"] = negativePrompt?.Length ?? 0,
            ["raw_input_summary"] = BuildRawInputDiagnosticSummary(rawInput),
            ["log_hint"] = $"Search server logs for [GenDiag] request={(userInput?.UserRequestId ?? 0)} session={session.ID}"
        };
    }

    private static bool TryHandleStructuredReadableGenerationError(Session session, JObject rawInput, string rawModel, T2IParamInput userInput, SwarmReadableErrorException ex, Action<string, string, JObject> setErrorWithDetails)
    {
        if (!string.Equals(ex.Message, MissingModelInputErrorMessage, StringComparison.Ordinal))
        {
            return false;
        }
        T2IModel parsedModel = userInput?.Get(T2IParamTypes.Model);
        JObject diagnosticData = BuildGenerationDiagnosticData(session, rawInput, userInput, rawModel, parsedModel, "workflow_missing_model");
        string[] parsedKeys = userInput?.InternalSet?.ValuesInput?.Keys?.OrderBy(k => k, StringComparer.OrdinalIgnoreCase).Take(32).ToArray() ?? [];
        Logs.Warning($"[GenDiag] stage=workflow_missing_model_marshaled user={session.User.UserID} session={session.ID} request={userInput?.UserRequestId ?? 0} raw_model='{SummarizeDiagnosticString(rawModel)}' parsed_keys=[{parsedKeys.JoinString(", ")}]");
        if (Logs.MinimumLevel <= Logs.LogLevel.Debug)
        {
            Logs.Debug($"[GenDiag] details={diagnosticData.ToString(Newtonsoft.Json.Formatting.None)}");
        }
        setErrorWithDetails(ex.Message, "missing_model_input", diagnosticData);
        return true;
    }

    /// <summary>Helper util to take a user-supplied JSON object of parameter data and turn it into a valid T2I request object.</summary>
    public static T2IParamInput RequestToParams(Session session, JObject rawInput, bool applyPresets = true)
    {
        T2IParamInput user_input = new(session);
        List<string> keys = [.. rawInput.Properties().Select(p => p.Name)];
        keys = [.. keys.Where(AlwaysTopKeys.Contains), .. keys.Where(k => !AlwaysTopKeys.Contains(k))];
        if (rawInput.TryGetValue("extra_metadata", out JToken extraMeta) && extraMeta is JObject obj)
        {
            foreach (JProperty prop in obj.Properties())
            {
                user_input.ExtraMeta[prop.Name] = prop.Value.ToString();
            }
        }
        foreach (string key in keys)
        {
            if (key == "session_id" || key == "presets" || key == "extra_metadata")
            {
                // Skip
            }
            else if (T2IParamTypes.TryGetType(key, out _, user_input))
            {
                JToken val = rawInput[key];
                string valStr = val is JArray jarr ? jarr.Select(v => $"{v}").JoinString("\n|||\n") : $"{val}";
                T2IParamTypes.ApplyParameter(key, valStr, user_input);
            }
            else
            {
                if (key.Equals("refinercontrol", StringComparison.OrdinalIgnoreCase) && !rawInput.ContainsKey("refinercontrolpercentage"))
                {
                    Logs.Warning($"T2I image request from user {session.User.UserID} used legacy parameter 'refinercontrol'. Modern key is 'refinercontrolpercentage'; ignoring legacy key.");
                    continue;
                }
                Logs.Warning($"T2I image request from user {session.User.UserID} had request parameter '{key}', but that parameter is unrecognized, skipping...");
            }
        }
        if (rawInput.TryGetValue("presets", out JToken presets) && presets.Any())
        {
            foreach (JToken presetName in presets.Values())
            {
                T2IPreset presetObj = session.User.GetPreset(presetName.ToString());
                if (presetObj is null)
                {
                    Logs.Warning($"User {session.User.UserID} tried to use preset '{presetName}', but it does not exist!");
                    continue;
                }
                if (applyPresets)
                {
                    presetObj.ApplyTo(user_input);
                }
                else
                {
                    user_input.PendingPresets.Add(presetObj);
                }
            }
            user_input.ExtraMeta["presets_used"] = presets.Values().Select(v => v.ToString()).ToList();
        }
        return user_input;
    }

    public class SharedGenT2IData
    {
        public int NumExtra, NumNonReal;
    }

    /// <summary>Internal route for generating images.</summary>
    public static async Task GenT2I_Internal(Session session, (int, JObject, SharedGenT2IData, int) input, Action<JObject> output, bool isWS)
    {
        (int images, JObject rawInput, SharedGenT2IData data, int batchOffset) = input;
        using Session.GenClaim claim = session.Claim(gens: images);
        if (isWS)
        {
            output(BasicAPIFeatures.GetCurrentStatusRaw(session));
        }
        void setError(string message)
        {
            setErrorWithDetails(message, null, null);
        }
        void setErrorWithDetails(string message, string errorId, JObject errorData)
        {
            Logs.Debug($"Refused to generate image for {session.User.UserID}: {message}");
            JObject err = new() { ["error"] = message };
            if (!string.IsNullOrWhiteSpace(errorId))
            {
                err["error_id"] = errorId;
            }
            if (errorData is not null)
            {
                err["error_data"] = errorData;
            }
            output(err);
            claim.LocalClaimInterrupt.Cancel();
        }
        long timeStart = Environment.TickCount64;
        T2IParamInput user_input;
        string rawModel = rawInput.TryGetValue("model", out JToken rawModelToken) ? rawModelToken?.ToString() : null;
        try
        {
            user_input = RequestToParams(session, rawInput);
            ApplyBatchOutputFolderOverride(session.User, user_input);
        }
        catch (SwarmReadableErrorException ex)
        {
            Logs.Warning($"[GenDiag] stage=request_parse_error user={session.User.UserID} session={session.ID} raw_model='{SummarizeDiagnosticString(rawModel)}' raw_keys=[{rawInput.Properties().Select(p => p.Name).Take(32).JoinString(", ")}] message='{SummarizeDiagnosticString(ex.Message)}'");
            setError(ex.Message);
            return;
        }
        T2IModel parsedModelBeforeSpecial = user_input.Get(T2IParamTypes.Model);
        Logs.Info($"[GenDiag] stage=params_loaded user={session.User.UserID} session={session.ID} request={user_input.UserRequestId} raw_model='{SummarizeDiagnosticString(rawModel)}' parsed_model_pre_special='{parsedModelBeforeSpecial?.Name ?? "<null>"}' raw_keys=[{rawInput.Properties().Select(p => p.Name).Take(32).JoinString(", ")}]");
        if (user_input.Get(T2IParamTypes.ForwardRawBackendData, false))
        {
            user_input.ReceiveRawBackendData = (type, data) =>
            {
                output(new JObject()
                {
                    ["raw_backend_data"] = new JObject()
                    {
                        ["type"] = type,
                        ["data"] = Convert.ToBase64String(data)
                    }
                });
            };
        }
        user_input.ApplySpecialLogic();
        T2IModel requestedModel = user_input.Get(T2IParamTypes.Model);
        Logs.Info($"[GenDiag] stage=params_ready user={session.User.UserID} session={session.ID} request={user_input.UserRequestId} parsed_model='{requestedModel?.Name ?? "<null>"}' images={user_input.Get(T2IParamTypes.Images, 1)} steps={user_input.Get(T2IParamTypes.Steps, 20)} parsed_keys=[{user_input.InternalSet.ValuesInput.Keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase).Take(32).JoinString(", ")}]");
        if (requestedModel is null)
        {
            JObject diagnosticData = BuildGenerationDiagnosticData(session, rawInput, user_input, rawModel, requestedModel, "missing_model_input");
            Logs.Warning($"[GenDiag] stage=missing_model_input user={session.User.UserID} session={session.ID} request={user_input.UserRequestId} raw_model='{SummarizeDiagnosticString(rawModel)}' parsed_keys=[{user_input.InternalSet.ValuesInput.Keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase).Take(32).JoinString(", ")}]");
            if (Logs.MinimumLevel <= Logs.LogLevel.Debug)
            {
                Logs.Debug($"[GenDiag] details={diagnosticData.ToString(Newtonsoft.Json.Formatting.None)}");
            }
            setErrorWithDetails(MissingModelInputErrorMessage, "missing_model_input", diagnosticData);
            return;
        }
        images = user_input.Get(T2IParamTypes.Images, 1);
        claim.Extend(images - claim.WaitingGenerations);
        Logs.Info($"User {session.User.UserID} requested {images} image{(images == 1 ? "" : "s")} with model '{requestedModel.Name}'...");
        Logs.Info($"[GenDiag] stage=dispatch user={session.User.UserID} session={session.ID} request={user_input.UserRequestId} model='{requestedModel.Name}' images={images} batchsize={user_input.Get(T2IParamTypes.BatchSize, 1)} steps={user_input.Get(T2IParamTypes.Steps, 20)}");
        if (Logs.MinimumLevel <= Logs.LogLevel.Verbose)
        {
            Logs.Verbose($"User {session.User.UserID} above image request had parameters: {user_input}");
        }
        List<T2IEngine.ImageOutput> imageSet = [];
        List<Task> tasks = [];
        void removeDoneTasks()
        {
            for (int i = 0; i < tasks.Count; i++)
            {
                if (tasks[i].IsCompleted)
                {
                    if (tasks[i].IsFaulted)
                    {
                        Logs.Error($"Image generation failed: {tasks[i].Exception}");
                    }
                    tasks.RemoveAt(i--);
                }
            }
        }
        int max_degrees = session.User.CalcMaxT2ISimultaneous;
        List<int> discard = [];
        int batchSizeExpected = user_input.Get(T2IParamTypes.BatchSize, 1);
        void saveImage(T2IEngine.ImageOutput image, int actualIndex, T2IParamInput thisParams, string metadata)
        {
            Logs.Verbose($"T2IAPI received save request for index {actualIndex} for gen request id {thisParams.UserRequestId}, isreal={image.IsReal}");
            bool noSave = thisParams.Get(T2IParamTypes.DoNotSave, false);
            if (!image.IsReal && thisParams.Get(T2IParamTypes.DoNotSaveIntermediates, false))
            {
                noSave = true;
            }
            string url, filePath;
            if (noSave)
            {
                MediaFile file = image.File;
                if (session.User.Settings.FileFormat.ReformatTransientImages && image.ActualFileTask is not null)
                {
                    file = image.ActualFileTask.Result;
                }
                (url, filePath) = (file.AsDataString(), null);
            }
            else
            {
                (url, filePath) = session.SaveImage(image, actualIndex, thisParams, metadata);
            }
            if (url == "ERROR")
            {
                setError($"Server failed to save an image.");
                return;
            }
            image.RefuseImage = () =>
            {
                if (filePath is not null && File.Exists(filePath))
                {
                    File.Delete(filePath);
                }
                discard.Add(actualIndex);
                lock (imageSet)
                {
                    imageSet.Remove(image);
                }
            };
            lock (imageSet)
            {
                imageSet.Add(image);
            }
            WebhookManager.SendEveryGenWebhook(thisParams, url, image.File);
            if (thisParams.Get(T2IParamTypes.ForwardSwarmData, false))
            {
                output(new JObject() { ["raw_swarm_data"] = new JObject() { ["params_used"] = JArray.FromObject(thisParams.ParamsQueried.ToArray()) } });
            }
            JObject imageOutput = new() { ["image"] = url, ["batch_index"] = $"{actualIndex}", ["request_id"] = $"{thisParams.UserRequestId}", ["metadata"] = string.IsNullOrWhiteSpace(metadata) ? null : metadata };
            output(imageOutput);
        }
        for (int i = 0; i < images && !claim.ShouldCancel; i++)
        {
            removeDoneTasks();
            while (tasks.Count > max_degrees)
            {
                await Task.WhenAny(tasks);
                removeDoneTasks();
            }
            if (claim.ShouldCancel)
            {
                break;
            }
            int localIndex = i * batchSizeExpected;
            int imageIndex = localIndex + batchOffset;
            T2IParamInput thisParams = user_input.Clone();
            if (!thisParams.Get(T2IParamTypes.NoSeedIncrement, false))
            {
                if (thisParams.TryGet(T2IParamTypes.VariationSeed, out long varSeed) && thisParams.Get(T2IParamTypes.VariationSeedStrength) > 0)
                {
                    thisParams.Set(T2IParamTypes.VariationSeed, varSeed + localIndex);
                }
                else
                {
                    thisParams.Set(T2IParamTypes.Seed, thisParams.Get(T2IParamTypes.Seed) + localIndex);
                }
            }
            int numCalls = 0;
            tasks.Add(Task.Run(() => T2IEngine.CreateImageTask(thisParams, $"{imageIndex}", claim, output, setError, isWS,
                (image, metadata) =>
                {
                    int actualIndex = imageIndex + numCalls;
                    if (image.IsReal)
                    {
                        numCalls++;
                        if (numCalls > batchSizeExpected)
                        {
                            actualIndex = images * batchSizeExpected + Interlocked.Increment(ref data.NumExtra);
                        }
                    }
                    else
                    {
                        actualIndex = -10 - Interlocked.Increment(ref data.NumNonReal);
                    }
                    saveImage(image, actualIndex, thisParams, metadata);
                })));
            if (Program.Backends.QueuedRequests < Program.ServerSettings.Backends.MaxRequestsForcedOrder)
            {
                Task.Delay(20).Wait(); // Tiny few-ms delay to encourage tasks retaining order.
            }
        }
        while (tasks.Any())
        {
            Task timeout = Task.Delay(TimeSpan.FromSeconds(30));
            await Task.WhenAny([.. tasks, timeout]);
            output(new JObject() { ["keep_alive"] = true });
            removeDoneTasks();
        }
        long finalTime = Environment.TickCount64;
        T2IEngine.ImageOutput[] griddables = [.. imageSet.Where(i => i.IsReal)];
        if (griddables.Length <= session.User.Settings.MaxImagesInMiniGrid && griddables.Length > 1 && griddables.All(i => i.File.Type.MetaType == MediaMetaType.Image))
        {
            ISImage[] imgs = [.. griddables.Select(i => (i.File as Image).ToIS)];
            int columns = (int)Math.Ceiling(Math.Sqrt(imgs.Length));
            int rows = columns;
            if (griddables.Length <= columns * (columns - 1))
            {
                rows--;
            }
            if (imgs.Length <= GridShapeTable.Length)
            {
                (columns, rows) = GridShapeTable[imgs.Length - 1];
            }
            int widthPerImage = imgs.Max(i => i.Width);
            int heightPerImage = imgs.Max(i => i.Height);
            ISImageRGBA grid = new(widthPerImage * columns, heightPerImage * rows);
            grid.Mutate(m =>
            {
                for (int i = 0; i < imgs.Length; i++)
                {
                    int x = (i % columns) * widthPerImage, y = (i / columns) * heightPerImage;
                    m.DrawImage(imgs[i], new Point(x, y), 1);
                }
            });
            Image gridImg = new(grid);
            long genTime = Environment.TickCount64 - timeStart;
            T2IParamInput finalInput = user_input.Clone();
            finalInput.NoUnusedParams = true;
            finalInput.ExtraMeta["generation_time"] = $"{genTime / 1000.0:0.00} total seconds (average {(finalTime - timeStart) / griddables.Length / 1000.0:0.00} seconds per image)";
            (Task<MediaFile> gridFileTask, string metadata) = finalInput.SourceSession.ApplyMetadata(gridImg, finalInput, imgs.Length);
            T2IEngine.ImageOutput gridOutput = new() { File = gridImg, ActualFileTask = gridFileTask, GenTimeMS = genTime };
            saveImage(gridOutput, -1, finalInput, metadata);
        }
        T2IEngine.PostBatchEvent?.Invoke(new(user_input, [.. griddables]));
        output(new JObject() { ["discard_indices"] = JToken.FromObject(discard) });
        WebhookManager.SendManualAtEndWebhook(user_input);
    }

    public static (int, int)[] GridShapeTable =
        [
            (1, 1), // 1
            (2, 1), // 2
            (3, 1), // 3
            (2, 2), // 4
            (3, 2), // 5
            (3, 2), // 6
            (4, 2), // 7
            (4, 2), // 8
            (3, 3), // 9
            (5, 2), // 10
            (4, 3), // 11
            (4, 3), // 12
        ];

    [API.APIDescription("Takes an image and stores it directly in the user's history.\nBehaves identical to GenerateText2Image but never queues a generation.",
        """
            "images":
            [
                {
                    "image": "View/local/raw/2024-01-02/0304-a photo of a cat-etc-1.png", // the image file path, GET this path to read the image content
                    "batch_index": "0", // which image index within the batch this is
                    "metadata": "{ ... }" // image metadata string, usually a JSON blob stringified. Not guaranteed to be.
                }
            ]
        """)]
    public static async Task<JObject> AddImageToHistory(Session session,
        [API.APIParameter("Data URL of the image to save.")] string image,
        [API.APIParameter("Raw mapping of input should contain general T2I parameters (see listing on Generate tab of main interface) to values, eg `{ \"prompt\": \"a photo of a cat\", \"model\": \"OfficialStableDiffusion/sd_xl_base_1.0\", \"steps\": 20, ... }`. Note that this is the root raw map, ie all params go on the same level as `images`, `session_id`, etc.")] JObject rawInput)
    {
        // TODO: Recognize audio/video inputs properly
        ImageFile img = ImageFile.FromDataString(image);
        T2IParamInput user_input;
        rawInput.Remove("image");
        try
        {
            user_input = RequestToParams(session, rawInput);
            ApplyBatchOutputFolderOverride(session.User, user_input);
        }
        catch (SwarmReadableErrorException ex)
        {
            return new() { ["error"] = ex.Message };
        }
        user_input.ApplySpecialLogic();
        Logs.Info($"User {session.User.UserID} stored an image to history.");
        (Task<MediaFile> imgTask, string metadata) = user_input.SourceSession.ApplyMetadata(img, user_input, 1);
        T2IEngine.ImageOutput outputImage = new() { File = img as Image, ActualFileTask = imgTask };
        (string path, _) = session.SaveImage(outputImage, 0, user_input, metadata);
        return new() { ["images"] = new JArray() { new JObject() { ["image"] = path, ["batch_index"] = "0", ["request_id"] = $"{user_input.UserRequestId}", ["metadata"] = metadata } } };
    }

    public static HashSet<string> HistoryExtensions = // TODO: Use MediaType?
    [
        "png", "jpg", // image
        "html", // special
        "gif", "webp", // animation
        "webm", "mp4", "mov", // video
        "mp3", "aac", "wav", "flac" // audio
    ];

    public enum ImageHistorySortMode { Name, Date }
    public enum ImageHistoryMediaMode { All, Image, Video, Audio, Html }

    public record class HistoryMetadataSummary(string PromptPreview, string Model, long? Seed, int? Width, int? Height, long CreatedAt, bool IsStarred, string SearchText);

    public record class HistoryResolvedItem
    {
        public string RelativePath { get; init; }

        public string CanonicalPath { get; init; }

        public string ActualPath { get; init; }

        public string PreviewPath { get; init; }

        public string Metadata { get; init; }

        public ImageHistoryMediaMode MediaType { get; init; }

        public bool Starred { get; init; }

        public long CreatedAt { get; init; }

        public string PromptPreview { get; init; }

        public string Model { get; init; }

        public long? Seed { get; init; }

        public int? Width { get; init; }

        public int? Height { get; init; }

        public string SearchText { get; init; }
    }

    public record class HistoryQueryResult
    {
        public List<string> Folders { get; set; } = [];

        public List<HistoryResolvedItem> Items { get; set; } = [];

        public string Error { get; set; }
    }

    /// <summary>Normalizes and stores a one-shot output folder override on a request if one was supplied.</summary>
    public static void ApplyBatchOutputFolderOverride(User user, T2IParamInput userInput)
    {
        if (!userInput.ExtraMeta.TryGetValue(User.BatchOutputFolderExtraMetaKey, out object rawFolder) || rawFolder is null)
        {
            return;
        }
        string cleaned = user.NormalizeBatchOutputFolder($"{rawFolder}");
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            userInput.ExtraMeta.Remove(User.BatchOutputFolderExtraMetaKey);
        }
        else
        {
            userInput.ExtraMeta[User.BatchOutputFolderExtraMetaKey] = cleaned;
        }
    }

    public static HashSet<string> HistoryImageExtensions = ["png", "jpg", "gif", "webp"];
    public static HashSet<string> HistoryVideoExtensions = ["webm", "mp4", "mov"];
    public static HashSet<string> HistoryAudioExtensions = ["mp3", "aac", "wav", "flac"];
    public static HashSet<string> HistoryHtmlExtensions = ["html"];

    private static string NormalizeHistoryPath(string path) => (path ?? "").Replace('\\', '/').Trim('/');

    private static bool IsReservedHistoryPath(string path)
    {
        string clean = NormalizeHistoryPath(path);
        return clean.StartsWith("_") || clean.Equals("Starred", StringComparison.OrdinalIgnoreCase) || clean.StartsWith("Starred/", StringComparison.OrdinalIgnoreCase);
    }

    private static string GetHistoryFileName(string path)
    {
        return NormalizeHistoryPath(path).AfterLast('/');
    }

    private static IEnumerable<string> EnumerateHistoryMediaFiles(string folder)
    {
        if (!Directory.Exists(folder))
        {
            return [];
        }
        return Directory.EnumerateFiles(folder, "*", SearchOption.AllDirectories).Where(file => HistoryExtensions.Contains(file.AfterLast('.').ToLowerInvariant()));
    }

    private static void MoveHistorySidecars(string sourcePath, string targetPath)
    {
        string sourceBeforeDot = sourcePath.BeforeLast('.');
        string targetBeforeDot = targetPath.BeforeLast('.');
        foreach (string ext in DeletableFileExtensions)
        {
            string sourceAlt = $"{sourceBeforeDot}{ext}";
            string targetAlt = $"{targetBeforeDot}{ext}";
            if (File.Exists(sourceAlt) && File.Exists(targetAlt))
            {
                throw new SwarmUserErrorException($"Cannot move image because sidecar file '{Path.GetFileName(targetAlt)}' already exists.");
            }
        }
        Directory.CreateDirectory(Path.GetDirectoryName(targetPath));
        File.Move(sourcePath, targetPath);
        foreach (string ext in DeletableFileExtensions)
        {
            string sourceAlt = $"{sourceBeforeDot}{ext}";
            if (!File.Exists(sourceAlt))
            {
                continue;
            }
            string targetAlt = $"{targetBeforeDot}{ext}";
            File.Move(sourceAlt, targetAlt);
        }
        OutputMetadataTracker.RemoveMetadataFor(sourcePath);
        OutputMetadataTracker.RemoveMetadataFor(targetPath);
    }

    private static bool TryResolveHistoryPath(Session session, string root, string rawPath, out string actualPath, out string userError)
    {
        (actualPath, string consoleError, userError) = WebServer.CheckFilePath(root, NormalizeHistoryPath(rawPath));
        if (consoleError is not null)
        {
            Logs.Error(consoleError);
            actualPath = null;
            return false;
        }
        actualPath = UserImageHistoryHelper.GetRealPathFor(session.User, actualPath, root: root);
        return true;
    }

    private static string BuildHistoryViewPath(string relativePath)
    {
        string clean = NormalizeHistoryPath(relativePath);
        return string.IsNullOrWhiteSpace(clean) ? "" : $"/View/local/{clean}";
    }

    private static string GetHistoryPreviewPath(string relativePath, ImageHistoryMediaMode mediaType)
    {
        return mediaType switch
        {
            ImageHistoryMediaMode.Audio => "/imgs/audio_placeholder.jpg",
            ImageHistoryMediaMode.Html => "/imgs/html.jpg",
            _ => $"{BuildHistoryViewPath(relativePath)}?preview=true"
        };
    }

    private static ImageHistoryMediaMode GetHistoryMediaModeForPath(string path)
    {
        string ext = NormalizeHistoryPath(path).AfterLast('.').ToLowerInvariant();
        if (HistoryVideoExtensions.Contains(ext))
        {
            return ImageHistoryMediaMode.Video;
        }
        if (HistoryAudioExtensions.Contains(ext))
        {
            return ImageHistoryMediaMode.Audio;
        }
        if (HistoryHtmlExtensions.Contains(ext))
        {
            return ImageHistoryMediaMode.Html;
        }
        return ImageHistoryMediaMode.Image;
    }

    private static bool TryParseHistoryMediaMode(string mediaType, out ImageHistoryMediaMode mode)
    {
        mode = ImageHistoryMediaMode.All;
        if (string.IsNullOrWhiteSpace(mediaType))
        {
            return true;
        }
        return Enum.TryParse(mediaType, true, out mode);
    }

    private static int ParseHistoryDepth(string depth, int defaultValue)
    {
        if (string.IsNullOrWhiteSpace(depth))
        {
            return defaultValue;
        }
        if (!int.TryParse(depth, out int parsed))
        {
            return defaultValue;
        }
        return Math.Max(parsed, 0);
    }

    private static string GetHistoryCanonicalPath(string relativePath, bool starNoFolders)
    {
        string clean = NormalizeHistoryPath(relativePath);
        if (clean.StartsWith("Starred/", StringComparison.OrdinalIgnoreCase))
        {
            clean = clean["Starred/".Length..];
        }
        return starNoFolders ? clean.Replace("/", "") : clean;
    }

    private static string BuildHistorySearchText(string relativePath, string metadata, string promptPreview, string model, long? seed, int? width, int? height)
    {
        string resolution = width.HasValue && height.HasValue ? $"{width.Value}x{height.Value}" : "";
        return $"{NormalizeHistoryPath(relativePath)}\n{promptPreview ?? ""}\n{model ?? ""}\n{seed?.ToString() ?? ""}\n{resolution}\n{metadata ?? ""}".ToLowerInvariant();
    }

    private static HistoryMetadataSummary ParseHistoryMetadataSummary(string metadata, long fileTime, bool pathIsStarred, string relativePath)
    {
        string promptPreview = null;
        string model = null;
        long? seed = null;
        int? width = null;
        int? height = null;
        long createdAt = fileTime;
        bool isStarred = pathIsStarred;
        if (!string.IsNullOrWhiteSpace(metadata) && metadata.TrimStart().StartsWith('{'))
        {
            try
            {
                JObject raw = JObject.Parse(metadata);
                isStarred = isStarred || raw.Value<bool?>("is_starred") == true;
                JObject paramData = raw["sui_image_params"] as JObject ?? raw["swarm"] as JObject ?? raw;
                promptPreview = paramData.Value<string>("prompt") ?? raw.Value<string>("prompt");
                model = paramData.Value<string>("model") ?? raw.Value<string>("model") ?? raw.Value<string>("Model");
                seed = paramData.Value<long?>("seed") ?? raw.Value<long?>("seed");
                width = paramData.Value<int?>("width") ?? raw.Value<int?>("width");
                height = paramData.Value<int?>("height") ?? raw.Value<int?>("height");
                string dateText = paramData.Value<string>("date") ?? raw.Value<string>("date");
                if (!string.IsNullOrWhiteSpace(dateText) && DateTimeOffset.TryParse(dateText, out DateTimeOffset parsedDate))
                {
                    createdAt = parsedDate.ToUnixTimeSeconds();
                }
            }
            catch (Exception)
            {
                // Metadata can be non-standard or partially broken; keep raw text searchable.
            }
        }
        if (!string.IsNullOrWhiteSpace(promptPreview))
        {
            promptPreview = promptPreview.Replace("\r", " ").Replace("\n", " ").Trim();
            if (promptPreview.Length > 180)
            {
                promptPreview = promptPreview[..177] + "...";
            }
        }
        return new(promptPreview, model, seed, width, height, createdAt, isStarred, BuildHistorySearchText(relativePath, metadata, promptPreview, model, seed, width, height));
    }

    private static bool ShouldReplaceHistoryItem(HistoryResolvedItem existing, HistoryResolvedItem candidate)
    {
        if (candidate.Starred && !existing.Starred)
        {
            return true;
        }
        if (!candidate.Starred && existing.Starred)
        {
            return false;
        }
        if (candidate.CreatedAt != existing.CreatedAt)
        {
            return candidate.CreatedAt > existing.CreatedAt;
        }
        return string.Compare(candidate.RelativePath, existing.RelativePath, StringComparison.OrdinalIgnoreCase) < 0;
    }

    private static HistoryResolvedItem BuildHistoryResolvedItem(string relativePath, string actualPath, string root, bool starNoFolders)
    {
        OutputMetadataTracker.OutputMetadataEntry metadataEntry = OutputMetadataTracker.GetMetadataFor(actualPath, root, starNoFolders);
        if (metadataEntry is null)
        {
            return null;
        }
        string cleanPath = NormalizeHistoryPath(relativePath);
        bool pathIsStarred = cleanPath.StartsWith("Starred/", StringComparison.OrdinalIgnoreCase);
        HistoryMetadataSummary summary = ParseHistoryMetadataSummary(metadataEntry.Metadata, metadataEntry.FileTime, pathIsStarred, cleanPath);
        ImageHistoryMediaMode mediaMode = GetHistoryMediaModeForPath(cleanPath);
        return new()
        {
            RelativePath = cleanPath,
            CanonicalPath = GetHistoryCanonicalPath(cleanPath, starNoFolders),
            ActualPath = actualPath,
            PreviewPath = GetHistoryPreviewPath(cleanPath, mediaMode),
            Metadata = metadataEntry.Metadata,
            MediaType = mediaMode,
            Starred = summary.IsStarred,
            CreatedAt = summary.CreatedAt,
            PromptPreview = summary.PromptPreview,
            Model = summary.Model,
            Seed = summary.Seed,
            Width = summary.Width,
            Height = summary.Height,
            SearchText = summary.SearchText
        };
    }

    private static List<string> GetImmediateHistoryFolders(Session session, string root, string rawPath, string actualPath)
    {
        HashSet<string> folders = new(StringComparer.OrdinalIgnoreCase);
        if (Directory.Exists(actualPath))
        {
            foreach (string dir in Directory.EnumerateDirectories(actualPath))
            {
                string name = Path.GetFileName(dir);
                if (!string.IsNullOrWhiteSpace(name) && !name.StartsWithFast('.'))
                {
                    folders.Add(name);
                }
            }
        }
        if (string.IsNullOrWhiteSpace(NormalizeHistoryPath(rawPath)))
        {
            foreach (string specialFolder in UserImageHistoryHelper.SharedSpecialFolders.Keys)
            {
                string topLevel = NormalizeHistoryPath(specialFolder).Before('/');
                if (!string.IsNullOrWhiteSpace(topLevel))
                {
                    folders.Add(topLevel);
                }
            }
        }
        return [.. folders.Order(StringComparer.OrdinalIgnoreCase)];
    }

    private static HistoryQueryResult QueryHistoryItems(Session session, string root, string rawPath, bool recursive, int depth, string query, ImageHistorySortMode sortBy, bool sortReverse, bool starredOnly, ImageHistoryMediaMode mediaType)
    {
        rawPath = NormalizeHistoryPath(rawPath);
        if (!TryResolveHistoryPath(session, root, rawPath, out string actualBasePath, out string userError))
        {
            return new() { Error = userError };
        }
        try
        {
            bool starNoFolders = session.User.Settings.StarNoFolders;
            HistoryQueryResult result = new()
            {
                Folders = GetImmediateHistoryFolders(session, root, rawPath, actualBasePath)
            };
            List<(string RelativePath, string ActualPath)> branches = [];
            if (string.IsNullOrWhiteSpace(rawPath))
            {
                branches.Add(("", root));
                foreach ((string specialFolder, string specialPath) in UserImageHistoryHelper.SharedSpecialFolders)
                {
                    string specialName = NormalizeHistoryPath(specialFolder);
                    if (!string.IsNullOrWhiteSpace(specialName))
                    {
                        branches.Add((specialName, specialPath));
                    }
                }
            }
            else
            {
                branches.Add((rawPath, actualBasePath));
            }
            int maxDepth = recursive ? Math.Max(depth, 0) : 0;
            Dictionary<string, HistoryResolvedItem> uniqueItems = new(StringComparer.OrdinalIgnoreCase);
            string loweredQuery = string.IsNullOrWhiteSpace(query) ? null : query.Trim().ToLowerInvariant();
            foreach ((string branchRelative, string branchActual) in branches)
            {
                if (!Directory.Exists(branchActual))
                {
                    continue;
                }
                Stack<(string RelativePath, string ActualPath, int Depth)> stack = new();
                stack.Push((NormalizeHistoryPath(branchRelative), branchActual, 0));
                while (stack.Count > 0)
                {
                    (string currentRelative, string currentActual, int currentDepth) = stack.Pop();
                    foreach (string file in Directory.EnumerateFiles(currentActual))
                    {
                        string cleanFile = file.Replace('\\', '/');
                        string fileName = cleanFile.AfterLast('/');
                        if (fileName.StartsWithFast('.'))
                        {
                            continue;
                        }
                        string extension = cleanFile.AfterLast('.').ToLowerInvariant();
                        if (!HistoryExtensions.Contains(extension) || cleanFile.EndsWith(".swarmpreview.jpg") || cleanFile.EndsWith(".swarmpreview.webp"))
                        {
                            continue;
                        }
                        string relativeFile = string.IsNullOrWhiteSpace(currentRelative) ? fileName : $"{currentRelative}/{fileName}";
                        HistoryResolvedItem item = BuildHistoryResolvedItem(relativeFile, cleanFile, root, starNoFolders);
                        if (item is null)
                        {
                            continue;
                        }
                        if (starredOnly && !item.Starred)
                        {
                            continue;
                        }
                        if (mediaType != ImageHistoryMediaMode.All && item.MediaType != mediaType)
                        {
                            continue;
                        }
                        if (loweredQuery is not null && !item.SearchText.Contains(loweredQuery))
                        {
                            continue;
                        }
                        if (uniqueItems.TryGetValue(item.CanonicalPath, out HistoryResolvedItem existing))
                        {
                            if (ShouldReplaceHistoryItem(existing, item))
                            {
                                uniqueItems[item.CanonicalPath] = item;
                            }
                        }
                        else
                        {
                            uniqueItems[item.CanonicalPath] = item;
                        }
                    }
                    if (!recursive || currentDepth >= maxDepth)
                    {
                        continue;
                    }
                    foreach (string dir in Directory.EnumerateDirectories(currentActual))
                    {
                        string dirName = Path.GetFileName(dir);
                        if (string.IsNullOrWhiteSpace(dirName) || dirName.StartsWithFast('.'))
                        {
                            continue;
                        }
                        string nextRelative = string.IsNullOrWhiteSpace(currentRelative) ? dirName : $"{currentRelative}/{dirName}";
                        stack.Push((nextRelative, dir, currentDepth + 1));
                    }
                }
            }
            List<HistoryResolvedItem> items = [.. uniqueItems.Values];
            if (sortBy == ImageHistorySortMode.Date)
            {
                items = sortReverse
                    ? [.. items.OrderBy(i => i.CreatedAt).ThenBy(i => i.RelativePath, StringComparer.OrdinalIgnoreCase)]
                    : [.. items.OrderByDescending(i => i.CreatedAt).ThenBy(i => i.RelativePath, StringComparer.OrdinalIgnoreCase)];
            }
            else
            {
                items = sortReverse
                    ? [.. items.OrderByDescending(i => i.RelativePath, StringComparer.OrdinalIgnoreCase)]
                    : [.. items.OrderBy(i => i.RelativePath, StringComparer.OrdinalIgnoreCase)];
            }
            result.Items = items;
            return result;
        }
        catch (Exception ex)
        {
            if (ex is FileNotFoundException || ex is DirectoryNotFoundException || ex is PathTooLongException)
            {
                return new() { Error = "404, path not found." };
            }
            Logs.Error($"Error reading file list: {ex.ReadableString()}");
            return new() { Error = "Error reading file list." };
        }
    }

    private static JObject GetListAPIInternal(Session session, string rawPath, string root, HashSet<string> extensions, Func<string, bool> isAllowed, int depth, ImageHistorySortMode sortBy, bool sortReverse)
    {
        int maxInHistory = session.User.Settings.MaxImagesInHistory;
        int maxScanned = session.User.Settings.MaxImagesScannedInHistory;
        Logs.Verbose($"User {session.User.UserID} wants to list images in '{rawPath}', maxDepth={depth}, sortBy={sortBy}, reverse={sortReverse}, maxInHistory={maxInHistory}, maxScanned={maxScanned}");
        long timeStart = Environment.TickCount64;
        int limit = sortBy == ImageHistorySortMode.Name ? maxInHistory : Math.Max(maxInHistory, maxScanned);
        (string path, string consoleError, string userError) = WebServer.CheckFilePath(root, rawPath);
        path = UserImageHistoryHelper.GetRealPathFor(session.User, path, root: root);
        if (consoleError is not null)
        {
            Logs.Error(consoleError);
            return new JObject() { ["error"] = userError };
        }
        try
        {
            ConcurrentDictionary<string, string> dirsConc = [];
            ConcurrentDictionary<string, string> finalDirs = [];
            ConcurrentDictionary<string, Task> tasks = [];
            void addDirs(string dir, int subDepth)
            {
                tasks.TryAdd(dir, Utilities.RunCheckedTask(() =>
                {
                    if (dir.EndsWith('/'))
                    {
                        dir = dir[..^1];
                    }
                    if (dir != "")
                    {
                        (subDepth == 0 ? finalDirs : dirsConc).TryAdd(dir, dir);
                    }
                    if (subDepth > 0)
                    {
                        string actualPath = $"{path}/{dir}";
                        actualPath = UserImageHistoryHelper.GetRealPathFor(session.User, actualPath, root: root);
                        if (!Directory.Exists(actualPath))
                        {
                            return;
                        }
                        IEnumerable<string> subDirs = Directory.EnumerateDirectories(actualPath).Select(Path.GetFileName).OrderDescending();
                        foreach (string subDir in subDirs)
                        {
                            if (subDir.StartsWithFast('.'))
                            {
                                continue;
                            }
                            string subPath = dir == "" ? subDir : $"{dir}/{subDir}";
                            if (isAllowed(subPath))
                            {
                                addDirs(subPath, subDepth - 1);
                            }
                        }
                    }
                }, "t2i getlist add dir"));
            }
            addDirs("", depth);
            string rawRefPath = Path.GetRelativePath(root, path).Replace('\\', '/');
            if (!rawRefPath.EndsWith('/'))
            {
                rawRefPath += '/';
            }
            if (rawRefPath == "./")
            {
                rawRefPath = "";
            }
            foreach (string specialFolder in UserImageHistoryHelper.SharedSpecialFolders.Keys)
            {
                if (specialFolder.StartsWith(rawRefPath))
                {
                    addDirs(specialFolder[rawRefPath.Length..], 1);
                }
            }
            while (tasks.Any(t => !t.Value.IsCompleted))
            {
                Task.WaitAll([.. tasks.Values]);
            }
            List<string> dirs = [.. dirsConc.Keys.OrderDescending()];
            if (sortReverse)
            {
                dirs.Reverse();
            }
            ConcurrentDictionary<int, List<ImageHistoryHelper>> filesConc = [];
            bool starNoFolders = session.User.Settings.StarNoFolders;
            int id = 0;
            int remaining = limit;
            void sortList(List<ImageHistoryHelper> list)
            {
                if (sortBy == ImageHistorySortMode.Name)
                {
                    list.Sort((a, b) => b.Name.CompareTo(a.Name));
                }
                else if (sortBy == ImageHistorySortMode.Date)
                {
                    list.Sort((a, b) => b.Metadata.FileTime.CompareTo(a.Metadata.FileTime));
                }
                if (sortReverse)
                {
                    list.Reverse();
                }
            }
            Parallel.ForEach(dirs.Append(""), new ParallelOptions() { MaxDegreeOfParallelism = 5, CancellationToken = Program.GlobalProgramCancel }, folder =>
            {
                int localId = Interlocked.Increment(ref id);
                int localLimit = Interlocked.CompareExchange(ref remaining, 0, 0);
                if (localLimit <= 0)
                {
                    return;
                }
                string prefix = folder == "" ? "" : folder + "/";
                string actualPath = $"{path}/{prefix}";
                actualPath = UserImageHistoryHelper.GetRealPathFor(session.User, actualPath, root: root);
                if (!Directory.Exists(actualPath))
                {
                    return;
                }
                List<string> subFiles = [.. Directory.EnumerateFiles(actualPath).Take(localLimit)];
                IEnumerable<string> newFileNames = subFiles.Select(f => f.Replace('\\', '/')).Where(isAllowed).Where(f => !f.AfterLast('/').StartsWithFast('.') && extensions.Contains(f.AfterLast('.')) && !f.EndsWith(".swarmpreview.jpg") && !f.EndsWith(".swarmpreview.webp"));
                List<ImageHistoryHelper> localFiles = [.. newFileNames.Select(f => new ImageHistoryHelper(prefix + f.AfterLast('/'), OutputMetadataTracker.GetMetadataFor(f, root, starNoFolders))).Where(f => f.Metadata is not null)];
                int leftOver = Interlocked.Add(ref remaining, -localFiles.Count);
                sortList(localFiles);
                filesConc.TryAdd(localId, localFiles);
                if (leftOver <= 0)
                {
                    return;
                }
            });
            List<ImageHistoryHelper> files = [.. filesConc.Values.SelectMany(f => f).Take(limit)];
            HashSet<string> included = [.. files.Select(f => f.Name)];
            for (int i = 0; i < files.Count; i++)
            {
                if (!files[i].Name.StartsWith("Starred/"))
                {
                    string starPath = $"Starred/{(session.User.Settings.StarNoFolders ? files[i].Name.Replace("/", "") : files[i].Name)}";
                    if (included.Contains(starPath))
                    {
                        files[i] = files[i] with { Name = null };
                    }
                }
            }
            files = [.. files.Where(f => f.Name is not null)];
            sortList(files);
            long timeEnd = Environment.TickCount64;
            Logs.Verbose($"Listed {files.Count} images in {(timeEnd - timeStart) / 1000.0:0.###} seconds.");
            return new JObject()
            {
                ["folders"] = JToken.FromObject(dirs.Union(finalDirs.Keys).ToList()),
                ["files"] = JToken.FromObject(files.Take(maxInHistory).Select(f => new JObject() { ["src"] = f.Name, ["metadata"] = f.Metadata.Metadata }).ToList())
            };
        }
        catch (Exception ex)
        {
            if (ex is FileNotFoundException || ex is DirectoryNotFoundException || ex is PathTooLongException)
            {
                return new JObject() { ["error"] = "404, path not found." };
            }
            else
            {
                Logs.Error($"Error reading file list: {ex.ReadableString()}");
                return new JObject() { ["error"] = "Error reading file list." };
            }
        }
    }

    public record struct ImageHistoryHelper(string Name, OutputMetadataTracker.OutputMetadataEntry Metadata);

    [API.APIDescription("Gets a list of images in a saved image history folder.",
        """
            "folders": ["Folder1", "Folder2"],
            "files":
            [
                {
                    "src": "path/to/image.jpg",
                    "metadata": "some-metadata" // usually a JSON blob encoded as a string. Not guaranteed.
                }
            ]
        """)]
    public static async Task<JObject> ListImages(Session session,
        [API.APIParameter("The folder path to start the listing in. Use an empty string for root.")] string path,
        [API.APIParameter("Maximum depth (number of recursive folders) to search.")] string depth = null,
        [API.APIParameter("What to sort the list by - `Name` or `Date`.")] string sortBy = "Name",
        [API.APIParameter("If true, the sorting should be done in reverse.")] bool sortReverse = false)
    {
        if (!Enum.TryParse(sortBy, true, out ImageHistorySortMode sortMode))
        {
            return new JObject() { ["error"] = $"Invalid sort mode '{sortBy}'." };
        }
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, session.User.OutputDirectory);
        return GetListAPIInternal(session, path, root, HistoryExtensions, f => true, ParseHistoryDepth(depth, 0), sortMode, sortReverse);
    }

    [API.APIDescription("Gets a paginated list of images in saved image history with media metadata and filters.",
        """
            "folders": ["Folder1", "Folder2"],
            "files":
            [
                {
                    "src": "path/to/image.jpg",
                    "canonical_src": "path/to/image.jpg",
                    "preview_src": "/View/local/path/to/image.jpg?preview=true",
                    "media_type": "Image",
                    "starred": false,
                    "created_at": 1736123456,
                    "prompt_preview": "a photo of a cat",
                    "model": "example/model",
                    "width": 1024,
                    "height": 1024,
                    "seed": 12345,
                    "metadata": "{ ... }"
                }
            ],
            "next_cursor": "200",
            "has_more": true,
            "truncated": false,
            "total_count": 4512
        """)]
    public static async Task<JObject> ListImagesV2(Session session,
        [API.APIParameter("The folder path to start the listing in. Use an empty string for root.")] string path = "",
        [API.APIParameter("If true, search recursively from the path. If false, only inspect the current folder.")] bool recursive = true,
        [API.APIParameter("Maximum recursive depth relative to the current path. Use a large number for full depth.")] string depth = null,
        [API.APIParameter("Optional free-text query across path, metadata, prompt, model, seed, and resolution.")] string query = null,
        [API.APIParameter("What to sort the list by - `Name` or `Date`.")] string sortBy = "Date",
        [API.APIParameter("If true, reverse the selected sort order.")] bool sortReverse = false,
        [API.APIParameter("If true, only return starred images.")] bool starredOnly = false,
        [API.APIParameter("Optional media type filter - `All`, `Image`, `Video`, `Audio`, or `Html`.")] string mediaType = "All",
        [API.APIParameter("Opaque pagination cursor. Current implementation expects a numeric offset string.")] string cursor = null,
        [API.APIParameter("Maximum page size. Clamped to 200.")] int limit = 200)
    {
        if (!Enum.TryParse(sortBy, true, out ImageHistorySortMode sortMode))
        {
            return new JObject() { ["error"] = $"Invalid sort mode '{sortBy}'." };
        }
        if (!TryParseHistoryMediaMode(mediaType, out ImageHistoryMediaMode mediaMode))
        {
            return new JObject() { ["error"] = $"Invalid media type '{mediaType}'." };
        }
        if (!int.TryParse(cursor, out int offset))
        {
            offset = 0;
        }
        offset = Math.Max(offset, 0);
        limit = Math.Clamp(limit, 1, 200);
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, session.User.OutputDirectory);
        HistoryQueryResult result = QueryHistoryItems(session, root, path, recursive, ParseHistoryDepth(depth, int.MaxValue), query, sortMode, sortReverse, starredOnly, mediaMode);
        if (result.Error is not null)
        {
            return new JObject() { ["error"] = result.Error };
        }
        int totalCount = result.Items.Count;
        List<HistoryResolvedItem> pageItems = [.. result.Items.Skip(offset).Take(limit)];
        string nextCursor = offset + pageItems.Count < totalCount ? $"{offset + pageItems.Count}" : null;
        return new JObject()
        {
            ["folders"] = JArray.FromObject(result.Folders),
            ["files"] = JArray.FromObject(pageItems.Select(item => new
            {
                src = item.RelativePath,
                canonical_src = item.CanonicalPath,
                preview_src = item.PreviewPath,
                media_type = item.MediaType.ToString().ToLowerInvariant(),
                starred = item.Starred,
                created_at = item.CreatedAt,
                prompt_preview = item.PromptPreview,
                model = item.Model,
                width = item.Width,
                height = item.Height,
                seed = item.Seed,
                metadata = item.Metadata
            })),
            ["next_cursor"] = nextCursor,
            ["has_more"] = nextCursor is not null,
            ["truncated"] = false,
            ["total_count"] = totalCount
        };
    }

    [API.APIDescription("Open an image folder in the file explorer. Used for local users directly.", "\"success\": true")]
    public static async Task<JObject> OpenImageFolder(Session session,
        [API.APIParameter("The path to the image to show in the image folder.")] string path)
    {
        string origPath = path;
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, session.User.OutputDirectory);
        (path, string consoleError, string userError) = WebServer.CheckFilePath(root, path);
        if (consoleError is not null)
        {
            Logs.Error(consoleError);
            return new JObject() { ["error"] = userError };
        }
        path = UserImageHistoryHelper.GetRealPathFor(session.User, path, root: root);
        if (!File.Exists(path))
        {
            Logs.Warning($"User {session.User.UserID} tried to open image path '{origPath}' which maps to '{path}', but cannot as the image does not exist.");
            return new JObject() { ["error"] = "That file does not exist, cannot open." };
        }
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            Process.Start("explorer.exe", $"/select,\"{Path.GetFullPath(path)}\"");
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            Process.Start("xdg-open", $"\"{Path.GetDirectoryName(Path.GetFullPath(path))}\"");
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            Process.Start("open", $"-R \"{Path.GetFullPath(path)}\"");
        }
        else
        {
            Logs.Warning("Cannot open image path on unrecognized OS type.");
            return new JObject() { ["error"] = "Cannot open image folder on this OS." };
        }
        return new JObject() { ["success"] = true };
    }

    public static string[] DeletableFileExtensions = [".txt", ".metadata.js", ".swarm.json", ".swarmpreview.jpg", ".swarmpreview.webp"];

    [API.APIDescription("Create a folder in image history.", "\"success\": true")]
    public static async Task<JObject> CreateHistoryFolder(Session session,
        [API.APIParameter("The history-relative folder path to create.")] string path)
    {
        string cleanPath = NormalizeHistoryPath(path);
        if (string.IsNullOrWhiteSpace(cleanPath))
        {
            return new JObject() { ["error"] = "Folder path cannot be empty." };
        }
        if (IsReservedHistoryPath(cleanPath))
        {
            return new JObject() { ["error"] = "That folder path is reserved and cannot be created here." };
        }
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, session.User.OutputDirectory);
        (string actualPath, string consoleError, string userError) = WebServer.CheckFilePath(root, cleanPath);
        if (consoleError is not null)
        {
            Logs.Error(consoleError);
            return new JObject() { ["error"] = userError };
        }
        Directory.CreateDirectory(actualPath);
        return new JObject() { ["success"] = true, ["path"] = cleanPath };
    }

    [API.APIDescription("Rename or move a folder in image history.", "\"success\": true")]
    public static async Task<JObject> RenameHistoryFolder(Session session,
        [API.APIParameter("The existing history-relative folder path.")] string path,
        [API.APIParameter("The new history-relative folder path.")] string newPath)
    {
        string cleanPath = NormalizeHistoryPath(path);
        string cleanNewPath = NormalizeHistoryPath(newPath);
        if (string.IsNullOrWhiteSpace(cleanPath) || string.IsNullOrWhiteSpace(cleanNewPath))
        {
            return new JObject() { ["error"] = "Folder paths cannot be empty." };
        }
        if (IsReservedHistoryPath(cleanPath) || IsReservedHistoryPath(cleanNewPath))
        {
            return new JObject() { ["error"] = "Reserved history folders cannot be renamed or targeted here." };
        }
        if (cleanPath.Equals(cleanNewPath, StringComparison.OrdinalIgnoreCase))
        {
            return new JObject() { ["success"] = true, ["path"] = cleanNewPath };
        }
        if (cleanNewPath.StartsWith($"{cleanPath}/", StringComparison.OrdinalIgnoreCase))
        {
            return new JObject() { ["error"] = "Cannot move a folder into itself." };
        }
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, session.User.OutputDirectory);
        if (!TryResolveHistoryPath(session, root, cleanPath, out string actualPath, out string userError))
        {
            return new JObject() { ["error"] = userError };
        }
        if (!TryResolveHistoryPath(session, root, cleanNewPath, out string actualNewPath, out userError))
        {
            return new JObject() { ["error"] = userError };
        }
        if (!Directory.Exists(actualPath))
        {
            return new JObject() { ["error"] = "That source folder does not exist." };
        }
        if (Directory.Exists(actualNewPath) || File.Exists(actualNewPath))
        {
            return new JObject() { ["error"] = "That target folder already exists." };
        }
        string[] priorFiles = [.. EnumerateHistoryMediaFiles(actualPath)];
        Directory.CreateDirectory(Path.GetDirectoryName(actualNewPath));
        Directory.Move(actualPath, actualNewPath);
        foreach (string priorFile in priorFiles)
        {
            string relative = Path.GetRelativePath(actualPath, priorFile).Replace('\\', '/');
            OutputMetadataTracker.RemoveMetadataFor(priorFile.Replace('\\', '/'));
            OutputMetadataTracker.RemoveMetadataFor($"{actualNewPath.Replace('\\', '/')}/{relative}");
        }
        return new JObject() { ["success"] = true, ["path"] = cleanNewPath };
    }

    [API.APIDescription("Move a saved history image into another history folder.", "\"success\": true")]
    public static async Task<JObject> MoveHistoryImage(Session session,
        [API.APIParameter("The history-relative image path to move.")] string path,
        [API.APIParameter("The history-relative destination folder path.")] string targetFolder)
    {
        string cleanPath = NormalizeHistoryPath(path);
        string cleanTargetFolder = NormalizeHistoryPath(targetFolder);
        if (string.IsNullOrWhiteSpace(cleanPath) || string.IsNullOrWhiteSpace(cleanTargetFolder))
        {
            return new JObject() { ["error"] = "Image path and target folder are both required." };
        }
        if (IsReservedHistoryPath(cleanPath) || IsReservedHistoryPath(cleanTargetFolder))
        {
            return new JObject() { ["error"] = "Reserved history folders cannot be used for this move." };
        }
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, session.User.OutputDirectory);
        if (!TryResolveHistoryPath(session, root, cleanPath, out string actualPath, out string userError))
        {
            return new JObject() { ["error"] = userError };
        }
        if (!File.Exists(actualPath))
        {
            return new JObject() { ["error"] = "That image no longer exists." };
        }
        string targetPath = $"{cleanTargetFolder}/{GetHistoryFileName(cleanPath)}";
        if (!TryResolveHistoryPath(session, root, targetPath, out string actualTargetPath, out userError))
        {
            return new JObject() { ["error"] = userError };
        }
        if (cleanPath.Equals(targetPath, StringComparison.OrdinalIgnoreCase))
        {
            return new JObject() { ["success"] = true, ["path"] = targetPath, ["url"] = BuildHistoryViewPath(targetPath) };
        }
        if (File.Exists(actualTargetPath))
        {
            return new JObject() { ["error"] = "A file with that name already exists in the target folder." };
        }
        try
        {
            MoveHistorySidecars(actualPath, actualTargetPath);
        }
        catch (SwarmReadableErrorException ex)
        {
            return new JObject() { ["error"] = ex.Message };
        }
        return new JObject() { ["success"] = true, ["path"] = targetPath, ["url"] = BuildHistoryViewPath(targetPath) };
    }

    [API.APIDescription("Delete an image from history.", "\"success\": true")]
    public static async Task<JObject> DeleteImage(Session session,
        [API.APIParameter("The path to the image to delete.")] string path)
    {
        string origPath = path;
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, session.User.OutputDirectory);
        (path, string consoleError, string userError) = WebServer.CheckFilePath(root, path);
        if (consoleError is not null)
        {
            Logs.Error(consoleError);
            return new JObject() { ["error"] = userError };
        }
        path = UserImageHistoryHelper.GetRealPathFor(session.User, path, root: root);
        if (!File.Exists(path))
        {
            Logs.Warning($"User {session.User.UserID} tried to delete image path '{origPath}' which maps to '{path}', but cannot as the image does not exist.");
            return new JObject() { ["error"] = "That file does not exist, cannot delete." };
        }
        string standardizedPath = Path.GetFullPath(path);
        Session.RecentlyBlockedFilenames[standardizedPath] = standardizedPath;
        Action<string> deleteFile = Program.ServerSettings.Paths.RecycleDeletedImages ? Utilities.SendFileToRecycle : File.Delete;
        deleteFile(path);
        string fileBase = path.BeforeLast('.');
        foreach (string str in DeletableFileExtensions)
        {
            string altFile = $"{fileBase}{str}";
            if (File.Exists(altFile))
            {
                deleteFile(altFile);
            }
        }
        OutputMetadataTracker.RemoveMetadataFor(path);
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Creates a zip export of selected history files or the current history query and returns a download URL.",
        """
            "success": true,
            "filename": "history-export-20260306-123456.zip",
            "url": "/HistoryExport/history-export-20260306-123456.zip",
            "count": 42
        """)]
    public static async Task<JObject> ExportHistoryZip(Session session,
        [API.APIParameter("Optional explicit list of history-relative paths to export. If omitted, the current query filter is exported.")] string[] paths = null,
        [API.APIParameter("The folder path to start the listing in. Use an empty string for root.")] string path = "",
        [API.APIParameter("If true, search recursively from the path. If false, only inspect the current folder.")] bool recursive = true,
        [API.APIParameter("Maximum recursive depth relative to the current path. Use a large number for full depth.")] string depth = null,
        [API.APIParameter("Optional free-text query across path, metadata, prompt, model, seed, and resolution.")] string query = null,
        [API.APIParameter("What to sort the list by - `Name` or `Date`.")] string sortBy = "Date",
        [API.APIParameter("If true, reverse the selected sort order.")] bool sortReverse = false,
        [API.APIParameter("If true, only return starred images.")] bool starredOnly = false,
        [API.APIParameter("Optional media type filter - `All`, `Image`, `Video`, `Audio`, or `Html`.")] string mediaType = "All")
    {
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, session.User.OutputDirectory);
        List<HistoryResolvedItem> itemsToExport = [];
        if (paths is not null && paths.Length > 0)
        {
            bool starNoFolders = session.User.Settings.StarNoFolders;
            HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
            foreach (string rawItemPath in paths)
            {
                if (string.IsNullOrWhiteSpace(rawItemPath))
                {
                    continue;
                }
                string cleanPath = NormalizeHistoryPath(rawItemPath);
                if (!seen.Add(cleanPath))
                {
                    continue;
                }
                if (!TryResolveHistoryPath(session, root, cleanPath, out string actualPath, out string userError))
                {
                    return new JObject() { ["error"] = userError };
                }
                if (!File.Exists(actualPath))
                {
                    continue;
                }
                HistoryResolvedItem item = BuildHistoryResolvedItem(cleanPath, actualPath, root, starNoFolders);
                if (item is not null)
                {
                    itemsToExport.Add(item);
                }
            }
        }
        else
        {
            if (!Enum.TryParse(sortBy, true, out ImageHistorySortMode sortMode))
            {
                return new JObject() { ["error"] = $"Invalid sort mode '{sortBy}'." };
            }
            if (!TryParseHistoryMediaMode(mediaType, out ImageHistoryMediaMode mediaMode))
            {
                return new JObject() { ["error"] = $"Invalid media type '{mediaType}'." };
            }
            HistoryQueryResult result = QueryHistoryItems(session, root, path, recursive, ParseHistoryDepth(depth, int.MaxValue), query, sortMode, sortReverse, starredOnly, mediaMode);
            if (result.Error is not null)
            {
                return new JObject() { ["error"] = result.Error };
            }
            itemsToExport = result.Items;
        }
        if (itemsToExport.Count == 0)
        {
            return new JObject() { ["error"] = "No history items matched the export request." };
        }
        string exportRoot = Utilities.CombinePathWithAbsolute(
            Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, Program.DataDir, "HistoryExports"),
            session.User.UserID);
        Directory.CreateDirectory(exportRoot);
        long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        foreach (string oldZip in Directory.EnumerateFiles(exportRoot, "*.zip"))
        {
            try
            {
                long oldTime = ((DateTimeOffset)File.GetLastWriteTimeUtc(oldZip)).ToUnixTimeSeconds();
                if (now - oldTime > 60 * 60 * 6)
                {
                    File.Delete(oldZip);
                }
            }
            catch (Exception) { }
        }
        string fileName = $"history-export-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Random.Shared.Next(1000, 9999)}.zip";
        string zipPath = Path.Combine(exportRoot, fileName);
        using (FileStream zipFile = File.Create(zipPath))
        using (ZipArchive archive = new(zipFile, ZipArchiveMode.Create))
        {
            foreach (HistoryResolvedItem item in itemsToExport)
            {
                if (!File.Exists(item.ActualPath))
                {
                    continue;
                }
                string entryName = NormalizeHistoryPath(item.RelativePath);
                if (string.IsNullOrWhiteSpace(entryName))
                {
                    entryName = Path.GetFileName(item.ActualPath);
                }
                archive.CreateEntryFromFile(item.ActualPath, entryName, CompressionLevel.Fastest);
            }
        }
        return new JObject()
        {
            ["success"] = true,
            ["filename"] = fileName,
            ["url"] = $"/HistoryExport/{fileName}",
            ["count"] = itemsToExport.Count
        };
    }

    [API.APIDescription("Toggle whether an image is starred or not.", "\"new_state\": true")]
    public static async Task<JObject> ToggleImageStarred(Session session,
        [API.APIParameter("The path to the image to star.")] string path)
    {
        bool wasStar = false;
        path = path.Replace('\\', '/').Trim('/');
        if (path.StartsWith("Starred/"))
        {
            wasStar = true;
            path = path["Starred/".Length..];
        }
        string origPath = path;
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, session.User.OutputDirectory);
        (path, string consoleError, string userError) = WebServer.CheckFilePath(root, path);
        if (consoleError is not null)
        {
            Logs.Error(consoleError);
            return new JObject() { ["error"] = userError };
        }
        path = UserImageHistoryHelper.GetRealPathFor(session.User, path, root: root);
        string pathBeforeDot = path.BeforeLast('.');
        string starPath = $"Starred/{(session.User.Settings.StarNoFolders ? origPath.Replace("/", "") : origPath)}";
        (starPath, _, _) = WebServer.CheckFilePath(root, starPath);
        starPath = UserImageHistoryHelper.GetRealPathFor(session.User, starPath, root: root);
        string starBeforeDot = starPath.BeforeLast('.');
        if (!File.Exists(path))
        {
            if (wasStar && File.Exists(starPath))
            {
                Logs.Debug($"User {session.User.UserID} un-starred '{path}' without a raw, moving back to raw");
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                File.Move(starPath, path);
                foreach (string ext in DeletableFileExtensions)
                {
                    if (File.Exists($"{starBeforeDot}{ext}"))
                    {
                        File.Move($"{starBeforeDot}{ext}", $"{pathBeforeDot}{ext}");
                    }
                }
                OutputMetadataTracker.RemoveMetadataFor(path);
                OutputMetadataTracker.RemoveMetadataFor(starPath);
                return new JObject() { ["new_state"] = false };
            }
            Logs.Warning($"User {session.User.UserID} tried to star image path '{origPath}' which maps to '{path}', but cannot as the image does not exist.");
            return new JObject() { ["error"] = "That file does not exist, cannot star." };
        }
        if (File.Exists(starPath))
        {
            Logs.Debug($"User {session.User.UserID} un-starred '{path}'");
            File.Delete(starPath);
            foreach (string ext in DeletableFileExtensions)
            {
                if (File.Exists($"{starBeforeDot}{ext}"))
                {
                    File.Delete($"{starBeforeDot}{ext}");
                }
            }
            OutputMetadataTracker.RemoveMetadataFor(path);
            OutputMetadataTracker.RemoveMetadataFor(starPath);
            return new JObject() { ["new_state"] = false };
        }
        else
        {
            Logs.Debug($"User {session.User.UserID} starred '{path}'");
            Directory.CreateDirectory(Path.GetDirectoryName(starPath));
            File.Copy(path, starPath);
            foreach (string ext in DeletableFileExtensions)
            {
                if (File.Exists($"{pathBeforeDot}{ext}"))
                {
                    File.Copy($"{pathBeforeDot}{ext}", $"{starBeforeDot}{ext}");
                }
            }
            OutputMetadataTracker.RemoveMetadataFor(path);
            OutputMetadataTracker.RemoveMetadataFor(starPath);
            return new JObject() { ["new_state"] = true };
        }
    }

    public static SemaphoreSlim RefreshSemaphore = new(1, 1);

    public static long LastRefreshed = Environment.TickCount64;

    [API.APIDescription("Trigger a refresh of the server's data, returning parameter data. Requires permission 'control_model_refresh' to actually take effect, otherwise just pulls latest data.",
        """
            // see `ListT2IParams` for details
            "list": [...],
            "groups": [...],
            "models": [...],
            "wildcards": [...],
            "param_edits": [...]
        """)]
    public static async Task<JObject> TriggerRefresh(Session session,
        [API.APIParameter("If true, fully refresh everything. If false, just grabs the list of current available parameters (waiting for any pending refreshes first).")] bool strong = true,
        [API.APIParameter("Optional type of data to refresh. If unspecified, runs a general refresh. Valid options: ['wildcards']")] string refreshType = null)
    {
        Logs.Verbose($"User {session.User.UserID} triggered a {(strong ? "strong" : "weak")} data refresh");
        bool botherToRun = strong && RefreshSemaphore.CurrentCount > 0; // no need to run twice at once
        if (botherToRun && Environment.TickCount64 - LastRefreshed < 10000)
        {
            Logs.Debug($"User {session.User.UserID} requested weak refresh within 10 seconds of last refresh, ignoring as redundant.");
            botherToRun = false;
        }
        if (!session.User.HasPermission(Permissions.ControlModelRefresh))
        {
            Logs.Debug($"User {session.User.UserID} requested refresh, but will not perform actual refresh as they lack permission.");
            botherToRun = false;
        }
        try
        {
            await RefreshSemaphore.WaitAsync(Program.GlobalProgramCancel);
            if (botherToRun)
            {
                using ManyReadOneWriteLock.WriteClaim claim = Program.RefreshLock.LockWrite();
                if (string.IsNullOrWhiteSpace(refreshType))
                {
                    Program.ModelRefreshEvent?.Invoke();
                    LastRefreshed = Environment.TickCount64;
                }
                else if (refreshType == "wildcards")
                {
                    WildcardsHelper.Refresh();
                }
                else
                {
                    Logs.Warning($"User {session.User.UserID} requested refresh type '{refreshType}' which is unrecognized, ignoring.");
                }
            }
        }
        finally
        {
            RefreshSemaphore.Release();
        }
        Logs.Debug($"Data refreshed!");
        return await ListT2IParams(session);
    }

    [API.APIDescription("Get a list of available T2I parameters.",
        """
        "list":
        [
            {
                "name": "Param Name Here",
                "id": "paramidhere",
                "description": "parameter description here",
                "type": "type", // text, integer, etc
                "subtype": "Stable-Diffusion", // can be null
                "default": "default value here",
                "min": 0,
                "max": 10,
                "view_max": 10,
                "step": 1,
                "values": ["value1", "value2"], // or null
                "examples": ["example1", "example2"], // or null
                "visible": true,
                "advanced": false,
                "feature_flag": "flagname", // or null
                "toggleable": true,
                "priority": 0,
                "group": "idhere", // or null
                "always_retain": false,
                "do_not_save": false,
                "do_not_preview": false,
                "view_type": "big", // dependent on type
                "extra_hidden": false
            }
        ],
        "groups":
        [
            {
                "name": "Group Name Here",
                "id": "groupidhere",
                "toggles": true,
                "open": false,
                "priority": 0,
                "description": "group description here",
                "advanced": false,
                "can_shrink": true,
                "parent": "idhere" // or null
            }
        ],
        "model_compat_classes":
        {
            "stable-diffusion-xl-v1": {"shortcode": "SDXL", ... },
            // etc
        },
        "model_classes":
        {
            "stable-diffusion-xl-v1-base": {"compat_class": "stable-diffusion-xl-v1", ... },
            // etc
        }
        "models":
        {
            "Stable-Diffusion": [["model1", "archid"], ["model2", "archid"]],
            "LoRA": [["model1", "archid"], ["model2", "archid"]],
            // etc
        },
        "wildcards": ["wildcard1", "wildcard2"],
        "param_edits": // can be null
        {
            // (This is interface-specific data)
        }
        """)]
    public static async Task<JObject> ListT2IParams(Session session)
    {
        JObject modelData = [];
        foreach (T2IModelHandler handler in Program.T2IModelSets.Values)
        {
            modelData[handler.ModelType] = new JArray(handler.ListModelsFor(session).OrderBy(m => m.Name).Select(m => new JArray(m.Name, m.ModelClass?.ID)).ToArray());
        }
        T2IParamType[] types = [.. T2IParamTypes.Types.Values.Where(p => p.Permission is null || session.User.HasPermission(p.Permission))];
        Dictionary<string, T2IParamGroup> groups = new(64);
        foreach (T2IParamType type in types)
        {
            T2IParamGroup group = type.Group;
            while (group is not null)
            {
                groups[group.ID] = group;
                group = group.Parent;
            }
        }
        JObject modelCompatClasses = [];
        foreach (T2IModelCompatClass clazz in T2IModelClassSorter.CompatClasses.Values)
        {
            modelCompatClasses[clazz.ID] = clazz.ToNetData();
        }
        JObject modelClasses = [];
        foreach (T2IModelClass clazz in T2IModelClassSorter.ModelClasses.Values)
        {
            modelClasses[clazz.ID] = clazz.ToNetData();
        }
        return new JObject()
        {
            ["list"] = new JArray(types.Select(v => v.ToNet(session)).ToList()),
            ["groups"] = new JArray(groups.Values.OrderBy(g => g.OrderPriority).Select(g => g.ToNet(session)).ToList()),
            ["models"] = modelData,
            ["model_compat_classes"] = modelCompatClasses,
            ["model_classes"] = modelClasses,
            ["wildcards"] = new JArray(WildcardsHelper.ListFiles),
            ["param_edits"] = string.IsNullOrWhiteSpace(session.User.Data.RawParamEdits) ? null : JObject.Parse(session.User.Data.RawParamEdits)
        };
    }
}
