using System.IO;
using System.Globalization;
using ATL;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using SixLabors.Fonts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.Processing;
using SwarmUI.Core;
using SwarmUI.Media;
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

    /// <summary>Use ffmpeg to generate a preview for a video or audio file.</summary>
    /// <param name="file">The media file.</param>
    public static async Task DoFfmpegPreviewGeneration(string file)
    {
        string fullPathNoExt = file.BeforeLast('.');
        bool isAudio = MediaType.GetByExtension(file.AfterLast('.'))?.MetaType == MediaMetaType.Audio;
        if (string.IsNullOrWhiteSpace(Utilities.FfmegLocation.Value))
        {
            Logs.Warning("ffmpeg cannot be found, some features will not work including video and audio previews. Please ensure ffmpeg is locatable to use media files.");
        }
        else
        {
            await FfmpegLock.WaitAsync();
            try
            {
                string output;
                if (isAudio)
                {
                    string previewPath = fullPathNoExt + ".swarmpreview.jpg";
                    string tempPreviewPath = Path.Combine(Program.TempDir, $"swarm-audio-preview-{Guid.NewGuid():N}.jpg");
                    try
                    {
                        output = await Utilities.QuickRunProcess(Utilities.FfmegLocation.Value, ["-y", "-i", file, "-filter_complex", "[0:a]showwavespic=s=256x256:colors=#7855e1:filter=peak,format=rgba[wave];color=c=#27272a:s=256x256[bg];[bg][wave]overlay=format=auto,drawbox=y=127:w=iw:h=2:color=#7855e1:t=fill", "-frames:v", "1", "-update", "1", "-q:v", "3", tempPreviewPath]);
                        double durationMs = new Track(file).DurationMs;
                        long totalSeconds = double.IsFinite(durationMs) ? Math.Max(0, (long)(durationMs / 1000)) : 0;
                        string duration = totalSeconds >= 3600 ? $"{totalSeconds / 3600:00}:{totalSeconds / 60 % 60:00}:{totalSeconds % 60:00}" : $"{totalSeconds / 60:00}:{totalSeconds % 60:00}";
                        FontCollection fonts = new();
                        Font font = fonts.Add("src/wwwroot/fonts/Inter.woff2").CreateFont(32, FontStyle.Bold);
                        using SixLabors.ImageSharp.Image preview = SixLabors.ImageSharp.Image.Load(tempPreviewPath);
                        RichTextOptions textOptions = new(font) { Origin = new(128, 128), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
                        Brush outlineBrush = Brushes.Solid(Color.FromRgb(39, 39, 42));
                        Brush textBrush = Brushes.Solid(Color.FromRgb(228, 228, 228));
                        preview.Mutate(m =>
                        {
                            for (int x = -2; x <= 2; x += 2)
                            {
                                for (int y = -2; y <= 2; y += 2)
                                {
                                    if (x != 0 || y != 0)
                                    {
                                        textOptions.Origin = new(128 + x, 128 + y);
                                        m.DrawText(textOptions, $"Audio {duration}", outlineBrush);
                                    }
                                }
                            }
                            textOptions.Origin = new(128, 128);
                            m.DrawText(textOptions, $"Audio {duration}", textBrush);
                        });
                        preview.SaveAsJpeg(previewPath);
                    }
                    finally
                    {
                        if (File.Exists(tempPreviewPath))
                        {
                            File.Delete(tempPreviewPath);
                        }
                    }
                }
                else
                {
                    output = await Utilities.QuickRunProcess(Utilities.FfmegLocation.Value, ["-i", file, "-vf", "select=eq(n\\,0)", "-frames:v", "1", "-update", "1", "-q:v", "3", fullPathNoExt + ".swarmpreview.jpg"]);
                }
                Logs.Verbose($"ffmpeg output: {output}");
            }
            finally
            {
                FfmpegLock.Release();
            }
            if (!isAudio && Program.ServerSettings.UI.AllowAnimatedPreviews)
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

    /// <summary>Returns whether ffmpeg can find a readable audio stream in a media file.</summary>
    private static async Task<bool> MediaHasAudioStream(string file)
    {
        if (string.IsNullOrWhiteSpace(Utilities.FfmegLocation.Value))
        {
            return false;
        }
        int exitCode = -1;
        await FfmpegLock.WaitAsync();
        try
        {
            await Utilities.QuickRunProcess(Utilities.FfmegLocation.Value, ["-v", "error", "-i", file, "-map", "0:a:0", "-frames:a", "1", "-f", "null", "-"], setExitCode: code => exitCode = code);
        }
        finally
        {
            FfmpegLock.Release();
        }
        return exitCode == 0;
    }

    /// <summary>Use ffmpeg to edit audio or video media.</summary>
    /// <param name="file">The media file.</param>
    /// <param name="audioOutput">Whether to produce MP3 audio instead of MP4 video.</param>
    /// <param name="start">Trim start in seconds.</param>
    /// <param name="end">Trim end in seconds, or negative for the full remaining duration.</param>
    /// <param name="cropX">Crop left coordinate in pixels.</param>
    /// <param name="cropY">Crop top coordinate in pixels.</param>
    /// <param name="cropWidth">Crop width in pixels, or zero for the full frame.</param>
    /// <param name="cropHeight">Crop height in pixels, or zero for the full frame.</param>
    /// <param name="scale">Output scale factor. 1 leaves the cropped size unchanged.</param>
    /// <param name="timelineSections">Ordered timeline sections, or null to use only the start and end trim.</param>
    public static async Task<byte[]> EditMedia(string file, bool audioOutput, double start, double end, int cropX, int cropY, int cropWidth, int cropHeight, double scale = 1, List<MediaEditorSection> timelineSections = null)
    {
        List<MediaEditorSection> includedSections = timelineSections?.Where(section => !section.Excluded).ToList();
        bool useTimelineSections = includedSections is not null && (includedSections.Count > 1 || includedSections.Any(section => section.Volume != 1));
        if (includedSections?.Count == 1)
        {
            start = includedSections[0].Start;
            end = includedSections[0].End;
        }
        List<string> arguments = ["-y", "-i", file];
        if (!useTimelineSections && start > 0)
        {
            arguments.AddRange(["-ss", $"{start:0.###}"]);
        }
        if (!useTimelineSections && end >= 0)
        {
            arguments.AddRange(["-t", $"{end - start:0.###}"]);
        }
        if (audioOutput)
        {
            if (useTimelineSections)
            {
                List<string> filters = [];
                for (int i = 0; i < includedSections.Count; i++)
                {
                    MediaEditorSection section = includedSections[i];
                    string volume = section.Volume.ToString("0.##", CultureInfo.InvariantCulture);
                    filters.Add($"[0:a]atrim=start={section.Start.ToString("0.###", CultureInfo.InvariantCulture)}:end={section.End.ToString("0.###", CultureInfo.InvariantCulture)},volume={volume},asetpts=PTS-STARTPTS[a{i}]");
                }
                filters.Add($"{string.Concat(Enumerable.Range(0, includedSections.Count).Select(i => $"[a{i}]"))}concat=n={includedSections.Count}:v=0:a=1[aout]");
                arguments.AddRange(["-filter_complex", string.Join(';', filters), "-map", "[aout]"]);
            }
            else
            {
                arguments.AddRange(["-map", "0:a:0"]);
            }
            arguments.AddRange(["-vn", "-codec:a", "libmp3lame", "-q:a", "2", "-f", "mp3"]);
            return await RunFfmpegToData(arguments, "mp3", "Cannot edit audio because ffmpeg is not available.", "ffmpeg could not produce the edited audio.");
        }
        List<string> videoFilters = [];
        if (cropWidth > 0)
        {
            int leftPad = Math.Max(0, -cropX);
            int topPad = Math.Max(0, -cropY);
            videoFilters.Add($"pad={leftPad}+max(iw\\,{cropX + cropWidth}):{topPad}+max(ih\\,{cropY + cropHeight}):{leftPad}:{topPad}:black");
            videoFilters.Add($"crop={cropWidth}:{cropHeight}:{cropX + leftPad}:{cropY + topPad}");
        }
        if (scale != 1)
        {
            videoFilters.Add($"scale=max(16\\,16*round(iw*{scale}/16)):max(16\\,16*round(ih*{scale}/16))");
        }
        videoFilters.Add("pad=ceil(iw/2)*2:ceil(ih/2)*2");
        if (useTimelineSections)
        {
            bool hasAudio = await MediaHasAudioStream(file);
            List<string> filters = [];
            for (int i = 0; i < includedSections.Count; i++)
            {
                MediaEditorSection section = includedSections[i];
                string sectionStart = section.Start.ToString("0.###", CultureInfo.InvariantCulture);
                string sectionEnd = section.End.ToString("0.###", CultureInfo.InvariantCulture);
                filters.Add($"[0:v]trim=start={sectionStart}:end={sectionEnd},setpts=PTS-STARTPTS[v{i}]");
                if (hasAudio)
                {
                    string volume = section.Volume.ToString("0.##", CultureInfo.InvariantCulture);
                    filters.Add($"[0:a]atrim=start={sectionStart}:end={sectionEnd},volume={volume},asetpts=PTS-STARTPTS[a{i}]");
                }
            }
            string videoInputs = string.Concat(Enumerable.Range(0, includedSections.Count).Select(i => $"[v{i}]"));
            if (hasAudio)
            {
                string concatInputs = string.Concat(Enumerable.Range(0, includedSections.Count).Select(i => $"[v{i}][a{i}]"));
                filters.Add($"{concatInputs}concat=n={includedSections.Count}:v=1:a=1[vconcat][aout]");
            }
            else
            {
                filters.Add($"{videoInputs}concat=n={includedSections.Count}:v=1:a=0[vconcat]");
            }
            filters.Add($"[vconcat]{string.Join(',', videoFilters)}[vout]");
            arguments.AddRange(["-filter_complex", string.Join(';', filters), "-map", "[vout]"]);
            if (hasAudio)
            {
                arguments.AddRange(["-map", "[aout]"]);
            }
        }
        else
        {
            arguments.AddRange(["-map", "0:v:0", "-map", "0:a?", "-vf", string.Join(',', videoFilters)]);
        }
        arguments.AddRange(["-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"]);
        return await RunFfmpegToData(arguments, "mp4", "Cannot edit video because ffmpeg is not available.", "ffmpeg could not produce the edited video.");
    }
}
