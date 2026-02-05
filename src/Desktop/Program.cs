using System.Diagnostics;
using System.Runtime.InteropServices;

namespace SwarmUI.Desktop;

/// <summary>Entry point for the SwarmUI Desktop application.</summary>
static class Program
{
    // Win32 API for window activation
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);
    
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);
    
    private const int SW_RESTORE = 9;
    private const int SW_SHOW = 5;
    
    private static Mutex singleInstanceMutex;
    
    /// <summary>The main entry point for the application.</summary>
    [STAThread]
    static int Main(string[] args)
    {
        // Ensure only one instance runs at a time
        const string mutexName = "Global\\SwarmUI.Desktop.SingleInstance.Mutex";
        
        try
        {
            singleInstanceMutex = new Mutex(true, mutexName, out bool createdNew);
            
            if (!createdNew)
            {
                // Another instance is running - try to bring it to front
                BringExistingInstanceToFront();
                return 0;
            }
        }
        catch (Exception ex)
        {
            // If mutex creation fails (permissions), continue anyway
            Debug.WriteLine($"Mutex creation failed: {ex.Message}");
        }
        
        try
        {
            // Configure application
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            
            // Set up global exception handling
            Application.ThreadException += Application_ThreadException;
            AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            
            // Run the main application
            // SwarmUI's own web installer handles first-time setup
            Application.Run(new MainForm(args));
            
            return 0;
        }
        catch (Exception ex)
        {
            ShowFatalError(ex);
            return 1;
        }
        finally
        {
            // Always release mutex
            try
            {
                singleInstanceMutex?.ReleaseMutex();
            }
            catch { }
            
            singleInstanceMutex?.Dispose();
        }
    }
    
    private static void Application_ThreadException(object sender, ThreadExceptionEventArgs e)
    {
        ShowFatalError(e.Exception);
    }
    
    private static void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            ShowFatalError(ex);
        }
    }
    
    private static void ShowFatalError(Exception ex)
    {
        string message = $"SwarmUI Desktop encountered an unexpected error:\n\n{ex.Message}\n\n" +
                        "The application will now close.";
        
        try
        {
            MessageBox.Show(message, "SwarmUI Desktop - Error", 
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch
        {
            Console.Error.WriteLine(message);
        }
    }
    
    private static void BringExistingInstanceToFront()
    {
        try
        {
            // Find existing SwarmUI.Desktop process
            Process current = Process.GetCurrentProcess();
            Process[] processes = Process.GetProcessesByName(current.ProcessName);
            
            foreach (Process process in processes)
            {
                if (process.Id != current.Id)
                {
                    IntPtr hWnd = process.MainWindowHandle;
                    
                    if (hWnd != IntPtr.Zero)
                    {
                        // Window is visible - bring to front
                        if (IsIconic(hWnd))
                        {
                            ShowWindow(hWnd, SW_RESTORE);
                        }
                        else
                        {
                            ShowWindow(hWnd, SW_SHOW);
                        }
                        SetForegroundWindow(hWnd);
                        return;
                    }
                    else
                    {
                        // Window might be in tray
                        MessageBox.Show(
                            "SwarmUI Desktop is already running.\n\n" +
                            "Look for the SwarmUI icon in your system tray\n" +
                            "(bottom-right corner of your screen).\n\n" +
                            "Double-click the tray icon to show the window.",
                            "SwarmUI Already Running",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information);
                        return;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error finding existing instance: {ex.Message}");
        }
        
        // Fallback message
        MessageBox.Show(
            "SwarmUI Desktop appears to be already running.\n\n" +
            "Check your system tray for the SwarmUI icon.",
            "Already Running",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }
}
