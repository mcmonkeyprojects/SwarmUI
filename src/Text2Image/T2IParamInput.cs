using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;

namespace SwarmUI.Text2Image;

/// <summary>Represents user-input for a Text2Image request.</summary>
public class T2IParamInput
{
    /// <summary>Parameter IDs that must be loaded early on, eg extracted from presets in prompts early. Primarily things that affect backend selection.</summary>
    public static readonly string[] ParamsMustLoadEarly = ["model", "images", "internalbackendtype", "exactbackendid"];

    /// <summary>Special handlers for any special logic to apply post-loading a param input.</summary>
    public static List<Action<T2IParamInput>> SpecialParameterHandlers =
    [
        input =>
        {
            if (!input.RawOriginalSeed.HasValue)
            {
                input.RawOriginalSeed = input.Get(T2IParamTypes.Seed, -1);
            }
            if (!input.TryGet(T2IParamTypes.Seed, out long seed) || seed == -1)
            {
                input.Set(T2IParamTypes.Seed, Random.Shared.Next());
            }
        },
        input =>
        {
            if (input.TryGet(T2IParamTypes.VariationSeed, out long seed) && seed == -1)
            {
                input.Set(T2IParamTypes.VariationSeed, Random.Shared.Next());
            }
        },
        input =>
        {
            if (input.TryGet(T2IParamTypes.RawResolution, out string res))
            {
                (string widthText, string heightText) = res.BeforeAndAfter('x');
                int width = int.Parse(widthText.Trim());
                int height = int.Parse(heightText.Trim());
                input.Set(T2IParamTypes.Width, width);
                input.Set(T2IParamTypes.Height, height);
                input.Remove(T2IParamTypes.AltResolutionHeightMult);
            }
        },
        input =>
        {
            if (input.TryGet(T2IParamTypes.Loras, out List<string> loras))
            {
                List<string> weights = input.Get(T2IParamTypes.LoraWeights, []);
                if (weights.Count != loras.Count)
                {
                    Logs.Warning($"Input has {loras.Count} loras, but {weights.Count} weights - the two lists must match to work properly. Applying an automatic fix.");
                    weights = [.. weights.Take(loras.Count)];
                    while (weights.Count < loras.Count)
                    {
                        weights.Add("1");
                    }
                    input.Set(T2IParamTypes.LoraWeights, weights);
                }
                if (input.TryGet(T2IParamTypes.LoraTencWeights, out List<string> tencWeights) && tencWeights.Count != weights.Count)
                {
                    Logs.Warning($"Input has {loras.Count} loras, but {tencWeights.Count} textenc weights - the two lists must match to work properly. Applying an automatic fix.");
                    tencWeights = [.. tencWeights.Take(weights.Count)];
                    while (tencWeights.Count < weights.Count)
                    {
                        tencWeights.Add(weights[tencWeights.Count]);
                    }
                    input.Set(T2IParamTypes.LoraTencWeights, tencWeights);
                }
            }
        },
        input =>
        {
            // Special patch: if model is in a preset in the prompt, we want to apply that as early as possible to ensure the model router knows how to route correctly.
            if (!input.EarlyLoadDone && input.TryGet(T2IParamTypes.Prompt, out string prompt) && prompt.Contains("<preset:"))
            {
                StringConversionHelper.QuickSimpleTagFiller(prompt, "<", ">", tag =>
                {
                    (string prefix, string data) = tag.BeforeAndAfter(':');
                    if (prefix == "preset")
                    {
                        T2IPreset preset = input.SourceSession.User.GetPreset(data);
                        if (preset is null)
                        {
                            Logs.Debug($"(Pre-input-parse) Preset '{data}' does not exist and will be ignored.");
                            return null;
                        }
                        foreach (string pname in ParamsMustLoadEarly)
                        {
                            if (preset.ParamMap.TryGetValue(pname, out string pval))
                            {
                                T2IParamTypes.ApplyParameter(pname, pval, input);
                            }
                        }
                    }
                    return "";
                });
            }
        }
    ];

    /// <summary>The underlying raw <see cref="T2IParamSet"/> backing the main inputs.</summary>
    public T2IParamSet InternalSet = new();

    [Obsolete("don't access this internal value directly")] // TODO: Remove me
    public Dictionary<string, object> ValuesInput => InternalSet.ValuesInput;

    /// <summary>Extra data to store in metadata.</summary>
    public Dictionary<string, object> ExtraMeta = [];

    /// <summary>A set of feature flags required for this input.</summary>
    public HashSet<string> RequiredFlags = [];

    /// <summary>The session this input came from.</summary>
    public Session SourceSession;

    /// <summary>Interrupt token from the session.</summary>
    public CancellationToken InterruptToken;

    /// <summary>List of reasons this input did not match backend requests, if any.</summary>
    public HashSet<string> RefusalReasons = [];

    /// <summary>Exact system time that the request was made at.</summary>
    public DateTimeOffset RequestTime = DateTimeOffset.Now;

    /// <summary>Original seed the input had, before randomization handling.</summary>
    public long? RawOriginalSeed;

    /// <summary>Dense local time with incrementer.</summary>
    public int RequestRefTime;
    
    /// <summary>If true, special early load has already ran.</summary>
    public bool EarlyLoadDone = false;

    /// <summary>Arbitrary incrementer for sub-minute unique IDs.</summary>
    public static int UIDIncrementer = 0;

    /// <summary>Last minute number that <see cref="UIDIncrementer"/> was reset at.</summary>
    public static int UIDLast = -1;

    /// <summary>Locker for editing <see cref="UIDIncrementer"/>.</summary>
    public static LockObject UIDLock = new();

    /// <summary>Construct a new parameter input handler for a session.</summary>
    public T2IParamInput(Session session)
    {
        SourceSession = session;
        InternalSet.SourceSession = session;
        InterruptToken = session is null ? new CancellationTokenSource().Token : session.SessInterrupt.Token;
        ExtraMeta["date"] = $"{RequestTime:yyyy-MM-dd}";
        lock (UIDLock)
        {
            if (RequestTime.Minute != UIDLast || UIDIncrementer > 998)
            {
                UIDIncrementer = 0;
                UIDLast = RequestTime.Minute;
            }
            UIDIncrementer++;
            RequestRefTime = UIDIncrementer;
        }
    }

    /// <summary>Gets the desired image width.</summary>
    public int GetImageWidth(int def = 512)
    {
        if (TryGet(T2IParamTypes.RawResolution, out string res))
        {
            return int.Parse(res.Before('x'));
        }
        return Get(T2IParamTypes.Width, def);
    }

    /// <summary>Gets the desired image height, automatically using alt-res parameter if needed.</summary>
    public int GetImageHeight(int def = 512)
    {
        if (TryGet(T2IParamTypes.RawResolution, out string res))
        {
            return int.Parse(res.After('x'));
        }
        if (TryGet(T2IParamTypes.AltResolutionHeightMult, out double val) && TryGet(T2IParamTypes.Width, out int width))
        {
            return (int)(val * width);
        }
        return Get(T2IParamTypes.Height, def);
    }

    /// <summary>Returns a perfect duplicate of this parameter input, with new reference addresses.</summary>
    public T2IParamInput Clone()
    {
        T2IParamInput toret = MemberwiseClone() as T2IParamInput;
        toret.InternalSet = InternalSet.Clone();
        toret.ExtraMeta = new Dictionary<string, object>(ExtraMeta);
        toret.RequiredFlags = [.. RequiredFlags];
        return toret;
    }

    public static object SimplifyParamVal(object val)
    {
        if (val is Image img)
        {
            return img.AsBase64;
        }
        else if (val is List<Image> imgList)
        {
            return imgList.Select(img => img.AsBase64).JoinString("|");
        }
        else if (val is List<string> strList)
        {
            return strList.JoinString(",");
        }
        else if (val is List<T2IModel> modelList)
        {
            return modelList.Select(m => T2IParamTypes.CleanModelName(m.Name)).JoinString(",");
        }
        else if (val is T2IModel model)
        {
            return T2IParamTypes.CleanModelName(model.Name);
        }
        else if (val is string str)
        {
            return FillEmbedsInString(str, e => $"<embed:{e}>");
        }
        return val;
    }

    /// <summary>Generates a JSON object for this input that can be fed straight back into the Swarm API.</summary>
    public JObject ToJSON()
    {
        JObject result = [];
        foreach ((string key, object val) in InternalSet.ValuesInput)
        {
            result[key] = JToken.FromObject(SimplifyParamVal(val));
        }
        return result;
    }

    public static JToken MetadatableToJTok(object val)
    {
        if (val is Image)
        {
            return null;
        }
        if (val is string str)
        {
            val = FillEmbedsInString(str, e => $"<embed:{e}>");
        }
        if (val is T2IModel model)
        {
            val = T2IParamTypes.CleanModelName(model.Name);
        }
        return JToken.FromObject(val);
    }

    /// <summary>Generates a metadata JSON object for this input's parameters.</summary>
    public JObject GenParameterMetadata()
    {
        JObject output = [];
        foreach ((string key, object origVal) in InternalSet.ValuesInput)
        {
            object val = origVal;
            if (val is null)
            {
                Logs.Warning($"Null parameter {key} in T2I parameters?");
                return null;
            }
            if (T2IParamTypes.TryGetType(key, out T2IParamType type, this))
            {
                if (type.HideFromMetadata)
                {
                    continue;
                }
                if (type.MetadataFormat is not null)
                {
                    val = type.MetadataFormat($"{val}");
                }
            }
            JToken token = MetadatableToJTok(val);
            if (token is not null)
            {
                output[key] = token;
            }
        }
        if (output.TryGetValue("original_prompt", out JToken origPrompt) && output.TryGetValue("prompt", out JToken prompt) && origPrompt == prompt)
        {
            output.Remove("original_prompt");
        }
        if (output.TryGetValue("original_negativeprompt", out JToken origNegPrompt) && output.TryGetValue("negativeprompt", out JToken negPrompt) && origNegPrompt == negPrompt)
        {
            output.Remove("original_negativeprompt");
        }
        return output;
    }

    /// <summary>Keys for <see cref="ExtraMeta"/> that identify lists of extra models to track, as a pair of (key, model-sub-type).</summary>
    public static List<(string, string)> ModelListExtraKeys = [("used_embeddings", "Embedding"), ("loras", "LoRA")];

    /// <summary>Generates a metadata JSON object for this input's data.</summary>
    public JObject GenFullMetadataObject()
    {
        JObject paramData = GenParameterMetadata();
        paramData["swarm_version"] = Utilities.Version;
        JObject final = new() { ["sui_image_params"] = paramData };
        JObject extraData = [];
        foreach ((string key, object val) in ExtraMeta)
        {
            JToken token = MetadatableToJTok(val);
            if (token is not null)
            {
                extraData[key] = token;
            }
        }
        if (extraData.Count > 0)
        {
            final["sui_extra_data"] = extraData;
        }
        if (Program.ServerSettings.Metadata.ImageMetadataIncludeModelHash)
        {
            JArray models = [];
            void addModel(T2IModel model, string param)
            {
                if (model is null)
                {
                    Logs.Debug($"Model param '{param}' is null, will not list in sui_models metadata");
                    return;
                }
                models.Add(new JObject()
                {
                    ["name"] = model.Name,
                    ["param"] = param,
                    ["hash"] = model.GetOrGenerateTensorHashSha256()
                });
            }
            void addModelsFor(string key, object val)
            {
                if (val is T2IModel model)
                {
                    addModel(model, key);
                }
                else if (val is List<T2IModel> modelList)
                {
                    foreach (T2IModel m in modelList)
                    {
                        addModel(m, key);
                    }
                }
            }
            foreach ((string key, object val) in InternalSet.ValuesInput)
            {
                addModelsFor(key, val);
            }
            foreach ((string modelListKey, string subType) in ModelListExtraKeys)
            {
                if (ExtraMeta.TryGetValue(modelListKey, out object val) || InternalSet.ValuesInput.TryGetValue(modelListKey, out val))
                {
                    addModelsFor(modelListKey, val);
                    if (val is List<string> strlist)
                    {
                        foreach (string str in strlist)
                        {
                            T2IModel model = Program.T2IModelSets[subType].GetModel(str);
                            addModel(model, modelListKey);
                        }
                    }
                }
            }
            if (models.Count > 0)
            {
                final["sui_models"] = models;
            }
        }
        return final;
    }

    /// <summary>Generates a metadata JSON object for this input and creates a proper string form of it, fit for inclusion in an image.</summary>
    public string GenRawMetadata()
    {
        return MetadataToString(GenFullMetadataObject());
    }

    /// <summary>Aggressively safe JSON Serializer Settings for metadata encoding.</summary>
    public static JsonSerializerSettings SafeSerializer = new() { Formatting = Formatting.Indented, StringEscapeHandling = StringEscapeHandling.EscapeNonAscii };

    /// <summary>Converts a metadata JSON object to a string.</summary>
    public static string MetadataToString(JObject obj)
    {
        return JsonConvert.SerializeObject(obj, SafeSerializer).Replace("\r\n", "\n");
    }

    /// <summary>Special utility to process prompt inputs before the request is executed (to parse wildcards, embeddings, etc).</summary>
    public void PreparsePromptLikes()
    {
        T2IPromptHandling.PromptTagContext posContext = new() { Input = this, Param = T2IParamTypes.Prompt.Type.ID };
        InternalSet.ValuesInput["prompt"] = ProcessPromptLike(T2IParamTypes.Prompt, posContext);
        T2IPromptHandling.PromptTagContext negContext = new() { Input = this, Param = T2IParamTypes.Prompt.Type.ID, Variables = posContext.Variables };
        InternalSet.ValuesInput["negativeprompt"] = ProcessPromptLike(T2IParamTypes.NegativePrompt, negContext);
    }

    /// <summary>Formats embeddings in a prompt string and returns the cleaned string.</summary>
    public static string FillEmbedsInString(string str, Func<string, string> format)
    {
        return StringConversionHelper.QuickSimpleTagFiller(str, "\0swarmembed:", "\0end", format, false);
    }

    /// <summary>Format embedding text in prompts.</summary>
    public void ProcessPromptEmbeds(Func<string, string> formatEmbed, Func<string, string> generalPreproc = null)
    {
        void proc(T2IRegisteredParam<string> param)
        {
            string val = Get(param) ?? "";
            val = generalPreproc is null ? val : generalPreproc(val);
            val = FillEmbedsInString(val, formatEmbed);
            InternalSet.ValuesInput[param.Type.ID] = val;
        }
        proc(T2IParamTypes.Prompt);
        proc(T2IParamTypes.NegativePrompt);
    }

    /// <summary>Random instance for <see cref="T2IParamTypes.WildcardSeed"/>.</summary>
    public Random WildcardRandom = null;

    /// <summary>Offset value for Wildcard Seed, to keep it unique.</summary>
    private const int WCSeedOffset = 17;

    /// <summary>Gets the user's set wildcard seed.</summary>
    public int GetWildcardSeed()
    {
        long rawVal = -1;
        if (TryGet(T2IParamTypes.WildcardSeed, out long wildcardSeed))
        {
            wildcardSeed += WCSeedOffset;
            rawVal = wildcardSeed;
        }
        else
        {
            wildcardSeed = Get(T2IParamTypes.Seed) + Get(T2IParamTypes.VariationSeed, 0) + WCSeedOffset;
        }
        if (wildcardSeed > int.MaxValue)
        {
            wildcardSeed %= int.MaxValue;
        }
        if (wildcardSeed - WCSeedOffset < 0)
        {
            wildcardSeed = Random.Shared.Next(int.MaxValue);
        }
        if (wildcardSeed != rawVal)
        {
            Set(T2IParamTypes.WildcardSeed, wildcardSeed - WCSeedOffset);
        }
        return (int)wildcardSeed;
    }

    /// <summary>Gets the random instance for <see cref="T2IParamTypes.WildcardSeed"/>, initializing it if needed.</summary>
    public Random GetWildcardRandom()
    {
        if (WildcardRandom is not null)
        {
            return WildcardRandom;
        }
        WildcardRandom = new(GetWildcardSeed());
        return WildcardRandom;
    }

    /// <summary>Special utility to process prompt inputs before the request is executed (to parse wildcards, embeddings, etc).</summary>
    public string ProcessPromptLike(T2IRegisteredParam<string> param, T2IPromptHandling.PromptTagContext context = null)
    {
        string val = Get(param);
        if (val is null)
        {
            return "";
        }
        string fixedVal = val.Replace('\0', '\a').Replace("\a", "");
        context ??= new() { Input = this, Param = param.Type.ID };
        fixedVal = T2IPromptHandling.ProcessPromptLike(fixedVal, context, true);
        if (fixedVal != val && !ExtraMeta.ContainsKey($"original_{param.Type.ID}"))
        {
            ExtraMeta[$"original_{param.Type.ID}"] = val;
        }
        return fixedVal.Replace("\a", "");
    }

    /// <summary>Gets the raw value of the parameter, if it is present, or null if not.</summary>
    public object GetRaw(T2IParamType param) => InternalSet.GetRaw(param);

    /// <summary>Gets the value of the parameter, if it is present, or default if not.</summary>
    public T Get<T>(T2IRegisteredParam<T> param) => InternalSet.Get(param);

    /// <summary>Gets the value of the parameter, if it is present, or default if not.</summary>
    public T Get<T>(T2IRegisteredParam<T> param, T defVal, bool autoFixDefault = false) => InternalSet.Get(param, defVal, autoFixDefault);

    /// <summary>Gets the value of the parameter as a string, if it is present, or null if not.</summary>
    public string GetString<T>(T2IRegisteredParam<T> param) => InternalSet.GetString(param);

    /// <summary>Tries to get the value of the parameter. If it is present, returns true and outputs the value. If it is not present, returns false.</summary>
    public bool TryGet<T>(T2IRegisteredParam<T> param, out T val) => InternalSet.TryGet(param, out val);

    /// <summary>Tries to get the value of the parameter. If it is present, returns true and outputs the value. If it is not present, returns false.</summary>
    public bool TryGetRaw(T2IParamType param, out object val) => InternalSet.TryGetRaw(param, out val);

    /// <summary>Sets the value of an input parameter to a given plaintext input. Will run the 'Clean' call if needed.</summary>
    public void Set(T2IParamType param, string val)
    {
        InternalSet.Set(param, val);
        if (param.FeatureFlag is not null)
        {
            RequiredFlags.UnionWith(param.FeatureFlag.SplitFast(','));
        }
    }

    /// <summary>Sets the direct raw value of a given parameter, without processing.</summary>
    public void Set<T>(T2IRegisteredParam<T> param, T val)
    {
        InternalSet.Set(param, val);
        if (param.Type.FeatureFlag is not null)
        {
            RequiredFlags.UnionWith(param.Type.FeatureFlag.SplitFast(','));
        }
    }
    
    /// <summary>Removes a param.</summary>
    public void Remove<T>(T2IRegisteredParam<T> param)
    {
        InternalSet.Remove(param);
    }

    /// <summary>Removes a param.</summary>
    public void Remove(T2IParamType param)
    {
        InternalSet.Remove(param);
    }

    /// <summary>Makes sure the input has valid seed inputs and other special parameter handlers.</summary>
    public void ApplySpecialLogic()
    {
        foreach (Action<T2IParamInput> handler in SpecialParameterHandlers)
        {
            handler(this);
        }
        EarlyLoadDone = true;
    }

    /// <summary>Returns a simple text representation of the input data.</summary>
    public override string ToString()
    {
        static string stringifyVal(object obj)
        {
            string val = $"{SimplifyParamVal(obj)}";
            if (val.Length > 256)
            {
                val = val[..256] + "...";
            }
            return val;
        }
        return $"T2IParamInput({string.Join(", ", InternalSet.ValuesInput.Select(x => $"{x.Key}: {stringifyVal(x.Value)}"))})";
    }
}
