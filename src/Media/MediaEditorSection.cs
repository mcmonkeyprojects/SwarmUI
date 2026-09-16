namespace SwarmUI.Media;

/// <summary>A bounded section of an edited media timeline.</summary>
public class MediaEditorSection
{
    /// <summary>Section start time in seconds.</summary>
    public double Start;

    /// <summary>Section end time in seconds.</summary>
    public double End;

    /// <summary>Whether this section is omitted from the edited output.</summary>
    public bool Excluded;

    public MediaEditorSection(double start, double end, bool excluded)
    {
        Start = start;
        End = end;
        Excluded = excluded;
    }
}
