
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

        [ConfigComment("Whether the Comfy backend should automatically update nodes within Swarm's managed nodes folder.\nYou can update every launch, never update automatically, or force-update (bypasses some common git issues).")]
        [ManualSettingsOptions(Impl = null, Vals = ["true", "aggressive", "false"], ManualNames = ["Always Update", "Always Aggressively Update (Force-Update)", "Don't Update"])]
        public string UpdateManagedNodes = "true";

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

    public ComfyUISelfStartSettings Settings => SettingsRaw as ComfyUISelfStartSettings;

    public Process RunningProcess;

    public int Port;

    public override string APIAddress => $"http://localhost:{Port}";

    public override string WebAddress => $"http://localhost:{Port}";

    public override bool CanIdle => false;

    public override int OverQueue => Settings.OverQueue;

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
                    await DoLibFixes(false, false); // Some nodes have cursed deps, so we hack-around a pre-fix here
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
        return null;
    }

    /// <summary>Mapping of node folder names to exact git commits to maintain.</summary>
    public static ConcurrentDictionary<string, string> ComfyNodeGitPins = new()
    {
        // Example: ["ComfyUI-TeaCache"] = "b3429ef3dea426d2f167e348b44cd2f5a3674e7d"
    };

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
            string autoUpd = Settings.UpdateManagedNodes.ToLowerFast();
            foreach (string node in Directory.EnumerateDirectories(nodePath))
            {
                await Task.Delay(TimeSpan.FromSeconds(0.05));
                if (Directory.Exists($"{node}/.git"))
                {
                    string toUse = node;
                    string pathSimple = toUse.Replace('\\', '/').AfterLast('/');
                    tasks.Add(Task.Run(async () =>
                    {
                        if (ComfyNodeGitPins.TryGetValue(pathSimple, out string hash))
                        {
                            string localHash = (await Utilities.RunGitProcess("rev-parse HEAD", toUse)).Trim();
                            if (localHash.ToLowerFast() != hash.ToLowerFast())
                            {
                                AddLoadStatus($"Ensure node repos - Will git pull for {pathSimple} to explicit pinned commend {hash}...");
                                string response = await Utilities.RunGitProcess(autoUpd == "aggressive" ? "pull --autostash" : "pull", toUse);
                                AddLoadStatus($"Node pull response for {pathSimple}: {response.Trim()}");
                                string response2 = await Utilities.RunGitProcess($"reset --hard {hash}", toUse);
                                AddLoadStatus($"Node reset to {hash} response for {pathSimple}: {response2.Trim()}");
                            }
                        }
                        else
                        {
                            AddLoadStatus($"Ensure node repos - Will git pull for {pathSimple}...");
                            string response = await Utilities.RunGitProcess(autoUpd == "aggressive" ? "pull --autostash" : "pull", toUse);
                            AddLoadStatus($"Node pull response for {pathSimple}: {response.Trim()}");
                        }
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

    public static string SwarmValidatedFrontendVersion = "1.23.4";

    public override async Task Init()
    {
        AddLoadStatus("Starting init...");
        EnsureComfyFile();
        string addedArgs = "";
        bool doFixFrontend = false;
        bool doLatestFrontend = false;
        if (!Settings.DisableInternalArgs)
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
            if (Settings.EnablePreviews)
            {
                addedArgs += " --preview-method latent2rgb";
            }
            if (Settings.FrontendVersion == "Latest")
            {
                addedArgs += " --front-end-version Comfy-Org/ComfyUI_frontend@latest";
                doLatestFrontend = true;
            }
            else if (Settings.FrontendVersion == "LatestSwarmValidated")
            {
                addedArgs += $" --front-end-version Comfy-Org/ComfyUI_frontend@v{SwarmValidatedFrontendVersion}";
                doFixFrontend = true;
            }
            else if (Settings.FrontendVersion == "Legacy")
            {
                addedArgs += " --front-end-version Comfy-Org/ComfyUI_legacy_frontend@latest";
            }
            // None needs no arg
            AddLoadStatus($"Will add args: {addedArgs}");
        }
        Settings.StartScript = Settings.StartScript.Trim(' ', '"', '\'', '\n', '\r', '\t');
        if (!Settings.StartScript.EndsWith("main.py") && !string.IsNullOrWhiteSpace(Settings.StartScript))
        {
            AddLoadStatus($"Start script '{Settings.StartScript}' looks wrong");
            Logs.Warning($"ComfyUI start script is '{Settings.StartScript}', which looks wrong - did you forget to append 'main.py' on the end?");
        }
        Directory.CreateDirectory(Path.GetFullPath(ComfyUIBackendExtension.Folder + "/DLNodes"));
        string autoUpdNodes = Settings.UpdateManagedNodes.ToLowerFast();
        List<Task> tasks = [];
        if ((autoUpdNodes == "true" || autoUpdNodes == "aggressive") && !string.IsNullOrWhiteSpace(Settings.StartScript))
        {
            AddLoadStatus("Will track node repo load task...");
            tasks.Add(Task.Run(EnsureNodeRepos));
        }
        string autoUpd = Settings.AutoUpdate.ToLowerFast();
        if ((autoUpd == "true" || autoUpd == "aggressive") && !string.IsNullOrWhiteSpace(Settings.StartScript))
        {
            AddLoadStatus("Will track comfy git pull auto-update task...");
            tasks.Add(Task.Run(async () =>
            {
                try
                {
                    string path = Path.GetFullPath(Settings.StartScript).Replace('\\', '/').BeforeLast('/');
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
        if (tasks.Any())
        {
            AddLoadStatus($"Waiting on git tasks to complete...");
            await Task.WhenAll(tasks);
            AddLoadStatus($"All tasks done.");
        }
        await DoLibFixes(doFixFrontend, doLatestFrontend);
        AddLoadStatus("Starting self-start ComfyUI process...");
        await NetworkBackendUtils.DoSelfStart(Settings.StartScript, this, $"ComfyUI-{BackendData.ID}", $"backend-{BackendData.ID}", Settings.GPU_ID, Settings.ExtraArgs.Trim() + " --port {PORT}" + addedArgs, InitInternal, (p, r) => { Port = p; RunningProcess = r; }, Settings.AutoRestart);
    }

    public async Task DoLibFixes(bool doFixFrontend, bool doLatestFrontend)
    {
        string lib = NetworkBackendUtils.GetProbableLibFolderFor(Settings.StartScript);
        if (lib is null || lib.Length < 3)
        {
            AddLoadStatus($"Skip lib validation, can't find folder.");
        }
        else
        {
            AddLoadStatus($"Will validate required libs...");
            string[] reqsRaw = [.. File.ReadAllLines(Path.GetDirectoryName(Settings.StartScript) + "/requirements.txt").Where(s => !string.IsNullOrWhiteSpace(s) && !s.Trim().StartsWith('#'))];
            Dictionary<string, Version> reqs = reqsRaw.Select(s => s.Replace(">=", "==").Replace("<=", "==").Split("=="))
                                                .Where(pair => RequirementPartMatcher.IsOnlyMatches(pair[0]) && (pair.Length == 1 || RequirementPartMatcher.IsOnlyMatches(pair[1])))
                                                .ToDictionary(pair => pair[0], pair => pair.Length == 1 ? null : Version.Parse(pair[1]));
            string[] dirs = [.. Directory.GetDirectories($"{lib}").Select(f => f.Replace('\\', '/').AfterLast('/'))];
            string[] distinfos = [.. dirs.Where(d => d.EndsWith(".dist-info"))];
            HashSet<string> libs = [.. dirs.Select(d => d.Before('-').ToLowerFast())];
            async Task pipCall(string reason, string call)
            {
                AddLoadStatus($"{reason} for ComfyUI...");
                Process p = DoPythonCall($"-s -m pip {call}");
                NetworkBackendUtils.ReportLogsFromProcess(p, $"ComfyUI ({reason})", "");
                await p.WaitForExitAsync(Program.GlobalProgramCancel);
                AddLoadStatus($"Done {reason} for ComfyUI.");
            }
            async Task install(string libFolder, string pipName)
            {
                if (libs.Contains(libFolder))
                {
                    return;
                }
                await pipCall($"Installing '{pipName}'", $"install {pipName}");
                libs.Add(libFolder);
            }
            async Task update(string name, string pip)
            {
                await pipCall($"Updating '{name}'", $"install {pip}");
                libs.Add(name);
            }
            string getVers(string package)
            {
                string prefix = $"{package}-";
                string dir = distinfos.FirstOrDefault(d => d.StartsWith(prefix));
                if (dir is null)
                {
                    return null;
                }
                return dir[prefix.Length..].Before(".dist-info").Before('+');
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
            if (numpyVers is null || Version.Parse(numpyVers) < Version.Parse("1.25"))
            {
                await update("numpy", "numpy==1.26.4");
            }
            foreach ((string libFolder, string pipName, string rel, string version) in RequiredVersionPythonPackages)
            {
                string curVersRaw = getVers(libFolder);
                Version curVers = curVersRaw is null ? null : Version.Parse(curVersRaw);
                Version actualVers = Version.Parse(version);
                bool doUpdate = curVers is null;
                if (!doUpdate)
                {
                    doUpdate = rel switch
                    {
                        ">=" => curVers < actualVers,
                        "<=" => curVers > actualVers,
                        "==" => curVers < actualVers,
                        _ => throw new ArgumentException($"Invalid version relation '{rel}' for package '{libFolder}' with version '{version}'.")
                    };
                }
                if (doUpdate)
                {
                    await update(libFolder, $"{pipName}{rel}{version}");
                }
            }
            string frontendVersion = getVers("comfyui_frontend_package");
            if (doFixFrontend && (frontendVersion is null || frontendVersion != SwarmValidatedFrontendVersion))
            {
                await update("comfyui_frontend_package", $"comfyui-frontend-package=={SwarmValidatedFrontendVersion}");
            }
            if (reqs.TryGetValue("comfyui_frontend_package", out Version frontVers) && $"{frontVers}" != SwarmValidatedFrontendVersion)
            {
                Logs.Warning($"(Developer Notice) ComfyUI Frontend target version is {frontVers}, but validated version is {SwarmValidatedFrontendVersion}");
            }
            string actualTemplateVers = getVers("comfyui_workflow_templates");
            if ((doFixFrontend || doLatestFrontend) && reqs.TryGetValue("comfyui-workflow-templates", out Version templateVers) && (actualTemplateVers is null || Version.Parse(actualTemplateVers) < templateVers))
            {
                await update("comfyui_workflow_templates", $"comfyui-workflow-templates=={templateVers}");
            }
            string actualEmbedVers = getVers("comfyui_embedded_docs");
            if ((doFixFrontend || doLatestFrontend) && reqs.TryGetValue("comfyui-embedded-docs", out Version embedDocsVers) && (actualEmbedVers is null || embedDocsVers < Version.Parse(actualEmbedVers)))
            {
                await update("comfyui_embedded_docs", $"comfyui-embedded-docs=={embedDocsVers}");
            }
            if (doLatestFrontend)
            {
                await update("comfyui_frontend_package", "comfyui-frontend-package");
            }
            else if (!doFixFrontend)
            {
                await install("comfyui_frontend_package", "comfyui-frontend-package");
            }
            if (Directory.Exists($"{ComfyUIBackendExtension.Folder}/DLNodes/ComfyUI_IPAdapter_plus") || Directory.Exists($"{ComfyUIBackendExtension.Folder}/DLNodes/ComfyUI-nunchaku"))
            {
                // FaceID IPAdapter models need these, really inconvenient to make dependencies conditional, so... (nunchaku needs it too)
                await install("cython", "cython");
                if (File.Exists($"{lib}/../../python311.dll"))
                {
                    // TODO: This is deeply cursed. This is published by the comfyui-ReActor-node developer so at least it's not a complete rando, but, jeesh. Insightface please fix your pip package.
                    await install("insightface", "https://github.com/Gourieff/Assets/raw/a20f16a2f4d2c856a14960afd709540a88ebef25/Insightface/insightface-0.7.3-cp311-cp311-win_amd64.whl");
                }
                else if (File.Exists($"{lib}/../../python313.dll"))
                {
                    await install("insightface", "https://github.com/Gourieff/Assets/raw/62742c24b2376266e915a327a4b2b6fb03943ef0/Insightface/insightface-0.7.3-cp313-cp313-win_amd64.whl");
                }
                else if (File.Exists($"{lib}/../../python312.dll"))
                {
                    await install("insightface", "https://github.com/Gourieff/Assets/raw/a20f16a2f4d2c856a14960afd709540a88ebef25/Insightface/insightface-0.7.3-cp312-cp312-win_amd64.whl");
                }
                else if (File.Exists($"{lib}/../../python310.dll"))
                {
                    await install("insightface", "https://github.com/Gourieff/Assets/raw/a20f16a2f4d2c856a14960afd709540a88ebef25/Insightface/insightface-0.7.3-cp310-cp310-win_amd64.whl");
                }
                else
                {
                    await install("insightface", "insightface");
                }
            }
            if (Directory.Exists($"{ComfyUIBackendExtension.Folder}/DLNodes/ComfyUI-nunchaku"))
            {
                if (!libs.Contains("nunchaku") && numpyVers is not null && Version.Parse(numpyVers) > Version.Parse("2.0")) // Patch-hack because numpy v2 has incompatibilities with insightface
                { // Note: sometimes 2+ is needed, so we carefully only remove for the first install of nunchaku, and allow it to be manually shifted back to 2+ after without undoing it
                    await pipCall($"Remove numpy2+", $"uninstall -y numpy");
                    await update("numpy", "numpy==1.26.4");
                }
                // Nunchaku devs seem very confused how to python package. So we gotta do some cursed install for them.
                bool isValid = true;
                string pyVers = "310";
                Process proc = DoPythonCall("--version");
                string actualPyVers = await proc.StandardOutput.ReadToEndAsync();
                if (actualPyVers.Contains("Python 3.11")) { pyVers = "311"; }
                else if (actualPyVers.Contains("Python 3.13")) { pyVers = "313"; }
                else if (actualPyVers.Contains("Python 3.12")) { pyVers = "312"; }
                else if (actualPyVers.Contains("Python 3.10")) { pyVers = "310"; }
                else
                {
                    Logs.Error($"Nunchaku is not currently supported on your python version.");
                    isValid = false;
                }
                string osVers = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "win_amd64" : "linux_x86_64";
                string torchPipVers = getVers("torch");
                string torchVers = "2.8";
                if (torchPipVers.StartsWith("2.5.")) { torchVers = "2.5"; }
                else if (torchPipVers.StartsWith("2.6.")) { torchVers = "2.6"; }
                else if (torchPipVers.StartsWith("2.7.")) { torchVers = "2.7"; }
                else if (torchPipVers.StartsWith("2.8.")) { torchVers = "2.8"; }
                else
                {
                    Logs.Error($"Nunchaku is not currently supported on your Torch version ({torchPipVers} not in range [2.5, 2.8]).");
                    isValid = false;
                }
                // eg https://github.com/mit-han-lab/nunchaku/releases/download/v0.3.1/nunchaku-0.3.1+torch2.5-cp310-cp310-linux_x86_64.whl
                string url = $"https://github.com/mit-han-lab/nunchaku/releases/download/v0.3.1/nunchaku-0.3.1+torch{torchVers}-cp{pyVers}-cp{pyVers}-{osVers}.whl";
                if (isValid)
                {
                    string nunchakuVers = getVers("nunchaku");
                    if (nunchakuVers is not null && Version.Parse(nunchakuVers) < Version.Parse("0.3.1"))
                    {
                        await update("nunchaku", url);
                    }
                    else
                    {
                        await install("nunchaku", url);
                    }
                }
                // Late-added requirements of nunchaku
                await install("filterpy", "git+https://github.com/rodjjo/filterpy.git"); // compile dependency, utterly broken, I hate python developers omg
                await install("facexlib", "facexlib");
                await install("timm", "timm");
            }
            foreach (string req in reqs.Keys)
            {
                if (!libs.Contains(req.Replace('-', '_').ToLowerFast()))
                {
                    Logs.Warning($"(Developer Warning) ComfyUI required package '{req}' not found in lib folder. May be an install error, or may be a new dependency.");
                }
            }
            AddLoadStatus("Done validating required libs.");
        }
    }

    /// <summary>Strict matcher that will block any muckery, excluding URLs and etc.</summary>
    public static AsciiMatcher RequirementPartMatcher = new(AsciiMatcher.BothCaseLetters + AsciiMatcher.Digits + ".-_");

    /// <summary>List of known required python packages, as pairs of strings: Item1 is the folder name within python packages to look for, Item2 is the pip install command.</summary>
    public static List<(string, string)> RequiredPythonPackages =
    [
        // ComfyUI added these dependencies, didn't used to have it
        ("kornia", "kornia"),
        ("sentencepiece", "sentencepiece"),
        ("spandrel", "spandrel"),
        ("av", "av"),
        ("pydantic", "pydantic"),
        ("pydantic_settings", "pydantic-settings"),
        ("comfyui_frontend_package", $"comfyui_frontend_package=={SwarmValidatedFrontendVersion}"),
        ("alembic", "alembic"),
        // Other added dependencies
        ("rembg", "rembg"),
        ("onnxruntime", "onnxruntime"), // subdependency of rembg but inexplicably not autoinstalled anymore?
        ("matplotlib", "matplotlib"),
        ("opencv_python_headless", "opencv-python-headless"),
        ("imageio_ffmpeg", "imageio-ffmpeg"),
        ("dill", "dill"),
        ("omegaconf", "omegaconf"), // some yolo models require this but ultralytics itself doesn't? wut?
        //("mesonpy", "meson-python") // Build requirement sometimes. Probably will be required when python 3.13 is stably supported.
    ];

    /// <summary>List of required python packages that need a specific version, in structure (string libFolder, string pipName, string rel, string version).</summary>
    public static List<(string, string, string, string)> RequiredVersionPythonPackages =
    [
        ("av", "av", ">=", "14.2.0"),
        ("spandrel", "spandrel", ">=", "0.4.1"),
        ("transformers", "transformers", ">=", "4.37.2"),
        ("ultralytics", "ultralytics", "==", "8.3.155"), // This is hard-pinned due to the malicious 8.3.41 incident, only manual updates when needed until security practices are improved.
        ("pip", "pip", ">=", "25.0") // Don't need latest, just can't be too old, this is mostly just here for a sanity check.
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
