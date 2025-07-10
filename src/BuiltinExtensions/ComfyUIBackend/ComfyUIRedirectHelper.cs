using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json.Linq;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Utils;
using System.IO;
using System.Net.Http;
using System.Net.WebSockets;
using System.Net;
using SwarmUI.WebAPI;
using SwarmUI.Accounts;
using Microsoft.Extensions.Primitives;

namespace SwarmUI.Builtin_ComfyUIBackend;

/// <summary>Helper class for network redirections for the '/ComfyBackendDirect' url path.</summary>
public class ComfyUIRedirectHelper
{
    // TODO: Should have an identity attached in a cookie so we can backtrack to the original user.
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

        public void Unreserve()
        {
            if (Reserved is not null)
            {
                Interlocked.Decrement(ref Reserved.Backend.Reservations);
                Reserved = null;
            }
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

    /// <summary>Map of all currently connected users.</summary>
    public static ConcurrentDictionary<string, ComfyUser> Users = new();

    /// <summary>Set of backend IDs that have recently been assigned to a user (to try to spread new users onto different backends where possible).</summary>
    public static ConcurrentDictionary<int, int> RecentlyClaimedBackends = new();

    /// <summary>Map of themes to theme file injection content.</summary>
    public static ConcurrentDictionary<string, string> ComfyThemeData = new();

    /// <summary>Backup for <see cref="ObjectInfoReadCacher"/>.</summary>
    public static volatile JObject LastObjectInfo;

    /// <summary>Cache handler to prevent "object_info" reads from spamming and killing the comfy backend (which handles them sequentially, and rather slowly per call).</summary>
    public static SingleValueExpiringCacheAsync<JObject> ObjectInfoReadCacher = new(() =>
    {
        ComfyUIBackendExtension.ComfyBackendData backend = ComfyUIBackendExtension.ComfyBackendsDirect().First();
        JObject result = null;
        try
        {
            using CancellationTokenSource cancel = Utilities.TimedCancel(TimeSpan.FromMinutes(1));
            result = backend.Client.GetAsync($"{backend.APIAddress}/object_info", cancel.Token).Result.Content.ReadAsStringAsync().Result.ParseToJson();
        }
        catch (Exception ex)
        {
            Logs.Error($"object_info read failure: {ex.ReadableString()}");
            if (LastObjectInfo is null)
            {
                throw;
            }
        }
        foreach (ComfyUIBackendExtension.ComfyBackendData trackedBackend in ComfyUIBackendExtension.ComfyBackendsDirect())
        {
            if (trackedBackend.Backend is ComfyUIAPIAbstractBackend comfy && comfy.RawObjectInfo is not null)
            {
                foreach (JProperty property in comfy.RawObjectInfo.Properties())
                {
                    if (!result.ContainsKey(property.Name))
                    {
                        result[property.Name] = property.Value;
                    }
                }
            }
        }
        if (result is not null)
        {
            LastObjectInfo = result;
        }
        return LastObjectInfo;
    }, TimeSpan.FromMinutes(10));

    /// <summary>Main comfy redirection handler - the core handler for the '/ComfyBackendDirect' route.</summary>
    public static async Task ComfyBackendDirectHandler(HttpContext context)
    {
        if (context.Response.StatusCode == 404)
        {
            return;
        }
        User swarmUser = WebServer.GetUserFor(context);
        if (swarmUser is null || !swarmUser.HasPermission(ComfyUIBackendExtension.PermDirectCalls))
        {
            context.Response.ContentType = "text/html";
            context.Response.StatusCode = 401;
            await context.Response.WriteAsync("<!DOCTYPE html><html><head><stylesheet>body{background-color:#101010;color:#eeeeee;}</stylesheet></head><body><span class=\"comfy-failed-to-load\">Permission denied.</span></body></html>");
            await context.Response.CompleteAsync();
            return;
        }
        List<ComfyUIBackendExtension.ComfyBackendData> allBackends = [.. ComfyUIBackendExtension.ComfyBackendsDirect()];
        if (context.Request.Headers.TryGetValue("X-Swarm-Backend-ID", out StringValues backendId) && int.TryParse(backendId, out int backendIdInt))
        {
            allBackends = [.. allBackends.Where(b => b.Backend.BackendData.ID == backendIdInt)];
        }
        (HttpClient webClient, string apiAddress, string webAddress, AbstractT2IBackend backend) = allBackends.FirstOrDefault();
        if (webClient is null)
        {
            context.Response.ContentType = "text/html";
            context.Response.StatusCode = 400;
            await context.Response.WriteAsync("<!DOCTYPE html><html><head><stylesheet>body{background-color:#101010;color:#eeeeee;}</stylesheet></head><body><span class=\"comfy-failed-to-load\">No ComfyUI backend available, loading failed.</span></body></html>");
            await context.Response.CompleteAsync();
            return;
        }
        bool hasMulti = context.Request.Cookies.TryGetValue("comfy_domulti", out string doMultiStr);
        bool shouldReserve = hasMulti && doMultiStr == "reserve";
        if (!shouldReserve && (!hasMulti || doMultiStr != "true"))
        {
            allBackends = [new(webClient, apiAddress, webAddress, backend)];
        }
        string path = context.Request.Path.Value;
        path = path.After("/ComfyBackendDirect");
        if (path.StartsWith('/'))
        {
            path = path[1..];
        }
        if (!string.IsNullOrWhiteSpace(context.Request.QueryString.Value))
        {
            path = $"{path}{context.Request.QueryString.Value}";
        }
        if (context.WebSockets.IsWebSocketRequest)
        {
            Logs.Debug($"Comfy backend direct websocket request to {path}, have {allBackends.Count} backends available");
            WebSocket socket = await context.WebSockets.AcceptWebSocketAsync();
            List<Task> tasks = [];
            ComfyUser user = new();
            // Order all evens then all odds - eg 0, 2, 4, 6, 1, 3, 5, 7 (to reduce chance of overlap when sharing)
            int[] vals = [.. Enumerable.Range(0, allBackends.Count)];
            vals = [.. vals.Where(v => v % 2 == 0), .. vals.Where(v => v % 2 == 1)];
            bool found = false;
            void tryFindBackend()
            {
                foreach (int option in vals)
                {
                    if (!Users.Values.Any(u => u.BackendOffset == option) && RecentlyClaimedBackends.TryAdd(option, option))
                    {
                        Logs.Debug($"Comfy backend direct offset for new user is {option}");
                        user.BackendOffset = option;
                        found = true;
                        break;
                    }
                }
            }
            tryFindBackend(); // First try: find one never claimed
            if (!found) // second chance: clear claims and find one at least not taken by existing user
            {
                RecentlyClaimedBackends.Clear();
                tryFindBackend();
            }
            // (All else fails, default to 0)
            foreach (ComfyUIBackendExtension.ComfyBackendData localback in allBackends)
            {
                string scheme = localback.WebAddress.BeforeAndAfter("://", out string addr);
                scheme = scheme == "http" ? "ws" : "wss";
                ClientWebSocket outSocket = new();
                outSocket.Options.KeepAliveInterval = TimeSpan.FromSeconds(30);
                await outSocket.ConnectAsync(new Uri($"{scheme}://{addr}/{path}"), Program.GlobalProgramCancel);
                ComfyClientData client = new() { Address = localback.WebAddress, Backend = localback.Backend, Socket = outSocket };
                user.Clients.TryAdd(client, client);
                tasks.Add(Task.Run(async () =>
                {
                    try
                    {
                        byte[] recvBuf = new byte[10 * 1024 * 1024];
                        while (true)
                        {
                            WebSocketReceiveResult received = await outSocket.ReceiveAsync(recvBuf, Program.GlobalProgramCancel);
                            if (received.MessageType != WebSocketMessageType.Close)
                            {
                                Memory<byte> toSend = recvBuf.AsMemory(0, received.Count);
                                await user.Lock.WaitAsync();
                                try
                                {
                                    bool isJson = received.MessageType == WebSocketMessageType.Text && received.EndOfMessage && received.Count < 8192 * 10 && recvBuf[0] == '{';
                                    if (isJson)
                                    {
                                        string rawText = null;
                                        try
                                        {
                                            rawText = StringConversionHelper.UTF8Encoding.GetString(recvBuf[0..received.Count]);
                                            JObject parsed = rawText.ParseToJson();
                                            JToken typeTok = parsed["type"];
                                            if (typeTok is not null)
                                            {
                                                string type = typeTok.ToString();
                                                if (type == "executing")
                                                {
                                                    client.LastExecuting = parsed;
                                                    user.LastExecuting = parsed;
                                                }
                                                else if (type == "progress")
                                                {
                                                    client.LastProgress = parsed;
                                                    user.LastProgress = parsed;
                                                }
                                            }
                                            JToken dataTok = parsed["data"];
                                            if (dataTok is JObject dataObj)
                                            {
                                                if (dataObj.TryGetValue("sid", out JToken sidTok))
                                                {
                                                    if (client.SID is not null)
                                                    {
                                                        Users.TryRemove(client.SID, out _);
                                                    }
                                                    client.SID = sidTok.ToString();
                                                    Users.TryAdd(client.SID, user);
                                                    if (user.MasterSID is null)
                                                    {
                                                        user.MasterSID = client.SID;
                                                    }
                                                    else
                                                    {
                                                        parsed["data"]["sid"] = user.MasterSID;
                                                        toSend = Encoding.UTF8.GetBytes(parsed.ToString());
                                                    }
                                                }
                                                if (dataObj.TryGetValue("node", out JToken nodeTok))
                                                {
                                                    client.LastNode = nodeTok.ToString();
                                                }
                                                if (dataObj.TryGetValue("status", out JToken statusTok) && statusTok is JObject status
                                                    && status.TryGetValue("exec_info", out JToken execTok) && execTok is JObject exec
                                                    && exec.TryGetValue("queue_remaining", out JToken queueRemTok))
                                                {
                                                    client.QueueRemaining = queueRemTok.Value<int>();
                                                    dataObj["status"]["exec_info"]["queue_remaining"] = user.TotalQueue;
                                                }
                                            }
                                        }
                                        catch (Exception ex)
                                        {
                                            Logs.Error($"Failed to parse ComfyUI message \"{rawText.Replace('\n', ' ')}\": {ex.ReadableString()}");
                                        }
                                    }
                                    if (!isJson)
                                    {
                                        if (client.LastExecuting is not null && (client.LastExecuting != user.LastExecuting || client.LastProgress != user.LastProgress))
                                        {
                                            user.LastExecuting = client.LastExecuting;
                                            await socket.SendAsync(StringConversionHelper.UTF8Encoding.GetBytes(client.LastExecuting.ToString()), WebSocketMessageType.Text, true, Program.GlobalProgramCancel);
                                        }
                                        if (client.LastProgress is not null && (client.LastExecuting != user.LastExecuting || client.LastProgress != user.LastProgress))
                                        {
                                            user.LastProgress = client.LastProgress;
                                            await socket.SendAsync(StringConversionHelper.UTF8Encoding.GetBytes(client.LastProgress.ToString()), WebSocketMessageType.Text, true, Program.GlobalProgramCancel);
                                        }
                                    }
                                    await socket.SendAsync(toSend, received.MessageType, received.EndOfMessage, Program.GlobalProgramCancel);
                                }
                                finally
                                {
                                    user.Lock.Release();
                                }
                            }
                            if (socket.CloseStatus.HasValue)
                            {
                                await socket.CloseAsync(socket.CloseStatus.Value, socket.CloseStatusDescription, Program.GlobalProgramCancel);
                                return;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        if (ex is OperationCanceledException)
                        {
                            return;
                        }
                        Logs.Debug($"ComfyUI redirection failed (outsocket): {ex.ReadableString()}");
                    }
                    finally
                    {
                        Users.TryRemove(client.SID, out _);
                        user.Clients.TryRemove(client, out _);
                        if (client.SID == user.Reserved?.SID)
                        {
                            user.Unreserve();
                        }
                    }
                }));
            }
            tasks.Add(Task.Run(async () =>
            {
                try
                {
                    byte[] recvBuf = new byte[10 * 1024 * 1024];
                    while (true)
                    {
                        // TODO: Should this input be allowed to remain open forever? Need a timeout, but the ComfyUI websocket doesn't seem to keepalive properly.
                        WebSocketReceiveResult received = await socket.ReceiveAsync(recvBuf, Program.GlobalProgramCancel);
                        foreach (ComfyClientData client in user.Clients.Values)
                        {
                            if (received.MessageType != WebSocketMessageType.Close)
                            {
                                await client.Socket.SendAsync(recvBuf.AsMemory(0, received.Count), received.MessageType, received.EndOfMessage, Program.GlobalProgramCancel);
                            }
                            if (socket.CloseStatus.HasValue)
                            {
                                await client.Socket.CloseAsync(socket.CloseStatus.Value, socket.CloseStatusDescription, Program.GlobalProgramCancel);
                                return;
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    if (ex is OperationCanceledException)
                    {
                        return;
                    }
                    Logs.Debug($"ComfyUI redirection failed (in-socket): {ex.ReadableString()}");
                }
                finally
                {
                    Users.TryRemove(user.MasterSID, out _);
                    user.Unreserve();
                }
            }));
            await Task.WhenAll(tasks);
            return;
        }
        HttpResponseMessage response = null;
        if (context.Request.Method == "POST")
        {
            if (!swarmUser.HasPermission(ComfyUIBackendExtension.PermBackendGenerate))
            {
                context.Response.ContentType = "text/html";
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("<!DOCTYPE html><html><head><stylesheet>body{background-color:#101010;color:#eeeeee;}</stylesheet></head><body><span class=\"comfy-failed-to-load\">Permission denied.</span></body></html>");
                await context.Response.CompleteAsync();
                return;
            }
            HttpContent content = null;
            if (path == "prompt" || path == "api/prompt")
            {
                try
                {
                    using MemoryStream memStream = new();
                    await context.Request.Body.CopyToAsync(memStream);
                    byte[] data = memStream.ToArray();
                    JObject parsed = StringConversionHelper.UTF8Encoding.GetString(data).ParseToJson();
                    bool redirected = false;
                    if (parsed.TryGetValue("client_id", out JToken clientIdTok))
                    {
                        string sid = clientIdTok.ToString();
                        if (Users.TryGetValue(sid, out ComfyUser user))
                        {
                            await user.Lock.WaitAsync();
                            try
                            {
                                JObject prompt = parsed["prompt"] as JObject;
                                int preferredBackendIndex = prompt["swarm_prefer"]?.Value<int>() ?? -1;
                                prompt.Remove("swarm_prefer");
                                ComfyClientData[] available = user.Clients.Values.ToArray().Shift(user.BackendOffset);
                                ComfyClientData client = available.MinBy(c => c.QueueRemaining);
                                if (preferredBackendIndex >= 0)
                                {
                                    client = available[preferredBackendIndex % available.Length];
                                }
                                else if (available.Length > 1)
                                {
                                    string[] classTypes = [.. prompt.Properties().Select(p => p.Value is JObject jobj ? (string)jobj["class_type"] : null).Where(ct => ct is not null)];
                                    ComfyClientData[] validClients = [.. available.Where(c => c.Backend is not ComfyUIAPIAbstractBackend comfy || classTypes.All(ct => comfy.NodeTypes.Contains(ct)))];
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
                                if (shouldReserve)
                                {
                                    if (user.Reserved is not null)
                                    {
                                        client = user.Reserved;
                                    }
                                    else
                                    {
                                        user.Reserved = available.FirstOrDefault(c => c.Backend.Reservations == 0) ?? available.FirstOrDefault();
                                        if (user.Reserved is not null)
                                        {
                                            client = user.Reserved;
                                            Interlocked.Increment(ref client.Backend.Reservations);
                                            client.Backend.BackendData.UpdateLastReleaseTime();
                                        }
                                    }
                                }
                                if (client?.SID is not null)
                                {
                                    client.QueueRemaining++;
                                    webAddress = client.Address;
                                    backend = client.Backend;
                                    parsed["client_id"] = client.SID;
                                    client.FixUpPrompt(parsed["prompt"] as JObject);
                                    string userText = $" (from user {swarmUser.UserID})";
                                    swarmUser.UpdateLastUsedTime();
                                    Logs.Info($"Sent Comfy backend direct prompt requested to backend #{backend.BackendData.ID}{userText}");
                                    backend.BackendData.UpdateLastReleaseTime();
                                    redirected = true;
                                }
                            }
                            finally
                            {
                                user.Lock.Release();
                            }
                        }
                    }
                    if (!redirected)
                    {
                        Logs.Debug($"Was not able to redirect Comfy backend direct prompt request");
                        backend.BackendData.UpdateLastReleaseTime();
                        Logs.Info($"Sent Comfy backend improper API call direct prompt requested to backend #{backend.BackendData.ID}");
                    }
                    content = Utilities.JSONContent(parsed);
                }
                catch (Exception ex)
                {
                    Logs.Debug($"ComfyUI redirection failed - prompt json parse: {ex.ReadableString()}");
                }
            }
            else if (path == "queue" || path == "api/queue" || path == "interrupt" || path == "api/interrupt") // eg queue delete
            {
                List<Task<HttpResponseMessage>> tasks = [];
                MemoryStream inputCopy = new();
                await context.Request.Body.CopyToAsync(inputCopy);
                byte[] inputBytes = inputCopy.ToArray();
                foreach (ComfyUIBackendExtension.ComfyBackendData back in allBackends)
                {
                    HttpRequestMessage dupRequest = new(new HttpMethod("POST"), $"{back.WebAddress}/{path}") { Content = new ByteArrayContent(inputBytes) };
                    dupRequest.Content.Headers.Add("Content-Type", context.Request.ContentType);
                    tasks.Add(webClient.SendAsync(dupRequest));
                }
                await Task.WhenAll(tasks);
                List<HttpResponseMessage> responses = [.. tasks.Select(t => t.Result)];
                response = responses.FirstOrDefault(t => t.StatusCode == HttpStatusCode.OK);
                response ??= responses.FirstOrDefault();
            }
            else
            {
                Logs.Verbose($"Comfy direct POST request to path {path}");
            }
            if (response is null)
            {
                HttpRequestMessage request = new(new HttpMethod("POST"), $"{webAddress}/{path}") { Content = content ?? new StreamContent(context.Request.Body) };
                if (content is null)
                {
                    request.Content.Headers.Add("Content-Type", context.Request.ContentType ?? "application/json");
                }
                response = await webClient.SendAsync(request);
            }
        }
        else
        {
            if (path.StartsWith("view?filename=") || path.StartsWith("api/view?filename="))
            {
                List<Task<HttpResponseMessage>> requests = [];
                foreach (ComfyUIBackendExtension.ComfyBackendData localBack in allBackends)
                {
                    requests.Add(localBack.Client.SendAsync(new(new(context.Request.Method), $"{localBack.WebAddress}/{path}")));
                }
                await Task.WhenAll(requests);
                response = requests.Select(r => r.Result).FirstOrDefault(r => r.StatusCode == HttpStatusCode.OK) ?? requests.First().Result;
            }
            else if ((path == "object_info" || path.StartsWith("object_info?") || path == "api/object_info" || path.StartsWith("api/object_info?")) && Program.ServerSettings.Performance.DoBackendDataCache)
            {
                JObject data = ObjectInfoReadCacher.GetValue();
                if (data is null)
                {
                    ObjectInfoReadCacher.ForceExpire();
                }
                response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(data.ToString(), Encoding.UTF8, "application/json") };
            }
            else if (path == "user.css" || path == "api/user.css")
            {
                HttpResponseMessage rawResponse = await webClient.GetAsync($"{webAddress}/{path}");
                string remoteUserThemeText = rawResponse.StatusCode == HttpStatusCode.OK ? await rawResponse.Content.ReadAsStringAsync() : "";
                string theme = swarmUser.Settings.Theme ?? Program.ServerSettings.DefaultUser.Theme;
                if (Program.Web.RegisteredThemes.ContainsKey(theme))
                {
                    string themeText = ComfyThemeData.GetOrCreate(theme, () =>
                    {
                        string path = $"{ComfyUIBackendExtension.Folder}/ThemeCSS/{theme}.css";
                        if (!File.Exists(path))
                        {
                            return null;
                        }
                        return File.ReadAllText(path);
                    });
                    if (themeText is not null)
                    {
                        remoteUserThemeText += $"\n{themeText}\n";
                    }
                }
                response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(remoteUserThemeText, Encoding.UTF8, "text/css") };
            }
            else
            {
                HttpRequestMessage request = new(new(context.Request.Method), $"{webAddress}/{path}");
                if ((context.Request.Headers.ContentLength ?? 0) > 0)
                {
                    request.Content = new StreamContent(context.Request.Body);
                }
                response = await webClient.SendAsync(request);
            }
        }
        int code = (int)response.StatusCode;
        if (code != 200)
        {
            Logs.Debug($"ComfyUI redirection gave non-200 code: '{code}' for URL: {context.Request.Method} '{path}'");
        }
        Logs.Verbose($"Comfy Redir status code {code} from {context.Response.StatusCode} and type {response.Content.Headers.ContentType} for {context.Request.Method} '{path}'");
        context.Response.StatusCode = code;
        if (response.Content is not null)
        {
            if (response.Content.Headers.ContentType is not null)
            {
                context.Response.ContentType = response.Content.Headers.ContentType.ToString();
            }
            await response.Content.CopyToAsync(context.Response.Body);
        }
        await context.Response.CompleteAsync();
    }
}
