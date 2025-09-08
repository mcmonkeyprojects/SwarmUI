using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using LiteDB;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using System.IO;

namespace SwarmUI.Utils;

/// <summary>Helper class to track image file metadata.</summary>
public static class ImageMetadataTracker
{
    /// <summary>BSON database entry for image metadata.</summary>
    public class ImageMetadataEntry
    {
        [BsonId]
        public string FileName { get; set; }

        public string Metadata { get; set; }

        public long FileTime { get; set; }

        public long LastVerified { get; set; } // Reading file time can be slow, so don't do more than once per day per file.
    }

    /// <summary>BSON database entry for image preview thumbnails.</summary>
    public class ImagePreviewEntry
    {
        [BsonId]
        public string FileName { get; set; }

        public long FileTime { get; set; }

        public long LastVerified { get; set; }

        public byte[] PreviewData { get; set; }

        /// <summary>If PreviewData is animated, SimplifiedData is non-animated. SimplifiedData is often null.</summary>
        public byte[] SimplifiedData { get; set; }
    }

    public record class ImageDatabase(string Folder, LockObject Lock, LiteDatabase Database, ILiteCollection<ImageMetadataEntry> Metadata, ILiteCollection<ImagePreviewEntry> Previews)
    {
        public volatile int Errors = 0;

        public void HadNewError()
        {
            int newCount = Interlocked.Increment(ref Errors);
            if (newCount < 10)
            {
                return;
            }
            lock (Lock)
            {
                try
                {
                    Database.Dispose();
                    Errors = -1000;
                }
                catch (Exception) { }
                try
                {
                    File.Delete($"{Folder}/image_metadata.ldb");
                }
                catch (Exception) { }
                Databases.TryRemove(Folder, out _);
            }
        }

        public void Dispose()
        {
            try
            {
                Database.Dispose();
            }
            catch (Exception ex)
            {
                Logs.Error($"Error disposing image metadata database for folder '{Folder}': {ex.ReadableString()}");
            }
        }
    }

    /// <summary>Set of all image metadatabases, as a map from folder name to database.</summary>
    public static ConcurrentDictionary<string, ImageDatabase> Databases = new();

    /// <summary>Returns the database corresponding to the given folder path.</summary>
    public static ImageDatabase GetDatabaseForFolder(string folder)
    {
        if (!Program.ServerSettings.Metadata.ImageMetadataPerFolder)
        {
            folder = Program.DataDir;
        }
        else
        {
            folder = Path.GetFullPath(folder);
        }
        return Databases.GetOrCreate(folder, () =>
        {
            string path = $"{folder}/image_metadata.ldb";
            LiteDatabase ldb;
            try
            {
                ldb = new(path);
            }
            catch (Exception)
            {
                Logs.Warning($"Image metadata store at '{path}' is corrupt, deleting it and rebuilding.");
                File.Delete(path);
                ldb = new(path);
            }
            return new(folder, new(), ldb, ldb.GetCollection<ImageMetadataEntry>("image_metadata"), ldb.GetCollection<ImagePreviewEntry>("image_previews"));
        });
    }

    /// <summary>File format extensions that even can have metadata on them.</summary>
    public static HashSet<string> ExtensionsWithMetadata = ["png", "jpg"];

    /// <summary>File format extensions that require ffmpeg to process image data.</summary>
    public static HashSet<string> ExtensionsForFfmpegables = ["webm", "mp4", "mov"];

    /// <summary>File format extensions that are animations in an image file format.</summary>
    public static HashSet<string> ExtensionsForAnimatedImages = ["webp", "gif"];

    /// <summary>Deletes any tracked metadata for the given filepath.</summary>
    public static void RemoveMetadataFor(string file)
    {
        string folder = file.BeforeAndAfterLast('/', out string filename);
        ImageDatabase metadata = GetDatabaseForFolder(folder);
        if (!Program.ServerSettings.Metadata.ImageMetadataPerFolder)
        {
            filename = file;
        }
        lock (metadata.Lock)
        {
            metadata.Metadata.Delete(filename);
            metadata.Previews.Delete(filename);
        }
    }

    /// <summary>Get the preview bytes for the given image, going through a cache manager.</summary>
    public static ImagePreviewEntry GetOrCreatePreviewFor(string file)
    {
        string ext = file.AfterLast('.');
        string folder = file.BeforeAndAfterLast('/', out string filename);
        if (!Program.ServerSettings.Metadata.ImageMetadataPerFolder)
        {
            filename = file;
        }
        ImageDatabase metadata = GetDatabaseForFolder(folder);
        long timeNow = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        try
        {
            ImagePreviewEntry entry;
            lock (metadata.Lock)
            {
                entry = metadata.Previews.FindById(filename);
            }
            if (entry is not null)
            {
                if (Math.Abs(timeNow - entry.LastVerified) > 60 * 60 * 24)
                {
                    float chance = Program.ServerSettings.Performance.ImageDataValidationChance;
                    if (chance == 0 || Random.Shared.NextDouble() > chance)
                    {
                        return entry;
                    }
                    long fTime = ((DateTimeOffset)File.GetLastWriteTimeUtc(file)).ToUnixTimeSeconds();
                    if (entry.FileTime != fTime)
                    {
                        entry = null;
                    }
                    else
                    {
                        entry.LastVerified = timeNow;
                        lock (metadata.Lock)
                        {
                            metadata.Previews.Upsert(entry);
                        }
                    }
                }
                if (entry is not null)
                {
                    return entry;
                }
            }
        }
        catch (Exception ex)
        {
            Logs.Warning($"Error reading image metadata for file '{file}' from database: {ex.ReadableString()}");
            metadata.HadNewError();
        }
        if (!File.Exists(file))
        {
            return null;
        }
        long fileTime = ((DateTimeOffset)File.GetLastWriteTimeUtc(file)).ToUnixTimeSeconds();
        byte[] fileData = null;
        byte[] simplifiedData = null;
        try
        {
            string animPreview = $"{file.BeforeLast('.')}.swarmpreview.webp";
            string jpegPreview = $"{file.BeforeLast('.')}.swarmpreview.jpg";
            string altPreview = animPreview;
            bool altExists = false;
            if (ExtensionsForFfmpegables.Contains(ext) || ExtensionsForAnimatedImages.Contains(ext))
            {
                altExists = Program.ServerSettings.UI.AllowAnimatedPreviews && File.Exists(altPreview);
                if (!altExists)
                {
                    altPreview = jpegPreview;
                    altExists = File.Exists(altPreview);
                }
            }
            if ((ExtensionsForFfmpegables.Contains(ext) || !ExtensionsWithMetadata.Contains(ext)) && !altExists)
            {
                if (!ExtensionsForAnimatedImages.Contains(ext))
                {
                    return null;
                }
                byte[] data = File.ReadAllBytes(file);
                Image img = new(data, Image.ImageType.ANIMATION, ext);
                fileData = data;
                simplifiedData = new Image(data, Image.ImageType.IMAGE, ext).ToMetadataJpg().ImageData;
                File.WriteAllBytes(jpegPreview, simplifiedData);
                Image webpAnim = img.ToWebpPreviewAnim();
                if (webpAnim is null)
                {
                    fileData = simplifiedData;
                    simplifiedData = null;
                }
                else
                {
                    fileData = webpAnim.ImageData;
                    File.WriteAllBytes(animPreview, fileData);
                }
            }
            if (fileData is null)
            {
                byte[] data = File.ReadAllBytes(altExists ? altPreview : file);
                if (data.Length == 0)
                {
                    return null;
                }
                if (altExists && altPreview.EndsWith(".webp"))
                {
                    fileData = data;
                    if (File.Exists(jpegPreview))
                    {
                        simplifiedData = File.ReadAllBytes(jpegPreview);
                    }
                }
                else
                {
                    fileData = new Image(data, Image.ImageType.IMAGE, ext).ToMetadataJpg().ImageData;
                }
            }
        }
        catch (Exception ex)
        {
            Logs.Warning($"Error reading image preview for file '{file}': {ex.ReadableString()}");
            return null;
        }
        try
        {
            ImagePreviewEntry entry = new() { FileName = filename, PreviewData = fileData, SimplifiedData = simplifiedData, LastVerified = timeNow, FileTime = fileTime };
            lock (metadata.Lock)
            {
                metadata.Previews.Upsert(entry);
            }
            return entry;
        }
        catch (Exception ex)
        {
            Logs.Debug($"Error saving image preview for file '{file}' to database: {ex.ReadableString()}");
            metadata.HadNewError();
            return null;
        }
    }

    /// <summary>Get the metadata text for the given file, going through a cache manager.</summary>
    public static ImageMetadataEntry GetMetadataFor(string file, string root, bool starNoFolders)
    {
        string ext = file.AfterLast('.');
        string folder = file.BeforeAndAfterLast('/', out string filename);
        if (!Program.ServerSettings.Metadata.ImageMetadataPerFolder)
        {
            filename = file;
        }
        ImageDatabase metadata = GetDatabaseForFolder(folder);
        long timeNow = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        try
        {
            ImageMetadataEntry existingEntry;
            lock (metadata.Lock)
            {
                existingEntry = metadata.Metadata.FindById(filename);
            }
            if (existingEntry is not null)
            {
                float chance = Program.ServerSettings.Performance.ImageDataValidationChance;
                if (chance == 0 || Random.Shared.NextDouble() > chance)
                {
                    return existingEntry;
                }
                if (Math.Abs(timeNow - existingEntry.LastVerified) > 60 * 60 * 24)
                {
                    long fTime = ((DateTimeOffset)File.GetLastWriteTimeUtc(file)).ToUnixTimeSeconds();
                    if (existingEntry.FileTime != fTime)
                    {
                        existingEntry = null;
                    }
                    else
                    {
                        existingEntry.LastVerified = timeNow;
                        lock (metadata.Lock)
                        {
                            metadata.Metadata.Upsert(existingEntry);
                        }
                    }
                }
                if (existingEntry is not null)
                {
                    return existingEntry;
                }
            }
        }
        catch (Exception ex)
        {
            Logs.Warning($"Error reading image metadata for file '{file}' from database: {ex.ReadableString()}");
            metadata.HadNewError();
        }
        if (!File.Exists(file))
        {
            return null;
        }
        long fileTime = ((DateTimeOffset)File.GetLastWriteTimeUtc(file)).ToUnixTimeSeconds();
        string fileData = null;
        try
        {
            string altMetaPath = $"{file.BeforeLast('.')}.swarm.json";
            if (ExtensionsWithMetadata.Contains(ext))
            {
                byte[] data = File.ReadAllBytes(file);
                if (data.Length == 0)
                {
                    return null;
                }
                fileData = new Image(data, Image.ImageType.IMAGE, ext).GetMetadata();
            }
            if (string.IsNullOrWhiteSpace(fileData) && File.Exists(altMetaPath))
            {
                fileData = File.ReadAllText(altMetaPath);
            }
            string subPath = file.StartsWith(root) ? file[root.Length..] : Path.GetRelativePath(root, file);
            subPath = subPath.Replace('\\', '/').Trim('/');
            string rawSubPath = subPath;
            if (starNoFolders)
            {
                subPath = subPath.Replace("/", "");
            }
            string starPath = $"{root}/Starred/{subPath}";
            bool isStarred = rawSubPath.StartsWith("Starred/") || File.Exists(starPath);
            if (isStarred)
            {
                if (fileData is null)
                {
                    fileData = "{ \"is_starred\": true }";
                }
                else
                {
                    JObject jData = fileData.ParseToJson();
                    jData["is_starred"] = true;
                    fileData = jData.ToString();
                }
            }
        }
        catch (Exception ex)
        {
            Logs.Warning($"Error reading image metadata for file '{file}': {ex.ReadableString()}");
            return null;
        }
        ImageMetadataEntry entry = new() { FileName = filename, Metadata = fileData, LastVerified = timeNow, FileTime = fileTime };
        try
        {
            lock (metadata.Lock)
            {
                metadata.Metadata.Upsert(entry);
            }
        }
        catch (Exception ex)
        {
            Logs.Debug($"Error writing image metadata for file '{file}' to database: {ex.ReadableString()}");
            metadata.HadNewError();
        }
        return entry;
    }

    /// <summary>Shuts down and stores metadata helper files.</summary>
    public static void Shutdown()
    {
        ImageDatabase[] dbs = [.. Databases.Values];
        Databases.Clear();
        foreach (ImageDatabase db in dbs)
        {
            lock (db.Lock)
            {
                db.Dispose();
            }
        }
    }

    public static void MassRemoveMetadata()
    {
        KeyValuePair<string, ImageDatabase>[] dbs = [.. Databases];
        static void remove(string name)
        {
            try
            {
                if (File.Exists($"{name}/image_metadata.ldb"))
                {
                    File.Delete($"{name}/image_metadata.ldb");
                }
                if (File.Exists($"{name}/image_metadata-log.ldb"))
                {
                    File.Delete($"{name}/image_metadata-log.ldb");
                }
            }
            catch (IOException) { }
        }
        foreach ((string name, ImageDatabase db) in dbs)
        {
            lock (db.Lock)
            {
                db.Dispose();
                remove(name);
                Databases.TryRemove(name, out _);
            }
        }
        static void ClearFolder(string folder)
        {
            if (!Directory.Exists(folder))
            {
                return;
            }
            remove(folder);
            foreach (string subFolder in Directory.GetDirectories(folder))
            {
                ClearFolder(subFolder);
            }
        }
        ClearFolder(Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, Program.ServerSettings.Paths.OutputPath));
        ClearFolder(Program.DataDir);
    }
}
