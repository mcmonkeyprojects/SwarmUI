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

    /// <summary>The user data socket.</summary>
    public WebSocket Socket;

    public CancellationTokenSource ClientIsClosed = new();

    public ConcurrentQueue<(Memory<byte>, WebSocketMessageType, bool)> SendToClientQueue = [];

    public ConcurrentQueue<(Memory<byte>, WebSocketMessageType, bool)> SendToServersQueue = [];

    public AsyncAutoResetEvent NewClientDataEvent = new(false);

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
                    NewMessageToServers(recvBuf.AsMemory(0, received.Count), received.MessageType, received.EndOfMessage);
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
