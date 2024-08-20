using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;
using SwarmUI.Utils;
using System.IO;

namespace SwarmUI.Text2Image;

/// <summary>Represents the basic data around an (unloaded) Text2Image model.</summary>
public class T2IModel
{
    /// <summary>Path to the main folder this is inside of.</summary>
    public string OriginatingFolderPath;

    /// <summary>Name/ID of the model.</summary>
    public string Name;

    /// <summary>Full raw system filepath to this model.</summary>
    public string RawFilePath;

    /// <summary>Proper title of the model, if identified.</summary>
    public string Title;

    /// <summary>Description text, if any, of the model.</summary>
    public string Description;

    /// <summary>URL or data blob of a preview image for this model.</summary>
    public string PreviewImage;

    /// <summary>This model's standard resolution, eg 1024x1024. 0 means unknown.</summary>
    public int StandardWidth, StandardHeight;

    /// <summary>If true, at least one backend has this model currently loaded.</summary>
    public bool AnyBackendsHaveLoaded = false;

    /// <summary>What class this model is, if known.</summary>
    public T2IModelClass ModelClass;

    /// <summary>Metadata about this model.</summary>
    public T2IModelHandler.ModelMetadataStore Metadata;

    /// <summary>Set of all model file extensions that are considered natively supported.</summary>
    public static HashSet<string> NativelySupportedModelExtensions = ["safetensors", "sft", "engine", "gguf"];

    /// <summary>Gets a networkable copy of this model's data.</summary>
    public JObject ToNetObject(string prefix = "")
    {
        return new JObject()
        {
            [$"{prefix}name"] = Name,
            [$"{prefix}title"] = Metadata?.Title,
            [$"{prefix}author"] = Metadata?.Author,
            [$"{prefix}description"] = Description,
            [$"{prefix}preview_image"] = PreviewImage,
            [$"{prefix}loaded"] = AnyBackendsHaveLoaded,
            [$"{prefix}architecture"] = ModelClass?.ID,
            [$"{prefix}class"] = ModelClass?.Name,
            [$"{prefix}compat_class"] = ModelClass?.CompatClass,
            [$"{prefix}resolution"] = $"{StandardWidth}x{StandardHeight}",
            [$"{prefix}standard_width"] = StandardWidth,
            [$"{prefix}standard_height"] = StandardHeight,
            [$"{prefix}license"] = Metadata?.License,
            [$"{prefix}date"] = Metadata?.Date,
            [$"{prefix}prediction_type"] = Metadata?.PredictionType,
            [$"{prefix}usage_hint"] = Metadata?.UsageHint,
            [$"{prefix}trigger_phrase"] = Metadata?.TriggerPhrase,
            [$"{prefix}merged_from"] = Metadata?.MergedFrom,
            [$"{prefix}tags"] = Metadata?.Tags is null ? null : new JArray(Metadata.Tags),
            [$"{prefix}is_supported_model_format"] = NativelySupportedModelExtensions.Contains(RawFilePath.AfterLast('.')),
            [$"{prefix}is_negative_embedding"] = Metadata?.IsNegativeEmbedding ?? false,
            [$"{prefix}local"] = true,
            [$"{prefix}time_created"] = Metadata?.TimeCreated ?? 0,
            [$"{prefix}time_modified"] = Metadata?.TimeModified ?? 0,
            [$"{prefix}hash"] = Metadata?.Hash ?? "",
            [$"{prefix}hash_sha256"] = Metadata?.Hash ?? "",
            [$"{prefix}special_format"] = Metadata?.SpecialFormat ?? ""
        };
    }

    public static T2IModel FromNetObject(JObject data)
    {
        return new T2IModel()
        {
            Name = $"{data["name"]}",
            Title = $"{data["title"]}",
            Description = $"{data["description"]}",
            PreviewImage = $"{data["preview_image"]}",
            AnyBackendsHaveLoaded = (bool)data["loaded"],
            ModelClass = T2IModelClassSorter.ModelClasses.GetValueOrDefault($"{data["architecture"]}") ?? null,
            StandardWidth = (int)data["standard_width"],
            StandardHeight = (int)data["standard_height"]
        };
    }

    /// <summary>Get the safetensors header from a model.</summary>
    public static string GetSafetensorsHeaderFrom(string modelPath)
    {
        using FileStream file = File.OpenRead(modelPath);
        byte[] lenBuf = new byte[8];
        file.ReadExactly(lenBuf, 0, 8);
        long len = BitConverter.ToInt64(lenBuf, 0);
        if (len < 0 || len > 100 * 1024 * 1024)
        {
            throw new SwarmReadableErrorException($"Improper safetensors file {modelPath}. Wrong file type, or unreasonable header length: {len}");
        }
        byte[] dataBuf = new byte[len];
        file.ReadExactly(dataBuf, 0, (int)len);
        return Encoding.UTF8.GetString(dataBuf);
    }

    /// <summary>Returns the name of the model.</summary>
    public string ToString(string folderFormat)
    {
        return Name.Replace("/", folderFormat ?? $"{Path.DirectorySeparatorChar}");
    }

    /// <summary>Returns the name of the model.</summary>
    public override string ToString()
    {
        return Name.Replace('/', Path.DirectorySeparatorChar);
    }
}
