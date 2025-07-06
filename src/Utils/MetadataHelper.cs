using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace SwarmUI.Utils;

/// <summary>Helper for metadata handling, especially "stealth metadata".</summary>
public static class MetadataHelper
{
    // The stealth info implementation of reforge was used as a reference for this file.

    /// <summary>Encodes the given metadata string into the LSBs of the image's pixels.</summary>
    /// <param name="image">The image to modify. Must be in Rgba32 format.</param>
    /// <param name="metadata">The metadata string to embed.</param>
    /// <param name="mode">The encoding mode: "Alpha" or "RGB".</param>
    public static void EncodeStealthMetadata(Image<Rgba32> image, string metadata, string mode)
    {
        string actualMode = mode.ToLowerInvariant();
        string binaryData = PrepareData(metadata, actualMode, true);
        if (actualMode == "alpha")
        {
            EmbedAlpha(image, binaryData);
        }
        else if (actualMode == "rgb")
        {
            EmbedRgb(image, binaryData);
        }
    }

    private static string PrepareData(string metadata, string mode, bool compressed)
    {
        string signature = $"stealth_{(mode == "alpha" ? "png" : "rgb")}{(compressed ? "comp" : "info")}";
        byte[] signatureBytes = Encoding.UTF8.GetBytes(signature);
        string binarySignature = BytesToBinaryString(signatureBytes);
        byte[] paramBytes = Encoding.UTF8.GetBytes(metadata);
        if (compressed)
        {
            using var ms = new MemoryStream();
            using (var gzip = new GZipStream(ms, CompressionLevel.Optimal, true))
            {
                gzip.Write(paramBytes, 0, paramBytes.Length);
            }
            paramBytes = ms.ToArray();
        }
        string binaryParam = BytesToBinaryString(paramBytes);
        string binaryParamLen = Convert.ToString(binaryParam.Length, 2).PadLeft(32, '0');
        return binarySignature + binaryParamLen + binaryParam;
    }

    private static string BytesToBinaryString(byte[] bytes)
    {
        StringBuilder sb = new(bytes.Length * 8);
        foreach (byte b in bytes)
        {
            sb.Append(Convert.ToString(b, 2).PadLeft(8, '0'));
        }
        return sb.ToString();
    }

    private static void EmbedAlpha(Image<Rgba32> image, string binaryData)
    {
        int dataIndex = 0;
        for (int x = 0; x < image.Width; x++)
        {
            for (int y = 0; y < image.Height; y++)
            {
                if (dataIndex >= binaryData.Length)
                {
                    return;
                }
                Rgba32 pixel = image[x, y];
                int bit = binaryData[dataIndex] - '0';
                pixel.A = (byte)((pixel.A & 0xFE) | bit);
                image[x, y] = pixel;
                dataIndex++;
            }
        }
    }

    private static void EmbedRgb(Image<Rgba32> image, string binaryData)
    {
        int dataIndex = 0;
        for (int x = 0; x < image.Width; x++)
        {
            for (int y = 0; y < image.Height; y++)
            {
                if (dataIndex >= binaryData.Length)
                {
                    return;
                }
                Rgba32 pixel = image[x, y];
                pixel.R = (byte)((pixel.R & 0xFE) | (binaryData[dataIndex] - '0'));
                if (dataIndex + 1 < binaryData.Length)
                {
                    pixel.G = (byte)((pixel.G & 0xFE) | (binaryData[dataIndex + 1] - '0'));
                }
                if (dataIndex + 2 < binaryData.Length)
                {
                    pixel.B = (byte)((pixel.B & 0xFE) | (binaryData[dataIndex + 2] - '0'));
                }
                image[x, y] = pixel;
                dataIndex += 3;
            }
        }
    }
}
