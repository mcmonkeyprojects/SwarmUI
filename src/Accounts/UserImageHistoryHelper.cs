using System.IO;
using SwarmUI.Core;
using SwarmUI.Utils;

namespace SwarmUI.Accounts;

/// <summary>Helper for handling user's image history.</summary>
public class UserImageHistoryHelper
{
    /// <summary>Mapping of exposed folder names that every user can see, to actual file location of the shared data folder source.
    /// <para>Every key should end with a '/'. It is recommended to prefix with a '_' to indicate that it is special. For example, '_myspecial/'.</para>
    /// <para>Real paths should be constructed via <see cref="Path.GetFullPath(string)"/>.</para>
    /// <para>Special folders cannot contain other special folders.</para></summary>
    public static ConcurrentDictionary<string, string> SharedSpecialFolders = [];

    /// <summary>Adapts a user image history path to the actual file path. Often just returns <paramref name="path"/>, but may adapt for special folders.</summary>
    /// <param name="user">The relevant user.</param>
    /// <param name="path">The relevant image path that may need redirection.</param>
    /// <param name="root">The user's image root. Leave null to implicitly use the user's output directory.</param>
    public static string GetRealPathFor(User user, string path, string root = null)
    {
        if (path is null)
        {
            return null;
        }
        root ??= user.OutputDirectory;
        string folder = Path.GetRelativePath(root, path).Replace('\\', '/');
        if (!folder.EndsWith('/'))
        {
            folder += '/';
        }
        if (folder == "./")
        {
            return path;
        }
        foreach ((string exposedFolder, string realPath) in SharedSpecialFolders)
        {
            if (folder.StartsWith(exposedFolder))
            {
                string cleaned = folder[exposedFolder.Length..];
                path = Path.GetFullPath(Path.Combine(realPath, cleaned));
            }
        }
        path = path.Replace('\\', '/');
        while (path.Contains("//"))
        {
            path = path.Replace("//", "/");
        }
        if (path.EndsWith('/'))
        {
            path = path[..^1];
        }
        return path;
    }
}
