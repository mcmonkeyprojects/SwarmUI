﻿using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.Data;
using System.Diagnostics;
using System.IO;
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
    public static void Register()
    {
        // TODO: Some of these shouldn't be here?
        API.RegisterAPICall(GenerateText2Image, true, Permissions.BasicImageGeneration);
        API.RegisterAPICall(GenerateText2ImageWS, true, Permissions.BasicImageGeneration);
        API.RegisterAPICall(AddImageToHistory, true, Permissions.BasicImageGeneration);
        API.RegisterAPICall(ListImages, false, Permissions.ViewImageHistory);
        API.RegisterAPICall(ToggleImageStarred, true, Permissions.UserStarImages);
        API.RegisterAPICall(OpenImageFolder, true, Permissions.LocalImageFolder);
        API.RegisterAPICall(DeleteImage, true, Permissions.UserDeleteImage);
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
        using CancellationTokenSource cancelTok = new();
        bool retain = false, ended = false;
        using CancellationTokenSource linked = CancellationTokenSource.CreateLinkedTokenSource(Program.GlobalProgramCancel, cancelTok.Token);
        SharedGenT2IData data = new();
        ConcurrentDictionary<Task, Task> tasks = [];
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
                    byte[] rec = await socket.ReceiveData(1024 * 1024 * 256, linked.Token);
                    Volatile.Write(ref retain, true);
                    if (socket.State != WebSocketState.Open || cancelTok.IsCancellationRequested || Volatile.Read(ref ended))
                    {
                        return;
                    }
                    JObject newInput = StringConversionHelper.UTF8Encoding.GetString(rec).ParseToJson();
                    int newImages = newInput.Value<int>("images");
                    Task handleMore = API.RunWebsocketHandlerCallWS(GenT2I_Internal, session, (newImages, newInput, data, batchOffset), socket);
                    tasks.TryAdd(handleMore, handleMore);
                    Volatile.Write(ref retain, false);
                    batchOffset += newImages * guessBatchSize(newInput);
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
        if (discards != null)
        {
            foreach (int x in discards)
            {
                imageOutputs.Remove(x);
            }
        }
        return new JObject() { ["images"] = new JArray(imageOutputs.Values.ToArray()) };
    }

    public static HashSet<string> AlwaysTopKeys = [];

    /// <summary>Helper util to take a user-supplied JSON object of parameter data and turn it into a valid T2I request object.</summary>
    public static T2IParamInput RequestToParams(Session session, JObject rawInput)
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
                T2IParamTypes.ApplyParameter(key, rawInput[key].ToString(), user_input);
            }
            else
            {
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
                presetObj.ApplyTo(user_input);
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
        void setError(string message)
        {
            Logs.Debug($"Refused to generate image for {session.User.UserID}: {message}");
            output(new JObject() { ["error"] = message });
            claim.LocalClaimInterrupt.Cancel();
        }
        long timeStart = Environment.TickCount64;
        T2IParamInput user_input;
        try
        {
            user_input = RequestToParams(session, rawInput);
        }
        catch (SwarmReadableErrorException ex)
        {
            setError(ex.Message);
            return;
        }
        user_input.ApplySpecialLogic();
        images = user_input.Get(T2IParamTypes.Images, images);
        Logs.Info($"User {session.User.UserID} requested {images} image{(images == 1 ? "" : "s")} with model '{user_input.Get(T2IParamTypes.Model)?.Name}'...");
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
            bool noSave = thisParams.Get(T2IParamTypes.DoNotSave, false);
            if (!image.IsReal && thisParams.Get(T2IParamTypes.DoNotSaveIntermediates, false))
            {
                noSave = true;
            }
            (string url, string filePath) = noSave ? (session.GetImageB64(image.Img), null) : session.SaveImage(image, actualIndex, thisParams, metadata);
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
            WebhookManager.SendEveryGenWebhook(thisParams, url, image.Img);
            output(new JObject() { ["image"] = url, ["batch_index"] = $"{actualIndex}", ["metadata"] = string.IsNullOrWhiteSpace(metadata) ? null : metadata });
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
            tasks.Add(Task.Run(() => T2IEngine.CreateImageTask(thisParams, $"{imageIndex}", claim, output, setError, isWS, Program.ServerSettings.Backends.PerRequestTimeoutMinutes,
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
        if (griddables.Length < session.User.Settings.MaxImagesInMiniGrid && griddables.Length > 1 && griddables.All(i => i.Img.Type == Image.ImageType.IMAGE))
        {
            ISImage[] imgs = [.. griddables.Select(i => i.Img.ToIS)];
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
            user_input.ExtraMeta["generation_time"] = $"{genTime / 1000.0:0.00} total seconds (average {(finalTime - timeStart) / griddables.Length / 1000.0:0.00} seconds per image)";
            (Task<Image> gridImageTask, string metadata) = user_input.SourceSession.ApplyMetadata(gridImg, user_input, imgs.Length);
            T2IEngine.ImageOutput gridOutput = new() { Img = gridImg, ActualImageTask = gridImageTask, GenTimeMS = genTime };
            saveImage(gridOutput, -1, user_input, metadata);
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
        Image img = Image.FromDataString(image);
        T2IParamInput user_input;
        rawInput.Remove("image");
        try
        {
            user_input = RequestToParams(session, rawInput);
        }
        catch (SwarmReadableErrorException ex)
        {
            return new() { ["error"] = ex.Message };
        }
        user_input.ApplySpecialLogic();
        Logs.Info($"User {session.User.UserID} stored an image to history.");
        (Task<Image> imgTask, string metadata) = user_input.SourceSession.ApplyMetadata(img, user_input, 1);
        T2IEngine.ImageOutput outputImage = new() { Img = img, ActualImageTask = imgTask };
        (string path, _) = session.SaveImage(outputImage, 0, user_input, metadata);
        return new() { ["images"] = new JArray() { new JObject() { ["image"] = path, ["batch_index"] = "0", ["metadata"] = metadata } } };
    }

    public static HashSet<string> ImageExtensions = ["png", "jpg", "html", "gif", "webm", "mp4", "webp", "mov"];

    public enum ImageHistorySortMode { Name, Date }

    private static JObject GetListAPIInternal(Session session, string path, string root, HashSet<string> extensions, Func<string, bool> isAllowed, int depth, ImageHistorySortMode sortBy, bool sortReverse)
    {
        int maxInHistory = session.User.Settings.MaxImagesInHistory;
        int maxScanned = session.User.Settings.MaxImagesScannedInHistory;
        Logs.Verbose($"User {session.User.UserID} wants to list images in '{path}', maxDepth={depth}, sortBy={sortBy}, reverse={sortReverse}, maxInHistory={maxInHistory}, maxScanned={maxScanned}");
        long timeStart = Environment.TickCount64;
        int limit = sortBy == ImageHistorySortMode.Name ? maxInHistory : Math.Max(maxInHistory, maxScanned);
        (path, string consoleError, string userError) = WebServer.CheckFilePath(root, path);
        if (consoleError is not null)
        {
            Logs.Error(consoleError);
            return new JObject() { ["error"] = userError };
        }
        try
        {
            if (!Directory.Exists(path))
            {
                return new JObject()
                {
                    ["folders"] = new JArray(),
                    ["files"] = new JArray()
                };
            }
            ConcurrentDictionary<string, string> dirsConc = [];
            ConcurrentDictionary<string, string> finalDirs = [];
            ConcurrentDictionary<string, Task> tasks = [];
            void addDirs(string dir, int subDepth)
            {
                tasks.TryAdd(dir, Utilities.RunCheckedTask(() =>
                {
                    if (dir != "")
                    {
                        (subDepth == 0 ? finalDirs : dirsConc).TryAdd(dir, dir);
                    }
                    if (subDepth > 0)
                    {
                        IEnumerable<string> subDirs = Directory.EnumerateDirectories($"{path}/{dir}").Select(Path.GetFileName).OrderDescending();
                        foreach (string subDir in subDirs)
                        {
                            string subPath = dir == "" ? subDir : $"{dir}/{subDir}";
                            if (isAllowed(subPath))
                            {
                                addDirs(subPath, subDepth - 1);
                            }
                        }
                    }
                }));
            }
            addDirs("", depth);
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
                List<string> subFiles = [.. Directory.EnumerateFiles($"{path}/{prefix}").Take(localLimit)];
                IEnumerable<string> newFileNames = subFiles.Where(isAllowed).Where(f => extensions.Contains(f.AfterLast('.')) && !f.EndsWith(".swarmpreview.jpg") && !f.EndsWith(".swarmpreview.webp")).Select(f => f.Replace('\\', '/'));
                List<ImageHistoryHelper> localFiles = [.. newFileNames.Select(f => new ImageHistoryHelper(prefix + f.AfterLast('/'), ImageMetadataTracker.GetMetadataFor(f, root, starNoFolders))).Where(f => f.Metadata is not null)];
                int leftOver = Interlocked.Add(ref remaining, -localFiles.Count);
                sortList(localFiles);
                filesConc.TryAdd(localId, localFiles);
                if (leftOver <= 0)
                {
                    return;
                }
            });
            List<ImageHistoryHelper> files = [.. filesConc.Values.SelectMany(f => f).Take(limit)];
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

    public record struct ImageHistoryHelper(string Name, ImageMetadataTracker.ImageMetadataEntry Metadata);

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
            Process.Start("xdg-open", $"\"{Path.GetFullPath(path)}\"");
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
        ImageMetadataTracker.RemoveMetadataFor(path);
        return new JObject() { ["success"] = true };
    }

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
        [API.APIParameter("Maximum depth (number of recursive folders) to search.")] int depth,
        [API.APIParameter("What to sort the list by - `Name` or `Date`.")] string sortBy = "Name",
        [API.APIParameter("If true, the sorting should be done in reverse.")] bool sortReverse = false)
    {
        if (!Enum.TryParse(sortBy, true, out ImageHistorySortMode sortMode))
        {
            return new JObject() { ["error"] = $"Invalid sort mode '{sortBy}'." };
        }
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, session.User.OutputDirectory);
        return GetListAPIInternal(session, path, root, ImageExtensions, f => true, depth, sortMode, sortReverse);
    }

    [API.APIDescription("Toggle whether an image is starred or not.", "\"new_state\": true")]
    public static async Task<JObject> ToggleImageStarred(Session session,
        [API.APIParameter("The path to the image to star.")] string path)
    {
        path = path.Replace('\\', '/').Trim('/');
        if (path.StartsWith("Starred/"))
        {
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
        if (!File.Exists(path))
        {
            Logs.Warning($"User {session.User.UserID} tried to star image path '{origPath}' which maps to '{path}', but cannot as the image does not exist.");
            return new JObject() { ["error"] = "That file does not exist, cannot star." };
        }
        string pathBeforeDot = path.BeforeLast('.');
        string starPath = $"Starred/{(session.User.Settings.StarNoFolders ? origPath.Replace("/", "") : origPath)}";
        (starPath, _, _) = WebServer.CheckFilePath(root, starPath);
        string starBeforeDot = starPath.BeforeLast('.');
        if (File.Exists(starPath))
        {
            File.Delete(starPath);
            foreach (string ext in DeletableFileExtensions)
            {
                if (File.Exists($"{starBeforeDot}{ext}"))
                {
                    File.Delete($"{starBeforeDot}{ext}");
                }
            }
            ImageMetadataTracker.RemoveMetadataFor(path);
            ImageMetadataTracker.RemoveMetadataFor(starPath);
            return new JObject() { ["new_state"] = false };
        }
        else
        {
            Directory.CreateDirectory(Path.GetDirectoryName(starPath));
            File.Copy(path, starPath);
            foreach (string ext in DeletableFileExtensions)
            {
                if (File.Exists($"{pathBeforeDot}{ext}"))
                {
                    File.Copy($"{pathBeforeDot}{ext}", $"{starBeforeDot}{ext}");
                }
            }
            ImageMetadataTracker.RemoveMetadataFor(path);
            ImageMetadataTracker.RemoveMetadataFor(starPath);
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
        [API.APIParameter("If true, fully refresh everything. If false, just grabs the list of current available parameters (waiting for any pending refreshes first).")] bool strong = true)
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
                Program.ModelRefreshEvent?.Invoke();
                LastRefreshed = Environment.TickCount64;
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
        "models":
        {
            "Stable-Diffusion": ["model1", "model2"],
            "LoRA": ["model1", "model2"],
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
            modelData[handler.ModelType] = new JArray(handler.ListModelNamesFor(session).Order().ToArray());
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
        return new JObject()
        {
            ["list"] = new JArray(types.Select(v => v.ToNet(session)).ToList()),
            ["groups"] = new JArray(groups.Values.OrderBy(g => g.OrderPriority).Select(g => g.ToNet(session)).ToList()),
            ["models"] = modelData,
            ["wildcards"] = new JArray(WildcardsHelper.ListFiles),
            ["param_edits"] = string.IsNullOrWhiteSpace(session.User.Data.RawParamEdits) ? null : JObject.Parse(session.User.Data.RawParamEdits)
        };
    }
}
