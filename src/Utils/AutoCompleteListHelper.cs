using FreneticUtilities.FreneticExtensions;
using SwarmUI.Core;
using System.IO;

namespace SwarmUI.Utils;

/// <summary>Helper for custom word autocomplete lists.</summary>
public class AutoCompleteListHelper
{
    /// <summary>Set of all filenames of auto complete files.</summary>
    public static HashSet<string> FileNames = [];

    /// <summary>Map between filenames and actual wordlists.</summary>
    public static ConcurrentDictionary<string, string[]> AutoCompletionLists = new();

    /// <summary>Gets the correct folder path to use.</summary>
    public static string FolderPath => $"{Program.DataDir}/Autocompletions";

    /// <summary>Initializes the helper.</summary>
    public static void Init()
    {
        Reload();
        Program.ModelRefreshEvent += Reload;
    }

    /// <summary>Reloads the list of files.</summary>
    public static void Reload()
    {
        try
        {
            HashSet<string> files = [];
            Directory.CreateDirectory(FolderPath);
            foreach (string file in Directory.GetFiles(FolderPath, "*", SearchOption.AllDirectories))
            {
                if (file.EndsWith(".txt") || file.EndsWith(".csv"))
                {
                    string path = Path.GetRelativePath(FolderPath, file).Replace("\\", "/").TrimStart('/');
                    files.Add(path);
                }
            }
            FileNames = files;
            AutoCompletionLists.Clear();
        }
        catch (Exception ex)
        {
            Logs.Error($"Error while refreshing autocomplete lists: {ex.ReadableString()}");
        }
    }

    /// <summary>Gets a specific data list.</summary>
    public static string[] GetData(string name, bool escapeParens, string suffix, string spaceMode)
    {
        if (!FileNames.Contains(name))
        {
            return null;
        }
        string[] result = AutoCompletionLists.GetOrCreate(name, () =>
        {
            return [.. File.ReadAllText($"{FolderPath}/{name}").Replace('\r', '\n').SplitFast('\n').Select(s => s.Trim()).Where(s => !string.IsNullOrWhiteSpace(s) && !s.StartsWithFast('#'))];
        });
        bool doSpace = spaceMode == "Spaces";
        bool doUnderscore = spaceMode == "Underscores";
        result = [.. result];
        for (int i = 0; i < result.Length; i++)
        {
            string[] parts = result[i].SplitFast(',');
            if (parts.Length == 2 && long.TryParse(parts[1], out _))
            {
                parts = [parts[0], "0", parts[1], ""];
            }
            string word = parts[0];
            if (doSpace)
            {
                word = word.Replace("_", " ");
            }
            else if (doUnderscore)
            {
                word = word.Replace(" ", "_");
            }
            word += suffix;
            if (escapeParens)
            {
                word = word.Replace("(", "\\(").Replace(")", "\\)");
            }
            result[i] = $"{word}\n{parts.JoinString("\n")}";
        }
        return result;
    }
}
