using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using LiteDB;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.IO;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace SwarmUI.Text2Image;

/// <summary>Central manager for Text2Image models.</summary>
public class T2IModelHandler
{
    /// <summary>All models known to this handler.</summary>
    public ConcurrentDictionary<string, T2IModel> Models = new();

    /// <summary>Lock used when modifying the model list.</summary>
    public LockObject ModificationLock = new();

    /// <summary>If true, the engine is shutting down.</summary>
    public bool IsShutdown = false;

    /// <summary>Internal model metadata cache data (per folder).</summary>
    public static Dictionary<string, (LiteDatabase, ILiteCollection<ModelMetadataStore>)> ModelMetadataCachePerFolder = [];

    /// <summary>Lock for metadata processing.</summary>
    public LockObject MetadataLock = new();

    /// <summary>The type of model this handler is tracking (eg Stable-Diffusion, LoRA, VAE, Embedding, ...).</summary>
    public string ModelType;

    /// <summary>The full folder path for relevant models.</summary>
    public string[] FolderPaths;

    /// <summary>Quick internal tracker for unauthorized access errors, to aggregate the warning.</summary>
    public ConcurrentQueue<string> UnathorizedAccessSet = new();

    /// <summary>Helper, data store for model metadata.</summary>
    public class ModelMetadataStore
    {
        [BsonId]
        public string ModelName { get; set; }

        public long ModelFileVersion { get; set; }

        public string ModelClassType { get; set; }

        public string Title { get; set; }

        public string Author { get; set; }

        public string Description { get; set; }

        public string PreviewImage { get; set; }

        public int StandardWidth { get; set; }

        public int StandardHeight { get; set; }

        public bool IsNegativeEmbedding { get; set; }

        public string License { get; set; }

        public string UsageHint { get; set; }

        public string TriggerPhrase { get; set; }

        public string[] Tags { get; set; }

        public string MergedFrom { get; set; }

        public string Date { get; set; }

        public string Preprocessor { get; set; }

        /// <summary>Time this model was last modified.</summary>
        public long TimeModified { get; set; }

        /// <summary>Time this model was created.</summary>
        public long TimeCreated { get; set; }

        public string Hash { get; set; }

        public string PredictionType { get; set; }

        /// <summary>Special cache of what text encoders the model appears to contain. Primarily for SD3 which has optional text encoders.</summary>
        public string TextEncoders { get; set; }

        /// <summary>Special format indicators, such as "bnb_nf4".</summary>
        public string SpecialFormat { get; set; }
    }

    public T2IModelHandler()
    {
        Program.ModelRefreshEvent += Refresh;
    }

    public void Shutdown()
    {
        if (IsShutdown)
        {
            return;
        }
        IsShutdown = true;
        Program.ModelRefreshEvent -= Refresh;
        lock (MetadataLock)
        {
            foreach ((LiteDatabase ldb, _) in ModelMetadataCachePerFolder.Values)
            {
                ldb.Dispose();
            }
            ModelMetadataCachePerFolder.Clear();
        }
    }


    /// <summary>Utility to destroy all stored metadata files.</summary>
    public void MassRemoveMetadata()
    {
        lock (MetadataLock)
        {
            foreach ((LiteDatabase ldb, _) in ModelMetadataCachePerFolder.Values)
            {
                try
                {
                    ldb.Dispose();
                }
                catch (Exception) { }
            }
            ModelMetadataCachePerFolder.Clear();
            static void ClearFolder(string folder)
            {
                try
                {
                    if (File.Exists($"{folder}/model_metadata.ldb"))
                    {
                        File.Delete($"{folder}/model_metadata.ldb");
                    }
                }
                catch (Exception) { }
                try
                {
                    foreach (string subFolder in Directory.GetDirectories(folder))
                    {
                        ClearFolder(subFolder);
                    }
                }
                catch (Exception) { }
            }
            foreach (string path in FolderPaths)
            {
                ClearFolder(path);
            }
            ClearFolder(Program.DataDir);
        }
    }

    public List<T2IModel> ListModelsFor(Session session)
    {
        if (IsShutdown)
        {
            return [];
        }
        string allowedStr = session is null ? ".*" : session.User.Restrictions.AllowedModels;
        if (allowedStr == ".*")
        {
            return [.. Models.Values];
        }
        Regex allowed = new(allowedStr, RegexOptions.Compiled | RegexOptions.IgnoreCase);
        return Models.Values.Where(m => allowed.IsMatch(m.Name)).ToList();
    }

    public List<string> ListModelNamesFor(Session session)
    {
        HashSet<string> list = ListModelsFor(session).Select(m => m.Name).ToHashSet();
        list.UnionWith(ModelsAPI.InternalExtraModels(ModelType).Keys);
        List<string> result = new(list.Count + 2) { "(None)" };
        result.AddRange(list);
        return result;
    }

    public T2IModel GetModel(string name)
    {
        if (Models.TryGetValue(name, out T2IModel model))
        {
            return model;
        }
        if (ModelsAPI.InternalExtraModels(ModelType).TryGetValue(name, out JObject extraModelData))
        {
            return T2IModel.FromNetObject(extraModelData);
        }
        return null;
    }

    /// <summary>Refresh the model list.</summary>
    public void Refresh()
    {
        if (IsShutdown)
        {
            return;
        }
        try
        {
            foreach (string path in FolderPaths)
            {
                Directory.CreateDirectory(path);
            }
            lock (ModificationLock)
            {
                Models.Clear();
            }
            foreach (string path in FolderPaths)
            {
                AddAllFromFolder(path, "");
                Logs.Debug($"Have {Models.Count} {ModelType} models.");
            }
            if (UnathorizedAccessSet.Any())
            {
                Logs.Warning($"Got UnauthorizedAccessException while loading {ModelType} model paths: {UnathorizedAccessSet.Select(m => $"'{m}'").JoinString(", ")}");
                UnathorizedAccessSet.Clear();
            }
        }
        catch (Exception e)
        {
            Logs.Error($"Error while refreshing {ModelType} models: {e}");
        }
    }

    /// <summary>Get (or create) the metadata cache for a given model folder.</summary>
    public ILiteCollection<ModelMetadataStore> GetCacheForFolder(string folder)
    {
        lock (MetadataLock)
        {
            try
            {
                return ModelMetadataCachePerFolder.GetOrCreate(folder, () =>
                {
                    LiteDatabase ldb = new(folder + "/model_metadata.ldb");
                    return (ldb, ldb.GetCollection<ModelMetadataStore>("models"));
                }).Item2;
            }
            catch (UnauthorizedAccessException) { return null; }
            catch (IOException) { return null; }
        }
    }

    /// <summary>Updates the metadata cache database to the metadata assigned to this model object.</summary>
    public void ResetMetadataFrom(T2IModel model)
    {
        try
        {
            bool perFolder = Program.ServerSettings.Metadata.ModelMetadataPerFolder;
            long modified = ((DateTimeOffset)File.GetLastWriteTimeUtc(model.RawFilePath)).ToUnixTimeMilliseconds();
            string folder = model.RawFilePath.Replace('\\', '/').BeforeAndAfterLast('/', out string fileName);
            ILiteCollection<ModelMetadataStore> cache = GetCacheForFolder(perFolder ? folder : Program.DataDir);
            if (cache is null)
            {
                return;
            }
            lock (ModificationLock)
            {
                model.Metadata ??= new();
                ModelMetadataStore metadata = model.Metadata;
                metadata.ModelFileVersion = modified;
                metadata.ModelName = perFolder ? fileName : model.RawFilePath;
                metadata.Title = model.Title;
                metadata.Description = model.Description;
                metadata.ModelClassType = model.ModelClass?.ID;
                metadata.StandardWidth = model.StandardWidth;
                metadata.StandardHeight = model.StandardHeight;
                lock (MetadataLock)
                {
                    cache.Upsert(metadata);
                }
            }
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to reset metadata for model '{model.RawFilePath}': {ex.ReadableString()}");
            throw;
        }
    }

    public static readonly string[] AutoImageFormatSuffixes = [".jpg", ".png", ".preview.png", ".preview.jpg", ".jpeg", ".preview.jpeg", ".thumb.jpg", ".thumb.png"];

    public static readonly string[] AltModelMetadataJsonFileSuffixes = [".swarm.json", ".json", ".cm-info.json", ".civitai.info"];

    public static readonly string[] AltMetadataDescriptionKeys = ["VersionName", "VersionDescription", "ModelDescription", "description"];

    public static readonly string[] AltMetadataTriggerWordsKeys = ["TrainedWords", "trainedWords"];

    public static readonly string[] AltMetadataNameKeys = ["UserTitle", "ModelName", "name"];

    public string GetAutoFormatImage(T2IModel model)
    {
        string prefix = $"{model.OriginatingFolderPath}/{model.Name.BeforeLast('.')}";
        foreach (string suffix in AutoImageFormatSuffixes)
        {
            try
            {
                if (File.Exists(prefix + suffix))
                {
                    return new Image(File.ReadAllBytes(prefix + suffix), Image.ImageType.IMAGE, suffix.AfterLast('.')).ToMetadataFormat();
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Caught an exception trying to load legacy model thumbnail at '{prefix}{suffix}'");
                Logs.Debug($"Details for above error {ex.ReadableString()}");
            }
        }
        return null;
    }

    /// <summary>Force-load the metadata for a model.</summary>
    public void LoadMetadata(T2IModel model)
    {
        if (model is null)
        {
            Logs.Warning($"Tried to load metadata for a null model?:\n{Environment.StackTrace}");
            return;
        }
        if (model.ModelClass is not null || (model.Title is not null && model.Title != model.Name.AfterLast('/')))
        {
            Logs.Debug($"Not loading metadata for {model.Name} as it is already loaded.");
            return;
        }
        string folder = model.RawFilePath.Replace('\\', '/').BeforeAndAfterLast('/', out string fileName);
        long modified = new DateTimeOffset(File.GetLastWriteTimeUtc(model.RawFilePath)).ToUnixTimeMilliseconds();
        bool perFolder = Program.ServerSettings.Metadata.ModelMetadataPerFolder;
        ILiteCollection<ModelMetadataStore> cache = GetCacheForFolder(perFolder ? folder : Program.DataDir);
        if (cache is null)
        {
            return;
        }
        ModelMetadataStore metadata;
        string modelCacheId = perFolder ? fileName : model.RawFilePath;
        lock (MetadataLock)
        {
            try
            {
                metadata = cache.FindById(modelCacheId);
            }
            catch (Exception ex)
            {
                Logs.Debug($"Failed to load metadata for {model.Name} from cache:\n{ex.ReadableString()}");
                metadata = null;
            }
        }
        if (metadata is not null && metadata.TextEncoders is null && metadata.ModelClassType == "stable-diffusion-v3-medium")
        {
            // TODO: Temporary metadata fix for SD3 models before the commit that added TextEncs tracking
            metadata = null;
        }
        if (metadata is null || metadata.ModelFileVersion != modified)
        {
            string autoImg = GetAutoFormatImage(model);
            if (autoImg is not null)
            {
                model.PreviewImage = autoImg;
            }
            JObject headerData = [];
            JObject metaHeader = [];
            string textEncs = null;
            if (model.Name.EndsWith(".safetensors") || model.Name.EndsWith(".sft"))
            {
                string headerText = T2IModel.GetSafetensorsHeaderFrom(model.RawFilePath);
                if (headerText is not null)
                {
                    headerData = headerText.ParseToJson();
                    if (headerData is null)
                    {
                        Logs.Debug($"Not loading metadata for {model.Name} as the header is not JSON?");
                        return;
                    }
                    metaHeader = headerData["__metadata__"] as JObject ?? [];
                    textEncs = "";
                    string[] keys = headerData.Properties().Select(p => p.Name).Where(k => k.StartsWith("text_encoders.")).ToArray();
                    if (keys.Any(k => k.StartsWith("text_encoders.clip_g."))) { textEncs += "clip_g,"; }
                    if (keys.Any(k => k.StartsWith("text_encoders.clip_l."))) { textEncs += "clip_l,"; }
                    if (keys.Any(k => k.StartsWith("text_encoders.t5xxl."))) { textEncs += "t5xxl,"; }
                    textEncs = textEncs.TrimEnd(',');
                }
            }
            string altModelPrefix = $"{model.OriginatingFolderPath}/{model.Name.BeforeLast('.')}";
            foreach (string altSuffix in AltModelMetadataJsonFileSuffixes)
            {
                if (File.Exists(altModelPrefix + altSuffix))
                {
                    JObject altMetadata = File.ReadAllText(altModelPrefix + altSuffix).ParseToJson();
                    foreach (JProperty prop in altMetadata.Properties())
                    {
                        metaHeader[prop.Name] = prop.Value;
                        headerData[prop.Name] = prop.Value;
                    }
                }
            }
            if (metaHeader.Count == 0)
            {
                Logs.Debug($"Not loading metadata for {model.Name} as it lacks a proper header (path='{altModelPrefix}').");
            }
            string altDescription = "", altName = null;
            HashSet<string> triggerPhrases = [];
            foreach (string altSuffix in AltModelMetadataJsonFileSuffixes)
            {
                if (File.Exists(altModelPrefix + altSuffix))
                {
                    JObject altMetadata = File.ReadAllText(altModelPrefix + altSuffix).ParseToJson();
                    if (altMetadata.TryGetValue("model", out JToken modelSection) && modelSection is JObject modelSectionObj && modelSectionObj.TryGetValue("name", out JToken subNameTok))
                    {
                        altName ??= subNameTok.Value<string>();
                    }
                    foreach (string nameKey in AltMetadataNameKeys)
                    {
                        if (altMetadata.TryGetValue(nameKey, out JToken nameTok) && nameTok.Type != JTokenType.Null)
                        {
                            altName ??= nameTok.Value<string>();
                        }
                    }
                    foreach (string descKey in AltMetadataDescriptionKeys)
                    {
                        if (altMetadata.TryGetValue(descKey, out JToken descTok) && descTok.Type != JTokenType.Null)
                        {
                            altDescription += descTok.Value<string>() + "\n";
                        }
                    }
                    foreach (string wordsKey in AltMetadataTriggerWordsKeys)
                    {
                        if (altMetadata.TryGetValue(wordsKey, out JToken wordsTok) && wordsTok.Type != JTokenType.Null)
                        {
                            string[] trainedWords = wordsTok.ToObject<string[]>();
                            if (trainedWords is not null && trainedWords.Length > 0)
                            {
                                triggerPhrases.UnionWith(trainedWords);
                            }
                        }
                    }
                    if (altMetadata.TryGetValue("activation text", out JToken actTok) && actTok.Type != JTokenType.Null)
                    {
                        triggerPhrases.Add(actTok.Value<string>());
                    }
                    break;
                }
            }
            string altTriggerPhrase = triggerPhrases.JoinString(", ");
            T2IModelClass clazz = T2IModelClassSorter.IdentifyClassFor(model, headerData);
            string specialFormat = null;
            foreach (string key in headerData.Properties().Select(p => p.Name))
            {
                if (key.Contains("bitsandbytes__nf4"))
                {
                    specialFormat = "bnb_nf4";
                    break;
                }
            }
            if (model.Name.EndsWith(".gguf"))
            {
                specialFormat = "gguf";
            }
            if (specialFormat is not null)
            {
                Logs.Debug($"Model {model.Name} has special format '{specialFormat}'");
            }
            string img = metaHeader?.Value<string>("modelspec.preview_image") ?? metaHeader?.Value<string>("modelspec.thumbnail") ?? metaHeader?.Value<string>("thumbnail") ?? metaHeader?.Value<string>("preview_image");
            if (img is not null && !img.StartsWith("data:image/"))
            {
                Logs.Warning($"Ignoring image in metadata of {model.Name} '{img}'");
                img = null;
            }
            int width, height;
            string res = metaHeader?.Value<string>("modelspec.resolution") ?? metaHeader?.Value<string>("resolution");
            if (res is not null)
            {
                width = int.Parse(res.BeforeAndAfter('x', out string h));
                height = int.Parse(h);
            }
            else
            {
                width = (metaHeader?.ContainsKey("standard_width") ?? false) ? metaHeader.Value<int>("standard_width") : (clazz?.StandardWidth ?? 0);
                height = (metaHeader?.ContainsKey("standard_height") ?? false) ? metaHeader.Value<int>("standard_height") : (clazz?.StandardHeight ?? 0);
            }
            img ??= autoImg;
            string[] tags = null;
            JToken tagsTok = metaHeader.Property("modelspec.tags")?.Value;
            if (tagsTok is not null && tagsTok.Type != JTokenType.Null)
            {
                if (tagsTok.Type == JTokenType.Array)
                {
                    tags = tagsTok.ToObject<string[]>();
                }
                else
                {
                    tags = tagsTok.Value<string>().Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                }
            }
            static string pickBest(params string[] options)
            {
                foreach (string opt in options)
                {
                    if (!string.IsNullOrWhiteSpace(opt))
                    {
                        return opt;
                    }
                }
                if (options.Length > 0)
                {
                    return options[0];
                }
                return null;
            }
            metadata = new()
            {
                ModelFileVersion = modified,
                TimeModified = modified,
                TimeCreated = new DateTimeOffset(File.GetCreationTimeUtc(model.RawFilePath)).ToUnixTimeMilliseconds(),
                ModelName = modelCacheId,
                ModelClassType = clazz?.ID,
                Title = pickBest(metaHeader?.Value<string>("modelspec.title"), metaHeader?.Value<string>("title"), altName, fileName.BeforeLast('.')),
                Author = pickBest(metaHeader?.Value<string>("modelspec.author"), metaHeader?.Value<string>("author")),
                Description = pickBest(metaHeader?.Value<string>("modelspec.description"), metaHeader?.Value<string>("description"), altDescription),
                PreviewImage = img,
                StandardWidth = width,
                StandardHeight = height,
                UsageHint = pickBest(metaHeader?.Value<string>("modelspec.usage_hint"), metaHeader?.Value<string>("usage_hint")),
                MergedFrom = pickBest(metaHeader?.Value<string>("modelspec.merged_from"), metaHeader?.Value<string>("merged_from")),
                TriggerPhrase = pickBest(metaHeader?.Value<string>("modelspec.trigger_phrase"), metaHeader?.Value<string>("trigger_phrase"), altTriggerPhrase),
                License = pickBest(metaHeader?.Value<string>("modelspec.license"), metaHeader?.Value<string>("license")),
                Date = pickBest(metaHeader?.Value<string>("modelspec.date"), metaHeader?.Value<string>("date")),
                Preprocessor = pickBest(metaHeader?.Value<string>("modelspec.preprocessor"), metaHeader?.Value<string>("preprocessor")),
                Tags = tags,
                IsNegativeEmbedding = (pickBest(metaHeader?.Value<string>("modelspec.is_negative_embedding"), metaHeader?.Value<string>("is_negative_embedding")) ?? "false") == "true",
                PredictionType = pickBest(metaHeader?.Value<string>("modelspec.prediction_type"), metaHeader?.Value<string>("prediction_type")),
                Hash = pickBest(metaHeader?.Value<string>("modelspec.hash_sha256"), metaHeader?.Value<string>("hash_sha256")),
                TextEncoders = textEncs,
                SpecialFormat = pickBest(metaHeader?.Value<string>("modelspec.special_format"), metaHeader?.Value<string>("special_format"), specialFormat)
            };
            lock (MetadataLock)
            {
                try
                {
                    cache.Upsert(metadata);
                }
                catch (Exception ex)
                {
                    Logs.Warning($"Error handling metadata database for model {model.RawFilePath}: {ex.ReadableString()}");
                }
            }
        }
        if (!string.IsNullOrWhiteSpace(metadata.ModelClassType))
        {
            metadata.ModelClassType = T2IModelClassSorter.Remaps.GetValueOrDefault(metadata.ModelClassType, metadata.ModelClassType);
        }
        if (metadata.TimeModified == 0)
        {
            metadata.TimeModified = modified;
            metadata.TimeCreated = modified;
        }
        lock (ModificationLock)
        {
            model.Title = metadata.Title;
            model.Description = metadata.Description;
            model.ModelClass = T2IModelClassSorter.ModelClasses.GetValueOrDefault(metadata.ModelClassType ?? "");
            model.PreviewImage = string.IsNullOrWhiteSpace(metadata.PreviewImage) ? "imgs/model_placeholder.jpg" : metadata.PreviewImage;
            model.StandardWidth = metadata.StandardWidth;
            model.StandardHeight = metadata.StandardHeight;
            model.Metadata = metadata;
        }
    }

    /// <summary>Internal model adder route. Do not call.</summary>
    public void AddAllFromFolder(string pathBase, string folder)
    {
        if (IsShutdown)
        {
            return;
        }
        Logs.Verbose($"[Model Scan] Add all {ModelType} from folder {folder}");
        string prefix = folder == "" ? "" : $"{folder}/";
        string actualFolder = $"{pathBase}/{folder}";
        if (!Directory.Exists(actualFolder))
        {
            Logs.Verbose($"[Model Scan] Skipping folder {actualFolder}");
            return;
        }
        Parallel.ForEach(Directory.EnumerateDirectories(actualFolder), subfolder =>
        {
            string path = $"{prefix}{subfolder.Replace('\\', '/').AfterLast('/')}";
            try
            {
                AddAllFromFolder(pathBase, path);
            }
            catch (UnauthorizedAccessException)
            {
                UnathorizedAccessSet.Enqueue(path);
            }
            catch (Exception ex)
            {
                Logs.Warning($"Error while scanning model {ModelType} subfolder '{path}': {ex.ReadableString()}");
            }
        });
        Parallel.ForEach(Directory.EnumerateFiles(actualFolder), file =>
        {
            string fn = file.Replace('\\', '/').AfterLast('/');
            string fullFilename = $"{prefix}{fn}";
            if (T2IModel.NativelySupportedModelExtensions.Contains(fn.AfterLast('.')))
            {
                T2IModel model = new(this, pathBase, file, fullFilename)
                {
                    Title = fullFilename.AfterLast('/'),
                    Description = "(Metadata not yet loaded.)",
                    PreviewImage = "imgs/model_placeholder.jpg",
                };
                Models[fullFilename] = model;
                try
                {
                    LoadMetadata(model);
                }
                catch (UnauthorizedAccessException)
                {
                    UnathorizedAccessSet.Enqueue(fullFilename);
                }
                catch (Exception ex)
                {
                    if (Program.GlobalProgramCancel.IsCancellationRequested)
                    {
                        throw;
                    }
                    Logs.Warning($"Failed to load metadata for {fullFilename}:\n{ex.ReadableString()}");
                }
            }
            else if (fn.EndsWith(".ckpt") || fn.EndsWith(".pt") || fn.EndsWith(".pth"))
            {
                T2IModel model = new(this, pathBase, file, fullFilename)
                {
                    Description = "(None, use '.safetensors' to enable metadata descriptions)",
                    PreviewImage = "imgs/legacy_ckpt.jpg",
                };
                model.PreviewImage = GetAutoFormatImage(model) ?? model.PreviewImage;
                Models[fullFilename] = model;
            }
        });
    }
}
