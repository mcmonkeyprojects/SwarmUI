using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SwarmUI.Backends;
using SwarmUI.Core;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Net;
using System.Diagnostics;
using SwarmUI.Text2Image;
using System.Net.Sockets;
using Microsoft.VisualBasic.FileIO;
using Microsoft.AspNetCore.Cryptography.KeyDerivation;

namespace SwarmUI.Utils;

/// <summary>General utilities holder.</summary>
public static class Utilities
{
    /// <summary>Preps various utilities during server start.</summary>
    public static void PrepUtils()
    {
        ThreadPool.SetMinThreads(512, 512);
        Program.TickIsGeneratingEvent += () => WebhookManager.WaitUntilCanStartGenerating().Wait();
        Program.TickNoGenerationsEvent += () => WebhookManager.TickNoGenerations().Wait();
        Program.TickIsGeneratingEvent += MemCleaner.TickIsGenerating;
        Program.TickNoGenerationsEvent += MemCleaner.TickNoGenerations;
        Program.TickEvent += SystemStatusMonitor.Tick;
        Program.SlowTickEvent += AutoRestartCheck;
        int subticks = 0;
        Program.SlowTickEvent += () =>
        {
            if (subticks++ > 20)
            {
                subticks = 0;
                CleanRAM();
            }
            else
            {
                QuickGC();
            }
        };
        new Thread(TickLoop).Start();
    }

    /// <summary>The <see cref="Environment.TickCount64"/> value when the server started.</summary>
    public static long ServerStartTime = Environment.TickCount64;

    /// <summary>Check if the server wants an auto-restart.</summary>
    public static void AutoRestartCheck()
    {
        if (Program.ServerSettings.Maintenance.RestartAfterHours < 0.1)
        {
            return;
        }
        double hoursPassed = TimeSpan.FromMilliseconds(Environment.TickCount64 - ServerStartTime).TotalHours;
        if (hoursPassed < Program.ServerSettings.Maintenance.RestartAfterHours)
        {
            return;
        }
        string limitHours = Program.ServerSettings.Maintenance.RestartHoursAllowed, limitDays = Program.ServerSettings.Maintenance.RestartDayAllowed;
        DateTimeOffset now = DateTimeOffset.Now;
        if (!string.IsNullOrWhiteSpace(limitHours))
        {
            string[] hours = [.. limitHours.SplitFast(',').Select(h => h.Trim())];
            if (hours.Length > 0 && !hours.Contains($"{now.Hour}") && !hours.Contains($"0{now.Hour}"))
            {
                return;
            }
        }
        if (!string.IsNullOrWhiteSpace(limitDays))
        {
            string[] days = [.. limitDays.SplitFast(',').Select(d => d.Trim().ToLowerFast())];
            if (days.Length > 0 && !days.Contains($"{(int)now.DayOfWeek}") && !days.Contains($"{now.DayOfWeek.ToString().ToLowerFast()}"))
            {
                return;
            }
        }
        if (Program.Backends.T2IBackendRequests.Any() || Program.Backends.QueuedRequests > 0 || Program.Backends.T2IBackends.Values.Any(b => b.CheckIsInUseAtAll))
        {
            return;
        }
        Program.RequestRestart();
    }

    /// <summary>Internal tick loop thread main method.</summary>
    public static void TickLoop()
    {
        int ticks = 0;
        while (!Program.GlobalProgramCancel.IsCancellationRequested)
        {
            try
            {
                Task.Delay(TimeSpan.FromSeconds(1), Program.GlobalProgramCancel).Wait(Program.GlobalProgramCancel);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            try
            {
                ticks++;
                Program.TickEvent?.Invoke();
                if (ticks % 60 == 0)
                {
                    Program.SlowTickEvent?.Invoke();
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Tick loop encountered exception: {ex.ReadableString()}");
            }
        }
    }

    /// <summary>If true, presume that this system has a certain generation of NVIDIA or newer graphics card.</summary>
    public static bool PresumeNVidia30xx = false, PresumeNVidia40xx = false, PresumeNVidia50xx = false;

    /// <summary>SwarmUI's current version.</summary>
    public static readonly string Version = Assembly.GetEntryAssembly()?.GetName().Version.ToString();

    /// <summary>URL to the github repo.</summary>
    public const string RepoRoot = "https://github.com/mcmonkeyprojects/SwarmUI";

    /// <summary>URL to where the documentation files start.</summary>
    public const string RepoDocsRoot = $"{RepoRoot}/blob/master/docs/";

    /// <summary>Current git commit (if known -- empty if unknown).</summary>
    public static string GitCommit = "";

    /// <summary>Used by linked pages to prevent cache errors when data changes.</summary>
    public static string VaryID = Version;

    /// <summary>A temporary unique ID for this server, used to make sure we don't ever form a circular swarm connection path.</summary>
    public static Guid LoopPreventionID = Guid.NewGuid();

    /// <summary>Matcher for ASCII control codes (including newlines, etc).</summary>
    public static AsciiMatcher ControlCodesMatcher = new(c => c < 32);

    /// <summary>Matcher for characters banned or specialcased by Windows or other OS's.</summary>
    public static AsciiMatcher FilePathForbidden = new(c => c < 32 || "<>:\"\\|?*~&@;#$^".Contains(c));

    public static HashSet<string> ReservedFilenames = ["con", "prn", "aux", "nul"];

    /// <summary>Set of unicode control chars that can accidentally wind up in text that would be a (noncritical) nuisance if left in filename.</summary>
    public static HashSet<char> RestrictedControlChars = ['\u180e', '\u200b', '\u200c', '\u200d', '\u200e', '\u200f', '\u202a',
        '\u202b', '\u202c', '\u202d', '\u202e', '\u2060', '\u2061', '\u2062', '\u2063', '\u2064', '\u2066', '\u2067', '\u2068',
        '\u2069', '\u206a', '\u206b', '\u206c', '\u206b', '\u206e', '\u206f', '\ufeff', '\ufff9', '\ufffa', '\ufffb'];

    static Utilities()
    {
        if (File.Exists("./.git/refs/heads/master"))
        {
            GitCommit = File.ReadAllText("./.git/refs/heads/master").Trim()[0..8];
            VaryID += ".GIT-" + GitCommit;
        }
        for (int i = 0; i <= 9; i++)
        {
            ReservedFilenames.Add($"com{i}");
            ReservedFilenames.Add($"lpt{i}");
        }
    }

    /// <summary>Cleans a filename with strict filtering, including removal of forbidden characters, removal of the '.' symbol, but permitting '/'.</summary>
    public static string StrictFilenameClean(string name)
    {
        // Cleanup ASCII character oddities
        name = FilePathForbidden.TrimToNonMatches(name.Replace('\\', '/')).Replace(".", "");
        // Cleanup non-breaking but unwanted values
        name = new string([.. name.Where(c => !RestrictedControlChars.Contains(c))]);
        // Cleanup pathing format
        while (name.Contains("//"))
        {
            name = name.Replace("//", "/");
        }
        name = name.TrimStart('/').Trim();
        // Prevent windows reserved filenames
        string[] parts = name.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        for (int i = 0; i < parts.Length; i++)
        {
            if (ReservedFilenames.Contains(parts[i].ToLowerFast()))
            {
                parts[i] = $"{parts[i]}_";
            }
        }
        return parts.JoinString("/");
    }

    /// <summary>Mini-utility class to debug load times.</summary>
    public class LoadTimer
    {
        public long StartTime = Environment.TickCount64;
        public long LastTime = Environment.TickCount64;

        public void Check(string part)
        {
            long timeNow = Environment.TickCount64;
            Logs.Debug($"[Load Time] {part} took {(timeNow - LastTime) / 1000.0:0.##}s ({(timeNow - StartTime) / 1000.0:0.##}s from start)");
            LastTime = timeNow;
        }
    }

    /// <summary>Mini-utility class to debug timings.</summary>
    public class ChunkedTimer
    {
        public long StartTime = Environment.TickCount64;
        public long LastTime = Environment.TickCount64;

        public Dictionary<string, (long, long)> Times = [];

        public void Reset()
        {
            StartTime = Environment.TickCount64;
            LastTime = Environment.TickCount64;
        }

        public void Mark(string part)
        {
            long timeNow = Environment.TickCount64;
            Times[part] = (timeNow - LastTime, timeNow - StartTime);
            LastTime = timeNow;
        }

        public void Debug(string extra)
        {
            string content = Times.Select(kvp => $"{kvp.Key}: {kvp.Value.Item1 / 1000.0:0.##}s ({kvp.Value.Item2 / 1000.0:0.##}s from start)").JoinString(", ");
            Logs.Debug($"[ChunkedTimer] {content} {extra}");
        }
    }

    /// <summary>Gets a secure hex string of a given length (will generate half as many bytes).</summary>
    public static string SecureRandomHex(int length)
    {
        if (length % 2 == 1)
        {
            return BytesToHex(RandomNumberGenerator.GetBytes((length + 1) / 2))[0..^1];
        }
        return BytesToHex(RandomNumberGenerator.GetBytes(length / 2));
    }

    /// <summary>Gets a convenient cancel token that cancels itself after a given time OR the program itself is cancelled.</summary>
    public static CancellationTokenSource TimedCancel(TimeSpan time)
    {
        return CancellationTokenSource.CreateLinkedTokenSource(Program.GlobalProgramCancel, new CancellationTokenSource(time).Token);
    }

    /// <summary>Send JSON data to a WebSocket.</summary>
    public static async Task SendJson(this WebSocket socket, JObject obj, TimeSpan maxDuration)
    {
        using CancellationTokenSource cancel = TimedCancel(maxDuration);
        await socket.SendAsync(JsonToByteArray(obj), WebSocketMessageType.Text, true, cancel.Token);
    }

    /// <summary>Send JSON data to a WebSocket.</summary>
    public static async Task SendAndReportError(this WebSocket socket, string context, string message, TimeSpan maxDuration)
    {
        Logs.Error($"{context}: {message}");
        await socket.SendJson(new JObject() { ["error"] = message }, maxDuration);
    }

    /// <summary>Equivalent to <see cref="Task.WhenAny(IEnumerable{Task})"/> but doesn't break on an empty list.</summary>
    public static Task WhenAny(IEnumerable<Task> tasks)
    {
        if (tasks.IsEmpty())
        {
            return Task.CompletedTask;
        }
        return Task.WhenAny(tasks);
    }

    /// <summary>Equivalent to <see cref="Task.WhenAny(Task[])"/> but doesn't break on an empty list.</summary>
    public static Task WhenAny(params Task[] tasks)
    {
        if (tasks.IsEmpty())
        {
            return Task.CompletedTask;
        }
        return Task.WhenAny(tasks);
    }

    /// <summary>Receive raw binary data from a WebSocket.</summary>
    public static async Task<byte[]> ReceiveData(this WebSocket socket, int maxBytes, CancellationToken limit)
    {
        byte[] buffer = new byte[8192];
        using MemoryStream ms = new();
        WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(buffer, limit);
            ms.Write(buffer, 0, result.Count);
            if (ms.Length > maxBytes)
            {
                throw new IOException($"Received too much data! (over {maxBytes} bytes)");
            }
        }
        while (!result.EndOfMessage);
        return ms.ToArray();
    }

    /// <summary>Receive raw binary data from a WebSocket.</summary>
    public static async Task<byte[]> ReceiveData(this WebSocket socket, TimeSpan maxDuration, int maxBytes)
    {
        using CancellationTokenSource cancel = TimedCancel(maxDuration);
        return await ReceiveData(socket, maxBytes, cancel.Token);
    }

    /// <summary>Receive JSON data from a WebSocket.</summary>
    public static async Task<JObject> ReceiveJson(this WebSocket socket, int maxBytes, bool nullOnEmpty = false)
    {
        string raw = Encoding.UTF8.GetString(await ReceiveData(socket, maxBytes, Program.GlobalProgramCancel));
        if (nullOnEmpty && string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }
        return raw.ParseToJson();
    }

    /// <summary>Receive JSON data from a WebSocket.</summary>
    public static async Task<JObject> ReceiveJson(this WebSocket socket, TimeSpan maxDuration, int maxBytes, bool nullOnEmpty = false)
    {
        string raw = Encoding.UTF8.GetString(await ReceiveData(socket, maxDuration, maxBytes));
        if (nullOnEmpty && string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }
        return raw.ParseToJson();
    }

    /// <summary>Sends a JSON object post and receives a JSON object back.</summary>
    public static async Task<JObject> PostJson(this HttpClient client, string url, JObject data, Action<HttpRequestMessage> adaptFunc, CancellationToken? cancel = null)
    {
        HttpRequestMessage request = new(HttpMethod.Post, url) { Content = JSONContent(data) };
        adaptFunc?.Invoke(request);
        HttpResponseMessage response = await client.SendAsync(request, cancel ?? Program.GlobalProgramCancel);
        return (await response.Content.ReadAsStringAsync()).ParseToJson();
    }

    /// <summary>Sends a JSON object post and receives a JSON object back.</summary>
    public static async Task<JObject> PostJson(this HttpClient client, string url, JObject data)
    {
        return (await (await client.PostAsync(url, JSONContent(data), Program.GlobalProgramCancel)).Content.ReadAsStringAsync()).ParseToJson();
    }

    /// <summary>Sends a JSON string post and receives a JSON object back.</summary>
    public static async Task<JObject> PostJSONString(this HttpClient client, string route, string input, CancellationToken interrupt)
    {
        return await NetworkBackendUtils.Parse<JObject>(await client.PostAsync(route, new StringContent(input, StringConversionHelper.UTF8Encoding, "application/json"), interrupt));
    }

    /// <summary>Converts the JSON data to predictable basic data.</summary>
    public static object ToBasicObject(this JToken token)
    {
        return token.Type switch
        {
            JTokenType.Object => ((JObject)token).ToBasicObject(),
            JTokenType.Array => ((JArray)token).Select(ToBasicObject).ToList(),
            JTokenType.Integer => (long)token,
            JTokenType.Float => (double)token,
            JTokenType.String => (string)token,
            JTokenType.Boolean => (bool)token,
            JTokenType.Null => null,
            _ => throw new Exception("Unknown token type: " + token.Type),
        };
    }

    /// <summary>Converts the JSON data to predictable basic data.</summary>
    public static Dictionary<string, object> ToBasicObject(this JObject obj)
    {
        Dictionary<string, object> result = [];
        foreach ((string key, JToken val) in obj)
        {
            result[key] = val.ToBasicObject();
        }
        return result;
    }

    /// <summary>Sorts the data in a <see cref="JObject"/> by the given key processing function.</summary>
    public static JObject SortByKey<TSortable>(this JObject obj, Func<string, TSortable> sort)
    {
        return JObject.FromObject(obj.Properties().OrderBy(p => sort(p.Name)).ToDictionary(p => p.Name, p => p.Value));
    }

    /// <summary>(Experimental) aggressively simply low-mem ToString for JSON data. Dense, spaceless, unformatted.</summary>
    public static void ToStringFast(this JToken jval, StringBuilder builder)
    {
        if (jval is JObject jobj)
        {
            builder.Append('{');
            if (jobj.Count > 0)
            {
                foreach ((string key, JToken val) in jobj)
                {
                    builder.Append('"').Append(EscapeJsonString(key)).Append("\":");
                    val.ToStringFast(builder);
                    builder.Append(',');
                }
                builder.Length--;
            }
            builder.Append('}');
        }
        else if (jval is JArray jarr)
        {
            builder.Append('[');
            if (jarr.Count > 0)
            {
                foreach (JToken val in jarr)
                {
                    val.ToStringFast(builder);
                    builder.Append(',');
                }
                builder.Length--;
            }
            builder.Append(']');
        }
        else
        {
            builder.Append(jval.ToString(Formatting.None));
        }
    }

    /// <summary>Converts a <see cref="JObject"/> to a UTF-8 string byte array.</summary>
    public static byte[] JsonToByteArray(JObject jdata)
    {
        StringBuilder builder = new(1024);
        jdata.ToStringFast(builder);
        return builder.ToString().EncodeUTF8();
    }

    /// <summary>Gives a clean standard 4-space serialize of this <see cref="JObject"/>.</summary>
    public static string SerializeClean(this JObject jobj)
    {
        // Why is JSON.NET's API so weirdly splintered? So many different fundamental routes needed to get access to basic settings.
        using StringWriter sw = new();
        using JsonTextWriter jw = new(sw);
        jw.Formatting = Formatting.Indented;
        jw.IndentChar = ' ';
        jw.Indentation = 4;
        JsonSerializer serializer = new();
        serializer.Serialize(jw, jobj);
        jw.Flush();
        return sw.ToString() + Environment.NewLine;
    }

    public static async Task YieldJsonOutput(this HttpContext context, WebSocket socket, int status, JObject obj)
    {
        if (socket != null)
        {
            await socket.SendJson(obj, TimeSpan.FromMinutes(1));
            using CancellationTokenSource cancel = TimedCancel(TimeSpan.FromMinutes(1));
            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, cancel.Token);
            return;
        }
        byte[] resp = JsonToByteArray(obj);
        context.Response.ContentType = "application/json";
        context.Response.StatusCode = status;
        context.Response.ContentLength = resp.Length;
        context.Response.Headers.CacheControl = "no-store";
        await context.Response.BodyWriter.WriteAsync(resp, Program.GlobalProgramCancel);
        await context.Response.CompleteAsync();
    }

    public static JObject ErrorObj(string message, string error_id)
    {
        return new JObject() { ["error"] = message, ["error_id"] = error_id };
    }

    public static ByteArrayContent JSONContent(JObject jobj)
    {
        ByteArrayContent content = new(JsonToByteArray(jobj));
        content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        return content;
    }

    public static MultipartFormDataContent MultiPartFormContentDiscordImage(Image image, JObject jobj)
    {
        MultipartFormDataContent content = [];
        ByteArrayContent imageContent = new(image.ImageData);
        imageContent.Headers.ContentType = new MediaTypeHeaderValue(image.MimeType());
        content.Add(imageContent, "file", $"image.{image.Extension}");
        content.Add(JSONContent(jobj), "payload_json");
        return content;
    }

    /// <summary>Takes an escaped JSON string, and returns the plaintext unescaped form of it.</summary>
    public static string UnescapeJsonString(string input)
    {
        return JObject.Parse("{ \"value\": \"" + input + "\" }")["value"].ToString();
    }

    /// <summary>Accelerator trick to speed up <see cref="EscapeJsonString(string)"/>.</summary>
    public static AsciiMatcher NeedsJsonEscapeMatcher = new(c => c < 32 || "\\\"\n\r\b\t\f/".Contains(c, StringComparison.Ordinal));

    /// <summary>Takes a string that may contain unpredictable content, and escapes it to fit safely within a JSON string section.</summary>
    public static string EscapeJsonString(string input)
    {
        if (!NeedsJsonEscapeMatcher.ContainsAnyMatch(input))
        {
            return input;
        }
        string cleaned = input.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r").Replace("\b", "\\b").Replace("\t", "\\t").Replace("\f", "\\f").Replace("/", "\\/");
        StringBuilder output = new(input.Length);
        foreach (char c in cleaned)
        {
            if (c < 32)
            {
                output.Append("\\u");
                output.Append(((int)c).ToString("X4"));
            }
            else
            {
                output.Append(c);
            }
        }
        return output.ToString();
    }

    /// <summary>A mapping of common file extensions to their content type.</summary>
    public static Dictionary<string, string> CommonContentTypes = new()
        {
            { "png", "image/png" },
            { "jpg", "image/jpeg" },
            { "jpeg", "image/jpeg" },
            { "webp", "image/webp" },
            { "gif", "image/gif" },
            { "ico", "image/x-icon" },
            { "svg", "image/svg+xml" },
            { "mp3", "audio/mpeg" },
            { "wav", "audio/x-wav" },
            { "js", "application/javascript" },
            { "ogg", "application/ogg" },
            { "json", "application/json" },
            { "zip", "application/zip" },
            { "dat", "application/octet-stream" },
            { "css", "text/css" },
            { "htm", "text/html" },
            { "html", "text/html" },
            { "txt", "text/plain" },
            { "yml", "text/plain" },
            { "fds", "text/plain" },
            { "xml", "text/xml" },
            { "mp4", "video/mp4" },
            { "mpeg", "video/mpeg" },
            { "mov", "video/quicktime" },
            { "webm", "video/webm" },
            { "aac", "audio/aac" },
            { "wave", "audio/x-wav" },
            { "flac", "audio/flac" }
        };

    /// <summary>Guesses the content type based on path for common file types.</summary>
    public static string GuessContentType(string path)
    {
        string extension = path.AfterLast('.');
        return CommonContentTypes.GetValueOrDefault(extension, "application/octet-stream");
    }

    public static AsciiMatcher GeneralValidSymbolsMatcher = new(c => (c >= 32 && c <= 126) || c == 9 || c == 10 || c == 13);

    /// <summary>Clean some potentially-trash text for output into logs. Strips invalid non-ascii characters and cuts to max length.
    /// Useful for situations such as logging parser errors, to avoid corrupt data trashing the logs.</summary>
    public static string CleanTrashTextForDebug(string text)
    {
        string clean = GeneralValidSymbolsMatcher.TrimToMatches(text);
        if (clean != text)
        {
            clean = $"(Invalid Characters Stripped) {clean}";
        }
        if (clean.Length > 256)
        {
            clean = $"{clean[..256]}...";
        }
        return clean;
    }

    public static JObject ParseToJson(this string input)
    {
        try
        {
            return JObject.Parse(input);
        }
        catch (JsonReaderException ex)
        {
            throw new JsonReaderException($"Failed to parse JSON `{CleanTrashTextForDebug(input.Replace("\n", "  "))}`: {ex.Message}");
        }
    }

    public static Dictionary<string, T> ApplyMap<T>(Dictionary<string, T> orig, Dictionary<string, string> map)
    {
        Dictionary<string, T> result = new(orig);
        foreach ((string mapFrom, string mapTo) in map)
        {
            if (result.Remove(mapFrom, out T value))
            {
                result[mapTo] = value;
            }
        }
        return result;
    }

    /// <summary>Runs a task async with an exception check.</summary>
    public static Task RunCheckedTask(Action action, string sourceId = "unlabeled")
    {
        return Task.Run(() =>
        {
            try
            {
                action();
            }
            catch (Exception ex)
            {
                Logs.Error($"Internal error in async task ({sourceId}): {ex.ReadableString()}");
            }
        });
    }

    public static Task RunCheckedTask(Func<Task> action, string sourceId = "unlabeled")
    {
        return Task.Run(async () =>
        {
            try
            {
                await action();
            }
            catch (Exception ex)
            {
                Logs.Error($"Internal error in async task ({sourceId}): {ex.ReadableString()}");
            }
        });
    }

    /// <summary>Returns whether a given port number is taken (there is already a program listening on that port).</summary>
    public static bool IsPortTaken(int port)
    {
        return IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(e => e.Port == port);
    }

    /// <summary>Kill system process.</summary>
    [DllImport("libc", SetLastError = true, EntryPoint = "kill")]
    public static extern int sys_kill(int pid, int signal);

    /// <summary>Attempt to properly kill a process.</summary>
    public static void KillProcess(Process proc, int graceSeconds)
    {
        if (proc is null || proc.HasExited)
        {
            return;
        }
        try
        {
            sys_kill(proc.Id, 15); // try graceful exit (SIGTERM=15)
            proc.WaitForExit(TimeSpan.FromSeconds(graceSeconds));
        }
        catch (DllNotFoundException)
        {
            Logs.Verbose($"Utilities.KillProcess: DllNotFoundException for libc");
            // Sometimes libc just isn't available (Windows especially) so just ignore those failures, ungraceful kill only I guess.
        }
        proc.Kill(true); // Now kill the full tree (SIGKILL=9)
        proc.WaitForExit(TimeSpan.FromSeconds(graceSeconds));
        if (!proc.HasExited)
        {
            proc.Kill(); // Make really sure it's dead (SIGKILL=9)
        }
    }

    /// <summary>Reusable general web client.</summary>
    public static HttpClient UtilWebClient = NetworkBackendUtils.MakeHttpClient();

    /// <summary>Downloads a file from a given URL and saves it to a given filepath.</summary>
    public static async Task DownloadFile(string url, string filepath, Action<long, long, long> progressUpdate, CancellationTokenSource cancel = null, string altUrl = null, string verifyHash = null, Dictionary<string, string> headers = null)
    {
        altUrl ??= url;
        cancel ??= new();
        using CancellationTokenSource combinedCancel = CancellationTokenSource.CreateLinkedTokenSource(Program.GlobalProgramCancel, cancel.Token);
        Directory.CreateDirectory(Path.GetDirectoryName(filepath));
        using FileStream writer = File.OpenWrite(filepath);
        HttpRequestMessage request = new(HttpMethod.Get, url);
        if (headers is not null)
        {
            foreach ((string key, string value) in headers)
            {
                request.Headers.Add(key, value);
            }
        }
        using HttpResponseMessage response = await UtilWebClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, Program.GlobalProgramCancel);
        long length = response.Content.Headers.ContentLength ?? 0;
        ConcurrentQueue<byte[]> chunks = new();
        ConcurrentQueue<(long, long, long, bool)> progUpdates = new();
        if (response.StatusCode != HttpStatusCode.OK)
        {
            throw new SwarmReadableErrorException($"Failed to download {altUrl}: got response code {(int)response.StatusCode} {response.StatusCode}");
        }
        using Stream dlStream = await response.Content.ReadAsStreamAsync();
        Task loadData = Task.Run(async () =>
        {
            try
            {
                byte[] buffer = new byte[Math.Min(length + 1024, 1024 * 1024 * 64)]; // up to 64 megabytes, just grab as big a chunk as we can at a time
                int nextOffset = 0;
                while (true)
                {
                    using CancellationTokenSource delayCleanup = new();
                    Task<int> readTask = Task.Run(async () => await dlStream.ReadAsync(buffer.AsMemory(nextOffset), combinedCancel.Token));
                    Task waiting = Task.Delay(TimeSpan.FromMinutes(2), delayCleanup.Token);
                    Task reading = Task.Run(async () => await readTask);
                    Task first = await Task.WhenAny(waiting, reading);
                    if (first == waiting)
                    {
                        Logs.Warning($"Download from '{altUrl}' has had no update for 2 minutes. Download may be failing. Will wait 3 more minutes and consider failed if it exceeds 5 total minutes.");
                        Task waiting2 = Task.Delay(TimeSpan.FromMinutes(3), delayCleanup.Token);
                        Task second = await Task.WhenAny(waiting2, reading);
                        if (second == waiting2)
                        {
                            chunks.Enqueue(null);
                            throw new SwarmReadableErrorException("Download timed out, 5 minutes with no new data over stream.");
                        }
                        Logs.Info($"Download progressed before timeout, continuing as normal (received {new MemoryNum(await readTask)}).");
                    }
                    delayCleanup.Cancel();
                    int read = await readTask;
                    if (read <= 0)
                    {
                        if (nextOffset > 0)
                        {
                            chunks.Enqueue(buffer[..nextOffset]);
                        }
                        chunks.Enqueue(null);
                        break;
                    }
                    if (nextOffset + read < 1024 * 1024 * 5)
                    {
                        nextOffset += read;
                    }
                    else
                    {
                        chunks.Enqueue(buffer[..(nextOffset + read)]);
                        nextOffset = 0;
                    }
                    if (cancel is not null && cancel.IsCancellationRequested)
                    {
                        chunks.Enqueue(null);
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Download from '{altUrl}' failed in loadData with internal exception: {ex.ReadableString()}");
                chunks.Enqueue(null);
                throw;
            }
        });
        void removeFile()
        {
            writer.Dispose();
            File.Delete(filepath);
        }
        Task saveChunks = Task.Run(async () =>
        {
            try
            {
                long progress = 0;
                long startTime = Environment.TickCount64;
                long lastUpdate = startTime;
                SHA256 sha256 = SHA256.Create();
                while (true)
                {
                    if (chunks.TryDequeue(out byte[] chunk))
                    {
                        if (chunk is null)
                        {
                            Logs.Verbose($"Download {altUrl} completed with {progress} bytes.");
                            progUpdates.Enqueue((progress, length, 0, true));
                            if (length != 0 && progress != length)
                            {
                                removeFile();
                                if (cancel is not null && cancel.IsCancellationRequested)
                                {
                                    throw new TaskCanceledException($"Download {altUrl} was cancelled.");
                                }
                                throw new SwarmReadableErrorException($"Download {altUrl} failed: expected {length} bytes but got {progress} bytes.");
                            }
                            sha256.TransformFinalBlock([], 0, 0);
                            byte[] hash = sha256.Hash;
                            string hashStr = BytesToHex(hash).ToLowerFast();
                            Logs.Verbose($"Raw file hash for {altUrl} is {hashStr}");
                            if (verifyHash is not null && hashStr != verifyHash.ToLowerFast())
                            {
                                removeFile();
                                throw new SwarmReadableErrorException($"Download {altUrl} failed: expected SHA256 hash {verifyHash} but got {hashStr}.");
                            }
                            break;
                        }
                        progress += chunk.Length;
                        long timeNow = Environment.TickCount64;
                        if (timeNow - lastUpdate > 1000 && chunks.Count < 3)
                        {
                            long bytesPerSecond = progress * 1000 / (timeNow - startTime);
                            Logs.Verbose($"Download {altUrl} now at {new MemoryNum(progress)} / {new MemoryNum(length)}... {(progress / (double)length) * 100:00.0}% ({new MemoryNum(bytesPerSecond)} per sec)");
                            progUpdates.Enqueue((progress, length, bytesPerSecond, false));
                            lastUpdate = timeNow;
                        }
                        sha256.TransformBlock(chunk, 0, chunk.Length, null, 0);
                        await writer.WriteAsync(chunk, combinedCancel.Token);
                    }
                    else
                    {
                        await Task.Delay(TimeSpan.FromSeconds(0.1), combinedCancel.Token);
                    }
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Download from '{altUrl}' failed in saveChunks with internal exception: {ex.ReadableString()}");
                removeFile();
                throw;
            }
        });
        Task sendUpdates = Task.Run(async () =>
        {
            try
            {
                if (progressUpdate is null)
                {
                    return;
                }
                progressUpdate(0, length, 0);
                while (true)
                {
                    if (progUpdates.TryDequeue(out (long, long, long, bool) update))
                    {
                        progressUpdate(update.Item1, update.Item2, update.Item3);
                        if (update.Item4)
                        {
                            break;
                        }
                    }
                    else
                    {
                        await Task.Delay(TimeSpan.FromSeconds(0.1), combinedCancel.Token);
                    }
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Download from '{altUrl}' failed in sendUpdates with internal exception: {ex.ReadableString()}");
                throw;
            }
        });
        await Task.WhenAll(loadData, saveChunks, sendUpdates);
    }

    /// <summary>Converts a byte array to a hexadecimal string.</summary>
    public static string BytesToHex(byte[] raw)
    {
        static char getHexChar(int val) => (char)((val < 10) ? ('0' + val) : ('a' + (val - 10)));
        char[] res = new char[raw.Length * 2];
        for (int i = 0; i < raw.Length; i++)
        {
            res[i << 1] = getHexChar((raw[i] & 0xF0) >> 4);
            res[(i << 1) + 1] = getHexChar(raw[i] & 0x0F);
        }
        return new string(res);
    }

    /// <summary>Computes the SHA 256 hash of a byte array and returns it as plaintext.</summary>
    public static string HashSHA256(byte[] raw)
    {
        return BytesToHex(SHA256.HashData(raw));
    }

    /// <summary>Smart clean combination of two paths in a way that allows B or C to be an absolute path.</summary>
    public static string CombinePathWithAbsolute(string a, string b, string c) => CombinePathWithAbsolute(CombinePathWithAbsolute(a, b), c);

    /// <summary>Smart clean combination of two paths in a way that allows B to be an absolute path.</summary>
    public static string CombinePathWithAbsolute(string a, string b)
    {
        if (b.StartsWith('/') || (b.Length > 2 && b[1] == ':') || b.StartsWith("\\\\"))
        {
            return b;
        }
        // Usage of '/' is always standard, but if we're exclusively using '\' windows backslashes in input, preserve them for the purposes of this method.
        char separator = (a.Contains('/') || b.Contains('/')) ? '/' : Path.DirectorySeparatorChar;
        if (a.EndsWith(separator))
        {
            return $"{a}{b}";
        }
        string result = $"{a}{separator}{b}";
        while (result.Contains($"{separator}{separator}"))
        {
            result = result.Replace($"{separator}{separator}", $"{separator}");
        }
        return result;
    }

    /// <summary>Rounds a number to the given precision.</summary>
    public static double RoundToPrecision(double val, double prec)
    {
        return Math.Round(val / prec) * prec;
    }

    /// <summary>Modifies a width/height resolution to get the nearest valid resolution for the model's megapixel target scale, and rounds to a factor of x64.</summary>
    public static (int, int) ResToModelFit(int width, int height, T2IModel model)
    {
        int modelWid = model.StandardWidth <= 0 ? width : model.StandardWidth;
        int modelHei = model.StandardHeight <= 0 ? height : model.StandardHeight;
        return ResToModelFit(width, height, modelWid * modelHei);
    }

    /// <summary>Modifies a width/height resolution to get the nearest valid resolution for the given megapixel target scale, and rounds to a factor of x64.</summary>
    public static (int, int) ResToModelFit(int width, int height, int mpTarget, int precision = 64)
    {
        int mp = width * height;
        double scale = Math.Sqrt(mpTarget / (double)mp);
        int newWid = (int)RoundToPrecision(width * scale, precision);
        int newHei = (int)RoundToPrecision(height * scale, precision);
        return (newWid, newHei);
    }

    /// <summary>Gets a dense but trimmed string representation of JSON data, for debugging.</summary>
    public static string ToDenseDebugString(this JToken jData, bool noSpacing = false, int partCharLimit = 256, string spaces = "")
    {
        if (jData is null)
        {
            return null;
        }
        if (jData is JObject jObj)
        {
            string subSpaces = spaces + "    ";
            string resultStr = jObj.Properties().Select(v => $"\"{v.Name}\": {v.Value.ToDenseDebugString(noSpacing, partCharLimit, subSpaces)}").JoinString(", ");
            if (resultStr.Length <= 50 || noSpacing)
            {
                return "{ " + resultStr + " }";
            }
            return "{\n" + subSpaces + resultStr + "\n" + spaces + "}";
        }
        else if (jData is JArray jArr)
        {
            string subSpaces = spaces + "    ";
            string resultStr = jArr.Select(v => v.ToDenseDebugString(noSpacing, partCharLimit, subSpaces)).JoinString(", ");
            if (resultStr.Length == 0)
            {
                return "[ ]";
            }
            if (resultStr.Length <= 50 || noSpacing)
            {
                return $"[ {resultStr} ]";
            }
            return $"[\n{subSpaces}{resultStr}\n{spaces}]";
        }
        else
        {
            if (jData.Type == JTokenType.Null)
            {
                return "null";
            }
            else if (jData.Type == JTokenType.Integer || jData.Type == JTokenType.Float || jData.Type == JTokenType.Boolean)
            {
                return jData.ToString();
            }
            string val = jData.ToString();
            if (val.Length > partCharLimit - 3)
            {
                val = val[..(partCharLimit - 3)] + "...";
            }
            val = val.Replace("\\", "\\\\").Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t").Replace("\"", "\\\"");
            return $"\"{val}\"";
        }
    }

    /// <summary>Quick helper to nuke old pycaches, because python leaves them lying around and does not clean up after itself :(
    /// Useful for removing old python folders that have been removed from git.</summary>
    public static void RemoveBadPycacheFrom(string path)
    {
        try
        {
            string potentialCache = $"{path}/__pycache__/";
            if (!Directory.Exists(potentialCache))
            {
                return;
            }
            string[] files = Directory.GetFileSystemEntries(potentialCache);
            if (files.Any(f => !f.EndsWith(".pyc"))) // Safety backup: if this cache has non-pycache files, we can't safely delete it.
            {
                return;
            }
            foreach (string file in files)
            {
                File.Delete(file);
            }
            Directory.Delete(potentialCache);
            if (Directory.EnumerateFileSystemEntries(path).IsEmpty())
            {
                Directory.Delete(path);
            }
        }
        catch (Exception ex)
        {
            Logs.Debug($"Failed to remove bad pycache from {path}: {ex.ReadableString()}");
        }
    }

    /// <summary>Tries to read the local IP address, if possible. Returns null if not found. Value may be wrong or misleading.</summary>
    public static string GetLocalIPAddress()
    {
        try
        {
            IPHostEntry host = Dns.GetHostEntry(Dns.GetHostName());
            List<string> result = [];
            foreach (var ip in host.AddressList)
            {
                if (ip.AddressFamily == AddressFamily.InterNetwork && !$"{ip}".EndsWith(".1"))
                {
                    result.Add($"http://{ip}:{Program.ServerSettings.Network.Port}");
                }
            }
            if (result.Any())
            {
                return result.JoinString(", ");
            }
        }
        catch (Exception ex)
        {
            Logs.Debug($"Failed to get local IP address: {ex.ReadableString()}");
        }
        return null;
    }

    /// <summary>Encourage the Garbage Collector to clean up memory.</summary>
    public static void QuickGC()
    {
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Optimized, false, false);
    }

    /// <summary>Cause an immediate aggressive RAM cleanup.</summary>
    public static void CleanRAM()
    {
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Aggressive, true, true);
    }

    public static string DotNetVersMissing = null;

    /// <summary>Check if a dotnet version is installed, and, if not, show a log message and write to a utility flag.</summary>
    public static void CheckDotNet(string vers)
    {
        Task.Run(() =>
        {
            try
            {
                Process p = Process.Start(new ProcessStartInfo("dotnet", "--list-sdks") { RedirectStandardOutput = true, UseShellExecute = false });
                p.WaitForExit();
                string output = p.StandardOutput.ReadToEnd();
                if (!output.Contains($"{vers}.0."))
                {
                    void Warn()
                    {
                        Logs.Warning($"You do not seem to have DotNET {vers} installed - this will be required in a future version of SwarmUI.");
                        Logs.Warning($"Please install DotNET SDK {vers}.0 from https://dotnet.microsoft.com/en-us/download/dotnet/{vers}.0");
                    }
                    DotNetVersMissing = vers;
                    Warn();
                    Task.Delay(TimeSpan.FromSeconds(2)).ContinueWith(_ => Warn());
                }
            }
            catch (Exception ex)
            {
                Logs.Debug($"Failed to check dotnet version: {ex.ReadableString()}");
            }
        });
    }

    /// <summary>Helper to locate a valid Ffmpeg executable.</summary>
    public static Lazy<string> FfmegLocation = new(() =>
    {
        try
        {
            string result = QuickRunProcess("ffmpeg", ["-version"]).Result;
            if (!string.IsNullOrWhiteSpace(result) && result.Contains("ffmpeg version"))
            {
                Logs.Debug($"Will use global 'ffmpeg' install");
                return "ffmpeg";
            }
        }
        catch (Exception) { }
        string comfyCopyPath = "dlbackend/comfy/python_embeded/Lib/site-packages/imageio_ffmpeg/binaries";
        if (Directory.Exists(comfyCopyPath))
        {
            string exe = Directory.EnumerateFiles(comfyCopyPath, "*.exe").Where(c => c.Contains("ffmpeg-win")).FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(exe))
            {
                Logs.Debug($"Will use comfy copy of ffmpeg at '{exe}'");
                return exe;
            }
        }
        Logs.Warning($"No ffmpeg available, some video-related features will not work. Install ffmpeg and ensure it is in your PATH to enable these features.");
        return null;
    }, true);

    /// <summary>MultiSemaphoreSet to prevent git calls in the same directory from overlapping.</summary>
    public static MultiSemaphoreSet<string> GitOverlapLocks = new(32);

    /// <summary>Quick and simple run a process async and get the result.</summary>
    public static async Task<string> QuickRunProcess(string process, string[] args, string workingDirectory = null)
    {
        ProcessStartInfo start = new(process, args)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        if (workingDirectory is not null)
        {
            start.WorkingDirectory = workingDirectory;
        }
        Process p = Process.Start(start);
        Task<string> stdOutRead = p.StandardOutput.ReadToEndAsync();
        Task<string> stdErrRead = p.StandardError.ReadToEndAsync();
        await p.WaitForExitAsync(Program.GlobalProgramCancel);
        string stdout = await stdOutRead;
        string stderr = await stdErrRead;
        string result = stdout;
        if (!string.IsNullOrWhiteSpace(stderr))
        {
            result = $"{stdout}\n{stderr}";
        }
        result = result.Trim();
        return result;
    }

    /// <summary>Launch, run, and return the text output of, a 'git' command input.</summary>
    public static async Task<string> RunGitProcess(string args, string dir = null, bool canRetry = true)
    {
        dir ??= Environment.CurrentDirectory;
        dir = Path.GetFullPath(dir);
        ProcessStartInfo start = new("git", args)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            WorkingDirectory = dir
        };
        start.Environment["GIT_TERMINAL_PROMPT"] = "0";
        SemaphoreSlim semaphore = GitOverlapLocks.GetLock(dir);
        await semaphore.WaitAsync();
        try
        {
            Process p = Process.Start(start);
            Task<string> stdOutRead = p.StandardOutput.ReadToEndAsync();
            Task<string> stdErrRead = p.StandardError.ReadToEndAsync();
            async Task<string> result()
            {
                string stdout = await stdOutRead;
                string stderr = await stdErrRead;
                string result = stdout;
                if (!string.IsNullOrWhiteSpace(stderr))
                {
                    result = $"{stdout}\n{stderr}";
                }
                result = result.Trim();
                if (canRetry && result.Contains("detected dubious ownership in repository at") && result.Contains("git config --global --add safe.directory"))
                {
                    Logs.Warning($"Git process '{args}' in '{dir}' had a safe.directory warning, will try to autofix -- {result}");
                    semaphore.Release();
                    semaphore = null;
                    string safeDirResponse = await RunGitProcess($"config --global --add safe.directory {dir}", dir, false);
                    Logs.Debug($"Git Safe.Directory response: {safeDirResponse}");
                    result = await RunGitProcess(args, dir, false);
                }
                return result;
            }
            Task exitTask = p.WaitForExitAsync(Program.GlobalProgramCancel);
            Task finished = await Task.WhenAny(exitTask, Task.Delay(TimeSpan.FromMinutes(1)));
            if (finished == exitTask)
            {
                return await result();
            }
            p.Refresh();
            if (p.HasExited)
            {
                return await result();
            }
            Logs.Warning($"Git process '{args}' in '{dir}' has been running for over a minute, something may have gone wrong, allowing 1 more minute to finish...");
            finished = await Task.WhenAny(exitTask, Task.Delay(TimeSpan.FromMinutes(1)));
            if (finished == exitTask)
            {
                return await result();
            }
            p.Refresh();
            if (p.HasExited)
            {
                return await result();
            }
            Logs.Error($"Git process '{args}' in '{dir}' has been running for over 2 minutes - something has gone wrong. Will background.");
            NetworkBackendUtils.ReportLogsFromProcess(p, "failed git process", "failed-git");
            return "Failed - process never finished in time";
        }
        finally
        {
            semaphore?.Release();
        }
    }

    /// <summary>Deletes a file 'cleanly' by sending it to the recycle bin.</summary>
    public static void SendFileToRecycle(string file)
    {
        try
        {
            FileSystem.DeleteFile(file, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin, UICancelOption.ThrowException);
        }
        catch (Exception ex)
        {
            Logs.Debug($"Failed to send file to recycle bin: {ex.ReadableString()}");
            File.Delete(file);
        }
    }

    /// <summary>Gets an appropriately readable exception message string, showing the stacktrace for internal errors.</summary>
    public static string ReadableString(this Exception ex)
    {
        if (ex is SwarmReadableErrorException)
        {
            return ex.Message;
        }
        else if (ex is AggregateException ae && ae.InnerException is SwarmReadableErrorException inner)
        {
            return inner.Message;
        }
        return $"{ex}";
    }

    /// <summary>Hashes a password for storage.</summary>
    public static string HashPassword(string username, string password)
    {
        if (password.Length > 512) // Sanity cap
        {
            throw new SwarmReadableErrorException("Password is too long.");
        }
        if (password.StartsWith("__swarmdoprehash:"))
        {
            password = password["__swarmdoprehash:".Length..];
            password = BytesToHex(SHA256.HashData(password.EncodeUTF8())).ToLowerFast();
        }
        byte[] salt = RandomNumberGenerator.GetBytes(128 / 8);
        string borkedPw = $"*SwarmHashedPw:{username}:{password}*";
        // 10k is low enough that the swarm server won't thrash its CPU if it has to hash passwords often (eg somebody spamming bad auth requests), but high enough to at least be a bit of a barrier to somebody that yoinks the raw hashes
        byte[] hashed = KeyDerivation.Pbkdf2(password: borkedPw, salt: salt, prf: KeyDerivationPrf.HMACSHA256, iterationCount: 10_000, numBytesRequested: 256 / 8);
        return "swarmpw_v1:" + Convert.ToBase64String(salt) + ":" + Convert.ToBase64String(hashed);
    }

    /// <summary>Returns whether the given password matches the stored hash.</summary>
    public static bool CompareHashedPassword(string username, string password, string hashed)
    {
        if (password.StartsWith("__swarmdoprehash:"))
        {
            password = password["__swarmdoprehash:".Length..];
            password = BytesToHex(SHA256.HashData(password.EncodeUTF8())).ToLowerFast();
        }
        int version = 1; // Legacy version had no prefix, so presume v1
        if (hashed.StartsWith("swarmpw_"))
        {
            string prefix = hashed.BeforeAndAfter(':', out string rest);
            if (prefix == "swarmpw_v1")
            {
                version = 1;
            }
            else
            {
                throw new Exception("$Unknown password hash version: " + prefix);
            }
            hashed = rest;
        }
        string saltRaw = hashed.BeforeAndAfter(':', out string hashRaw);
        byte[] salt = Convert.FromBase64String(saltRaw);
        byte[] hash = Convert.FromBase64String(hashRaw);
        string borkedPw = $"*SwarmHashedPw:{username}:{password}*";
        byte[] hashedAttempt;
        if (version == 1)
        {
            hashedAttempt = KeyDerivation.Pbkdf2(password: borkedPw, salt: salt, prf: KeyDerivationPrf.HMACSHA256, iterationCount: 10_000, numBytesRequested: 256 / 8);
        }
        else
        {
            throw new UnreachableException();
        }
        if (hashedAttempt.Length != hash.Length)
        {
            throw new SwarmReadableErrorException("Password hash length mismatch, impl issue?");
        }
        uint diff = 0; // Slow equals check
        for (int i = 0; i < hash.Length; i++)
        {
            diff |= (uint)(hash[i] ^ hashedAttempt[i]);
        }
        return diff == 0;
    }

    /// <summary>Splits a standard CSV file - that is, comma separated values that allow for quoted chunks with commas inside.</summary>
    public static string[] SplitStandardCsv(string input)
    {
        List<string> strs = [];
        bool inQuotes = false;
        StringBuilder current = new(64);
        for (int i = 0; i < input.Length; i++)
        {
            char c = input[i];
            if (c == '\\')
            {
                i++;
            }
            else if (c == ',' && !inQuotes)
            {
                strs.Add(current.ToString());
                current.Clear();
                if (i + 1 < input.Length && input[i + 1] == '"')
                {
                    inQuotes = true;
                    i++;
                }
            }
            else if (c == '"' && inQuotes)
            {
                if (i + 1 < input.Length && input[i + 1] == '"') // Cursed escape hack in some csvs
                {
                    current.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = false;
                }
            }
            else
            {
                current.Append(c);
            }
        }
        strs.Add(current.ToString());
        return [.. strs];
    }
}
