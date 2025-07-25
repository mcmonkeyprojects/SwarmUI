using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using SwarmUI.Accounts;
using SwarmUI.Core;
using System.IO;
using System.Runtime.InteropServices;

namespace SwarmUI.Utils;

/// <summary>Helper utilities for web content generation.</summary>
public static class WebUtil
{
    public static HtmlString Toast(string box_id, string header, string small_side, string content_id, string content, bool show)
    {
        return new HtmlString($"""
<div class="toast {(show ? "show" : "hide")}" role="alert" aria-live="assertive" aria-atomic="true" id="{box_id}">
    <div class="toast-header">
    <strong class="me-auto translate">{header}</strong>
    <small class="translate">{small_side}</small>
    <button type="button" class="btn-close ms-2 mb-1" data-bs-dismiss="toast" aria-label="Close">
        <span aria-hidden="true"></span>
    </button>
    </div>
    <div class="toast-body" id="{content_id}">
        {content}
    </div>
</div>
""");
    }

    public static HtmlString ModalHeader(string id, string title)
    {
        string translate = title.Contains('<') ? "" : " translate";
        return new($"""
            <div class="modal" tabindex="-1" role="dialog" id="{id}">
                <div class="modal-dialog" role="document">
                    <div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title{translate}">{title}</h5></div>
            """);
    }

    public static HtmlString ModalFooter() => new("</div></div></div>");

    /// <summary>Escapes a string for safe usage inside HTML blocks.</summary>
    public static string EscapeHtmlNoBr(string str)
    {
        return str.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
    }

    /// <summary>Escapes a string for safe usage inside HTML blocks, converting '\n' to '&lt;br&gt;'.</summary>
    public static string EscapeHtml(string str)
    {
        return EscapeHtmlNoBr(str).Replace("\n", "\n<br>");
    }

    /// <summary>Escapes a string for safe usage inside JavaScript strings.</summary>
    public static string JSStringEscape(string str)
    {
        return str.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("'", "\\'").Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t");
    }

    /// <summary>Returns a short string identifying whether the user's GPU is good enough.</summary>
    public static HtmlString CheckGPUIsSufficient()
    {
        NvidiaUtil.NvidiaInfo[] nv = NvidiaUtil.QueryNvidia();
        if (nv is null || nv.IsEmpty())
        {
            return new("Unknown GPU.");
        }
        NvidiaUtil.NvidiaInfo bestGpu = nv.OrderByDescending(x => x.TotalMemory.InBytes).First();
        string basic = "";
        foreach (NvidiaUtil.NvidiaInfo info in nv)
        {
            basic += $"{(info == bestGpu ? "* " : "")}GPU {info.ID}: <b>{info.GPUName}</b>, <b>{info.TotalMemory}</b> VRAM\n<br>";
        }
        if (nv.Length > 1)
        {
            basic += $"({nv.Length} total GPUs) ";
        }
        if (bestGpu.TotalMemory.GiB > 15)
        {
            return new($"{basic}able to run locally for almost anything.");
        }
        if (bestGpu.TotalMemory.GiB > 11)
        {
            return new($"{basic}sufficient to run most usages locally.");
        }
        if (bestGpu.TotalMemory.GiB > 7)
        {
            return new($"{basic}sufficient to run basic usage locally. May be limited on large generations.");
        }
        if (bestGpu.TotalMemory.GiB > 3)
        {
            return new($"{basic}limited, may need to configure settings for LowVRAM usage to work reliably.");
        }
        return new($"{basic}insufficient, may work with LowVRAM or CPU mode, but otherwise will need remote cloud process.");
    }

    /// <summary>Returns true if the user most likely has an AMD GPU.</summary>
    public static bool ProbablyHasAMDGpu()
    {
        NvidiaUtil.NvidiaInfo[] nv = NvidiaUtil.QueryNvidia();
        if (nv is not null && nv.Length > 0)
        {
            Logs.Verbose($"Probably not AMD due to Nvidia GPU");
            return false;
        }
        string mpsVar = Environment.GetEnvironmentVariable("PYTORCH_ENABLE_MPS_FALLBACK");
        if (!string.IsNullOrWhiteSpace(mpsVar)) // Mac
        {
            Logs.Verbose($"Probably not AMD due to PYTORCH_ENABLE_MPS_FALLBACK={mpsVar}, indicating a Mac");
            return false;
        }
        return true;
    }

    /// <summary>Returns a simple popover button for some custom html popover.</summary>
    public static HtmlString RawHtmlPopover(string id, string innerHtml, string classes = "")
    {
        classes = (classes + " sui-popover").Trim();
        return new HtmlString($"<div class=\"{classes}\" id=\"popover_{id}\">{innerHtml}</div>\n"
            + $"<span class=\"auto-input-qbutton info-popover-button\" onclick=\"doPopover('{id}', arguments[0])\">?</span>");
    }

    /// <summary>Returns a simple popover button for some basic text.</summary>
    public static HtmlString TextPopoverButton(string id, string text)
    {
        return RawHtmlPopover(EscapeHtmlNoBr(id), EscapeHtml(text), "translate");
    }

    /// <summary>Gets an error message for the installer to display on Linux machines regarding python install, if any.</summary>
    public static async Task<string> NeedLinuxPythonWarn()
    {
        if (Program.ServerSettings.IsInstalled)
        {
            return null;
        }
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return null;
        }
        static async Task<string> tryPyVer(string name)
        {
            try
            {
                string result = await Utilities.QuickRunProcess(name, ["--version"]);
                string venvInfo = await Utilities.QuickRunProcess(name, ["-m", "venv"]);
                return $"{result.Before('\n').Trim()}\n{venvInfo.Trim()}";
            }
            catch (Exception ex)
            {
                Logs.Debug($"Failed to check python version {name}: {ex}");
                return null;
            }
        }
        string pythonVersionRaw = (await tryPyVer("python3.11")) ?? (await tryPyVer("python3.10")) ?? (await tryPyVer("python3.12")) ?? (await tryPyVer("python3")) ?? (await tryPyVer("python"));
        if (string.IsNullOrWhiteSpace(pythonVersionRaw))
        {
            return "Failure to check python version. You must install Python 3.11 before installing SwarmUI.";
        }
        (string pythonVersion, string venvInfo) = pythonVersionRaw.BeforeAndAfter('\n');
        if (!pythonVersion.StartsWith("Python 3.10") && !pythonVersion.StartsWith("Python 3.11") && !pythonVersion.StartsWith("Python 3.12"))
        {
            if (pythonVersion.StartsWith("Python 3."))
            {
                Logs.Warning($"Found python version '{pythonVersion}', which is not in the acceptable range from 3.10 to 3.12.");
                return "You have a python version installed, but it is not 3.11. Please install Python 3.11 before installing SwarmUI. 3.10 and 3.12 are relatively stable as well. Older versions will not work, and newer versions will have compatibility issues.";
            }
            return "Python does not appear to be installed on your system. You must install Python 3.11 before installing SwarmUI.";
        }
        if (!venvInfo.StartsWith("usage: venv"))
        {
            return "You have Python installed, but 'venv' is missing. Please install it before proceeding (eg on Ubuntu, run 'sudo apt install python3-venv').";
        }
        return null;
    }

    /// <summary>Returns true if the user downloaded a source zip or something bad like that.</summary>
    public static bool NeedGitInstallWarn()
    {
        if (!Directory.Exists(".git"))
        {
            return true;
        }
        return false;
    }

    /// <summary>Returns true if the program is running in Windows.</summary>
    public static bool IsWindows() => RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

    public static AsciiMatcher AllowedXForwardedForChars = new(AsciiMatcher.BothCaseLetters + AsciiMatcher.Digits + " .:,;_-*@#%[]");

    public static string GetIPString(HttpContext context)
    {
        string ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        int maxForwards = Program.ServerSettings.Network.MaxXForwardedFor;
        if (maxForwards > 0 && context.Request.Headers.TryGetValue("X-Forwarded-For", out StringValues xff))
        {
            string[] parts = xff;
            for (int i = 0; i < Math.Min(parts.Length, maxForwards); i++)
            {
                ip += $" (via {AllowedXForwardedForChars.TrimToMatches(parts[i])})";
            }
        }
        if (ip.Length > 500)
        {
            ip = ip[..500] + " (...)";
        }
        return ip;
    }

    public static bool HasValidLogin(HttpContext context)
    {
        if (!Program.ServerSettings.UserAuthorization.AuthorizationRequired)
        {
            return true;
        }
        return GetValidLogin(context) is not null;
    }

    public static string[] GetSwarmTokenFor(HttpContext context)
    {
        if (!context.Request.Cookies.TryGetValue("swarm_token", out string token))
        {
            return null;
        }
        if (token.Length < 10 || token.Length > 1000)
        {
            return null;
        }
        string[] parts = token.Split('.');
        if (parts.Length != 3)
        {
            return null;
        }
        return parts;
    }

    public static User GetUserForSwarmToken(HttpContext context, string[] parts)
    {
        if (parts is null)
        {
            return null;
        }
        byte[] firstPart = Convert.FromHexString(parts[0]);
        string username = Encoding.UTF8.GetString(firstPart);
        User user = Program.Sessions.GetUser(username, false);
        if (user is null)
        {
            return null;
        }
        string tokId = parts[1];
        string validation = parts[2];
        lock (Program.Sessions.DBLock)
        {
            if (!user.Data.LoginSessions.Contains(tokId))
            {
                return null;
            }
            SessionHandler.LoginSession sess = Program.Sessions.LoginSessions.FindById(tokId);
            if (sess is null || sess.ID != tokId || sess.UserID != user.UserID)
            {
                return null;
            }
            if (!sess.CheckValidation(validation))
            {
                Logs.Warning($"Connection from {GetIPString(context)} has a token for {tokId} but failed secondary validation. Possibly attempting brute force attack?");
                return null;
            }
            sess.LastActiveUnixTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            Program.Sessions.LoginSessions.Upsert(sess);
            return user;
        }
    }

    public static User GetValidLogin(HttpContext context)
    {
        try
        {
            string ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (Program.ServerSettings.UserAuthorization.AllowLocalhostBypass && (ip == "127.0.0.1" || ip == "::1" || ip == "::ffff:127.0.0.1") && !context.Request.Headers.ContainsKey("X-Forwarded-For"))
            {
                return Program.Sessions.GetUser(SessionHandler.LocalUserID);
            }
            string[] parts = GetSwarmTokenFor(context);
            return GetUserForSwarmToken(context, parts);
        }
        catch (Exception ex)
        {
            Logs.Verbose($"Fatal error trying to parse swarm_token: {ex}");
            return null;
        }
    }
}
