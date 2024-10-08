using FreneticUtilities.FreneticExtensions;
using SwarmUI.Utils;
using System.IO;

namespace SwarmUI.Core;

/// <summary>Abstract representation of an extension. Extensions should have a 'main' class that derives from this one.</summary>
public abstract class Extension
{
    /// <summary>Automatically calculated path to this extension's directory (relative to process root path), eg "src/Extensions/MyExtension/".</summary>
    public string FilePath;

    /// <summary>Automatically set, extension internal name. Editing this is a bad idea.</summary>
    public string ExtensionName;

    /// <summary>Version ID for this extension.</summary>
    public string Version = "(Unset)"; // TODO: Auto-set this validly somehow

    /// <summary>Author of this extension.</summary>
    public string ExtensionAuthor = "(Unknown)";

    /// <summary>Human-readable short description of this extension.</summary>
    public string Description = "(No description provided)";

    /// <summary>URL to the readme or GitHub repo for this extension.</summary>
    public string ReadmeURL = "";

    /// <summary>If true, this is a core extension.</summary>
    public bool IsCore = false;

    /// <summary>If true, this extension is capable of automatic updates.</summary>
    public bool CanUpdate = false;

    /// <summary>Tags for this extension.</summary>
    public string[] Tags = [];

    /// <summary>Optional, filenames (relative to extension directory) of additional script files to use, eg "Assets/my_ext.js". You should populate this during <see cref="OnInit"/> or earlier.</summary>
    public List<string> ScriptFiles = [];

    /// <summary>Optional, filenames (relative to extension directory) of additional CSS files to use, eg "Assets/my_ext.css". You should populate this during <see cref="OnInit"/> or earlier.</summary>
    public List<string> StyleSheetFiles = [];

    /// <summary>Optional, filenames (relative to extension directory) of additional asset files to use, eg "Assets/my_image.png". You should populate this during <see cref="OnInit"/> or earlier.
    /// You can link these as in HTML/JS/CSS as "/ExtensionFile/(YourExtName)/(file)", eg "/ExtensionFile/MyExtension/Assets/my_image.png"</summary>
    public List<string> OtherAssets = [];

    /// <summary>Called when the extension is initialized for the first time, before settings or anything else is loaded, very early in the extension cycle.</summary>
    public virtual void OnFirstInit()
    {
    }

    /// <summary>Called after settings are loaded, but before the program starts loading.</summary>
    public virtual void OnPreInit()
    {
    }

    /// <summary>Called after settings are loaded and program features are prepped, but before they fully init. This is the ideal place for registering backends, features, etc.</summary>
    public virtual void OnInit()
    {
    }

    /// <summary>Called after the rest of the program has loaded, but just before it has actually launched.</summary>
    public virtual void OnPreLaunch()
    {
    }

    /// <summary>Called when the extension is shutting down (and/or the whole program is). Note that this is not strictly guaranteed to be called (eg if the process crashes).</summary>
    public virtual void OnShutdown()
    {
    }

    /// <summary>Called very early in Swarm launch cycle (but after PreInit) to populate this extension's metadata. If not overriden, Git is used to source as much data as possible.</summary>
    public virtual void PopulateMetadata()
    {
        if (IsCore)
        {
            Logs.Verbose($"Don't populate metadata for core extension '{ExtensionName}'");
            return;
        }
        if (!Directory.Exists($"{FilePath}/.git"))
        {
            Logs.Warning($"Extension '{ExtensionName}' did not come from git. Cannot populate metadata.");
            return;
        }
        CanUpdate = true;
        Utilities.RunCheckedTask(async () =>
        {
            Logs.Verbose($"Will fetch metadata for extension '{ExtensionName}'");
            string url = await Utilities.RunGitProcess("config --get remote.origin.url", FilePath);
            url = url.Trim();
            if (url.EndsWith(".git"))
            {
                url = url.BeforeLast('.');
            }
            Logs.Verbose($"Extension '{ExtensionName}' reports remote git URL '{url}'");
            if (!url.StartsWith("https://") || url.CountCharacter('\n') > 0)
            {
                Description = "This extension has an invalid git";
                return;
            }
            ReadmeURL = url.Trim();
            ExtensionsManager.ExtensionInfo relevantInfo = Program.Extensions.KnownExtensions.FirstOrDefault(e => e.URL == ReadmeURL);
            if (relevantInfo is not null)
            {
                ExtensionAuthor = relevantInfo.Author;
                Description = relevantInfo.Description;
                Tags = relevantInfo.Tags;
            }
            string tagsRaw = await Utilities.RunGitProcess("show-ref --tags", FilePath);
            List<(string, string)> tags = [.. tagsRaw.Split('\n').Select(s => s.Trim().Split(' ')).Where(p => p.Length == 2).Select(pair => (pair[0], pair[1].After("refs/tags/")))];
            string commitDate = await Utilities.RunGitProcess("show --no-patch --format=%ci HEAD", FilePath);
            DateTimeOffset date = DateTimeOffset.Parse(commitDate.Trim()).ToUniversalTime();
            string currentCommitDate = $"{date:yyyy-MM-dd HH:mm:ss}";
            string currentCommit = await Utilities.RunGitProcess("rev-parse HEAD", FilePath);
            string matchedTag = tags.FirstOrDefault(t => t.Item1 == currentCommit).Item2;
            Version = $"{matchedTag ?? currentCommit[..7]} ({currentCommitDate})";
        });
    }
}
