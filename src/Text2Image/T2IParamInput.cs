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

    public class PromptTagContext
    {
        public T2IParamInput Input;

        public string Param;

        public string[] Embeds, Loras;

        public Dictionary<string, string> Variables = [];

        public int SectionID = 0;

        public int Depth = 0;

        /// <summary>If the current syntax usage has a pre-data block, it will be here. This will be null otherwise.</summary>
        public string PreData;

        public string RawCurrentTag;

        public string TriggerPhraseExtra = "";

        public void TrackWarning(string warning)
        {
            Logs.Warning(warning);
            List<string> warnings = Input.ExtraMeta.GetOrCreate("parser_warnings", () => new List<string>()) as List<string>;
            warnings.Add(warning);
        }

        public string Parse(string text)
        {
            if (Depth > 1000)
            {
                TrackWarning("Recursive prompt tags - infinite loop, cannot return valid result.");
                return text;
            }
            Depth++;
            string result = Input.ProcessPromptLike(text, this, false);
            Depth--;
            return result;
        }
    }

    /// <summary>Escapes text to for handling but the special text handler python script.</summary>
    public static string EscapeForTextHandler(string input)
    {
        return input.Replace("\\", "\\\\").Replace(":", "\\:").Replace("|", "\\|").Replace("[", "\\[").Replace("]", "\\]");
    }

    /// <summary>Splits the text within a tag input, in a way that avoids splitting inside subtags, and allows for double-pipe, pipe, or comma separation.</summary>
    public static string[] SplitSmart(string input)
    {
        string separator = ",";
        int count = 0;
        for (int i = 0; i < input.Length; i++)
        {
            if (input[i] == '<') { count++; }
            else if (input[i] == '>') { count--; }
            else if (count == 0 && (input[i] == '|' && i > 0 && input[i - 1] == '|'))
            {
                separator = "||";
                break;
            }
            else if (count == 0 && (input[i] == '|'))
            {
                separator = "|";
            }
        }
        List<string> output = [];
        count = 0;
        int start = 0;
        for (int i = 0; i < input.Length; i++)
        {
            if (input[i] == '<') { count++; }
            else if (input[i] == '>') { count--; }
            else if (count == 0 && i + separator.Length - 1 < input.Length && input[i..(i + separator.Length)] == separator)
            {
                output.Add(input[start..i]);
                start = i + separator.Length;
                i += separator.Length - 1;
            }
        }
        if (start <= input.Length)
        {
            output.Add(input[start..]);
        }
        return [.. output.Select(v => v.Trim())];
    }

    /// <summary>Mapping of prompt tag prefixes, to allow for registration of custom prompt tags.</summary>
    public static Dictionary<string, Func<string, PromptTagContext, string>> PromptTagProcessors = [];

    /// <summary>Mapping of prompt tags that require no input.</summary>
    public static Dictionary<string, Func<string, PromptTagContext, string>> PromptTagBasicProcessors = [];

    /// <summary>Mapping of prompt tag prefixes, to allow for registration of custom prompt tags - specifically post-processing like lora (which remove from prompt and get read elsewhere).</summary>
    public static Dictionary<string, Func<string, PromptTagContext, string>> PromptTagPostProcessors = [];

    /// <summary>Mapping of prompt tag prefixes, to strings intended to allow for estimating token count.</summary>
    public static Dictionary<string, Func<string, PromptTagContext, string>> PromptTagLengthEstimators = [];

    /// <summary>Interprets a random number range input by a user, if the input is a number range.</summary>
    public static bool TryInterpretNumberRange(string inputVal, PromptTagContext context, out string number)
    {
        (string preDash, string postDash) = inputVal.BeforeAndAfter('-');
        if (long.TryParse(preDash.Trim(), out long int1) && long.TryParse(postDash.Trim(), out long int2))
        {
            number = $"{context.Input.GetWildcardRandom().NextInt64(int1, int2 + 1)}";
            return true;
        }
        if (double.TryParse(preDash.Trim(), out double num1) && double.TryParse(postDash.Trim(), out double num2))
        {
            number = $"{context.Input.GetWildcardRandom().NextDouble() * (num2 - num1) + num1}";
            return true;
        }
        number = null;
        return false;
    }

    /// <summary>Interprets a number input by a user, or returns null if unable to.</summary>
    public static double? InterpretNumber(string inputVal, PromptTagContext context)
    {
        if (TryInterpretNumberRange(inputVal, context, out string number))
        {
            inputVal = number;
        }
        if (double.TryParse(inputVal.Trim(), out double num))
        {
            return num;
        }
        return null;
    }

    public static (int, string) InterpretPredataForRandom(string prefix, string preData, string data, PromptTagContext context)
    {
        int count = 1;
        string separator = " ";
        if (preData is not null)
        {
            if (preData.EndsWithFast(','))
            {
                separator = ", ";
                preData = preData[0..^1];
            }
            double? countVal = InterpretNumber(preData, context);
            if (!countVal.HasValue)
            {
                Logs.Warning($"Random input '{prefix}[{preData}]:{data}' has invalid predata count (not a number) and will be ignored.");
                return (0, null);
            }
            count = (int)countVal.Value;
        }
        return (count, separator);
    }

    static T2IParamInput()
    {
        PromptTagProcessors["random"] = (data, context) =>
        {
            (int count, string partSeparator) = InterpretPredataForRandom("random", context.PreData, data, context);
            if (partSeparator is null)
            {
                return null;
            }
            string[] rawVals = SplitSmart(data);
            if (rawVals.Length == 0)
            {
                context.TrackWarning($"Random input '{data}' is empty and will be ignored.");
                return null;
            }
            string result = "";
            List<string> vals = [.. rawVals];
            for (int i = 0; i < count; i++)
            {
                int index;
                if (context.Input.Get(T2IParamTypes.WildcardSeedBehavior, "Random") == "Index")
                {
                    index = context.Input.GetWildcardSeed() % vals.Count;
                }
                else
                {
                    index = context.Input.GetWildcardRandom().Next(vals.Count);
                }
                string choice = vals[index];
                if (TryInterpretNumberRange(choice, context, out string number))
                {
                    return number;
                }
                result += context.Parse(choice).Trim() + partSeparator;
                if (vals.Count == 1)
                {
                    vals = [.. rawVals];
                }
                else
                {
                    vals.RemoveAt(index);
                }
            }
            return result.Trim();
        };
        PromptTagLengthEstimators["random"] = (data, context) =>
        {
            string[] rawVals = SplitSmart(data);
            int longest = 0;
            string longestStr = "";
            foreach (string val in rawVals)
            {
                string interp = ProcessPromptLikeForLength(val);
                if (interp.Length > longest)
                {
                    longest = interp.Length;
                    longestStr = interp;
                }
            }
            return longestStr;
        };
        PromptTagProcessors["alternate"] = (data, context) =>
        {
            string[] rawVals = SplitSmart(data);
            if (rawVals.Length == 0)
            {
                context.TrackWarning($"Alternate input '{data}' is empty and will be ignored.");
                return null;
            }
            for (int i = 0; i < rawVals.Length; i++)
            {
                rawVals[i] = context.Parse(rawVals[i]);
            }
            return $"[{rawVals.Select(EscapeForTextHandler).JoinString("|")}]";
        };
        PromptTagProcessors["alt"] = PromptTagProcessors["alternate"];
        PromptTagLengthEstimators["alternate"] = PromptTagLengthEstimators["random"];
        PromptTagLengthEstimators["alt"] = PromptTagLengthEstimators["alternate"];
        PromptTagProcessors["fromto"] = (data, context) =>
        {
            double? stepIndex = InterpretNumber(context.PreData, context);
            if (!stepIndex.HasValue)
            {
                context.TrackWarning($"FromTo input 'fromto[{context.PreData}]:{data}' has invalid predata step-index (not a number) and will be ignored.");
                return null;
            }
            string[] rawVals = SplitSmart(data);
            if (rawVals.Length != 2)
            {
                context.TrackWarning($"FromTo input '{data}' is invalid (len={rawVals.Length}, should be 2) and will be ignored.");
                return null;
            }
            for (int i = 0; i < rawVals.Length; i++)
            {
                rawVals[i] = context.Parse(rawVals[i]);
            }
            return $"[{rawVals.Select(EscapeForTextHandler).JoinString(":")}:{stepIndex}]";
        };
        PromptTagLengthEstimators["fromto"] = PromptTagLengthEstimators["random"];
        PromptTagProcessors["wildcard"] = (data, context) =>
        {
            (int count, string partSeparator) = InterpretPredataForRandom("random", context.PreData, data, context);
            if (partSeparator is null)
            {
                return null;
            }
            string card = T2IParamTypes.GetBestInList(data, WildcardsHelper.ListFiles);
            if (card is null)
            {
                context.TrackWarning($"Wildcard input '{data}' does not match any wildcard file and will be ignored.");
                return null;
            }
            WildcardsHelper.Wildcard wildcard = WildcardsHelper.GetWildcard(card);
            List<string> usedWildcards = context.Input.ExtraMeta.GetOrCreate("used_wildcards", () => new List<string>()) as List<string>;
            usedWildcards.Add(card);
            string result = "";
            List<string> vals = [.. wildcard.Options];
            for (int i = 0; i < count; i++)
            {
                int index;
                if (context.Input.Get(T2IParamTypes.WildcardSeedBehavior, "Random") == "Index")
                {
                    index = context.Input.GetWildcardSeed() % vals.Count;
                }
                else
                {
                    index = context.Input.GetWildcardRandom().Next(vals.Count);
                }
                string choice = vals[index];
                result += context.Parse(choice).Trim() + partSeparator;
                if (vals.Count == 1)
                {
                    vals = [.. wildcard.Options];
                }
                else
                {
                    vals.RemoveAt(index);
                }
            }
            return result.Trim();
        };
        PromptTagProcessors["wc"] = PromptTagProcessors["wildcard"];
        PromptTagLengthEstimators["wildcard"] = (data, context) =>
        {
            string card = T2IParamTypes.GetBestInList(data, WildcardsHelper.ListFiles);
            if (card is null)
            {
                return "";
            }
            WildcardsHelper.Wildcard wildcard = WildcardsHelper.GetWildcard(card);
            int longest = 0;
            string longestStr = "";
            foreach (string val in wildcard.Options)
            {
                string interp = ProcessPromptLikeForLength(val);
                if (interp.Length > longest)
                {
                    longest = interp.Length;
                    longestStr = interp;
                }
            }
            return longestStr;
        };
        PromptTagLengthEstimators["wc"] = PromptTagLengthEstimators["wildcard"];
        PromptTagProcessors["repeat"] = (data, context) =>
        {
            string count, value;
            if (!string.IsNullOrWhiteSpace(context.PreData))
            {
                count = context.PreData;
                value = data;
            }
            else
            {
                (count, value) = data.BeforeAndAfter(',');
            }
            double? countVal = InterpretNumber(count, context);
            if (!countVal.HasValue)
            {
                context.TrackWarning($"Repeat input '{data}' has invalid count (not a number) and will be ignored.");
                return null;
            }
            string result = "";
            for (int i = 0; i < countVal.Value; i++)
            {
                result += context.Parse(value).Trim() + " ";
            }
            return result.Trim();
        };
        PromptTagLengthEstimators["repeat"] = (data, context) =>
        {
            string count, value;
            if (!string.IsNullOrWhiteSpace(context.PreData))
            {
                count = context.PreData;
                value = data;
            }
            else
            {
                (count, value) = data.BeforeAndAfter(',');
            }
            double? countVal = InterpretNumber(count, context);
            if (!countVal.HasValue)
            {
                return "";
            }
            string interp = ProcessPromptLikeForLength(value);
            string result = "";
            for (int i = 0; i < countVal.Value; i++)
            {
                result += interp + " ";
            }
            return result.Trim();
        };
        PromptTagProcessors["preset"] = (data, context) =>
        {
            string param = context.Param;
            string name = context.Parse(data);
            T2IPreset preset = context.Input.SourceSession.User.GetPreset(name);
            if (preset is null)
            {
                context.TrackWarning($"Preset '{name}' does not exist and will be ignored.");
                return null;
            }
            preset.ApplyTo(context.Input);
            context.Input.ApplySpecialLogic();
            if (preset.ParamMap.TryGetValue(param, out string prompt))
            {
                return "\0preset:" + prompt;
            }
            return "";
        };
        PromptTagProcessors["p"] = PromptTagProcessors["preset"];
        static string estimateEmpty(string data, PromptTagContext context)
        {
            return "";
        }
        PromptTagLengthEstimators["preset"] = estimateEmpty;
        PromptTagLengthEstimators["p"] = estimateEmpty;
        PromptTagProcessors["embed"] = (data, context) =>
        {
            data = context.Parse(data);
            context.Embeds ??= [.. Program.T2IModelSets["Embedding"].ListModelNamesFor(context.Input.SourceSession)];
            string want = data.ToLowerFast().Replace('\\', '/');
            string matched = T2IParamTypes.GetBestModelInList(want, context.Embeds);
            if (matched is null)
            {
                context.TrackWarning($"Embedding '{want}' does not exist and will be ignored.");
                return "";
            }
            T2IModel embedModel = Program.T2IModelSets["Embedding"].GetModel(matched);
            if (embedModel is not null && Program.ServerSettings.Metadata.ImageMetadataIncludeModelHash)
            {
                embedModel.GetOrGenerateTensorHashSha256(); // Ensure hash is preloaded
            }
            if (matched.Contains(' '))
            {
                context.TrackWarning($"Embedding model {matched} contains a space and will most likely not function as intended. Please remove spaces from the filename.");
            }
            else
            {
                List<string> usedEmbeds = context.Input.ExtraMeta.GetOrCreate("used_embeddings", () => new List<string>()) as List<string>;
                usedEmbeds.Add(T2IParamTypes.CleanModelName(matched));
            }
            return "\0swarmembed:" + matched + "\0end";
        };
        PromptTagProcessors["embedding"] = PromptTagProcessors["embed"];
        PromptTagPostProcessors["lora"] = (data, context) =>
        {
            data = context.Parse(data);
            string lora = data.ToLowerFast().Replace('\\', '/');
            int colonIndex = lora.IndexOf(':');
            double strength = 1;
            double tencStrength = double.NaN;
            if (colonIndex != -1)
            {
                string after = lora[(colonIndex + 1)..];
                lora = lora[..colonIndex];
                colonIndex = after.IndexOf(':');
                if (colonIndex != -1)
                {
                    strength = double.Parse(after[..colonIndex]);
                    after = after[(colonIndex + 1)..];
                    tencStrength = double.Parse(after);
                }
                else
                {
                    strength = double.Parse(after);
                }
            }
            context.Loras ??= [.. Program.T2IModelSets["LoRA"].ListModelNamesFor(context.Input.SourceSession)];
            string matched = T2IParamTypes.GetBestModelInList(lora, context.Loras);
            if (matched is null)
            {
                context.TrackWarning($"Lora '{lora}' does not exist and will be ignored.");
                return null;
            }
            T2IModel loraModel = Program.T2IModelSets["LoRA"].GetModel(matched);
            if (loraModel is not null && Program.ServerSettings.Metadata.ImageMetadataIncludeModelHash)
            {
                loraModel.GetOrGenerateTensorHashSha256(); // Ensure hash is preloaded
            }
            List<string> loraList = context.Input.Get(T2IParamTypes.Loras) ?? [];
            List<string> weights = context.Input.Get(T2IParamTypes.LoraWeights) ?? [];
            List<string> tencWeights = context.Input.Get(T2IParamTypes.LoraTencWeights) ?? [];
            List<string> confinements = context.Input.Get(T2IParamTypes.LoraSectionConfinement);
            if (confinements is not null && confinements.Count > loraList.Count)
            {
                context.Input.Remove(T2IParamTypes.LoraSectionConfinement);
                confinements = null;
            }
            loraList.Add(matched);
            weights.Add(strength.ToString());
            context.Input.Set(T2IParamTypes.Loras, loraList);
            context.Input.Set(T2IParamTypes.LoraWeights, weights);
            if (!double.IsNaN(tencStrength) || tencWeights.Count > 0)
            {
                while (tencWeights.Count < weights.Count - 1)
                {
                    tencWeights.Add(weights[tencWeights.Count]);
                }
                tencWeights.Add((double.IsNaN(tencStrength) ? strength : tencStrength).ToString());
                context.Input.Set(T2IParamTypes.LoraTencWeights, tencWeights);
            }
            string trigger = loraModel?.Metadata?.TriggerPhrase;
            if (!string.IsNullOrWhiteSpace(trigger))
            {
                context.TriggerPhraseExtra += $"{trigger}, ";
                Logs.Verbose($"TriggerPhraseExtra is now {context.TriggerPhraseExtra}");
            }
            if (confinements is null)
            {
                confinements = [];
                for (int i = 0; i < loraList.Count - 1; i++)
                {
                    confinements.Add("-1");
                }
            }
            Logs.Verbose($"LoRA {lora} confined to section {context.SectionID}.");
            confinements.Add($"{context.SectionID}");
            context.Input.Set(T2IParamTypes.LoraSectionConfinement, confinements);
            return "";
        };
        PromptTagPostProcessors["segment"] = (data, context) =>
        {
            context.SectionID++;
            string raw = context.RawCurrentTag.Before("//cid=");
            return $"<{raw}//cid={context.SectionID}>";
        };
        PromptTagPostProcessors["object"] = PromptTagPostProcessors["segment"];
        PromptTagPostProcessors["region"] = PromptTagPostProcessors["segment"];
        PromptTagPostProcessors["extend"] = PromptTagPostProcessors["segment"];
        PromptTagBasicProcessors["break"] = (data, context) =>
        {
            return "<break>";
        };
        PromptTagLengthEstimators["break"] = (data, context) =>
        {
            return "<break>";
        };
        PromptTagLengthEstimators["embed"] = estimateEmpty;
        PromptTagLengthEstimators["embedding"] = estimateEmpty;
        PromptTagLengthEstimators["lora"] = estimateEmpty;
        PromptTagProcessors["setvar"] = (data, context) =>
        {
            string name = context.PreData;
            if (string.IsNullOrWhiteSpace(name))
            {
                context.TrackWarning($"A variable name is required when using setvar.");
                return null;
            }
            data = context.Parse(data);
            context.Variables[name] = data;
            return data;
        };
        PromptTagLengthEstimators["setvar"] = (data, context) =>
        {
            return ProcessPromptLikeForLength(data);
        };
        PromptTagProcessors["var"] = (data, context) =>
        {
            if (!context.Variables.TryGetValue(data, out string val))
            {
                context.TrackWarning($"Variable '{data}' is not recognized.");
                return "";
            }
            return val;
        };
        PromptTagLengthEstimators["var"] = estimateEmpty;
        PromptTagBasicProcessors["trigger"] = (data, context) =>
        {
            List<string> phrases = [];
            void add(string str)
            {
                if (!string.IsNullOrWhiteSpace(str))
                {
                    phrases.Add(str);
                }
            }
            add(context.Input.Get(T2IParamTypes.Model)?.Metadata?.TriggerPhrase);
            if (context.Input.TryGet(T2IParamTypes.Loras, out List<string> loras))
            {
                context.Loras ??= [.. Program.T2IModelSets["LoRA"].ListModelNamesFor(context.Input.SourceSession)];
                foreach (string lora in loras)
                {
                    string matched = T2IParamTypes.GetBestModelInList(lora, context.Loras);
                    if (matched is not null)
                    {
                        add(Program.T2IModelSets["LoRA"].GetModel(matched)?.Metadata?.TriggerPhrase);
                    }
                }
            }
            if (phrases.Any() && string.IsNullOrWhiteSpace(context.TriggerPhraseExtra))
            {
                context.TriggerPhraseExtra = ", ";
                Logs.Verbose("Added trigger phrase extra prefix");
            }
            return phrases.JoinString(", ") + "\0triggerextra";
        };
        PromptTagLengthEstimators["trigger"] = estimateEmpty;
        PromptTagBasicProcessors["comment"] = (data, context) =>
        {
            return "";
        };
        PromptTagLengthEstimators["comment"] = estimateEmpty;
    }

    /// <summary>The raw values in this input. Do not use this directly, instead prefer:
    /// <see cref="Get{T}(T2IRegisteredParam{T})"/>, <see cref="TryGet{T}(T2IRegisteredParam{T}, out T)"/>,
    /// <see cref="Set{T}(T2IRegisteredParam{T}, string)"/>.</summary>
    public Dictionary<string, object> ValuesInput = [];

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
        toret.ValuesInput = new Dictionary<string, object>(ValuesInput.Count);
        foreach ((string key, object val) in ValuesInput)
        {
            object useVal = val;
            if (useVal is List<string> strs) { useVal = new List<string>(strs); }
            else if (useVal is List<Image> imgs) { useVal = new List<Image>(imgs); }
            else if (useVal is List<T2IModel> models) { useVal = new List<T2IModel>(models); }
            toret.ValuesInput[key] = useVal;
        }
        toret.ExtraMeta = new Dictionary<string, object>(ExtraMeta);
        toret.RequiredFlags = new HashSet<string>(RequiredFlags);
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
        foreach ((string key, object val) in ValuesInput)
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
        foreach ((string key, object origVal) in ValuesInput)
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
            foreach ((string key, object val) in ValuesInput)
            {
                addModelsFor(key, val);
            }
            foreach ((string modelListKey, string subType) in ModelListExtraKeys)
            {
                if (ExtraMeta.TryGetValue(modelListKey, out object val) || ValuesInput.TryGetValue(modelListKey, out val))
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
        ValuesInput["prompt"] = ProcessPromptLike(T2IParamTypes.Prompt);
        ValuesInput["negativeprompt"] = ProcessPromptLike(T2IParamTypes.NegativePrompt);
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
            ValuesInput[param.Type.ID] = val;
        }
        proc(T2IParamTypes.Prompt);
        proc(T2IParamTypes.NegativePrompt);
    }

    /// <summary>Random instance for <see cref="T2IParamTypes.WildcardSeed"/>.</summary>
    public Random WildcardRandom = null;

    /// <summary>Gets the user's set wildcard seed.</summary>
    public int GetWildcardSeed()
    {
        long rawVal = -1;
        if (TryGet(T2IParamTypes.WildcardSeed, out long wildcardSeed))
        {
            rawVal = wildcardSeed;
        }
        else
        {
            wildcardSeed = Get(T2IParamTypes.Seed) + Get(T2IParamTypes.VariationSeed, 0) + 17;
        }
        if (wildcardSeed > int.MaxValue)
        {
            wildcardSeed %= int.MaxValue;
        }
        if (wildcardSeed < 0)
        {
            wildcardSeed = Random.Shared.Next(int.MaxValue);
        }
        if (wildcardSeed != rawVal)
        {
            Set(T2IParamTypes.WildcardSeed, wildcardSeed);
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
    public string ProcessPromptLike(T2IRegisteredParam<string> param)
    {
        string val = Get(param);
        if (val is null)
        {
            return "";
        }
        string fixedVal = val.Replace('\0', '\a').Replace("\a", "");
        PromptTagContext context = new() { Input = this, Param = param.Type.ID };
        fixedVal = ProcessPromptLike(fixedVal, context, true);
        if (fixedVal != val && !ExtraMeta.ContainsKey($"original_{param.Type.ID}"))
        {
            ExtraMeta[$"original_{param.Type.ID}"] = val;
        }
        return fixedVal.Replace("\a", "");
    }

    /// <summary>Special utility to process prompt inputs before the request is executed (to parse wildcards, embeddings, etc).</summary>
    public string ProcessPromptLike(string val, PromptTagContext context, bool isMain)
    {
        if (val is null)
        {
            return null;
        }
        string addBefore = "", addAfter = "";
        void processSet(Dictionary<string, Func<string, PromptTagContext, string>> set, bool requireData)
        {
            val = StringConversionHelper.QuickSimpleTagFiller(val, "<", ">", tag =>
            {
                (string prefix, string data) = tag.BeforeAndAfter(':');
                string preData = null;
                if (prefix.EndsWith(']') && prefix.Contains('['))
                {
                    (prefix, preData) = prefix.BeforeLast(']').BeforeAndAfter('[');
                }
                prefix = prefix.ToLowerFast();
                context.RawCurrentTag = tag;
                context.PreData = preData;
                Logs.Verbose($"[Prompt Parsing] Found tag {val}, will fill... prefix = '{prefix}', data = '{data}', predata = '{preData}'");
                if ((!string.IsNullOrWhiteSpace(data) || !requireData) && set.TryGetValue(prefix, out Func<string, PromptTagContext, string> proc))
                {
                    string result = proc(data, context);
                    if (result is not null)
                    {
                        if (result.StartsWithNull()) // Special case for preset tag modifying the current value
                        {
                            string cleanResult = result[1..];
                            if (cleanResult.StartsWith("preset:"))
                            {
                                cleanResult = cleanResult["preset:".Length..];
                                if (cleanResult.Contains("{value}"))
                                {
                                    addBefore += ProcessPromptLike(cleanResult.Before("{value}"), context, isMain);
                                }
                                addAfter += ProcessPromptLike(cleanResult.After("{value}"), context, isMain);
                                return "";
                            }
                        }
                        return result;
                    }
                }
                return $"<{tag}>";
            }, false, 0);
        }
        processSet(PromptTagBasicProcessors, false);
        processSet(PromptTagProcessors, true);
        processSet(PromptTagPostProcessors, true);
        if (isMain)
        {
            string triggerPhrase = context.TriggerPhraseExtra;
            if (triggerPhrase.Length > 1) // trim the ", "
            {
                triggerPhrase = triggerPhrase[..^2];
            }
            val = val.Replace("\0triggerextra", triggerPhrase);
        }
        return addBefore + val + addAfter;
    }

    public static string ProcessPromptLikeForLength(string val)
    {
        if (val is null)
        {
            return null;
        }
        PromptTagContext context = new();
        void processSet(Dictionary<string, Func<string, PromptTagContext, string>> set)
        {
            val = StringConversionHelper.QuickSimpleTagFiller(val, "<", ">", tag =>
            {
                (string prefix, string data) = tag.BeforeAndAfter(':');
                string preData = null;
                if (prefix.EndsWith(']') && prefix.Contains('['))
                {
                    (prefix, preData) = prefix.BeforeLast(']').BeforeAndAfter('[');
                }
                context.PreData = preData;
                if (set.TryGetValue(prefix, out Func<string, PromptTagContext, string> proc))
                {
                    string result = proc(data, context);
                    if (result is not null)
                    {
                        return result;
                    }
                }
                return $"<{tag}>";
            }, false, 0);
        }
        processSet(PromptTagLengthEstimators);
        return val;
    }

    /// <summary>Gets the raw value of the parameter, if it is present, or null if not.</summary>
    public object GetRaw(T2IParamType param)
    {
        return ValuesInput.GetValueOrDefault(param.ID);
    }

    /// <summary>Gets the value of the parameter, if it is present, or default if not.</summary>
    public T Get<T>(T2IRegisteredParam<T> param) => Get(param, default, true);

    /// <summary>Gets the value of the parameter, if it is present, or default if not.</summary>
    public T Get<T>(T2IRegisteredParam<T> param, T defVal, bool autoFixDefault = false)
    {
        if (!ValuesInput.TryGetValue(param.Type.ID, out object val))
        {
            if (autoFixDefault && !string.IsNullOrWhiteSpace(param.Type.Default))
            {
                Set(param.Type, param.Type.Default);
                T result = Get(param, defVal, false);
                Remove(param);
                return result;
            }
            return defVal;
        }
        if (val is long lVal && typeof(T) == typeof(int))
        {
            val = (int)lVal;
        }
        if (val is double dVal && typeof(T) == typeof(float))
        {
            val = (float)dVal;
        }
        return (T)val;
    }

    /// <summary>Gets the value of the parameter as a string, if it is present, or null if not.</summary>
    public string GetString<T>(T2IRegisteredParam<T> param)
    {
        if (ValuesInput.TryGetValue(param.Type.ID, out object val))
        {
            return $"{(T)val}";
        }
        return null;
    }

    /// <summary>Tries to get the value of the parameter. If it is present, returns true and outputs the value. If it is not present, returns false.</summary>
    public bool TryGet<T>(T2IRegisteredParam<T> param, out T val)
    {
        if (ValuesInput.TryGetValue(param.Type.ID, out object valObj))
        {
            val = (T)valObj;
            return true;
        }
        val = default;
        return false;
    }

    /// <summary>Tries to get the value of the parameter. If it is present, returns true and outputs the value. If it is not present, returns false.</summary>
    public bool TryGetRaw(T2IParamType param, out object val)
    {
        if (ValuesInput.TryGetValue(param.ID, out object valObj))
        {
            val = valObj;
            return true;
        }
        val = default;
        return false;
    }

    /// <summary>Sets the value of an input parameter to a given plaintext input. Will run the 'Clean' call if needed.</summary>
    public void Set(T2IParamType param, string val)
    {
        if (param.Clean is not null)
        {
            val = param.Clean(ValuesInput.TryGetValue(param.ID, out object valObj) ? valObj.ToString() : null, val);
        }
        T2IModel getModel(string name)
        {
            T2IModelHandler handler = Program.T2IModelSets[param.Subtype ?? "Stable-Diffusion"];
            string best = T2IParamTypes.GetBestModelInList(name.Replace('\\', '/'), [.. handler.ListModelNamesFor(SourceSession)]);
            if (best is null)
            {
                return null;
            }
            T2IModel model = handler.GetModel(best);
            if (model is null)
            {
                return null;
            }
            model.AutoWarn();
            if (Program.ServerSettings.Metadata.ImageMetadataIncludeModelHash)
            {
                model.GetOrGenerateTensorHashSha256(); // Ensure hash is preloaded early
            }
            return model;
        }
        if (param.IgnoreIf is not null && param.IgnoreIf == val)
        {
            ValuesInput.Remove(param.ID);
            return;
        }
        Image imageFor(string val)
        {
            if (val.StartsWithFast("data:"))
            {
                return Image.FromDataString(val);
            }
            return new Image(val, Image.ImageType.IMAGE, "png");
        }
        object obj = param.Type switch
        {
            T2IParamDataType.INTEGER => param.SharpType == typeof(long) ? long.Parse(val) : int.Parse(val),
            T2IParamDataType.DECIMAL => param.SharpType == typeof(double) ? double.Parse(val) : float.Parse(val),
            T2IParamDataType.BOOLEAN => bool.Parse(val),
            T2IParamDataType.TEXT or T2IParamDataType.DROPDOWN => val,
            T2IParamDataType.IMAGE => imageFor(val),
            T2IParamDataType.IMAGE_LIST => val.Split('|').Select(v => imageFor(v)).ToList(),
            T2IParamDataType.MODEL => getModel(val),
            T2IParamDataType.LIST => val.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
            _ => throw new NotImplementedException()
        };
        if (param.SharpType == typeof(int))
        {
            obj = unchecked((int)(long)obj); // WTF. Yes this double-cast is needed. No I can't explain why. Ternaries are broken maybe?
        }
        if (param.SharpType == typeof(float))
        {
            obj = (float)(double)obj;
        }
        if (obj is null)
        {
            Logs.Debug($"Ignoring input to parameter '{param.ID}' of '{val}' because the value maps to null.");
            if (param.ID == "model")
            {
                Logs.Warning($"Model input '{val}' appears to be null.");
            }
            return;
        }
        ValuesInput[param.ID] = obj;
        if (param.FeatureFlag is not null)
        {
            RequiredFlags.Add(param.FeatureFlag);
        }
    }

    /// <summary>Sets the direct raw value of a given parameter, without processing.</summary>
    public void Set<T>(T2IRegisteredParam<T> param, T val)
    {
        if (param.Type.Clean is not null)
        {
            Set(param.Type, val is List<string> list ? list.JoinString(",") : val.ToString());
            return;
        }
        if (param.Type.IgnoreIf is not null && param.Type.IgnoreIf == $"{val}")
        {
            ValuesInput.Remove(param.Type.ID);
            return;
        }
        ValuesInput[param.Type.ID] = val;
        if (param.Type.FeatureFlag is not null)
        {
            RequiredFlags.Add(param.Type.FeatureFlag);
        }
    }
    
    /// <summary>Removes a param.</summary>
    public void Remove<T>(T2IRegisteredParam<T> param)
    {
        ValuesInput.Remove(param.Type.ID);
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
        return $"T2IParamInput({string.Join(", ", ValuesInput.Select(x => $"{x.Key}: {stringifyVal(x.Value)}"))})";
    }
}
