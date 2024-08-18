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
            [$"{prefix}is_supported_model_format"] = RawFilePath.EndsWith(".safetensors") || RawFilePath.EndsWith(".sft") || RawFilePath.EndsWith(".engine"),
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
        using (FileStream _ = GetSafetensorsHeaderAndReaderFrom(modelPath, out string headerJson, out int _))
        {
            return headerJson;
        }
    }

    /// <summary>Get the safetensors header string, a filestream reader for the file, and the index where the body starts in the file.</summary>
    public static FileStream GetSafetensorsHeaderAndReaderFrom(string modelPath, out string headerJson, out int fileBodyStartIndex)
    {
        headerJson = null;
        fileBodyStartIndex = -1;

        FileStream localFileStream = null;
        try
        {
            localFileStream = File.OpenRead(modelPath);
            byte[] lengthBuffer = new byte[8];
            localFileStream.ReadExactly(lengthBuffer, 0, 8);
            long headerLength = BitConverter.ToInt64(lengthBuffer, 0);
            if (headerLength < 0 || headerLength > 100 * 1024 * 1024)
            {
                throw new SwarmReadableErrorException($"Invalid safetensors file {modelPath}. Wrong file type, or unreasonable header length: {headerLength}");
            }
            byte[] dataBuffer = new byte[headerLength];
            localFileStream.ReadExactly(dataBuffer, 0, (int)headerLength);
            headerJson = Encoding.UTF8.GetString(dataBuffer);
            fileBodyStartIndex = (int)localFileStream.Position;
            // Return filestream without disposing.
            FileStream outFileStream = localFileStream;
            localFileStream = null;
            return outFileStream;
        }
        finally
        {
            localFileStream?.Dispose();
        }
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

    /// <summary>Gets or generates this model's SHA256 hash. Returns the hash and whether the returned hash is a new value.</summary>
    public async Task<(string, bool)> GetOrGenerateHash(bool forceGenerateHash = false)
    {
        string hash = Metadata?.Hash;
        bool usingCachedValue = true;
        bool normalizeHash = true;
        if (forceGenerateHash || hash is null || !Utilities.IsValidSHA256Hash(hash, false))
        {
            usingCachedValue = false;
            if (forceGenerateHash)
            {
                hash = GenerateHashFromFile(RawFilePath);
                normalizeHash = false;
            }
            else
            {
                using FileStream reader = GetSafetensorsHeaderAndReaderFrom(RawFilePath, out string headerJsonString, out int fileBodyStartIndex);
                JObject json = JObject.Parse(headerJsonString);
                JObject metaHeader = (json["__metadata__"] as JObject) ?? [];
                hash = metaHeader?.Value<string>("modelspec.hash_sha256") ?? metaHeader?.Value<string>("hash_sha256");
                if (hash is null || !Utilities.IsValidSHA256Hash(hash, false))
                {
                    hash = GenerateHashFromFile(reader, fileBodyStartIndex);
                    normalizeHash = false;
                }
            }
        }
        // If our hash was not just generated, normalize it to have the '0x' prefix and be all lowercase
        if (normalizeHash)
        {
            string normalizedHash = hash.StartsWithFast("0x") ? hash.ToLowerFast() : "0x" + hash.ToLowerFast();
            return (normalizedHash, !usingCachedValue || normalizedHash != hash);
        }
        else
        {
            return (hash, !usingCachedValue);
        }
    }

    /// <summary>Generates the file's data hash for a safetensor model at the specified path.</summary>
    public static string GenerateHashFromFile(string modelPath)
    {
        using (FileStream fileStream = GetSafetensorsHeaderAndReaderFrom(modelPath, out string _, out int fileBodyStartIndex))
        {
            return GenerateHashFromFile(fileStream, fileBodyStartIndex);
        }
    }

    /// <summary>Generates a file's data hash for a safetensor model being read by the file reader.</summary>
    public static string GenerateHashFromFile(FileStream reader, int fileStartIndex)
    {
        reader.Seek(fileStartIndex, SeekOrigin.Begin);
        return "0x" + Utilities.HashSHA256(reader);
    }
}
