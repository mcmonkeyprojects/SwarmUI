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
        [ConfigComment("Maximum number of additional backends to spin up.")]
        public int MaxBackends = 5;

        [ConfigComment("Minimum number of backends to always keep running, even if idle.")]
        public int MinBackends = 0;

        [ConfigComment("Minimum time, in minutes, between spinning up new backends.\nFor example, if set 1, then only 1 new backend per minute can be started.\nThis helps reduce the resource impact of sudden large bursts of activity.")]
        public double MinWaitBetweenStart = 1;

        [ConfigComment("Minimum time, in minutes, to wait after a backend fails to start before trying to start another one.")]
        public double MinWaitAfterFailure = 2;

        [ConfigComment("Minimum time, in minutes, between shutting down idle backends.\nFor example, if set 1, then only 1 backend per minute can be automatically stopped.\nThis helps prevent spiky start/stop thrash, but may waste resources a bit if there are rare large bursts of activity.")]
        public double MinWaitBetweenStop = 1;

        [ConfigComment("Minimum time, in minutes, that a backend must be idle before it can be selected for shutdown.")]
        public double MinIdleTime = 10;

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

        // TODO: Some form of loadfactor stuff, to allow cases of users with very large servers wanting to pre-scale
    }

    /// <summary>Auto-incremented counter of backend launches.</summary>
    public static long LaunchID = 0;

    public AutoScalingBackendSettings Settings => SettingsRaw as AutoScalingBackendSettings;

    /// <summary>A list of any non-real backends this instance controls.</summary>
    public ConcurrentDictionary<int, BackendHandler.T2IBackendData> ControlledNonrealBackends = new();

    /// <summary>How many new backend launches are still-pending.</summary>
    public long PendingLaunches = 0;

    /// <summary>If non-zero, this is the minimum value of <see cref="Environment.TickCount64"/> before starting a new backend.</summary>
    public long TimeOfNextStart = 0;

    /// <summary>If non-zero, this is the minimum value of <see cref="Environment.TickCount64"/> before stopping an idle backend.</summary>
    public long TimeOfNextStop = 0;

    /// <summary>Lock to prevents scaling behavior from overlapping itself across threads.</summary>
    public LockObject ScaleBehaviorLock = new();

    public override async Task Init()
    {
        CanLoadModels = false;
        TimeOfNextStart = 0;
        TimeOfNextStop = 0;
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
        string scriptExt = Path.GetExtension(Settings.StartScript).ToLowerInvariant();
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? (scriptExt == "bat" || scriptExt == "ps1") : (scriptExt == "sh"))
        {
            Logs.Error($"AutoScalingBackend cannot handle start script: '{Settings.StartScript}', not an OS-appropriate shell script. Use 'sh' for Linux/Mac, or 'bat'/'ps1' for Windows.");
            Status = BackendStatus.ERRORED;
            return;
        }
        if (!File.Exists(Settings.StartScript))
        {
            Logs.Error($"AutoScalingBackend cannot find start script: '{Settings.StartScript}', not a real file");
            Status = BackendStatus.ERRORED;
            return;
        }
        Status = BackendStatus.LOADING;
        await FillToMin(100, true);
        Program.TickEvent += Tick;
        Program.PreShutdownEvent += PreShutdown;
        Program.Backends.NewBackendNeededEvent.TryAdd(BackendData.ID, () => SignalWantsOne());
        Status = BackendStatus.RUNNING;
    }

    /// <summary>Value of <see cref="Environment.TickCount64"/> at the last time that all controlled backends were pinged.</summary>
    public long LastPingAll = 0;

    /// <summary>Returns the count of active backends - how many are running plus how many are loading.</summary>
    public int CountActiveBackends => ControlledNonrealBackends.Count + (int)Interlocked.Read(ref PendingLaunches);

    /// <summary>Launch new backends to ensure the minimum expected is hit.</summary>
    /// <param name="limit">Upper limit on how many can be launched at once.</param>
    /// <param name="hardLaunch">If true, direct launch as many as needed immediately. If false, just signal to add more if needed.</param>
    public async Task FillToMin(int limit, bool hardLaunch)
    {
        int mustAdd = Settings.MinBackends - CountActiveBackends;
        if (mustAdd > 0)
        {
            mustAdd = Math.Min(mustAdd, limit);
            for (int i = 0; i < mustAdd; i++)
            {
                await (hardLaunch ? LaunchOne() : SignalWantsOne(false));
            }
        }
    }

    /// <summary>Tick function, called every approx 1 sec by the core, to process slow monitoring tasks for this autoscaler.</summary>
    public void Tick()
    {
        long timeNow = Environment.TickCount64;
        if (timeNow > LastPingAll + 30_000)
        {
            foreach (int id in ControlledNonrealBackends.Keys.ToArray())
            {
                _ = Utilities.RunCheckedTask(() => PingBackend(id), $"AutoScalingBackend PingBackend #{id}");
            }
            if (ControlledNonrealBackends.Count > Settings.MinBackends)
            {
                foreach (BackendHandler.T2IBackendData data in ControlledNonrealBackends.Values.ToArray())
                {
                    if (!data.CheckIsInUseAtAll && timeNow > data.TimeLastRelease + Settings.MinIdleTime * 60_000)
                    {
                        lock (ScaleBehaviorLock)
                        {
                            if (ControlledNonrealBackends.Count > Settings.MinBackends && Environment.TickCount64 > TimeOfNextStop)
                            {
                                _ = Utilities.RunCheckedTask(() => StopOne(data.ID), $"AutoScalingBackend StopOne #{data.ID}");
                                MustWaitMinutesBeforeStop(Settings.MinWaitBetweenStop);
                                break;
                            }
                        }
                    }
                }
            }
            else
            {
                _ = Utilities.RunCheckedTask(() => FillToMin(1, false), $"AutoScalingBackend Fill To Min");
            }
        }
    }

    /// <summary>Signal that a new backend is wanted. Only does anything if the system is currently ready to expand.</summary>
    public async Task<BackendHandler.ScaleResult> SignalWantsOne(bool checkQueueReq = true)
    {
        lock (ScaleBehaviorLock)
        {
            if (Status == BackendStatus.DISABLED)
            {
                return BackendHandler.ScaleResult.NoLaunch;
            }
            if (TimeOfNextStart != 0 && Environment.TickCount64 < TimeOfNextStart)
            {
                Logs.Verbose("Scale request ignored due to wait time between starts.");
                return BackendHandler.ScaleResult.NoLaunch;
            }
            if (CountActiveBackends >= Settings.MaxBackends)
            {
                Logs.Verbose("Scale request ignored due to max backends count reached.");
                return BackendHandler.ScaleResult.NoLaunch;
            }
            if (checkQueueReq && Program.Backends.QueuedRequests < Settings.MinQueuedBeforeExpand)
            {
                Logs.Verbose("Scale request ignored due to insufficient queued requests.");
                return BackendHandler.ScaleResult.NoLaunch;
            }
            MustWaitMinutesBeforeStart(Settings.MinWaitBetweenStart);
        }
        BackendHandler.ScaleResult result = BackendHandler.ScaleResult.AddedLaunch;
        if (ControlledNonrealBackends.IsEmpty)
        {
            result = BackendHandler.ScaleResult.FreshLaunch;
        }
        await Utilities.RunCheckedTask(() => LaunchOne(), "AutoScalingBackend Launch New Backend");
        return result;
    }

    /// <summary>Update the <see cref="TimeOfNextStart"/> to require at least the given number of minutes before a new start.</summary>
    public void MustWaitMinutesBeforeStart(double min)
    {
        lock (ScaleBehaviorLock)
        {
            TimeOfNextStart = Math.Max(TimeOfNextStart, Environment.TickCount64 + (long)(min * 60_000));
        }
    }

    /// <summary>Update the <see cref="TimeOfNextStop"/> to require at least the given number of minutes before a new stop.</summary>
    public void MustWaitMinutesBeforeStop(double min)
    {
        lock (ScaleBehaviorLock)
        {
            TimeOfNextStop = Math.Max(TimeOfNextStop, Environment.TickCount64 + (long)(min * 60_000));
        }
    }

    /// <summary>Async task to launch a new backend. Only returns when a backend has launched, or failed. Throws an exception if a backend cannot be launched currently.</summary>
    public async Task LaunchOne(bool validate = true, string[] args = null, Action<BackendHandler.T2IBackendData> configure = null)
    {
        long id;
        lock (ScaleBehaviorLock)
        {
            if (validate && CountActiveBackends >= Settings.MaxBackends)
            {
                throw new Exception("Tried to launch more backends, but already at max.");
            }
            if (Status == BackendStatus.DISABLED)
            {
                throw new Exception("Tried to launch a backend, but AutoScalingBackend is disabled.");
            }
            MustWaitMinutesBeforeStart(Settings.MinWaitBetweenStart);
            id = Interlocked.Increment(ref LaunchID);
            Interlocked.Increment(ref PendingLaunches);
        }
        try
        {
            Logs.Info($"AutoScalingBackend launching new backend instance #{id}");
            ProcessStartInfo psi = new()
            {
                FileName = Settings.StartScript,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = Path.GetDirectoryName(Settings.StartScript)
            };
            if (args is not null)
            {
                foreach (string arg in args)
                {
                    psi.ArgumentList.Add(arg);
                }
            }
            Process process = Process.Start(psi) ?? throw new Exception("Failed to start backend launch process, fundamental failure. Is the start script valid?");
            StreamReader fixedReader = new(process.StandardOutput.BaseStream, Encoding.UTF8); // Force UTF-8, always
            string line;
            int retries = 1;
            bool launched = false;
            while ((line = await fixedReader.ReadLineAsync()) is not null)
            {
                line = line.Trim();
                if (line.StartsWith("[SwarmAutoScaleBackend]") && line.EndsWith("[/SwarmAutoScaleBackend]"))
                {
                    line = line["[SwarmAutoScaleBackend]".Length..^"[/SwarmAutoScaleBackend]".Length].Trim();
                    Logs.Debug($"SwarmAutoScalingBackend Launch #{id} Managed Output: {line}");
                    if (line.StartsWith("NewURL:"))
                    {
                        string url = line["NewURL:".Length..].Trim();
                        if (string.IsNullOrWhiteSpace(url))
                        {
                            continue;
                        }
                        SwarmSwarmBackend.SwarmSwarmBackendSettings settings = new()
                        {
                            Address = url,
                            AuthorizationHeader = Settings.AuthorizationHeader,
                            OtherHeaders = Settings.OtherHeaders,
                            ConnectionAttemptTimeoutSeconds = Settings.ConnectionAttemptTimeoutSeconds
                        };
                        // TODO: support remote non-T2I Backends
                        BackendHandler.BackendData newBackend = Handler.AddNewNonrealBackend(Handler.SwarmBackendType, BackendData, settings, (newData) =>
                        {
                            Logs.Verbose($"{HandlerTypeData.Name} {BackendData.ID} adding remote backend {newData.ID}: Master Control");
                            SwarmSwarmBackend newSwarm = newData.AbstractBackend as SwarmSwarmBackend;
                            newSwarm.IsSpecialControlled = true;
                            newSwarm.Models = Models;
                            newSwarm.Title = $"[Remote from {BackendData.ID}: {Title}] Master Control Swarm Instance";
                            newSwarm.CanLoadModels = false;
                            newSwarm.FirstLoadRetries = retries;
                            newData.UpdateLastReleaseTime();
                            ControlledNonrealBackends.TryAdd(newData.ID, newData as BackendHandler.T2IBackendData);
                        });
                        MustWaitMinutesBeforeStart(Settings.MinWaitBetweenStart);
                        configure?.Invoke(newBackend as BackendHandler.T2IBackendData);
                        launched = true;
                        break;
                    }
                    if (line.StartsWith("DoRetries:"))
                    {
                        string info = line["DoRetries:".Length..].Trim();
                        Logs.Debug($"SwarmAutoScalingBackend Launch #{id} request retry count: {info}");
                        retries = int.Parse(info);
                    }
                    if (line.StartsWith("DeclareFailed:"))
                    {
                        string info = line["DeclareFailed:".Length..].Trim();
                        Logs.Debug($"SwarmAutoScalingBackend Launch #{id} declared failure to launch: {info}");
                        MustWaitMinutesBeforeStart(Settings.MinWaitAfterFailure);
                        break;
                    }
                }
                else
                {
                    Logs.Verbose($"SwarmAutoScalingBackend launch #{id} startup stdout: {line}");
                }
            }
            if (!launched)
            {
                Logs.Warning($"AutoScalingBackend launch #{id} failed to launch a new backend.");
            }
            NetworkBackendUtils.ReportLogsFromProcess(process, $"AutoScalingBackendLaunch-{id}", $"autoscalingbackend_{id}", out _, () => BackendStatus.RUNNING, _ => { }, true);
        }
        finally
        {
            Interlocked.Decrement(ref PendingLaunches);
        }
    }

    /// <summary>Ping a controlled backend, by its ID. Tells the remote backend that we are in control of it. If the ping fails, the backend is stopped and removed from tracking.</summary>
    public async Task PingBackend(int id)
    {
        if (ControlledNonrealBackends.TryGetValue(id, out BackendHandler.T2IBackendData data))
        {
            if (data.Backend is SwarmSwarmBackend swarmBackend && data.Backend.Status != BackendStatus.LOADING && data.Backend.Status != BackendStatus.WAITING)
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
            Logs.Info($"AutoScalingBackend stopping controlled backend #{id}");
            if (data.Backend is SwarmSwarmBackend swarmBackend)
            {
                try
                {
                    Logs.Verbose($"Explicit shutdown, trace: {Environment.StackTrace}");
                    await swarmBackend.TriggerRemoteShutdown();
                }
                catch (Exception ex)
                {
                    Logs.Info($"AutoScalingBackend StopOne #{id} remote shutdown failed: {ex.Message}");
                }
            }
            try
            {
                await Handler.DeleteById(id);
            }
            catch (Exception ex)
            {
                Logs.Info($"AutoScalingBackend StopOne #{id} local delete failed: {ex.Message}");
            }
        }
        else
        {
            Logs.Info($"AutoScalingBackend StopOne called for unknown backend #{id}");
        }
    }

    /// <summary>Called before the proper full program shutdown. Network shutdown calls need to be sent early.</summary>
    public void PreShutdown()
    {
        Task.WaitAll([.. ControlledNonrealBackends.Keys.Select(StopOne)]);
    }

    /// <inheritdoc/>
    public override async Task Shutdown()
    {
        Logs.Info($"AutoScalingBackend {BackendData.ID} shutting down, stopping all controlled backends.");
        List<Task> stopTasks = [];
        lock (ScaleBehaviorLock)
        {
            Program.TickEvent -= Tick;
            Program.PreShutdownEvent -= PreShutdown;
            Program.Backends.NewBackendNeededEvent.Remove(BackendData.ID, out _);
            foreach (int id in ControlledNonrealBackends.Keys.ToArray())
            {
                stopTasks.Add(StopOne(id));
            }
            Status = BackendStatus.DISABLED;
        }
        await Task.WhenAll(stopTasks);
        ControlledNonrealBackends.Clear();
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

    /// <inheritdoc/>
    public override Task<bool> LoadModel(T2IModel model, T2IParamInput input)
    {
        throw new NotImplementedException("Auto-Scaling Backend cannot load models.");
    }
}
