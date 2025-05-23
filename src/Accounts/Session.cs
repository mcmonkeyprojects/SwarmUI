using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using LiteDB;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.Collections.Generic;
using System.IO;

namespace SwarmUI.Accounts;

/// <summary>Container for information related to an active session.</summary>
public class Session : IEquatable<Session>
{
    /// <summary>Database entry for <see cref="Session"/> persistence data.</summary>
    public class DatabaseEntry
    {
        /// <summary>The randomly generated session ID.</summary>
        [BsonId]
        public string ID { get; set; }

        /// <summary>The relevant user's ID.</summary>
        public string UserID { get; set; }

        /// <summary>Timestamp (Unix seconds) of when this session was last actively used.</summary>
        public long LastActiveUnixTime { get; set; }

        /// <summary>Originating remote IP address of the session.</summary>
        public string OriginAddress { get; set; }

        /// <summary>If authorization is enabled, this is the token ID that created this session.</summary>
        public string OriginToken { get; set; }
    }

    /// <summary>Randomly generated ID.</summary>
    public string ID;

    /// <summary>The relevant <see cref="User"/>.</summary>
    public User User;

    /// <summary>If authorization is enabled, this is the token ID that created this session.</summary>
    public string OriginToken;

    /// <summary>The current database entry for this <see cref="Session"/>.</summary>
    public DatabaseEntry MakeDBEntry()
    {
        return new DatabaseEntry()
        {
            ID = ID,
            UserID = User.UserID,
            LastActiveUnixTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - (long)TimeSinceLastUsed.TotalSeconds,
            OriginAddress = OriginAddress,
            OriginToken = OriginToken
        };
    }

    /// <summary>Token to interrupt this session.</summary>
    public CancellationTokenSource SessInterrupt = new();

    /// <summary>All current generation claims.</summary>
    public ConcurrentDictionary<long, GenClaim> Claims = [];

    /// <summary>Statistics about the generations currently waiting in this session.</summary>
    public int WaitingGenerations = 0, LoadingModels = 0, WaitingBackends = 0, LiveGens = 0;

    /// <summary><see cref="Environment.TickCount64"/> value for the last time this session triggered a generation, updated a setting, or other 'core action'.</summary>
    public long LastUsedTime = Environment.TickCount64;

    /// <summary>Originating remote IP address of the session.</summary>
    public string OriginAddress;

    /// <summary>Updates the <see cref="LastUsedTime"/> to the current time.</summary>
    public void UpdateLastUsedTime()
    {
        Volatile.Write(ref LastUsedTime, Environment.TickCount64);
        User.UpdateLastUsedTime();
    }

    /// <summary>Time since the last action was performed in this session.</summary>
    public TimeSpan TimeSinceLastUsed => TimeSpan.FromMilliseconds(Environment.TickCount64 - Volatile.Read(ref LastUsedTime));

    /// <summary>Use "using <see cref="GenClaim"/> claim = session.Claim(image_count);" to track generation requests pending on this session.</summary>
    public GenClaim Claim(int gens = 0, int modelLoads = 0, int backendWaits = 0, int liveGens = 0)
    {
        return new(this, gens, modelLoads, backendWaits, liveGens);
    }

    /// <summary>Helper to claim an amount of generations and dispose it automatically cleanly.</summary>
    public class GenClaim : IDisposable
    {
        /// <summary>Current number used to generate <see cref="ID"/>.</summary>
        public static long ClaimID = 0;

        /// <summary>The number of generations tracked by this object.</summary>
        public int WaitingGenerations = 0, LoadingModels = 0, WaitingBackends = 0, LiveGens = 0;

        /// <summary>The relevant original session.</summary>
        public Session Sess;

        /// <summary>Cancel token that cancels if the user wants to interrupt all generations.</summary>
        public CancellationToken InterruptToken;

        /// <summary>Token source to interrupt just this claim's set.</summary>
        public CancellationTokenSource LocalClaimInterrupt = new();

        /// <summary>Unique claim ID from an incremental number.</summary>
        public long ID = Interlocked.Increment(ref ClaimID);

        /// <summary>If true, the running generations should stop immediately.</summary>
        public bool ShouldCancel => InterruptToken.IsCancellationRequested || LocalClaimInterrupt.IsCancellationRequested;

        public GenClaim(Session session, int gens, int modelLoads, int backendWaits, int liveGens)
        {
            Sess = session;
            InterruptToken = session.SessInterrupt.Token;
            Extend(gens, modelLoads, backendWaits, liveGens);
            session.Claims[ID] = this;
        }

        /// <summary>Increase the size of the claim.</summary>
        public void Extend(int gens = 0, int modelLoads = 0, int backendWaits = 0, int liveGens = 0)
        {
            Interlocked.Add(ref WaitingGenerations, gens);
            Interlocked.Add(ref LoadingModels, modelLoads);
            Interlocked.Add(ref WaitingBackends, backendWaits);
            Interlocked.Add(ref LiveGens, liveGens);
            Interlocked.Add(ref Sess.WaitingGenerations, gens);
            Interlocked.Add(ref Sess.LoadingModels, modelLoads);
            Interlocked.Add(ref Sess.WaitingBackends, backendWaits);
            Interlocked.Add(ref Sess.LiveGens, liveGens);
        }

        /// <summary>Mark a subset of these as complete.</summary>
        public void Complete(int gens = 0, int modelLoads = 0, int backendWaits = 0, int liveGens = 0)
        {
            Extend(-gens, -modelLoads, -backendWaits, -liveGens);
        }

        /// <summary>Internal dispose route, called by 'using' statements.</summary>
        public void Dispose()
        {
            Complete(WaitingGenerations, LoadingModels, WaitingBackends, LiveGens);
            Sess.Claims.TryRemove(ID, out _);
            LocalClaimInterrupt.Dispose();
            GC.SuppressFinalize(this);
        }

        ~GenClaim()
        {
            Dispose();
        }
    }

    /// <summary>Applies metadata to an image and converts the filetype, following the user's preferences.</summary>
    public (Task<Image>, string) ApplyMetadata(Image image, T2IParamInput user_input, int numImagesGenned, bool maySkipConversion = false)
    {
        if (numImagesGenned > 0 && user_input.TryGet(T2IParamTypes.BatchSize, out int batchSize) && numImagesGenned < batchSize)
        {
            user_input = user_input.Clone();
            if (user_input.TryGet(T2IParamTypes.VariationSeed, out long varSeed) && user_input.Get(T2IParamTypes.VariationSeedStrength) > 0)
            {
                user_input.Set(T2IParamTypes.VariationSeed, varSeed + numImagesGenned);
            }
            else
            {
                user_input.Set(T2IParamTypes.Seed, user_input.Get(T2IParamTypes.Seed) + numImagesGenned);
            }
        }
        string metadata = user_input.GenRawMetadata();
        Task<Image> resultImg = Task.FromResult(image);
        if (!maySkipConversion || !user_input.Get(T2IParamTypes.DoNotSave, false))
        {
            string format = user_input.Get(T2IParamTypes.ImageFormat, User.Settings.FileFormat.ImageFormat);
            resultImg = Task.Run(() =>
            {
                try
                {
                    return image.ConvertTo(format, User.Settings.FileFormat.SaveMetadata ? metadata : null, User.Settings.FileFormat.DPI, Math.Clamp(User.Settings.FileFormat.ImageQuality, 1, 100));
                }
                catch (Exception ex)
                {
                    Logs.Error($"Internal error in async task: {ex.ReadableString()}");
                    return null;
                }
            });
        }
        return (resultImg, metadata ?? "");
    }

    /// <summary>Returns a properly web-formatted base64 encoding of an image, per the user's file format preference.</summary>
    public string GetImageB64(Image image)
    {
        return image.AsDataString();
    }

    /// <summary>Special cache of recently blocked image filenames (eg file deleted, or may be saving), to prevent generating new images with exact same filenames.</summary>
    public static ConcurrentDictionary<string, string> RecentlyBlockedFilenames = [];

    /// <summary>File data that will be saved soon, or has very recently saved.</summary>
    public static ConcurrentDictionary<string, Task<byte[]>> StillSavingFiles = [];

    [Obsolete("Use ImageOutput overload instead")]
    public (string, string) SaveImage(Image image, int batchIndex, T2IParamInput user_input, string metadata)
    {
        return SaveImage(new T2IEngine.ImageOutput() { Img = image }, batchIndex, user_input, metadata);
    }

    /// <summary>Save an image as this user, and returns the new URL. If user has disabled saving, returns a data URL.</summary>
    /// <returns>(User-Visible-WebPath, Local-FilePath)</returns>
    public (string, string) SaveImage(T2IEngine.ImageOutput image, int batchIndex, T2IParamInput user_input, string metadata)
    {
        if (!User.Settings.SaveFiles)
        {
            return (GetImageB64(image.Img), null);
        }
        string rawImagePath = User.BuildImageOutputPath(user_input, batchIndex);
        string imagePath = rawImagePath.Replace("[number]", "1");
        string format = user_input.Get(T2IParamTypes.ImageFormat, User.Settings.FileFormat.ImageFormat);
        string extension;
        try
        {
            extension = Image.ImageFormatToExtension(format);
        }
        catch (Exception ex)
        {
            Logs.Debug($"Invalid file format extension: {ex.GetType().Name}: {ex.Message}");
            extension = "jpg";
        }
        if (image.Img.Type != Image.ImageType.IMAGE)
        {
            Logs.Verbose($"Image is type {image.Img.Type} and will save with extension '{image.Img.Extension}'.");
            extension = image.Img.Extension;
        }
        string fullPathNoExt = Path.GetFullPath($"{User.OutputDirectory}/{imagePath}");
        string pathFolder = imagePath.Contains('/') ? imagePath.BeforeLast('/') : "";
        string folderRoute = Path.GetFullPath($"{User.OutputDirectory}/{pathFolder}");
        string fullPath = $"{fullPathNoExt}.{extension}";
        lock (User.UserLock)
        {
            try
            {
                Directory.CreateDirectory(folderRoute);
                HashSet<string> existingFiles = [.. Directory.EnumerateFiles(folderRoute).Union(RecentlyBlockedFilenames.Keys.Where(f => f.StartsWith(folderRoute))).Select(f => f.BeforeLast('.'))];
                int num = 0;
                while (existingFiles.Contains(fullPathNoExt))
                {
                    num++;
                    imagePath = rawImagePath.Contains("[number]") ? rawImagePath.Replace("[number]", $"{num}") : $"{rawImagePath}-{num}";
                    fullPathNoExt = Path.GetFullPath($"{User.OutputDirectory}/{imagePath}");
                    fullPath = $"{fullPathNoExt}.{extension}";
                }
                RecentlyBlockedFilenames[fullPath] = fullPath;
                StillSavingFiles[fullPath] = image.ActualImageTask is null ? Task.FromResult(image.Img.ImageData) : Task.Run(async () => (await image.ActualImageTask).ImageData);
                Utilities.RunCheckedTask(async () =>
                {
                    Image actualImage = image.ActualImageTask is null ? image.Img : await image.ActualImageTask;
                    File.WriteAllBytes(fullPath, actualImage.ImageData);
                    if (User.Settings.FileFormat.SaveTextFileMetadata && !string.IsNullOrWhiteSpace(metadata))
                    {
                        File.WriteAllBytes(fullPathNoExt + ".txt", metadata.EncodeUTF8());
                    }
                    if (!ImageMetadataTracker.ExtensionsWithMetadata.Contains(extension) && !string.IsNullOrWhiteSpace(metadata))
                    {
                        File.WriteAllBytes(fullPathNoExt + ".swarm.json", metadata.EncodeUTF8());
                    }
                    if (ImageMetadataTracker.ExtensionsForFfmpegables.Contains(extension) && !string.IsNullOrWhiteSpace(Utilities.FfmegLocation.Value))
                    {
                        Utilities.QuickRunProcess(Utilities.FfmegLocation.Value, ["-i", fullPath, "-vf", "select=eq(n\\,0)", "-q:v", "3", fullPathNoExt + ".swarmpreview.jpg"]).Wait();
                        if (Program.ServerSettings.UI.AllowAnimatedPreviews)
                        {
                            Utilities.QuickRunProcess(Utilities.FfmegLocation.Value, ["-i", fullPath, "-vcodec", "libwebp", "-filter:v", "fps=fps=6,scale=-1:128", "-lossless", "0", "-compression_level", "2", "-q:v", "60", "-loop", "0", "-preset", "picture", "-an", "-vsync", "0", "-t", "5", fullPathNoExt + ".swarmpreview.webp"]).Wait();
                        }
                    }
                    await Task.Delay(TimeSpan.FromSeconds(10)); // (Give time for WebServer to read data from cache rather than having to reload from file for first read)
                    StillSavingFiles.TryRemove(fullPath, out _);
                });
            }
            catch (Exception ex)
            {
                Logs.Error($"Could not save user '{User.UserID}' image (to '{fullPath}'): error '{ex.Message}'");
                return ("ERROR", null);
            }
        }
        string prefix = Program.ServerSettings.Paths.AppendUserNameToOutputPath ? $"View/{User.UserID}/" : "Output/";
        return ($"{prefix}{imagePath}.{extension}", fullPath);
    }

    /// <summary>Gets a hash code for this session, for C# equality comparsion.</summary>
    public override int GetHashCode()
    {
        return ID.GetHashCode();
    }

    /// <summary>Returns true if this session is the same as another.</summary>
    public override bool Equals(object obj)
    {
        return obj is Session session && Equals(session);
    }

    /// <summary>Returns true if this session is the same as another.</summary>
    public bool Equals(Session other)
    {
        return ID == other.ID;
    }

    /// <summary>Immediately interrupt any current processing on this session.</summary>
    public void Interrupt()
    {
        SessInterrupt.Cancel();
        SessInterrupt = new();
    }
}
