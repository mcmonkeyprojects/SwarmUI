using FreneticUtilities.FreneticExtensions;

namespace SwarmUI.Media;

/// <summary>A simple audio file (eg mp3, wav).</summary>
public class AudioFile : MediaFile
{
    /// <summary>Creates an audio object from a web audio data URL string.</summary>
    public static AudioFile FromDataString(string data)
    {
        byte[] raw = Convert.FromBase64String(data.After(";base64,"));
        string mimeType = data.Before(";base64,").After("data:");
        return new AudioFile(raw, MediaType.TypesByMimeType.GetValueOrDefault(mimeType) ?? new(mimeType.After('/'), mimeType, MediaMetaType.Audio));
    }

    /// <summary>Creates an audio object from a base64 string and media type.</summary>
    public static AudioFile FromBase64(string b64, MediaType type)
    {
        byte[] raw = Convert.FromBase64String(b64);
        return new AudioFile(raw, type);
    }

    /// <summary>Construct the audio instance from raw data and a media type.</summary>
    public AudioFile(byte[] data, MediaType type)
    {
        RawData = data;
        Type = type;
    }
}
