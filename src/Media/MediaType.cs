namespace SwarmUI.Media;

/// <summary>A media type is a specific media file type, such as 'png', 'mp4', etc.</summary>
/// <param name="extension">The standard file extension for this media type (eg 'png').</param>
/// <param name="mimeType">The web standard mime-type for this media type (eg 'image/png').</param>
/// <param name="metaType">What category of types (eg 'image') this type is part of.</param>
/// <param name="altExtensions">Any alternate file extensions that also describe this type (eg 'jpeg' for 'jpg').</param>
public class MediaType(string extension, string mimeType, MediaMetaType metaType, string[] altExtensions = null)
{
    /// <summary>The standard extension for this media type (eg 'png').</summary>
    public string Extension = extension;

    /// <summary>Any alternate extension that describe this type (eg 'jpeg' for 'jpg').</summary>
    public string[] AltExtensions = altExtensions ?? [];

    /// <summary>The web standard mime-type for this media type (eg 'image/png').</summary>
    public string MimeType = mimeType;

    /// <summary>What category of types (eg 'image') this type is part of.</summary>
    public MediaMetaType MetaType = metaType;

    /// <summary>Mapping of media types by their file extension.</summary>
    public static ConcurrentDictionary<string, MediaType> TypesByExtension = [];

    /// <summary>Mapping of media types by their mime type.</summary>
    public static ConcurrentDictionary<string, MediaType> TypesByMimeType = [];

    /// <summary>Gets the media type for a given file extension. If not found, can either form a presumption, or return null.</summary>
    /// <param name="extension">The file extension, such as 'png'.</param>
    /// <param name="mimePresumption">Optionally, a fallback mime class presumption, such as 'image' (which will form eg 'image/png').</param>
    /// <param name="defaultPresumption">Optionally, a fallback meta-type presumption.</param>
    public static MediaType GetByExtension(string extension, string mimePresumption = null, MediaMetaType defaultPresumption = null)
    {
        if (TypesByExtension.TryGetValue(extension, out var type))
        {
            return type;
        }
        else if (mimePresumption is not null && defaultPresumption is not null)
        {
            return new MediaType(extension, $"{mimePresumption}/{extension}", defaultPresumption);
        }
        return null;
    }

    /// <summary>Register a new media type.</summary>
    /// <param name="type">The media type to register.</param>
    public static MediaType Register(MediaType type)
    {
        TypesByExtension[type.Extension] = type;
        foreach (var alt in type.AltExtensions)
        {
            TypesByExtension[alt] = type;
        }
        TypesByMimeType[type.MimeType] = type;
        return type;
    }

    /// <summary>Core image media types.</summary>
    public static MediaType ImagePng = Register(new("png", "image/png", MediaMetaType.Image)),
        ImageJpg = Register(new("jpg", "image/jpeg", MediaMetaType.Image, ["jpeg"])),
        ImageBmp = Register(new("bmp", "image/bmp", MediaMetaType.Image)),
        ImageTiff = Register(new("tiff", "image/tiff", MediaMetaType.Image, ["tif"])),
        ImageAvif = Register(new("avif", "image/avif", MediaMetaType.Image));

    /// <summary>Core animation media types.</summary>
    public static MediaType ImageGif = Register(new("gif", "image/gif", MediaMetaType.Animation)),
        ImageWebp = Register(new("webp", "image/webp", MediaMetaType.Animation));

    /// <summary>Core video media types.</summary>
    public static MediaType VideoMp4 = Register(new("mp4", "video/mp4", MediaMetaType.Video)),
        VideoWebm = Register(new("webm", "video/webm", MediaMetaType.Video)),
        VideoMov = Register(new("mov", "video/quicktime", MediaMetaType.Video, ["video/mov"]));

    /// <summary>Core audio media types.</summary>
    public static MediaType AudioMp3 = Register(new("mp3", "audio/mpeg", MediaMetaType.Audio)),
        AudioWav = Register(new("wav", "audio/wav", MediaMetaType.Audio, ["audio/wave", "audio/x-wav"])),
        AudioOgg = Register(new("ogg", "audio/ogg", MediaMetaType.Audio)),
        AudioFlac = Register(new("flac", "audio/flac", MediaMetaType.Audio)),
        AudioAac = Register(new("aac", "audio/aac", MediaMetaType.Audio));

    /// <summary>Core text media types.</summary>
    public static MediaType TextTxt = Register(new("txt", "text/plain", MediaMetaType.Text));

    /// <inheritdoc/>
    public override string ToString()
    {
        return $"MediaType: {Extension} ({MimeType})";
    }
}
