using System.IO;
using System.Globalization;
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
    public static SemaphoreSlim FfmpegLock = new(1, 1);

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
            await FfmpegLock.WaitAsync();
            try
            {
                string output = await Utilities.QuickRunProcess(Utilities.FfmegLocation.Value, ["-i", file, "-vf", "select=eq(n\\,0)", "-q:v", "3", fullPathNoExt + ".swarmpreview.jpg"]);
                Logs.Verbose($"ffmpeg output: {output}");
            }
            finally
            {
                FfmpegLock.Release();
            }
            if (Program.ServerSettings.UI.AllowAnimatedPreviews)
            {
                await Utilities.QuickRunProcess(Utilities.FfmegLocation.Value, ["-i", file, "-vcodec", "libwebp", "-filter:v", "fps=fps=6,scale=-1:128", "-lossless", "0", "-compression_level", "2", "-q:v", "60", "-loop", "0", "-preset", "picture", "-an", "-t", "5", fullPathNoExt + ".swarmpreview.webp"]);
            }
        }
    }

    /// <summary>Runs ffmpeg and returns its output file data.</summary>
    private static async Task<byte[]> RunFfmpegToData(List<string> arguments, string extension, string unavailableError, string outputError)
    {
        if (string.IsNullOrWhiteSpace(Utilities.FfmegLocation.Value))
        {
            throw new SwarmUserErrorException(unavailableError);
        }
        string outputFile = Path.Combine(Program.TempDir, $"swarm-ffmpeg-output-{Guid.NewGuid():N}.{extension}");
        try
        {
            arguments.Add(outputFile);
            int exitCode = -1;
            string report;
            await FfmpegLock.WaitAsync();
            try
            {
                report = await Utilities.QuickRunProcess(Utilities.FfmegLocation.Value, [.. arguments], setExitCode: code => exitCode = code);
            }
            finally
            {
                FfmpegLock.Release();
            }
            Logs.Verbose($"Raw ffmpeg report: {report}");
            if (exitCode != 0 || !File.Exists(outputFile) || new FileInfo(outputFile).Length == 0)
            {
                Logs.Debug($"Exit code: {exitCode}, output exists={File.Exists(outputFile)}, output length={(File.Exists(outputFile) ? new FileInfo(outputFile).Length : 0)}");
                throw new SwarmUserErrorException(outputError);
            }
            return await File.ReadAllBytesAsync(outputFile);
        }
        finally
        {
            if (File.Exists(outputFile))
            {
                File.Delete(outputFile);
            }
        }
    }

    /// <summary>Use ffmpeg to extract a video's audio track as MP3 data.</summary>
    /// <param name="file">The video file.</param>
    /// <param name="start">Trim start in seconds.</param>
    /// <param name="end">Trim end in seconds, or negative for the remaining video.</param>
    public static async Task<byte[]> ExtractVideoAudio(string file, double start = 0, double end = -1)
    {
        List<string> arguments = ["-y", "-i", file];
        if (start > 0)
        {
            arguments.AddRange(["-ss", $"{start:0.###}"]);
        }
        if (end >= 0)
        {
            arguments.AddRange(["-t", $"{end - start:0.###}"]);
        }
        arguments.AddRange(["-map", "0:a:0", "-vn", "-codec:a", "libmp3lame", "-q:a", "2", "-f", "mp3"]);
        return await RunFfmpegToData(arguments, "mp3", "Cannot split video audio because ffmpeg is not available.", "The video does not contain a readable audio track or can't be parsed.");
    }

    /// <summary>Use ffmpeg to trim and crop a video into MP4 data.</summary>
    /// <param name="file">The video file.</param>
    /// <param name="start">Trim start in seconds.</param>
    /// <param name="end">Trim end in seconds, or negative for the remaining video.</param>
    /// <param name="cropX">Crop left coordinate in pixels.</param>
    /// <param name="cropY">Crop top coordinate in pixels.</param>
    /// <param name="cropWidth">Crop width in pixels, or zero for the full frame.</param>
    /// <param name="cropHeight">Crop height in pixels, or zero for the full frame.</param>
    public static async Task<byte[]> EditVideo(string file, double start, double end, int cropX, int cropY, int cropWidth, int cropHeight)
    {
        List<string> arguments = ["-y", "-i", file];
        if (start > 0)
        {
            arguments.AddRange(["-ss", $"{start:0.###}"]);
        }
        if (end >= 0)
        {
            arguments.AddRange(["-t", $"{end - start:0.###}"]);
        }
        string videoFilter = cropWidth > 0 ? $"crop={cropWidth}:{cropHeight}:{cropX}:{cropY},pad=ceil(iw/2)*2:ceil(ih/2)*2" : "pad=ceil(iw/2)*2:ceil(ih/2)*2";
        arguments.AddRange(["-map", "0:v:0", "-map", "0:a?", "-vf", videoFilter, "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"]);
        return await RunFfmpegToData(arguments, "mp4", "Cannot edit video because ffmpeg is not available.", "ffmpeg could not produce the edited video.");
    }
}
