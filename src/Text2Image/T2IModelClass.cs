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

    /// <summary>If true, loras may target the text encoder. If false, they never do.</summary>
    public bool LorasTargetTextEnc = true;
}
