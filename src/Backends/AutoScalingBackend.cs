using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using FreneticUtilities.FreneticDataSyntax;
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

        [ConfigComment("Minimum time, in minutes, between shutting down idle backends.\nFor example, if set 1, then only 1 backend per minute can be automatically stopped.")]
        public double MinWaitBetweenStop = 0.5;

        [ConfigComment("Minimum time, in minutes, that a backend must be idle before it can be selected for shutdown.")]
        public double MinIdleTime = 1;

        [ConfigComment("Minimum number of waiting generations before a new backend can be started.\nSelect this high enough to not be wasteful of resources, but low enough to not cause generation requests to be pending for too long.\nMust be set to at least 1, should ideally be set higher.")]
        public int MinQueuedBeforeExpand = 10;

        [ConfigComment("File path to a shell script (normally a '.sh') that will cause a new backend to be started.\nThe script must print to stdout `SwarmAutoScaleBackendNewURL: <url>`, for example `SwarmAutoScaleBackendNewURL: http://localhost:7801/`\nIf the script does not output this, it is assumed to have failed and must clean up any bad launches it made on its own.\nThe shell script will be backgrounded after the stdout is found, and so may either continuing running or stop at your own discretion.\nThe remote Swarm will be shut down automatically via Swarm's internal self-communication, and so the script is expected to clean up any relevant resources on its own when the remote instance closes.")]
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

    public override async Task Init()
    {
        if (!Settings.DO_NOT_USE_THIS)
        {
            Logs.Error("AutoScalingBackend is a WIP. Do not use it.");
            Status = BackendStatus.ERRORED;
            return;
        }
        CanLoadModels = false;
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
        Status = BackendStatus.RUNNING;
    }

    public async Task LaunchOne()
    {
        if (ControlledNonrealBackends.Count >= Settings.MaxBackends)
        {
            throw new Exception("Tried to launch more backends, but already at max.");
        }
        if (Status == BackendStatus.DISABLED)
        {
            throw new Exception("Tried to launch a backend, but AutoScalingBackend is disabled.");
        }
        long id = Interlocked.Increment(ref LaunchID);
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
            if (line.StartsWith("SwarmAutoScaleBackendNewURL: "))
            {
                string url = line["SwarmAutoScaleBackendNewURL: ".Length..].Trim();
                if (string.IsNullOrWhiteSpace(url))
                {
                    continue;
                }
                // TODO: Add a SwarmSwarmBackend with this URL
            }
            Logs.Debug($"SwarmAutoScalingBackend Launch #{id} Output: {line}");
        }
        NetworkBackendUtils.ReportLogsFromProcess(process, $"AutoScalingBackendLaunch-{id}", $"autoscalebackend_{id}", out _, () => BackendStatus.RUNNING, _ => { }, true);
    }

    public override async Task Shutdown()
    {
        // TODO: Send a shutdown signal to each controlled backend
        foreach (BackendHandler.T2IBackendData data in ControlledNonrealBackends.Values)
        {
            await Handler.DeleteById(data.ID);
        }
        ControlledNonrealBackends.Clear();
        Status = BackendStatus.DISABLED;
    }

    public override async Task<Image[]> Generate(T2IParamInput user_input)
    {
        throw new NotImplementedException("Auto-Scaling Backend does not do its own generations.");
    }

    public override async Task GenerateLive(T2IParamInput user_input, string batchId, Action<object> takeOutput)
    {
        throw new NotImplementedException("Auto-Scaling Backend does not do its own generations.");
    }

    public override IEnumerable<string> SupportedFeatures => [];
}
