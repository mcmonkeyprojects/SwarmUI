namespace SwarmUI.Utils;

using FreneticUtilities.FreneticExtensions;

using ISImage = SixLabors.ImageSharp.Image;
using SwarmUI.Media;

/// <summary>Helper to represent an image file cleanly and quickly.</summary>
public class Image : ImageFile
{
    /// <summary>Construct the image instance from raw data and a media type.</summary>
    public Image(byte[] data, MediaType type)
    {
        RawData = data;
        Type = type;
    }

    /// <summary>Construct an image from an ISImage, treating it as a png.</summary>
    public Image(ISImage img) : this(ImageFile.ISImgToPngBytes(img), MediaType.ImagePng)
    {
    }

    /// <summary>Helper to convert an ImageSharp image to png bytes.</summary>
    [Obsolete("Use ImageFile.ISImgToPngBytes instead")]
    public static new byte[] ISImgToPngBytes(ISImage img) => ImageFile.ISImgToPngBytes(img);

    /// <summary>Helper to convert an ImageSharp image to jpg bytes.</summary>
    [Obsolete("Use ImageFile.ISImgToJpgBytes instead")]
    public static new byte[] ISImgToJpgBytes(ISImage img) => ImageFile.ISImgToJpgBytes(img);

    /// <summary>Gets the correct mime type for this image, eg 'image/png'.</summary>
    [Obsolete("Use MediaType.MimeType instead")]
    public string MimeType() => base.Type.MimeType;

    /// <summary>Returns a metadata-format of the image.</summary>
    /// <param name="metadataText">Optional sub-metadata within.</param>
    [Obsolete("Use ImageFile")]
    public new Image ToMetadataJpg(string metadataText = null) => base.ToMetadataJpg(metadataText) as Image;

    /// <summary>Returns a simplified webp animation for preview purposes. Returns null if the input was not animated.</summary>
    [Obsolete("Use ImageFile")]
    public new Image ToWebpPreviewAnim() => base.ToWebpPreviewAnim() as Image;

    /// <summary>Returns a metadata-format of the image.</summary>
    [Obsolete("Use ImageFile")]
    public new string ToMetadataFormat() => base.ToMetadataFormat();

    /// <summary>Resizes the given image directly and returns a png formatted copy of it.</summary>
    [Obsolete("Use ImageFile")]
    public new Image Resize(int width, int height) => base.Resize(width, height) as Image;

    /// <summary>Returns a copy of this image that's definitely in '.png' format.</summary>
    [Obsolete("Use ImageFile")]
    public new Image ForceToPng() => base.ForceToPng() as Image;

    /// <summary>Converts an image to the specified format, and the specific metadata text.</summary>
    [Obsolete("Use ImageFile")]
    public new Image ConvertTo(string format, string metadata = null, int dpi = 0, int quality = 100, string stealthMetadata = "false")
    {
        return base.ConvertTo(format, metadata, dpi, quality, stealthMetadata) as Image;
    }
}
