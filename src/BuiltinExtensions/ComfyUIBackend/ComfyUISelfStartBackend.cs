
using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Utils;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace SwarmUI.Builtin_ComfyUIBackend;

public class ComfyUISelfStartBackend : ComfyUIAPIAbstractBackend
{
    public class ComfyUISelfStartSettings : AutoConfiguration
    {
        [ConfigComment("The location of the 'main.py' file. Can be an absolute or relative path, but must end with 'main.py'.\nIf you used the installer, this should be 'dlbackend/comfy/ComfyUI/main.py'.")]
        public string StartScript = "";

        [ConfigComment("Any arguments to include in the launch script.")]
        public string ExtraArgs = "";

        [ConfigComment("If unchecked, the system will automatically add some relevant arguments to the comfy launch. If checked, automatic args (other than port) won't be added.")]
        public bool DisableInternalArgs = false;

        [ConfigComment("Whether the Comfy backend should automatically update itself during launch.\nYou can update every launch, never update automatically, or force-update (bypasses some common git issues).")]
        [ManualSettingsOptions(Impl = null, Vals = ["true", "aggressive", "false"], ManualNames = ["Always Update", "Always Aggressively Update (Force-Update)", "Don't Update"])]
        public string AutoUpdate = "true";

        [ConfigComment("Which version of the ComfyUI frontend to enable.\n'Latest' uses the latest version available (including dev commits).\n'None' uses whatever is baked into ComfyUI itself.\n'Latest Swarm Validated' uses the latest version that Swarm has been tested and confirmed to work with.\n'Legacy' uses the pre-September-2024 legacy UI.")]
        [ManualSettingsOptions(Impl = null, Vals = ["Latest", "None", "LatestSwarmValidated", "Legacy"], ManualNames = ["Latest", "None", "Latest Swarm Validated", "Legacy (Pre Sept 2024)"])]
        public string FrontendVersion = "LatestSwarmValidated";

        [ConfigComment("If checked, tells Comfy to generate image previews. If unchecked, previews will not be generated, and images won't show up until they're done.")]
        public bool EnablePreviews = true;

        [ConfigComment("Which GPU to use, if multiple are available.\nShould be a single number, like '0'.\nYou can use syntax like '0,1' to provide multiple GPUs to one backend (only applicable if you have custom nodes that can take advantage of this.)")]
        public string GPU_ID = "0";

        [ConfigComment("How many extra requests may queue up on this backend while one is processing.")]
        public int OverQueue = 1;

        [ConfigComment("If checked, if the backend crashes it will automatically restart.\nIf false, if the backend crashes it will sit in an errored state until manually restarted.")]
        public bool AutoRestart = true;
    }

    public Process RunningProcess;

    public int Port;

    public override string APIAddress => $"http://localhost:{Port}";

    public override string WebAddress => $"http://localhost:{Port}";

    public override bool CanIdle => false;

    public override int OverQueue => (SettingsRaw as ComfyUISelfStartSettings).OverQueue;

    public static LockObject ComfyModelFileHelperLock = new();

    public static bool IsComfyModelFileEmitted = false;

    /// <summary>Downloads or updates the named relevant ComfyUI custom node repo.</summary>
    public async Task<ComfyUISelfStartBackend[]> EnsureNodeRepo(string url, bool skipPipCache = false, bool doRestart = true)
    {
        AddLoadStatus($"Will ensure node repo '{url}'...");
        string nodePath = Path.GetFullPath(ComfyUIBackendExtension.Folder + "/DLNodes");
        string folderName = url.AfterLast('/');
        if (!Directory.Exists($"{nodePath}/{folderName}"))
        {
            AddLoadStatus($"Node folder '{folderName}' does not exist, will clone it...");
            string response = await Utilities.RunGitProcess($"clone {url}", nodePath);
            AddLoadStatus($"Node clone response for {folderName}: {response.Trim()}");
            string reqFile = $"{nodePath}/{folderName}/requirements.txt";
            ComfyUISelfStartBackend[] backends = [.. Program.Backends.RunningBackendsOfType<ComfyUISelfStartBackend>()];
            if (File.Exists(reqFile) && backends.Any())
            {
                AddLoadStatus("Will shutdown any/all comfy backends to allow an install...");
                Task[] tasks = [.. backends.Select(b => Program.Backends.ShutdownBackendCleanly(b.BackendData))];
                await Task.WhenAll(tasks);
                AddLoadStatus("Pre-shutdown done.");
                try
                {
                    AddLoadStatus($"Will install requirements file {reqFile}...");
                    string path = Path.GetFullPath(reqFile);
                    if (path.Contains(' '))
                    {
                        path = $"\"{path}\"";
                    }
                    string cacheOption = skipPipCache ? " --no-cache-dir" : "";
                    Process p = backends.FirstOrDefault().DoPythonCall($"-s -m pip install{cacheOption} -r {path}");
                    NetworkBackendUtils.ReportLogsFromProcess(p, $"ComfyUI (Requirements Install - {folderName})", "");
                    await p.WaitForExitAsync(Program.GlobalProgramCancel);
                    AddLoadStatus($"Requirement install {reqFile} done.");
                }
                catch (Exception ex)
                {
                    Logs.Error($"Failed to install comfy backend node requirements: {ex.ReadableString()}");
                    AddLoadStatus($"Error during requirements installation.");
                }
                if (doRestart)
                {
                    AddLoadStatus($"Will re-start any backends shut down by the install...");
                    foreach (ComfyUISelfStartBackend backend in backends)
                    {
                        AddLoadStatus($"Will re-start backend {backend.BackendData.ID}...");
                        Program.Backends.DoInitBackend(backend.BackendData);
                    }
                }
                return backends;
            }
        }
        else
        {
            AddLoadStatus($"Node folder '{folderName}' exists, will git pull it...");
            string response = await Utilities.RunGitProcess($"pull", $"{nodePath}/{folderName}");
            AddLoadStatus($"Node pull response for {folderName}: {response.Trim()}");
        }
        return null;
    }

    public async Task EnsureNodeRepos()
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(0.05));
            AddLoadStatus("Will ensure all node repos...");
            string nodePath = Path.GetFullPath(ComfyUIBackendExtension.Folder + "/DLNodes");
            if (!Directory.Exists(nodePath))
            {
                Directory.CreateDirectory(nodePath);
            }
            List<Task> tasks = [.. InstallableFeatures.ComfyFeatures.Values.Where(f => f.AutoInstall).Select(f => Utilities.RunCheckedTask(async () => await EnsureNodeRepo(f.URL)))];
            if (tasks.Any())
            {
                await Task.WhenAll(tasks);
            }
            tasks.Clear();
            foreach (string node in Directory.EnumerateDirectories(nodePath))
            {
                await Task.Delay(TimeSpan.FromSeconds(0.05));
                if (Directory.Exists($"{node}/.git"))
                {
                    string toUse = node;
                    string pathSimple = toUse.Replace('\\', '/').AfterLast('/');
                    tasks.Add(Task.Run(async () =>
                    {
                        AddLoadStatus($"Ensure node repos - Will git pull for {pathSimple}...");
                        string response = await Utilities.RunGitProcess($"pull", toUse);
                        AddLoadStatus($"Node pull response for {pathSimple}: {response.Trim()}");
                    }));
                }
            }
            await Task.WhenAll(tasks);
            AddLoadStatus("Done ensuring all node repos.");
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to auto-update comfy backend node repos: {ex.ReadableString()}");
            AddLoadStatus($"Error while ensuring comfy backend node repos: {ex.GetType().Name}: {ex.Message}");
        }
    }

    /// <summary>Names of folders in comfy paths that should be blindly forwarded to correct for Comfy not properly propagating base_path without manual forwards.</summary>
    public static List<string> FoldersToForwardInComfyPath = ["unet", "diffusion_models", "gligen", "ipadapter", "yolov8", "tensorrt", "clipseg"];

    /// <summary>Filepaths to where custom node packs for comfy can be found, such as extension dirs.</summary>
    public static List<string> CustomNodePaths = [];

    private static readonly bool IsWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

    public void EnsureComfyFile()
    {
        lock (ComfyModelFileHelperLock)
        {
            if (IsComfyModelFileEmitted)
            {
                return;
            }
            AddLoadStatus($"Will emit comfy model paths file...");
            string[] roots = Program.ServerSettings.Paths.ActualModelRoot.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            string yaml = "";
            int count = 0;
            static string buildSection(string root, string path)
            {
                HashSet<string> strs = [];
                string[] opts = path.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                string ret = "|";
                foreach (string opt in opts)
                {
                    string fullPath;
                    if (IsWindows)
                    {
                        fullPath = Utilities.CombinePathWithAbsolute(root, opt.ToLowerFast());
                    }
                    else
                    {
                        fullPath = Utilities.CombinePathWithAbsolute(root, opt);
                    }
                    if (strs.Add(fullPath))
                    {
                        ret += $"\n       {opt}";
                    }
                }
                return ret == "|" ? "" : ret;
            }
            foreach (string root in roots)
            {
                int id = ++count;
                yaml += $"""
                swarmui{(id == 1 ? "" : $"{id}")}:
                    base_path: {root}
                    is_default: true
                    checkpoints: {buildSection(root, Program.ServerSettings.Paths.SDModelFolder)}
                    vae: {buildSection(root, Program.ServerSettings.Paths.SDVAEFolder + ";VAE")}
                    loras: {buildSection(root, Program.ServerSettings.Paths.SDLoraFolder + ";Lora;LyCORIS")}
                    upscale_models: {buildSection(root, "ESRGAN;RealESRGAN;SwinIR;upscale-models;upscale_models")}
                    embeddings: {buildSection(root, Program.ServerSettings.Paths.SDEmbeddingFolder + ";embeddings")}
                    hypernetworks: {buildSection(root, "hypernetworks")}
                    controlnet: {buildSection(root, Program.ServerSettings.Paths.SDControlNetsFolder + ";ControlNet")}
                    clip: {buildSection(root, Program.ServerSettings.Paths.SDClipFolder + ";clip;CLIP")}
                    clip_vision: {buildSection(root, Program.ServerSettings.Paths.SDClipVisionFolder + ";clip_vision")}
                    custom_nodes: {buildSection(root, $"{Path.GetFullPath(ComfyUIBackendExtension.Folder + "/DLNodes")};{Path.GetFullPath(ComfyUIBackendExtension.Folder + "/ExtraNodes")};{CustomNodePaths.Select(Path.GetFullPath).JoinString(";")}")}

                """;
                foreach (string folder in FoldersToForwardInComfyPath)
                {
                    yaml += $"    {folder}: {buildSection(root, folder)}\n";
                }
            }
            Directory.CreateDirectory(Utilities.CombinePathWithAbsolute(roots[0], Program.ServerSettings.Paths.SDClipVisionFolder.Split(';')[0]));
            Directory.CreateDirectory(Utilities.CombinePathWithAbsolute(roots[0], Program.ServerSettings.Paths.SDClipFolder.Split(';')[0]));
            Directory.CreateDirectory($"{roots[0]}/upscale_models");
            File.WriteAllBytes($"{Program.DataDir}/comfy-auto-model.yaml", yaml.EncodeUTF8());
            IsComfyModelFileEmitted = true;
            AddLoadStatus($"Done emitting comfy model paths file.");
        }
    }

    /// <summary>Runs a generic python call for the current comfy backend.</summary>
    public Process DoPythonCall(string call)
    {
        Logs.Debug($"Will do Comfy Python call: {call}");
        ProcessStartInfo start = new()
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        NetworkBackendUtils.ConfigurePythonExeFor((SettingsRaw as ComfyUISelfStartSettings).StartScript, "ComfyUI", start, out _, out string forcePrior);
        start.Arguments = $"{forcePrior} {call.Trim()}".Trim();
        return Process.Start(start);
    }

#pragma warning disable CS1998 // Async method lacks 'await' operators and will run synchronously
    public override async Task Init()
    {
        AddLoadStatus("Starting init...");
        EnsureComfyFile();
        string addedArgs = "";
        ComfyUISelfStartSettings settings = SettingsRaw as ComfyUISelfStartSettings;
        if (!settings.DisableInternalArgs)
        {
            string pathRaw = $"{Program.DataDir}/comfy-auto-model.yaml";
            if (pathRaw.Contains(' '))
            {
                pathRaw = $"\"{pathRaw}\"";
            }
            addedArgs += $" --extra-model-paths-config {pathRaw}";
            if (settings.EnablePreviews)
            {
                addedArgs += " --preview-method latent2rgb";
            }
            if (settings.FrontendVersion == "Latest")
            {
                addedArgs += " --front-end-version Comfy-Org/ComfyUI_frontend@latest";
            }
            else if (settings.FrontendVersion == "LatestSwarmValidated")
            {
                addedArgs += " --front-end-version Comfy-Org/ComfyUI_frontend@v1.2.47";
            }
            else if (settings.FrontendVersion == "Legacy")
            {
                addedArgs += " --front-end-version Comfy-Org/ComfyUI_legacy_frontend@latest";
            }
            // None needs no arg
            AddLoadStatus($"Will add args: {addedArgs}");
        }
        settings.StartScript = settings.StartScript.Trim(' ', '"', '\'', '\n', '\r', '\t');
        if (!settings.StartScript.EndsWith("main.py") && !string.IsNullOrWhiteSpace(settings.StartScript))
        {
            AddLoadStatus($"Start script '{settings.StartScript}' looks wrong");
            Logs.Warning($"ComfyUI start script is '{settings.StartScript}', which looks wrong - did you forget to append 'main.py' on the end?");
        }
        AddLoadStatus("Will track node repo load task...");
        List<Task> tasks = [Task.Run(EnsureNodeRepos)];
        string autoUpd = settings.AutoUpdate.ToLowerFast();
        if ((autoUpd == "true" || autoUpd == "aggressive") && !string.IsNullOrWhiteSpace(settings.StartScript))
        {
            AddLoadStatus("Will track comfy git pull auto-update task...");
            tasks.Add(Task.Run(async () =>
            {
                try
                {
                    string path = Path.GetFullPath(settings.StartScript).Replace('\\', '/').BeforeLast('/');
                    AddLoadStatus("Running git pull in comfy folder...");
                    string response = await Utilities.RunGitProcess(autoUpd == "aggressive" ? "pull --autostash" : "pull", path);
                    AddLoadStatus($"Comfy git pull response: {response.Trim()}");
                    if (autoUpd == "aggressive")
                    {
                        // Backup because multiple users have wound up off master branch sometimes, aggressive should push back to master so it's repaired by next startup
                        string checkoutResponse = await Utilities.RunGitProcess("checkout master --force", path);
                        AddLoadStatus($"Comfy git checkout master response: {checkoutResponse.Trim()}");
                    }
                    if (response.Contains("error: Your local changes to the following files"))
                    {
                        Logs.Error($"Failed to auto-update comfy backend due to local changes - change 'AutoUpdate' to 'Aggressive' in backend settings to automatically correct this.");
                    }
                }
                catch (Exception ex)
                {
                    AddLoadStatus($"Auto-update comfy backend failed.");
                    Logs.Error($"Failed to auto-update comfy backend: {ex.ReadableString()}");
                }
            }));
        }
        AddLoadStatus($"Waiting on git tasks to complete...");
        await Task.WhenAll(tasks);
        AddLoadStatus($"All tasks done.");
        string lib = NetworkBackendUtils.GetProbableLibFolderFor(settings.StartScript);
        if (lib is not null)
        {
            AddLoadStatus($"Will validate required libs...");
            HashSet<string> libs = Directory.GetDirectories($"{lib}/site-packages/").Select(f => f.Replace('\\', '/').AfterLast('/').Before('-')).ToHashSet();
            async Task install(string libFolder, string pipName)
            {
                if (libs.Contains(libFolder))
                {
                    return;
                }
                AddLoadStatus($"Installing '{pipName}' for ComfyUI...");
                Process p = DoPythonCall($"-s -m pip install {pipName}");
                NetworkBackendUtils.ReportLogsFromProcess(p, $"ComfyUI (Install {pipName})", "");
                await p.WaitForExitAsync(Program.GlobalProgramCancel);
                AddLoadStatus($"Done installing '{pipName}' for ComfyUI.");
            }
            // ComfyUI added these dependencies, didn't used to have it
            await install("kornia", "kornia");
            await install("sentencepiece", "sentencepiece");
            await install("spandrel", "spandrel");
            // Other added dependencies
            await install("rembg", "rembg");
            await install("matplotlib", "matplotlib==3.9"); // Old version due to "mesonpy" curse
            await install("opencv_python_headless", "opencv-python-headless");
            await install("imageio_ffmpeg", "imageio-ffmpeg");
            await install("dill", "dill");
            await install("ultralytics", "ultralytics==8.1.47"); // Old version due to "mesonpy" curse
            if (Directory.Exists($"{ComfyUIBackendExtension.Folder}/DLNodes/ComfyUI_IPAdapter_plus"))
            {
                // FaceID IPAdapter models need these, really inconvenient to make dependencies conditional, so...
                await install("Cython", "cython");
                if (File.Exists($"{lib}/../python311.dll"))
                {
                    // TODO: This is deeply cursed. This is published by the comfyui-ReActor-node developer so at least it's not a complete rando, but, jeesh. Insightface please fix your pip package.
                    await install("insightface", "https://github.com/Gourieff/Assets/raw/main/Insightface/insightface-0.7.3-cp311-cp311-win_amd64.whl");
                }
                else
                {
                    await install("insightface", "insightface");
                }
            }
            AddLoadStatus("Done validating required libs.");
        }
        AddLoadStatus("Starting self-start ComfyUI process...");
        await NetworkBackendUtils.DoSelfStart(settings.StartScript, this, $"ComfyUI-{BackendData.ID}", $"backend-{BackendData.ID}", settings.GPU_ID, settings.ExtraArgs.Trim() + " --port {PORT}" + addedArgs, InitInternal, (p, r) => { Port = p; RunningProcess = r; }, settings.AutoRestart);
    }

    public override async Task Shutdown()
    {
        await base.Shutdown();
        try
        {
            if (RunningProcess is null || RunningProcess.HasExited)
            {
                return;
            }
            Logs.Info($"Shutting down self-start ComfyUI (port={Port}) process #{RunningProcess.Id}...");
            Utilities.KillProcess(RunningProcess, 10);
        }
        catch (Exception ex)
        {
            Logs.Error($"Error stopping ComfyUI process: {ex.ReadableString()}");
        }
    }

    public string ComfyPathBase => (SettingsRaw as ComfyUISelfStartSettings).StartScript.Replace('\\', '/').BeforeLast('/');

    public override void PostResultCallback(string filename)
    {
        string path =  $"{ComfyPathBase}/output/{filename}";
        Task.Run(() =>
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        });
    }

    public override bool RemoveInputFile(string filename)
    {
        string path = $"{ComfyPathBase}/input/{filename}";
        Task.Run(() =>
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        });
        return true;
    }
}
