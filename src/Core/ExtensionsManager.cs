using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using Microsoft.AspNetCore.Html;
using SwarmUI.Utils;
using System.IO;
using System.Reflection;
using System.Runtime.Loader;

namespace SwarmUI.Core;

public class ExtensionsManager
{
    /// <summary>All extensions currently loaded.</summary>
    public List<Extension> Extensions = [];

    /// <summary>Hashset of folder names of all extensions currently loaded.</summary>
    public HashSet<string> LoadedExtensionFolders = [];

    /// <summary>Hashset of dependency names that are considered "core" and should not be loaded from the extension's folder.</summary>
    public HashSet<string> CoreDependencyNames = [];

    /// <summary>Simple holder of information about extensions available online.</summary>
    public record class ExtensionInfo(string Name, string Author, string License, string Description, string URL, string OldURL, string[] Tags, string[] FolderNames)
    {
        public bool IsDangerTags => Tags.Contains("lowquality") || Tags.Contains("conflicts") || Tags.Contains("beta");
    }

    private class SwarmExtensionLoadContext(ExtensionsManager manager, string name, string extensionDir) : AssemblyLoadContext(name, isCollectible: false)
    {
        /// <summary>Host wins, then we probe the extension's folder for private deps.</summary>
        protected override Assembly Load(AssemblyName name)
        {
            string dependency = Path.Combine(extensionDir, name.Name + ".dll");
            try
            {
                Default.LoadFromAssemblyName(name);
                // We only get here if host successfully loads the assembly.
                if (File.Exists(dependency) && !manager.CoreDependencyNames.Contains(name.Name))
                {
                    Logs.Warning($"Extension {Name} ships {name.Name}.dll but host already has it loaded; using host copy.");
                }
                return null;
            }
            catch (FileNotFoundException) { }
            if (!File.Exists(dependency))
            {
                return null;
            }
            Logs.Debug($"Extension {Name} loading private dep {name.Name} from {dependency}");
            return LoadFromAssemblyPath(dependency);
        }
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
                "lowquality" => "<span class=\"tag lowquality-tag\" title=\"This extension has known quality issues, such as improper implementation methods or a fully vibecoded development approach, adding significant changes outside of the intended scope, or simply is a feature that does not work as well as one might hope\">Low-Quality</span>",
                "none" => "<span class=\"tag\" title=\"No tags\">None</span>",
                _ => $"<abbr class=\"tag\" title=\"Unrecognized tag\">{t}</abbr>"
            };
        }).JoinString(", "));
    }

    /// <summary>List of known online available extensions.</summary>
    public List<ExtensionInfo> KnownExtensions = [];

    private Assembly LoadInExtensionContext(string dllName, string targetPath)
    {
        return new SwarmExtensionLoadContext(this, dllName, Path.GetDirectoryName(targetPath)).LoadFromAssemblyPath(targetPath);
    }

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
        CoreDependencyNames =
        [
            .. AssemblyLoadContext.Default.Assemblies.Select(a => a.GetName().Name).Where(n => n is not null),
            .. Directory.EnumerateFiles(AppContext.BaseDirectory, "*.dll").Select(Path.GetFileNameWithoutExtension)
        ];
        await BuildPublicExtensionList();
        string[] builtins = [.. Directory.EnumerateDirectories("./src/BuiltinExtensions").Select(s => "src/" + s.Replace('\\', '/').AfterLast("/src/"))];
        string[] extras = Directory.Exists("./src/Extensions") ? [.. Directory.EnumerateDirectories("./src/Extensions/").Select(s => "src/" + s.Replace('\\', '/').AfterLast("/src/"))] : [];
        string[] deleteMe = [.. extras.Where(e => e.TrimEnd('/').EndsWith(".delete"))];
        extras = [.. extras.Where(e => !e.TrimEnd('/').EndsWith(".delete") && !e.TrimEnd('/').EndsWith(".disable"))];
        HashSet<string> disabledFolders = [.. Program.ServerSettings.DisabledExtensions];
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
                    await asm; // TODO: TEMP: Builds can sometimes break because of some form of file lock silliness, need to investigate.
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

    public async Task BuildPublicExtensionList()
    {
        try
        {
            FDSSection extensionsOutThere = FDSUtility.ReadFile("./launchtools/extension_list.fds");
            foreach (string name in extensionsOutThere.GetRootKeys())
            {
                FDSSection section = extensionsOutThere.GetSection(name);
                string url = section.GetString("url");
                string oldUrl = section.GetString("old_url", "");
                string[] folderNames = oldUrl.Length > 0 ? [url.AfterLast('/'), oldUrl.AfterLast('/')] : [url.AfterLast('/')];
                KnownExtensions.Add(new ExtensionInfo(name, section.GetString("author"), section.GetString("license"), section.GetString("description"), url, oldUrl, [.. section.GetStringList("tags")], folderNames));
                if (Program.IsCiTest && Program.IsCiTestExtensions && section.GetBool("ci-test", false).Value)
                {
                    await Utilities.RunGitProcess($"clone {url}", "./src/Extensions");
                }
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
        string hash = (await Utilities.RunGitProcess("rev-parse HEAD", Path.GetFullPath(folder))).Trim();
        hash = hash.Length >= 8 ? hash[0..8] : "unknown";
        string target = $"./src/bin/extensions/{dllName}/{dllName}-{hash}.dll";
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
            return LoadInExtensionContext(dllName, Path.GetFullPath(target));
        }
        Logs.Debug($"Building extension project: {projFile}...");
        string buildParam = $"-p:BaseIntermediateOutputPath={Path.GetFullPath($"./src/obj/extensions/{dllName}/")};TargetName={dllName}-{hash}";
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
        return LoadInExtensionContext(dllName, Path.GetFullPath(target));
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

    /// <summary>Returns folder name from an extension path.</summary>
    public static string GetFolderNameFromPath(string path)
    {
        return path?.Replace('\\', '/').TrimEnd('/').AfterLast('/') ?? "";
    }

    /// <summary>Returns whether an extension folder is in the disabled list in settings.</summary>
    public bool IsDisabled(string folderName)
    {
        return Program.ServerSettings.DisabledExtensions.Contains(folderName);
    }

    /// <summary>Remove the disable from any extension not currently installed.</summary>
    public void CleanDisabledExtensions()
    {
        foreach (string folderName in Program.ServerSettings.DisabledExtensions.ToArray())
        {
            if (!Directory.Exists($"./src/Extensions/{folderName}"))
            {
                Program.ServerSettings.DisabledExtensions.Remove(folderName);
            }
        }
    }

    /// <summary>Returns disabled extensions for UI display.</summary>
    public IEnumerable<ExtensionInfo> GetDisabledExtensionsForUi()
    {
        foreach (string folderName in Program.ServerSettings.DisabledExtensions.Order())
        {
            if (!Directory.Exists($"./src/Extensions/{folderName}"))
            {
                continue;
            }
            ExtensionInfo info = KnownExtensions.FirstOrDefault(e => e.FolderNames.Contains(folderName));
            info ??= new ExtensionInfo(folderName, "(Unknown)", "(Unknown)", "(Disabled - restart to load)", "", "", ["none"], [folderName]);
            yield return info;
        }
    }

    /// <summary>Removes an extension folder from the disabled list in settings.</summary>
    public bool RemoveDisabledExtensionSetting(string folderName)
    {
        return Program.ServerSettings.DisabledExtensions.Remove(folderName);
    }

    /// <summary>Adds an extension folder to the disabled list in settings.</summary>
    public bool AddDisabledExtensionSetting(string folderName)
    {
        CleanDisabledExtensions();
        if (!IsDisabled(folderName))
        {
            Program.ServerSettings.DisabledExtensions.Add(folderName);
            return true;
        }
        return false;
    }
}
