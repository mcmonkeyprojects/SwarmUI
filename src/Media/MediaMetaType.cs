
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

    /// <summary>Function that creates a new object of this media type, based on raw binary data.</summary>
    public Func<byte[], MediaType, MediaFile> FromRawData;

    /// <summary>Still-image media type.</summary>
    public static MediaMetaType Image = new() { Name = "Image", CreateNew = (raw, type) => new Image(raw, type), FromDataString = ImageFile.FromDataString, FromRawData = (data, type) => new Image(data, type) };

    /// <summary>Moving-image media type. This is 'animation' types (eg gif, animated webp).</summary>
    public static MediaMetaType Animation = new() { Name = "Image", CreateNew = (raw, type) => new Image(raw, type), FromDataString = ImageFile.FromDataString, FromRawData = (data, type) => new Image(data, type) };

    /// <summary>Moving-picture video media type. May contain audio or other video container streams.</summary>
    public static MediaMetaType Video = new() { Name = "Video", CreateNew = (raw, type) => new VideoFile(raw, type), FromDataString = VideoFile.FromDataString, FromRawData = (data, type) => new VideoFile(data, type) };

    /// <summary>Simple text content media type.</summary>
    public static MediaMetaType Text = new() { Name = "Text", CreateNew = (raw, type) => new Image(raw, type), FromDataString = ImageFile.FromDataString, FromRawData = (data, type) => new Image(data, type) };
    // TODO: Actual text type

    /// <summary>Simple audio data media type.</summary>
    public static MediaMetaType Audio = new() { Name = "Audio", CreateNew = (raw, type) => new AudioFile(raw, type), FromDataString = AudioFile.FromDataString, FromRawData = (data, type) => new AudioFile(data, type) };

    // TODO: ...?
}
