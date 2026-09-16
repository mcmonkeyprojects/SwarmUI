namespace SwarmUI.Media;

/// <summary>A bounded section of an edited media timeline.</summary>
public class MediaEditorSection(double start, double end, bool excluded = false, float volume = 1)
{
    /// <summary>Section start time in seconds.</summary>
    public double Start = start;

    /// <summary>Section end time in seconds.</summary>
    public double End = end;

    /// <summary>Whether this section is omitted from the edited output.</summary>
    public bool Excluded = excluded;

    /// <summary>Audio volume multiplier for this section.</summary>
    public float Volume = volume;
}
