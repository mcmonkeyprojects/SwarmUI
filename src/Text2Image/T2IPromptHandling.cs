using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using SwarmUI.Core;
using SwarmUI.Utils;

namespace SwarmUI.Text2Image;

/// <summary>
/// Helpers for <see cref="T2IParamInput"/> to process prompt inputs.
/// </summary>
public class T2IPromptHandling
{
    public class PromptTagContext
    {
        public T2IParamInput Input;

        public string Param;

        public string[] Embeds, Loras;

        public Dictionary<string, string> Variables = [];

        public Dictionary<string, string> Macros = [];

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
            int sectionId = SectionID;
            string result = ProcessPromptLike(text, this, false);
            SectionID = sectionId;
            Depth--;
            return result;
        }
    }

    /// <summary>Escapes text to for handling by the special text handler python script.</summary>
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

    /// <summary>Mapping of prompt tags that can run very early on or require no input.</summary>
    public static Dictionary<string, Func<string, PromptTagContext, string>> PromptTagBasicProcessors = [];

    /// <summary>Mapping of prompt tag prefixes, to allow for registration of custom prompt tags - specifically post-processing like lora (which remove from prompt and get read elsewhere).</summary>
    public static Dictionary<string, Func<string, PromptTagContext, string>> PromptTagPostProcessors = [];

    /// <summary>Mapping of prompt tag prefixes, to strings intended to allow for estimating token count.</summary>
    public static Dictionary<string, Func<string, PromptTagContext, string>> PromptTagLengthEstimators = [];

    /// <summary>Interprets a random number range input by a user, if the input is a number range.</summary>
    public static bool TryInterpretNumberRange(string inputVal, PromptTagContext context, out string number)
    {
        (string preDash, string postDash) = inputVal.BeforeAndAfter('-');
        preDash = preDash.Trim();
        postDash = postDash.Trim();
        if (long.TryParse(preDash, out long int1) && long.TryParse(postDash, out long int2))
        {
            number = $"{context.Input.GetWildcardRandom().NextInt64(int1, int2 + 1)}";
            return true;
        }
        if (double.TryParse(preDash, out double num1) && double.TryParse(postDash, out double num2))
        {
            int decimals1 = preDash.Contains('.') ? preDash.Length - preDash.IndexOf('.') : 0;
            int decimals2 = postDash.Contains('.') ? postDash.Length - postDash.IndexOf('.') : 0;
            int useDecimals = Math.Max(decimals1, decimals2);
            double randVal = context.Input.GetWildcardRandom().NextDouble() * (num2 - num1) + num1;
            number = randVal.ToString($"F{useDecimals - 1}");
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

    static T2IPromptHandling()
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
            data = context.Parse(data);
            string[] dataParts = data.SplitFast(',', 1);
            data = dataParts[0];
            HashSet<string> exclude = [];
            if (dataParts.Length > 1 && dataParts[1].StartsWithFast("not="))
            {
                exclude.UnionWith(SplitSmart(dataParts[1].After('=')));
            }
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
            if (data.Length < card.Length)
            {
                Logs.Warning($"Wildcard input '{data}' is not a valid wildcard name, but appears to match '{card}', will use that instead.");
            }
            WildcardsHelper.Wildcard wildcard = WildcardsHelper.GetWildcard(card);
            List<string> usedWildcards = context.Input.ExtraMeta.GetOrCreate("used_wildcards", () => new List<string>()) as List<string>;
            usedWildcards.Add(card);
            string[] options = wildcard.Options;
            if (exclude.Count > 0)
            {
                options = [.. options.Except(exclude)];
            }
            if (options.Length == 0)
            {
                return "";
            }
            List<string> vals = [.. options];
            string result = "";
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
                    vals = [.. options];
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
            string card = T2IParamTypes.GetBestInList(data.Before(','), WildcardsHelper.ListFiles);
            if (card is null)
            {
                return "";
            }
            WildcardsHelper.Wildcard wildcard = WildcardsHelper.GetWildcard(card);
            if (wildcard.MaxLength is not null)
            {
                return wildcard.MaxLength;
            }
            wildcard.MaxLength = ""; // Recursion protection.
            int longest = 0;
            string longestStr = "";
            foreach (string val in wildcard.Options)
            {
                string interp = ProcessPromptLikeForLength(val);
                if (interp.Length > longest) // TODO: Tokenization length should be used rather than string length
                {
                    longest = interp.Length;
                    longestStr = interp;
                }
            }
            wildcard.MaxLength = longestStr;
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
        static string estimateAsSectionBreak(string data, PromptTagContext context)
        {
            return "<break>";
        }
        PromptTagLengthEstimators["preset"] = estimateEmpty;
        PromptTagLengthEstimators["p"] = estimateEmpty;
        PromptTagProcessors["param"] = (data, context) =>
        {
            string preData = context.PreData;
            if (preData is null)
            {
                context.TrackWarning("Prompt tag 'param' requires pre-data to specify the parameter name.");
                return null;
            }
            data = context.Parse(data).Trim();
            if (T2IParamTypes.TryGetType(preData, out T2IParamType type, context.Input))
            {
                T2IParamTypes.ApplyParameter(preData, data, context.Input, type.CanSectionalize ? context.SectionID : 0);
                return "";
            }
            context.TrackWarning($"Parameter '{preData}' does not exist and will be ignored.");
            return null;
        };
        PromptTagLengthEstimators["param"] = estimateEmpty;
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
            string shortMatch = matched.Replace(".safetensors", "");
            if (want.Length < shortMatch.Length)
            {
                Logs.Warning($"Embed input '{data}' is not a valid embedding name, but appears to match '{shortMatch}', will use that instead.");
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
                context.TrackWarning($"Lora '{lora}' does not exist and will be ignored (out of {context.Loras.Length} existing loras).");
                return null;
            }
            if (matched.EndsWith(".safetensors"))
            {
                matched = matched.BeforeLast('.');
            }
            if (lora.Length < matched.Length)
            {
                Logs.Warning($"LoRA input '{lora}' is not a valid LoRA model name, but appears to match '{matched}', will use that instead.");
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
            if (!(context.Input.SourceSession?.User?.Settings?.ParamParsing?.AllowLoraStacking ?? true) && loraList.Contains(matched))
            {
                context.TrackWarning($"LoRA '{matched}' is already applied and will not be added again.");
                return "";
            }
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
            List<string> promptedLoras = context.Input.ExtraMeta.GetOrCreate("prompted_loras", () => new List<string>()) as List<string>;
            promptedLoras.Add(T2IParamTypes.CleanModelName(matched));
            return "";
        };
        PromptTagBasicProcessors["base"] = (data, context) =>
        {
            context.SectionID = T2IParamInput.SectionID_BaseOnly;
            return $"<base//cid={T2IParamInput.SectionID_BaseOnly}>";
        };
        PromptTagLengthEstimators["base"] = estimateAsSectionBreak;
        PromptTagBasicProcessors["refiner"] = (data, context) =>
        {
            context.SectionID = T2IParamInput.SectionID_Refiner;
            return $"<refiner//cid={T2IParamInput.SectionID_Refiner}>";
        };
        PromptTagLengthEstimators["refiner"] = estimateAsSectionBreak;
        PromptTagBasicProcessors["video"] = (data, context) =>
        {
            context.SectionID = T2IParamInput.SectionID_Video;
            return $"<video//cid={T2IParamInput.SectionID_Video}>";
        };
        PromptTagLengthEstimators["video"] = estimateAsSectionBreak;
        PromptTagBasicProcessors["videoswap"] = (data, context) =>
        {
            context.SectionID = T2IParamInput.SectionID_VideoSwap;
            return $"<videoswap//cid={T2IParamInput.SectionID_VideoSwap}>";
        };
        PromptTagLengthEstimators["video"] = estimateAsSectionBreak;
        string autoConfine(string data, PromptTagContext context)
        {
            if (context.SectionID < 10)
            {
                context.SectionID = 10;
            }
            context.SectionID++;
            string raw = context.RawCurrentTag.Before("//cid=");
            return $"<{raw}//cid={context.SectionID}>";
        }
        PromptTagBasicProcessors["segment"] = autoConfine;
        PromptTagBasicProcessors["object"] = autoConfine;
        PromptTagBasicProcessors["region"] = autoConfine;
        PromptTagBasicProcessors["extend"] = autoConfine;
        PromptTagBasicProcessors["break"] = (data, context) =>
        {
            return "<break>";
        };
        PromptTagLengthEstimators["break"] = estimateAsSectionBreak;
        PromptTagLengthEstimators["embed"] = estimateEmpty;
        PromptTagLengthEstimators["embedding"] = estimateEmpty;
        PromptTagLengthEstimators["lora"] = estimateEmpty;
        PromptTagProcessors["setvar"] = (data, context) =>
        {
            string name = context.PreData.BeforeAndAfter(',', out string mode);
            if (string.IsNullOrWhiteSpace(name))
            {
                context.TrackWarning($"A variable name is required when using setvar.");
                return null;
            }
            data = context.Parse(data);
            context.Variables[name] = data;
            return mode.ToLowerFast().Trim() == "false" ? "" : data;
        };
        PromptTagLengthEstimators["setvar"] = (data, context) =>
        {
            return ProcessPromptLikeForLength(data);
        };
        PromptTagProcessors["var"] = (data, context) =>
        {
            string name = string.IsNullOrWhiteSpace(data) ? context.PreData : data;
            if (!context.Variables.TryGetValue(name, out string val))
            {
                context.TrackWarning($"Variable '{name}' is not recognized.");
                return "";
            }
            return val;
        };
        PromptTagLengthEstimators["var"] = estimateEmpty;
        PromptTagProcessors["setmacro"] = (data, context) =>
        {
            string name = context.PreData.BeforeAndAfter(',', out string mode);
            if (string.IsNullOrWhiteSpace(name))
            {
                context.TrackWarning($"A macro name is required when using setmacro.");
                return null;
            }
            context.Macros[name] = data;
            return mode.ToLowerFast().Trim() == "false" ? "" : context.Parse(data);
        };
        PromptTagLengthEstimators["setmacro"] = (data, context) =>
        {
            return ProcessPromptLikeForLength(data);
        };
        PromptTagProcessors["macro"] = (data, context) =>
        {
            string name = string.IsNullOrWhiteSpace(data) ? context.PreData : data;
            if (!context.Macros.TryGetValue(name, out string val))
            {
                context.TrackWarning($"Macro '{name}' is not recognized.");
                return "";
            }
            return context.Parse(val);
        };
        PromptTagLengthEstimators["macro"] = estimateEmpty;
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
                        add(Program.T2IModelSets["LoRA"].GetModel(matched)?.Metadata?.TriggerPhrase.Replace(';', ','));
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

    /// <summary>Special utility to process prompt inputs before the request is executed (to parse wildcards, embeddings, etc).</summary>
    public static string ProcessPromptLike(string val, PromptTagContext context, bool isMain)
    {
        if (val is null)
        {
            return null;
        }
        string addBefore = "", addAfter = "";
        int baseSectionId = context.SectionID;
        void processSet(Dictionary<string, Func<string, PromptTagContext, string>> set)
        {
            context.SectionID = baseSectionId;
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
                int sectionId = context.SectionID;
                Logs.Verbose($"[Prompt Parsing] Found tag {val}, will fill... prefix = '{prefix}', data = '{data}', predata = '{preData}', section = '{sectionId}'");
                if (set.TryGetValue(prefix, out Func<string, PromptTagContext, string> proc))
                {
                    string result = proc(data, context);
                    if (sectionId != context.SectionID)
                    {
                        Logs.Verbose($"[Prompt Parsing] Section ID changed from {sectionId} to {context.SectionID}");
                    }
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
                int cidCut = tag.LastIndexOf("//cid=");
                if (cidCut != -1)
                {
                    sectionId = int.Parse(tag[(cidCut + "//cid=".Length)..]);
                    Logs.Verbose($"[Prompt Parsing] Section ID changed by a prior mapping from {context.SectionID} to  {sectionId}");
                    context.SectionID = sectionId;
                }
                return $"<{tag}>";
            }, false, 0);
        }
        processSet(PromptTagBasicProcessors);
        processSet(PromptTagProcessors);
        processSet(PromptTagPostProcessors);
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
}
