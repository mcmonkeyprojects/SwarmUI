namespace SwarmUI.Utils;

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

using ISImage = SixLabors.ImageSharp.Image;
using ISImage32 = SixLabors.ImageSharp.Image<SixLabors.ImageSharp.PixelFormats.Rgba32>;
using ISImageFrame32 = SixLabors.ImageSharp.ImageFrame<SixLabors.ImageSharp.PixelFormats.Rgba32>;

/// <summary>Helper to represent an image file cleanly and quickly.</summary>
public class Image
{
    /// <summary>The raw binary data.</summary>
    public byte[] ImageData;

    public enum ImageType
    {
        IMAGE = 0,
        /// <summary>ie animated gif</summary>
        ANIMATION = 1,
        VIDEO = 2
    }

    /// <summary>The type of image data this image holds.</summary>
    public ImageType Type;

    /// <summary>File extension for this image.</summary>
    public string Extension;

    /// <summary>Creates an image object from a web image data URL string.</summary>
    public static Image FromDataString(string data)
    {
        if (data.StartsWith("data:video/"))
        {
            string ext = data.Before(";base64,").After("data:video/");
            return new Image(data.After(";base64,"), ImageType.VIDEO, ext);
        }
        if (data.StartsWith("data:image/gif;"))
        {
            return new Image(data.After(";base64,"), ImageType.ANIMATION, "gif");
        }
        if (data.StartsWith("data:image/webp;"))
        {
            return new Image(data.After(";base64,"), ImageType.ANIMATION, "webp");
        }
        if (data.StartsWith("data:image/"))
        {
            string ext = data.After("data:image/").Before(";base64,");
            if (ext == "jpeg")
            {
                ext = "jpg";
            }
            return new Image(data.ToString().After(";base64,"), ImageType.IMAGE, ext);
        }
        return new Image(data.ToString().After(";base64,"), ImageType.IMAGE, "png");
    }

    /// <summary>Construct an image from Base64 text.</summary>
    public Image(string base64, ImageType type, string extension) : this(Convert.FromBase64String(base64), type, extension)
    {
    }

    /// <summary>Construct an image from raw binary data.</summary>
    public Image(byte[] data, ImageType type, string extension)
    {
        Extension = extension;
        Type = type;
        if (data is null)
        {
            throw new ArgumentNullException(nameof(data));
        }
        else if (data.Length == 0)
        {
              throw new ArgumentException("Data is empty!", nameof(data));
        }
        ImageData = data;
    }

    /// <summary>Construct an image from an ISImage.</summary>
    public Image(ISImage img) : this(ISImgToPngBytes(img), ImageType.IMAGE, "png")
    {
    }

    /// <summary>Get a Base64 string representation of the raw image data.</summary>
    public string AsBase64 => Convert.ToBase64String(ImageData);

    /// <summary>Gets an ImageSharp <see cref="ISImage"/> for this image.</summary>
    public ISImage ToIS => ISImage.Load(ImageData);

    /// <summary>Returns the (width, height) of the image.</summary>
    public (int, int) GetResolution()
    {
        Size size = ToIS.Size;
        return (size.Width, size.Height);
    }

    /// <summary>Used for <see cref="ISImgToPngBytes(ISImage)"/>.</summary>
    public static PngEncoder FastPngEncoder = new() { CompressionLevel = PngCompressionLevel.Level1 };

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

    /// <summary>Gets a valid web data string for this image, eg 'data:image/png;base64,abc123'.</summary>
    public string AsDataString()
    {
        return $"data:{MimeType()};base64,{AsBase64}";
    }

    /// <summary>Gets the correct mime type for this image, eg 'image/png'.</summary>
    public string MimeType()
    {
        if (Type == ImageType.ANIMATION)
        {
            return "image/gif";
        }
        else if (Type == ImageType.VIDEO)
        {
            return $"video/{Extension}";
        }
        return $"image/{(Extension == "jpg" ? "jpeg" : Extension)}";
    }

    /// <summary>Returns a metadata-format of the image.</summary>
    /// <param name="metadataText">Optional sub-metadata within.</param>
    public Image ToMetadataJpg(string metadataText = null)
    {
        if (Type != ImageType.IMAGE)
        {
            return null;
        }
        ISImage img = ToIS;
        float factor = 256f / Math.Min(img.Width, img.Height);
        img.Mutate(i => i.Resize((int)(img.Width * factor), (int)(img.Height * factor)));
        if (!string.IsNullOrWhiteSpace(metadataText))
        {
            img.Metadata.XmpProfile = null;
            ExifProfile prof = new();
            prof.SetValue(ExifTag.UserComment, metadataText);
            img.Metadata.ExifProfile = prof;
        }
        return new Image(ISImgToJpgBytes(img), Type, "jpg");
    }

    /// <summary>Returns a simplified webp animation for preview purposes. Returns null if the input was not animated.</summary>
    public Image ToWebpPreviewAnim()
    {
        if (Type != ImageType.ANIMATION)
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
            int timeMs = Extension == "webp" ? (int)frame.Metadata.GetWebpMetadata().FrameDelay : frame.Metadata.GetGifMetadata().FrameDelay * 10;
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
        return new(saveStream.ToArray(), ImageType.ANIMATION, "webp");
    }

    /// <summary>Returns a metadata-format of the image.</summary>
    public string ToMetadataFormat()
    {
        Image conv = ToMetadataJpg();
        if (conv is null)
        {
            return AsDataString();
        }
        return "data:image/jpeg;base64," + conv.AsBase64;
    }

    /// <summary>Resizes the given image directly and returns a png formatted copy of it.</summary>
    public Image Resize(int width, int height)
    {
        if (Type != ImageType.IMAGE)
        {
            return this;
        }
        ISImage img = ToIS;
        if (ToIS.Width == width && ToIS.Height == height)
        {
            return this;
        }
        img.Mutate(i => i.Resize(width, height));
        return new(ISImgToPngBytes(img), Type, Extension);
    }

    /// <summary>Returns a copy of this image that's definitely in '.png' format.</summary>
    public Image ForceToPng()
    {
        if (Type != ImageType.IMAGE)
        {
            return this;
        }
        return new(ISImgToPngBytes(ToIS), Type, "png");
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

    /// <summary>Converts an image to the specified format, and the specific metadata text.</summary>
    public Image ConvertTo(string format, string metadata = null, int dpi = 0, int quality = 100, string stealthMetadata = "false")
    {
        if (Type != ImageType.IMAGE)
        {
            return this;
        }
        using MemoryStream ms = new();
        ISImage img = ToIS;
        if (metadata is not null && stealthMetadata.ToLowerFast() != "false" && format == "PNG")
        {
            string actualStealthMode = stealthMetadata.ToLowerInvariant();
            ISImage32 rgbaImage = img.CloneAs<Rgba32>();
            MetadataHelper.EncodeStealthMetadata(rgbaImage, metadata, actualStealthMode);
            img.Dispose();
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
        string ext = "jpg";
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
                ext = "png";
                break;
            case "JPG":
                img.SaveAsJpeg(ms, new JpegEncoder() { Quality = quality });
                break;
            case "JPG90": // NOTE: Legacy (0.9.6) format variants with built-in quality selector
                img.SaveAsJpeg(ms, new JpegEncoder() { Quality = 90 });
                break;
            case "JPG75":
                img.SaveAsJpeg(ms, new JpegEncoder() { Quality = 75 });
                break;
            case "WEBP_LOSSLESS":
                ext = "webp";
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = true, FileFormat = WebpFileFormatType.Lossless, Quality = 100 });
                break;
            case "WEBP":
                ext = "webp";
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, FileFormat = WebpFileFormatType.Lossy, Quality = quality });
                break;
            case "WEBP_100":
                ext = "webp";
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, FileFormat = WebpFileFormatType.Lossy, Quality = 100 });
                break;
            case "WEBP_90":
                ext = "webp";
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, FileFormat = WebpFileFormatType.Lossy, Quality = 90 });
                break;
            case "WEBP_75":
                ext = "webp";
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, FileFormat = WebpFileFormatType.Lossy, Quality = 75 });
                break;
            default:
                throw new SwarmReadableErrorException($"User setting for image format is '{format}', which is invalid");
        }
        return new(ms.ToArray(), Type, ext);
    }
}
