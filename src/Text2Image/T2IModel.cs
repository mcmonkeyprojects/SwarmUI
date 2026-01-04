using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.IO;
using System.Security.Cryptography;

namespace SwarmUI.Text2Image;

/// <summary>Represents the basic data around an (unloaded) Text2Image model.</summary>
public class T2IModel(T2IModelHandler handler, string folderPath, string filePath, string name)
{
    /// <summary>The backing handler that this model came from.</summary>
    public T2IModelHandler Handler = handler;

    /// <summary>Path to the main folder this is inside of.</summary>
    public string OriginatingFolderPath = folderPath;

    /// <summary>Name/ID of the model.</summary>
    public string Name = name;

    /// <summary>Full raw system filepath to this model.</summary>
    public string RawFilePath = filePath;

    /// <summary>True if this model is a supported type (eg safetensors), false if it's an unsupportable type (eg legacy ckpt).</summary>
    public bool IsSupportedModelType = NativelySupportedModelExtensions.Contains((filePath ?? "").AfterLast('.'));

    /// <summary>If multiple copies of this model exist, these are other paths to that model.</summary>
    public List<string> OtherPaths = [];

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

    /// <summary>Set of all model file extensions that are considered supported for legacy reasons only.</summary>
    public static HashSet<string> LegacyModelExtensions = ["ckpt", "pt", "pth", "bin"];

    /// <summary>Returns true if this is a 'diffusion_models' model instead of a regular checkpoint model.</summary>
    public bool IsDiffusionModelsFormat
    {
        get
        {
            string cleaned = OriginatingFolderPath.Replace('\\', '/').TrimEnd('/').ToLowerFast();
            return cleaned.EndsWithFast("/unet") || cleaned.EndsWithFast("/diffusion_models"); // Hacky but it works for now
        }
    }

    /// <summary>Returns the model's SHA-256 Tensor Hash - either from metadata, or by generating it from the file.
    /// Returns null if hashing is impossible (no handler, no metadata construct, no source file).
    /// Can optionally update cache and/or file when generating.</summary>
    /// <param name="updateCache">If true, the model data cache will be updated if the hash is calculated. Only set false if you're going to update the cache after.</param>
    /// <param name="resave">If true, the model file data will be updated if the hash is calculated. Only set false if you're going to update the file after.</param>
    /// <returns></returns>
    public string GetOrGenerateTensorHashSha256(bool updateCache = true, bool resave = true)
    {
        if (Metadata?.Hash is not null)
        {
            return Metadata.Hash;
        }
        if (Metadata is null || Handler is null || RawFilePath is null)
        {
            return null;
        }
        if (RawFilePath.EndsWith(".gguf"))
        {
            // TODO: Pick an appropriate hashing method for GGUF files. Should we still do a tensorhash, or swap to full file hash for gguf?
            return null;
        }
        if (!RawFilePath.EndsWith(".safetensors") && !RawFilePath.EndsWith(".sft"))
        {
            return null;
        }
        lock (Handler.ModificationLock)
        {
            if (Metadata.Hash is not null)
            {
                return Metadata.Hash;
            }
            using FileStream reader = File.OpenRead(RawFilePath);
            byte[] headerLen = new byte[8];
            reader.ReadExactly(headerLen, 0, 8);
            long len = BitConverter.ToInt64(headerLen, 0);
            if (len < 0 || len > 100 * 1024 * 1024)
            {
                return null;
            }
            reader.Seek(8 + len, SeekOrigin.Begin);
            string hash = "0x" + Utilities.BytesToHex(SHA256.HashData(reader));
            Metadata.Hash = hash;
            if (updateCache)
            {
                Handler.ResetMetadataFrom(this);
            }
            if (resave)
            {
                ResaveModel(reader);
            }
            return hash;
        }
    }

    /// <summary>Resaves the model's metadata to file (ie safetensors header, or companion json file).</summary>
    public void ResaveModel(FileStream reader = null)
    {
        lock (Handler.ModificationLock)
        {
            if (Metadata is null)
            {
                return;
            }
            string rawFilePrefix = RawFilePath.BeforeLast('.');
            string rawSwarmJsPath = $"{rawFilePrefix}.swarm.json";
            bool earlyEnd = (!RawFilePath.EndsWith(".safetensors") && !RawFilePath.EndsWith(".sft")) || Program.ServerSettings.Metadata.EditMetadataWriteJSON;
            void DoClear(string path)
            {
                string filePrefix = path.BeforeLast('.');
                string swarmjspath = $"{filePrefix}.swarm.json";
                if (File.Exists(swarmjspath))
                {
                    File.Delete(swarmjspath);
                }
                if (Program.ServerSettings.Paths.ClearStrayModelData)
                {
                    foreach (string altPath in T2IModelHandler.AllModelAttachedExtensions)
                    {
                        if (File.Exists($"{filePrefix}{altPath}"))
                        {
                            File.Delete($"{filePrefix}{altPath}");
                        }
                    }
                }
                if (earlyEnd)
                {
                    File.WriteAllText(swarmjspath, ToNetObject("modelspec.").ToString());
                }
            }
            DoClear(RawFilePath);
            if (Program.ServerSettings.Paths.EditMetadataAcrossAllDups)
            {
                foreach (string altPath in OtherPaths)
                {
                    DoClear(altPath);
                }
            }
            if (earlyEnd)
            {
                Logs.Debug($"Intentionally not reapplying metadata for model '{RawFilePath}', stored as json instead");
                return;
            }
            Logs.Debug($"Will reapply metadata for model '{RawFilePath}'");
            bool wasNull = reader is null;
            reader ??= File.OpenRead(RawFilePath);
            try
            {
                Logs.Verbose("Metadata resave: begin header read");
                reader.Seek(0, SeekOrigin.Begin);
                byte[] headerLen = new byte[8];
                reader.ReadExactly(headerLen, 0, 8);
                long len = BitConverter.ToInt64(headerLen, 0);
                if (len < 0 || len > 100 * 1024 * 1024)
                {
                    Logs.Warning($"Model {Name} has invalid metadata length {len}, failing to store metadata, will place json copy in main folder.");
                    File.WriteAllText(rawSwarmJsPath, ToNetObject("modelspec.").ToString());
                    return;
                }
                byte[] header = new byte[len];
                reader.ReadExactly(header, 0, (int)len);
                string headerStr = Encoding.UTF8.GetString(header);
                JObject json = JObject.Parse(headerStr);
                JObject metaHeader = (json["__metadata__"] as JObject) ?? [];
                if (Metadata.Hash is null)
                {
                    Logs.Verbose("Metadata resave: must rebuild hash");
                    // Metadata fix for when we generated hashes into the file metadata headers, but did not save them into the metadata cache
                    Metadata.Hash = (metaHeader?.ContainsKey("modelspec.hash_sha256") ?? false) ? metaHeader.Value<string>("modelspec.hash_sha256") : "0x" + Utilities.BytesToHex(SHA256.HashData(reader));
                    Logs.Verbose("Metadata resave: do metadata reset for hash");
                    Handler.ResetMetadataFrom(this);
                }
                void specSet(string key, string val)
                {
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        metaHeader[$"modelspec.{key}"] = val;
                    }
                    else
                    {
                        metaHeader.Remove($"modelspec.{key}");
                    }
                }
                void specSetEmptyable(string key, string val)
                {
                    if (val is not null)
                    {
                        metaHeader[$"modelspec.{key}"] = val;
                    }
                    else
                    {
                        metaHeader.Remove($"modelspec.{key}");
                    }
                }
                Logs.Verbose("Metadata resave: refill data");
                specSet("sai_model_spec", "1.0.0");
                specSet("title", Metadata.Title);
                specSet("architecture", Metadata.ModelClassType);
                specSet("author", Metadata.Author);
                specSet("description", Metadata.Description);
                specSet("thumbnail", Metadata.PreviewImage);
                specSet("license", Metadata.License);
                specSetEmptyable("usage_hint", Metadata.UsageHint);
                specSetEmptyable("trigger_phrase", Metadata.TriggerPhrase);
                specSetEmptyable("tags", Metadata.Tags is null ? null : string.Join(",", Metadata.Tags));
                specSet("merged_from", Metadata.MergedFrom);
                specSet("date", Metadata.Date);
                specSet("preprocessor", Metadata.Preprocessor);
                specSet("resolution", $"{Metadata.StandardWidth}x{Metadata.StandardHeight}");
                specSet("prediction_type", Metadata.PredictionType);
                specSet("hash_sha256", Metadata.Hash);
                if (Metadata.IsNegativeEmbedding)
                {
                    specSet("is_negative_embedding", "true");
                }
                specSetEmptyable("lora_default_weight", Metadata.LoraDefaultWeight);
                specSetEmptyable("lora_default_confinement", Metadata.LoraDefaultConfinement);
                metaHeader["__spacer"] = "";
                byte[] encode()
                {
                    json["__metadata__"] = metaHeader;
                    return Encoding.UTF8.GetBytes(json.ToString(Newtonsoft.Json.Formatting.None));
                }
                byte[] headerBytes = encode();
                void HandleResave(string path)
                {
                    if (reader is null)
                    {
                        Logs.Verbose("Metadata resave: fresh open model source file");
                        reader = File.OpenRead(path);
                        reader.Seek(0, SeekOrigin.Begin);
                        byte[] headerLen = new byte[8];
                        reader.ReadExactly(headerLen, 0, 8);
                        len = BitConverter.ToInt64(headerLen, 0);
                    }
                    Logs.Verbose($"Metadata resave: file at '{path}', header len is {len}, will save new header len {headerBytes.Length}");
                    if (headerBytes.Length <= len)
                    {
                        Logs.Verbose("Metadata resave: direct update header");
                        metaHeader["__spacer"] = new string(' ', (int)(len - headerBytes.Length));
                        headerBytes = encode();
                        reader.Dispose();
                        using FileStream writer = File.OpenWrite(path);
                        writer.Seek(8, SeekOrigin.Begin);
                        writer.Write(headerBytes);
                        writer.Flush();
                        Logs.Debug($"Completed metadata direct-update for {path}");
                        return;
                    }
                    metaHeader["__spacer"] = new string(' ', Program.ServerSettings.Metadata.ModelMetadataSpacerKilobytes * 1024);
                    headerBytes = encode();
                    Logs.Verbose("Metadata resave: write .tmp file");
                    using (FileStream writer = File.OpenWrite(path + ".tmp"))
                    {
                        writer.Write(BitConverter.GetBytes(headerBytes.LongLength));
                        writer.Write(headerBytes);
                        reader.Seek(8 + len, SeekOrigin.Begin);
                        reader.CopyTo(writer);
                        reader.Dispose();
                        reader = null;
                    }
                    Logs.Verbose("Metadata resave: do journal swap");
                    // Journalling replace to prevent data loss in event of a crash.
                    DateTime createTime = File.GetCreationTimeUtc(path);
                    File.Move(path, path + ".tmp2");
                    File.Move(path + ".tmp", path);
                    File.Delete(path + ".tmp2");
                    File.SetCreationTimeUtc(path, createTime);
                    Logs.Debug($"Completed metadata update for {path}");
                }
                HandleResave(RawFilePath);
                if (Program.ServerSettings.Paths.EditMetadataAcrossAllDups)
                {
                    foreach (string altPath in OtherPaths)
                    {
                        Logs.Verbose($"Metadata resave: apply to altpath: {altPath}");
                        HandleResave(altPath);
                    }
                }
            }
            finally
            {
                if (wasNull)
                {
                    reader?.Dispose();
                }
            }
        }
    }

    /// <summary>Gets a networkable copy of this model's data.</summary>
    public JObject ToNetObject(string prefix = "", bool dataImgs = true)
    {
        string previewImg = PreviewImage;
        if (!dataImgs && previewImg is not null && previewImg.StartsWithFast("data:"))
        {
            previewImg = $"/ViewSpecial/{Handler.ModelType}/{Name}?editid={ModelsAPI.ModelEditID}";
        }
        return new JObject()
        {
            [$"{prefix}name"] = Name,
            [$"{prefix}title"] = Metadata?.Title,
            [$"{prefix}author"] = Metadata?.Author,
            [$"{prefix}description"] = Description,
            [$"{prefix}preview_image"] = previewImg,
            [$"{prefix}loaded"] = AnyBackendsHaveLoaded,
            [$"{prefix}architecture"] = ModelClass?.ID,
            [$"{prefix}class"] = ModelClass?.Name,
            [$"{prefix}compat_class"] = ModelClass?.CompatClass?.ID,
            [$"{prefix}resolution"] = $"{StandardWidth}x{StandardHeight}",
            [$"{prefix}standard_width"] = StandardWidth <= 0 ? ModelClass?.StandardWidth ?? 0 : StandardWidth,
            [$"{prefix}standard_height"] = StandardHeight <= 0 ? ModelClass?.StandardHeight ?? 0 : StandardHeight,
            [$"{prefix}license"] = Metadata?.License,
            [$"{prefix}date"] = Metadata?.Date,
            [$"{prefix}prediction_type"] = Metadata?.PredictionType,
            [$"{prefix}usage_hint"] = Metadata?.UsageHint,
            [$"{prefix}trigger_phrase"] = Metadata?.TriggerPhrase,
            [$"{prefix}merged_from"] = Metadata?.MergedFrom,
            [$"{prefix}tags"] = Metadata?.Tags is null ? null : new JArray(Metadata.Tags),
            [$"{prefix}is_supported_model_format"] = IsSupportedModelType,
            [$"{prefix}is_negative_embedding"] = Metadata?.IsNegativeEmbedding ?? false,
            [$"{prefix}lora_default_weight"] = Metadata?.LoraDefaultWeight ?? "",
            [$"{prefix}lora_default_confinement"] = Metadata?.LoraDefaultConfinement ?? "",
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
        return new T2IModel(null, null, null, $"{data["name"]}")
        {
            Title = $"{data["title"]}",
            Description = $"{data["description"]}",
            PreviewImage = $"{data["preview_image"]}",
            AnyBackendsHaveLoaded = (bool)data["loaded"],
            ModelClass = T2IModelClassSorter.ModelClasses.GetValueOrDefault($"{data["architecture"]}".ToLowerFast()) ?? null,
            StandardWidth = (int)data["standard_width"],
            StandardHeight = (int)data["standard_height"],
            IsSupportedModelType = (bool)(data?["is_supported_model_format"] ?? false)
        };
    }

    /// <summary>Data types for GGUF metadata values.</summary>
    public enum GGUFMetadataValueType : int
    {
        UINT8 = 0,
        INT8 = 1,
        UINT16 = 2,
        INT16 = 3,
        UINT32 = 4,
        INT32 = 5,
        FLOAT32 = 6,
        BOOL = 7,
        STRING = 8,
        ARRAY = 9,
        UINT64 = 10,
        INT64 = 11,
        FLOAT64 = 12
    }

    public static JToken ReadRawGGUFObject(Stream file, string modelPath, int keyId, GGUFMetadataValueType type, byte[] buf)
    {
        switch (type)
        {
            case GGUFMetadataValueType.UINT8: return file.ReadByte();
            case GGUFMetadataValueType.INT8: return (sbyte)file.ReadByte();
            case GGUFMetadataValueType.UINT16:
                file.ReadExactly(buf, 0, 2);
                return BitConverter.ToUInt16(buf, 0);
            case GGUFMetadataValueType.INT16:
                file.ReadExactly(buf, 0, 2);
                return BitConverter.ToInt16(buf, 0);
            case GGUFMetadataValueType.UINT32:
                file.ReadExactly(buf, 0, 4);
                return BitConverter.ToUInt32(buf, 0);
            case GGUFMetadataValueType.INT32:
                file.ReadExactly(buf, 0, 4);
                return BitConverter.ToInt32(buf, 0);
            case GGUFMetadataValueType.UINT64:
                file.ReadExactly(buf, 0, 8);
                return BitConverter.ToUInt64(buf, 0);
            case GGUFMetadataValueType.INT64:
                file.ReadExactly(buf, 0, 8);
                return BitConverter.ToInt64(buf, 0);
            case GGUFMetadataValueType.FLOAT32:
                file.ReadExactly(buf, 0, 4);
                return BitConverter.ToSingle(buf, 0);
            case GGUFMetadataValueType.FLOAT64:
                file.ReadExactly(buf, 0, 8);
                return BitConverter.ToDouble(buf, 0);
            case GGUFMetadataValueType.BOOL:
                return file.ReadByte() != 0;
            case GGUFMetadataValueType.STRING:
                file.ReadExactly(buf, 0, 8);
                long valStrLen = BitConverter.ToInt64(buf, 0);
                if (valStrLen < 0 || valStrLen > 100 * 1024 * 1024)
                {
                    throw new SwarmReadableErrorException($"Improper GGUF file {modelPath}. Unreasonable metadata value string length: {valStrLen} (for metadata key {keyId})");
                }
                byte[] strBuf = new byte[valStrLen];
                file.ReadExactly(strBuf, 0, (int)valStrLen);
                return Encoding.UTF8.GetString(strBuf);
            case GGUFMetadataValueType.ARRAY:
                file.ReadExactly(buf, 0, 4);
                int subtype = BitConverter.ToInt32(buf, 0);
                if (subtype < 0 || subtype > 12)
                {
                    throw new SwarmReadableErrorException($"Improper GGUF file {modelPath}. Unreasonable metadata array subtype: {subtype} (for metadata key {keyId})");
                }
                file.ReadExactly(buf, 0, 8);
                long arrayLen = BitConverter.ToInt64(buf, 0);
                if (arrayLen < 0 || arrayLen > 100 * 1024 * 1024)
                {
                    throw new SwarmReadableErrorException($"Improper GGUF file {modelPath}. Unreasonable metadata array length: {arrayLen} (for metadata key {keyId})");
                }
                JArray array = [];
                for (int i = 0; i < arrayLen; i++)
                {
                    array.Add(ReadRawGGUFObject(file, modelPath, keyId, (GGUFMetadataValueType)subtype, buf));
                }
                return array;
        }
        throw new InvalidOperationException("(Unreachable / bad GGUF metadata type)");
    }

    /// <summary>Get the safetensors or gguf header from a model. Return includes "__metadata__" key with metadata key:value map, other data at root.</summary>
    public static JObject GetMetadataHeaderFrom(string modelPath)
    {
        using FileStream file = File.OpenRead(modelPath);
        if (file.Length < 8)
        {
            throw new SwarmReadableErrorException($"Improper file {modelPath}. File too short to be valid (file length = {file.Length}. May be filesystem issue, or an incomplete download?)");
        }
        byte[] buf = new byte[8];
        if (modelPath.EndsWith(".gguf"))
        {
            file.ReadExactly(buf, 0, 4);
            if (buf[0] != 0x47 || buf[1] != 0x47 || buf[2] != 0x55 || buf[3] != 0x46)
            {
                throw new SwarmReadableErrorException($"Improper GGUF file {modelPath}. Wrong file type? Header should be GGUF, but is {buf[0]:X} {buf[1]:X} {buf[2]:X} {buf[3]:X}");
            }
            file.ReadExactly(buf, 0, 4);
            int ggufVers = BitConverter.ToInt32(buf, 0);
            file.ReadExactly(buf, 0, 8);
            long tensorCount = BitConverter.ToInt64(buf, 0);
            file.ReadExactly(buf, 0, 8);
            long metaKvCount = BitConverter.ToInt64(buf, 0);
            JObject metadata = [];
            JObject result = new()
            {
                ["gguf_version"] = ggufVers,
                ["tensor_count"] = tensorCount
            };
            for (int i = 0; i < metaKvCount; i++)
            {
                file.ReadExactly(buf, 0, 8);
                long keyStrLen = BitConverter.ToInt64(buf, 0);
                if (keyStrLen < 0 || keyStrLen > 100 * 1024 * 1024)
                {
                    throw new SwarmReadableErrorException($"Improper GGUF file {modelPath}. Unreasonable metadata key length: {keyStrLen} (for metadata key {i})");
                }
                byte[] keyStrBuf = new byte[keyStrLen];
                file.ReadExactly(keyStrBuf, 0, (int)keyStrLen);
                string keyStr = Encoding.UTF8.GetString(keyStrBuf);
                file.ReadExactly(buf, 0, 4);
                int valType = BitConverter.ToInt32(buf, 0);
                if (valType < 0 || valType > 12)
                {
                    throw new SwarmReadableErrorException($"Improper GGUF file {modelPath}. Unreasonable metadata value type: {valType} (for metadata key {i})");
                }
                JToken val = ReadRawGGUFObject(file, modelPath, i, (GGUFMetadataValueType)valType, buf);
                metadata[keyStr] = val;
            }
            for (int i = 0; i < tensorCount; i++)
            {
                file.ReadExactly(buf, 0, 8);
                long tensorNameLen = BitConverter.ToInt64(buf, 0);
                if (tensorNameLen < 0 || tensorNameLen > 100 * 1024 * 1024)
                {
                    throw new SwarmReadableErrorException($"Improper GGUF file {modelPath}. Unreasonable tensor name length: {tensorNameLen} (for tensor {i})");
                }
                byte[] tensorNameBuf = new byte[tensorNameLen];
                file.ReadExactly(tensorNameBuf, 0, (int)tensorNameLen);
                string tensorName = Encoding.UTF8.GetString(tensorNameBuf);
                file.ReadExactly(buf, 0, 4);
                int nDimensions = BitConverter.ToInt32(buf, 0);
                if (nDimensions < 0 || nDimensions > 100)
                {
                    throw new SwarmReadableErrorException($"Improper GGUF file {modelPath}. Unreasonable tensor dimension count: {nDimensions} (for tensor {i})");
                }
                ulong[] dims = new ulong[nDimensions];
                ulong totalLen = 1; // TODO: Dtype width
                for (int j = 0; j < nDimensions; j++)
                {
                    file.ReadExactly(buf, 0, 8);
                    dims[j] = BitConverter.ToUInt64(buf, 0);
                    totalLen *= dims[j];
                }
                file.ReadExactly(buf, 0, 4);
                int dtype = BitConverter.ToInt32(buf, 0);
                file.ReadExactly(buf, 0, 8);
                ulong dataOffset = BitConverter.ToUInt64(buf, 0);
                JObject tensor = new()
                {
                    ["dtype"] = dtype,
                    ["shape"] = new JArray(dims),
                    ["data_offsets"] = new JArray() { dataOffset, dataOffset + totalLen }
                };
                result[tensorName] = tensor;
            }
            result["__metadata__"] = metadata;
            return result;
        }
        // Otherwise, safetensors
        file.ReadExactly(buf, 0, 8);
        long len = BitConverter.ToInt64(buf, 0);
        if (len < 0 || len > 100 * 1024 * 1024)
        {
            throw new SwarmReadableErrorException($"Improper safetensors file {modelPath}. Wrong file type, or unreasonable header length: {len}");
        }
        byte[] dataBuf = new byte[len];
        file.ReadExactly(dataBuf, 0, (int)len);
        string rawJson = Encoding.UTF8.GetString(dataBuf);
        return rawJson.ParseToJson();
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

    public static AsciiMatcher DangerousModelNameChars = new("\n\t,%*\"<>");

    /// <summary>Display any necessary warnings related to this model in logs.</summary>
    public void AutoWarn()
    {
        if (DangerousModelNameChars.ContainsAnyMatch(Name))
        {
            Logs.Warning($"{Handler?.ModelType} model '{Name}' contains special characters in its name, which might cause parsing issues. Consider renaming the file (or folder).");
        }
        if (Handler?.ModelType == "Embedding" && Name.Contains(' '))
        {
            Logs.Warning($"Embedding model '{Name}' contains spaces in its name, which will cause it to not parse properly on the backend. Please rename the file or folder to remove spaces.");
        }
    }
}
