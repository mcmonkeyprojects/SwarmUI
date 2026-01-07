using System;
using System.IO;
using System.Threading.Tasks;
using System.Net;
using System.Net.WebSockets;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using SwarmUI.Accounts;
using SwarmUI.Builtin_ComfyUIBackend;
using SwarmUI.Text2Image;

namespace SwarmUI.Builtin_ComfyUIBackend;

/// <summary>A known ComfyUI page viewer. Uniquely identified by temporary SIDs, not actual underlying user.</summary>
public class ComfyUser
{
    public ConcurrentDictionary<ComfyClientData, ComfyClientData> Clients = new();

    public string MasterSID;

    public int TotalQueue => Clients.Values.Sum(c => c.QueueRemaining);

    public SemaphoreSlim Lock = new(1, 1);

    public volatile JObject LastExecuting, LastProgress;

    public int BackendOffset = 0;

    public ComfyClientData Reserved;

    /// <summary>The relevant Swarm user account.</summary>
    public User SwarmUser = null;

    /// <summary>If true, this user wants an open connection to all comfy backends.</summary>
    public bool WantsAllBackends = false;

    /// <summary>If true, this user wants gen requests to hit the Swarm queue.</summary>
    public bool WantsQueuing = false;

    /// <summary>If true, this user wants an exclusive backend reservation.</summary>
    public bool WantsReserve = false;

    public JObject FeatureFlagReport = null;

    /// <summary>The user data socket.</summary>
    public WebSocket Socket;

    public CancellationTokenSource ClientIsClosed = new();

    public ConcurrentQueue<(Memory<byte>, WebSocketMessageType, bool)> SendToClientQueue = [];

    public ConcurrentQueue<(Memory<byte>, WebSocketMessageType, bool)> SendToServersQueue = [];

    public AsyncAutoResetEvent NewClientDataEvent = new(false);

    public async Task AddClient(ComfyClientData client)
    {
        Clients.TryAdd(client, client);
        if (FeatureFlagReport is not null)
        {
            await client.Socket.SendAsync(FeatureFlagReport.ToString(Newtonsoft.Json.Formatting.None).EncodeUTF8(), WebSocketMessageType.Text, true, Program.GlobalProgramCancel);
        }
    }

    public void NewMessageToClient(Memory<byte> data, WebSocketMessageType type, bool endOfMessage)
    {
        SendToClientQueue.Enqueue((data, type, endOfMessage));
        NewClientDataEvent.Set();
    }

    public void NewMessageToServers(Memory<byte> data, WebSocketMessageType type, bool endOfMessage)
    {
        SendToServersQueue.Enqueue((data, type, endOfMessage));
        NewClientDataEvent.Set();
    }

    public void RunSendTask()
    {
        Utilities.RunCheckedTask(async () =>
        {
            while (true)
            {
                await NewClientDataEvent.WaitAsync(TimeSpan.FromSeconds(1));
                if (ClientIsClosed.IsCancellationRequested || Program.GlobalProgramCancel.IsCancellationRequested)
                {
                    return;
                }
                while (SendToClientQueue.TryDequeue(out (Memory<byte>, WebSocketMessageType, bool) data))
                {
                    await Socket.SendAsync(data.Item1, data.Item2, data.Item3, Program.GlobalProgramCancel);
                }
                while (SendToServersQueue.TryDequeue(out (Memory<byte>, WebSocketMessageType, bool) data))
                {
                    foreach (ComfyClientData client in Clients.Values)
                    {
                        await client.Socket.SendAsync(data.Item1, data.Item2, data.Item3, Program.GlobalProgramCancel);
                    }
                }
            }
        });
    }

    public void RunClientReceiveTask()
    {
        Utilities.RunCheckedTask(async () =>
        {
            try
            {
                byte[] recvBuf = new byte[20 * 1024 * 1024];
                while (true)
                {
                    // TODO: Should this input be allowed to remain open forever? Need a timeout, but the ComfyUI websocket doesn't seem to keepalive properly.
                    WebSocketReceiveResult received = await Socket.ReceiveAsync(recvBuf, Program.GlobalProgramCancel);
                    if (received.CloseStatus.HasValue || ClientIsClosed.IsCancellationRequested || Program.GlobalProgramCancel.IsCancellationRequested)
                    {
                        return;
                    }
                    if (received.MessageType == WebSocketMessageType.Text && received.EndOfMessage && received.Count < 8192 * 10 && recvBuf[0] == '{')
                    {
                        string rawText = "";
                        try
                        {
                            rawText = StringConversionHelper.UTF8Encoding.GetString(recvBuf[0..received.Count]);
                            JObject parsed = rawText.ParseToJson();
                            if (parsed.TryGetValue("type", out JToken typeTok) && $"{typeTok}" == "feature_flags")
                            {
                                FeatureFlagReport = parsed;
                            }
                        }
                        catch (Exception ex)
                        {
                            Logs.Error($"Failed to parse ComfyUI user message \"{rawText.Replace('\n', ' ')}\": {ex.ReadableString()}");
                        }
                    }
                    if (received.MessageType == WebSocketMessageType.Binary || received.MessageType == WebSocketMessageType.Text)
                    {
                        NewMessageToServers(recvBuf.AsMemory(0, received.Count), received.MessageType, received.EndOfMessage);
                    }
                }
            }
            catch (Exception ex)
            {
                if (ex is OperationCanceledException)
                {
                    return;
                }
                Logs.Debug($"ComfyUI redirection failed (in-socket, user {SwarmUser.UserID} with {Clients.Count} active sockets): {ex.ReadableString()}");
            }
            finally
            {
                await Close();
            }
        });
    }

    /// <summary>Send a prompt to the general swarm queue.</summary>
    public (Task, JObject) SendPromptQueue(JObject prompt)
    {
        T2IParamInput input = new(SwarmUser.GetGenericSession());
        input.Set(ComfyUIBackendExtension.FakeRawInputType, prompt.ToString(Newtonsoft.Json.Formatting.None));
        input.Set(T2IParamTypes.NoLoadModels, true);
        input.Set(T2IParamTypes.DoNotSave, true);
        input.Set(T2IParamTypes.NoInternalSpecialHandling, true);
        Guid promptId = Guid.NewGuid();
        JObject response = new()
        {
            ["prompt_id"] = $"{promptId}",
            ["number"] = 1,
            ["node_errors"] = new JObject()
        };
        string recvId = null;
        input.ReceiveRawBackendData = (type, data) =>
        {
            if (type != "comfy_websocket")
            {
                return;
            }
            // TODO: This is hacky message type detection. Maybe backend should actually pay attention to this properly?
            string firstChunk = Encoding.ASCII.GetString(data, 0, 8);
            if (firstChunk == "{\"type\":" || firstChunk == "{ \"type\"")
            {
                JObject jmessage = StringConversionHelper.UTF8Encoding.GetString(data).ParseToJson();
                string jtype = $"{jmessage["type"]}";
                if (jmessage.TryGetValue("data", out JToken dataTok) && dataTok is JObject dataObj)
                {
                    if (dataObj.TryGetValue("prompt_id", out JToken promptIdTok))
                    {
                        recvId ??= $"{promptIdTok}";
                        if ($"{promptIdTok}" != recvId) // Shouldn't happen but check and skip to be safe
                        {
                            return;
                        }
                        jmessage["data"]["prompt_id"] = $"{promptId}";
                    }
                    if (dataObj.TryGetValue("sid", out JToken sidTok))
                    {
                        MasterSID ??= $"{sidTok}";
                        jmessage["data"]["sid"] = MasterSID;
                    }
                }
                NewMessageToClient(jmessage.ToString(Newtonsoft.Json.Formatting.None).EncodeUTF8(), WebSocketMessageType.Text, true);
            }
            else
            {
                NewMessageToClient(data.AsMemory(0, data.Length), WebSocketMessageType.Binary, true);
            }
        };
        return (Utilities.RunCheckedTask(async () =>
        {
            using Session.GenClaim claim = input.SourceSession.Claim(gens: 1);
            // TODO: Handle errors?
            await T2IEngine.CreateImageTask(input, "0", claim, _ => { }, _ => { }, true, (_, _) => { });
        }), response);
    }

    /// <summary>Helper to send a comfy prompt to the backend, the regular (direct) way.</summary>
    public async Task<ComfyClientData> SendPromptRegular(JObject prompt, Action<string> giveError)
    {
        int preferredBackendIndex = prompt["swarm_prefer"]?.Value<int>() ?? -1;
        ComfyClientData[] available = Clients.Values.Where(c => c.Backend.MaxUsages > 0).ToArray().Shift(BackendOffset);
        if (available.Length == 0)
        {
            if (await Program.Backends.TryToScaleANewBackend(true))
            {
                Logs.Info("Comfy backend direct prompt request failed due to no available backends for user, causing new backends to load...");
                // TODO: Wait for the backend then re-prompt.
                // As a placeholder, we kill the websocket so the user knows they'll need to retry.
                giveError("[SwarmUI] No backend available, but auto-scaling was triggered, and a new backend is loading. Please wait a moment, then retry.");
            }
            else
            {
                giveError("[SwarmUI] No functional comfy backend available to run this request.");
            }
            await Socket.CloseAsync(WebSocketCloseStatus.InternalServerError, null, Program.GlobalProgramCancel);
            await Close();
            return null;
        }
        ComfyClientData client = available.MinBy(c => c.QueueRemaining);
        if (available.All(c => c.QueueRemaining > 0))
        {
            _ = Utilities.RunCheckedTask(async () => await Program.Backends.TryToScaleANewBackend(true));
        }
        if (preferredBackendIndex >= 0)
        {
            client = available[preferredBackendIndex % available.Length];
        }
        else if (available.Length > 1)
        {
            string[] classTypes = [.. prompt.Properties().Select(p => p.Value is JObject jobj ? (string)jobj["class_type"] : null).Where(ct => ct is not null)];
            ComfyClientData[] validClients = [.. available.Where(c =>
            {
                HashSet<string> nodes = c.Backend is SwarmSwarmBackend swarmBack ? ((HashSet<string>)swarmBack.ExtensionData.GetValueOrDefault("ComfyNodeTypes", new HashSet<string>())) : (c.Backend as ComfyUIAPIAbstractBackend).NodeTypes;
                return classTypes.All(ct => nodes.Contains(ct));
            })];
            if (validClients.Length == 0)
            {
                Logs.Debug("It looks like no available backends support all relevant comfy node class types?!");
                Logs.Verbose($"Expected class types: [{classTypes.JoinString(", ")}]");
            }
            else if (validClients.Length != available.Length)
            {
                Logs.Debug($"Required {classTypes.Length} class types, and {validClients.Length} out of {available.Length} backends support them.");
                client = validClients.MinBy(c => c.QueueRemaining);
            }
        }
        if (WantsReserve)
        {
            if (Reserved is not null)
            {
                client = Reserved;
            }
            else
            {
                Reserved = available.FirstOrDefault(c => c.Backend.Reservations == 0) ?? available.FirstOrDefault();
                if (Reserved is not null)
                {
                    client = Reserved;
                    Interlocked.Increment(ref client.Backend.Reservations);
                    client.Backend.BackendData.UpdateLastReleaseTime();
                }
            }
        }
        return client;
    }

    /// <summary>If the user reserved a private backend, release it.</summary>
    public void Unreserve()
    {
        if (Reserved is not null)
        {
            Interlocked.Decrement(ref Reserved.Backend.Reservations);
            Reserved = null;
        }
    }

    /// <summary>Fully close this user instance and all connections.</summary>
    public async Task Close()
    {
        if (ClientIsClosed.IsCancellationRequested)
        {
            return;
        }
        ComfyUIRedirectHelper.Users.TryRemove(MasterSID, out _);
        ClientIsClosed.Cancel();
        Unreserve();
        Socket.Dispose();
        await Utilities.RunCheckedTask(async () => await Task.WhenAll(Clients.Values.Select(async c =>
        {
            if (!c.Socket.CloseStatus.HasValue)
            {
                await c.Socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, Program.GlobalProgramCancel);
            }
            c.Socket.Dispose();
        })));
    }
}

/// <summary>Data about a specific connection from a ComfyUI user to a backend. This class is focused on the backend side, for the user side see <see cref="ComfyUser"/>.</summary>
public class ComfyClientData
{
    public ClientWebSocket Socket;

    public string SID;

    public volatile int QueueRemaining;

    public string LastNode;

    public volatile JObject LastExecuting, LastProgress;

    public string Address;

    public AbstractT2IBackend Backend;

    public static HashSet<string> ModelNameInputNames = ["ckpt_name", "vae_name", "lora_name", "clip_name", "control_net_name", "style_model_name", "model_path", "lora_names"];

    /// <summary>Auto-fixer for some workflow features, notably Windows vs Linux instances need different file path formats (backslash vs forward slash).</summary>
    public void FixUpPrompt(JObject prompt)
    {
        bool isBackSlash = Backend.SupportedFeatures.Contains("folderbackslash");
        foreach (JProperty node in prompt.Properties())
        {
            JObject inputs = node.Value["inputs"] as JObject;
            if (inputs is not null)
            {
                foreach (JProperty input in inputs.Properties())
                {
                    if (ModelNameInputNames.Contains(input.Name) && input.Value.Type == JTokenType.String)
                    {
                        string val = input.Value.ToString();
                        if (isBackSlash)
                        {
                            val = val.Replace("/", "\\");
                        }
                        else
                        {
                            val = val.Replace("\\", "/");
                        }
                        input.Value = val;
                    }
                }
            }
        }
    }
}
