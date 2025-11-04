
using SwarmUI.Utils;

namespace SwarmUI.Media;

/// <summary>A media meta-type is a category of media types. For example, the Image meta-type includes jpegs, pngs, webps, etc.</summary>
public class MediaMetaType
{
    /// <summary>Name of the meta-type.</summary>
    public string Name;

    /// <summary>List of the specific media-types within.</summary>
    public List<MediaType> Types = [];

    /// <summary>Function that creates a new object of this media type, based on raw binary data and a type.</summary>
    public Func<byte[], MediaType, MediaFile> CreateNew;

    /// <summary>Function that creates a new object of this media type, based on a network data string.</summary>
    public Func<string, MediaFile> FromDataString;

    /// <summary>Still-image media type.</summary>
    public static MediaMetaType Image = new() { Name = "Image", CreateNew = (raw, type) => new Image(raw, type), FromDataString = ImageFile.FromDataString };

    /// <summary>Moving-image media type. This is 'animation' types (eg gif, animated webp).</summary>
    public static MediaMetaType Animation = new() { Name = "Image", CreateNew = (raw, type) => new Image(raw, type), FromDataString = ImageFile.FromDataString };

    /// <summary>Moving-picture video media type. May contain audio or other video container streams.</summary>
    public static MediaMetaType Video = new() { Name = "Video", CreateNew = (raw, type) => new Image(raw, type), FromDataString = ImageFile.FromDataString };
    // TODO: Actual video type

    /// <summary>Simple text content media type.</summary>
    public static MediaMetaType Text = new() { Name = "Text", CreateNew = (raw, type) => new Image(raw, type), FromDataString = ImageFile.FromDataString };
    // TODO: Actual text type

    /// <summary>Simple audio data media type.</summary>
    public static MediaMetaType Audio = new() { Name = "Audio", CreateNew = (raw, type) => new Image(raw, type), FromDataString = ImageFile.FromDataString };
    // TODO: Actual audio type

    // TODO: ...?
}
