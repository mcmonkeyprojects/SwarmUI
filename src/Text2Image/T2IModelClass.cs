using Newtonsoft.Json.Linq;

namespace SwarmUI.Text2Image;

/// <summary>Represents a class of models (eg SDv1).</summary>
public record class T2IModelClass
{
    /// <summary>Standard resolution for this model class.</summary>
    public int StandardWidth, StandardHeight;

    /// <summary>ID of this model type.</summary>
    public string ID;

    /// <summary>A clean name for this model class.</summary>
    public string Name;

    /// <summary>An identifier for a compatibility-class this class falls within (eg all SDv1 classes have the same compat class).</summary>
    public T2IModelCompatClass CompatClass;

    /// <summary>Matcher, return true if the model x safetensors header is the given class, or false if not.</summary>
    public Func<T2IModel, JObject, bool> IsThisModelOfClass;
}

public record class T2IModelCompatClass
{
    /// <summary>ID of this model compat type.</summary>
    public string ID;

    /// <summary>A short label for this compat class, usually 4 letters long (but not always), used for quick previewing model types in UI.</summary>
    public string ShortCode;

    /// <summary>If true, loras may target the text encoder. If false, they never do.</summary>
    public bool LorasTargetTextEnc = true;

    /// <summary>If true, this class group can input text and output video. May be over-broad.</summary>
    public bool IsText2Video = false;

    /// <summary>If true, this class group can input an image and output video. May be over-broad.</summary>
    public bool IsImage2Video = false;
}
