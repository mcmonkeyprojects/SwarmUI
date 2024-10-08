using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using Microsoft.AspNetCore.Html;
using SwarmUI.Utils;
using System.IO;

namespace SwarmUI.Core;

public class ExtensionsManager
{
    /// <summary>All extensions currently loaded.</summary>
    public List<Extension> Extensions = [];

    /// <summary>Hashset of folder names of all extensions currently loaded.</summary>
    public HashSet<string> LoadedExtensionFolders = [];

    /// <summary>Simple holder of information about extensions available online.</summary>
    public record class ExtensionInfo(string Name, string Author, string Description, string URL, string[] Tags, string FolderName)
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
                "nodes" => "<span class=\"tag\" title=\"Adds Comfy nodes\">Nodes</span>",
                "backend" => "<span class=\"tag\" title=\"Adds a new backend\">Backend</span>",
                "hidden" => "<span class=\"tag hidden-tag\" title=\"Should not be visible\">Hidden</span>",
                "paid" => "<span class=\"tag paid-tag\" title=\"Requires a paid account\">Paid</span>",
                "beta" => "<span class=\"tag beta-tag\" title=\"Not ready for general use\">Beta</span>",
                "none" => "<span class=\"tag\" title=\"No tags\">None</span>",
                _ => $"<abbr class=\"tag\" title=\"Unrecognized tag\">{t}</abbr>"
            };
        }).JoinString(", "));
    }

    /// <summary>List of known online available extensions.</summary>
    public List<ExtensionInfo> KnownExtensions = [];

    /// <summary>Initial call that prepares the extensions list.</summary>
    public void PrepExtensions()
    {
        string[] builtins = Directory.EnumerateDirectories("./src/BuiltinExtensions").Select(s => s.Replace('\\', '/').AfterLast("/src/")).ToArray();
        string[] extras = Directory.Exists("./src/Extensions") ? Directory.EnumerateDirectories("./src/Extensions/").Select(s => s.Replace('\\', '/').AfterLast("/src/")).ToArray() : [];
        foreach (Type extType in AppDomain.CurrentDomain.GetAssemblies().ToList().SelectMany(x => x.GetTypes()).Where(t => typeof(Extension).IsAssignableFrom(t) && !t.IsAbstract))
        {
            try
            {
                Logs.Init($"Prepping extension: {extType.FullName}...");
                Extension extension = Activator.CreateInstance(extType) as Extension;
                extension.ExtensionName = extType.Name;
                Extensions.Add(extension);
                extension.IsCore = extType.Namespace.StartsWith("SwarmUI.");
                if (extension.IsCore)
                {
                    extension.ExtensionAuthor = "SwarmUI Team";
                    extension.Description = "(Core component of SwarmUI)";
                    extension.Version = Utilities.Version;
                    extension.ReadmeURL = Utilities.RepoRoot;
                }
                string[] possible = extension.IsCore ? builtins : extras;
                foreach (string path in possible)
                {
                    if (File.Exists($"src/{path}/{extType.Name}.cs"))
                    {
                        if (extension.FilePath is not null)
                        {
                            Logs.Error($"Multiple extensions with the same name {extType.Name}! Something will break.");
                        }
                        extension.FilePath = $"src/{path}/";
                        LoadedExtensionFolders.Add(path.AfterLast('/'));
                    }
                }
                if (extension.FilePath is null)
                {
                    Logs.Error($"Could not determine path for extension '{extType.Name}'. Searched in {string.Join(", ", possible)} for '{extType.Name}.cs'");
                    if (extension.IsCore)
                    {
                        Logs.Error("This is labeled as an internal extension - if you're the developer, make sure you give it a unique namespace (do not use 'SwarmUI.')");
                    }
                    else if (!Directory.Exists("./src/Extensions"))
                    {
                        Logs.Error($"Extensions directory is missing. Did you accidentally launch Swarm outside its directory?");
                    }
                    else if (Directory.EnumerateFiles("./src/Extensions").Any(f => f.EndsWith(".cs")))
                    {
                        Logs.Error($"You have .cs files directly contained in your extensions directory. This is invalid, extensions need their own subfolders.");
                    }
                    else if (extras.IsEmpty())
                    {
                        Logs.Error("You have an Extensions directory, but it's empty of any subdirectories.");
                    }
                    else if (extras.Any(string.IsNullOrWhiteSpace))
                    {
                        Logs.Error("You have an Extensions directory, with subdirectories, but they are invalid or corrupt.");
                    }
                    else
                    {
                        Logs.Error("You have valid extension directories, but nothing matches the file. Is the classname mismatched from the filename?");
                    }
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Failed to create extension of type {extType.FullName}: {ex.ReadableString()}");
            }
        }
        RunOnAllExtensions(e => e.OnFirstInit());
        FDSSection extensionsOutThere = FDSUtility.ReadFile("./launchtools/extension_list.fds");
        foreach (string name in extensionsOutThere.GetRootKeys())
        {
            FDSSection section = extensionsOutThere.GetSection(name);
            string url = section.GetString("url");
            KnownExtensions.Add(new ExtensionInfo(name, section.GetString("author"), section.GetString("description"), url, [.. section.GetStringList("tags")], url.AfterLast('/')));
        }
        RunOnAllExtensions(e => e.PopulateMetadata());
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
}
