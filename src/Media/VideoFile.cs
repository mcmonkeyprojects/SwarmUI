using FreneticUtilities.FreneticExtensions;

namespace SwarmUI.Media;

/// <summary>A video file (eg mp4) containing image data, audio data, metadata, and possibly other sub-streams of data.</summary>
public class VideoFile : MediaFile
{
    /// <summary>Creates a video object from a web video data URL string.</summary>
    public static VideoFile FromDataString(string data)
    {
        byte[] raw = Convert.FromBase64String(data.After(";base64,"));
        string mimeType = data.Before(";base64,").After("data:");
        return new VideoFile(raw, MediaType.TypesByMimeType.GetValueOrDefault(mimeType) ?? new(mimeType.After('/'), mimeType, MediaMetaType.Video));
    }

    /// <summary>Creates a video object from a base64 string and media type.</summary>
    public static VideoFile FromBase64(string b64, MediaType type)
    {
        byte[] raw = Convert.FromBase64String(b64);
        return new VideoFile(raw, type);
    }

    /// <summary>Construct the video instance from raw data and a media type.</summary>
    public VideoFile(byte[] data, MediaType type)
    {
        RawData = data;
        Type = type;
    }
}
