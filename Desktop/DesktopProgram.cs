using Avalonia;
using System;
using System.IO;

namespace Desktop;

public class DesktopProgram
{
    public static string PageUrl = "http://localhost:7801";

    public static string WebDataDir;

    [STAThread]
    public static void Main(string[] args)
    {
        if (args.Length > 0)
        {
            PageUrl = args[0];
        }
        if (args.Length > 1)
        {
            WebDataDir = args[1];
            Directory.CreateDirectory(WebDataDir);
        }
        AppBuilder app = BuildAvaloniaApp();
        app.StartWithClassicDesktopLifetime([]);
    }

    public static AppBuilder BuildAvaloniaApp()
    {
        return AppBuilder.Configure<App>().UsePlatformDetect().UseWaylandWithFallback().WithInterFont().LogToTrace();
    }
}
