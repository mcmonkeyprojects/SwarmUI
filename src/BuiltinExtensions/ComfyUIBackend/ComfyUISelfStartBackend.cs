
using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Utils;
using System.Diagnostics;
using System.IO;

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

        [ConfigComment("If checked, will automatically keep the comfy backend up to date when launching.")]
        public bool AutoUpdate = true;

        [ConfigComment("If checked, tells Comfy to generate image previews. If unchecked, previews will not be generated, and images won't show up until they're done.")]
        public bool EnablePreviews = true;

        [ConfigComment("Which GPU to use, if multiple are available.")]
        public int GPU_ID = 0; // TODO: Determine GPU count and provide correct max

        [ConfigComment("How many extra requests may queue up on this backend while one is processing.")]
        public int OverQueue = 1;

        [ConfigComment("If checked, if the backend crashes it will automatically restart.\nIf false, if the backend crashes it will sit in an errored state until manually restarted.")]
        public bool AutoRestart = true;
    }

    public Process RunningProcess;

    public int Port;

    public override string Address => $"http://localhost:{Port}";

    public override bool CanIdle => false;

    public override int OverQueue => (SettingsRaw as ComfyUISelfStartSettings).OverQueue;

    public static LockObject ComfyModelFileHelperLock = new();

    public static bool IsComfyModelFileEmitted = false;

    /// <summary>Downloads or updates the named relevant ComfyUI custom node repo.</summary>
    public async Task<bool> EnsureNodeRepo(string url)
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
                    Process p = backends.FirstOrDefault().DoPythonCall($"-s -m pip install -r {path}");
                    NetworkBackendUtils.ReportLogsFromProcess(p, $"ComfyUI (Requirements Install - {folderName})", "");
                    await p.WaitForExitAsync(Program.GlobalProgramCancel);
                    AddLoadStatus($"Requirement install {reqFile} done.");
                }
                catch (Exception ex)
                {
                    Logs.Error($"Failed to install comfy backend node requirements: {ex}");
                    AddLoadStatus($"Error during requirements installation.");
                }
                AddLoadStatus($"Will re-start any backends shut down by the install...");
                foreach (ComfyUISelfStartBackend backend in backends)
                {
                    AddLoadStatus($"Will re-start backend {backend.BackendData.ID}...");
                    Program.Backends.DoInitBackend(backend.BackendData);
                }
                return true;
            }
        }
        else
        {
            AddLoadStatus($"Node folder '{folderName}' exists, will git pull it...");
            string response = await Utilities.RunGitProcess($"pull", $"{nodePath}/{folderName}");
            AddLoadStatus($"Node pull response for {folderName}: {response.Trim()}");
        }
        return false;
    }

    public async Task EnsureNodeRepos()
    {
        try
        {
            AddLoadStatus("Will ensure all node repos...");
            string nodePath = Path.GetFullPath(ComfyUIBackendExtension.Folder + "/DLNodes");
            if (!Directory.Exists(nodePath))
            {
                Directory.CreateDirectory(nodePath);
            }
            List<Task> tasks =
            [
                Task.Run(async () => await EnsureNodeRepo("https://github.com/mcmonkeyprojects/sd-dynamic-thresholding")),
                Task.Run(async () => await EnsureNodeRepo("https://github.com/Stability-AI/ComfyUI-SAI_API"))
            ];
            await Task.WhenAll(tasks);
            tasks.Clear();
            foreach (string node in Directory.EnumerateDirectories(nodePath))
            {
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
            Logs.Error($"Failed to auto-update comfy backend node repos: {ex}");
            AddLoadStatus($"Error while ensuring comfy backend node repos: {ex.GetType().Name}: {ex.Message}");
        }
    }

    public void EnsureComfyFile()
    {
        lock (ComfyModelFileHelperLock)
        {
            if (IsComfyModelFileEmitted)
            {
                return;
            }
            AddLoadStatus($"Will emit comfy model paths file...");
            string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, Program.ServerSettings.Paths.ModelRoot);
            string yaml = $"""
            swarmui:
                base_path: {root}
                checkpoints: {Program.ServerSettings.Paths.SDModelFolder}
                vae: |
                    {Program.ServerSettings.Paths.SDVAEFolder}
                    VAE
                loras: |
                    {Program.ServerSettings.Paths.SDLoraFolder}
                    Lora
                    LyCORIS
                upscale_models: |
                    ESRGAN
                    RealESRGAN
                    SwinIR
                    upscale-models
                    upscale_models
                embeddings: |
                    {Program.ServerSettings.Paths.SDEmbeddingFolder}
                    embeddings
                hypernetworks: hypernetworks
                controlnet: |
                    {Program.ServerSettings.Paths.SDControlNetsFolder}
                    ControlNet
                clip_vision: |
                    {Program.ServerSettings.Paths.SDClipVisionFolder}
                    clip_vision
                clip: |
                    clip
                unet: |
                    unet
                gligen: |
                    gligen
                ipadapter: |
                    ipadapter
                yolov8: |
                    yolov8
                tensorrt: |
                    tensorrt
                clipseg: |
                    clipseg
                custom_nodes: |
                    {Path.GetFullPath(ComfyUIBackendExtension.Folder + "/DLNodes")}
                    {Path.GetFullPath(ComfyUIBackendExtension.Folder + "/ExtraNodes")}
            """;
            Directory.CreateDirectory(Utilities.CombinePathWithAbsolute(root, Program.ServerSettings.Paths.SDClipVisionFolder));
            Directory.CreateDirectory($"{root}/upscale_models");
            File.WriteAllText($"{Program.DataDir}/comfy-auto-model.yaml", yaml);
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
        NetworkBackendUtils.ConfigurePythonExeFor((SettingsRaw as ComfyUISelfStartSettings).StartScript, "ComfyUI", start, out _);
        start.Arguments = call.Trim();
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
        if (settings.AutoUpdate && !string.IsNullOrWhiteSpace(settings.StartScript))
        {
            AddLoadStatus("Will track comfy git pull auto-update task...");
            tasks.Add(Task.Run(async () =>
            {
                try
                {
                    AddLoadStatus("Running git pull in comfy folder...");
                    string response = await Utilities.RunGitProcess($"pull", Path.GetFullPath(settings.StartScript).Replace('\\', '/').BeforeLast('/'));
                    AddLoadStatus($"Comfy git pull response: {response.Trim()}");
                }
                catch (Exception ex)
                {
                    AddLoadStatus($"Auto-update comfy backend failed.");
                    Logs.Error($"Failed to auto-update comfy backend: {ex}");
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
            await install("matplotlib", "matplotlib");
            await install("opencv_python_headless", "opencv-python-headless");
            await install("imageio_ffmpeg", "imageio-ffmpeg");
            await install("dill", "dill");
            await install("ultralytics", "ultralytics");
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
            Logs.Error($"Error stopping ComfyUI process: {ex}");
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
