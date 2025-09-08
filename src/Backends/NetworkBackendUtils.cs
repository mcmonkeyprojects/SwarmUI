﻿using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Hardware.Info;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.Utils;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Runtime.InteropServices;

namespace SwarmUI.Backends;

/// <summary>General utility for backends that self-start or use network APIs.</summary>
public static class NetworkBackendUtils
{
    #region Network
    /// <summary>Create and preconfigure a basic <see cref="HttpClient"/> instance to make web requests with.</summary>
    public static HttpClient MakeHttpClient(int timeoutMinutes = 10)
    {
        HttpClient client = new(new SocketsHttpHandler() { PooledConnectionLifetime = TimeSpan.FromMinutes(10), MaxConnectionsPerServer = 1000 });
        client.DefaultRequestHeaders.UserAgent.ParseAdd($"SwarmUI/{Utilities.Version}");
        client.Timeout = TimeSpan.FromMinutes(timeoutMinutes);
        return client;
    }

    /// <summary>Ensures an old http client is disposed, with a time delay before it hits to be safe.</summary>
    public static void ClearOldHttpClient(HttpClient client)
    {
        if (client is null)
        {
            return;
        }
        Utilities.RunCheckedTask(async () =>
        {
            await Task.Delay(TimeSpan.FromMinutes(2), Program.GlobalProgramCancel);
            client.Dispose();
        });
    }

    /// <summary>Parses an <see cref="HttpResponseMessage"/> into a JSON object result.</summary>
    /// <exception cref="SwarmReadableErrorException">Thrown when the server returns invalid data (error code or other non-JSON).</exception>
    /// <exception cref="NotImplementedException">Thrown when an invalid JSON type is requested.</exception>
    public static async Task<JType> Parse<JType>(HttpResponseMessage message) where JType : class
    {
        string content = await message.Content.ReadAsStringAsync();
        if (content.StartsWith("500 Internal Server Error"))
        {
            throw new SwarmReadableErrorException($"Server returned 500 Internal Server Error, something went wrong: {content}");
        }
        else if (content.Length == 0 && typeof(JType) == typeof(JObject))
        {
            throw new SwarmReadableErrorException($"Server returned entirely empty response, something went wrong.");
        }
        try
        {
            return typeof(JType) switch
            {
                Type t when t == typeof(JObject) => JObject.Parse(content) as JType,
                Type t when t == typeof(JArray) => JArray.Parse(content) as JType,
                Type t when t == typeof(string) => content as JType,
                _ => throw new NotImplementedException($"Invalid JSON type requested: {typeof(JType)}"),
            };
        }
        catch (JsonReaderException ex)
        {
            throw new SwarmReadableErrorException($"Failed to read JSON '{content}' with message: {ex.Message}");
        }
        throw new NotImplementedException();
    }

    /// <summary>Connects a client websocket to the backend.</summary>
    /// <param name="path">The path to connect on, after the '/', such as 'ws?clientId={uuid}'.</param>
    public static async Task<ClientWebSocket> ConnectWebsocket(string address, string path, Action<ClientWebSocket> configure = null)
    {
        ClientWebSocket outSocket = new();
        configure?.Invoke(outSocket);
        outSocket.Options.KeepAliveInterval = TimeSpan.FromSeconds(30);
        string scheme = address.BeforeAndAfter("://", out string addr);
        scheme = scheme == "http" ? "ws" : "wss";
        await outSocket.ConnectAsync(new Uri($"{scheme}://{addr}/{path}"), Program.GlobalProgramCancel);
        return outSocket;
    }

    /// <summary>Helper for API-by-URL backends to allow those backends to go idle automatically if connection is lost.</summary>
    public class IdleMonitor
    {
        public Thread IdleMonitorThread;

        public CancellationTokenSource IdleMonitorCancel = new();

        public AbstractT2IBackend Backend;

        public Action ValidateCall;

        public Action<BackendStatus> StatusChangeEvent;

        public void Start()
        {
            Stop();
            if (Backend.Status == BackendStatus.LOADING)
            {
                Backend.Status = BackendStatus.IDLE;
            }
            IdleMonitorThread = new Thread(IdleMonitorLoop);
            IdleMonitorThread.Start();
        }

        void SetStatus(BackendStatus status)
        {
            if (Backend.Status != status)
            {
                Backend.Status = status;
                StatusChangeEvent?.Invoke(status);
            }
        }

        public static ConcurrentDictionary<string, string> SeenErrors = [];

        public static bool ExceptionIsNonIdleable(Exception ex) => ex is FormatException;

        public void IdleMonitorLoop()
        {
            CancellationToken cancel = IdleMonitorCancel.Token;
            while (true)
            {
                try
                {
                    Task.Delay(TimeSpan.FromSeconds(5), cancel).Wait();
                }
                catch (Exception)
                {
                    return;
                }
                if (cancel.IsCancellationRequested || Program.GlobalProgramCancel.IsCancellationRequested)
                {
                    return;
                }
                if (Backend.Status != BackendStatus.RUNNING && Backend.Status != BackendStatus.IDLE)
                {
                    continue;
                }
                try
                {
                    ValidateCall();
                    if (Backend.Status != BackendStatus.RUNNING && Backend.Status != BackendStatus.IDLE)
                    {
                        continue;
                    }
                    SetStatus(BackendStatus.RUNNING);
                }
                catch (Exception ex)
                {
                    if (ExceptionIsNonIdleable(ex))
                    {
                        Logs.Error($"Backend {Backend.BackendData.ID} failed to validate: {ex.ReadableString()}");
                        SetStatus(BackendStatus.ERRORED);
                        return;
                    }
                    string error = $"{ex.GetType().Name}: {ex.Message}";
                    if (SeenErrors.TryAdd(error, error))
                    {
                        Logs.Debug($"Backend {Backend.BackendData.ID} idling because: {error}");
                    }
                    SetStatus(BackendStatus.IDLE);
                }
            }
        }

        public void Stop()
        {
            if (IdleMonitorThread is not null)
            {
                IdleMonitorCancel.Cancel();
                IdleMonitorCancel = new();
                IdleMonitorThread = null;
            }
        }
    }
    #endregion

    #region Self Start
    /// <summary>Returns true if the path given looks valid as a start-script for a backend, or false if not with an error message explaining why.</summary>
    public static bool IsValidStartPath(string backendLabel, string path, string ext)
    {
        if (path.Length < 5)
        {
            return false;
        }
        if (ext != "sh" && ext != "bat" && ext != "py")
        {
            Logs.Error($"Refusing init of {backendLabel} with non-script target. Please verify your start script location. Path was '{path}', which does not end in the expected 'py', 'bat', or 'sh'.");
            return false;
        }
        string subPath = path[1] == ':' ? path[2..] : path;
        subPath = subPath.Replace("/@", "/"); // Allow an exception for eg `Programs/@comfyorgcomfyui` which Comfy Desktop uses for some reason
        if (Utilities.FilePathForbidden.ContainsAnyMatch(subPath))
        {
            Logs.Error($"Failed init of {backendLabel} with script target '{path}' because that file path contains invalid characters ( {Utilities.FilePathForbidden.TrimToMatches(subPath)} ). Please verify your start script location.");
            return false;
        }
        if (!File.Exists(path))
        {
            Logs.Error($"Failed init of {backendLabel} with script target '{path}' because that file does not exist. Please verify your start script location.");
            return false;
        }
        return true;
    }

    /// <summary>Internal tracking value of what port to use next.</summary>
    public static volatile int NextPort = 7820;

    /// <summary>Get the next available port to use, as an incremental value with checks against port usage.</summary>
    public static int GetNextPort()
    {
        int port = Interlocked.Increment(ref NextPort);
        while (Utilities.IsPortTaken(port))
        {
            port = Interlocked.Increment(ref NextPort);
        }
        return port;
    }

    /// <summary>Tries to identify the lib/site-packages/ folder that will be used for a given start script.</summary>
    public static string GetProbableLibFolderFor(string script)
    {
        string path = script.Replace('\\', '/');
        string dir = Path.GetDirectoryName(path);
        if (File.Exists($"{dir}/venv/Scripts/python.exe"))
        {
            return Path.GetFullPath($"{dir}/venv/Lib/site-packages/");
        }
        if (File.Exists($"{dir}/../python_embeded/python.exe"))
        {
            return Path.GetFullPath($"{dir}/../python_embeded/Lib/site-packages/");
        }
        if (File.Exists($"{dir}/venv/bin/python3"))
        {
            //return Path.GetFullPath($"{dir}/venv/lib/");
            // sub-folder named like "python3.10"
            string[] subDirs = Directory.GetDirectories($"{dir}/venv/lib/");
            foreach (string subDir in subDirs)
            {
                if (subDir.AfterLast('/').StartsWith("python"))
                {
                    return Path.GetFullPath($"{subDir}/site-packages/");
                }
            }
        }
        try
        {
            ProcessStartInfo start = new()
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = dir
            };
            ConfigurePythonExeFor(script, "folder-finder", start, out _, out string forcePrior);
            start.Arguments = $"{forcePrior} -s -c \"import sysconfig; print(sysconfig.get_path('purelib'))\"".Trim();
            Process process = Process.Start(start);
            process.WaitForExitAsync(Program.GlobalProgramCancel).Wait();
            string output = process.StandardOutput.ReadToEnd().Trim();
            string errOut = process.StandardError.ReadToEnd().Trim();
            Logs.Debug($"Ran python fallback folder-finder '{start.FileName}' '{start.Arguments}', result is: {output}, errOut is {errOut}");
            if (Directory.Exists(output))
            {
                return output;
            }
            Logs.Debug($"Output is not a valid folder.");
        }
        catch (Exception ex)
        {
            Logs.Debug($"Failed to find lib folder for {script}: {ex.ReadableString()}");
        }
        return null;
    }

    /// <summary>Configures python execution for a given python start script.</summary>
    public static void ConfigurePythonExeFor(string script, string nameSimple, ProcessStartInfo start, out string preArgs, out string forcePrior)
    {
        void AddPath(string path)
        {
            start.Environment["PATH"] = PythonLaunchHelper.ReworkPythonPaths(path);
            Logs.Debug($"({nameSimple} launch) Adding path {path}");
        }
        string path = script.Replace('\\', '/');
        string dir = Path.GetDirectoryName(path);
        start.WorkingDirectory = dir;
        preArgs = "-s " + path.AfterLast("/");
        forcePrior = "";
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            if (File.Exists($"{dir}/venv/Scripts/python.exe"))
            {
                start.FileName = Path.GetFullPath($"{dir}/venv/Scripts/python.exe");
                AddPath(Path.GetFullPath($"{dir}/venv"));
            }
            else if (File.Exists($"{dir}/../python_embeded/python.exe"))
            {
                start.FileName = Path.GetFullPath($"{dir}/../python_embeded/python.exe");
                start.WorkingDirectory = Path.GetFullPath($"{dir}/..");
                preArgs = "-s " + Path.GetFullPath(path)[(start.WorkingDirectory.Length + 1)..];
                AddPath(Path.GetFullPath($"{dir}/../python_embeded"));
            }
            else
            {
                start.FileName = "python";
            }
            if (File.Exists($"{dir}/zluda/zluda.exe"))
            {
                string pythonexe = start.FileName;
                start.FileName = Path.GetFullPath($"{dir}/zluda/zluda.exe");
                preArgs = $"-- {pythonexe} {preArgs}".Trim();
                forcePrior = $"-- {pythonexe}";
            }
        }
        else
        {
            if (File.Exists($"{dir}/venv/bin/python3"))
            {
                start.FileName = Path.GetFullPath($"{dir}/venv/bin/python3");
                AddPath(Path.GetFullPath($"{dir}/venv"));
            }
            else
            {
                start.FileName = "python3";
            }
        }
    }

    /// <summary>Starts a self-start backend based on the user-configuration and backend-specifics provided.</summary>
    public static Task DoSelfStart(string startScript, AbstractT2IBackend backend, string nameSimple, string identifier, string gpuId, string extraArgs, Func<bool, Task> initInternal, Action<int, Process> takeOutput, bool autoRestart = false)
    {
        return DoSelfStart(startScript, nameSimple, identifier, gpuId, extraArgs, status => backend.Status = status, async (b) => { await initInternal(b); return backend.Status == BackendStatus.RUNNING; }, takeOutput, () => backend.Status, a => backend.OnShutdown += a, autoRestart, backend.AddLoadStatus);
    }

    /// <summary>Starts a self-start backend based on the user-configuration and backend-specifics provided.</summary>
    public static async Task DoSelfStart(string startScript, string nameSimple, string identifier, string gpuId, string extraArgs, Action<BackendStatus> reviseStatus, Func<bool, Task<bool>> initInternal, Action<int, Process> takeOutput, Func<BackendStatus> getStatus, Action<Action> addShutdownEvent, bool autoRestart = false, Action<string> addLoadStatus = null)
    {
        addLoadStatus ??= Logs.Debug;
        async Task launch()
        {
            if (Program.GlobalProgramCancel.IsCancellationRequested)
            {
                return;
            }
            if (string.IsNullOrWhiteSpace(startScript))
            {
                addLoadStatus($"Cancelling start of {nameSimple} as it has an empty start script.");
                reviseStatus(BackendStatus.DISABLED);
                return;
            }
            addLoadStatus($"Requested generic launch of {startScript} on GPU {gpuId} from {nameSimple}");
            string path = startScript.Replace('\\', '/');
            string ext = path.AfterLast('.');
            if (!IsValidStartPath(nameSimple, path, ext))
            {
                reviseStatus(BackendStatus.ERRORED);
                return;
            }
            int port = GetNextPort();
            string dir = Path.GetDirectoryName(path);
            ProcessStartInfo start = new()
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = dir
            };
            PythonLaunchHelper.CleanEnvironmentOfPythonMess(start, $"({nameSimple} launch) ");
            start.Environment["CUDA_VISIBLE_DEVICES"] = $"{gpuId}";
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                start.Environment["HIP_VISIBLE_DEVICES"] = $"{gpuId}";
            }
            start.Environment["ROCR_VISIBLE_DEVICES"] = $"{gpuId}";
            string preArgs = "";
            string postArgs = extraArgs.Replace("{PORT}", $"{port}").Trim();
            if (path.EndsWith(".py"))
            {
                ConfigurePythonExeFor(startScript, nameSimple, start, out preArgs, out _);
                addLoadStatus($"({nameSimple} launch) Will use python: {start.FileName}");
            }
            else
            {
                addLoadStatus($"({nameSimple} launch) Will shellexec");
                start.FileName = Path.GetFullPath(path);
            }
            start.Arguments = $"{preArgs} {postArgs}".Trim();
            BackendStatus status = BackendStatus.LOADING;
            reviseStatus(status);
            Process runningProcess = new() { StartInfo = start };
            takeOutput(port, runningProcess);
            addLoadStatus("Will start process...");
            runningProcess.Start();
            Logs.Init($"Self-Start {nameSimple} on port {port} is loading...");
            bool everLoaded = false;
            Action onFail = autoRestart ? () =>
            {
                if (Program.GlobalProgramCancel.IsCancellationRequested)
                {
                    return;
                }
                if (everLoaded)
                {
                    Logs.Error($"Self-Start {nameSimple} on port {port} failed. Restarting per configuration AutoRestart=true...");
                    float memSelector(HardwareInfo x) => 1 - (x.MemoryStatus.AvailablePhysical / (float)x.MemoryStatus.TotalPhysical);
                    (HardwareInfo, float)[] info = [.. SystemStatusMonitor.HardwareInfoQueue.Select(x => (x, memSelector(x)))];
                    Logs.Debug($"Memory usage before crash was: {info.Reverse().Take(5).Select(x => $"{x.Item2 * 100:#.0}%").JoinString(", ")}");
                    (HardwareInfo, float) match = info.FirstOrDefault(x => x.Item2 > 0.8);
                    if (match.Item1 is not null)
                    {
                        Logs.Warning("\n\n");
                        Logs.Warning($"Your system memory usage exceeded {match.Item2 * 100:#.0}% just before the backend process failed. This might indicate a memory overload.");
                        ulong virtualMem = match.Item1.MemoryStatus.TotalVirtual - match.Item1.MemoryStatus.TotalPhysical;
                        float gigs = new MemoryNum((long)virtualMem).GiB;
                        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) // Windows API reports virtual memory weirdly, so just sub in page file here, seems to be more accurate
                        {
                            virtualMem = match.Item1.MemoryStatus.TotalPageFile;
                            gigs = new MemoryNum((long)virtualMem).GiB;
                        }
                        if (gigs < 32 || virtualMem * 2 < match.Item1.MemoryStatus.TotalPhysical)
                        {
                            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                            {
                                Logs.Warning($"You appear to have a small or disabled pagefile ({gigs:0.#} GiB). You should enable/expand it to prevent memory oveloads. See https://www.windowscentral.com/software-apps/windows-11/how-to-manage-virtual-memory-on-windows-11 for more info. Size it to at least 16GiB (larger is better, 32GiB+ recommended).");
                            }
                            else
                            {
                                Logs.Warning($"You appear to have a small or disabled system swapfile ({gigs:0.#} GiB). Please research how to enable one on your OS, and size it to at least 16GiB (larger is better, 32GiB+ recommended).");
                            }
                        }
                        else
                        {
                            Logs.Warning($"You appear to have a sufficient pagefile ({gigs:0.#} GiB), so you might have too many background processes, or you might just be trying to run too much.");
                            Logs.Warning("Consider closing background processes, or greatly expanding your pagefile size.");
                            Logs.Warning("Or, reduce the size of what you're trying to run. If you're running an FP16 or FP8 model, consider a quantized variant like GGUF Q4.");
                        }
                        Logs.Warning("\n\n");
                    }
                    Utilities.RunCheckedTask(async () =>
                    {
                        await Task.Delay(TimeSpan.FromSeconds(2), Program.GlobalProgramCancel);
                        await launch();
                    });
                }
                else
                {
                    Logs.Error($"Self-Start {nameSimple} on port {port} failed. AutoRestart ignored as this was an initial launch failure.");
                    status = BackendStatus.ERRORED;
                    reviseStatus(status);
                }
            } : () =>
            {
                Logs.Error($"Self-Start {nameSimple} on port {port} failed. AutoRestart disabled, treating as fatal error.");
                status = BackendStatus.ERRORED;
                reviseStatus(status);
            };
            ReportLogsFromProcess(runningProcess, $"{nameSimple}", identifier, out Action signalShutdownExpected, getStatus, s => { status = s; reviseStatus(s); }, onFail: onFail);
            addShutdownEvent?.Invoke(signalShutdownExpected);
            int checks = 0;
            while (status == BackendStatus.LOADING)
            {
                checks++;
                await Task.Delay(TimeSpan.FromSeconds(1));
                if (checks % 10 == 0)
                {
                    addLoadStatus($"{nameSimple} port {port} waiting for server...");
                }
                try
                {
                    bool alive = await initInternal(true);
                    if (alive)
                    {
                        addLoadStatus("Done! Started!");
                        Logs.Init($"Self-Start {nameSimple} on port {port} started.");
                    }
                    status = getStatus();
                }
                catch (Exception ex)
                {
                    Logs.Error($"Self-Start {nameSimple} on port {port} failed to start: {ex.ReadableString()}");
                    status = BackendStatus.ERRORED;
                    reviseStatus(status);
                    return;
                }
            }
            everLoaded = status != BackendStatus.ERRORED;
            addLoadStatus($"{nameSimple} self-start port {port} loop ending {(everLoaded ? "(should now be alive)" : "(failed?)")}");
        }
        await launch();
    }

    public static async Task RunProcessWithMonitoring(ProcessStartInfo procInfo, string nameSimple, string identifier)
    {
        procInfo.RedirectStandardOutput = true;
        procInfo.RedirectStandardError = true;
        procInfo.UseShellExecute = false;
        Process process = Process.Start(procInfo);
        ReportLogsFromProcess(process, nameSimple, identifier, out Action signalShutdownExpected, () => BackendStatus.RUNNING, _ => { }, true);
        await process.WaitForExitAsync(Program.GlobalProgramCancel);
    }

    public static void ReportLogsFromProcess(Process process, string nameSimple, string identifier, Action onFail = null)
    {
        ReportLogsFromProcess(process, nameSimple, identifier, out Action signalShutdownExpected, () => BackendStatus.RUNNING, _ => { }, true, onFail);
    }

    public static void ReportLogsFromProcess(Process process, string nameSimple, string identifier, out Action signalShutdownExpected, Func<BackendStatus> getStatus, Action<BackendStatus> setStatus, bool exitPreExpected = false, Action onFail = null)
    {
        Logs.LogTracker logTracker = new() { Identifier = identifier };
        lock (Logs.OtherTrackers)
        {
            Logs.OtherTrackers[nameSimple] = logTracker;
        }
        BackendStatus status = getStatus();
        bool isShuttingDown = exitPreExpected;
        signalShutdownExpected = () => Volatile.Write(ref isShuttingDown, true);
        bool shouldContinueErrorLine(string str)
        {
            return str.StartsWith("Traceback (") || str.Contains("Error: ") || str.StartsWith("  ");
        }
        void MonitorLoop()
        {
            try
            {
                string line;
                bool keepShowing = false;
                using StreamReader fixedReader = new(process.StandardOutput.BaseStream, Encoding.UTF8); // Force UTF-8, always
                while ((line = fixedReader.ReadLine()) != null)
                {
                    if (line.StartsWith("Traceback (") || line.StartsWith("RuntimeError: ") || line.StartsWith("Error: "))
                    {
                        keepShowing = true;
                        Logs.Warning($"[{nameSimple}/STDOUT] {line}");
                    }
                    else if (keepShowing)
                    {
                        Logs.Warning($"[{nameSimple}/STDOUT] {line}");
                        keepShowing = shouldContinueErrorLine(line);
                    }
                    else
                    {
                        Logs.Debug($"[{nameSimple}/STDOUT] {line}");
                    }
                    logTracker.Track($"[STDOUT] {line}");
                }
                status = getStatus();
                Logs.Debug($"Status of {nameSimple} after process end is {status}");
                if (status == BackendStatus.RUNNING || status == BackendStatus.LOADING)
                {
                    status = BackendStatus.ERRORED;
                    setStatus(status);
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Error in {nameSimple} monitor loop: {ex.ReadableString()}");
                setStatus(BackendStatus.ERRORED);
            }
            lock (Logs.OtherTrackers)
            {
                if (Logs.OtherTrackers.TryGetValue(nameSimple, out Logs.LogTracker tracker) && tracker == logTracker)
                {
                    Logs.OtherTrackers.Remove(nameSimple);
                }
            }
        }
        new Thread(MonitorLoop) { Name = $"SelfStart{nameSimple.Replace(' ', '_')}_Monitor" }.Start();
        async void MonitorErrLoop()
        {
            try
            {
                StringBuilder errorLog = new();
                string line;
                bool keepShowing = false;
                using StreamReader fixedReader = new(process.StandardError.BaseStream, Encoding.UTF8); // Force UTF-8, always
                while ((line = fixedReader.ReadLine()) != null)
                {
                    string lineLow = line.ToLowerFast();
                    if (lineLow.StartsWith("traceback (") || lineLow.Contains("error: "))
                    {
                        keepShowing = true;
                        Logs.Warning($"[{nameSimple}/STDERR] {line}");
                    }
                    else if (keepShowing)
                    {
                        Logs.Warning($"[{nameSimple}/STDERR] {line}");
                        keepShowing = shouldContinueErrorLine(line);
                    }
                    else
                    {
                        Logs.Debug($"[{nameSimple}/STDERR] {line}");
                    }
                    errorLog.AppendLine($"[{nameSimple}/STDERR] {line}");
                    logTracker.Track($"[STDERR] {line}");
                    if (errorLog.Length > 1024 * 50)
                    {
                        errorLog = new StringBuilder(errorLog.ToString()[(1024 * 10)..]);
                    }
                }
                if (getStatus() == BackendStatus.DISABLED)
                {
                    Logs.Info($"Self-Start {nameSimple} exited properly from disabling.");
                }
                else if (Volatile.Read(ref isShuttingDown))
                {
                    int loops = 0;
                    while (!process.HasExited && loops++ < 20 && !Program.GlobalProgramCancel.IsCancellationRequested)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(1));
                    }
                    if (!process.HasExited)
                    {
                        Logs.Info($"Self-Start {nameSimple} closed output stream without exiting - something went wrong.");
                    }
                    else if (process.ExitCode == 0)
                    {
                        Logs.Info($"Self-Start {nameSimple} exited properly.");
                    }
                    else
                    {
                        Logs.Info($"Self-Start {nameSimple} exited expectedly but with unexpected exit code {process.ExitCode}");
                    }
                }
                else
                {
                    Logs.Info($"Self-Start {nameSimple} unexpectedly exited (if something failed, change setting `LogLevel` to `Debug` to see why!)");
                    if (errorLog.Length > 0)
                    {
                        Logs.Info($"Self-Start {nameSimple} had errors before shutdown:\n{errorLog}");
                    }
                    onFail?.Invoke();
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Error in {nameSimple} error monitor loop: {ex.ReadableString()}");
            }
        }
        new Thread(MonitorErrLoop) { Name = $"SelfStart{nameSimple.Replace(' ', '_')}_MonitorErr" }.Start();
    }
    #endregion
}
