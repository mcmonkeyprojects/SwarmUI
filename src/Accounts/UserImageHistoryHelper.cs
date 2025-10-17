using System.IO;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
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

    /// <summary>Ffmpeg can get weird with overlapping calls, so max one at a time.</summary>
    public static ManyReadOneWriteLock FfmpegLock = new(1);

    /// <summary>Use ffmpeg to generate a preview for a video file.</summary>
    /// <param name="file">The video file.</param>
    public static async Task DoFfmpegPreviewGeneration(string file)
    {
        string fullPathNoExt = file.BeforeLast('.');
        if (string.IsNullOrWhiteSpace(Utilities.FfmegLocation.Value))
        {
            Logs.Warning("ffmpeg cannot be found, some features will not work including video previews. Please ensure ffmpeg is locatable to use video files.");
        }
        else
        {
            using var claim = FfmpegLock.LockWrite();
            await Utilities.QuickRunProcess(Utilities.FfmegLocation.Value, ["-i", file, "-vf", "select=eq(n\\,0)", "-q:v", "3", fullPathNoExt + ".swarmpreview.jpg"]);
            if (Program.ServerSettings.UI.AllowAnimatedPreviews)
            {
                await Utilities.QuickRunProcess(Utilities.FfmegLocation.Value, ["-i", file, "-vcodec", "libwebp", "-filter:v", "fps=fps=6,scale=-1:128", "-lossless", "0", "-compression_level", "2", "-q:v", "60", "-loop", "0", "-preset", "picture", "-an", "-vsync", "0", "-t", "5", fullPathNoExt + ".swarmpreview.webp"]);
            }
        }
    }
}
