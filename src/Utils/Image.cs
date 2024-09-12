namespace SwarmUI.Utils;

using SixLabors.ImageSharp;
using System.IO;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using ISImage = SixLabors.ImageSharp.Image;
using Newtonsoft.Json.Linq;
using SixLabors.ImageSharp.Processing;
using FreneticUtilities.FreneticExtensions;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Tiff;
using SixLabors.ImageSharp.PixelFormats;
using BitMiracle.LibTiff.Classic;

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

    /// <summary>The bit depth of the image data.</summary>
    public int BitDepth;

    /// <summary>Mapping of bit depth strings to their integer values.</summary>
    public static readonly Dictionary<string, int> BitDepthMap = new()
    {
        { "8bit", 8 },
        { "16bit", 16 },
        { "32bit", 32 }
    };

    /// <summary>Creates an image object from a web image data URL string.</summary>
    public static Image FromDataString(string data)
    {
        if (data.StartsWith("data:video/"))
        {
            string ext = data.After("data:video/").Before(";base64,");
            return new Image(data.ToString().After(";base64,"), ImageType.VIDEO, ext);
        }
        if (data.StartsWith("data:image/gif;"))
        {
            return new Image(data.ToString().After(";base64,"), ImageType.ANIMATION, "gif");
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
    public Image(byte[] data, ImageType type, string extension, int bitDepth = 8)
    {
        Extension = extension;
        Type = type;
        BitDepth = bitDepth;
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

    /// <summary>Helper to convert an ImageSharp image to png bytes.</summary>
    public static byte[] ISImgToPngBytes(ISImage img)
    {
        using MemoryStream stream = new();
        img.SaveAsPng(stream);
        return stream.ToArray();
    }

    /// <summary>Helper to convert an ImageSharp image to jpg bytes.</summary>
    public static byte[] ISImgToJpgBytes(ISImage img)
    {
        using MemoryStream stream = new();
        img.SaveAsJpeg(stream);
        return stream.ToArray();
    }

    public string AsDataString()
    {
        if (Type == ImageType.ANIMATION)
        {
            return "data:image/gif;base64," + AsBase64;
        }
        else if (Type == ImageType.VIDEO)
        {
            return $"data:video/{Extension};base64," + AsBase64;
        }
        return $"data:image/{(Extension == "jpg" ? "jpeg" : Extension)};base64," + AsBase64;
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
        /// <summary>TIFF: Lossless, big file.</summary>
        TIFF,
        /// <summary>PNG: Lossless, big file.</summary>
        PNG,
        /// <summary>JPEG: Lossy, (100% quality), small file.</summary>
        JPG,
        /// <summary>JPEG: Lossy, (90% quality), small file.</summary>
        JPG90,
        /// <summary>JPEG: Lossy, (bad 75% quality), small file.</summary>
        JPG75,
        /// <summary>Webp: Lossless.</summary>
        WEBP_LOSSLESS,
        /// <summary>Webp: lossy 100% quality.</summary>
        WEBP_100,
        /// <summary>Webp: lossy 90% quality.</summary>
        WEBP_90,
        /// <summary>Webp: lossy 75% quality.</summary>
        WEBP_75
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
            if (img.Metadata?.ExifProfile?.TryGetValue(ExifTag.Model, out var data) ?? false)
            {
                return data.Value;
            }
            if (img.Metadata?.ExifProfile?.TryGetValue(ExifTag.UserComment, out var data2) ?? false)
            {
                return data2.Value.Text;
            }
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
            "TIFF" => "tiff",
            "PNG" => "png",
            "JPG" => "jpg",
            "JPG90" => "jpg",
            "JPG75" => "jpg",
            "WEBP_LOSSLESS" => "webp",
            "WEBP_100" => "webp",
            "WEBP_90" => "webp",
            "WEBP_75" => "webp",
            _ => throw new ArgumentException("Unknown format: " + format, nameof(format)),
        };
    }

    /// <summary>Converts an image to the specified format, and the specific metadata text.</summary>
    public Image ConvertTo(string format, string metadata = null, int dpi = 0, int bitDepth = 8)
    {
        if (Type != ImageType.IMAGE)
        {
            return this;
        }
        using MemoryStream ms = new();
        ISImage img = ToIS;
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
            case "TIFF":
                if (bitDepth == 32)
                {
                    SaveAs32BitTiff(this, ms);
                }
                else
                {
                    img.SaveAsTiff(ms, new TiffEncoder() { BitsPerPixel = bitDepth == 16 ? TiffBitsPerPixel.Bit48 : TiffBitsPerPixel.Bit24 });
                }
                ext = "tiff";
                break;
            case "PNG":
                PngEncoder encoder = new() { TextCompressionThreshold = int.MaxValue, BitDepth = bitDepth == 16 ? PngBitDepth.Bit16 : PngBitDepth.Bit8 };
                img.SaveAsPng(ms, encoder);
                ext = "png";
                break;
            case "JPG":
                img.SaveAsJpeg(ms, new JpegEncoder() { Quality = 100 });
                break;
            case "JPG90":
                img.SaveAsJpeg(ms, new JpegEncoder() { Quality = 90 });
                break;
            case "JPG75":
                img.SaveAsJpeg(ms, new JpegEncoder() { Quality = 75 });
                break;
                case "WEBP_LOSSLESS":
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = true, Quality = 100 });
                break;
                case "WEBP_100":
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, Quality = 100 });
                break;
            case "WEBP_90":
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, Quality = 90 });
                break;
            case "WEBP_75":
                img.SaveAsWebp(ms, new WebpEncoder() { NearLossless = false, Quality = 75 });
                break;
            default:
                throw new SwarmReadableErrorException($"User setting for image format is '{format}', which is invalid");
        }
        return new(ms.ToArray(), Type, ext, bitDepth);
    }

    private void SaveAs32BitTiff(Image img, Stream stream)
    {
        using (Tiff tiff = Tiff.Open("temp.tif", "w"))
        {
            ISImage isImage = img.ToIS;
            tiff.SetField(TiffTag.IMAGEWIDTH, isImage.Width);
            tiff.SetField(TiffTag.IMAGELENGTH, isImage.Height);
            tiff.SetField(TiffTag.SAMPLESPERPIXEL, 4); // RGBA
            tiff.SetField(TiffTag.BITSPERSAMPLE, 32);
            tiff.SetField(TiffTag.ORIENTATION, Orientation.TOPLEFT);
            tiff.SetField(TiffTag.PLANARCONFIG, PlanarConfig.CONTIG);
            tiff.SetField(TiffTag.PHOTOMETRIC, Photometric.RGB);
            tiff.SetField(TiffTag.ROWSPERSTRIP, isImage.Height);
            tiff.SetField(TiffTag.SAMPLEFORMAT, SampleFormat.IEEEFP);

            byte[] buffer = new byte[isImage.Width * isImage.Height * 16]; // 32 bits * 4 channels = 16 bytes per pixel
            FillBufferWith32BitData(isImage, buffer);

            tiff.WriteEncodedStrip(0, buffer, buffer.Length);
        }

        // Copy the temp file to the stream
        using (FileStream fs = new FileStream("temp.tif", FileMode.Open, FileAccess.Read))
        {
            fs.CopyTo(stream);
        }
        File.Delete("temp.tif");
    }

    private void FillBufferWith32BitData(ISImage img, byte[] buffer)
    {
        using (var image = img.CloneAs<Rgba32>())
        {
            int stride = image.Width * 16; // 16 bytes per pixel (4 channels * 4 bytes per channel)

            image.ProcessPixelRows(accessor =>
            {
                for (int y = 0; y < image.Height; y++)
                {
                    Span<Rgba32> pixelRow = accessor.GetRowSpan(y);
                    for (int x = 0; x < image.Width; x++)
                    {
                        int bufferOffset = (y * stride) + (x * 16);
                        ref Rgba32 pixel = ref pixelRow[x];

                        // Convert 8-bit values to 32-bit float (0.0 to 1.0 range)
                        float r = pixel.R / 255f;
                        float g = pixel.G / 255f;
                        float b = pixel.B / 255f;
                        float a = pixel.A / 255f;

                        // Write float values to buffer
                        BitConverter.GetBytes(r).CopyTo(buffer, bufferOffset);
                        BitConverter.GetBytes(g).CopyTo(buffer, bufferOffset + 4);
                        BitConverter.GetBytes(b).CopyTo(buffer, bufferOffset + 8);
                        BitConverter.GetBytes(a).CopyTo(buffer, bufferOffset + 12);
                    }
                }
            });
        }
    }
}
