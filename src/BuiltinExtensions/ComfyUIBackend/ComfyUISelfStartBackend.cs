
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
    public static List<string> FoldersToForwardInComfyPath = ["unet", "diffusion_models", "gligen", "ipadapter", "yolov8", "tensorrt", "clipseg", "style_models"];

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
            string[] roots = Program.ServerSettings.Paths.ModelRoot.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
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
                string rootFixed = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, root);
                int id = ++count;
                yaml += $"""
                swarmui{(id == 1 ? "" : $"{id}")}:
                    base_path: {rootFixed}
                    {(id == 1 ? "is_default: true" : "")}
                    checkpoints: {buildSection(rootFixed, Program.ServerSettings.Paths.SDModelFolder)}
                    vae: {buildSection(rootFixed, Program.ServerSettings.Paths.SDVAEFolder + ";VAE")}
                    loras: {buildSection(rootFixed, Program.ServerSettings.Paths.SDLoraFolder + ";Lora;LyCORIS")}
                    upscale_models: {buildSection(rootFixed, "ESRGAN;RealESRGAN;SwinIR;upscale-models;upscale_models")}
                    embeddings: {buildSection(rootFixed, Program.ServerSettings.Paths.SDEmbeddingFolder + ";embeddings")}
                    hypernetworks: {buildSection(rootFixed, "hypernetworks")}
                    controlnet: {buildSection(rootFixed, Program.ServerSettings.Paths.SDControlNetsFolder + ";ControlNet")}
                    clip: {buildSection(rootFixed, Program.ServerSettings.Paths.SDClipFolder + ";clip;CLIP")}
                    clip_vision: {buildSection(rootFixed, Program.ServerSettings.Paths.SDClipVisionFolder + ";clip_vision")}

                """;
                foreach (string folder in FoldersToForwardInComfyPath)
                {
                    yaml += $"    {folder}: {buildSection(rootFixed, folder)}\n";
                }
                yaml += "\n";
            }
            yaml += $"""
            # Explicitly separate the _nodes list to prevent it from being is_default
            swarmui_nodes:
                custom_nodes: {buildSection(ComfyUIBackendExtension.Folder, $"{Path.GetFullPath(ComfyUIBackendExtension.Folder + "/DLNodes")};{Path.GetFullPath(ComfyUIBackendExtension.Folder + "/ExtraNodes")};{CustomNodePaths.Select(Path.GetFullPath).JoinString(";")}")}

            """;
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
            if (Utilities.PresumeNVidia30xx && Program.ServerSettings.Performance.AllowGpuSpecificOptimizations)
            {
                addedArgs += " --fast";
            }
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
                addedArgs += " --front-end-version Comfy-Org/ComfyUI_frontend@v1.9.18";
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
                        // Overly specific check, no idea how this happens
                        if (response.Contains("There is no tracking information for the current branch") && checkoutResponse.Contains("Already on 'master'"))
                        {
                            string fixStatus = await Utilities.RunGitProcess("branch --set-upstream-to=origin/master master", path);
                            AddLoadStatus($"Comfy git fix (untracked curse) response: {fixStatus.Trim()}");
                            string repullResponse = await Utilities.RunGitProcess("pull --autostash", path);
                            AddLoadStatus($"Comfy git re-pull response: {repullResponse.Trim()}");
                        }
                        else if (checkoutResponse.Contains("and can be fast-forwarded") && checkoutResponse.Contains("Already on 'master'"))
                        {
                            string fixStatus = await Utilities.RunGitProcess("reset --hard HEAD", path);
                            AddLoadStatus($"Comfy git fix (fast-forward curse) response: {fixStatus.Trim()}");
                            string repullResponse = await Utilities.RunGitProcess("pull --autostash", path);
                            AddLoadStatus($"Comfy git re-pull response: {repullResponse.Trim()}");
                        }
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
            string[] dirs = [.. Directory.GetDirectories($"{lib}/site-packages/").Select(f => f.Replace('\\', '/').AfterLast('/'))];
            string[] distinfos = [.. dirs.Where(d => d.EndsWith(".dist-info"))];
            HashSet<string> libs = dirs.Select(d => d.Before('-')).ToHashSet();
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
            async Task update(string name, string pip)
            {
                AddLoadStatus($"Updating '{name}' for ComfyUI...");
                Process p = DoPythonCall($"-s -m pip install -U {pip}");
                NetworkBackendUtils.ReportLogsFromProcess(p, $"ComfyUI (Update {name})", "");
                await p.WaitForExitAsync(Program.GlobalProgramCancel);
                AddLoadStatus($"Done updating '{name}' for ComfyUI.");
            }
            string getVers(string package)
            {
                string prefix = $"{package}-";
                string dir = distinfos.FirstOrDefault(d => d.StartsWith(prefix));
                if (dir is null)
                {
                    return null;
                }
                return dir[prefix.Length..].Before(".dist-info");
            }
            if (!libs.Contains("pip"))
            {
                Logs.Warning($"Python lib folder at '{lib}' appears to not contain pip. Python operations will likely fail. Please make sure your system has a valid python3-pip install.");
            }
            foreach ((string libFolder, string pipName) in RequiredPythonPackages)
            {
                await install(libFolder, pipName);
            }
            string numpyVers = getVers("numpy");
            if (numpyVers is not null && Version.Parse(numpyVers) < Version.Parse("1.25"))
            {
                await update("numpy", "numpy>=1.25.0");
            }
            string ultralyticsVers = getVers("ultralytics");
            if (ultralyticsVers is not null && Version.Parse(ultralyticsVers) < Version.Parse(UltralyticsVersion))
            {
                await update("ultralytics", $"ultralytics=={UltralyticsVersion}");
            }
            if (Directory.Exists($"{ComfyUIBackendExtension.Folder}/DLNodes/ComfyUI_IPAdapter_plus"))
            {
                // FaceID IPAdapter models need these, really inconvenient to make dependencies conditional, so...
                await install("Cython", "cython");
                if (File.Exists($"{lib}/../python311.dll"))
                {
                    // TODO: This is deeply cursed. This is published by the comfyui-ReActor-node developer so at least it's not a complete rando, but, jeesh. Insightface please fix your pip package.
                    await install("insightface", "https://github.com/Gourieff/Assets/raw/main/Insightface/insightface-0.7.3-cp311-cp311-win_amd64.whl");
                }
                else if (File.Exists($"{lib}/../python312.dll"))
                {
                    await install("insightface", "https://github.com/Gourieff/Assets/raw/main/Insightface/insightface-0.7.3-cp312-cp312-win_amd64.whl");
                }
                else if (File.Exists($"{lib}/../python310.dll"))
                {
                    await install("insightface", "https://github.com/Gourieff/Assets/raw/main/Insightface/insightface-0.7.3-cp310-cp310-win_amd64.whl");
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

    /// <summary>
    /// Version of Ultralytics pip package to use.
    /// This is hard-pinned due to the malicious 8.3.41 incident, only manual updates when needed until security practices are improved.
    /// </summary>
    public static string UltralyticsVersion = "8.3.69";

    /// <summary>List of known required python packages, as pairs of strings: Item1 is the folder name within python packages to look for, Item2 is the pip install command.</summary>
    public static List<(string, string)> RequiredPythonPackages =
    [
        // ComfyUI added these dependencies, didn't used to have it
        ("kornia", "kornia"),
        ("sentencepiece", "sentencepiece"),
        ("spandrel", "spandrel"),
        ("av", "av"),
        ("comfyui_frontend_package", "comfyui_frontend_package"),
        // Other added dependencies
        ("rembg", "rembg"),
        ("onnxruntime", "onnxruntime"), // subdependency of rembg but inexplicably not autoinstalled anymore?
        ("matplotlib", "matplotlib"),
        ("opencv_python_headless", "opencv-python-headless"),
        ("imageio_ffmpeg", "imageio-ffmpeg"),
        ("dill", "dill"),
        ("ultralytics", $"ultralytics=={UltralyticsVersion}")
    ];

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
