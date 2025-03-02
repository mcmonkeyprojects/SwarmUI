using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;
using SwarmUI.Backends;
using SwarmUI.Builtin_ComfyUIBackend;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.WebSockets;
using System.Runtime.InteropServices;

namespace SwarmUI.Core;

/// <summary>Core helper class for handling installing a new instance of SwarmUI.</summary>
public class Installation
{
    /// <summary>The current websocket trying to install Swarm.</summary>
    public static WebSocket InstallSocket = null;

    /// <summary>Tracker of step progress.</summary>
    public static int StepsThusFar;

    /// <summary>Tracker of how many steps are expected.</summary>
    public static int TotalSteps;

    /// <summary>Output a message to logs and the websocket.</summary>
    public static async Task Output(string str)
    {
        Logs.Init($"[Installer] {str}");
        await InstallSocket.SendJson(new JObject() { ["info"] = str }, API.WebsocketTimeout);
    }

    /// <summary>Send a progress update for the installation down the websocket.</summary>
    public static void UpdateProgress(long progress, long total, long perSec)
    {
        // TODO: better way to send these out without waiting
        InstallSocket.SendJson(new JObject() { ["progress"] = progress, ["total"] = total, ["steps"] = StepsThusFar, ["total_steps"] = TotalSteps, ["per_second"] = perSec }, API.WebsocketTimeout).Wait();
    }

    /// <summary>Configure the theme during installation.</summary>
    public static async Task Theme(string theme)
    {
        if (Program.Web.RegisteredThemes.ContainsKey(theme))
        {
            await Output($"Setting theme to {theme}.");
            Program.ServerSettings.DefaultUser.Theme = theme;
        }
        else
        {
            await Output($"Theme {theme} is not valid!");
            throw new SwarmUserErrorException("Invalid theme input!");
        }
    }

    /// <summary>Configure the "installed for" setting during installation.</summary>
    public static async Task InstalledFor(string installed_for)
    {
        switch (installed_for)
        {
            case "just_self":
                await Output("Configuring settings as 'just yourself' install.");
                Program.ServerSettings.Network.Host = "localhost";
                Program.ServerSettings.Network.Port = 7801;
                Program.ServerSettings.Network.PortCanChange = true;
                Program.ServerSettings.LaunchMode = "web"; // TODO: Electron?
                break;
            case "just_self_lan":
                await Output("Configuring settings as 'just yourself (LAN)' install.");
                Program.ServerSettings.Network.Host = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "*" : "0.0.0.0";
                Program.ServerSettings.Network.Port = 7801;
                Program.ServerSettings.Network.PortCanChange = true;
                Program.ServerSettings.LaunchMode = "web";
                break;
            default:
                throw new SwarmUserErrorException($"Invalid install type '{installed_for}'!");
        }
    }

    /// <summary>Configure the backend as ComfyUI specifically for Windows during installation.</summary>
    public static async Task<(string, string, bool)> BackendComfyWindows(bool install_amd)
    {
        try
        {
            if (install_amd)
            {
                await Utilities.DownloadFile("https://github.com/comfyanonymous/ComfyUI/releases/download/latest/ComfyUI_windows_portable_nvidia_cu118_or_cpu_22_05_2023.7z", "dlbackend/comfyui_dl.7z", UpdateProgress);
            }
            else
            {
                await Utilities.DownloadFile("https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z", "dlbackend/comfyui_dl.7z", UpdateProgress);
            }
        }
        catch (HttpRequestException ex)
        {
            Logs.Error($"Comfy download failed: {ex.ReadableString()}");
            Logs.Info("Will try alternate download...");
            await Utilities.DownloadFile("https://github.com/comfyanonymous/ComfyUI/releases/download/latest/ComfyUI_windows_portable_nvidia_or_cpu_nightly_pytorch.7z", "dlbackend/comfyui_dl.7z", UpdateProgress);
        }
        StepsThusFar++;
        UpdateProgress(0, 0, 0);
        await Output("Downloaded! Extracting... (look in terminal window for details)");
        Directory.CreateDirectory("dlbackend/tmpcomfy/");
        await Process.Start("launchtools/7z/win/7za.exe", $"x dlbackend/comfyui_dl.7z -o\"dlbackend/tmpcomfy/\" -y").WaitForExitAsync(Program.GlobalProgramCancel);
        static void moveFolder()
        {
            if (Directory.Exists("dlbackend/tmpcomfy/ComfyUI_windows_portable"))
            {
                Directory.Move("dlbackend/tmpcomfy/ComfyUI_windows_portable", "dlbackend/comfy");
            }
            else
            {
                Directory.Move("dlbackend/tmpcomfy/ComfyUI_windows_portable_nightly_pytorch", "dlbackend/comfy");
            }
        };
        try
        {
            moveFolder();
        }
        catch (Exception)
        {
            // This might fail if eg an antivirus program locks up the folder, so give it a few seconds to do its job then try the move again
            await Task.Delay(TimeSpan.FromSeconds(5));
            try
            {
                moveFolder();
            }
            catch (Exception)
            {
                // Just in case the lock up is slow.
                await Task.Delay(TimeSpan.FromSeconds(15));
                moveFolder();
                // This has been a 20 second delay now, so either it's done now and works, or the problem can't be resolved by waiting, so don't waste the user's time with more tries.
            }
        }
        await Output("Installing prereqs...");
        try
        {
            await Utilities.DownloadFile("https://aka.ms/vs/16/release/vc_redist.x64.exe", "dlbackend/vc_redist.x64.exe", UpdateProgress);
            UpdateProgress(0, 0, 0);
            await Process.Start(new ProcessStartInfo(Path.GetFullPath("dlbackend/vc_redist.x64.exe"), "/quiet /install /passive /norestart") { UseShellExecute = true }).WaitForExitAsync(Program.GlobalProgramCancel);
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to install VC Redist: {ex}");
        }
        string path = "dlbackend/comfy/ComfyUI/main.py";
        string comfyFolderPath = Path.GetFullPath("dlbackend/comfy");
        if (install_amd)
        {
            await Output("Fixing Comfy install for AMD...");
            // Note: the old Python 3.10 comfy file is needed for AMD, and it has a cursed git config (mandatory auth header? argh) so this is a hack-fix for that
            File.WriteAllBytes("dlbackend/comfy/ComfyUI/.git/config", "[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n\tlogallrefupdates = true\n\tignorecase = true\n[remote \"origin\"]\n\turl = https://github.com/comfyanonymous/ComfyUI\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[gc]\n\tauto = 0\n[branch \"master\"]\n\tremote = origin\n\tmerge = refs/heads/master\n[lfs]\n\trepositoryformatversion = 0\n[remote \"upstream\"]\n\turl = https://github.com/comfyanonymous/ComfyUI.git\n\tfetch = +refs/heads/*:refs/remotes/upstream/*\n".EncodeUTF8());
        }
        await Output("Prepping ComfyUI's git repo...");
        string fetchResp = await Utilities.RunGitProcess($"fetch", $"{comfyFolderPath}/ComfyUI");
        Logs.Debug($"ComfyUI Install git fetch response: {fetchResp}");
        string checkoutResp = await Utilities.RunGitProcess($"checkout master --force", $"{comfyFolderPath}/ComfyUI");
        Logs.Debug($"ComfyUI Install git checkout master response: {checkoutResp}");
        string response = await Utilities.RunGitProcess($"pull", $"{comfyFolderPath}/ComfyUI");
        Logs.Debug($"ComfyUI Install git pull response: {response}");
        await Output("Ensuring all current Comfy requirements are installed...");
        string requirementsRaw = File.ReadAllText($"{comfyFolderPath}/ComfyUI/requirements.txt");
        // Exclude torch requirements here as pip installing those just breaks things
        string[] requirements = [.. requirementsRaw.Replace('\r', '\n').Split('\n').Select(r => r.Trim()).Where(r => !string.IsNullOrWhiteSpace(r) && !r.StartsWith('#') && !r.StartsWith("torch"))];
        await NetworkBackendUtils.RunProcessWithMonitoring(new ProcessStartInfo($"{comfyFolderPath}/python_embeded/python.exe", $"-s -m pip install{(install_amd ? "-U " : "")} {requirements.JoinString(" ")}") { WorkingDirectory = comfyFolderPath }, "ComfyUI Install (python requirements)", "comfyinstall");
        string extraArgs = "";
        bool enablePreviews = true;
        if (install_amd)
        {
            enablePreviews = false;
            await Output("Installing AMD compatible Torch-DirectML...");
            await NetworkBackendUtils.RunProcessWithMonitoring(new ProcessStartInfo($"{comfyFolderPath}/python_embeded/python.exe", "-s -m pip install torch-directml") { UseShellExecute = false, WorkingDirectory = comfyFolderPath }, "ComfyUI Install (directml)", "comfyinstall");
            extraArgs += "--directml ";
        }
        return (path, extraArgs, enablePreviews);
    }

    /// <summary>Configure the backend as ComfyUI during installation.</summary>
    public static async Task BackendComfy(bool install_amd)
    {
        await Output("Downloading ComfyUI backend... please wait...");
        Directory.CreateDirectory("dlbackend/");
        string path;
        string extraArgs = "";
        bool enablePreviews = true;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            (path, extraArgs, enablePreviews) = await BackendComfyWindows(install_amd);
        }
        else
        {
            StepsThusFar++;
            UpdateProgress(0, 0, 0);
            string gpuType = install_amd ? "amd" : "nv";
            Logs.LogLevel level = Logs.MinimumLevel;
            Logs.MinimumLevel = Logs.LogLevel.Verbose;
            try
            {
                Process installer = Process.Start(new ProcessStartInfo("/bin/bash", $"launchtools/comfy-install-linux.sh {gpuType}") { RedirectStandardOutput = true, UseShellExecute = false, RedirectStandardError = true });
                NetworkBackendUtils.ReportLogsFromProcess(installer, "ComfyUI Install (Linux Script)", "comfyinstall");
                await installer.WaitForExitAsync(Program.GlobalProgramCancel);
                if (installer.ExitCode != 0)
                {
                    throw new SwarmReadableErrorException("ComfyUI install failed! Check debug logs for details.");
                }
                path = "dlbackend/ComfyUI/main.py";
            }
            finally
            {
                Logs.MinimumLevel = level;
            }
        }
        NvidiaUtil.NvidiaInfo[] nv = NvidiaUtil.QueryNvidia();
        int gpu = 0;
        if (nv is not null && nv.Length > 0)
        {
            NvidiaUtil.NvidiaInfo mostVRAM = nv.OrderByDescending(n => n.TotalMemory.InBytes).First();
            gpu = mostVRAM.ID;
        }
        await Output("Enabling ComfyUI...");
        Program.Backends.AddNewOfType(Program.Backends.BackendTypes["comfyui_selfstart"], new ComfyUISelfStartBackend.ComfyUISelfStartSettings() { StartScript = path, GPU_ID = $"{gpu}", ExtraArgs = extraArgs.Trim(), EnablePreviews = enablePreviews });
    }

    /// <summary>Configure the backend during installation.</summary>
    public static async Task Backend(string backend, bool install_amd)
    {
        switch (backend)
        {
            case "comfyui":
                {
                    await BackendComfy(install_amd);
                    break;
                }
            case "none":
                await Output("Not installing any backend.");
                break;
            default:
                throw new SwarmReadableErrorException($"Invalid backend type '{backend}'!");
        }
    }

    /// <summary>Run model downloads during installation.</summary>
    public static async Task Models(string models)
    {
        if (models == "none")
        {
            return;
        }
        foreach (string model in models.Split(','))
        {
            if (!CommonModels.Known.TryGetValue(model.Trim(), out CommonModels.ModelInfo modelInfo))
            {
                throw new SwarmReadableErrorException($"Invalid model {model}!");
            }
            await Output($"Downloading model from '{modelInfo.URL}'... please wait...");
            try
            {
                await modelInfo.DownloadNow(UpdateProgress);
            }
            catch (SwarmReadableErrorException ex)
            {
                Logs.Error($"Failed to download '{modelInfo.URL}': {ex.Message}");
            }
            catch (IOException ex)
            {
                Logs.Error($"Failed to download '{modelInfo.URL}' (IO): {ex.GetType().Name}: {ex.Message}");
                Logs.Debug($"Download exception: {ex.ReadableString()}");
                await Output($"Failed to download '{modelInfo.URL}' (IO): {ex.GetType().Name}: {ex.Message}");
            }
            catch (HttpRequestException ex)
            {
                Logs.Error($"Failed to download '{modelInfo.URL}' (HTTP): {ex.GetType().Name}: {ex.Message}");
                Logs.Debug($"Download exception: {ex.ReadableString()}");
                await Output($"Failed to download '{modelInfo.URL}' (HTTP): {ex.GetType().Name}: {ex.Message}");
            }
            StepsThusFar++;
            UpdateProgress(0, 0, 0);
            await Output("Model download complete.");
        }
        Program.MainSDModels.Refresh();
    }

    /// <summary>Make a desktop shortcut (Windows only).</summary>
    public static void MakeShortcut()
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return;
        }
        string path = $"{Environment.GetFolderPath(Environment.SpecialFolder.Desktop)}/SwarmUI.url";
        string curDir = Directory.GetCurrentDirectory().TrimEnd('\\');
        string content =
            $"""
            [InternetShortcut]
            URL="{curDir}\launch-windows.bat"
            IconFile="{curDir}\src\wwwroot\favicon.ico"
            IconIndex=0
            """;
        File.WriteAllText(path, content);
    }

    /// <summary>Apply changes to server settings.</summary>
    public static void SettingsApply()
    {
        Program.ServerSettings.IsInstalled = true;
        Program.ServerSettings.InstallDate = $"{DateTimeOffset.Now:yyyy-MM-dd}";
        Program.ServerSettings.InstallVersion = Utilities.Version;
        if (Program.ServerSettings.LaunchMode == "webinstall")
        {
            Program.ServerSettings.LaunchMode = "web";
        }
        Program.SaveSettingsFile();
    }

    /// <summary>Main install function entry point.</summary>
    public static async Task Install(WebSocket socket, string theme, string installed_for, string backend, string models, bool install_amd, string language, bool make_shortcut)
    {
        if (Directory.Exists("dlbackend/comfy"))
        {
            throw new SwarmUserErrorException("It looks like a previous install already exists here. If you are intentionally rerunning the installer, please delete 'Data' and 'dlbackend' folders from the Swarm folder.");
        }
        InstallSocket = socket;
        await Output("Installation request received, processing...");
        await Theme(theme);
        Program.ServerSettings.DefaultUser.Language = language;
        await InstalledFor(installed_for);
        StepsThusFar = 1;
        TotalSteps = 4;
        if (backend == "comfyui")
        {
            TotalSteps++;
        }
        if (models != "none")
        {
            TotalSteps += models.Split(',').Length;
        }
        StepsThusFar++;
        UpdateProgress(0, 0, 0);
        await Backend(backend, install_amd);
        if (make_shortcut)
        {
            MakeShortcut();
        }
        SettingsApply();
        await Models(models);
        StepsThusFar++;
        UpdateProgress(0, 0, 0);
        await Program.Backends.ReloadAllBackends();
        StepsThusFar++;
        UpdateProgress(0, 0, 0);
        await Output("Installed!");
        await socket.SendJson(new JObject() { ["success"] = true }, API.WebsocketTimeout);
    }
}
