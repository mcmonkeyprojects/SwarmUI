using FreneticUtilities.FreneticExtensions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Primitives;
using SwarmUI.Accounts;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.IO;
using System.Net;

namespace SwarmUI.Core;

/// <summary>Core handler for the web-server (mid-layer & front-end).</summary>
public class WebServer
{
    /// <summary>Primary core ASP.NET <see cref="WebApplication"/> reference.</summary>
    public static WebApplication WebApp;

    /// <summary>The internal web host url base this webserver is using.</summary>
    public static string Host;

    /// <summary>The internal web host port this webserver is using.</summary>
    public static int Port;

    /// <summary>Changes the server host:port path.</summary>
    public static void SetHost(string host, int port)
    {
        Host = host;
        Port = port;
        Environment.SetEnvironmentVariable("ASPNETCORE_URLS", HostURL);
    }

    /// <summary>The internal web host url this webserver is using.</summary>
    public static string HostURL => $"http://{Host}:{Port}";

    /// <summary>A browsable page to this server.</summary>
    public static string PageURL => $"http://{(Host == "*" || Host == "0.0.0.0" ? "localhost" : Host)}:{Port}";

    /// <summary>Minimum ASP.NET Log Level.</summary>
    public static LogLevel LogLevel;

    /// <summary>Extra file content added by extensions.</summary>
    public Dictionary<string, string> ExtensionSharedFiles = [];

    /// <summary>Extra binary file content added by extensions.</summary>
    public Dictionary<string, Lazy<byte[]>> ExtensionAssets = [];

    /// <summary>Extra content for the page header. Automatically set based on extensions.</summary>
    public static HtmlString PageHeaderExtra = new("");

    /// <summary>Extra content for the page footer. Automatically set based on extensions.</summary>
    public static HtmlString PageFooterExtra = new("");

    /// <summary>Extra content for the Text2Image page's tab list. Automatically set based on extensions.</summary>
    public static HtmlString T2ITabHeader = new("");

    /// <summary>Extra content for the Text2Image page's tab bodies. Automatically set based on extensions.</summary>
    public static HtmlString T2ITabBody = new("");

    /// <summary>Set of registered Theme IDs.</summary>
    public Dictionary<string, ThemeData> RegisteredThemes = [];

    /// <summary>Data about a theme.</summary>
    /// <param name="ID">The registered theme ID.</param>
    /// <param name="Name">The clear name to display to users.</param>
    /// <param name="CSSPaths">The web request path for CSS files for this theme.</param>
    /// <param name="IsDark">True if the theme is dark, false if light.</param>
    public record class ThemeData(string ID, string Name, string[] CSSPaths, bool IsDark) { }

    /// <summary>Register a theme.</summary>
    public void RegisterTheme(ThemeData theme)
    {
        RegisteredThemes.Add(theme.ID, theme);
    }

    /// <summary>Register a theme from an extension.</summary>
    public void RegisterTheme(string id, string name, string extFile, Extension extension, bool isDark)
    {
        RegisterTheme(new(id, name, [$"/ExtensionFile/{extension.ExtensionName}/{extFile}"], isDark));
    }

    /// <summary>Initial prep, called by <see cref="Program"/>, generally should not be touched externally.</summary>
    public void PreInit()
    {
        RegisteredThemes.Clear();
        RegisterTheme(new("modern_dark", "Modern Dark", ["/css/themes/modern.css", "/css/themes/modern_dark.css"], true));
        RegisterTheme(new("modern_light", "Modern Light", ["/css/themes/modern.css", "/css/themes/modern_light.css"], false));
        RegisterTheme(new("solarized", "Solarized Light", ["/css/themes/modern.css", "/css/themes/solarized.css"], false));
        RegisterTheme(new("dark_dreams", "Dark Dreams", ["/css/themes/dark_dreams.css"], true));
        RegisterTheme(new("gravity_blue", "Gravity Blue", ["/css/themes/gravity_blue.css"], true));
        RegisterTheme(new("cyber_swarm", "Cyber Swarm", ["/css/themes/cyber_swarm.css"], true));
        RegisterTheme(new("punked", "Punked", ["/css/themes/punked.css"], true));
        RegisterTheme(new("eyesear_white", "Eyesear White", ["/css/themes/eyesear_white.css"], false));
    }

    /// <summary>Main prep, called by <see cref="Program"/>, generally should not be touched externally.</summary>
    public void Prep()
    {
        Utilities.LoadTimer timer = new();
        // I don't know who's to blame, probably half Microsoft half AWS, but if this is enabled (which it is by default on all profiles, even production?!),
        // it creates a persistent filewatcher which locks up hard. So, forcibly disable it. Which it should be disabled anyway. Obviously.
        Environment.SetEnvironmentVariable("ASPNETCORE_hostBuilder:reloadConfigOnChange", "false");
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions() { WebRootPath = "src/wwwroot" });
        timer.Check("[Web] WebApp builder prep");
        builder.Services.AddRazorPages();
        builder.Services.AddResponseCompression();
        builder.Logging.SetMinimumLevel(LogLevel);
        WebApp = builder.Build();
        WebApp.Use(async (context, next) =>
        {
            if (context.Request.Headers.Host.Any() && context.Request.Headers.Origin.Any())
            {
                string host = context.Request.Headers.Host[0].ToLowerFast();
                string origin = context.Request.Headers.Origin[0].ToLowerFast();
                Uri uri = new(origin);
                string originMain = uri.Authority.ToLowerFast();
                if (host != originMain)
                {
                    // TODO: Instate this check fully only after comfy's version is stable.
                    // Swarm doesn't technically need it (as we have session token checks) but still better to validate
                    /*
                    context.Response.StatusCode = 403;
                    await context.Response.WriteAsync("Forbidden");
                    return;
                    */
                }
            }
            string authKey = Program.ServerSettings.Network.RequiredAuthorization;
            if (!string.IsNullOrWhiteSpace(authKey))
            {
                string authHeader = context.Request.Headers.Authorization.FirstOrDefault();
                if (authHeader != authKey)
                {
                    IPAddress addr = context.Connection.RemoteIpAddress;
                    string remoteIp = addr.ToString();
                    if (addr.IsIPv4MappedToIPv6)
                    {
                        remoteIp = addr.MapToIPv4().ToString();
                    }
                    if (!Program.ServerSettings.Network.AuthBypassIPs.SplitFast(',').Contains(remoteIp))
                    {
                        if (string.IsNullOrWhiteSpace(authHeader))
                        {
                            Logs.Debug($"Unauthorized request from {remoteIp} (no auth header)");
                        }
                        else
                        {
                            Logs.Debug($"Unauthorized request from {remoteIp} (auth header len {authHeader.Length}, expected {authKey.Length})");
                        }
                        context.Response.StatusCode = 401;
                        await context.Response.WriteAsync("Unauthorized");
                        return;
                    }
                }
            }
            await next();
        });
        WebApp.UseResponseCompression();
        timer.Check("[Web] WebApp build");
        if (WebApp.Environment.IsDevelopment())
        {
            Utilities.VaryID += ".DEV" + ((DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 10L) % 1000000L);
            WebApp.UseDeveloperExceptionPage();
        }
        else
        {
            WebApp.UseExceptionHandler("/Error/Internal");
        }
        timer.Check("[Web] exception handler");
        if (Program.ProxyHandler is not null)
        {
            WebApp.Lifetime.ApplicationStarted.Register(Program.ProxyHandler.Start);
        }
        WebApp.Lifetime.ApplicationStopping.Register(() => Program.Shutdown());
        timer.Check("[Web] StartStop handler");
        WebApp.UseStaticFiles(new StaticFileOptions());
        timer.Check("[Web] static files");
        WebApp.Use(async (context, next) =>
        {
            string referrer = (context.Request.Headers.Referer.FirstOrDefault() ?? "").After("://").After('/').ToLowerFast();
            string path = context.Request.Path.Value.ToLowerFast();
            if (referrer.StartsWith("comfybackenddirect/") && !path.StartsWith("/comfybackenddirect/"))
            {
                Logs.Debug($"ComfyBackendDirect call was misrouted, rerouting to '{context.Request.Path}'");
                context.Response.Redirect($"/ComfyBackendDirect{context.Request.Path}");
                return;
            }
            else if (path.StartsWith("/assets/"))
            {
                Logs.Debug($"ComfyBackendDirect assets call was misrouted and improperly referrered, rerouting to '{context.Request.Path}'");
                context.Response.Redirect($"/ComfyBackendDirect{context.Request.Path}");
                return;
            }
            if (Program.ServerSettings.Network.EnableSpecialDevForwarding)
            {
                if (path.StartsWith("/node_modules/") || path.StartsWith("/@") || path.StartsWith("/src/"))
                {
                    Logs.Debug($"ComfyBackendDirect node frontend call was misrouted and improperly referrered, rerouting to '{context.Request.Path}'");
                    context.Request.Path = $"/ComfyBackendDirect{context.Request.Path}";
                }
                else if ((path.EndsWith(".vue") || path.EndsWith(".ts")) && !path.StartsWith("/comfybackenddirect/"))
                {
                    Logs.Debug($"ComfyBackendDirect frontend related file ext call was misrouted and improperly referrered, rerouting to '{context.Request.Path}'");
                    context.Request.Path = $"/ComfyBackendDirect{context.Request.Path}";
                }
                else if (context.Request.Headers.SecWebSocketProtocol.FirstOrDefault() == "vite-hmr")
                {
                    Logs.Debug($"ComfyBackendDirect frontend related Vite HMR call was misrouted and improperly referrered, forwarding to '{context.Request.Path}'");
                    context.Request.Path = $"/ComfyBackendDirect{context.Request.Path}";
                }
            }
            await next();
        });
        WebApp.UseRouting();
        WebApp.UseWebSockets(new WebSocketOptions() { KeepAliveInterval = TimeSpan.FromSeconds(30) });
        WebApp.MapRazorPages();
        timer.Check("[Web] core use calls");
        WebApp.MapGet("/", () => Results.Redirect("Text2Image"));
        WebApp.Map("/API/{*Call}", API.HandleAsyncRequest);
        WebApp.MapGet("/Output/{*Path}", ViewOutput);
        WebApp.MapGet("/View/{*Path}", ViewOutput);
        WebApp.MapGet("/ExtensionFile/{*f}", ViewExtensionScript);
        timer.Check("[Web] core maps");
        WebApp.Use(async (context, next) =>
        {
            await next();
            if (context.Response.StatusCode == 404)
            {
                if (context.Response.HasStarted)
                {
                    return;
                }
                string path = context.Request.Path.Value.ToLowerFast();
                if (!path.StartsWith("/error/"))
                {
                    try
                    {
                        context.Response.Redirect("/Error/404");
                        return;
                    }
                    catch (Exception)
                    {
                        Logs.Debug($"Connection to {context.Request.Path} failed and cannot be repaired");
                    }
                    await next();
                }
            }
        });
        Logs.Init("Scan for web extensions...");
        GatherExtensionPageAdditions();
        timer.Check("[Web] end");
    }

    public void GatherExtensionPageAdditions()
    {
        StringBuilder scripts = new(), stylesheets = new(), tabHeader = new(), tabFooter = new();
        ExtensionSharedFiles.Clear();
        ExtensionAssets.Clear();
        Program.Extensions.RunOnAllExtensions(e =>
        {
            foreach (string script in e.ScriptFiles)
            {
                string fname = $"/ExtensionFile/{e.ExtensionName}/{script}";
                ExtensionSharedFiles.Add(fname, File.ReadAllText($"{e.FilePath}{script}"));
                scripts.Append($"<script src=\"{fname}?vary={Utilities.VaryID}\"></script>\n");
            }
            foreach (string css in e.StyleSheetFiles)
            {
                string fname = $"/ExtensionFile/{e.ExtensionName}/{css}";
                ExtensionSharedFiles.Add(fname, File.ReadAllText($"{e.FilePath}{css}"));
                stylesheets.Append($"<link rel=\"stylesheet\" href=\"{fname}?vary={Utilities.VaryID}\" />");
            }
            foreach (string file in e.OtherAssets)
            {
                string fname = $"/ExtensionFile/{e.ExtensionName}/{file}";
                string toRead = $"{e.FilePath}{file}";
                ExtensionAssets.Add(fname, new(() => File.ReadAllBytes(toRead)));
            }
            if (Directory.Exists($"{e.FilePath}/Tabs/Text2Image/"))
            {
                foreach (string file in Directory.EnumerateFiles($"{e.FilePath}/Tabs/Text2Image/", "*.html"))
                {
                    string simpleName = file.AfterLast('/').BeforeLast('.');
                    string id = T2IParamTypes.CleanTypeName(simpleName);
                    string content = File.ReadAllText(file);
                    tabHeader.Append($"<li class=\"nav-item\" role=\"presentation\"><a class=\"nav-link translate\" id=\"maintab_{id}\" data-bs-toggle=\"tab\" href=\"#{id}\" aria-selected=\"false\" tabindex=\"-1\" role=\"tab\">{simpleName}</a></li>\n");
                    tabFooter.Append($"<div class=\"tab-pane tab-pane-vw\" id=\"{id}\" role=\"tabpanel\">\n{content}\n</div>\n");
                }
            }
        });
        PageHeaderExtra = new(stylesheets.ToString());
        PageFooterExtra = new(scripts.ToString());
        T2ITabHeader = new(tabHeader.ToString());
        T2ITabBody = new(tabFooter.ToString());
    }

    /// <summary>Called by <see cref="Program"/>, generally should not be touched externally.</summary>
    public void Launch(bool canRetry = true)
    {
        Logs.Init($"Starting webserver on {HostURL}");
        try
        {
            WebApp.Start();
        }
        catch (Exception ex)
        {
            Logs.Error($"Error starting webserver: {ex.ReadableString()}");
            if (canRetry && ex is InvalidOperationException && ex.Message.StartsWith("A path base can only be configured"))
            {
                Logs.Error("\n\n");
                Logs.Error("Your 'Host' value in settings is wrong. Will retry with 'localhost'.");
                Logs.Error("If this launches as intended, you need to update your 'Host' setting to be a proper value.");
                Logs.Error("\n\n");
                SetHost("localhost", Port);
                Prep();
                Launch(false);
            }
            else
            {
                throw;
            }
        }
    }

    /// <summary>Test the validity of a user-given file path. Returns (path, consoleError, userError).</summary>
    public (string, string, string) CheckOutputFilePath(string path, string userId, bool isExact)
    {
        string root = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, Program.ServerSettings.Paths.OutputPath);
        if (Program.ServerSettings.Paths.AppendUserNameToOutputPath && !isExact)
        {
            root = $"{root}/{userId}";
        }
        return CheckFilePath(root, path);
    }

    /// <summary>Test the validity of a user-given file path. Returns (path, consoleError, userError).</summary>
    public static (string, string, string) CheckFilePath(string root, string path)
    {
        path = path.Replace('\\', '/').Replace("%20", " ");
        path = Utilities.FilePathForbidden.TrimToNonMatches(path);
        while (path.Contains(".."))
        {
            path = path.Replace("..", "");
        }
        root = root.Replace('\\', '/');
        path = $"{root}/{path.Trim()}";
        if (path.Contains("//"))
        {
            path = path.Replace("//", "/");
        }
        if (!Directory.GetParent(path).FullName.Replace('\\', '/').StartsWith(root))
        {
            return (null, $"Refusing dangerous access, got path '{path}' which resolves to '{Directory.GetParent(path)}' which does not obey expected root '{root}'",
                "Unacceptable path. If you are the server owner, check program console log.");
        }
        if (path.EndsWith('/'))
        {
            path = path[..^1];
        }
        return (path, null, null);
    }

    /// <summary>Web route for scripts from extensions.</summary>
    public async Task ViewExtensionScript(HttpContext context)
    {
        if (ExtensionSharedFiles.TryGetValue(context.Request.Path.Value, out string script))
        {
            context.Response.ContentType = Utilities.GuessContentType(context.Request.Path.Value);
            context.Response.StatusCode = 200;
            await context.Response.WriteAsync(script);
        }
        else if (ExtensionAssets.TryGetValue(context.Request.Path.Value, out Lazy<byte[]> data))
        {
            context.Response.ContentType = Utilities.GuessContentType(context.Request.Path.Value);
            context.Response.StatusCode = 200;
            await context.Response.Body.WriteAsync(data.Value);
        }
        else
        {
            context.Response.StatusCode = 404;
            await context.Response.WriteAsync("404, file not found.");
        }
        await context.Response.CompleteAsync();
    }

    /// <summary>Web route for viewing output images.</summary>
    public async Task ViewOutput(HttpContext context)
    {
        string path = context.Request.Path.ToString();
        bool isExact = false;
        if (path.StartsWith("/View/"))
        {
            path = path.After("/View/");
            isExact = true;
        }
        else
        {
            path = path.After("/Output/");
        }
        path = Uri.UnescapeDataString(path).Replace('\\', '/');
        string userId = BasicAPIFeatures.GetUserIdFor(context);
        (path, string consoleError, string userError) = CheckOutputFilePath(path, userId, isExact);
        if (consoleError is not null)
        {
            Logs.Error(consoleError);
            await context.YieldJsonOutput(null, 400, Utilities.ErrorObj(userError, "bad_path"));
            return;
        }
        byte[] data = null;
        try
        {
            if (context.Request.Query.TryGetValue("preview", out StringValues previewToken) && $"{previewToken}" == "true" && Program.Sessions.GetUser(userId).Settings.ImageHistoryUsePreviews)
            {
                data = ImageMetadataTracker.GetOrCreatePreviewFor(path);
            }
            data ??= await File.ReadAllBytesAsync(path);
        }
        catch (Exception ex)
        {
            if (ex is FileNotFoundException || ex is DirectoryNotFoundException || ex is PathTooLongException)
            {
                Logs.Verbose($"File-not-found error reading output file '{path}': {ex.ReadableString()}");
                await context.YieldJsonOutput(null, 404, Utilities.ErrorObj("404, file not found.", "file_not_found"));
            }
            else
            {
                Logs.Error($"Failed to read output file '{path}': {ex.ReadableString()}");
                await context.YieldJsonOutput(null, 500, Utilities.ErrorObj("Error reading file. If you are the server owner, check program console log.", "file_error"));
            }
            return;
        }
        context.Response.ContentType = Utilities.GuessContentType(path);
        context.Response.StatusCode = 200;
        context.Response.ContentLength = data.Length;
        await context.Response.Body.WriteAsync(data, Program.GlobalProgramCancel);
        await context.Response.CompleteAsync();
    }
}
