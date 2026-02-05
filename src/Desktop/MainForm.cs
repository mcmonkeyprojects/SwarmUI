using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Diagnostics;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace SwarmUI.Desktop;

/// <summary>
/// Main form for the SwarmUI Desktop application.
/// Features: WebView2 embedded browser, dark titlebar, system tray, window state persistence.
/// </summary>
public partial class MainForm : Form
{
    #region Win32 API
    
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);
    
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);
    
    // Dark mode titlebar API
    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
    
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 = 19;
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
    private const int DWMWA_CAPTION_COLOR = 35;
    private const int DWMWA_BORDER_COLOR = 34;
    
    private const int SW_RESTORE = 9;
    private const int SW_SHOW = 5;
    
    #endregion

    #region Fields
    
    private WebView2 webView;
    private Process serverProcess;
    private readonly string[] commandLineArgs;
    private bool isClosing = false;
    
    // Server connection
    private readonly System.Windows.Forms.Timer retryTimer;
    private readonly System.Windows.Forms.Timer splashTimer;
    private int retryCount = 0;
    private const int MaxRetries = 180;
    private string serverUrl = "http://localhost:7801";
    private int serverPort = 7801;
    private bool useRemoteServer = false;
    private readonly HttpClient httpClient = new() { Timeout = TimeSpan.FromSeconds(2) };
    
    // Splash timing
    private bool serverIsReady = false;
    private bool splashMinTimeElapsed = false;
    private const int SplashMinMilliseconds = 2000; // 2 second minimum splash
    
    // System tray
    private NotifyIcon trayIcon;
    private ContextMenuStrip trayMenu;
    
    // Status panel
    private Panel statusPanel;
    private Label statusLabel;
    private ProgressBar progressBar;
    
    // Settings persistence
    private readonly string settingsPath;
    private WindowSettings windowSettings;
    
    private bool windowShownOnce = false;
    private bool isMinimizedToTray = false;
    
    #endregion

    #region Constructor
    
    public MainForm(string[] args)
    {
        commandLineArgs = args;
        ParseCommandLineArgs();
        
        string appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SwarmUI", "Desktop");
        Directory.CreateDirectory(appDataPath);
        settingsPath = Path.Combine(appDataPath, "window-settings.json");
        
        LoadWindowSettings();
        InitializeComponent();
        InitializeSystemTray();
        
        // Apply dark titlebar
        ApplyDarkTitlebar();
        
        retryTimer = new System.Windows.Forms.Timer { Interval = 500 };
        retryTimer.Tick += RetryTimer_Tick;
        
        splashTimer = new System.Windows.Forms.Timer { Interval = SplashMinMilliseconds };
        splashTimer.Tick += SplashTimer_Tick;
    }
    
    private void ParseCommandLineArgs()
    {
        for (int i = 0; i < commandLineArgs.Length; i++)
        {
            string arg = commandLineArgs[i].ToLowerInvariant();
            
            if ((arg == "--url" || arg == "-url") && i + 1 < commandLineArgs.Length)
            {
                serverUrl = commandLineArgs[i + 1];
                useRemoteServer = true;
                try
                {
                    var uri = new Uri(serverUrl);
                    serverPort = uri.Port;
                }
                catch { }
            }
            else if ((arg == "--port" || arg.StartsWith("--port=")) && i + 1 < commandLineArgs.Length)
            {
                string portValue = arg.Contains('=') ? arg.Split('=')[1] : commandLineArgs[i + 1];
                if (int.TryParse(portValue, out int port))
                {
                    serverPort = port;
                    if (!useRemoteServer)
                    {
                        serverUrl = $"http://localhost:{serverPort}";
                    }
                }
            }
        }
    }
    
    #endregion

    #region Dark Mode
    
    private void ApplyDarkTitlebar()
    {
        try
        {
            // Enable dark mode for titlebar
            int darkMode = 1;
            
            // Try Windows 10 20H1+ attribute first
            int result = DwmSetWindowAttribute(Handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int));
            
            if (result != 0)
            {
                // Fallback for older Windows 10 versions
                DwmSetWindowAttribute(Handle, DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1, ref darkMode, sizeof(int));
            }
            
            // Set caption (titlebar) color to dark gray (RGB as int: 0x001C1C1C = very dark gray)
            int captionColor = 0x001C1C1C; // Dark gray color
            DwmSetWindowAttribute(Handle, DWMWA_CAPTION_COLOR, ref captionColor, sizeof(int));
            
            // Set border color
            int borderColor = 0x00333333; // Slightly lighter border
            DwmSetWindowAttribute(Handle, DWMWA_BORDER_COLOR, ref borderColor, sizeof(int));
        }
        catch
        {
            // DWM APIs not available on older systems - ignore
        }
    }
    
    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyDarkTitlebar();
    }
    
    #endregion

    #region Initialization
    
    private void InitializeComponent()
    {
        SuspendLayout();
        
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        Name = "MainForm";
        Text = "SwarmUI";
        BackColor = Color.FromArgb(24, 24, 28); // Dark background
        
        MinimumSize = new Size(800, 600);
        
        if (windowSettings != null && windowSettings.IsValid())
        {
            StartPosition = FormStartPosition.Manual;
            Location = new Point(windowSettings.X, windowSettings.Y);
            ClientSize = new Size(windowSettings.Width, windowSettings.Height);
        }
        else
        {
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(1400, 900);
        }
        
        // Set icon
        try
        {
            using var stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("SwarmUI.Desktop.favicon.ico");
            if (stream != null)
            {
                Icon = new Icon(stream);
            }
        }
        catch { }
        
        // Status panel (loading screen)
        statusPanel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(24, 24, 28),
            Visible = true
        };
        
        var logoPanel = new Panel
        {
            Size = new Size(400, 200),
            BackColor = Color.Transparent
        };
        
        var titleLabel = new Label
        {
            Text = "SwarmUI",
            Font = new Font("Segoe UI", 36, FontStyle.Bold),
            ForeColor = Color.White,
            AutoSize = true,
            Location = new Point(0, 0)
        };
        
        string subtitleText = useRemoteServer 
            ? $"Connecting to {serverUrl}" 
            : "AI Image Generation Studio";
        var subtitleLabel = new Label
        {
            Text = subtitleText,
            Font = new Font("Segoe UI", 12, FontStyle.Regular),
            ForeColor = Color.FromArgb(160, 160, 170),
            AutoSize = true,
            Location = new Point(4, 55)
        };
        
        statusLabel = new Label
        {
            Text = "Initializing...",
            Font = new Font("Segoe UI", 10, FontStyle.Regular),
            ForeColor = Color.FromArgb(120, 180, 255),
            AutoSize = true,
            Location = new Point(4, 100)
        };
        
        progressBar = new ProgressBar
        {
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 30,
            Size = new Size(300, 4),
            Location = new Point(4, 130)
        };
        
        logoPanel.Controls.Add(titleLabel);
        logoPanel.Controls.Add(subtitleLabel);
        logoPanel.Controls.Add(statusLabel);
        logoPanel.Controls.Add(progressBar);
        statusPanel.Controls.Add(logoPanel);
        
        statusPanel.Resize += (s, e) =>
        {
            logoPanel.Location = new Point(
                (statusPanel.Width - logoPanel.Width) / 2,
                (statusPanel.Height - logoPanel.Height) / 2 - 50);
        };
        
        Controls.Add(statusPanel);
        
        // WebView2 (hidden initially)
        webView = new WebView2
        {
            Name = "webView",
            Dock = DockStyle.Fill,
            Visible = false,
            DefaultBackgroundColor = Color.FromArgb(24, 24, 28)
        };
        Controls.Add(webView);
        
        Load += MainForm_Load;
        Shown += MainForm_Shown;
        FormClosing += MainForm_FormClosing;
        Resize += MainForm_Resize;
        
        ResumeLayout(false);
    }
    
    private void InitializeSystemTray()
    {
        trayMenu = new ContextMenuStrip();
        trayMenu.Items.Add("Show SwarmUI", null, (s, e) => ShowFromTray());
        trayMenu.Items.Add("Minimize to Tray", null, (s, e) => MinimizeToTray());
        trayMenu.Items.Add("-");
        if (!useRemoteServer)
        {
            trayMenu.Items.Add("Restart Server", null, async (s, e) => await RestartServer());
            trayMenu.Items.Add("-");
        }
        trayMenu.Items.Add("Exit", null, (s, e) => ExitApplication());
        
        trayIcon = new NotifyIcon
        {
            ContextMenuStrip = trayMenu,
            Text = "SwarmUI Desktop",
            Visible = false
        };
        
        try
        {
            using var stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("SwarmUI.Desktop.favicon.ico");
            if (stream != null)
            {
                trayIcon.Icon = new Icon(stream);
            }
        }
        catch
        {
            trayIcon.Icon = SystemIcons.Application;
        }
        
        trayIcon.DoubleClick += (s, e) => ShowFromTray();
    }
    
    #endregion

    #region Form Events
    
    private async void MainForm_Load(object sender, EventArgs e)
    {
        UpdateStatus("Initializing...");
        
        // Start splash timer (minimum display time)
        splashTimer.Start();
        
        // Start server (unless remote)
        if (!useRemoteServer)
        {
            if (!StartSwarmServer())
            {
                return;
            }
        }
        
        // Initialize WebView2
        try
        {
            UpdateStatus("Preparing browser engine...");
            
            string userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SwarmUI", "Desktop", "WebView2");
            Directory.CreateDirectory(userDataFolder);
            
            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await webView.EnsureCoreWebView2Async(env);
            
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            webView.CoreWebView2.Settings.IsZoomControlEnabled = true;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            
            webView.CoreWebView2.DocumentTitleChanged += CoreWebView2_DocumentTitleChanged;
            webView.CoreWebView2.NewWindowRequested += CoreWebView2_NewWindowRequested;
            
            UpdateStatus(useRemoteServer ? "Connecting to remote server..." : "Waiting for server...");
            retryTimer.Start();
        }
        catch (Exception ex)
        {
            ShowError(
                "Failed to initialize browser component.\n\n" +
                "Please ensure Microsoft Edge WebView2 Runtime is installed.\n\n" +
                $"Error: {ex.Message}",
                "WebView2 Error");
            ExitApplication();
        }
    }
    
    private void MainForm_Shown(object sender, EventArgs e)
    {
        windowShownOnce = true;
        
        // Only maximize if explicitly saved as maximized AND settings are valid
        if (windowSettings != null && windowSettings.IsValid() && windowSettings.Maximized)
        {
            WindowState = FormWindowState.Maximized;
        }
        // Otherwise keep normal window state (not maximized)
        
        trayIcon.Visible = true;
    }
    
    private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
    {
        // Save settings immediately
        if (windowShownOnce && !isMinimizedToTray)
        {
            SaveWindowSettings();
        }
        
        isClosing = true;
        retryTimer.Stop();
        splashTimer.Stop();
        
        // Hide window IMMEDIATELY for instant feedback
        Hide();
        
        // Cleanup tray
        trayIcon.Visible = false;
        
        // MUST kill server synchronously before app exits
        if (!useRemoteServer)
        {
            KillServerNow();
        }
        
        // Dispose WebView
        webView?.Dispose();
    }
    
    private void MainForm_Resize(object sender, EventArgs e)
    {
        // Normal minimize behavior - stays in taskbar
        // System tray is only used when user explicitly chooses "Minimize to Tray" from menu
    }
    
    private void SplashTimer_Tick(object sender, EventArgs e)
    {
        splashTimer.Stop();
        splashMinTimeElapsed = true;
        TryShowMainContent();
    }
    
    private void CoreWebView2_DocumentTitleChanged(object sender, object e)
    {
        if (InvokeRequired)
        {
            Invoke(new Action(() => CoreWebView2_DocumentTitleChanged(sender, e)));
            return;
        }
        
        string title = webView.CoreWebView2.DocumentTitle;
        Text = string.IsNullOrWhiteSpace(title) ? "SwarmUI" : title;
        trayIcon.Text = Text.Length > 63 ? Text.Substring(0, 60) + "..." : Text;
    }
    
    private void CoreWebView2_NewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        try
        {
            Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true });
        }
        catch { }
    }
    
    #endregion

    #region Server Management
    
    private bool StartSwarmServer()
    {
        try
        {
            UpdateStatus("Locating SwarmUI server...");
            
            string serverExe = FindServerExecutable();
            
            if (serverExe == null)
            {
                ShowError(
                    "Could not find SwarmUI.exe.\n\n" +
                    "Please run launch-windows.bat first to build SwarmUI.",
                    "Server Not Found");
                ExitApplication();
                return false;
            }
            
            string rootPath = FindRootPath(serverExe);
            
            var args = new List<string>();
            bool hasLaunchMode = false;
            
            for (int i = 0; i < commandLineArgs.Length; i++)
            {
                string arg = commandLineArgs[i].ToLowerInvariant();
                if (arg == "--url" || arg == "-url")
                {
                    i++;
                    continue;
                }
                if (arg.Contains("launch_mode"))
                {
                    hasLaunchMode = true;
                }
                args.Add(commandLineArgs[i]);
            }
            
            if (!hasLaunchMode)
            {
                args.Add("--launch_mode");
                args.Add("none");
            }
            
            UpdateStatus($"Starting server on port {serverPort}...");
            
            var startInfo = new ProcessStartInfo
            {
                FileName = serverExe,
                Arguments = string.Join(" ", args),
                WorkingDirectory = rootPath,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            
            serverProcess = Process.Start(startInfo);
            
            if (serverProcess == null || serverProcess.HasExited)
            {
                ShowError("Failed to start SwarmUI server.", "Server Error");
                ExitApplication();
                return false;
            }
            
            return true;
        }
        catch (Exception ex)
        {
            ShowError($"Error starting server:\n\n{ex.Message}", "Server Error");
            ExitApplication();
            return false;
        }
    }
    
    private string FindServerExecutable()
    {
        string basePath = AppDomain.CurrentDomain.BaseDirectory;
        string rootPath = FindRootPath(basePath);
        
        string[] possiblePaths =
        [
            Path.Combine(rootPath, "src", "bin", "live_release", "SwarmUI.exe"),
            Path.Combine(rootPath, "SwarmUI.exe"),
            Path.Combine(basePath, "..", "live_release", "SwarmUI.exe"),
            Path.Combine(basePath, "..", "..", "live_release", "SwarmUI.exe"),
            Path.Combine(basePath, "SwarmUI.exe"),
        ];
        
        foreach (string path in possiblePaths)
        {
            string fullPath = Path.GetFullPath(path);
            if (File.Exists(fullPath))
                return fullPath;
        }
        
        return null;
    }
    
    private string FindRootPath(string startPath)
    {
        string rootPath = Path.GetDirectoryName(startPath) ?? startPath;
        
        for (int i = 0; i < 6; i++)
        {
            string parent = Directory.GetParent(rootPath)?.FullName;
            if (parent == null) break;
            rootPath = parent;
            
            if (File.Exists(Path.Combine(rootPath, "launch-windows.bat")) ||
                (Directory.Exists(Path.Combine(rootPath, "src")) && 
                 File.Exists(Path.Combine(rootPath, "src", "SwarmUI.csproj"))))
            {
                return rootPath;
            }
        }
        
        return Path.GetDirectoryName(startPath) ?? startPath;
    }
    
    /// <summary>
    /// Kill server immediately - called on app close.
    /// Must be synchronous to ensure server dies before app exits.
    /// </summary>
    private void KillServerNow()
    {
        try
        {
            if (serverProcess == null) return;
            
            // Try to get process ID before checking HasExited (can throw)
            int pid = -1;
            try { pid = serverProcess.Id; } catch { }
            
            if (pid > 0 && !serverProcess.HasExited)
            {
                // Force kill immediately - no graceful shutdown (too slow)
                try
                {
                    serverProcess.Kill(true); // true = kill entire process tree
                    serverProcess.WaitForExit(1000); // Wait max 1 second
                }
                catch { }
                
                // Double-check with taskkill if still alive
                if (!serverProcess.HasExited)
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = "taskkill",
                            Arguments = $"/F /T /PID {pid}",
                            CreateNoWindow = true,
                            UseShellExecute = false
                        })?.WaitForExit(1000);
                    }
                    catch { }
                }
            }
        }
        catch { }
        finally
        {
            try { serverProcess?.Dispose(); } catch { }
            serverProcess = null;
        }
    }
    
    private async Task RestartServer()
    {
        if (useRemoteServer) return;
        
        serverIsReady = false;
        splashMinTimeElapsed = false;
        
        UpdateStatus("Restarting server...");
        statusPanel.Visible = true;
        webView.Visible = false;
        
        KillServerNow();
        await Task.Delay(500);
        
        retryCount = 0;
        splashTimer.Start();
        
        if (StartSwarmServer())
        {
            retryTimer.Start();
        }
    }
    
    #endregion

    #region Connection Handling
    
    private async void RetryTimer_Tick(object sender, EventArgs e)
    {
        if (isClosing)
        {
            retryTimer.Stop();
            return;
        }

        retryCount++;
        
        float seconds = retryCount * 0.5f;
        UpdateStatus($"Connecting... ({seconds:F0}s)");
        
        bool ready = await CheckServerReady();
        
        if (ready)
        {
            retryTimer.Stop();
            serverIsReady = true;
            TryShowMainContent();
        }
        else if (retryCount >= MaxRetries)
        {
            retryTimer.Stop();
            ShowError(
                "Failed to connect to server within 90 seconds.\n\n" +
                (useRemoteServer 
                    ? $"Could not reach: {serverUrl}"
                    : "Try running launch-windows.bat to see errors."),
                "Connection Timeout");
            ExitApplication();
        }
        else if (!useRemoteServer && serverProcess != null && serverProcess.HasExited)
        {
            retryTimer.Stop();
            ShowError(
                $"Server exited with code {serverProcess.ExitCode}.\n\n" +
                "Run launch-windows.bat to see the error.",
                "Server Crashed");
            ExitApplication();
        }
    }
    
    private async Task<bool> CheckServerReady()
    {
        try
        {
            var response = await httpClient.GetAsync(serverUrl);
            return response.IsSuccessStatusCode || 
                   response.StatusCode == System.Net.HttpStatusCode.Redirect ||
                   response.StatusCode == System.Net.HttpStatusCode.Found;
        }
        catch
        {
            return false;
        }
    }
    
    private void TryShowMainContent()
    {
        // Only show when BOTH conditions are met:
        // 1. Server is ready
        // 2. Minimum splash time has elapsed
        if (!serverIsReady || !splashMinTimeElapsed)
            return;
        
        if (InvokeRequired)
        {
            Invoke(new Action(TryShowMainContent));
            return;
        }

        try
        {
            statusPanel.Visible = false;
            webView.Visible = true;
            webView.BringToFront();
            webView.CoreWebView2.Navigate(serverUrl);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Navigation error: {ex.Message}");
        }
    }
    
    #endregion

    #region System Tray
    
    private void MinimizeToTray()
    {
        isMinimizedToTray = true;
        Hide();
        WindowState = FormWindowState.Normal;
    }
    
    private void ShowFromTray()
    {
        isMinimizedToTray = false;
        Show();
        
        if (windowSettings != null && windowSettings.Maximized)
        {
            WindowState = FormWindowState.Maximized;
        }
        else
        {
            WindowState = FormWindowState.Normal;
        }
        
        Activate();
        BringToFront();
    }
    
    private void ExitApplication()
    {
        isClosing = true;
        Application.Exit();
    }
    
    #endregion

    #region Settings
    
    private void LoadWindowSettings()
    {
        try
        {
            if (File.Exists(settingsPath))
            {
                string json = File.ReadAllText(settingsPath);
                windowSettings = JsonSerializer.Deserialize<WindowSettings>(json) ?? new WindowSettings();
            }
            else
            {
                windowSettings = new WindowSettings();
            }
        }
        catch
        {
            windowSettings = new WindowSettings();
        }
    }
    
    private void SaveWindowSettings()
    {
        try
        {
            if (!windowShownOnce) return;
            
            // For normal state, use actual Location and ClientSize
            // For maximized state, use RestoreBounds (which stores the normal size)
            if (WindowState == FormWindowState.Normal)
            {
                windowSettings.X = Location.X;
                windowSettings.Y = Location.Y;
                windowSettings.Width = ClientSize.Width;
                windowSettings.Height = ClientSize.Height;
                windowSettings.Maximized = false;
            }
            else if (WindowState == FormWindowState.Maximized)
            {
                // Keep previous X, Y, Width, Height (don't overwrite with screen size)
                // Just mark as maximized
                windowSettings.Maximized = true;
            }
            // If minimized, don't save anything (keep previous values)
            
            // Validate bounds
            if (windowSettings.Width < 800) windowSettings.Width = 1400;
            if (windowSettings.Height < 600) windowSettings.Height = 900;
            if (windowSettings.X < -100) windowSettings.X = 100;
            if (windowSettings.Y < -100) windowSettings.Y = 100;
            
            string json = JsonSerializer.Serialize(windowSettings, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(settingsPath, json);
            
            Debug.WriteLine($"Saved: X={windowSettings.X}, Y={windowSettings.Y}, W={windowSettings.Width}, H={windowSettings.Height}, Max={windowSettings.Maximized}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to save settings: {ex.Message}");
        }
    }
    
    private class WindowSettings
    {
        public int X { get; set; } = 100;
        public int Y { get; set; } = 100;
        public int Width { get; set; } = 1400;
        public int Height { get; set; } = 900;
        public bool Maximized { get; set; } = false;
        
        public bool IsValid()
        {
            if (Width < 800 || Height < 600)
                return false;
                
            Rectangle savedBounds = new Rectangle(X, Y, Width, Height);
            foreach (Screen screen in Screen.AllScreens)
            {
                if (screen.WorkingArea.IntersectsWith(savedBounds))
                    return true;
            }
            return false;
        }
    }
    
    #endregion

    #region UI Helpers
    
    private void UpdateStatus(string message)
    {
        if (InvokeRequired)
        {
            Invoke(new Action(() => UpdateStatus(message)));
            return;
        }
        
        if (statusLabel != null)
            statusLabel.Text = message;
    }
    
    private void ShowError(string message, string title)
    {
        MessageBox.Show(this, message, title, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
    
    #endregion

    #region Dispose
    
    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            retryTimer?.Dispose();
            splashTimer?.Dispose();
            httpClient?.Dispose();
            webView?.Dispose();
            serverProcess?.Dispose();
            trayIcon?.Dispose();
            trayMenu?.Dispose();
            statusPanel?.Dispose();
        }
        base.Dispose(disposing);
    }
    
    #endregion
}
