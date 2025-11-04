namespace SwarmUI.Utils;

using FreneticUtilities.FreneticExtensions;

using ISImage = SixLabors.ImageSharp.Image;
using SwarmUI.Media;

/// <summary>Helper to represent an image file cleanly and quickly.</summary>
public class Image : ImageFile
{
    [Obsolete("Use `RawData` instead")]
    public byte[] ImageData
    {
        get => RawData;
        set => RawData = value;
    }

    [Obsolete("Use `MediaType` instead")]
    public enum ImageType
    {
        IMAGE = 0,
        /// <summary>ie animated gif</summary>
        ANIMATION = 1,
        VIDEO = 2
    }

    /// <summary>Redirects to <see cref="MediaFile.Type"/>.</summary>
    public MediaType MediaType => base.Type;

    [Obsolete("Use `MediaType` instead")]
    public string Extension => base.Type.Extension;

    /// <summary>The type of image data this image holds.</summary>
    [Obsolete("Use `MediaType` instead")]
    public new ImageType Type;

    /// <summary>Creates an image object from a web image data URL string.</summary>
    [Obsolete("Use the MediaFile tools instead")]
    public static new Image FromDataString(string data) => ImageFile.FromDataString(data) as Image;

    /// <summary>Construct the image instance from raw data and a media type.</summary>
    public Image(byte[] data, MediaType type)
    {
        RawData = data;
        base.Type = type;
#pragma warning disable CS0618 // Type or member is obsolete
        if (type == MediaType.ImageGif || type == MediaType.ImageWebp)
        {
            Type = ImageType.ANIMATION;
        }
        else if (type.MetaType == MediaMetaType.Video)
        {
            Type = ImageType.VIDEO;
        }
        else
        {
            Type = ImageType.IMAGE;
        }
#pragma warning restore CS0618 // Type or member is obsolete
    }

    /// <summary>Construct an image from Base64 text.</summary>
    [Obsolete("Use the MediaFile tools instead")]
    public Image(string base64, ImageType type, string extension) : this(Convert.FromBase64String(base64), type, extension)
    {
    }

    /// <summary>Construct an image from raw binary data.</summary>
    [Obsolete("Use the MediaFile tools instead")]
    public Image(byte[] data, ImageType type, string extension)
    {
        base.Type = MediaType.TypesByExtension.GetValueOrDefault(extension) ?? new(extension, $"image/{extension}", MediaMetaType.Image);
        Type = type;
        if (data is null)
        {
            throw new ArgumentNullException(nameof(data));
        }
        else if (data.Length == 0)
        {
              throw new ArgumentException("Data is empty!", nameof(data));
        }
        RawData = data;
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
