using FreneticUtilities.FreneticDataSyntax;
using SwarmUI.Backends;
using SwarmUI.Utils;
using System.Reflection;

namespace SwarmUI.Core;

/// <summary>Central default settings list.</summary>
public class Settings : AutoConfiguration
{
    [ConfigComment("Settings related to file paths.")]
    public PathsData Paths = new();

    [ConfigComment("Settings related to image/model metadata.")]
    public MetadataSection Metadata = new();

    [ConfigComment("Settings related to networking and the webserver.")]
    public NetworkData Network = new();

    [ConfigComment("Settings related to Swarm server maintenance.")]
    public ServerMaintenanceData Maintenance = new();

    [ConfigComment("Default settings for users (unless the user modifies them, if so permitted).\n(NOTE: Usually, don't edit this. Go to the 'User' tab to edit your User-Settings).")]
    public User DefaultUser = new();

    [ConfigComment("Settings related to backends.")]
    public BackendData Backends = new();

    [ConfigComment("If this is set to 'true', hides the installer page. If 'false', the installer page will be shown.")]
    [SettingHidden]
    public bool IsInstalled = false;

    [ConfigComment("The date that this instance was installed.")]
    [SettingHidden]
    public string InstallDate = "";

    [ConfigComment("The SwarmUI version that this instance was installed as.")]
    [SettingHidden]
    public string InstallVersion = "";

    [ConfigComment("Ratelimit, in milliseconds, between Nvidia GPU status queries. Default is 1000 ms (1 second).")]
    public long NvidiaQueryRateLimitMS = 1000;

    [ConfigComment("How to launch the UI. If 'none', just quietly launch.\nIf 'web', launch your web-browser to the page.\nIf 'webinstall', launch web-browser to the install page.\nIf 'electron', launch the UI in an electron window (NOT YET IMPLEMENTED).")]
    [ManualSettingsOptions(Impl = null, Vals = ["none", "web", "webinstall", "electron"])]
    public string LaunchMode = "webinstall";

    [ConfigComment("If set true, some additional debugging data will be attached where relevant, such as in image metadata.")]
    public bool AddDebugData = false;

    [ConfigComment("If set true, new/upcoming/experimental features will be visible.\nEnabling this will cause issues, do not expect a stable server.\nDo not report any bugs while this is enabled, and do not request new features related to experimental features.")]
    public bool ShowExperimentalFeatures = false;

    [ConfigComment("Settings related to authorization.")]
    public AuthorizationData Authorization = new();

    [ConfigComment("Settings related to logging.")]
    public LogsData Logs = new();

    [ConfigComment("Settings related to the User Interface.")]
    public UIData UI = new();

    [ConfigComment($"Settings related to webhooks. See documentation in <a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}Features/Webhooks.md\">the docs here</a>")]
    public WebHooksData WebHooks = new();

    [ConfigComment("Settings related to server performance.")]
    public PerformanceData Performance = new();

    /// <summary>Settings related to Swarm server maintenance..</summary>
    public class ServerMaintenanceData : AutoConfiguration
    {
        [ConfigComment("If true, Swarm will check if there's any updates available during startup. If false, it will not check for updates.\nUpdate check only runs a 'git fetch' from GitHub to get the list of git version tags, it does not transmit any telemetry nor does it actually apply the update.\nDefaults to true.")]
        public bool CheckForUpdates = true;

        [ConfigComment("If true, Swarm will automatically download and apply any development version updates as soon as they're available.\nDefaults to false.")]
        public bool AutoPullDevUpdates = false;

        [ConfigComment("If the server has been running more than this many hours, automatically restart.\nIf set to 0, no automatic restart.\nOnly restarts when the server is not processing any generation requests.\nCan use decimal values, but sub-hour durations are likely too fast and will cause issues.\nA value of eg 24 is reasonable, with AutoPullDevUpdates enabled, to keep an updated persistent server.")]
        public double RestartAfterHours = 0;

        [ConfigComment("Comma-separated list of numeric 24-hour time hours in which auto-restarting is allowed.\nIf empty, hours are unrestricted.\nFor example, '0,1,2,3' only allows auto-restarting from midnight up until before 4 am.\nOr, '22,23,0,1' allows 10pm-2am.")]
        public string RestartHoursAllowed = "";

        [ConfigComment("Comma-separated list of numeric days-of-week in which auto-restarting is allowed. Sunday is 0, Saturday is 6.\nIf empty, days are unrestricted.\nFor example, '6,0' only allows auto-restarting from Sunday/Saturday.")]
        public string RestartDayAllowed = "";
    }

    /// <summary>Settings related to authorization.</summary>
    public class AuthorizationData : AutoConfiguration
    {
        [ConfigComment("If true, Swarm will require users to log in or use an API key to access the UI. If false, the UI will be open to anyone who can connect to it.\nDefaults to false.")]
        public bool AuthorizationRequired = false;

        [ConfigComment("If true, a direct connection from localhost can bypass login requirements.\nIf false, even local users will be required to login (they can just go manually edit the server settings file to toggle this though).\nDefaults to true.")]
        public bool AllowLocalhostBypass = true;
    }

    /// <summary>Settings related to logging.</summary>
    public class LogsData : AutoConfiguration
    {
        [ConfigComment("The minimum tier of logs that should be visible in the console and saved to file.\nDefault is 'info'.")]
        [SettingsOptions(Impl = typeof(SettingsOptionsAttribute.ForEnum<Logs.LogLevel>))]
        public string LogLevel = "Info";

        [ConfigComment("If true, logs will be saved to a file. If false, logs will be available in console and UI while running, but never saved to file.\nDefaults to false.\nMust restart Swarm to apply.")]
        public bool SaveLogToFile = false;

        [ConfigComment("The path for where to store log file, parsed at time of program start, relative to the Data directory.\nMust restart Swarm to apply.\nCan use [year], [month], [month_name], [day], [day_name], [hour], [minute], [second], [pid].")]
        public string LogsPath = "Logs/[year]-[month]/[day]-[hour]-[minute].log";

        [ConfigComment("How long (in minutes) the console may be idle for before the next message should have a full date/time stamp shown in it.\nThis is for Swarm instances that are left open for long times, to make gaps in usage clearer.\nThis will not show at all in Swarm is used consistently smaller than this duration.\nSet to 9999999 to disable this behavior.\nDefaults to 10 minutes.")]
        public double RepeatTimestampAfterMinutes = 10;
    }

    /// <summary>Settings related to server performance.</summary>
    public class PerformanceData : AutoConfiguration
    {
        [ConfigComment("How likely an outdated image metadata entry is to be revalidated (ie have it's mtime checked against storage) each time an image's metadata is pulled.\nDefault 0.05 means 5% chance.\nSSD users can safely set it higher. HDD users may be happier setting it to 0.\nMetadata is always loaded the first time an image is seen.")]
        public float ImageDataValidationChance = 0.05f;

        [ConfigComment("Can be enabled to cache certain backend data.\nFor example, with ComfyUI backends this will add an extended cache on the object_info data.\nDefaults to false.")]
        public bool DoBackendDataCache = false;

        [ConfigComment("If true, Swarm may use GPU-specific optimizations.\nIf false, Swarm will not try to optimize anything in a way specific to the GPU(s) you have.\nSome very minor quality changes may result.\nIf you encounter error that are solved by turning this off, please report that as a bug immediately.\nDefaults to 'true'. Should be left as 'true' in almost all circumstances.")]
        public bool AllowGpuSpecificOptimizations = true;

        [ConfigComment("How many models can be loaded in a model list at once.\nPast this count, the list will simply be cut off.\nUse sub-folder organization to prevent issues.")]
        public int ModelListSanityCap = 2000;
    }

    /// <summary>Settings related to backends.</summary>
    public class BackendData : AutoConfiguration
    {
        [ConfigComment("How many times to retry initializing a backend before giving up. Default is 3.")]
        public int MaxBackendInitAttempts = 3;

        [ConfigComment("Safety check, the maximum duration all requests can be waiting for a backend before the system declares a backend handling failure.\nIf you get backend timeout errors while intentionally running very long generations, increase this value.")]
        public int MaxTimeoutMinutes = 120;

        [ConfigComment("The maximum duration an individual request can be waiting on a backend to be available before giving up.\n"
            + "Not to be confused with 'MaxTimeoutMinutes' which requires backends be unresponsive for that duration, this duration includes requests that are merely waiting because other requests are queued."
            + "\nDefaults to 60 * 24 * 7 = 1 week (ultra-long max queue duration).")]
        public int PerRequestTimeoutMinutes = 60 * 24 * 7;

        [ConfigComment("The maximum number of pending requests to continue forcing orderly processing of.\nOver this limit, requests may start going out of order.")]
        public int MaxRequestsForcedOrder = 20;

        [ConfigComment("If true, max t2i simultaneous value is not limited by backend count.\nIe, users may queue as many gens as they want directly to backends, with no overload prevention.\nThis may be preferable on personal instances of Swarm to enforce stricter queue ordering.\nUser role max t2i simultaneous value is still applied.")]
        public bool UnrestrictedMaxT2iSimultaneous = false;

        [ConfigComment("How many minutes to wait after the last generation before automatically freeing up VRAM (to prevent issues with other programs).\nThis has the downside of a small added bit of time to load back onto VRAM at next usage.\nUse a decimal number to free after seconds.\nDefaults to 10 minutes.")]
        public double ClearVRAMAfterMinutes = 10;

        [ConfigComment("How many minutes to wait after the last generation before automatically freeing up system RAM (to prevent issues with other programs).\nThis has the downside of causing models to fully load from data drive at next usage.\nUse a decimal number to free after seconds.\nDefaults to 60 minutes (one hour).")]
        public double ClearSystemRAMAfterMinutes = 60;

        [ConfigComment("If true, any time you load the UI, trigger a server refresh.\nIf false, only triggers a refresh if you restart Swarm or trigger a refresh manually from the Quick Tools menu.\nDefaults to true.")]
        public bool AlwaysRefreshOnLoad = true;
    }

    /// <summary>Settings related to networking and the webserver.</summary>
    public class NetworkData : AutoConfiguration
    {
        [ConfigComment("Optionally set an external URL here, eg 'https://swarm.example.com'\nThis is not used for any practical function,\nand only will be used for automatically displaying fully formed URLs in some special cases, such as when transmitting webhooks.\nIf unset, an autogenerated value based on the Host and port will be used.")]
        public string ExternalURL = "";

        /// <summary>Helper to get the actual current external URL, properly formatted, no trailing slash.</summary>
        public string GetExternalUrl()
        {
            if (!string.IsNullOrWhiteSpace(ExternalURL))
            {
                return ExternalURL.TrimEnd('/');
            }
            string host = Host == "*" || Host == "0.0.0.0" ? "localhost" : Host;
            return $"http://{host}:{Port}";
        }

        [ConfigComment("What web host address to use. `localhost` means your PC only."
            + "\nLinux users may use `0.0.0.0` to mean accessible to anyone that can connect to your PC (ie LAN users, or the public if your firewall is open)."
            + "\nWindows users may use `*` for that, though it may require additional Windows firewall configuration."
            + "\nAdvanced server users may wish to manually specify a host bind address here.")]
        public string Host = "localhost";

        [ConfigComment("What web port to use. Default is '7801'.")]
        public int Port = 7801;

        [ConfigComment("If true, if the port is already in use, the server will try to find another port to use instead.\nIf false, the server will fail to start if the port is already in use.")]
        public bool PortCanChange = true;

        [ConfigComment("Backends are automatically assigned unique ports. This value selects which port number to start the assignment from.\nDefault is '7820'.")]
        public int BackendStartingPort = 7820;

        [ConfigComment("If enabled, backend starting port will be randomly offset at each restart.\nThis is an obscure bug fix for 'stuck ports', where restarting and reusing the same backend port causes strange misbehaviors.")]
        public bool BackendPortRandomize = false;

        [ConfigComment("If you wish to access your Swarm instance externally, set this to the path of a CloudFlared executable, and it will automatically be used.\n(Must restart to apply).\nThe URL will be visible on the Server Info tab and/or terminal log.\nSee documentation in <a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}Advanced Usage.md#accessing-swarmui-from-other-devices\">the docs here</a>")]
        public string CloudflaredPath = "";

        [ConfigComment("Any IPs that can bypass authorization requirements, as a comma-separated list.\nDefaults to '127.0.0.1' (localhost IPv4) and '::1' (localhost IPv6).")]
        public string AuthBypassIPs = "127.0.0.1,::1";

        [ConfigComment("If set, connections will require an Authorization header.\nThis is intended for if you're hosting your Swarm instance to a public IP and want to reduce the risks from it being exposed.\nUsing a safe reverse proxy with actual authentication such as Apache2 is recommended instead.\nThis is a simple equality check, and should be something like `Bearer some_passphrase_or_something_here`.\nDefaults to empty (no authorization required).\nIf you accidentally lock yourself out, edit `Data/Settings.fds` to remove this setting and restart Swarm.")]
        public string RequiredAuthorization = "";

        [ConfigComment("If true, special network forwarding logic will apply for developer modes.\nNotably, ComfyUI Frontend NPM Developer Mode requires significant special forwarding as it misroutes itself.\nDefaults to false.")]
        public bool EnableSpecialDevForwarding = false;

        [ConfigComment("How long should browsers be told they can store cached copies of output images.\nDefaults to 30 seconds.\nDo not set less than 5-ish, temp-caching is important. Setting to a low value (like 5) can help if you often delete images and regenerate with the same filename.\nSome files (eg html/js for grids) in output always have a very low cache duration.")]
        public int OutputCacheSeconds = 30;

        [ConfigComment("Optional CORS header to set. If empty, no CORS header will be set.\nDefaults to empty.")]
        public string AccessControlAllowOrigin = "";
    }

    /// <summary>Settings related to file paths.</summary>
    public class PathsData : AutoConfiguration
    {
        [ConfigComment("Root path for model files. Use a full-formed path (starting with '/' or a Windows drive like 'C:') to use an absolute path.\nDefaults to 'Models'.\nUse a semicolon ';' to split multiple paths.")]
        public string ModelRoot = "Models";

        public string ActualModelRoot => Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, ModelRoot.Split(';')[0]);

        [ConfigComment("The model folder to use within 'ModelRoot'.\nDefaults to 'Stable-Diffusion'.\n'checkpoints' should be used for matching pre-existing ComfyUI model directories.\nAbsolute paths work too (usually do not use an absolute path, use just a folder name).\nUse a semicolon ';' to split multiple paths.")]
        public string SDModelFolder = "Stable-Diffusion";

        [ConfigComment("The LoRA (or related adapter type) model folder to use within 'ModelRoot'.\nDefaults to 'Lora'.\nAbsolute paths work too (usually do not use an absolute path, use just a folder name).\nUse a semicolon ';' to split multiple paths.")]
        public string SDLoraFolder = "Lora";

        [ConfigComment("The VAE (autoencoder) model folder to use within 'ModelRoot'.\nDefaults to 'VAE'.\nAbsolute paths work too (usually do not use an absolute path, use just a folder name).\nUse a semicolon ';' to split multiple paths.")]
        public string SDVAEFolder = "VAE";

        [ConfigComment("The Embedding (eg textual inversion) model folder to use within 'ModelRoot'.\nDefaults to 'Embeddings'.\nAbsolute paths work too (usually do not use an absolute path, use just a folder name).\nUse a semicolon ';' to split multiple paths.")]
        public string SDEmbeddingFolder = "Embeddings";

        [ConfigComment("The ControlNets model folder to use within 'ModelRoot'.\nDefaults to 'controlnet'.\nAbsolute paths work too (usually do not use an absolute path, use just a folder name).\nUse a semicolon ';' to split multiple paths.")]
        public string SDControlNetsFolder = "controlnet";

        [ConfigComment("The CLIP (Text Encoder) model folder to use within 'ModelRoot'.\nDefaults to 'clip'.\nAbsolute paths work too (usually do not use an absolute path, use just a folder name).\nUse a semicolon ';' to split multiple paths.")]
        public string SDClipFolder = "clip";

        [ConfigComment("The CLIP Vision model folder to use within 'ModelRoot'.\nDefaults to 'clip_vision'.\nAbsolute paths work too (usually do not use an absolute path, use just a folder name).\nUse a semicolon ';' to split multiple paths.")]
        public string SDClipVisionFolder = "clip_vision";

        [ConfigComment("Root path for data (user configs, etc).\nDefaults to 'Data'\nAbsolute paths work too.")]
        public string DataPath = "Data";

        [ConfigComment("Root path for output files (images, etc).\nDefaults to 'Output'\nAbsolute paths work too.")]
        public string OutputPath = "Output";

        [ConfigComment("The folder for wildcard (.txt) files, under Data.\nDefaults to 'Wildcards'\nAbsolute paths work too.")]
        public string WildcardsFolder = "Wildcards";

        [ConfigComment("When true, output paths always have the username as a folder.\nWhen false, this will be skipped.\nKeep this on in multi-user environments.")]
        public bool AppendUserNameToOutputPath = true;

        [ConfigComment("If true, when a user deletes an image, send it to the OS Recycle Bin instead of permanently deleting it.\nIf false, image files are permanently deleted.\nDefaults to false.")]
        public bool RecycleDeletedImages = false;

        [ConfigComment("If true, when a user deletes a model, send it to the OS Recycle Bin instead of permanently deleting it.\nIf false, model files are permanently deleted.\nDefaults to false.")]
        public bool RecycleDeletedModels = false;

        [ConfigComment("If true, when a user edits a model's metadata, clear all stray data (eg old images, jsons, etc.) even from other UIs.\nIf false, only files controlled by Swarm will be altered.\nDefaults to false.")]
        public bool ClearStrayModelData = false;

        [ConfigComment("If true, when a user edits a model's metadata, if there are multiple copies of that model in different folders, edit all copies.\nBe warned that if the models with the same name are different, the unique data maybe lost.\nThis is only a relevant option for users with redundant storage (eg a local drive and a NAS).\nThis also applies to deletes and renames.\nIf false, only the file in the first folder will be edited.\nDefaults to false.")]
        public bool EditMetadataAcrossAllDups = false;

        [ConfigComment("If true, always resave models after the downloader utility grabs them.\nThis ensures metadata is fully properly set, but wastes some extra time on file processing.\nIf false, the downloader will leave a stray json next to the model.\nDefaults to false.")]
        public bool DownloaderAlwaysResave = false;
    }

    /// <summary>Settings related to image/model metadata.</summary>
    public class MetadataSection : AutoConfiguration
    {
        [ConfigComment("If true, model metadata is tracked on a per-folder basis. This is better for example if you copy model folders to different machines, or have symlinks to different instances, or etc.\nIf false, model metadata is tracked in the central data folder. This is better if you don't want stray files in your model folders, or if you have several Swarm instances running simultaneously.")]
        public bool ModelMetadataPerFolder = false;

        [ConfigComment("If true, image metadata is tracked on a per-folder basis.\nIf false, image metadata is tracked in the central data folder.\nThis is better if you don't want stray files in your output folders, or if you have several Swarm instances running simultaneously over the same output folders.")]
        public bool ImageMetadataPerFolder = true;

        [ConfigComment("If true, unrecognized XL-format models will be treated as SDXL 1.0.\nIf false, unrecognized XL-format models will be treated as SDXL 0.9.\nThe SDXL 1.0 specification requires ModelSpec architecture IDs, and any similar model lacking this ID is a 0.9 model,\nhowever, many custom XL model author have excluded this metadata.\nThis means those models are technically SDXL 0.9 models, however it can be convenient to pretend they are 1.0 models instead.\nNote that enabling this will mislabel the official SDXL 0.9 model.")]
        public bool XLDefaultAsXL1 = false;

        [ConfigComment("If true, editing model metadata should write a '.swarm.json' file next to the model.\nIf false, apply metadata to the model itself.\nApplying directly to the model is generally better, however the JSON file might be preferable if you have a very slow data drive, as it avoids rewriting the model content.")]
        public bool EditMetadataWriteJSON = false;

        [ConfigComment("If true, image metadata will include a list of models with their hashes.\nThis is useful for services like civitai to automatically link models.\nThis will cause extra time to be taken when new hashes need to be loaded.")]
        public bool ImageMetadataIncludeModelHash = false;
    }

    /// <summary>Settings per-user.</summary>
    public class User : AutoConfiguration
    {
        public class OutPath : AutoConfiguration
        {
            [ConfigComment("Builder for output file paths. Can use auto-filling placeholders like '[model]' for the model name, '[prompt]' for a snippet of prompt text, etc.\n"
                + $"Full details in <a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}User%20Settings.md#path-format\">the docs here</a>")]
            public string Format = "raw/[year]-[month]-[day]/[hour][minute]-[prompt]-[model]-[seed]";

            [ConfigComment("How long any one part can be.\nDefault is 40 characters.")]
            public int MaxLenPerPart = 40;

            [ConfigComment("If true, when including model name (or loras or etc), the path will skip the folder (ie filename only).")]
            public bool ModelPathsSkipFolders = false;
        }

        [ConfigComment("Settings related to output path building.")]
        public OutPath OutPathBuilder = new();

        public class FileFormatData : AutoConfiguration
        {
            [ConfigComment("What format to save images in.\nDefault is '.png', but '.jpg' is recommended to save some filespace.")]
            [SettingsOptions(Impl = typeof(SettingsOptionsAttribute.ForEnum<Image.ImageFormat>))]
            public string ImageFormat = "PNG";

            [ConfigComment("Whether to store metadata into saved images.\nDefaults enabled.")]
            public bool SaveMetadata = true;

            [ConfigComment("If set to non-0, adds DPI metadata to saved images.\n'72' is a good value for compatibility with some external software.")]
            public int DPI = 0;

            [ConfigComment("If set to true, a '.txt' file will be saved alongside images with the image metadata easily viewable.\nThis can work even if saving in the image is disabled. Defaults disabled.")]
            public bool SaveTextFileMetadata = false;
        }

        [ConfigComment("Settings related to saved file format.")]
        public FileFormatData FileFormat = new();

        [ConfigComment("Whether your image output files save to server data drive or not.\nDisabling this can make some systems misbehave, and makes the Image History do nothing.")]
        public bool SaveFiles = true;

        [ConfigComment("If true, folders will be discarded from starred image paths.")]
        public bool StarNoFolders = false;

        [ConfigComment("List of role IDs applied to this user. Defaults to owner (for local/accountless usage).")]
        [ValueIsRestricted]
        public List<string> Roles = ["owner"];

        [ConfigComment("The user's password.\nThis is not stored in user-readable format.\nReplace the value to set a new password.")]
        [ValueIsSecret]
        public string Password = "";

        public class ThemesImpl : SettingsOptionsAttribute.AbstractImpl
        {
            public override string[] GetOptions => [.. Program.Web.RegisteredThemes.Keys];

            public override string[] Names => Program.Web.RegisteredThemes.Values.Select(v => v.Name).ToArray();
        }

        [ConfigComment("What theme to use. Default is 'modern_dark'.")]
        [SettingsOptions(Impl = typeof(ThemesImpl))]
        public string Theme = "modern_dark";

        [ConfigComment("If true, images in the main center area will always grow to better fill the screen.")]
        public bool CenterImageAlwaysGrow = false;

        [ConfigComment("If true, when 'Auto Swap To Images' is enabled, and you have FullView open, the FullView will also be swapped.\nIf false, the FullView will not change.")]
        public bool AutoSwapImagesIncludesFullView = false;

        [ConfigComment("A list of what buttons to include directly under images in the main prompt area of the Generate tab.\nOther buttons will be moved into the 'More' dropdown.\nThis should be a comma separated list."
            + "\nThe following options are available: \"Use As Init\", \"Use As Image Prompt\", \"Edit Image\", \"Upscale 2x\", \"Star\", \"Reuse Parameters\", \"Open In Folder\", \"Delete\", \"Download\" \"View In History\", \"Refine Image\""
            + "\nThe default is blank, which currently implies 'Use As Init,Edit Image,Star,Reuse Parameters'")]
        public string ButtonsUnderMainImages = "";

        [ConfigComment("If enabled, batch size will be reset to 1 when parameters are loaded.\nThis can prevent accidents that might thrash your GPU or cause compatibility issues, especially for example when importing a comfy workflow.\nYou can still set the batch size at will in the GUI.")]
        public bool ResetBatchSizeToOne = false;

        public enum HintFormatOptions
        {
            BUTTON, HOVER, HOVER_DELAY, NONE
        }

        [ConfigComment("The format for parameter hints to display as.\nDefault is 'BUTTON'.")]
        [SettingsOptions(Impl = typeof(SettingsOptionsAttribute.ForEnum<HintFormatOptions>))]
        public string HintFormat = "BUTTON";

        [ConfigComment("The delay, in seconds, for parameter hints when 'HOVER_DELAY' is selected.")]
        public float HoverDelaySeconds = 0.5f;

        [ConfigComment("How many lines of text to display in the standard prompt box before cutting off to a scroll bar.\nActual size in practice tends to be a few lines shorter due to browser and font variations.\nDefault is 10.")]
        public int MaxPromptLines = 10;

        public class VAEsData : AutoConfiguration
        {
            [ConfigComment("What VAE to use with SDXL models by default. Use 'None' to use the one in the model.")]
            [ManualSettingsOptions(Impl = null, Vals = ["None"])]
            public string DefaultSDXLVAE = "None";

            [ConfigComment("What VAE to use with SDv1 models by default. Use 'None' to use the one in the model.")]
            [ManualSettingsOptions(Impl = null, Vals = ["None"])]
            public string DefaultSDv1VAE = "None";

            [ConfigComment("What VAE to use with SVD (Video) models by default. Use 'None' to use the one in the model. This should normally be an SDv1 VAE.")]
            [ManualSettingsOptions(Impl = null, Vals = ["None"])]
            public string DefaultSVDVAE = "None";

            [ConfigComment("What VAE to use with Flux models by default.")]
            [ManualSettingsOptions(Impl = null, Vals = ["None"])]
            public string DefaultFluxVAE = "None";

            [ConfigComment("What VAE to use with SD3 models by default.")]
            [ManualSettingsOptions(Impl = null, Vals = ["None"])]
            public string DefaultSD3VAE = "None";

            [ConfigComment("What VAE to use with Mochi Text2Video models by default.")]
            [ManualSettingsOptions(Impl = null, Vals = ["None"])]
            public string DefaultMochiVAE = "None";
        }

        [ConfigComment("Options to override default VAEs with.")]
        public VAEsData VAEs = new();

        [ConfigComment("Set to a number above 1 to allow generations of multiple images to automatically generate square mini-grids when they're done.")]
        public int MaxImagesInMiniGrid = 1;

        [ConfigComment("How many images the history view should stop trying to load after.")]
        public int MaxImagesInHistory = 1000;

        [ConfigComment("How many images the history view should scan server-side before deciding the list is sufficient for sorting. Not relevant when sorting by filename.")]
        public int MaxImagesScannedInHistory = 10000;

        [ConfigComment("If true, the Image History view will cache small preview thumbnails of images.\nThis should make things run faster. You can turn it off if you don't want that.")]
        public bool ImageHistoryUsePreviews = true;

        [ConfigComment("When generating live previews (ie the turbo preview system, not normal generation previews after you've hit the Generate button),\nthis is how many simultaneous generation requests can be waiting at one time.")]
        public int MaxSimulPreviews = 1;

        [ConfigComment("Delay, in seconds, between Generate Forever updates.\nIf the delay hits and a generation is still waiting, it will be skipped.\nDefault is 0.1 seconds.")]
        public double GenerateForeverDelay = 0.1;

        [ConfigComment("Number of generations that Generate Forever should always keep queued up when enabled.\nUseful when using multiple backends to keep them all busy.")]
        public int GenerateForeverQueueSize = 1;

        [ConfigComment("How long to remember your last parameters for, in hours, inside browser cookies.\nDefault is 6 hours (long enough that you can close+reopen and get same params, but short enough that if you close for the day and come back you get a fresh UI).")]
        public double ParameterMemoryDurationHours = 6;

        public class LanguagesImpl : SettingsOptionsAttribute.AbstractImpl
        {
            public override string[] GetOptions => LanguagesHelper.SortedList;
        }

        [ConfigComment("What language to display the UI in.\nDefault is 'en' (English).")]
        [SettingsOptions(Impl = typeof(LanguagesImpl))]
        public string Language = "en";

        [ConfigComment("Comma-separated list of parameters to exclude from 'Reuse Parameters'.\nFor example, set 'model' to not copy the model, or 'model,refinermodel,videomodel' to really never copy any models.")]
        public string ReuseParamExcludeList = "wildcardseed";

        /// <summary>Settings related to audio.</summary>
        public class AudioData : AutoConfiguration
        {

            public class AudioImpl : SettingsOptionsAttribute.AbstractImpl
            {
                public override string[] GetOptions => ["", .. UserSoundHelper.Filenames];
            }

            [ConfigComment($"Optional audio file to play when a generation is completed.\nSupported file formats: .wav, .wave, .mp3, .aac, .ogg, .flac\nSee <a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}Features/UISounds.md\">docs/Features/UISounds</a> for info.")]
            [SettingsOptions(Impl = typeof(AudioImpl))]
            public string CompletionSound = "";

            [ConfigComment($"If any sound effects are enabled, this is the volume they will play at.\n0 means silent, 1 means max volume, 0.5 means half volume.")]
            public double Volume = 0.5;
        }

        [ConfigComment("Settings related to audio.")]
        public AudioData Audio = new();

        [ConfigComment("Settings related to autocompletions.")]
        public AutoCompleteData AutoComplete = new();

        /// <summary>Settings related to autocompletions.</summary>
        public class AutoCompleteData : AutoConfiguration
        {
            public class SourceImpl : SettingsOptionsAttribute.AbstractImpl
            {
                public override string[] GetOptions => ["", .. AutoCompleteListHelper.FileNames];
            }

            [ConfigComment($"Optional source file for auto-completion texts (inside Data/Autocompletions).\nSee <a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}Features/Autocompletions.md#word-lists\">docs/Features/Autocompletions</a> for info.")]
            [SettingsOptions(Impl = typeof(SourceImpl))]
            public string Source = "";

            [ConfigComment("If true, the auto-completion will escape parentheses with backslashes to prevent parsing errors.")]
            public bool EscapeParens = true;

            [ConfigComment("Optional suffix to append to autocompletes, eg ', ' to append commas.")]
            public string Suffix = "";

            [ConfigComment("How to match and list results.\n'Contains' lists any match that contains your current text\n'StartsWith' only lists matches that start with your current text\n'Bucketed' shows StartsWith matches first, and Contains matches after.")]
            [ManualSettingsOptions(Impl = null, Vals = ["Bucketed", "Contains", "StartsWith"])]
            public string MatchMode = "Bucketed";

            [ConfigComment("How to sort the results.\n'Active' sorts shortest tags first, then alphabetically after.\n'Alphabetical' sorts results alphabetically.\n'Frequency' sorts results by how popular the tag is (for tag CSVs).\n'None' uses whatever the source list's order is.")]
            [ManualSettingsOptions(Impl = null, Vals = ["Active", "Alphabetical", "Frequency", "None"])]
            public string SortMode = "Active";

            [ConfigComment("If your completion list is booru tags, use this to optionally alter how spaces/underscores are handled.\nSelect 'None' to just use what's in the file,\n'Spaces' to replace underscores to spaces,\nor 'Underscores' to replace spaces to underscores.")]
            [ManualSettingsOptions(Impl = null, Vals = ["None", "Spaces", "Underscores"])]
            public string SpacingMode = "None";
        }
    }

    /// <summary>UI-related settings.</summary>
    public class UIData : AutoConfiguration
    {
        [ConfigComment("Optionally specify a (raw HTML) welcome message here. If specified, will override the automatic welcome messages.")]
        public string OverrideWelcomeMessage = "";

        [ConfigComment("Animated previews make the image history nicer when you've generated videos, but may negatively impact performance.\nIf having image history loaded with videos generated is negatively affecting your experience, disable this checkbox.\nAfter editing this setting, use the Reset All Metadata button in the Utilities tab.")]
        public bool AllowAnimatedPreviews = true;
    }

    /// <summary>Webhook settings.</summary>
    public class WebHooksData : AutoConfiguration
    {
        [ConfigComment("Webhook to call (JSON POST) when queues are starting up from idle.\nLeave empty to disable any webhook.\nCall must return before the first generation starts.")]
        public string QueueStartWebhook = "";

        [ConfigComment("If you want to send additional data with the queue start webhook, you can specify it here.\nThis should be a JSON object, eg '{\"key\": \"value\"}'.\nIf left blank, an empty JSON post (ie '{}') will be used.")]
        public string QueueStartWebhookData = "";

        [ConfigComment("Webhook to call (JSON POST) when all queues are done and the server is going idle.\nLeave empty to disable any webhook.\nCall must return before queuing may restart.")]
        public string QueueEndWebhook = "";

        [ConfigComment("If you want to send additional data with the queue end webhook, you can specify it here.\nThis should be a JSON object, eg '{\"key\": \"value\"}'.\nIf left blank, an empty JSON post (ie '{}') will be used.")]
        public string QueueEndWebhookData = "";

        [ConfigComment("Webhook to call (JSON POST) after every generation.\nLeave empty to disable any webhook.\nCurrently runs async, does not delay gen completion.")]
        public string EveryGenWebhook = "";

        [ConfigComment("If you want to send additional data with the every-gen webhook, you can specify it here.\nThis should be a JSON object, eg '{\"key\": \"value\"}'.\nIf left blank, an empty JSON post (ie '{}') will be used." + $"\nSee <a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}Features/Webhooks.md\">docs Features/Webhooks</a> for info about special tags you can include in the JSON.")]
        public string EveryGenWebhookData = "";

        [ConfigComment("Webhook to call (JSON POST) after gens that set Swarm internal param 'Webook' as 'Manual' or 'Manual At End'.\nLeave empty to disable any webhook.\nCurrently runs async, does not delay gen completion.")]
        public string ManualGenWebhook = "";

        [ConfigComment("If you want to send additional data with the 'manual gen' webhook, you can specify it here.\nThis should be a JSON object, eg '{\"key\": \"value\"}'.\nIf left blank, an empty JSON post (ie '{}') will be used." + $"\nSee <a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}Features/Webhooks.md\">docs Features/Webhooks</a> for info about special tags you can include in the JSON.")]
        public string ManualGenWebhookData = "";

        [ConfigComment("Webhook to call (JSON POST) when the server is has started.\nLeave empty to disable any webhook.")]
        public string ServerStartWebhook = "";

        [ConfigComment("If you want to send additional data with the 'server start' webhook, you can specify it here.\nThis should be a JSON object, eg '{\"key\": \"value\"}'.\nIf left blank, an empty JSON post (ie '{}') will be used.")]
        public string ServerStartWebhookData = "";

        [ConfigComment("Webhook to call (JSON POST) when the server is about to shutdown.\nLeave empty to disable any webhook.\nShutdown does not happen until the webhook completes.")]
        public string ServerShutdownWebhook = "";

        [ConfigComment("If you want to send additional data with the 'server shutdown' webhook, you can specify it here.\nThis should be a JSON object, eg '{\"key\": \"value\"}'.\nIf left blank, an empty JSON post (ie '{}') will be used.")]
        public string ServerShutdownWebhookData = "";

        [ConfigComment("How long to wait (in seconds) after all queues are done before sending the queue end webhook.\nThis is useful to prevent rapid start+end calls.")]
        public double QueueEndDelay = 1;
    }
}

[AttributeUsage(AttributeTargets.Field)]
public class SettingsOptionsAttribute : Attribute
{
    public abstract class AbstractImpl
    {
        public abstract string[] GetOptions { get; }

        public virtual string[] Names => GetOptions;
    }

    public class ForEnum<T> : AbstractImpl where T : Enum
    {
        public override string[] GetOptions => Enum.GetNames(typeof(T));
    }

    public Type Impl;

    public virtual string[] Options => (Activator.CreateInstance(Impl) as AbstractImpl).GetOptions;

    public virtual string[] Names => (Activator.CreateInstance(Impl) as AbstractImpl).Names;
}

[AttributeUsage(AttributeTargets.Field)]
public class ManualSettingsOptionsAttribute : SettingsOptionsAttribute
{
    public string[] Vals;

    public string[] ManualNames;

    public override string[] Options => Vals;

    public override string[] Names => ManualNames ?? Vals;
}

/// <summary>Attribute that marks that the value should be treated as a secret, and not transmitted to remote clients.</summary>
[AttributeUsage(AttributeTargets.Field)]
public class ValueIsSecretAttribute : Attribute
{
}

/// <summary>Attribute that marks that the value should be restricted from non-admin user access.</summary>
[AttributeUsage(AttributeTargets.Field)]
public class ValueIsRestrictedAttribute : Attribute
{
}

/// <summary>Attribute that marks that the setting is hidden from the normal interface.</summary>
[AttributeUsage(AttributeTargets.Field)]
public class SettingHiddenAttribute : Attribute
{
}

public static class AutoConfigExtensions
{
    public static IEnumerable<AutoConfiguration.Internal.SingleFieldData> GetSecretFields(AutoConfiguration config) =>
        config.InternalData.SharedData.Fields.Values.Where(f => f.Field.GetCustomAttribute<ValueIsSecretAttribute>() is not null);
    public static IEnumerable<AutoConfiguration.Internal.SingleFieldData> GetSubConfigFields(AutoConfiguration config) =>
        config.InternalData.SharedData.Fields.Values.Where(f => f.Field.FieldType.IsSubclassOf(typeof(AutoConfiguration)));

    /// <summary>Saves all data from an auto-config section, but explicitly excludes any values marked as secret.</summary>
    /// <param name="altValue">The value to replace secret values with, or null to exclude entirely.</param>
    /// <param name="unlessVal">If this value is not null, any value that matches this will be allowed to stay.</param>
    public static FDSSection SaveAllWithoutSecretValues(this AutoConfiguration config, object altValue = null, object unlessVal = null)
    {
        FDSSection section = config.Save(true);
        foreach (AutoConfiguration.Internal.SingleFieldData field in GetSecretFields(config))
        {
            if (unlessVal is not null && unlessVal.Equals(section.GetObject(field.Name)))
            {
                continue;
            }
            section.Remove(field.Name);
            if (altValue is not null)
            {
                section.Set(field.Name, altValue);
            }
        }
        foreach (AutoConfiguration.Internal.SingleFieldData field in GetSubConfigFields(config))
        {
            section.Set(field.Name, (field.GetValue(config) as AutoConfiguration).SaveAllWithoutSecretValues(altValue));
        }
        return section;
    }

    /// <summary>Returns a copy of the <see cref="FDSSection"/>, with any secret values left at a default-recognizable-value excluded, for loading convenience.</summary>
    public static FDSSection ExcludeSecretValuesThatMatch(this AutoConfiguration config, FDSSection section, object secretDefaultValue)
    {
        FDSSection dup = new(section.SaveToString());
        foreach (AutoConfiguration.Internal.SingleFieldData field in GetSecretFields(config))
        {
            object curVal = dup.GetObject(field.Name);
            if (curVal is not null && secretDefaultValue.Equals(curVal))
            {
                dup.Remove(field.Name);
            }
        }
        foreach (AutoConfiguration.Internal.SingleFieldData field in GetSubConfigFields(config))
        {
            dup.Set(field.Name, (field.GetValue(config) as AutoConfiguration).ExcludeSecretValuesThatMatch(dup.GetSection(field.Name), secretDefaultValue));
        }
        return dup;
    }
}
