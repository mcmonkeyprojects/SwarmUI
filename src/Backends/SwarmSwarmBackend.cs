using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.Media;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.WebSockets;

namespace SwarmUI.Backends;

/// <summary>A backend for Swarm to connect to other Swarm instances to use as the backend.</summary>
public class SwarmSwarmBackend : AbstractT2IBackend
{
    public class SwarmSwarmBackendSettings : AutoConfiguration
    {
        [ConfigComment("The network address of the other Swarm instance.\nUsually starts with 'http://' and ends with ':7801'.")]
        public string Address = "";

        [ConfigComment("Whether the backend is allowed to revert to an 'idle' state if the API address is unresponsive.\nAn idle state is not considered an error, but cannot generate.\nIt will automatically return to 'running' if the API becomes available.")]
        public bool AllowIdle = false;

        [ConfigComment("Whether remote Swarm backends should be followed through.\nIf false, only backends directly local to the remote machine are used.\nIf true, the remote backend can chain further connected backends.")]
        public bool AllowForwarding = true;

        [ConfigComment("Whether the backend is allowed to use WebSocket connections.\nIf true, the backend will work normally and provide previews and updates and all.\nIf false, the backend will freeze while generating until the generation completes.\nFalse may be needed for some limited network environments.")]
        public bool AllowWebsocket = true;

        [ConfigComment("If the remote instance has an 'Authorization:' header required, specify it here.\nFor example, 'Bearer abc123'.\nIf you don't know what this is, you don't need it.")]
        [ValueIsSecret]
        public string AuthorizationHeader = "";

        [ConfigComment("Any other headers here, newline separated, for example:\nMyHeader: MyVal\nSecondHeader: secondVal")]
        public string OtherHeaders = "";

        [ConfigComment("When attempting to connect to the backend, this is the maximum time Swarm will wait before considering the connection to be failed.\nNote that depending on other configurations, it may fail faster than this.\nFor local network machines, set this to a low value (eg 5) to avoid 'Loading...' delays.")]
        public int ConnectionAttemptTimeoutSeconds = 30;
    }

    /// <summary>Internal HTTP handler.</summary>
    public static HttpClient HttpClient = NetworkBackendUtils.MakeHttpClient();

    /// <summary>Event fired when a new swarm sub-backend is added.</summary>
    public static Action<SwarmSwarmBackend> OnSwarmBackendAdded;

    public SwarmSwarmBackendSettings Settings => SettingsRaw as SwarmSwarmBackendSettings;

    public NetworkBackendUtils.IdleMonitor Idler = new();

    /// <summary>A set of all supported features the remote Swarm instance has.</summary>
    public ConcurrentDictionary<string, string> RemoteFeatureCombo = new();

    /// <summary>A set of all backend-types the remote Swarm instance has.</summary>
    public volatile HashSet<string> RemoteBackendTypes = [];

    /// <inheritdoc/>
    public override IEnumerable<string> SupportedFeatures => RemoteFeatureCombo.Keys;

    /// <summary>Current API session ID.</summary>
    public string Session;

    /// <summary>If true, at least one remote sub-backend is still 'loading'.</summary>
    public volatile bool AnyLoading = true;

    /// <summary>The remote backend ID this specific instance is linked to (if any).</summary>
    public int LinkedRemoteBackendID;

    /// <summary>The backend-type of the remote backend.</summary>
    public string LinkedRemoteBackendType;

    /// <summary>A list of any non-real backends this instance controls.</summary>
    public ConcurrentDictionary<int, BackendHandler.T2IBackendData> ControlledNonrealBackends = new();

    /// <summary>Map of models on the remote server.</summary>
    public ConcurrentDictionary<string, Dictionary<string, JObject>> RemoteModels = null;

    /// <summary>Data about the remote backend supplied by extensions.</summary>
    public ConcurrentDictionary<string, object> ExtensionData = new();

    /// <summary>Gets the current target address.</summary>
    public string Address => Settings.Address.TrimEnd('/'); // Remove trailing slash to avoid issues.

    /// <summary>If true, an external handler controls this as a specialty non-real backend. This is a real master instance, but not on the backends list.
    /// For example, <see cref="AutoScalingBackend"/> uses this.</summary>
    public bool IsSpecialControlled = false;

    /// <summary>If true, this instance is the master referencing a single swarm instance, controlling several child backends for the remote backends.</summary>
    public bool IsAControlInstance => IsReal || IsSpecialControlled;

    /// <summary>How many times to re-try the first load if it fails.</summary>
    public int FirstLoadRetries = 0;

    /// <summary>How many seconds to wait between each re-try.</summary>
    public int FirstLoadRetryWaitSeconds = 5;

    /// <summary>Event fired when a backend is revising its remote data.</summary>
    public static Action<SwarmSwarmBackend> ReviseRemotesEvent;

    /// <summary>The parent backend, if any.</summary>
    public SwarmSwarmBackend Parent;

    /// <summary>Gets a request adapter appropriate to this Swarm backend, including eg auth headers.</summary>
    public Action<HttpRequestMessage> RequestAdapter()
    {
        return req =>
        {
            if (!string.IsNullOrWhiteSpace(Settings.AuthorizationHeader))
            {
                req.Headers.Authorization = AuthenticationHeaderValue.Parse(Settings.AuthorizationHeader);
            }
            if (!string.IsNullOrWhiteSpace(Settings.OtherHeaders))
            {
                foreach (string line in Settings.OtherHeaders.Split('\n'))
                {
                    string[] parts = line.Split(':');
                    if (parts.Length != 2)
                    {
                        Logs.Error($"Invalid header line in SwarmSwarmBackend: '{line}'");
                        continue;
                    }
                    req.Headers.Add(parts[0].Trim(), parts[1].Trim());
                }
            }
        };
    }

    public async Task ValidateAndBuild()
    {
        using CancellationTokenSource timeout = Utilities.TimedCancel(TimeSpan.FromSeconds(Settings.ConnectionAttemptTimeoutSeconds));
        JObject sessData = await HttpClient.PostJson($"{Address}/API/GetNewSession", [], RequestAdapter(), timeout.Token);
        if (!sessData.TryGetValue("session_id", out JToken sessTok))
        {
            Logs.Debug($"{HandlerTypeData.Name} {BackendData.ID} failed to get session ID from remote swarm at {Address}: yielded raw json {sessData.ToDenseDebugString(true)}");
            throw new Exception("Failed to get session ID from remote swarm. Check debug logs for details.");
        }
        Session = sessTok.ToString();
        string id = sessData["server_id"]?.ToString();
        Logs.Verbose($"{HandlerTypeData.Name} {BackendData.ID} Connected to remote Swarm instance {Address} with server ID '{id}'.");
        if (id == Utilities.LoopPreventionID.ToString())
        {
            Logs.Error($"Swarm is connecting to itself as a backend. This is a bad idea. Check the address being used: {Address}");
            throw new Exception("Swarm connected to itself, backend load failed.");
        }
        await ReviseRemoteDataList(true);
    }

    public static void AutoThrowException(JObject data)
    {
        if (data.TryGetValue("error_id", out JToken errorId) && errorId.ToString() == "invalid_session_id")
        {
            throw new SessionInvalidException();
        }
        if (data.TryGetValue("error", out JToken error))
        {
            string err = error.ToString();
            throw new SwarmReadableErrorException($"Remote swarm gave error: {err}");
        }
    }

    public Task TriggerRefresh()
    {
        if (!IsAControlInstance)
        {
            return Task.CompletedTask;
        }
        return RunWithSession(async () =>
        {
            Logs.Verbose($"Trigger refresh on remote swarm {Address}");
            await HttpClient.PostJson($"{Address}/API/TriggerRefresh", new() { ["session_id"] = Session }, RequestAdapter());
            List<Task> tasks =
            [
                ReviseRemoteDataList(true)
            ];
            foreach (BackendHandler.T2IBackendData backend in ControlledNonrealBackends.Values)
            {
                tasks.Add((backend.Backend as SwarmSwarmBackend).ReviseRemoteDataList(false));
            }
            await Task.WhenAll(tasks);
        });
    }

    public async Task ReviseRemoteDataList(bool fullLoad)
    {
        await RunWithSession(async () =>
        {
            JObject backendData = await HttpClient.PostJson($"{Address}/API/ListBackends", new() { ["session_id"] = Session, ["nonreal"] = true, ["full_data"] = true }, RequestAdapter());
            AutoThrowException(backendData);
            if (fullLoad)
            {
                Logs.Verbose($"{HandlerTypeData.Name} {BackendData.ID} Got backend data list");
            }
            if (IsAControlInstance && fullLoad)
            {
                List<Task> tasks = [];
                RemoteModels ??= [];
                foreach (string type in Program.T2IModelSets.Keys)
                {
                    string runType = type;
                    tasks.Add(Task.Run(async () =>
                    {
                        try
                        {
                            JObject modelsData = await HttpClient.PostJson($"{Address}/API/ListModels", new() { ["session_id"] = Session, ["path"] = "", ["depth"] = 999, ["subtype"] = runType, ["allowRemote"] = Settings.AllowForwarding, ["dataImages"] = true }, RequestAdapter());
                            JToken[] remoteModels = [.. modelsData["files"]];
                            if (fullLoad)
                            {
                                Logs.Verbose($"{HandlerTypeData.Name} {BackendData.ID} Got {runType} model list, {remoteModels.Length} models");
                            }
                            Dictionary<string, JObject> remoteModelsParsed = [];
                            foreach (JToken x in remoteModels)
                            {
                                JObject data = x.DeepClone() as JObject;
                                data["local"] = false;
                                remoteModelsParsed[data["name"].ToString()] = data;
                            }
                            RemoteModels[runType] = remoteModelsParsed;
                            Models[runType] = [.. remoteModelsParsed.Keys];
                        }
                        catch (Exception ex)
                        {
                            Logs.Error($"Failed to get {runType} models from remote Swarm at {Address}: {ex.ReadableString()}");
                        }
                    }));
                }
                await Task.WhenAll(tasks);
            }
            HashSet<string> features = [], types = [];
            bool isLoading = false;
            HashSet<int> ids = IsAControlInstance ? new(ControlledNonrealBackends.Keys) : null;
            if (!IsAControlInstance)
            {
                if (backendData.TryGetValue($"{LinkedRemoteBackendID}", out JToken data))
                {
                    backendData = new JObject()
                    {
                        [$"{LinkedRemoteBackendID}"] = data
                    };
                }
                else
                {
                    return;
                }
            }
            foreach (JToken backend in backendData.Values())
            {
                string status = backend["status"].ToString();
                int id = backend["id"].Value<int>();
                if (status == "running")
                {
                    features.UnionWith(backend["features"].ToArray().Select(f => f.ToString()));
                    string type = backend["type"].ToString();
                    string title = backend["title"].ToString();
                    types.Add(type);
                    if (IsAControlInstance && !ids.Remove(id) && (Settings.AllowForwarding || type != "swarmswarmbackend"))
                    {
                        Logs.Verbose($"{HandlerTypeData.Name} {BackendData.ID} adding remote backend {id} ({type}) '{title}'");
                        // TODO: support remote non-T2I Backends
                        Handler.AddNewNonrealBackend(HandlerTypeData, BackendData, SettingsRaw, (newData) =>
                        {
                            SwarmSwarmBackend newSwarm = newData.AbstractBackend as SwarmSwarmBackend;
                            newSwarm.LinkedRemoteBackendID = id;
                            newSwarm.Models = Models;
                            newSwarm.LinkedRemoteBackendType = type;
                            newSwarm.Title = $"[Remote from {BackendData.ID}: {Title}] {title}";
                            newSwarm.CanLoadModels = backend["can_load_models"].Value<bool>();
                            newSwarm.Parent = this;
                            OnSwarmBackendAdded?.Invoke(newSwarm);
                            ControlledNonrealBackends.TryAdd(id, newData as BackendHandler.T2IBackendData);
                        });
                    }
                    if (ControlledNonrealBackends.TryGetValue(id, out BackendHandler.T2IBackendData data))
                    {
                        data.Backend.MaxUsages = backend["max_usages"].Value<int>();
                        data.Backend.CurrentModelName = (string)backend["current_model"];
                    }
                }
                else if (status == "loading")
                {
                    isLoading = true;
                }
            }
            if (IsAControlInstance)
            {
                foreach (int id in ids)
                {
                    Logs.Verbose($"{HandlerTypeData.Name} {BackendData.ID} removing remote backend {id}.");
                    if (ControlledNonrealBackends.Remove(id, out BackendHandler.T2IBackendData data))
                    {
                        await Handler.DeleteById(data.ID);
                    }
                }
            }
            foreach (string str in features.Where(f => !RemoteFeatureCombo.ContainsKey(f)))
            {
                RemoteFeatureCombo.TryAdd(str, str);
            }
            foreach (string str in RemoteFeatureCombo.Keys.Where(f => !features.Contains(f)))
            {
                RemoteFeatureCombo.TryRemove(str, out _);
            }
            AnyLoading = isLoading;
            RemoteBackendTypes = types;
            ReviseRemotesEvent?.Invoke(this);
        });
    }

    public class SessionInvalidException : Exception
    {
    }

    public async Task RunWithSession(Func<Task> run)
    {
        try
        {
            await run();
        }
        catch (SessionInvalidException)
        {
            Logs.Verbose($"{HandlerTypeData.Name} {BackendData.ID} session invalid, resetting...");
            await ValidateAndBuild();
            await RunWithSession(run);
        }
    }

    /// <inheritdoc/>
    public override async Task Init()
    {
        Logs.Verbose($"{HandlerTypeData.Name} {BackendData.ID} Init, IsReal={IsReal}, IsControl={IsAControlInstance}, Address={Settings.Address}");
        if (IsAControlInstance)
        {
            CanLoadModels = false;
            Models = [];
        }
        if (string.IsNullOrWhiteSpace(Settings.Address))
        {
            Status = BackendStatus.DISABLED;
            return;
        }
        if (!IsAControlInstance)
        {
            Status = BackendStatus.LOADING;
            try
            {
                await ValidateAndBuild();
                Status = BackendStatus.RUNNING;
            }
            catch (Exception ex)
            {
                Logs.Verbose($"{HandlerTypeData.Name} {BackendData.ID} failed to load, WillIdle={Settings.AllowIdle}, Status={Status}: {ex.ReadableString()}");
                if (Status != BackendStatus.LOADING)
                {
                    return;
                }
                if (Settings.AllowIdle && !NetworkBackendUtils.IdleMonitor.ExceptionIsNonIdleable(ex))
                {
                    Status = BackendStatus.IDLE;
                }
                else
                {
                    Status = BackendStatus.ERRORED;
                    Logs.Error($"Non-real {HandlerTypeData.Name} {BackendData.ID} failed to load: {ex.ReadableString()}");
                }
            }
            return;
        }
        Idler.Stop();
        async Task PostEnable()
        {
            if (Settings.AllowIdle)
            {
                Idler.Backend = this;
                Idler.ValidateCall = () => ReviseRemoteDataList(false).Wait();
                Idler.StatusChangeEvent = status =>
                {
                    foreach (BackendHandler.T2IBackendData data in ControlledNonrealBackends.Values)
                    {
                        data.Backend.Status = status;
                    }
                };
                Idler.Start();
            }
        }
        int attempts = 0;
        while (true)
        {
            try
            {
                Status = BackendStatus.LOADING;
                await ValidateAndBuild();
                _ = Task.Run(async () =>
                {
                    try
                    {
                        while (AnyLoading)
                        {
                            Logs.Debug($"{HandlerTypeData.Name} {BackendData.ID} waiting for remote backends to load, have featureset {RemoteFeatureCombo.Keys.JoinString(", ")}");
                            if (Program.GlobalProgramCancel.IsCancellationRequested
                                || Status != BackendStatus.LOADING)
                            {
                                return;
                            }
                            await Task.Delay(TimeSpan.FromSeconds(1));
                            await ReviseRemoteDataList(true);
                        }
                        Status = BackendStatus.RUNNING;
                    }
                    catch (Exception ex)
                    {
                        if (!Settings.AllowIdle || NetworkBackendUtils.IdleMonitor.ExceptionIsNonIdleable(ex))
                        {
                            Logs.Error($"{HandlerTypeData.Name} {BackendData.ID} failed to load: {ex.ReadableString()}");
                            Status = BackendStatus.ERRORED;
                            return;
                        }
                    }
                    await PostEnable();
                });
                break;
            }
            catch (Exception)
            {
                if (attempts++ < FirstLoadRetries)
                {
                    await Task.Delay(TimeSpan.FromSeconds(FirstLoadRetryWaitSeconds));
                    continue;
                }
                if (!Settings.AllowIdle)
                {
                    throw;
                }
                await PostEnable();
                break;
            }
        }
    }

    /// <inheritdoc/>
    public override async Task Shutdown()
    {
        if (IsAControlInstance)
        {
            Logs.Info($"{HandlerTypeData.Name} {BackendData.ID} shutting down...");
            Idler.Stop();
            foreach (BackendHandler.T2IBackendData data in ControlledNonrealBackends.Values)
            {
                await Handler.DeleteById(data.ID);
            }
            ControlledNonrealBackends.Clear();
        }
        Status = BackendStatus.DISABLED;
    }

    /// <inheritdoc/>
    public override async Task<bool> LoadModel(T2IModel model, T2IParamInput input)
    {
        if (IsAControlInstance)
        {
            return false;
        }
        if (input is not null && input.Get(T2IParamTypes.NoLoadModels, false))
        {
            CurrentModelName = model.Name;
            return true;
        }
        bool success = false;
        await RunWithSession(async () =>
        {
            JObject req = new()
            {
                ["session_id"] = Session,
                ["model"] = model.Name,
                ["backendId"] = LinkedRemoteBackendID
            };
            JObject response = await HttpClient.PostJson($"{Address}/API/SelectModel", req, RequestAdapter());
            AutoThrowException(response);
            success = response.TryGetValue("success", out JToken successTok) && successTok.Value<bool>();
        });
        if (!success)
        {
            Logs.Debug($"{HandlerTypeData.Name} {BackendData.ID} remote backend failed to load model '{model.Name}'.");
            return false;
        }
        CurrentModelName = model.Name;
        return true;
    }

    /// <summary>Tell the remote SwarmUI instance to shut down fully.</summary>
    public async Task TriggerRemoteShutdown()
    {
        Logs.Verbose($"{HandlerTypeData.Name} {BackendData.ID} triggering remote swarm shutdown at {Address}");
        await SendAPIJSON("ShutdownServer", []);
    }

    /// <summary>Core handler to send a simple API JSON request. Will auto-inject a proper session ID.</summary>
    /// <param name="endpoint">The endpoint, only after the /API/ Part. For example, "GenerateText2Image".</param>
    /// <param name="request">The request JSON body.</param>
    /// <returns>The JSON response.</returns>
    public async Task<JObject> SendAPIJSON(string endpoint, JObject request)
    {
        request = request.DeepClone() as JObject;
        JObject result = null;
        await RunWithSession(async () =>
        {
            request["session_id"] = Session;
            result = await HttpClient.PostJson($"{Address}/API/{endpoint}", request, RequestAdapter());
            AutoThrowException(result);
        });
        return result;
    }

    /// <summary>Builds the required JSON input for a GenerateText2Image API request based on a <see cref="T2IParamInput"/> to generate.</summary>
    public JObject BuildRequest(T2IParamInput user_input)
    {
        JObject req = user_input.ToJSON();
        req[T2IParamTypes.Images.Type.ID] = 1;
        req["session_id"] = Session;
        req[T2IParamTypes.DoNotSave.Type.ID] = true;
        req.Remove(T2IParamTypes.ExactBackendID.Type.ID);
        req.Remove(T2IParamTypes.BackendType.Type.ID);
        if (!IsAControlInstance)
        {
            req[T2IParamTypes.ExactBackendID.Type.ID] = LinkedRemoteBackendID;
        }
        if (user_input.ReceiveRawBackendData is not null)
        {
            req[T2IParamTypes.ForwardRawBackendData.Type.ID] = true;
        }
        req[T2IParamTypes.ForwardSwarmData.Type.ID] = true;
        return req;
    }

    /// <inheritdoc/>
    public override async Task<Image[]> Generate(T2IParamInput user_input)
    {
        user_input.ProcessPromptEmbeds(x => $"<embedding:{x}>");
        JObject generated = SendAPIJSON("GenerateText2Image", BuildRequest(user_input)).Result;
        Image[] images = [.. generated["images"].Select(img => ImageFile.FromDataString(img.ToString()) as Image)];
        return images;
    }

    /// <inheritdoc/>
    public override async Task GenerateLive(T2IParamInput user_input, string batchId, Action<object> takeOutput)
    {
        if (!Settings.AllowWebsocket)
        {
            Image[] results = await Generate(user_input);
            foreach (MediaFile file in results)
            {
                takeOutput(file);
            }
            return;
        }
        user_input.ProcessPromptEmbeds(x => $"<embedding:{x}>");
        await RunWithSession(async () =>
        {
            ClientWebSocket websocket = await NetworkBackendUtils.ConnectWebsocket(Address, "API/GenerateText2ImageWS", ws =>
            {
                if (!string.IsNullOrWhiteSpace(Settings.AuthorizationHeader))
                {
                    ws.Options.SetRequestHeader("Authorization", Settings.AuthorizationHeader);
                }
                if (!string.IsNullOrWhiteSpace(Settings.OtherHeaders))
                {
                    foreach (string line in Settings.OtherHeaders.Split('\n'))
                    {
                        string[] parts = line.Split(':');
                        if (parts.Length != 2)
                        {
                            Logs.Error($"Invalid header line in SwarmSwarmBackend: '{line}'");
                            continue;
                        }
                        ws.Options.SetRequestHeader(parts[0].Trim(), parts[1].Trim());
                    }
                }
            });
            await websocket.SendJson(BuildRequest(user_input), API.WebsocketTimeout);
            Logs.Debug($"[{HandlerTypeData.Name}] WebSocket connected, remote backend {LinkedRemoteBackendID} should begin generating...");
            while (true)
            {
                if (user_input.InterruptToken.IsCancellationRequested)
                {
                    // TODO: This will require separate remote sessions per-user for multiuser support
                    await HttpClient.PostJson($"{Address}/API/InterruptAll", new() { ["session_id"] = Session, ["other_sessions"] = false }, RequestAdapter());
                }
                JObject response = await websocket.ReceiveJson(Utilities.ExtraLargeMaxReceive, true);
                if (response is not null)
                {
                    AutoThrowException(response);
                    if (response.TryGetValue("gen_progress", out JToken val) && val is JObject objVal)
                    {
                        if (objVal.ContainsKey("preview"))
                        {
                            Logs.Verbose($"[{HandlerTypeData.Name}] Got progress image from websocket {batchId}");
                        }
                        else
                        {
                            Logs.Verbose($"[{HandlerTypeData.Name}] Got progress from websocket for {batchId}: {response.ToDenseDebugString(true)}");
                        }
                        string actualId = batchId;
                        if (objVal.TryGetValue("batch_index", out JToken batchIndRemote) && int.TryParse($"{batchIndRemote}", out int batchIndRemoteParsed) && batchIndRemoteParsed > 0 && int.TryParse(batchId, out int localInd))
                        {
                            actualId = $"{localInd + batchIndRemoteParsed}";
                        }
                        objVal["batch_index"] = actualId;
                        objVal["request_id"] = $"{user_input.UserRequestId}";
                        takeOutput(objVal);
                    }
                    else if (response.TryGetValue("image", out val))
                    {
                        Logs.Verbose($"[{HandlerTypeData.Name}] Got image from websocket");
                        takeOutput(ImageFile.FromDataString(val.ToString()));
                    }
                    else if (response.TryGetValue("raw_backend_data", out JToken rawData))
                    {
                        string type = rawData["type"].ToString();
                        string datab64 = rawData["data"].ToString();
                        byte[] data = Convert.FromBase64String(datab64);
                        user_input.ReceiveRawBackendData?.Invoke(type, data);
                    }
                    else if (response.TryGetValue("raw_swarm_data", out JToken rawSwarmDataTok) && rawSwarmDataTok is JObject rawSwarmData)
                    {
                        Logs.Verbose($"Got raw spawn data from websocket: {rawSwarmData.ToDenseDebugString(true)}");
                        if (rawSwarmData.TryGetValue("params_used", out JToken paramsUsed))
                        {
                            foreach (JToken paramUsed in paramsUsed)
                            {
                                user_input.ParamsQueried.Add($"{paramUsed}");
                            }
                        }
                        if (user_input.Get(T2IParamTypes.ForwardSwarmData, false))
                        {
                            takeOutput(response);
                        }
                    }
                    else
                    {
                        Logs.Verbose($"[{HandlerTypeData.Name}] Got other from websocket: {response.ToDenseDebugString(true)}");
                    }
                }
                if (websocket.CloseStatus.HasValue)
                {
                    break;
                }
            }
            await websocket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, Program.GlobalProgramCancel);
        });
    }

    /// <summary>Implementations for <see cref="IsValidForThisBackend(T2IParamInput)"/> mapped by backend type id.</summary>
    public static ConcurrentDictionary<string, Func<SwarmSwarmBackend, T2IParamInput, bool>> ValidityChecks = [];

    /// <inheritdoc/>
    public override bool IsValidForThisBackend(T2IParamInput input)
    {
        if (IsAControlInstance)
        {
            input.RefusalReasons.Add("Control instances cannot generate.");
            return false;
        }
        if (string.IsNullOrWhiteSpace(LinkedRemoteBackendType))
        {
            input.RefusalReasons.Add("No loaded remote backend.");
            return false;
        }
        if (ValidityChecks.TryGetValue(LinkedRemoteBackendType, out Func<SwarmSwarmBackend, T2IParamInput, bool> func))
        {
            return func(this, input);
        }
        return true;
    }

    /// <inheritdoc/>
    public override async Task<bool> FreeMemory(bool systemRam)
    {
        if (IsAControlInstance)
        {
            return false;
        }
        bool result = false;
        await RunWithSession(async () =>
        {
            JObject response = await HttpClient.PostJson($"{Address}/API/FreeBackendMemory", new() { ["session_id"] = Session, ["system_ram"] = systemRam, ["backend"] = $"{LinkedRemoteBackendID}" }, RequestAdapter());
            AutoThrowException(response);
            result = response["result"].Value<bool>();
        });
        return Volatile.Read(ref result);
    }
}
