namespace SwarmUI.Media;

/// <summary>Base class, represents a single media data file.</summary>
public class MediaFile
{
    /// <summary>The raw binary data.</summary>
    public byte[] RawData;

    /// <summary>The file type.</summary>
    public MediaType Type;

    /// <summary>Get a Base64 string representation of the raw image data. This does a conversion on call, so use sparingly.</summary>
    public string AsBase64 => Convert.ToBase64String(RawData);

    /// <summary>Gets a valid web data string for this image, eg 'data:image/png;base64,abc123'.</summary>
    public string AsDataString()
    {
        return $"data:{Type.MimeType};base64,{AsBase64}";
    }

    /// <inheritdoc/>
    public override string ToString()
    {
        return $"MediaFile({Type}, {RawData.Length} bytes)";
    }
}
