using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using System.IO;
using System.Net.WebSockets;
using System.Reflection;

namespace SwarmUI.WebAPI;

/// <summary>Entry point for processing calls to the web API.</summary>
public class API
{
    /// <summary>Internal mapping of API handlers, key is API path name, value is an .</summary>
    public static Dictionary<string, APICall> APIHandlers = [];

    /// <summary>Register a new API call handler.</summary>
    public static void RegisterAPICall(APICall call)
    {
        APIHandlers.Add(call.Name.ToLowerFast(), call);
    }

    /// <summary>Register a new API call handler.</summary>
    public static void RegisterAPICall(Delegate method, bool isUserUpdate = false, PermInfo permission = null)
    {
        if (permission is null && method.Method.Name != "GetNewSession" && method.Method.Name != "Login")
        {
            Logs.Error($"Warning: API method '{method.Method.Name}' registered without permission! (legacy call, or debugging? Make sure it has a permission added before committing to public access)");
        }
        RegisterAPICall(APICallReflectBuilder.BuildFor(method.Target, method.Method, isUserUpdate, permission));
    }

    /// <summary>Web access call route, triggered from <see cref="WebServer"/>.</summary>
    public static async Task HandleAsyncRequest(HttpContext context)
    {
        Session session = null;
        WebSocket socket = null;
        async Task Error(string message, string jsonErrorId = null, string jsonErrorMessage = null)
        {
            string forUser = session is null ? "" : $" for user '{session.User.UserID}'";
            Logs.Error($"[WebAPI] Error handling API request '{context.Request.Path}'{forUser}: {message}");
            if (jsonErrorId is not null || jsonErrorMessage is not null)
            {
                JObject errResponse = [];
                if (jsonErrorId is not null)
                {
                    errResponse["error_id"] = jsonErrorId;
                }
                if (jsonErrorMessage is not null)
                {
                    errResponse["error"] = jsonErrorMessage;
                }
                await context.YieldJsonOutput(socket, 400, errResponse);
            }
        }
        try
        {
            JObject input;
            // TODO: Receive limits should be low for unaunthenticated sessions, higher for authenticated ones.
            if (context.WebSockets.IsWebSocketRequest)
            {
                socket = await context.WebSockets.AcceptWebSocketAsync();
                input = await socket.ReceiveJson(TimeSpan.FromMinutes(1), Program.ServerSettings.Network.MaxReceiveBytes);
            }
            else if (context.Request.Method == "POST")
            {
                if (!context.Request.HasJsonContentType())
                {
                    await Error($"Request has wrong content-type: {context.Request.ContentType}", "basic_api", "Wrong content type");
                    return;
                }
                // Note: int32 size limit due to array allocation. Can't singular read direct more than 2 gig.
                if (!context.Request.ContentLength.HasValue || context.Request.ContentLength <= 0 || context.Request.ContentLength >= Program.ServerSettings.Network.MaxReceiveBytes || context.Request.ContentLength >= int.MaxValue)
                {
                    await Error($"Request has invalid content length: {context.Request.ContentLength}", "basic_api", "bad content length");
                    return;
                }
                byte[] rawData = new byte[(int)context.Request.ContentLength.Value];
                await context.Request.Body.ReadExactlyAsync(rawData, 0, rawData.Length);
                input = JObject.Parse(Encoding.UTF8.GetString(rawData));
            }
            else
            {
                await Error($"Invalid request method: {context.Request.Method}");
                context.Response.Redirect("/Error/NoGetAPI");
                return;
            }
            if (input is null)
            {
                await Error("Request input parsed to null", "basic_api", "null input");
                return;
            }
            string path = context.Request.Path.ToString().ToLowerFast().After("/api/");
            if (path != "getnewsession" && path != "login")
            {
                if (!input.TryGetValue("session_id", out JToken session_id))
                {
                    if (context.Request.Headers.TryGetValue("X-Session-ID", out StringValues headerVals) && headerVals.Count >= 1)
                    {
                        session_id = headerVals[0];
                    }
                    else
                    {
                        await Error("Request input lacks required session id", "basic_api", "missing session id");
                        return;
                    }
                }
                if (!Program.Sessions.TryGetSession($"{session_id}", out session))
                {
                    await Error("Request input has unknown session id (if you're not writing API code you can ignore this message)");
                    await context.YieldJsonOutput(socket, 401, Utilities.ErrorObj("Invalid session ID. You may need to refresh the page.", "invalid_session_id"));
                    return;
                }
            }
            if (!APIHandlers.TryGetValue(path, out APICall handler))
            {
                if (socket is not null)
                {
                    await Error("Unknown API route");
                    await context.YieldJsonOutput(socket, 404, Utilities.ErrorObj("Unknown API route.", "bad_route"));
                }
                else
                {
                    await Error("Unknown API route", "bad_route", "Unknown API route");
                }
                return;
            }
            if (handler.IsWebSocket && socket is null)
            {
                await Error("API route is a websocket but request is not", "bad_request_method", "API route needs websocket, request is HTTP");
                context.Response.Redirect("/Error/BasicAPI");
                return;
            }
            if (!handler.IsWebSocket && socket is not null)
            {
                await Error("API route is not a websocket but request is", "bad_request_method", "API route needs HTTP, request is websocket");
                return;
            }
            if (session is not null)
            {
                session.User.TickIsPresent();
                if (handler.IsUserUpdate)
                {
                    session.UpdateLastUsedTime();
                }
                if (handler.Permission is not null && !session.User.HasPermission(handler.Permission))
                {
                    await Error($"User lacks required permission '{handler.Permission.ID}' ('{handler.Permission.DisplayName}' in group '{handler.Permission.Group.DisplayName}')");
                    if (socket is not null)
                    {
                        await context.YieldJsonOutput(socket, 401, Utilities.ErrorObj("You lack permissions for this route.", "bad_permissions"));
                    }
                    else
                    {
                        await Error("User lacks required permissions", "bad_permissions", "You lack permissions for this route.");
                    }
                    return;
                }
            }
            JObject output = await handler.Call(context, session, socket, input);
            if (output is not null && output.TryGetValue("error", out JToken errorTok))
            {
                await Error($"{errorTok}");
            }
            if (socket is not null)
            {
                if (output is not null)
                {
                    await socket.SendJson(output, WebsocketTimeout);
                }
                using CancellationTokenSource cancel = Utilities.TimedCancel(TimeSpan.FromMinutes(1));
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, cancel.Token);
                return;
            }
            if (output is null)
            {
                await Error("API handler returned null", "no_result", "API call did not return any output");
                return;
            }
            await context.YieldJsonOutput(socket, 200, output);
        }
        catch (Exception ex)
        {
            if (ex is WebSocketException wserr && wserr.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
            {
                await Error($"Remote WebSocket disconnected unexpectedly (ConnectionClosedPrematurely). Did your browser crash while generating?");
                return;
            }
            await Error($"Internal exception: {ex.ReadableString()}", "internal_error", "An internal error occurred");
        }
    }

    /// <summary>Placeholder default WebSocket timeout.</summary>
    public static TimeSpan WebsocketTimeout = TimeSpan.FromMinutes(2); // TODO: Configurable timeout

    /// <summary>Helper to run simple websocket-multiresult action API calls.</summary>
    public static async Task RunWebsocketHandlerCallWS<T>(Func<Session, T, Action<JObject>, bool, Task> handler, Session session, T val, WebSocket socket)
    {
        ConcurrentQueue<JObject> outputs = new();
        AsyncAutoResetEvent signal = new(false);
        void takeOutput(JObject obj)
        {
            if (obj is not null)
            {
                outputs.Enqueue(obj);
            }
            signal.Set();
        }
        Task t = handler(session, val, takeOutput, true);
        Task _ = t.ContinueWith((t) => signal.Set());
        while (!t.IsCompleted || outputs.Any())
        {
            while (outputs.TryDequeue(out JObject output))
            {
                await socket.SendJson(output, WebsocketTimeout);
            }
            await signal.WaitAsync(TimeSpan.FromSeconds(2));
        }
        if (t.IsFaulted)
        {
            Logs.Error($"Error in websocket handler: {t.Exception.ReadableString()}");
        }
    }

    /// <summary>Helper to run simple websocket-multiresult action API calls without a websocket.</summary>
    public static async Task<List<JObject>> RunWebsocketHandlerCallDirect<T>(Func<Session, T, Action<JObject>, bool, Task> handler, Session session, T val)
    {
        ConcurrentQueue<JObject> outputs = new();
        void takeOutput(JObject obj)
        {
            if (obj is not null)
            {
                outputs.Enqueue(obj);
            }
        }
        await handler(session, val, takeOutput, false);
        return [.. outputs];
    }

    /// <summary>Helper to generate API documentation.</summary>
    public static async Task GenerateAPIDocs()
    {
        Logs.Info("Generating API docs...");
        string path = $"{Program.DataDir}/DebugNewAPIDocs";
        Directory.CreateDirectory(path);
        Dictionary<string, (StringBuilder, StringBuilder)> docs = [];
        foreach (APICall call in APIHandlers.Values.OrderBy(v => v.Name))
        {
            Type type = call.Original.DeclaringType;
            (StringBuilder docText, StringBuilder toc) = docs.GetOrCreate(type.Name, () => (new(), new()));
            if (docText.Length == 0)
            {
                docText.Append($"# SwarmUI API Documentation - {type.Name}\n\n> This is a subset of the API docs, see [/docs/API.md](/docs/API.md) for general info.\n\n");
                docText.Append(type.GetCustomAttribute<APIClassAttribute>()?.Description ?? "(CLASS DESCRIPTION NOT SET)");
                docText.Append("\n\n#### Table of Contents:\n\n!!!TABLE_OF_CONTENTS!!!\n");
            }
            if (call.IsWebSocket)
            {
                docText.Append($"## WebSocket Route /API/{call.Name}\n\n");
                toc.Append($"- WebSocket Route [{call.Name}](#websocket-route-api{call.Name.ToLowerFast()})\n");
            }
            else
            {
                docText.Append($"## HTTP Route /API/{call.Name}\n\n");
                toc.Append($"- HTTP Route [{call.Name}](#http-route-api{call.Name.ToLowerFast()})\n");
            }
            if (call.Original.GetCustomAttribute<APINonfinalMarkAttribute>() is not null)
            {
                docText.Append("> [!WARNING]\n> This API is marked non-final.\n> This means it is experimental, non-functional, or subject to change.\n> Use at your own risk.\n\n");
            }
            APIDescriptionAttribute methodDesc = call.Original.GetCustomAttribute<APIDescriptionAttribute>();
            string perm = call.Permission is null ? "(MISSING)" : $"`{call.Permission.ID}` - `{call.Permission.DisplayName}` in group `{call.Permission.Group.DisplayName}`";
            docText.Append($"#### Description\n\n{methodDesc?.Description ?? "(ROUTE DESCRIPTION NOT SET)"}\n\n#### Permission Flag\n\n{perm}\n\n#### Parameters\n\n");
            ParameterInfo[] paramInf = [.. call.Original.GetParameters().Where(m => m.ParameterType != typeof(Session) && m.ParameterType != typeof(WebSocket) && m.ParameterType != typeof(HttpContext))];
            if (paramInf.Length == 0)
            {
                docText.Append("**None.**\n\n");
            }
            else
            {
                docText.Append("| Name | Type | Description | Default |\n| --- | --- | --- | --- |\n");
                foreach (ParameterInfo param in paramInf)
                {
                    string description = param.GetCustomAttribute<APIParameterAttribute>()?.Description ?? "(PARAMETER DESCRIPTION NOT SET)";
                    string defaultVal;
                    if (!param.HasDefaultValue) { defaultVal = "**(REQUIRED)**"; }
                    else if (param.DefaultValue is string valStr && valStr == "") { defaultVal = "(Empty String)"; }
                    else if (param.DefaultValue is null) { defaultVal = "(null)"; }
                    else { defaultVal = $"`{param.DefaultValue}`"; }
                    docText.Append($"| {param.Name} | {param.ParameterType.Name} | {description} | {defaultVal} |\n");
                }
                docText.Append('\n');
            }
            docText.Append($"#### Return Format\n\n```js\n{methodDesc?.ReturnInfo ?? "(RETURN INFO NOT SET)"}\n```\n\n");
        }
        Logs.Info("Writing API docs...");
        foreach ((string clazz, (StringBuilder content, StringBuilder toc)) in docs)
        {
            await File.WriteAllTextAsync($"{path}/{clazz}.md", content.ToString().Replace("!!!TABLE_OF_CONTENTS!!!", toc.ToString()));
        }
        Logs.Info($"API docs generated and stored to '{path}'.");
    }

    [AttributeUsage(AttributeTargets.Class)]
    public class APIClassAttribute(string description) : Attribute
    {
        public string Description = description;
    }

    [AttributeUsage(AttributeTargets.Method)]
    public class APIDescriptionAttribute(string description, string returnInfo) : Attribute
    {
        public string Description = description;

        public string ReturnInfo = returnInfo;
    }

    [AttributeUsage(AttributeTargets.Parameter)]
    public class APIParameterAttribute(string description) : Attribute
    {
        public string Description = description;
    }

    [AttributeUsage(AttributeTargets.Method)]
    public class APINonfinalMarkAttribute : Attribute { }
}
