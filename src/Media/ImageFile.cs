using SwarmUI.Utils;
using SixLabors.ImageSharp;
using System.IO;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using Newtonsoft.Json.Linq;
using SixLabors.ImageSharp.Processing;
using FreneticUtilities.FreneticExtensions;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.PixelFormats;

using Image = SwarmUI.Utils.Image;
using ISImage = SixLabors.ImageSharp.Image;
using ISImage32 = SixLabors.ImageSharp.Image<SixLabors.ImageSharp.PixelFormats.Rgba32>;
using ISImageFrame32 = SixLabors.ImageSharp.ImageFrame<SixLabors.ImageSharp.PixelFormats.Rgba32>;

namespace SwarmUI.Media;

/// <summary>A still image file. Also encompasses animation file types (eg gif, animated webp, etc.)</summary>
public class ImageFile : MediaFile
{
    /// <summary>Used for <see cref="ISImgToPngBytes(ISImage)"/>.</summary>
    public static PngEncoder FastPngEncoder = new() { CompressionLevel = PngCompressionLevel.Level1 };

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

    /// <summary>Helper to convert an ImageSharp image to png bytes.</summary>
    public static byte[] ISImgToPngBytes(ISImage img)
    {
        using MemoryStream stream = new();
        img.SaveAsPng(stream, FastPngEncoder);
        return stream.ToArray();
    }

    /// <summary>Helper to convert an ImageSharp image to jpg bytes.</summary>
    public static byte[] ISImgToJpgBytes(ISImage img)
    {
        using MemoryStream stream = new();
        img.SaveAsJpeg(stream);
        return stream.ToArray();
    }

    /// <summary>Internal cache of <see cref="ToIS"/> to avoid reprocessing.</summary>
    public ISImage _CacheISImg;

    /// <summary>Gets an ImageSharp <see cref="ISImage"/> for this image.</summary>
    public ISImage ToIS
    {
        get
        {
            if (_CacheISImg is null)
            {
                lock (this)
                {
                    _CacheISImg ??= ISImage.Load(RawData);
                }
            }
            return _CacheISImg;
        }
    }

    /// <summary>Returns the (width, height) of the image.</summary>
    public (int, int) GetResolution()
    {
        Size size = ToIS.Size;
        return (size.Width, size.Height);
    }

    /// <summary>Returns a metadata-format of the image.</summary>
    /// <param name="metadataText">Optional sub-metadata within.</param>
    public ImageFile ToMetadataJpg(string metadataText = null)
    {
        if (Type.MetaType != MediaMetaType.Image && Type.MetaType != MediaMetaType.Animation)
        {
            return null;
        }
        ISImage img = ToIS;
        float factor = 256f / Math.Min(img.Width, img.Height);
        img.Clone(i => i.Resize((int)(img.Width * factor), (int)(img.Height * factor)));
        if (!string.IsNullOrWhiteSpace(metadataText))
        {
            img.Metadata.XmpProfile = null;
            ExifProfile prof = new();
            prof.SetValue(ExifTag.UserComment, metadataText);
            img.Metadata.ExifProfile = prof;
        }
        return new Image(ISImgToJpgBytes(img), MediaType.ImageJpg);
    }

    /// <summary>Returns a simplified webp animation for preview purposes. Returns null if the input was not animated.</summary>
    public ImageFile ToWebpPreviewAnim()
    {
        if (Type != MediaType.ImageGif && Type != MediaType.ImageWebp)
        {
            return null;
        }
        ISImage isimg = ToIS;
        if (isimg.Frames.Count <= 1)
        {
            return null;
        }
        int timeTotal = 0;
        int timeAccum = 166;
        int maxFrame = isimg.Frames.Count;
        using ISImage32 oldImage = isimg.CloneAs<Rgba32>();
        int targetWidth = isimg.Width, targetHeight = isimg.Height;
        if (targetWidth > 256 || targetHeight > 256)
        {
            float factor = 256f / Math.Min(targetWidth, targetHeight);
            targetWidth = (int)(targetWidth * factor);
            targetHeight = (int)(targetHeight * factor);
        }
        using ISImage32 newImage = new(targetWidth, targetHeight);
        for (int i = 0; i < maxFrame; i++)
        {
            ISImageFrame32 frame = oldImage.Frames[i];
            int timeMs = Type == MediaType.ImageWebp ? (int)frame.Metadata.GetWebpMetadata().FrameDelay : frame.Metadata.GetGifMetadata().FrameDelay * 10;
            timeTotal += timeMs;
            timeAccum += timeMs;
            if (timeAccum > 99)
            {
                if (frame.Width != targetWidth || frame.Height != targetHeight)
                {
                    ISImage32 frameImage = new(frame.Width, frame.Height);
                    frameImage.Frames.AddFrame(frame);
                    frameImage.Frames.RemoveFrame(0);
                    frameImage.Mutate(i => i.Resize(targetWidth, targetHeight));
                    frame = frameImage.Frames[0];
                }
                frame.Metadata.GetWebpMetadata().FrameDelay = (uint)timeAccum;
                newImage.Frames.AddFrame(frame);
                timeAccum = 0;
            }
            if (timeTotal > 5000)
            {
                break;
            }
        }
        newImage.Frames.RemoveFrame(0);
        newImage.Metadata.GetWebpMetadata().RepeatCount = 0;
        using MemoryStream saveStream = new();
        newImage.SaveAsWebp(saveStream, new WebpEncoder() { Quality = 50 });
        saveStream.Seek(0, SeekOrigin.Begin);
        return new Image(saveStream.ToArray(), MediaType.ImageWebp);
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
        ISImage img = ToIS;
        if (ToIS.Width == width && ToIS.Height == height)
        {
            return this;
        }
        img = img.Clone(i => i.Resize(width, height));
        return new Image(ISImgToPngBytes(img), Type);
    }

    /// <summary>Returns a copy of this image that's definitely in '.png' format.</summary>
    public ImageFile ForceToPng()
    {
        if (Type.MetaType != MediaMetaType.Image)
        {
            return this;
        }
        return new Image(ISImgToPngBytes(ToIS), Type);
    }

    /// <summary>Returns the metadata from this image, or null if none.</summary>
    public string GetMetadata()
    {
        try
        {
            ISImage img = ToIS;
            string pngMetadata = img.Metadata?.GetPngMetadata()?.TextData?.FirstOrDefault(t => t.Keyword.ToLowerFast() == "parameters").Value;
            if (pngMetadata is not null)
            {
                return pngMetadata;
            }
            string output = null;
            if (img.Metadata?.ExifProfile?.TryGetValue(ExifTag.Model, out var data) ?? false)
            {
                output = data.Value;
            }
            if (img.Metadata?.ExifProfile?.TryGetValue(ExifTag.UserComment, out var data2) ?? false)
            {
                output = data2.Value.Text;
            }
            if (output is not null && output.Length > 0)
            {
                // Special fix for ImageSharp not parsing BigEndian unicode, so detect inverted strings (slightly hack) and flip them
                byte[] encoded = Encoding.Unicode.GetBytes(output);
                if (encoded[0] == 0 && encoded[1] != 0)
                {
                    output = Encoding.BigEndianUnicode.GetString(encoded);
                }
            }
            return output;
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
        return GetMetadata()?.ParseToJson()?["sui_image_params"]?.Value<JObject>();
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
        using MemoryStream ms = new();
        ISImage img = ToIS;
        bool isLossyWebp = format.StartsWith("WEBP") && format != "WEBP_LOSSLESS";
        bool canDoStealth = metadata is not null && (format == "PNG" || format.StartsWith("WEBP")) && !(isLossyWebp && stealthMetadata.ToLowerFast() == "rgb");
        if (stealthMetadata.ToLowerFast() != "false" && canDoStealth)
        {
            string actualStealthMode = stealthMetadata.ToLowerInvariant();
            ISImage32 rgbaImage = img.CloneAs<Rgba32>();
            MetadataHelper.EncodeStealthMetadata(rgbaImage, metadata, actualStealthMode, format);
            img = rgbaImage;
        }
        img.Metadata.XmpProfile = null;
        ExifProfile prof = new();
        if (dpi > 0)
        {
            prof.SetValue(ExifTag.XResolution, new Rational((uint)dpi, 1));
            prof.SetValue(ExifTag.YResolution, new Rational((uint)dpi, 1));
            prof.SetValue(ExifTag.ResolutionUnit, (ushort)2);
            img.Metadata.HorizontalResolution = dpi;
            img.Metadata.VerticalResolution = dpi;
        }
        if (metadata is not null)
        {
            if (format == "PNG")
            {
                img.Metadata.GetPngMetadata().TextData.Add(new("parameters", metadata, "", ""));
            }
            else
            {
                prof.SetValue(ExifTag.UserComment, metadata);
            }
        }
        img.Metadata.ExifProfile = prof;
        MediaType type;
        switch (format)
        {
            case "PNG":
                if (stealthMetadata.ToLowerFast() == "alpha")
                {
                    PngEncoder encoder = new()
                    {
                        TextCompressionThreshold = int.MaxValue,
                        BitDepth = img.PixelType.BitsPerPixel > 32 ? PngBitDepth.Bit16 : PngBitDepth.Bit8,
                        CompressionLevel = PngCompressionLevel.Level1,
                        ColorType = PngColorType.RgbWithAlpha,
                        TransparentColorMode = PngTransparentColorMode.Preserve
                    };
                    img.SaveAsPng(ms, encoder);
                }
                else
                {
                    PngEncoder encoder = new()
                    {
                        TextCompressionThreshold = int.MaxValue,
                        BitDepth = img.PixelType.BitsPerPixel > 32 ? PngBitDepth.Bit16 : PngBitDepth.Bit8,
                        CompressionLevel = PngCompressionLevel.Level1
                    };
                    img.SaveAsPng(ms, encoder);
                }
                type = MediaType.ImagePng;
                break;
            case "JPG":
                type = MediaType.ImageJpg;
                img.SaveAsJpeg(ms, new JpegEncoder() { Quality = quality });
                break;
            case "JPG90": // NOTE: Legacy (0.9.6) format variants with built-in quality selector
                type = MediaType.ImageJpg;
                img.SaveAsJpeg(ms, new JpegEncoder() { Quality = 90 });
                break;
            case "JPG75":
                type = MediaType.ImageJpg;
                img.SaveAsJpeg(ms, new JpegEncoder() { Quality = 75 });
                break;
            case "WEBP_LOSSLESS":
                type = MediaType.ImageWebp;
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = true, FileFormat = WebpFileFormatType.Lossless, Quality = 100 });
                break;
            case "WEBP":
                type = MediaType.ImageWebp;
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, FileFormat = WebpFileFormatType.Lossy, Quality = quality });
                break;
            case "WEBP_100":
                type = MediaType.ImageWebp;
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, FileFormat = WebpFileFormatType.Lossy, Quality = 100 });
                break;
            case "WEBP_90":
                type = MediaType.ImageWebp;
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, FileFormat = WebpFileFormatType.Lossy, Quality = 90 });
                break;
            case "WEBP_75":
                type = MediaType.ImageWebp;
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, FileFormat = WebpFileFormatType.Lossy, Quality = 75 });
                break;
            default:
                throw new SwarmReadableErrorException($"User setting for image format is '{format}', which is invalid");
        }
        return new Image(ms.ToArray(), type);
    }
}
