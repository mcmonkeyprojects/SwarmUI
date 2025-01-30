using SwarmUI.Core;
using System.IO;

namespace SwarmUI.Utils;

/// <summary>Helper for playable sound effects (eg sound after gen complete).</summary>
public class UserSoundHelper
{
    /// <summary>Set of all filenames of audio files.</summary>
    public static HashSet<string> Filenames = [];

    /// <summary>Gets the correct folder path to use.</summary>
    public static string FolderPath;

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
            FolderPath = $"{Program.DataDir}/Audio";
            HashSet<string> files = [];
            Directory.CreateDirectory(FolderPath);
            string[] supportedExtensions = [".wav", ".wave", ".mp3", ".aac", ".ogg", ".flac"];
            foreach (string file in Directory.GetFiles(FolderPath, "*", SearchOption.AllDirectories))
            {
                if (supportedExtensions.Any(file.EndsWith))
                {
                    string path = Path.GetRelativePath(FolderPath, file).Replace('\\', '/').TrimStart('/');
                    files.Add(path);
                }
            }
            Filenames = files;
        }
        catch (Exception ex)
        {
            Logs.Error($"Error while refreshing audio lists: {ex.ReadableString()}");
        }
    }
}
