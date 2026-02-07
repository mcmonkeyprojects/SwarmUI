using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using Microsoft.AspNetCore.Html;
using SwarmUI.Utils;
using System.IO;
using System.Reflection;

namespace SwarmUI.Core;

public class ExtensionsManager
{
    /// <summary>All extensions currently loaded.</summary>
    public List<Extension> Extensions = [];

    /// <summary>Hashset of folder names of all extensions currently loaded.</summary>
    public HashSet<string> LoadedExtensionFolders = [];

    /// <summary>Hashset of folder names of all extensions currently installed (loaded or disabled).</summary>
    public HashSet<string> InstalledExtensionFolders = [];

    /// <summary>Dictionary of disabled extension folder name to extension name.</summary>
    public Dictionary<string, string> DisabledExtensions = [];

    /// <summary>Simple holder of information about extensions available online.</summary>
    public record class ExtensionInfo(string Name, string Author, string License, string Description, string URL, string[] Tags, string FolderName)
    {
    }

    public static HtmlString HtmlTags(string[] tags)
    {
        return new(tags.Select(t =>
        {
            return t switch
            {
                "parameters" => "<span class=\"tag\" title=\"Adds new T2I Parameters\">Parameters</span>",
                "tabs" => "<span class=\"tag\" title=\"Adds new tabs on the main page\">Tabs</span>",
                "ui" => "<span class=\"tag\" title=\"modifies the visual user interface\">UI</span>",
                "nodes" => "<span class=\"tag\" title=\"Adds Comfy nodes\">Nodes</span>",
                "tools" => "<span class=\"tag\" title=\"Adds new tools to the Tools menu\">Tools</span>",
                "backend" => "<span class=\"tag\" title=\"Adds a new backend\">Backend</span>",
                "hidden" => "<span class=\"tag hidden-tag\" title=\"Should not be visible\">Hidden</span>",
                "paid" => "<span class=\"tag paid-tag\" title=\"Requires a paid account\">Paid</span>",
                "beta" => "<span class=\"tag beta-tag\" title=\"Not ready for general use\">Beta</span>",
                "conflicts" => "<span class=\"tag beta-tag\" title=\"may conflict with core systems or with other extensions (eg overrides core features)\">Conflicts</span>",
                "none" => "<span class=\"tag\" title=\"No tags\">None</span>",
                _ => $"<abbr class=\"tag\" title=\"Unrecognized tag\">{t}</abbr>"
            };
        }).JoinString(", "));
    }

    /// <summary>List of known online available extensions.</summary>
    public List<ExtensionInfo> KnownExtensions = [];

    public static string ReferenceCsproj =
        """
        <Project Sdk="Microsoft.NET.Sdk.Web">
            <PropertyGroup>
                <AssemblyName>MyUnconfiguredExtension</AssemblyName>
            </PropertyGroup>
            <Import Project="../../SwarmUI.extension.props" />
        </Project>
        """;

    /// <summary>Initial call that prepares the extensions list.</summary>
    public async Task PrepExtensions()
    {
        string[] builtins = [.. Directory.EnumerateDirectories("./src/BuiltinExtensions").Select(s => "src/" + s.Replace('\\', '/').AfterLast("/src/"))];
        string[] extras = Directory.Exists("./src/Extensions") ? [.. Directory.EnumerateDirectories("./src/Extensions/").Select(s => "src/" + s.Replace('\\', '/').AfterLast("/src/"))] : [];
        string[] deleteMe = [.. extras.Where(e => e.TrimEnd('/').EndsWith(".delete"))];
        extras = [.. extras.Where(e => !e.TrimEnd('/').EndsWith(".delete") && !e.TrimEnd('/').EndsWith(".disable"))];
        InstalledExtensionFolders = new HashSet<string>(extras.Select(e => e.AfterLast('/')), StringComparer.OrdinalIgnoreCase);
        LoadKnownExtensions();
        HashSet<string> disabledFolders = BuildDisabledExtensionsAndGetDisabledFolders();
        extras = [.. extras.Where(e => !disabledFolders.Contains(e.AfterLast('/')))];
        foreach (string deletable in deleteMe)
        {
            try
            {
                Directory.Delete(deletable, true);
            }
            catch (Exception ex)
            {
                Logs.CriticalLoadError($"Failed to delete extension folder SwarmUI/{deletable}: {ex.ReadableString()}, you will need to remove it manually");
            }
        }
        foreach (Type extType in AppDomain.CurrentDomain.GetAssemblies().ToList().SelectMany(x => x.GetTypes()).Where(t => typeof(Extension).IsAssignableFrom(t) && !t.IsAbstract))
        {
            bool isCore = extType.Namespace.StartsWith("SwarmUI.");
            string[] possible = isCore ? builtins : extras;
            PrepExtension(extType, isCore, possible);
        }
        List<(Task<Assembly>, string)> loaded = [];
        List<string> autoGenned = [];
        foreach (string extDir in extras)
        {
            try
            {
                string projFile = Directory.EnumerateFiles(extDir, "*.csproj").OrderBy(k => k.ToLowerFast().Contains("extension") ? 0 : 1).FirstOrDefault();
                if (projFile is null)
                {
                    projFile = $"{extDir}/SwarmAutoGenExtensionProjectFile.csproj";
                    autoGenned.Add(projFile);
                    File.WriteAllText(projFile, ReferenceCsproj);
                }
                Task<Assembly> asm = BuildExtension(extDir, projFile);
                if (asm is not null)
                {
                    loaded.Add((asm, extDir));
                }
            }
            catch (Exception ex)
            {
                Logs.CriticalLoadError($"Failed to build extension in folder SwarmUI/{extDir}: {ex.ReadableString()}");
            }
        }
        foreach ((Task<Assembly> task, string folder) in loaded)
        {
            try
            {
                Assembly asm = await task;
                if (asm is null)
                {
                    continue;
                }
                foreach (Type extType in asm.GetTypes().Where(t => typeof(Extension).IsAssignableFrom(t) && !t.IsAbstract))
                {
                    PrepExtension(extType, false, [folder]);
                }
            }
            catch (Exception ex)
            {
                Logs.CriticalLoadError($"Failed to load or prep built extension in folder SwarmUI/{folder}: {ex.ReadableString()}");
            }
        }
        foreach (string autoGen in autoGenned)
        {
            try
            {
                File.Delete(autoGen);
            }
            catch (Exception) { }
        }
        RunOnAllExtensions(e => e.OnFirstInit());
        RunOnAllExtensions(e => e.PopulateMetadata());
    }

    /// <summary>Loads known extension metadata from the extension list file.</summary>
    public void LoadKnownExtensions()
    {
        KnownExtensions.Clear();
        try
        {
            FDSSection extensionsOutThere = FDSUtility.ReadFile("./launchtools/extension_list.fds");
            foreach (string name in extensionsOutThere.GetRootKeys())
            {
                FDSSection section = extensionsOutThere.GetSection(name);
                string url = section.GetString("url");
                KnownExtensions.Add(new ExtensionInfo(name, section.GetString("author"), section.GetString("license"), section.GetString("description"), url, [.. section.GetStringList("tags")], url.AfterLast('/')));
            }
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to read known extensions list: {ex.ReadableString()}");
        }
    }

    public async Task<Assembly> BuildExtension(string folder, string projFile)
    {
        string mode = Program.IsDevMode ? "Debug" : "Release";
        string dllName = $"SwarmExtension{folder.AfterLast('/')}";
        string target = $"./src/bin/extensions/{dllName}/{dllName}.dll";
        // bin/obj shouldn't exist but sometimes are accidentally created. They will break things if they form, so get rid of them.
        if (Directory.Exists($"{folder}/bin"))
        {
            Directory.Delete($"{folder}/bin", true);
        }
        if (Directory.Exists($"{folder}/obj"))
        {
            Directory.Delete($"{folder}/obj", true);
        }
        if (File.Exists(target) && !Program.IsDevMode)
        {
            Logs.Debug($"Don't need to rebuild extension {projFile}, already built.");
            return Assembly.LoadFile(Path.GetFullPath(target));
        }
        Logs.Debug($"Building extension project: {projFile}...");
        string buildParam = $"-p:BaseIntermediateOutputPath={Path.GetFullPath($"./src/obj/extensions/{dllName}/")};TargetName={dllName}";
        string output = await Utilities.QuickRunProcess("dotnet", ["build", Path.GetFullPath(projFile), "-c", mode, "-o", Path.GetFullPath($"./src/bin/extensions/{dllName}/"), buildParam], Path.GetFullPath(folder));
        if (!File.Exists(target))
        {
            Logs.CriticalLoadError($"Build of extension project {projFile} failed! Raw output:\n{output}");
            return null;
        }
        else
        {
            Logs.Debug($"Successful build output for extension project {projFile}:\n{output}");
        }
        return Assembly.LoadFile(Path.GetFullPath(target));
    }

    public void PrepExtension(Type extType, bool isCore, string[] possible)
    {
        try
        {
            Logs.Init($"Prepping extension: {extType.FullName}...");
            Extension extension = Activator.CreateInstance(extType) as Extension;
            extension.ExtensionName = extType.Name;
            Extensions.Add(extension);
            extension.IsCore = isCore;
            if (isCore)
            {
                extension.ExtensionAuthor = "SwarmUI Team";
                extension.Description = "(Core component of SwarmUI)";
                extension.Version = Utilities.Version;
                extension.ReadmeURL = Utilities.RepoRoot;
            }
            foreach (string path in possible)
            {
                if (File.Exists($"{path}/{extType.Name}.cs"))
                {
                    if (extension.FilePath is not null)
                    {
                        Logs.CriticalLoadError($"Multiple extensions with the same name {extType.Name}! Something will break.");
                    }
                    extension.FilePath = $"{path}/";
                    LoadedExtensionFolders.Add(path.AfterLast('/'));
                }
            }
            if (extension.FilePath is null)
            {
                string cause = "";
                if (extension.IsCore)
                {
                    cause = "This is labeled as an internal extension - if you're the developer, make sure you give it a unique namespace (do not use 'SwarmUI.')";
                }
                else if (!Directory.Exists("./src/Extensions"))
                {
                    cause = "Extensions directory is missing. Did you accidentally launch Swarm outside its directory?";
                }
                else if (Directory.EnumerateFiles("./src/Extensions").Any(f => f.EndsWith(".cs")))
                {
                    cause = "You have .cs files directly contained in your extensions directory. This is invalid, extensions need their own subfolders.";
                }
                else if (possible.IsEmpty())
                {
                    cause = "You have an Extensions directory, but it's empty of any subdirectories.";
                }
                else if (possible.Any(string.IsNullOrWhiteSpace))
                {
                    cause = "You have an Extensions directory, with subdirectories, but they are invalid or corrupt.";
                }
                else
                {
                    cause = "You have valid extension directories, but nothing matches the file. Is the classname mismatched from the filename?";
                }
                Logs.CriticalLoadError($"Could not determine path for extension '{extType.Name}'. Searched in {string.Join(", ", possible)} for '{extType.Name}.cs', possible cause: {cause}");
            }
        }
        catch (Exception ex)
        {
            Logs.CriticalLoadError($"Failed to create extension of type {extType.FullName}: {ex.ReadableString()}");
        }
    }

    /// <summary>Runs an action on all extensions.</summary>
    public void RunOnAllExtensions(Action<Extension> action)
    {
        foreach (Extension ext in Extensions)
        {
            try
            {
                action(ext);
            }
            catch (Exception ex)
            {
                Logs.Error($"Failed to run event on extension {ext.GetType().FullName}: {ex.ReadableString()}");
            }
        }
    }

    /// <summary>Returns the extension instance of the given type.</summary>
    public T GetExtension<T>() where T : Extension
    {
        return Extensions.FirstOrDefault(e => e is T) as T;
    }

    /// <summary>Builds <see cref="DisabledExtensions"/> and returns disabled extension folders.</summary>
    public HashSet<string> BuildDisabledExtensionsAndGetDisabledFolders()
    {
        if (Program.ServerSettings?.Extensions.DisabledExtensions is null)
        {
            Program.ServerSettings.Extensions.DisabledExtensions = [];
        }
        DisabledExtensions = [];
        HashSet<string> disabledFolders = [];
        foreach ((string folderName, string extensionName) in Program.ServerSettings.Extensions.DisabledExtensions)
        {
            if (string.IsNullOrWhiteSpace(extensionName) || string.IsNullOrWhiteSpace(folderName)
                || !InstalledExtensionFolders.Contains(folderName) || !disabledFolders.Add(folderName))
            {
                continue;
            }
            DisabledExtensions[folderName] = extensionName;
        }
        return disabledFolders;
    }

    /// <summary>Returns disabled extensions for UI display.</summary>
    public IEnumerable<ExtensionInfo> GetDisabledExtensionsForUi()
    {
        foreach ((string folderName, string name) in DisabledExtensions.OrderBy(e => e.Value, StringComparer.OrdinalIgnoreCase))
        {
            ExtensionInfo info = KnownExtensions.FirstOrDefault(e => string.Equals(e.Name, name, StringComparison.OrdinalIgnoreCase));
            info ??= new ExtensionInfo(name, "(Unknown)", "(Unknown)", "(Disabled - restart to load)", "", ["none"], folderName ?? "");
            yield return info;
        }
    }

    /// <summary>Removes an extension name from the disabled list in settings.</summary>
    public bool RemoveDisabledExtensionSetting(string extensionName)
    {
        extensionName = extensionName?.Trim();
        if (string.IsNullOrWhiteSpace(extensionName))
        {
            return false;
        }
        List<string> keysToRemove = [.. Program.ServerSettings.Extensions.DisabledExtensions
            .Where(e =>
                string.Equals(e.Key, extensionName, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(e.Value, extensionName, StringComparison.OrdinalIgnoreCase))
            .Select(e => e.Key)];
        ExtensionInfo known = KnownExtensions.FirstOrDefault(e =>
            string.Equals(e.Name, extensionName, StringComparison.OrdinalIgnoreCase) ||
            string.Equals($"{e.Name}Extension", extensionName, StringComparison.OrdinalIgnoreCase));
        if (known is not null)
        {
            keysToRemove.Add(known.FolderName);
        }
        Extension loaded = Extensions.FirstOrDefault(e => string.Equals(e.ExtensionName, extensionName, StringComparison.OrdinalIgnoreCase));
        string loadedFolder = loaded?.FilePath?.Replace('\\', '/').TrimEnd('/').AfterLast('/');
        if (!string.IsNullOrWhiteSpace(loadedFolder))
        {
            keysToRemove.Add(loadedFolder);
        }
        foreach (string key in keysToRemove.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            Program.ServerSettings.Extensions.DisabledExtensions.Remove(key);
        }
        return true;
    }

    public bool AddDisabledExtensionSetting(string extensionName)
    {
        extensionName = extensionName?.Trim();
        if (string.IsNullOrWhiteSpace(extensionName))
        {
            return false;
        }
        Extension extension = Extensions.FirstOrDefault(e => string.Equals(e.ExtensionName, extensionName, StringComparison.OrdinalIgnoreCase));
        if (extension is null)
        {
            return false;
        }
        string folder = extension.FilePath?.Replace('\\', '/').TrimEnd('/').AfterLast('/');
        if (string.IsNullOrWhiteSpace(folder))
        {
            return false;
        }
        ExtensionInfo known = KnownExtensions.FirstOrDefault(e => string.Equals(e.FolderName, folder, StringComparison.OrdinalIgnoreCase));
        string storedName = known?.Name ?? extension.ExtensionName;
        Program.ServerSettings.Extensions.DisabledExtensions[folder] = storedName;
        return true;
    }
}
