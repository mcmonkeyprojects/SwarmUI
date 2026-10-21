using SwarmUI.Utils;
using ImageMagick;
using ImageMagick.Formats;
using System.Buffers.Binary;
using System.IO;
using Newtonsoft.Json.Linq;
using FreneticUtilities.FreneticExtensions;

namespace SwarmUI.Media;

/// <summary>A still image file. Also encompasses animation file types (eg gif, animated webp, etc.)</summary>
public class ImageFile : MediaFile
{
    /// <summary>Creates an image object from a web image data URL string.</summary>
    public static ImageFile FromDataString(string data)
    {
        byte[] raw = Convert.FromBase64String(data.After(";base64,"));
        string mimeType = data.Before(";base64,").After("data:");
        return new Image(raw, MediaType.TypesByMimeType.GetValueOrDefault(mimeType) ?? new(mimeType.After('/'), mimeType, mimeType.StartsWith("video/") ? MediaMetaType.Video : MediaMetaType.Image));
    }

    /// <summary>Creates an image object from a base64 string and media type.</summary>
    public static ImageFile FromBase64(string b64, MediaType type)
    {
        byte[] raw = Convert.FromBase64String(b64);
        return new Image(raw, type);
    }

    /// <summary>Helper to convert a Magick image to png bytes.</summary>
    public static byte[] MagickImageToPngBytes(IMagickImage<ushort> img)
    {
        using IMagickImage<ushort> copy = img.Clone();
        copy.Settings.SetDefine(MagickFormat.Png, "compression-level", 1);
        return copy.ToByteArray(MagickFormat.Png);
    }

    /// <summary>Helper to convert a Magick image to jpg bytes.</summary>
    public static byte[] MagickImageToJpgBytes(IMagickImage<ushort> img)
    {
        using IMagickImage<ushort> copy = img.Clone();
        copy.Quality = 75;
        return copy.ToByteArray(MagickFormat.Jpeg);
    }

    /// <summary>Encodes all frames, using lossless WebP for animations and fast PNG for still images.</summary>
    public static byte[] MagickFramesToImageBytes(IMagickImageCollection<ushort> frames)
    {
        using IMagickImageCollection<ushort> copy = frames.Clone();
        foreach (IMagickImage<ushort> frame in copy)
        {
            if (copy.Count > 1)
            {
                frame.Quality = 100;
                frame.Settings.SetDefines(new WebPWriteDefines() { Lossless = true, Exact = true, AlphaQuality = 100 });
            }
            else
            {
                frame.Settings.SetDefine(MagickFormat.Png, "compression-level", 1);
            }
        }
        return copy.ToByteArray(copy.Count > 1 ? MagickFormat.WebP : MagickFormat.Png);
    }

    /// <summary>Internal cache of <see cref="ToMagickFrames"/> to avoid reprocessing.</summary>
    public MagickImageCollection _CacheMagick;

    /// <summary>Gets the decoded frames, owned by this file. Do not dispose or modify these shared images.</summary>
    public MagickImageCollection ToMagickFrames
    {
        get
        {
            if (_CacheMagick is null)
            {
                lock (this)
                {
                    if (_CacheMagick is null)
                    {
                        MagickImageCollection images = new(RawData);
                        try
                        {
                            if (images.Count > 1)
                            {
                                images.Coalesce();
                                if (images[0].Format == MagickFormat.WebP)
                                {
                                    RestoreWebpFrameDelays(images);
                                }
                            }
                            _CacheMagick = images;
                        }
                        catch
                        {
                            images.Dispose();
                            throw;
                        }
                    }
                }
            }
            return _CacheMagick;
        }
    }

    /// <summary>Gets the first decoded frame, owned by this file. Clone it before editing.</summary>
    public IMagickImage<ushort> ToMagick => ToMagickFrames[0];

    /// <summary>Workaround/patch for webp issue: Restores millisecond WebP delays that ImageMagick 7.1.2-29 rounds to centiseconds when decoding.</summary>
    public void RestoreWebpFrameDelays(MagickImageCollection images)
    {
        int frameIndex = 0;
        for (int offset = 12; offset <= RawData.Length - 8;)
        {
            uint length = BinaryPrimitives.ReadUInt32LittleEndian(RawData.AsSpan(offset + 4, 4));
            long nextOffset = offset + 8L + length + (length & 1);
            if (nextOffset > RawData.Length)
            {
                throw new InvalidDataException("Truncated WebP chunk.");
            }
            if (RawData.AsSpan(offset, 4).SequenceEqual("ANMF"u8))
            {
                if (length < 16 || frameIndex >= images.Count)
                {
                    throw new InvalidDataException("Invalid WebP animation frame.");
                }
                IMagickImage<ushort> frame = images[frameIndex++];
                frame.AnimationTicksPerSecond = 1000;
                frame.AnimationDelay = (uint)(RawData[offset + 20] | RawData[offset + 21] << 8 | RawData[offset + 22] << 16);
            }
            offset = (int)nextOffset;
        }
        if (frameIndex != images.Count)
        {
            throw new InvalidDataException("WebP animation frame count does not match its decoded frames.");
        }
    }

    /// <summary>Returns the (width, height) of the image.</summary>
    public (int, int) GetResolution()
    {
        return ((int)ToMagick.Width, (int)ToMagick.Height);
    }

    /// <summary>Returns a metadata-format of the image.</summary>
    /// <param name="metadataText">Optional sub-metadata within.</param>
    public ImageFile ToMetadataJpg(string metadataText = null)
    {
        if (Type.MetaType != MediaMetaType.Image && Type.MetaType != MediaMetaType.Animation)
        {
            return null;
        }
        metadataText ??= GetMetadata();
        using IMagickImage<ushort> img = ToMagick.Clone();
        float factor = 256f / Math.Min(img.Width, img.Height);
        img.Resize(new MagickGeometry((uint)(img.Width * factor), (uint)(img.Height * factor)) { IgnoreAspectRatio = true });
        if (!string.IsNullOrWhiteSpace(metadataText))
        {
            img.RemoveProfile("xmp");
            ExifProfile prof = new();
            prof.SetValue(ExifTag.UserComment, MetadataHelper.EncodeExifUserComment(metadataText));
            img.SetProfile(prof);
        }
        return new Image(MagickImageToJpgBytes(img), MediaType.ImageJpg);
    }

    /// <summary>Returns a simplified webp animation for preview purposes. Returns null if the input was not animated.</summary>
    public ImageFile ToWebpPreviewAnim()
    {
        if (Type != MediaType.ImageGif && Type != MediaType.ImageWebp)
        {
            return null;
        }
        MagickImageCollection images = ToMagickFrames;
        if (images.Count <= 1)
        {
            return null;
        }
        int timeTotal = 0;
        int timeAccum = 166;
        int maxFrame = images.Count;
        uint targetWidth = images[0].Width, targetHeight = images[0].Height;
        if (targetWidth > 256 || targetHeight > 256)
        {
            float factor = 256f / Math.Min(targetWidth, targetHeight);
            targetWidth = (uint)(targetWidth * factor);
            targetHeight = (uint)(targetHeight * factor);
        }
        using MagickImageCollection newImages = [];
        for (int i = 0; i < maxFrame; i++)
        {
            IMagickImage<ushort> frame = images[i];
            int timeMs = (int)(frame.AnimationDelay * 1000L / frame.AnimationTicksPerSecond);
            timeTotal += timeMs;
            timeAccum += timeMs;
            if (timeAccum > 99)
            {
                IMagickImage<ushort> previewFrame = frame.Clone();
                newImages.Add(previewFrame);
                if (previewFrame.Width != targetWidth || previewFrame.Height != targetHeight)
                {
                    previewFrame.Resize(new MagickGeometry(targetWidth, targetHeight) { IgnoreAspectRatio = true });
                }
                previewFrame.ResetPage();
                previewFrame.AnimationTicksPerSecond = 1000;
                previewFrame.AnimationDelay = (uint)timeAccum;
                previewFrame.AnimationIterations = 0;
                previewFrame.Quality = 50;
                timeAccum = 0;
            }
            if (timeTotal > 5000)
            {
                break;
            }
        }
        newImages[0].Settings.SetDefine(MagickFormat.WebP, "lossless", false);
        return new Image(newImages.ToByteArray(MagickFormat.WebP), MediaType.ImageWebp);
    }

    /// <summary>Returns a metadata-format of the image.</summary>
    public string ToMetadataFormat()
    {
        return (ToMetadataJpg() ?? this).AsDataString();
    }

    /// <summary>Resizes the given image directly and returns a png formatted copy of it.</summary>
    public ImageFile Resize(int width, int height)
    {
        if (Type.MetaType != MediaMetaType.Image)
        {
            return this;
        }
        IMagickImage<ushort> img = ToMagick;
        if (img.Width == width && img.Height == height)
        {
            return this;
        }
        using IMagickImage<ushort> copy = img.Clone();
        copy.Resize(new MagickGeometry((uint)width, (uint)height) { IgnoreAspectRatio = true });
        copy.ResetPage();
        return new Image(MagickImageToPngBytes(copy), MediaType.ImagePng);
    }

    /// <summary>Returns a copy of this image that's definitely in '.png' format.</summary>
    public ImageFile ForceToPng()
    {
        if (Type.MetaType != MediaMetaType.Image)
        {
            return this;
        }
        return new Image(MagickImageToPngBytes(ToMagick), MediaType.ImagePng);
    }

    /// <inheritdoc/>
    public override string GetMetadata()
    {
        try
        {
            IMagickImage<ushort> img = ToMagick;
            string parameterName = img.AttributeNames.FirstOrDefault(name => name.ToLowerFast() == "parameters");
            if (parameterName is not null)
            {
                return img.GetAttribute(parameterName);
            }
            IExifProfile prof = img.GetExifProfile();
            // Preserve the original TIFF byte order before parsing, which makes subsequent serialization rewrite the profile.
            byte[] profileData = prof?.ToByteArray();
            byte[] comment = prof?.GetValue(ExifTag.UserComment)?.Value;
            return comment is null ? prof?.GetValue(ExifTag.Model)?.Value : MetadataHelper.DecodeExifUserComment(comment, profileData);
        }
        catch (ArgumentNullException ex)
        {
            Logs.Verbose("Failed image content: " + AsBase64);
            Logs.Error($"Metadata read for image failed: {ex.Message}");
        }
        return null;
    }

    /// <summary>Gets the metadata JSON from an image generated by this program.</summary>
    public JObject GetSUIMetadata()
    {
        return GetSUIMetadata(GetMetadata());
    }

    /// <summary>Helper for the Image-Format user setting.</summary>
    public static string ImageFormatToExtension(string format)
    {
        return format switch
        {
            "PNG" => "png",
            "JPG" => "jpg",
            "JPG90" => "jpg", // NOTE: Legacy (0.9.6) format variants with built-in quality selector
            "JPG75" => "jpg",
            "WEBP_LOSSLESS" => "webp",
            "WEBP_100" => "webp",
            "WEBP_90" => "webp",
            "WEBP_75" => "webp",
            "WEBP" => "webp",
            _ => throw new ArgumentException("Unknown format: " + format, nameof(format)),
        };
    }

    /// <summary>Image formats that are possible to save as.</summary>
    public enum ImageFormat
    {
        /// <summary>PNG: Lossless, big file.</summary>
        PNG,
        /// <summary>JPEG: Lossy, small file.</summary>
        JPG,
        /// <summary>Webp: Lossless.</summary>
        WEBP_LOSSLESS,
        /// <summary>Webp: lossy.</summary>
        WEBP
    }

    /// <summary>Converts an image to the specified format, and the specific metadata text.</summary>
    public ImageFile ConvertTo(string format, string metadata = null, int dpi = 0, int quality = 100, string stealthMetadata = "false")
    {
        if (Type.MetaType != MediaMetaType.Image) // TODO: Handle animation types well
        {
            return this;
        }
        using IMagickImageCollection<ushort> frames = ToMagickFrames.Clone();
        (MagickFormat outputFormat, MediaType type) = ConvertMagickFrame(frames[0], format, metadata, dpi, quality, stealthMetadata);
        for (int i = 1; i < frames.Count; i++)
        {
            ConvertMagickFrame(frames[i], format, metadata, dpi, quality, stealthMetadata);
        }
        return new Image(frames.ToByteArray(outputFormat), type);
    }

    /// <summary>Helper for <see cref="ConvertTo(string, string, int, int, string)"/>.</summary>
    public static (MagickFormat, MediaType) ConvertMagickFrame(IMagickImage<ushort> img, string format, string metadata, int dpi, int quality, string stealthMetadata)
    {
        bool isLossyWebp = format.StartsWith("WEBP") && format != "WEBP_LOSSLESS";
        bool canDoStealth = metadata is not null && (format == "PNG" || format.StartsWith("WEBP")) && !(isLossyWebp && stealthMetadata.ToLowerFast() == "rgb");
        if (stealthMetadata.ToLowerFast() != "false" && canDoStealth)
        {
            string actualStealthMode = stealthMetadata.ToLowerInvariant();
            MetadataHelper.EncodeStealthMetadata(img, metadata, actualStealthMode, format);
        }
        foreach (string oldProf in new List<string>(img.ProfileNames))
        {
            img.RemoveProfile(oldProf);
        }
        ExifProfile prof = new();
        if (dpi > 0)
        {
            prof.SetValue(ExifTag.XResolution, new Rational((uint)dpi, 1));
            prof.SetValue(ExifTag.YResolution, new Rational((uint)dpi, 1));
            prof.SetValue(ExifTag.ResolutionUnit, (ushort)2);
            img.Density = new Density(dpi, dpi, DensityUnit.PixelsPerInch);
        }
        if (metadata is not null)
        {
            if (format == "PNG")
            {
                img.SetAttribute("parameters", metadata);
            }
            else
            {
                prof.SetValue(ExifTag.UserComment, MetadataHelper.EncodeExifUserComment(metadata));
            }
        }
        img.SetProfile(prof);
        MediaType type;
        MagickFormat outputFormat;
        switch (format)
        {
            case "PNG":
                img.Settings.SetDefines(new PngWriteDefines()
                {
                    CompressionLevel = 1,
                    BitDepth = img.Depth > 8 ? 16u : 8u,
                    ExcludeChunks = PngChunkFlags.zTXt,
                    ColorType = stealthMetadata.ToLowerFast() == "alpha" ? ColorType.TrueColorAlpha : null
                });
                type = MediaType.ImagePng;
                outputFormat = MagickFormat.Png;
                break;
            case "JPG":
                type = MediaType.ImageJpg;
                outputFormat = MagickFormat.Jpeg;
                img.Quality = (uint)quality;
                break;
            case "JPG90": // NOTE: Legacy (0.9.6) format variants with built-in quality selector
                type = MediaType.ImageJpg;
                outputFormat = MagickFormat.Jpeg;
                img.Quality = 90;
                break;
            case "JPG75":
                type = MediaType.ImageJpg;
                outputFormat = MagickFormat.Jpeg;
                img.Quality = 75;
                break;
            case "WEBP_LOSSLESS":
                type = MediaType.ImageWebp;
                outputFormat = MagickFormat.WebP;
                img.Quality = 100;
                break;
            case "WEBP":
                type = MediaType.ImageWebp;
                outputFormat = MagickFormat.WebP;
                img.Quality = (uint)quality;
                break;
            case "WEBP_100":
                type = MediaType.ImageWebp;
                outputFormat = MagickFormat.WebP;
                img.Quality = 100;
                break;
            case "WEBP_90":
                type = MediaType.ImageWebp;
                outputFormat = MagickFormat.WebP;
                img.Quality = 90;
                break;
            case "WEBP_75":
                type = MediaType.ImageWebp;
                outputFormat = MagickFormat.WebP;
                img.Quality = 75;
                break;
            default:
                throw new SwarmReadableErrorException($"User setting for image format is '{format}', which is invalid");
        }
        if (outputFormat == MagickFormat.WebP)
        {
            img.Settings.SetDefines(new WebPWriteDefines() { Lossless = !isLossyWebp, Exact = true, AlphaQuality = 100 });
        }
        return (outputFormat, type);
    }
}
