using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using ImageMagick;

namespace SwarmUI.Utils;

/// <summary>Helper for metadata handling, especially "stealth metadata".</summary>
public static class MetadataHelper
{
    // The stealth info implementation of reforge was used as a reference for this file.

    /// <summary>Encodes an EXIF UserComment as little-endian Unicode.</summary>
    public static byte[] EncodeExifUserComment(string text)
    {
        return [.. "UNICODE\0"u8, .. Encoding.Unicode.GetBytes(text)];
    }

    /// <summary>Decodes EXIF UserComment text, respecting its byte order mark or the containing TIFF byte order.</summary>
    public static string DecodeExifUserComment(byte[] comment, byte[] profile)
    {
        if (comment.Length < 8)
        {
            return Encoding.UTF8.GetString(comment).TrimEnd('\0');
        }
        ReadOnlySpan<byte> text = comment.AsSpan(8);
        if (comment.AsSpan(0, 8).SequenceEqual("UNICODE\0"u8))
        {
            if (text.StartsWith<byte>([0xFF, 0xFE]))
            {
                return Encoding.Unicode.GetString(text[2..]).TrimEnd('\0');
            }
            if (text.StartsWith<byte>([0xFE, 0xFF]))
            {
                return Encoding.BigEndianUnicode.GetString(text[2..]).TrimEnd('\0');
            }
            int tiffOffset = profile.AsSpan().StartsWith("Exif\0\0"u8) ? 6 : 0;
            bool bigEndian = profile.Length >= tiffOffset + 2 && profile[tiffOffset] == 'M' && profile[tiffOffset + 1] == 'M';
            // Some generators write comments in the opposite byte order from the TIFF profile. Preserve support for those files.
            if (text.Length >= 2 && text[0] == 0 && text[1] != 0)
            {
                bigEndian = true;
            }
            else if (text.Length >= 2 && text[0] != 0 && text[1] == 0)
            {
                bigEndian = false;
            }
            return (bigEndian ? Encoding.BigEndianUnicode : Encoding.Unicode).GetString(text).TrimEnd('\0');
        }
        if (comment.AsSpan(0, 8).SequenceEqual("JIS\0\0\0\0\0"u8))
        {
            return CodePagesEncodingProvider.Instance.GetEncoding(20932).GetString(text).TrimEnd('\0');
        }
        bool hasHeader = comment.AsSpan(0, 8).SequenceEqual("ASCII\0\0\0"u8) || comment.AsSpan(0, 8).SequenceEqual(new byte[8]);
        return Encoding.UTF8.GetString(hasHeader ? text : comment.AsSpan()).TrimEnd('\0');
    }

    /// <summary>Encodes the given metadata string into the LSBs of the image's pixels.</summary>
    /// <param name="image">The image to modify. Converted to 8-bit RGBA to match the stealth metadata format.</param>
    /// <param name="metadata">The metadata string to embed.</param>
    /// <param name="mode">The encoding mode: "Alpha" or "RGB".</param>
    /// <param name="format">The target image format (e.g., "webp", "png").</param>
    public static void EncodeStealthMetadata(IMagickImage<ushort> image, string metadata, string mode, string format)
    {
        string actualMode = mode.ToLowerInvariant();
        image.ColorSpace = ColorSpace.sRGB;
        image.ColorType = ColorType.TrueColorAlpha;
        image.Depth = 8;
        // stupid hack to stop the alpha layer from getting deleted
        if (actualMode == "alpha" && format.StartsWith("WEBP"))
        {
            PrepareImageForWebPAlpha(image);
        }

        string binaryData = PrepareData(metadata, actualMode, true);
        using IPixelCollection<ushort> pixels = image.GetPixels();
        byte[] data = pixels.ToByteArray(PixelMapping.RGBA);
        if (actualMode == "alpha")
        {
            EmbedAlpha(data, (int)image.Width, (int)image.Height, binaryData);
        }
        else if (actualMode == "rgb")
        {
            EmbedRgb(data, (int)image.Width, (int)image.Height, binaryData);
        }
        pixels.SetPixels(Array.ConvertAll(data, value => (ushort)(value * 257)));
    }

    /// <summary>
    /// Pre-processes the image to prevent the WebP encoder from discarding the alpha channel.
    /// It does this by creating a semi-transparent vertical line on the right edge of the image.
    /// </summary>
    public static void PrepareImageForWebPAlpha(IMagickImage<ushort> image)
    {
        image.ColorType = ColorType.TrueColorAlpha;
        using IPixelCollection<ushort> pixels = image.GetPixels();
        for (int y = 0; y < image.Height; y++)
        {
            IPixel<ushort> pixel = pixels.GetPixel((int)image.Width - 1, y);
            pixel.SetChannel(3, 254 * 257);
        }
    }

    /// <summary>Prepares the signature, payload length, and metadata bits for stealth encoding.</summary>
    public static string PrepareData(string metadata, string mode, bool compressed)
    {
        string signature = $"stealth_{(mode == "alpha" ? "png" : "rgb")}{(compressed ? "comp" : "info")}";
        byte[] signatureBytes = Encoding.UTF8.GetBytes(signature);
        string binarySignature = BytesToBinaryString(signatureBytes);
        byte[] paramBytes = Encoding.UTF8.GetBytes(metadata);
        if (compressed)
        {
            using MemoryStream ms = new();
            using (GZipStream gzip = new(ms, CompressionLevel.Optimal, true))
            {
                gzip.Write(paramBytes, 0, paramBytes.Length);
            }
            paramBytes = ms.ToArray();
        }
        string binaryParam = BytesToBinaryString(paramBytes);
        string binaryParamLen = Convert.ToString(binaryParam.Length, 2).PadLeft(32, '0');
        return binarySignature + binaryParamLen + binaryParam;
    }

    /// <summary>Converts bytes to their binary string representation.</summary>
    public static string BytesToBinaryString(byte[] bytes)
    {
        StringBuilder sb = new(bytes.Length * 8);
        foreach (byte b in bytes)
        {
            sb.Append(Convert.ToString(b, 2).PadLeft(8, '0'));
        }
        return sb.ToString();
    }

    /// <summary>Embeds metadata bits in the alpha channel of an RGBA byte buffer.</summary>
    public static void EmbedAlpha(byte[] pixels, int width, int height, string binaryData)
    {
        int dataIndex = 0;
        for (int x = 0; x < width; x++)
        {
            for (int y = 0; y < height; y++)
            {
                if (dataIndex >= binaryData.Length)
                {
                    return;
                }
                int alphaIndex = (y * width + x) * 4 + 3;
                int bit = binaryData[dataIndex] - '0';
                pixels[alphaIndex] = (byte)((pixels[alphaIndex] & 0xFE) | bit);
                dataIndex++;
            }
        }
    }

    /// <summary>Embeds metadata bits in the RGB channels of an RGBA byte buffer.</summary>
    public static void EmbedRgb(byte[] pixels, int width, int height, string binaryData)
    {
        int dataIndex = 0;
        for (int x = 0; x < width; x++)
        {
            for (int y = 0; y < height; y++)
            {
                if (dataIndex >= binaryData.Length)
                {
                    return;
                }
                int pixelIndex = (y * width + x) * 4;
                pixels[pixelIndex] = (byte)((pixels[pixelIndex] & 0xFE) | (binaryData[dataIndex] - '0'));
                if (dataIndex + 1 < binaryData.Length)
                {
                    pixels[pixelIndex + 1] = (byte)((pixels[pixelIndex + 1] & 0xFE) | (binaryData[dataIndex + 1] - '0'));
                }
                if (dataIndex + 2 < binaryData.Length)
                {
                    pixels[pixelIndex + 2] = (byte)((pixels[pixelIndex + 2] & 0xFE) | (binaryData[dataIndex + 2] - '0'));
                }
                dataIndex += 3;
            }
        }
    }
}
