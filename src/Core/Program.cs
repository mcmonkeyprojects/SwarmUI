using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Hardware.Info;
using LiteDB;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using SixLabors.ImageSharp;
using SwarmUI.Accounts;
using SwarmUI.Backends;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Runtime.Loader;

namespace SwarmUI.Core;

/// <summary>Class that handles the core entry-point access to the program, and initialization of program layers.</summary>
public class Program
{
    /// <summary>Central store of available backends.</summary>
    public static BackendHandler Backends; // TODO: better location for central values

    /// <summary>Central store of web sessions.</summary>
    public static SessionHandler Sessions;

    /// <summary>Central store of Text2Image models.</summary>
    public static Dictionary<string, T2IModelHandler> T2IModelSets = [];

    /// <summary>Main Stable-Diffusion model tracker.</summary>
    public static T2IModelHandler MainSDModels => T2IModelSets["Stable-Diffusion"];

    /// <summary>The manager for SwarmUI extensions.</summary>
    public static ExtensionsManager Extensions = new();

    /// <summary>Holder of server admin settings.</summary>
    public static Settings ServerSettings = new();

    private static readonly CancellationTokenSource GlobalCancelSource = new();

    /// <summary>If this is signalled, the program is cancelled.</summary>
    public static CancellationToken GlobalProgramCancel = GlobalCancelSource.Token;

    /// <summary>If enabled, settings will be locked to prevent user editing.</summary>
    public static bool LockSettings = false;

    /// <summary>Path to the settings file, as set by command line.</summary>
    public static string SettingsFilePath;

    /// <summary>Proxy (ngrok/cloudflared) instance, if loaded at all.</summary>
    public static PublicProxyHandler ProxyHandler;

    /// <summary>Central web server core.</summary>
    public static WebServer Web;

    /// <summary>User-requested launch mode (web, electron, none).</summary>
    public static string LaunchMode;

    /// <summary>Event triggered when a user wants to refresh the models list.</summary>
    public static Action ModelRefreshEvent;

    /// <summary>Event-action fired when the server wasn't generating for a while and is now starting to generate again.</summary>
    public static Action TickIsGeneratingEvent;

    /// <summary>Event-action fired once per second (approximately) while the server is *not* generating anything.</summary>
    public static Action TickNoGenerationsEvent;

    /// <summary>Event-action fired once per second (approximately) all the time.</summary>
    public static Action TickEvent;

    /// <summary>Event-action fired once per minute (approximately) all the time.</summary>
    public static Action SlowTickEvent;

    /// <summary>Event-action fired when the model paths have changed (eg via settings change).</summary>
    public static Action ModelPathsChangedEvent;

    /// <summary>General data directory root.</summary>
    public static string DataDir = "Data";

    /// <summary>If a version update is available, this is the message.</summary>
    public static string VersionUpdateMessage = null, VersionUpdateMessageShort = null;

    /// <summary>Date of the current git commit, if known.</summary>
    public static string CurrentGitDate = null;

    /// <summary>Primary execution entry point.</summary>
    public static void Main(string[] args)
    {
        SpecialTools.Internationalize(); // Fix for MS's broken localization
        BsonMapper.Global.EmptyStringToNull = false; // Fix for LiteDB's broken handling of empty strings
        ServicePointManager.DefaultConnectionLimit = 1000; // MS default limit is really low here
        Logs.Init($"=== SwarmUI v{Utilities.Version} Starting at {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss} ===");
        Utilities.LoadTimer timer = new();
        AssemblyLoadContext.Default.Unloading += (_) => Shutdown();
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Shutdown();
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            Logs.Debug($"Unhandled exception: {e.ExceptionObject}");
        };
        List<Task> waitFor = [];
        //Utilities.CheckDotNet("8");
        Extensions.PrepExtensions();
        try
        {
            Logs.Init("Parsing command line...");
            ParseCommandLineArgs(args);
            if (GetCommandLineFlagAsBool("help", false))
            {
                PrintCommandLineHelp();
                return;
            }
            Logs.Init("Loading settings file...");
            DataDir = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, GetCommandLineFlag("data_dir", "Data"));
            SettingsFilePath = GetCommandLineFlag("settings_file", $"{DataDir}/Settings.fds");
            LoadSettingsFile();
            RebuildDataDir();
            // TODO: Legacy format patch from Alpha 0.5! Remove this before 1.0.
            if (ServerSettings.DefaultUser.FileFormat.ImageFormat == "jpg")
            {
                ServerSettings.DefaultUser.FileFormat.ImageFormat = "JPG";
            }
            // TODO: Legacy patch from Beta 0.9.4.
            if (ServerSettings.IsInstalled && string.IsNullOrWhiteSpace(ServerSettings.InstallDate))
            {
                ServerSettings.InstallDate = "2024-12-01"; // (Technically earlier, but, well... who knows lol)
                ServerSettings.InstallVersion = "Beta";
            }
            if (!LockSettings)
            {
                Logs.Init("Re-saving settings file...");
                SaveSettingsFile();
            }
            Logs.Init("Applying command line settings...");
            ApplyCommandLineSettings();
            foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
            {
                if ($"{entry.Key}".StartsWith("SWARM_"))
                {
                    Logs.Init($"EnvVar '{entry.Key}' set to '{entry.Value}'");
                }
            }
        }
        catch (SwarmReadableErrorException ex)
        {
            Logs.Error($"Command line arguments given are invalid: {ex.Message}");
            PrintCommandLineHelp();
            return;
        }
        if (ServerSettings.IsInstalled && ServerSettings.InstallDate != "2024-12-01")
        {
            DateTimeOffset date = DateTimeOffset.Parse(ServerSettings.InstallDate);
            TimeSpan offset = DateTimeOffset.Now - date;
            string timeAgo = offset.TotalDays < 60 ? $"{(int)offset.TotalDays} days" : $"{(int)(offset.TotalDays / 30)} months";
            Logs.Init($"SwarmUI was installed {ServerSettings.InstallDate} ({timeAgo} ago) with version {ServerSettings.InstallVersion}");
        }
        if (ServerSettings.ShowExperimentalFeatures)
        {
            Logs.Warning($"Experimental Features are enabled. Issue reports will not be accepted until you turn them off in Server Configuration.");
        }
        Logs.Init($"Swarm base path is: {Environment.CurrentDirectory}");
        Logs.Init($"Running on OS: {RuntimeInformation.OSDescription}");
        Logs.StartLogSaving();
        timer.Check("Initial settings load");
        if (ServerSettings.Maintenance.CheckForUpdates)
        {
            waitFor.Add(Utilities.RunCheckedTask(async () =>
            {
                await Utilities.RunGitProcess("fetch");
                string refs = await Utilities.RunGitProcess("tag --sort=-creatordate");
                string[] tags = [.. refs.Split('\n').Where(t => !string.IsNullOrWhiteSpace(t) && t.Contains('-') && Version.TryParse(t.Before('-'), out _)).Select(t => t.Trim()).OrderByDescending(t => Version.Parse(t.Before('-')))];
                Version local = Version.Parse(Utilities.Version);
                string[] newer = [.. tags.Where(t => Version.Parse(t.Before('-')) > local)];
                if (newer.Any())
                {
                    string url = $"{Utilities.RepoRoot}/releases/tag/{newer[0]}";
                    Logs.Warning($"A new version of SwarmUI is available: {newer[0]}! You are running version {Utilities.Version}, this is {newer.Length} release(s) behind. See release notes at {url}");
                    VersionUpdateMessageShort = $"Update available: {newer[0]} (you are running {Utilities.Version}, this is {newer.Length} release(s) behind):\nSee release notes at <a target=\"_blank\" href=\"{url}\">{url}</a>";
                    VersionUpdateMessage = $"{VersionUpdateMessageShort}\nThere is a button available to automatically apply the update on the <a href=\"#Settings-Server\" onclick=\"getRequiredElementById('servertabbutton').click();getRequiredElementById('serverinfotabbutton').click();\">Server Info Tab</a>.";
                }
                else if (tags.IsEmpty())
                {
                    Logs.Error($"Swarm failed to check for updates! Tag list empty?!");
                }
                else
                {
                    Logs.Init($"Swarm is up to date! You have version {Utilities.Version}, and {tags[0]} is the latest.");
                }
            }, "check for updates"));
        }
        waitFor.Add(Utilities.RunCheckedTask(async () =>
        {
            try
            {
                string showOutput = await Utilities.RunGitProcess("show --no-patch --format=%h^%ci^%s HEAD");
                string[] parts = showOutput.SplitFast('^', 2);
                DateTimeOffset date = DateTimeOffset.Parse(parts[1].Trim()).ToUniversalTime();
                CurrentGitDate = $"{date:yyyy-MM-dd HH:mm:ss}";
                TimeSpan relative = DateTimeOffset.UtcNow - date;
                string ago = $"{relative.Hours} hour{(relative.Hours == 1 ? "" : "s")} ago";
                if (relative.Hours > 48)
                {
                    ago = $"{relative.Days} day{(relative.Days == 1 ? "" : "s")} ago";
                }
                else if (relative.Hours == 0)
                {
                    ago = $"{relative.Minutes} minute{(relative.Minutes == 1 ? "" : "s")} ago";
                }
                Logs.Init($"Current git commit is [{parts[0]}: {parts[2]}], marked as date {CurrentGitDate} ({ago})");
            }
            catch (Exception ex)
            {
                Logs.Error($"Failed to get git commit date: {ex.ReadableString()}");
                CurrentGitDate = "Git failed to load";
            }
        }, "check current git commit"));
        waitFor.Add(Utilities.RunCheckedTask(async () =>
        {
            NvidiaUtil.NvidiaInfo[] gpuInfo = NvidiaUtil.QueryNvidia();
            SystemStatusMonitor.HardwareInfo.RefreshMemoryStatus();
            MemoryStatus memStatus = SystemStatusMonitor.HardwareInfo.MemoryStatus;
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                Logs.Init($"CPU Cores: {Environment.ProcessorCount} | RAM: {new MemoryNum((long)memStatus.TotalPhysical)} total, {new MemoryNum((long)memStatus.AvailablePhysical)} available, {new MemoryNum((long)memStatus.TotalPageFile)} total page file, {new MemoryNum((long)memStatus.AvailablePageFile)} available page file");
            }
            else if ((long)memStatus.TotalVirtual <= 0)
            {
                Logs.Init($"CPU Cores: {Environment.ProcessorCount} | RAM: {new MemoryNum((long)memStatus.TotalPhysical)} total, {new MemoryNum((long)memStatus.AvailablePhysical)} available, unknown virtual/swap");
            }
            else
            {
                Logs.Init($"CPU Cores: {Environment.ProcessorCount} | RAM: {new MemoryNum((long)memStatus.TotalPhysical)} total, {new MemoryNum((long)memStatus.AvailablePhysical)} available, {new MemoryNum((long)memStatus.TotalVirtual)} virtual, {new MemoryNum((long)memStatus.TotalVirtual - (long)memStatus.TotalPhysical)} swap");
            }
            if (gpuInfo is not null && gpuInfo.Length > 0)
            {
                JObject gpus = [];
                foreach (NvidiaUtil.NvidiaInfo gpu in gpuInfo)
                {
                    Logs.Init($"GPU {gpu.ID}: {gpu.GPUName} | Temp {gpu.Temperature}C | Util {gpu.UtilizationGPU}% GPU, {gpu.UtilizationMemory}% Memory | VRAM {gpu.TotalMemory} total, {gpu.FreeMemory} free, {gpu.UsedMemory} used");
                }
                if (gpuInfo.All(gpu => gpu.GPUName.Contains("NVIDIA GeForce RTX 50")))
                {
                    Utilities.PresumeNVidia50xx = true;
                    Utilities.PresumeNVidia40xx = true;
                    Utilities.PresumeNVidia30xx = true;
                    Logs.Init($"Will use GPU accelerations specific to NVIDIA GeForce RTX 50xx series and newer.");
                }
                else if (gpuInfo.All(gpu => gpu.GPUName.Contains("NVIDIA GeForce RTX 40")))
                {
                    Utilities.PresumeNVidia40xx = true;
                    Utilities.PresumeNVidia30xx = true;
                    Logs.Init($"Will use GPU accelerations specific to NVIDIA GeForce RTX 40xx series and newer.");
                }
                else if (gpuInfo.All(gpu => gpu.GPUName.Contains("NVIDIA GeForce RTX 30")))
                {
                    Utilities.PresumeNVidia30xx = true;
                    Logs.Init($"Will use GPU accelerations specific to NVIDIA GeForce RTX 30xx series and newer.");
                }
            }
        }, "load gpu info"));
        T2IModelClassSorter.Init();
        Extensions.RunOnAllExtensions(e => e.OnPreInit());
        timer.Check("Extension PreInit");
        Logs.Init("Prepping options...");
        BuildModelLists();
        CommonModels.RegisterCoreSet();
        T2IParamTypes.RegisterDefaults();
        Backends = new()
        {
            SaveFilePath = GetCommandLineFlag("backends_file", $"{DataDir}/Backends.fds")
        };
        Sessions = new();
        Web = new();
        timer.Check("Prep Options");
        Web.PreInit();
        timer.Check("Web PreInit");
        Extensions.RunOnAllExtensions(e => e.OnInit());
        Sessions.ApplyDefaultPermissions();
        timer.Check("Extensions Init");
        Utilities.PrepUtils();
        timer.Check("Prep Utils");
        LanguagesHelper.LoadAll();
        timer.Check("Languages load");
        Logs.Init("Loading models list...");
        RefreshAllModelSets();
        WildcardsHelper.Init();
        AutoCompleteListHelper.Init();
        UserSoundHelper.Init();
        timer.Check("Model listing");
        Logs.Init("Loading backends...");
        Backends.Load();
        timer.Check("Backends");
        Logs.Init("Prepping API...");
        BasicAPIFeatures.Register();
        foreach (string str in CommandLineFlags.Keys.Where(k => !CommandLineFlagsRead.Contains(k)))
        {
            Logs.Warning($"Unused command line flag '{str}'");
        }
        timer.Check("API");
        Logs.Init("Prepping webserver...");
        Web.Prep();
        timer.Check("Web prep");
        Logs.Init("Readying extensions for launch...");
        Extensions.RunOnAllExtensions(e => e.OnPreLaunch());
        timer.Check("Extensions pre-launch");
        Logs.Init("Launching server...");
        Permissions.FixOrdered();
        Web.Launch();
        timer.Check("Web launch");
        try
        {
            using CancellationTokenSource cancel = Utilities.TimedCancel(TimeSpan.FromSeconds(5));
            Task.WaitAll([.. waitFor], cancel.Token);
        }
        catch (Exception ex)
        {
            Logs.Debug($"Startup tasks took too long: {ex.ReadableString()}");
        }
        Task.Run(() =>
        {
            Thread.Sleep(500);
            try
            {
                switch (LaunchMode.Trim().ToLowerFast())
                {
                    case "web":
                        Logs.Init("Launch web browser...");
                        Process.Start(new ProcessStartInfo(WebServer.PageURL) { UseShellExecute = true });
                        break;
                    case "webinstall":
                        Logs.Init("Launch web browser to install page...");
                        Process.Start(new ProcessStartInfo(WebServer.PageURL + "/Install") { UseShellExecute = true });
                        break;
                    case "electron":
                        Logs.Init("Electron launch not yet implemented.");
                        // TODO: Electron.NET seems not to function properly, need to get it working.
                        break;
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Failed to launch mode '{LaunchMode}' (If this is a headless/server install, run with '--launch_mode none' as explained in the readme): {ex.ReadableString()}");
            }
        });
        Task.Run(async () =>
        {
            while (true)
            {
                await Task.Delay(TimeSpan.FromSeconds(10), GlobalProgramCancel);
                if (GlobalProgramCancel.IsCancellationRequested)
                {
                    return;
                }
                if (Backends.BackendsEdited)
                {
                    Backends.BackendsEdited = false;
                    Backends.Save();
                }
            }
        });
        if (Environment.CurrentDirectory.Contains(' '))
        {
            Logs.Warning($"Your folder path for SwarmUI contains a space. While Swarm itself can handle this fine, sometimes upstream dependencies misbehave around spaces. It is recommended you keep file paths very simple.");
        }
        Logs.Init($"SwarmUI v{Utilities.Version} - {ServerSettings.UserAuthorization.InstanceTitle} is now running.");
        WebhookManager.SendWebhook("Startup", ServerSettings.WebHooks.ServerStartWebhook, ServerSettings.WebHooks.ServerShutdownWebhook);
        if (Environment.CurrentDirectory.Contains("StableSwarmUI"))
        {
            Logs.Warning("You are running SwarmUI in a folder labeled 'StableSwarmUI', indicating you may have ran from an extremely outdated legacy version of SwarmUI (Swarm split from Stability in June 2024). You should probably reinstall fresh from https://github.com/mcmonkeyprojects/SwarmUI");
        }
        WebServer.WebApp.WaitForShutdown();
        Shutdown();
    }

    /// <summary>Build the main model list from settings. Called at init or on settings change.</summary>
    public static void BuildModelLists()
    {
        foreach (string key in T2IModelSets.Keys.ToList())
        {
            T2IModelSets[key].Shutdown();
        }
        T2IModelSets.Clear();
        try
        {
            string modelRoot = ServerSettings.Paths.ActualModelRoot;
            foreach (string path in ServerSettings.Paths.SDModelFolder.Split(';'))
            {
                Directory.CreateDirectory(Utilities.CombinePathWithAbsolute(modelRoot, path));
            }
            Directory.CreateDirectory($"{modelRoot}/upscale_models");
            Directory.CreateDirectory($"{modelRoot}/clip");
        }
        catch (IOException ex)
        {
            Logs.Error($"Failed to create directories for models. You may need to check your ModelRoot or SDModelFolder settings. {ex.Message}");
        }
        string[] roots = [.. ServerSettings.Paths.ModelRoot.Split(';').Where(p => !string.IsNullOrWhiteSpace(p))];
        int downloadRootId = Math.Abs(ServerSettings.Paths.DownloadToRootID) % roots.Length;
        void buildPathList(string folder, T2IModelHandler handler)
        {
            Dictionary<string, string> result = [];
            int rootCount = 0;
            foreach (string modelRoot in roots)
            {
                int sfCount = 0;
                string[] subfolders = [.. folder.Split(';').Where(p => !string.IsNullOrWhiteSpace(p))];
                if (subfolders.Length == 0)
                {
                    Logs.Error($"Model set {handler.ModelType} has no subfolders defined! You cannot set a path to empty.");
                    return;
                }
                if (rootCount == downloadRootId)
                {
                    handler.DownloadFolderPath = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, modelRoot.Trim(), subfolders[0].Trim());
                }
                foreach (string subfolder in subfolders)
                {
                    string patched = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, modelRoot.Trim(), subfolder.Trim());
                    if ((sfCount > 0 || rootCount > 0) && rootCount != downloadRootId && !Directory.Exists(patched))
                    {
                        continue;
                    }
                    result[patched] = patched;
                    sfCount++;
                }
                rootCount++;
            }
            handler.FolderPaths = [.. result.Keys];
        }
        Directory.CreateDirectory(ServerSettings.Paths.ActualModelRoot + "/tensorrt");
        Directory.CreateDirectory(ServerSettings.Paths.ActualModelRoot + "/diffusion_models");
        T2IModelSets["Stable-Diffusion"] = new() { ModelType = "Stable-Diffusion" };
        buildPathList(ServerSettings.Paths.SDModelFolder + ";tensorrt;diffusion_models;unet", T2IModelSets["Stable-Diffusion"]);
        T2IModelSets["VAE"] = new() { ModelType = "VAE" };
        buildPathList(ServerSettings.Paths.SDVAEFolder, T2IModelSets["VAE"]);
        T2IModelSets["LoRA"] = new() { ModelType = "LoRA" };
        buildPathList(ServerSettings.Paths.SDLoraFolder, T2IModelSets["LoRA"]);
        T2IModelSets["Embedding"] = new() { ModelType = "Embedding" };
        buildPathList(ServerSettings.Paths.SDEmbeddingFolder, T2IModelSets["Embedding"]);
        T2IModelSets["ControlNet"] = new() { ModelType = "ControlNet" };
        buildPathList(ServerSettings.Paths.SDControlNetsFolder, T2IModelSets["ControlNet"]);
        T2IModelSets["Clip"] = new() { ModelType = "Clip" };
        buildPathList(ServerSettings.Paths.SDClipFolder, T2IModelSets["Clip"]);
        T2IModelSets["ClipVision"] = new() { ModelType = "ClipVision" };
        buildPathList(ServerSettings.Paths.SDClipVisionFolder, T2IModelSets["ClipVision"]);
    }

    /// <summary>Rebuild <see cref="DataDir"/>.</summary>
    public static void RebuildDataDir()
    {
        DataDir = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, GetCommandLineFlag("data_dir", ServerSettings.Paths.DataPath));
    }

    /// <summary>Overlapping lock to prevent model set reads during a model list refresh.</summary>
    public static ManyReadOneWriteLock RefreshLock = new(64);

    /// <summary>Refreshes all model sets from file source.</summary>
    public static void RefreshAllModelSets()
    {
        RebuildDataDir();
        foreach (T2IModelHandler handler in T2IModelSets.Values)
        {
            try
            {
                handler.Refresh();
            }
            catch (Exception ex)
            {
                Logs.Error($"Failed to load models for {handler.ModelType}: {ex.Message}");
            }
        }
    }

    private volatile static bool HasShutdown = false;

    /// <summary>Tell the server to shutdown and restart. This call is not blocking, other code will continue momentarily.</summary>
    public static void RequestRestart()
    {
        _ = Utilities.RunCheckedTask(() => Shutdown(42), "shutdown");
    }

    /// <summary>Main shutdown handler. Tells everything to stop.</summary>
    public static void Shutdown(int code = 0)
    {
        if (HasShutdown)
        {
            return;
        }
        HasShutdown = true;
        Task waitShutdown = WebhookManager.SendWebhook("Shutdown", ServerSettings.WebHooks.ServerShutdownWebhook, ServerSettings.WebHooks.ServerShutdownWebhookData);
        Task.WaitAny(waitShutdown, Task.Delay(TimeSpan.FromMinutes(2)));
        Environment.ExitCode = code;
        Logs.Info("Shutting down...");
        GlobalCancelSource.Cancel();
        Logs.Verbose("Shutdown webserver...");
        WebServer.WebApp?.StopAsync().Wait();
        Logs.Verbose("Shutdown backends...");
        Backends?.Shutdown();
        Logs.Verbose("Shutdown sessions...");
        Sessions?.Shutdown();
        Logs.Verbose("Shutdown proxy handler...");
        ProxyHandler?.Stop();
        Logs.Verbose("Shutdown model handlers...");
        foreach (T2IModelHandler handler in T2IModelSets.Values)
        {
            handler.Shutdown();
        }
        Logs.Verbose("Shutdown extensions...");
        Extensions.RunOnAllExtensions(e => e.OnShutdown());
        Extensions.Extensions.Clear();
        Logs.Verbose("Shutdown image metadata tracker...");
        ImageMetadataTracker.Shutdown();
        Logs.Info("All core shutdowns complete.");
        if (Logs.LogSaveThread is not null)
        {
            if (Logs.LogSaveThread.IsAlive)
            {
                Logs.LogSaveCompletion.WaitOne();
            }
            Logs.SaveLogsToFileOnce();
        }
        Logs.Info("Process should end now.");
    }

    #region settings
    /// <summary>Load the settings file.</summary>
    public static void LoadSettingsFile()
    {
        FDSSection section;
        try
        {
            section = FDSUtility.ReadFile(SettingsFilePath);
        }
        catch (FileNotFoundException)
        {
            Logs.Init("No settings file found.");
            return;
        }
        catch (Exception ex)
        {
            Logs.Error($"Error loading settings file: {ex.ReadableString()}");
            return;
        }
        // TODO: Legacy format patch from Beta 0.6! Remove this before 1.0.
        string legacyLogLevel = section.GetString("LogLevel", null);
        string newLogLevel = section.GetString("Logs.LogLevel", null);
        if (legacyLogLevel is not null && newLogLevel is null)
        {
            section.Set("Logs.LogLevel", legacyLogLevel);
        }
        // TODO: Legacy format patch from Beta 0.9!
        bool? modelPerFolder = section.GetBool("Paths.ModelMetadataPerFolder", null);
        if (modelPerFolder.HasValue)
        {
            section.Set("Metadata.ModelMetadataPerFolder", modelPerFolder.Value);
        }
        bool? imagePerFolder = section.GetBool("Paths.ImageMetadataPerFolder", null);
        if (imagePerFolder.HasValue)
        {
            section.Set("Metadata.ImageMetadataPerFolder", imagePerFolder.Value);
        }
        // TODO: Legacy format patch from beta 0.9.2!
        bool? autoCompleteEscapeParens = section.GetBool("DefaultUser.AutoCompleteEscapeParens", null);
        if (autoCompleteEscapeParens.HasValue)
        {
            section.Set("DefaultUser.AutoComplete.EscapeParens", autoCompleteEscapeParens.Value);
        }
        string autoCompleteSource = section.GetString("DefaultUser.AutoCompletionsSource", null);
        if (autoCompleteSource is not null)
        {
            section.Set("DefaultUser.AutoComplete.Source", autoCompleteSource);
        }
        string autoCompleteSuffix = section.GetString("DefaultUser.AutoCompleteSuffix", null);
        if (autoCompleteSuffix is not null)
        {
            section.Set("DefaultUser.AutoComplete.Suffix", autoCompleteSuffix);
        }
        bool? allowUnsafeOutpath = section.GetBool("DefaultUserRestriction.AllowUnsafeOutpaths", null);
        if (allowUnsafeOutpath.HasValue)
        {
            SessionHandler.PatchOwnerAllowUnsafe = allowUnsafeOutpath.Value;
        }
        int? maxT2i = section.GetInt("DefaultUserRestriction.MaxT2ISimultaneous", null);
        if (maxT2i.HasValue)
        {
            SessionHandler.PatchOwnerMaxT2I = maxT2i.Value;
        }
        int? maxDepth = section.GetInt("DefaultUserRestriction.MaxOutPathDepth", null);
        if (maxDepth.HasValue)
        {
            SessionHandler.PatchOwnerMaxDepth = maxDepth.Value;
        }
        // TODO: Legacy format patch from beta 0.9.4!
        bool? checkForUpdates = section.GetBool("CheckForUpdates", null);
        if (checkForUpdates.HasValue)
        {
            section.Set("Maintenance.CheckForUpdates", checkForUpdates.Value);
        }
        bool? autoPullDevUpdates = section.GetBool("AutoPullDevUpdates", null);
        if (autoPullDevUpdates.HasValue)
        {
            section.Set("Maintenance.AutoPullDevUpdates", autoPullDevUpdates.Value);
        }
        ServerSettings.Load(section);
    }

    /// <summary>Save the settings file.</summary>
    public static void SaveSettingsFile()
    {
        if (LockSettings)
        {
            return;
        }
        try
        {
            FDSUtility.SaveToFile(ServerSettings.Save(true), SettingsFilePath);
            bool hasAlwaysPullFile = File.Exists("./src/bin/always_pull");
            if (ServerSettings.Maintenance.AutoPullDevUpdates && !hasAlwaysPullFile)
            {
                File.WriteAllText("./src/bin/always_pull", "true");
            }
            else if (!ServerSettings.Maintenance.AutoPullDevUpdates && hasAlwaysPullFile)
            {
                File.Delete("./src/bin/always_pull");
            }
        }
        catch (Exception ex)
        {
            Logs.Error($"Error saving settings file: {ex.ReadableString()}");
            return;
        }
    }
    #endregion

    #region command-line pre-apply
    private static readonly int[] CommonlyUsedPorts = [21, 22, 80, 8080, 7860, 8188];
    /// <summary>Pre-applies settings choices from command line.</summary>
    public static void ApplyCommandLineSettings()
    {
        ReapplySettings();
        string environment = GetCommandLineFlag("environment", "production").ToLowerFast() switch
        {
            "dev" or "development" => "Development",
            "prod" or "production" => "Production",
            var mode => throw new SwarmUserErrorException($"aspweb_mode value of '{mode}' is not valid")
        };
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", environment);
        string host = GetCommandLineFlag("host", ServerSettings.Network.Host);
        int port = int.Parse(GetCommandLineFlag("port", $"{ServerSettings.Network.Port}"));
        if (CommonlyUsedPorts.Contains(port))
        {
            Logs.Warning($"Port {port} looks like a port commonly used by other programs. You may want to change it.");
        }
        if (ServerSettings.Network.PortCanChange)
        {
            int origPort = port;
            while (Utilities.IsPortTaken(port))
            {
                port++;
            }
            if (origPort != port)
            {
                Logs.Init($"Port {origPort} was taken, using {port} instead.");
            }
        }
        WebServer.SetHost(host, port);
        NetworkBackendUtils.NextPort = ServerSettings.Network.BackendStartingPort;
        if (ServerSettings.Network.BackendPortRandomize)
        {
            NetworkBackendUtils.NextPort += Random.Shared.Next(2000);
        }
        if (NetworkBackendUtils.NextPort < 1000)
        {
              Logs.Warning($"BackendStartingPort setting {NetworkBackendUtils.NextPort} is a low-range value (below 1000), which may cause it to conflict with the OS or other programs. You may want to change it.");
        }
        WebServer.LogLevel = Enum.Parse<LogLevel>(GetCommandLineFlag("asp_loglevel", "warning"), true);
        SessionHandler.LocalUserID = GetCommandLineFlag("user_id", SessionHandler.LocalUserID);
        LockSettings = GetCommandLineFlagAsBool("lock_settings", false);
        if (CommandLineFlags.ContainsKey("ngrok-path"))
        {
            ProxyHandler = new()
            {
                Name = "Ngrok",
                Path = GetCommandLineFlag("ngrok-path", null),
                Region = GetCommandLineFlag("proxy-region", null),
                BasicAuth = GetCommandLineFlag("ngrok-basic-auth", null),
                Args = GetCommandLineFlag("proxy-added-args", ".")[1..].Split(' ', StringSplitOptions.RemoveEmptyEntries)
            };
        }
        string cloudflared = ServerSettings.Network.CloudflaredPath;
        if (CommandLineFlags.ContainsKey("cloudflared-path") || !string.IsNullOrWhiteSpace(cloudflared))
        {
            ProxyHandler = new()
            {
                Name = "Cloudflare",
                Path = GetCommandLineFlag("cloudflared-path", cloudflared).Trim('"'),
                Region = GetCommandLineFlag("proxy-region", null),
                Args = GetCommandLineFlag("proxy-added-args", ".")[1..].Split(' ', StringSplitOptions.RemoveEmptyEntries)
            };
        }
        LaunchMode = GetCommandLineFlag("launch_mode", ServerSettings.LaunchMode);
    }

    /// <summary>Applies runtime-changable settings.</summary>
    public static void ReapplySettings()
    {
        Logs.MinimumLevel = Enum.Parse<Logs.LogLevel>(GetCommandLineFlag("loglevel", ServerSettings.Logs.LogLevel), true);
        Logs.RepeatTimestampAfter = TimeSpan.FromMinutes(ServerSettings.Logs.RepeatTimestampAfterMinutes);
    }
    #endregion

    #region command line
    /// <summary>Parses command line argument inputs and splits them into <see cref="CommandLineFlags"/> and <see cref="CommandLineValueFlags"/>.</summary>
    public static void ParseCommandLineArgs(string[] args)
    {
        for (int i = 0; i < args.Length; i++)
        {
            string arg = args[i];
            if (!arg.StartsWith("--"))
            {
                throw new SwarmUserErrorException($"Error: Unknown command line argument '{arg}'");
            }
            string key = arg[2..].ToLower();
            string value;
            int equalsCharIndex = key.IndexOf('=');
            if (equalsCharIndex != -1)
            {
                if (equalsCharIndex == 0 || equalsCharIndex == (key.Length - 1))
                {
                    throw new SwarmUserErrorException($"Error: Invalid commandline argument '{arg}'");
                }
                value = key[(equalsCharIndex + 1)..];
                key = key[..equalsCharIndex];
            }
            else
            {
                if (i + 1 < args.Length && !args[i + 1].StartsWith("--"))
                {
                    value = args[++i];
                }
                else
                {
                    value = "true";
                }
            }
            if (CommandLineFlags.ContainsKey(key))
            {
                throw new SwarmUserErrorException($"Error: Duplicate command line flag '{key}'");
            }
            CommandLineFlags[key] = value;
        }
    }

    /// <summary>Command line value-flags are contained here. Flags without value contain string 'true'. Don't read this directly, use <see cref="GetCommandLineFlag(string, string)"/>.</summary>
    public static Dictionary<string, string> CommandLineFlags = [];

    /// <summary>Helper to identify when command line flags go unused.</summary>
    public static HashSet<string> CommandLineFlagsRead = [];

    /// <summary>Get the command line flag for a given name, and default value.</summary>
    public static string GetCommandLineFlag(string key, string def)
    {
        CommandLineFlagsRead.Add(key);
        if (CommandLineFlags.TryGetValue(key, out string value))
        {
            return value;
        }
        if (key.Contains('_'))
        {
            return GetCommandLineFlag(key.Replace("_", ""), def);
        }
        return def;
    }

    /// <summary>Gets the command line flag for the given key as a boolean.</summary>
    public static bool GetCommandLineFlagAsBool(string key, bool def)
    {
        return GetCommandLineFlag(key, def.ToString()).ToLowerFast() switch
        {
            "true" or "yes" or "1" => true,
            "false" or "no" or "0" => false,
            var mode => throw new SwarmUserErrorException($"Command line flag '{key}' value of '{mode}' is not valid")
        };
    }

    /// <summary>Prints a CLI usage help message, for when CLI args were wrong.</summary>
    public static void PrintCommandLineHelp()
    {
        Console.WriteLine($"""
            SwarmUI v{Utilities.Version}

            Options:
              [--data_dir <path>] [--settings_file <path>] [--backends_file <path>] [--environment <Production/Development>]
              [--host <hostname>] [--port <port>] [--asp_loglevel <level>] [--loglevel <level>]
              [--user_id <username>] [--lock_settings <true/false>] [--ngrok-path <path>] [--cloudflared-path <path>]
              [--proxy-region <region>] [--ngrok-basic-auth <auth-info>] [--launch_mode <mode>] [--help <true/false>]

            Generally, CLI args are almost never used. When they are are, they usually fall into the following categories:
              - `settings_file`, `lock_settings`, `backends_file`, `loglevel` may be useful to advanced users will multiple instances.
              - `cloudflared-path` is useful for remote tunnel users (eg colab).
              - `host`, `port`, and `launch_mode` may be useful in developmental usages where you need to quickly or automatically change network paths.

            Additional documentation about the CLI args is available online: <https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Command%20Line%20Arguments.md> or in the `docs/` folder of this repo.

            Find more information about SwarmUI in the GitHub readme and docs folder:
              - Project Github: <https://github.com/mcmonkeyprojects/SwarmUI>
              - Documentation: <https://github.com/mcmonkeyprojects/SwarmUI/tree/master/docs>
              - Feature Announcements: <https://github.com/mcmonkeyprojects/SwarmUI/discussions/1>
              - License (MIT): <https://github.com/mcmonkeyprojects/SwarmUI/blob/master/LICENSE.txt>

            Join the Discord <https://discord.gg/q2y38cqjNw> to discuss the project, get support, see announcements, etc.
            """);
    }
    #endregion
}
