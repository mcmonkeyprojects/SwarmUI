using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;

namespace SwarmUI.Backends;

/// <summary>A special backend whose job is to spin up new backends automatically based on usage needs.</summary>
public class AutoScalingBackend : AbstractT2IBackend
{
    public class AutoScalingBackendSettings : AutoConfiguration
    {
        [ConfigComment("Auto-Scaling Backends are a WIP. Do not use this.\nBy checking this checkbox, you agree to have your entire PC deleted and your house set on fire.")]
        public bool DO_NOT_USE_THIS = false;

        [ConfigComment("Maximum number of additional backends to spin up.")]
        public int MaxBackends = 5;

        [ConfigComment("Minimum number of backends to always keep running, even if idle.")]
        public int MinBackends = 0;

        [ConfigComment("Minimum time, in minutes, between spinning up new backends.\nFor example, if set 1, then only 1 new backend per minute can be started.")]
        public double MinWaitBetweenStart = 1;

        [ConfigComment("Minimum time, in minutes, to wait after a backend fails to start before trying to start another one.")]
        public double MinWaitAfterFailure = 2;

        [ConfigComment("Minimum time, in minutes, between shutting down idle backends.\nFor example, if set 1, then only 1 backend per minute can be automatically stopped.")]
        public double MinWaitBetweenStop = 0.5;

        [ConfigComment("Minimum time, in minutes, that a backend must be idle before it can be selected for shutdown.")]
        public double MinIdleTime = 1;

        [ConfigComment("Minimum number of waiting generations before a new backend can be started.\nSelect this high enough to not be wasteful of resources, but low enough to not cause generation requests to be pending for too long.\nMust be set to at least 1, should ideally be set higher.")]
        public int MinQueuedBeforeExpand = 10;

        [ConfigComment($"File path to a shell script (normally a '.sh') that will cause a new backend to be started.\nSee <a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}Features/AutoScalingBackend.md\">docs Features/AutoScalingBackend</a> for info on how to build this script.")]
        public string StartScript = "";

        [ConfigComment("If the remote instance has an 'Authorization:' header required, specify it here.\nFor example, 'Bearer abc123'.\nIf you don't know what this is, you don't need it.")]
        [ValueIsSecret]
        public string AuthorizationHeader = "";

        [ConfigComment("Any other headers here, newline separated, for example:\nMyHeader: MyVal\nSecondHeader: secondVal")]
        public string OtherHeaders = "";

        [ConfigComment("When attempting to connect to the backend, this is the maximum time Swarm will wait before considering the connection to be failed.\nNote that depending on other configurations, it may fail faster than this.\nFor local network machines, set this to a low value (eg 5) to avoid 'Loading...' delays.")]
        public int ConnectionAttemptTimeoutSeconds = 30;
    }

    public AutoScalingBackendSettings Settings => SettingsRaw as AutoScalingBackendSettings;

    /// <summary>A list of any non-real backends this instance controls.</summary>
    public ConcurrentDictionary<int, BackendHandler.T2IBackendData> ControlledNonrealBackends = new();

    /// <summary>Auto-incremented counter of backend launches.</summary>
    public static long LaunchID = 0;

    /// <summary>If non-zero, this is the minimum value of <see cref="Environment.TickCount64"/> before starting a new backend.</summary>
    public long TimeOfNextStart = 0;

    /// <summary>Lock to prevents scaling behavior from overlapping itself across threads.</summary>
    public LockObject ScaleBehaviorLock = new();

    public override async Task Init()
    {
        if (!Settings.DO_NOT_USE_THIS)
        {
            Logs.Error("AutoScalingBackend is a WIP. Do not use it.");
            Status = BackendStatus.ERRORED;
            return;
        }
        CanLoadModels = false;
        TimeOfNextStart = 0;
        if (Settings.MaxBackends <= 0 || string.IsNullOrWhiteSpace(Settings.StartScript))
        {
            Status = BackendStatus.DISABLED;
            return;
        }
        if (Settings.MinBackends > Settings.MaxBackends || Settings.MinIdleTime < 0 || Settings.MinWaitBetweenStart < 0 || Settings.MinWaitBetweenStop < 0 || Settings.MinQueuedBeforeExpand < 1)
        {
            Logs.Error($"AutoScalingBackend has invalid or nonsensical settings, refusing initialization.");
            Status = BackendStatus.ERRORED;
            return;
        }
        if (!File.Exists(Settings.StartScript))
        {
            Logs.Error($"AutoScalingBackend cannot find start script: '{Settings.StartScript}', not a real file");
            Status = BackendStatus.ERRORED;
            return;
        }
        string scriptExt = Path.GetExtension(Settings.StartScript).ToLowerInvariant();
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? (scriptExt == "bat" || scriptExt == "ps1") : (scriptExt == "sh"))
        {
            Logs.Error($"AutoScalingBackend cannot handle start script: '{Settings.StartScript}', not an OS-appropriate shell script. Use 'sh' for Linux/Mac, or 'bat'/'ps1' for Windows.");
            Status = BackendStatus.ERRORED;
            return;
        }
        Status = BackendStatus.LOADING;
        if (Settings.MinBackends > 0)
        {
            for (int i = 0; i < Settings.MinBackends; i++)
            {
                await LaunchOne();
            }
        }
        // TODO: ?
        // TODO: Dynamic scaling monitoring stuff
        // TODO: Every 30 seconds, ping all controlled backends
        Status = BackendStatus.RUNNING;
    }

    /// <summary>Signal that a new backend is wanted. Only does anything if the system is currently ready to expand.</summary>
    public void SignalWantsOne()
    {
        lock (ScaleBehaviorLock)
        {
            if (TimeOfNextStart != 0 && Environment.TickCount64 < TimeOfNextStart)
            {
                return;
            }
            if (ControlledNonrealBackends.Count >= Settings.MaxBackends || Status == BackendStatus.DISABLED)
            {
                return;
            }
            MustWaitMinutesBeforeStart(Settings.MinWaitBetweenStart);
        }
        Utilities.RunCheckedTask(LaunchOne, "AutoScalingBackend Launch New Backend");
    }

    /// <summary>Update the <see cref="TimeOfNextStart"/> to require at least the given number of minutes before a new start.</summary>
    public void MustWaitMinutesBeforeStart(double min)
    {
        lock (ScaleBehaviorLock)
        {
            TimeOfNextStart = Math.Max(TimeOfNextStart, Environment.TickCount64) + (long)(min * 60_000);
        }
    }

    /// <summary>Async task to launch a new backend. Only returns when a backend has launched, or failed. Throws an exception if a backend cannot be launched currently.</summary>
    public async Task LaunchOne()
    {
        long id;
        lock (ScaleBehaviorLock)
        {
            if (ControlledNonrealBackends.Count >= Settings.MaxBackends)
            {
                throw new Exception("Tried to launch more backends, but already at max.");
            }
            if (Status == BackendStatus.DISABLED)
            {
                throw new Exception("Tried to launch a backend, but AutoScalingBackend is disabled.");
            }
            MustWaitMinutesBeforeStart(Settings.MinWaitBetweenStart);
            id = Interlocked.Increment(ref LaunchID);
        }
        ProcessStartInfo psi = new()
        {
            FileName = Settings.StartScript,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = Path.GetDirectoryName(Settings.StartScript)
        };
        Process process = Process.Start(psi) ?? throw new Exception("Failed to start backend launch process, fundamental failure. Is the start script valid?");
        using StreamReader fixedReader = new(process.StandardOutput.BaseStream, Encoding.UTF8); // Force UTF-8, always
        string line;
        while ((line = await fixedReader.ReadLineAsync()) is not null)
        {
            line = line.Trim();
            if (line.StartsWith("[SwarmAutoScaleBackend]") && line.EndsWith("[/SwarmAutoScaleBackend]"))
            {
                line = line["[SwarmAutoScaleBackend]".Length..^"[/SwarmAutoScaleBackend]".Length].Trim();
                if (line.StartsWith("NewURL: "))
                {
                    string url = line["NewURL: ".Length..].Trim();
                    if (string.IsNullOrWhiteSpace(url))
                    {
                        continue;
                    }
                    // TODO: Add a SwarmSwarmBackend with this URL
                }
                if (line.StartsWith("DeclareFailed: "))
                {
                    string info = line["DeclareFailed: ".Length..].Trim();
                    Logs.Debug($"SwarmAutoScalingBackend Launch #{id} declared failure to launch: {info}");
                    MustWaitMinutesBeforeStart(Settings.MinWaitAfterFailure);
                    return;
                }
                Logs.Debug($"SwarmAutoScalingBackend Launch #{id} Output: {line}");
                MustWaitMinutesBeforeStart(Settings.MinWaitBetweenStart);
            }
        }
        NetworkBackendUtils.ReportLogsFromProcess(process, $"AutoScalingBackendLaunch-{id}", $"autoscalebackend_{id}", out _, () => BackendStatus.RUNNING, _ => { }, true);
    }

    /// <summary>Ping a controlled backend, by its ID. Tells the remote backend that we are in control of it. If the ping fails, the backend is stopped and removed from tracking.</summary>
    public async Task PingBackend(int id)
    {
        if (ControlledNonrealBackends.TryGetValue(id, out BackendHandler.T2IBackendData data))
        {
            if (data.Backend is SwarmSwarmBackend swarmBackend)
            {
                try
                {
                    JObject response = await swarmBackend.SendAPIJSON("AdminTakeControl", []);
                    if (response.Value<bool>("success"))
                    {
                        return;
                    }
                }
                catch (Exception ex)
                {
                    Logs.Debug($"AutoScalingBackend PingBackend #{id} failed: {ex.Message}");
                }
                await StopOne(id);
            }
        }
    }

    /// <summary>Stop a controlled backend, by its ID. Does nothing if the ID isn't tracked by this handler.</summary>
    public async Task StopOne(int id)
    {
        if (ControlledNonrealBackends.TryRemove(id, out BackendHandler.T2IBackendData data))
        {
            if (data.Backend is SwarmSwarmBackend swarmBackend)
            {
                try
                {
                    await swarmBackend.TriggerRemoteShutdown();
                }
                catch (Exception ex)
                {
                    Logs.Debug($"AutoScalingBackend StopOne #{id} remote shutdown failed: {ex.Message}");
                }
            }
            try
            {
                await Handler.DeleteById(id);
            }
            catch (Exception ex)
            {
                Logs.Debug($"AutoScalingBackend StopOne #{id} local delete failed: {ex.Message}");
            }
        }
    }

    /// <inheritdoc/>
    public override async Task Shutdown()
    {
        foreach (int id in ControlledNonrealBackends.Keys.ToArray())
        {
            await StopOne(id);
        }
        ControlledNonrealBackends.Clear();
        Status = BackendStatus.DISABLED;
    }

    /// <inheritdoc/>
    public override async Task<Image[]> Generate(T2IParamInput user_input)
    {
        throw new NotImplementedException("Auto-Scaling Backend does not do its own generations.");
    }

    /// <inheritdoc/>
    public override async Task GenerateLive(T2IParamInput user_input, string batchId, Action<object> takeOutput)
    {
        throw new NotImplementedException("Auto-Scaling Backend does not do its own generations.");
    }

    /// <inheritdoc/>
    public override IEnumerable<string> SupportedFeatures => [];
}
