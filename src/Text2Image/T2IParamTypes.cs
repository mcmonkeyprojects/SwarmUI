using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using System.IO;

namespace SwarmUI.Text2Image;

/// <summary>Represents the data-type of a Text2Image parameter type.</summary>
public enum T2IParamDataType
{
    /// <summary>Default/unset value to be filled.</summary>
    UNSET,
    /// <summary>Raw text input.</summary>
    TEXT,
    /// <summary>Integer input (number without decimal).</summary>
    INTEGER,
    /// <summary>Number with decimal input.</summary>
    DECIMAL,
    /// <summary>Input is just 'true' or 'false'; a checkbox.</summary>
    BOOLEAN,
    /// <summary>Selection explicitly from a list.</summary>
    DROPDOWN,
    /// <summary>Image file input.</summary>
    IMAGE,
    /// <summary>Model reference input.</summary>
    MODEL,
    /// <summary>Multi-select or comma-separated data list.</summary>
    LIST,
    /// <summary>List of images.</summary>
    IMAGE_LIST
}

/// <summary>Which format to display a number in.</summary>
public enum ParamViewType
{
    /// <summary>Use whatever the default is.</summary>
    NORMAL,
    /// <summary>Prompt-text box.</summary>
    PROMPT,
    /// <summary>Small numeric input box.</summary>
    SMALL,
    /// <summary>Large input box.</summary>
    BIG,
    /// <summary>Ordinary range slider.</summary>
    SLIDER,
    /// <summary>Power-of-Two slider, used especially for Width/Height of an image.</summary>
    POT_SLIDER,
    /// <summary>Random-seed input.</summary>
    SEED
}

/// <summary>
/// Defines a parameter type for Text2Image, in full, for usage in the UI and more.
/// </summary>
/// <param name="Name">The (full, proper) name of the parameter.</param>
/// <param name="Description">A user-friendly description text of what the parameter is/does.</param>
/// <param name="Default">A default value for this parameter.</param>
/// <param name="Min">(For numeric types) the minimum value.</param>
/// <param name="Max">(For numeric types) the maximum value.</param>
/// <param name="ViewMax">(For numeric types) the *visual* minimum value (allowed to exceed).</param>
/// <param name="ViewMax">(For numeric types) the *visual* maximum value (allowed to exceed).</param>
/// <param name="Step">(For numeric types) the step rate for UI usage.</param>
/// <param name="Clean">An optional special method to clean up text input (input = prior,new). Prior can be null.</param>
/// <param name="GetValues">A method that returns a list of valid values, for input validation.</param>
/// <param name="Examples">A set of example values to be visible in some UIs.</param>
/// <param name="ParseList">An optional special method to clean up a list of text inputs.</param>
/// <param name="ValidateValues">If set to false, prevents the normal validation of the 'Values' list.</param>
/// <param name="VisibleNormally">Whether the parameter should be visible in the main UI.</param>
/// <param name="IsAdvanced">If set true, this is an advanced setting that should be hidden by a dropdown.</param>
/// <param name="FeatureFlag">If set, this parameter is only available when backends or models provide the given feature flag.</param>
/// <param name="Permission">If set, users must have the given permission flag to use this parameter.</param>
/// <param name="Toggleable">If true, the setting's presence can be toggled on/off.</param>
/// <param name="OrderPriority">Value to help sort parameter types appropriately.</param>
/// <param name="Group">Optional grouping info.</param>
/// <param name="IgnoreIf">Ignore this parameter if the value is equal to this.</param>
/// <param name="ViewType">How to display a number input.</param>
/// <param name="HideFromMetadata">Whether to hide this parameter from image metadata.</param>
/// <param name="MetadataFormat">Optional function to reformat value for display in metadata.</param>
/// <param name="AlwaysRetain">If true, the parameter will be retained when otherwise it would be removed (for example, by comfy workflow usage).</param>
/// <param name="ChangeWeight">Weighting value used to indicate, as a relative weight, how much processing time is needed to change the value of this parameter type - this is used for example for grids to do speed priority sorting. 0 is normal, 10 is model change.</param>
/// <param name="ExtraHidden">If true, agressively hide from anything.</param>
/// <param name="Type">The type of the type - text vs integer vs etc (will be set when registering).</param>
/// <param name="DoNotSave">Can be set to forbid tracking/saving of a param value.</param>
/// <param name="ImageShouldResize">(For Image-type params) If true, the image should resize to match the target resolution.</param>
/// <param name="ImageAlwaysB64">(For Image-type params) If true, always use B64 (never file).</param>
/// <param name="DoNotPreview">If this is true, the parameter is unfit for previewing (eg long generation addons or unnecessary refinements).</param>
/// <param name="Nonreusable">If this is true, the parameter can never be 'reused'.</param>
/// <param name="Subtype">The sub-type of the type - for models, this might be eg "Stable-Diffusion".</param>
/// <param name="ID">The raw ID of this parameter (will be set when registering).</param>
/// <param name="SharpType">The C# datatype.</param>
public record class T2IParamType(string Name, string Description, string Default, double Min = 0, double Max = 0, double Step = 1, double ViewMin = 0, double ViewMax = 0,
    Func<string, string, string> Clean = null, Func<Session, List<string>> GetValues = null, string[] Examples = null, Func<List<string>, List<string>> ParseList = null, bool ValidateValues = true,
    bool VisibleNormally = true, bool IsAdvanced = false, string FeatureFlag = null, PermInfo Permission = null, bool Toggleable = false, double OrderPriority = 10, T2IParamGroup Group = null, string IgnoreIf = null,
    ParamViewType ViewType = ParamViewType.SMALL, bool HideFromMetadata = false, Func<string, string> MetadataFormat = null, bool AlwaysRetain = false, double ChangeWeight = 0, bool ExtraHidden = false,
    T2IParamDataType Type = T2IParamDataType.UNSET, bool DoNotSave = false, bool ImageShouldResize = true, bool ImageAlwaysB64 = false, bool DoNotPreview = false, bool Nonreusable = false,
    string Subtype = null, string ID = null, Type SharpType = null)
{
    public JObject ToNet(Session session)
    {
        JToken values = null;
        JToken valueNames = null;
        if (GetValues is not null)
        {
            List<string> rawVals = GetValues(session);
            values = JArray.FromObject(rawVals.Select(v => v.Before("///")).ToList());
            valueNames = JArray.FromObject(rawVals.Select(v => v.After("///")).ToList());
        }
        return new JObject()
        {
            ["name"] = Name,
            ["id"] = ID,
            ["description"] = Description,
            ["type"] = Type.ToString().ToLowerFast(),
            ["subtype"] = Subtype,
            ["default"] = Default,
            ["min"] = Min,
            ["max"] = Max,
            ["view_min"] = ViewMin,
            ["view_max"] = ViewMax,
            ["step"] = Step,
            ["values"] = values,
            ["value_names"] = valueNames,
            ["examples"] = Examples == null ? null : JToken.FromObject(Examples),
            ["visible"] = VisibleNormally,
            ["advanced"] = IsAdvanced,
            ["feature_flag"] = FeatureFlag,
            ["toggleable"] = Toggleable,
            ["priority"] = OrderPriority,
            ["group"] = Group?.ToNet(session),
            ["always_retain"] = AlwaysRetain,
            ["do_not_save"] = DoNotSave,
            ["do_not_preview"] = DoNotPreview,
            ["view_type"] = ViewType.ToString().ToLowerFast(),
            ["extra_hidden"] = ExtraHidden,
            ["nonreusable"] = Nonreusable
        };
    }

    public static T2IParamType FromNet(JObject data)
    {
        string getStr(string key) => data.TryGetValue(key, out JToken tok) && tok.Type != JTokenType.Null ? $"{tok}" : null;
        double getDouble(string key) => data.TryGetValue(key, out JToken tok) && tok.Type != JTokenType.Null && double.TryParse($"{tok}", out double tokVal) ? tokVal : 0;
        bool getBool(string key, bool def) => data.TryGetValue(key, out JToken tok) && tok.Type != JTokenType.Null && bool.TryParse($"{tok}", out bool tokVal) ? tokVal : def;
        T getEnum<T>(string key, T def) where T : struct => data.TryGetValue(key, out JToken tok) && tok.Type != JTokenType.Null && Enum.TryParse($"{tok}", true, out T tokVal) ? tokVal : def;
        List<string> getList(string key) => data.TryGetValue(key, out JToken tok) && tok.Type != JTokenType.Null ? tok.ToObject<List<string>>() : null;
        List<string> vals = getList("values");
        List<string> examples = getList("examples");
        T2IParamDataType type = getEnum("type", T2IParamDataType.UNSET);
        return new(Name: getStr("name"), Description: getStr("description"), Default: getStr("default"), ID: getStr("id"),
            Type: type, SharpType: T2IParamTypes.DataTypeToSharpType(type),
            Min: getDouble("min"), Max: getDouble("max"), Step: getDouble("step"), ViewMax: getDouble("view_max"), OrderPriority: getDouble("priority"),
            GetValues: vals is null ? null : _ => vals, Examples: examples?.ToArray(), Subtype: getStr("subtype"), FeatureFlag: getStr("feature_flag"),
            VisibleNormally: getBool("visible", true), IsAdvanced: getBool("advanced", false), AlwaysRetain: getBool("always_retain", false),
            ImageShouldResize: getBool("image_should_resize", true), ImageAlwaysB64: getBool("image_always_b64", false),
            DoNotSave: getBool("do_not_save", false), DoNotPreview: getBool("do_not_preview", false), ViewType: getEnum("view_type", ParamViewType.SMALL));
    }
}

/// <summary>Helper class to easily read T2I Parameters.</summary>
/// <typeparam name="T">The C# datatype of the parameter.</typeparam>
public class T2IRegisteredParam<T>
{
    /// <summary>The underlying type data.</summary>
    public T2IParamType Type;
}

/// <summary>Represents a group of parameters.</summary>
/// <param name="Name">The name of the group.</param>
/// <param name="Toggles">If true, the entire group toggles as one.</param>
/// <param name="Open">If true, the group defaults open. If false, it defaults to closed.</param>
/// <param name="OrderPriority">The priority order position to put this group in.</param>
/// <param name="Description">Optional description/explanation text of the group.</param>
/// <param name="IsAdvanced">If true, this is an advanced setting group that should be hidden by a dropdown.</param>
/// <param name="CanShrink">If true, the group can be shrunk on-page to hide it. If false, it is always open.</param>
public record class T2IParamGroup(string Name, bool Toggles = false, bool Open = true, double OrderPriority = 10, string Description = "", bool IsAdvanced = false, bool CanShrink = true)
{
    public JObject ToNet(Session session)
    {
        return new JObject()
        {
            ["name"] = Name,
            ["id"] = T2IParamTypes.CleanTypeName(Name),
            ["toggles"] = Toggles,
            ["open"] = Open,
            ["priority"] = OrderPriority,
            ["description"] = Description,
            ["advanced"] = IsAdvanced,
            ["can_shrink"] = CanShrink
        };
    }
}

/// <summary>Central manager of Text2Image parameter types.</summary>
public class T2IParamTypes
{
    /// <summary>Map of all currently loaded types, by cleaned name.</summary>
    public static Dictionary<string, T2IParamType> Types = [];

    /// <summary>Helper to match valid text for use in a parameter type name.</summary>
    public static AsciiMatcher CleanTypeNameMatcher = new(AsciiMatcher.LowercaseLetters);

    public static T2IParamDataType SharpTypeToDataType(Type t, bool hasValues)
    {
        if (t == typeof(int) || t == typeof(long)) return T2IParamDataType.INTEGER;
        if (t == typeof(float) || t == typeof(double)) return T2IParamDataType.DECIMAL;
        if (t == typeof(bool)) return T2IParamDataType.BOOLEAN;
        if (t == typeof(string)) return hasValues ? T2IParamDataType.DROPDOWN : T2IParamDataType.TEXT;
        if (t == typeof(Image)) return T2IParamDataType.IMAGE;
        if (t == typeof(T2IModel)) return T2IParamDataType.MODEL;
        if (t == typeof(List<string>)) return T2IParamDataType.LIST;
        if (t == typeof(List<Image>)) return T2IParamDataType.IMAGE_LIST;
        return T2IParamDataType.UNSET;
    }

    public static Type DataTypeToSharpType(T2IParamDataType t)
    {
        return t switch {
            T2IParamDataType.INTEGER => typeof(long),
            T2IParamDataType.DECIMAL => typeof(double),
            T2IParamDataType.BOOLEAN => typeof(bool),
            T2IParamDataType.TEXT => typeof(string),
            T2IParamDataType.DROPDOWN => typeof(string),
            T2IParamDataType.IMAGE => typeof(Image),
            T2IParamDataType.MODEL => typeof(T2IModel),
            T2IParamDataType.LIST => typeof(List<string>),
            T2IParamDataType.IMAGE_LIST => typeof(List<Image>),
            _ => null
        };
    }

    /// <summary>Register a new parameter type.</summary>
    public static T2IRegisteredParam<T> Register<T>(T2IParamType type)
    {
        type = type with { ID = CleanTypeName(type.Name), Type = SharpTypeToDataType(typeof(T), type.GetValues != null), SharpType = typeof(T) };
        Types.Add(type.ID, type);
        LanguagesHelper.AppendSetInternal(type.Name, type.Description);
        return new T2IRegisteredParam<T>() { Type = type };
    }

    /// <summary>Type-name cleaner.</summary>
    public static string CleanTypeName(string name)
    {
        return CleanTypeNameMatcher.TrimToMatches(name.ToLowerFast().Trim());
    }

    /// <summary>Generic user-input name cleaner.</summary>
    public static string CleanNameGeneric(string name)
    {
        return name.ToLowerFast().Replace(" ", "").Replace("[", "").Replace("]", "").Trim();
    }

    /// <summary>Strips ".safetensors" from the end of model name for cleanliness.</summary>
    public static string CleanModelName(string name)
    {
        if (name.EndsWithFast(".safetensors"))
        {
            name = name.BeforeLast(".safetensors");
        }
        return name;
    }

    /// <summary>Strips ".safetensors" from the end of model name comma-separated-lists for cleanliness.</summary>
    public static string CleanModelNameList(string names)
    {
        return names.SplitFast(',').Select(s => CleanModelName(s.Trim())).JoinString(",");
    }

    /// <summary>Applies a string edit, with support for "{value}" notation.</summary>
    public static string ApplyStringEdit(string prior, string update)
    {
        if (update.Contains("{value}"))
        {
            prior ??= "";
            string low = prior.ToLowerFast();
            int end = new int[] { low.IndexOf("<segment:"), low.IndexOf("<object:"), low.IndexOf("<region:") }.Where(i => i != -1).Order().FirstOrDefault(-1);
            if (end != -1)
            {
                return update.Replace("{value}", prior[..end].Trim()) + " " + prior[end..].Trim();
            }
            return update.Replace("{value}", prior);
        }
        return update;
    }

    public static T2IRegisteredParam<string> Prompt, NegativePrompt, AspectRatio, BackendType, RefinerMethod, FreeUApplyTo, FreeUVersion, PersonalNote, VideoFormat, VideoResolution, UnsamplerPrompt, ImageFormat, MaskBehavior, ColorCorrectionBehavior, RawResolution, SeamlessTileable, SD3TextEncs, BitDepth, Webhooks, Text2VideoFormat, WildcardSeedBehavior, SegmentSortOrder, TorchCompile, VideoExtendFormat;
    public static T2IRegisteredParam<int> Images, Steps, Width, Height, BatchSize, ExactBackendID, VAETileSize, VAETileOverlap, VAETemporalTileSize, VAETemporalTileOverlap, ClipStopAtLayer, VideoFrames, VideoMotionBucket, VideoFPS, VideoSteps, RefinerSteps, CascadeLatentCompression, MaskShrinkGrow, MaskBlur, MaskGrow, SegmentMaskBlur, SegmentMaskGrow, SegmentMaskOversize, Text2VideoFrames, Text2VideoFPS, TrimVideoStartFrames, TrimVideoEndFrames, VideoExtendFrameOverlap;
    public static T2IRegisteredParam<long> Seed, VariationSeed, WildcardSeed;
    public static T2IRegisteredParam<double> CFGScale, VariationSeedStrength, InitImageCreativity, InitImageResetToNorm, InitImageNoise, RefinerControl, RefinerUpscale, RefinerCFGScale, ReVisionStrength, AltResolutionHeightMult,
        FreeUBlock1, FreeUBlock2, FreeUSkip1, FreeUSkip2, GlobalRegionFactor, EndStepsEarly, SamplerSigmaMin, SamplerSigmaMax, SamplerRho, VideoAugmentationLevel, VideoCFG, VideoMinCFG, Video2VideoCreativity, IP2PCFG2, RegionalObjectCleanupFactor, SigmaShift, SegmentThresholdMax, FluxGuidanceScale;
    public static T2IRegisteredParam<Image> InitImage, MaskImage;
    public static T2IRegisteredParam<T2IModel> Model, RefinerModel, VAE, ReVisionModel, RegionalObjectInpaintingModel, SegmentModel, VideoModel, RefinerVAE, ClipLModel, ClipGModel, T5XXLModel, LLaVAModel, VideoExtendModel;
    public static T2IRegisteredParam<List<string>> Loras, LoraWeights, LoraTencWeights, LoraSectionConfinement;
    public static T2IRegisteredParam<List<Image>> PromptImages;
    public static T2IRegisteredParam<bool> SaveIntermediateImages, DoNotSave, ControlNetPreviewOnly, RevisionZeroPrompt, RemoveBackground, NoSeedIncrement, NoPreviews, VideoBoomerang, ModelSpecificEnhancements, UseInpaintingEncode, MaskCompositeUnthresholded, SaveSegmentMask, InitImageRecompositeMask, UseReferenceOnly, RefinerDoTiling, AutomaticVAE, ZeroNegative, Text2VideoBoomerang;

    public static T2IParamGroup GroupImagePrompting, GroupCore, GroupVariation, GroupResolution, GroupSampling, GroupInitImage, GroupRefiners,
        GroupAdvancedModelAddons, GroupSwarmInternal, GroupFreeU, GroupRegionalPrompting, GroupAdvancedSampling, GroupVideo, GroupText2Video, GroupAdvancedVideo, GroupVideoExtend, GroupOtherFixes;

    public class ControlNetParamHolder
    {
        public T2IParamGroup Group;

        public T2IRegisteredParam<Image> Image;

        public T2IRegisteredParam<double> Strength, Start, End;

        public T2IRegisteredParam<T2IModel> Model;

        public string NameSuffix = "";
    }

    public static ControlNetParamHolder[] Controlnets = new ControlNetParamHolder[3];

    /// <summary>(For extensions) list of functions that provide fake types for given type names.</summary>
    public static List<Func<string, T2IParamInput, T2IParamType>> FakeTypeProviders = [];

    /// <summary>Cleans and sorts a model listing for output in a user-exposed parameter.</summary>
    public static List<string> CleanModelList(IEnumerable<string> models)
    {
        return [.. models.Select(CleanModelName).OrderBy(s => s.ToLowerFast())];
    }

    /// <summary>(Called by <see cref="Program"/> during startup) registers all default parameter types.</summary>
    public static void RegisterDefaults()
    {
        // ================================================ Root/Top/Special ================================================
        Prompt = Register<string>(new("Prompt", "The input prompt text that describes the image you want to generate.\nTell the AI what you want to see.",
            "", Clean: ApplyStringEdit, Examples: ["a photo of a cat", "a cartoonish drawing of an astronaut"], OrderPriority: -100, VisibleNormally: false, ViewType: ParamViewType.PROMPT, ChangeWeight: -5
            ));
        PromptImages = Register<List<Image>>(new("Prompt Images", "Images to include with the prompt, for eg ReVision or UnCLIP.\nIf this parameter is visible, you've done something wrong - this parameter is tracked internally.",
            "", IgnoreIf: "", OrderPriority: -95, VisibleNormally: false, IsAdvanced: true, ImageShouldResize: false, ChangeWeight: 2, HideFromMetadata: true // Has special internal handling
            ));
        NegativePrompt = Register<string>(new("Negative Prompt", "Like the input prompt text, but describe what NOT to generate.\nTell the AI things you don't want to see.",
            "", IgnoreIf: "", Clean: ApplyStringEdit, Examples: ["ugly, bad, gross", "lowres, low quality"], OrderPriority: -90, ViewType: ParamViewType.PROMPT, ChangeWeight: -5, VisibleNormally: false
            ));
        // ================================================ Image Prompting ================================================
        GroupImagePrompting = new("Image Prompting", Open: false, Toggles: true, OrderPriority: -70, Description: $"Image prompting with ReVision, IP-Adapter, etc.\n<a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}/Features/ImagePrompting.md\">See more docs here.</a>");
        ReVisionStrength = Register<double>(new("ReVision Strength", $"How strong to apply ReVision image inputs.\nSet to 0 to disable ReVision processing.",
            "0", IgnoreIf: "0", OrderPriority: -70, Min: 0, Max: 10, Step: 0.1, ViewType: ParamViewType.SLIDER, Group: GroupImagePrompting, FeatureFlag: "sdxl"
            ));
        RevisionZeroPrompt = Register<bool>(new("ReVision Zero Prompt", "Zeroes the prompt and negative prompt for ReVision inputs.\nApplies only to the base, the refiner will still get prompts.\nIf you want zeros on both, just delete your prompt text.\nIf not checked, empty prompts will be zeroed regardless.",
            "false", IgnoreIf: "false", Group: GroupImagePrompting, FeatureFlag: "sdxl"
            ));
        UseReferenceOnly = Register<bool>(new("Use Reference Only", "Use the 'Reference-Only' technique to guide the generation towards the input image.\nThis currently has side effects that notably prevent Batch from being used properly.",
            "false", IgnoreIf: "false", Group: GroupImagePrompting, IsAdvanced: true
            ));
        // ================================================ Core ================================================
        GroupCore = new("Core Parameters", Toggles: false, Open: true, OrderPriority: -50);
        Images = Register<int>(new("Images", "How many images to generate at once.",
            "1", IgnoreIf: "1", Min: 1, Max: 10000, Step: 1, Examples: ["1", "4"], OrderPriority: -50, Group: GroupCore
            ));
        Seed = Register<long>(new("Seed", "Image seed.\n-1 = random.\nDifferent seeds produce different results for the same prompt.",
            "-1", Min: -1, Max: long.MaxValue, Step: 1, Examples: ["1", "2", "...", "10"], OrderPriority: -30, ViewType: ParamViewType.SEED, Group: GroupCore, ChangeWeight: -5
            ));
        Steps = Register<int>(new("Steps", "Diffusion works by running a model repeatedly to slowly build and then refine an image.\nThis parameter is how many times to run the model.\nMore steps = better quality, but more time.\n20 is a good baseline for speed, 40 is good for maximizing quality.\nSome models, such as Turbo models, are intended for low step counts like 4 or 8.\nYou can go much higher, but it quickly becomes pointless above 70 or so.\nNote that steps is a core parameter used for defining diffusion schedules and other advanced internals,\nand merely running the model over top of an existing image is not the same as increasing the steps.\nNote that the number of steps actually ran can be influenced by other parameters such as Init Image Creativity when applied.",
            "20", Min: 0, Max: 500, ViewMax: 100, Step: 1, Examples: ["10", "15", "20", "30", "40"], OrderPriority: -20, Group: GroupCore, ViewType: ParamViewType.SLIDER
            ));
        CFGScale = Register<double>(new("CFG Scale", "How strongly to scale prompt input.\nHigher CFG scales tend to produce more contrast, and lower CFG scales produce less contrast.\n"
            + "Too-high values can cause corrupted/burnt images, too-low can cause nonsensical images.\n7 is a good baseline. Normal usages vary between 4 and 9.\nSome model types, such as Flux, Hunyuan Video, or any Turbo model, expect CFG to be set to 1.",
            "7", Min: 0, Max: 100, ViewMax: 20, Step: 0.5, Examples: ["5", "6", "7", "8", "9"], OrderPriority: -18, ViewType: ParamViewType.SLIDER, Group: GroupCore, ChangeWeight: -3
            ));
        // ================================================ Text2Video ================================================
        GroupText2Video = new("Text To Video", Open: false, OrderPriority: -30, Toggles: true, Description: $"Support for Text2Video models.");
        Text2VideoFrames = Register<int>(new("Text2Video Frames", "How many frames to generate within the video.\nGenmo Mochi 1 can support any frame count up to 200, multiples of 6 plus 1 (7, 13, 19, 25, ...) are required and will automatically round if you enter an invalid value. Defaults to 25.\nLTXV supports frame counts anywhere up to 257. Multiples of 8 plus 1 (9, 17, 25, 33, 41, ...) are required and will automatically round if you enter an invalid value. Defaults to 97.\nHunyuan Video and Wan-2.1 support dynamic frame counts. Multiples of 4 plus 1 (5, 9, 13, 17, ...) are required and will automatically round if you enter an invalid value. Hunyuan defaults to 73, Wan defaults to 81.",
            "25", Min: 1, Max: 1000, OrderPriority: 1, Group: GroupText2Video, FeatureFlag: "text2video", Toggleable: true
            ));
        Text2VideoFPS = Register<int>(new("Text2Video FPS", "The FPS (frames per second) to use for video generation.\nThis configures the target FPS the video is expecting to work at.\nFor Mochi or Hunyuan Video, this is 24.\nFor LTXV, 24 fps is native, but other values may work.\nFor Cosmos, 24 is good but any value from 12 to 40 works.\nFor Wan, only 16 works.",
            "24", Min: 1, Max: 1024, ViewType: ParamViewType.BIG, OrderPriority: 2, Group: GroupText2Video, FeatureFlag: "text2video", IsAdvanced: true, Toggleable: true
            ));
        Text2VideoBoomerang = Register<bool>(new("Text2Video Boomerang", "Whether to boomerang (aka pingpong) the video.\nIf true, the video will play and then play again in reverse to enable smooth looping.",
            "false", IgnoreIf: "false", OrderPriority: 20, Group: GroupText2Video, IsAdvanced: true, FeatureFlag: "text2video"
            ));
        List<string> videoFormats = ["webp", "gif", "gif-hd", "webm", "h264-mp4", "h265-mp4", "prores"];
        Text2VideoFormat = Register<string>(new("Text2Video Format", "What format to save videos in.\nWebp video is ideal, but has compatibility issues. Gif is simple and compatible, while gif-hd is higher quality via ffmpeg.\nh264-mp4 is a standard video file that works anywhere, but doesn't get treated like an image file.\nh265-mp4 is a smaller file size but may not work for all devices.\nprores is a specialty format.",
            "webp", GetValues: _ => videoFormats, OrderPriority: 21, Group: GroupText2Video, FeatureFlag: "text2video"
            ));
        // ================================================ Variation Seed ================================================
        GroupVariation = new("Variation Seed", Toggles: true, Open: false, OrderPriority: -17, Description: "Variation Seeds let you reuse a single seed, but slightly vary it according to a second seed and a weight value.\nThis technique results in creating images that are almost the same, but with small variations.\nUsing two static seeds and adjusting the strength can produce a smooth transition between two seeds.");
        VariationSeed = Register<long>(new("Variation Seed", "Image-variation seed.\nCombined partially with the original seed to create a similar-but-different image for the same seed.\n-1 = random.",
            "-1", Min: -1, Max: uint.MaxValue, Step: 1, Examples: ["1", "2", "...", "10"], OrderPriority: -17, ViewType: ParamViewType.SEED, Group: GroupVariation, FeatureFlag: "variation_seed", ChangeWeight: -4
            ));
        VariationSeedStrength = Register<double>(new("Variation Seed Strength", "How strongly to apply the variation seed.\n0 = don't use, 1 = replace the base seed entirely. 0.5 is a good value.",
            "0", IgnoreIf: "0", Min: 0, Max: 1, Step: 0.05, Examples: ["0", "0.25", "0.5", "0.75"], OrderPriority: -17, ViewType: ParamViewType.SLIDER, Group: GroupVariation, FeatureFlag: "variation_seed", ChangeWeight: -4
            ));
        // ================================================ Resolution ================================================
        GroupResolution = new("Resolution", Toggles: false, Open: false, OrderPriority: -11);
        AspectRatio = Register<string>(new("Aspect Ratio", "Image aspect ratio - that is, the shape of the image (wide vs square vs tall).\nSet to 'Custom' to define a manual width/height instead.\nSome models can stretch better than others.\nNotably Flux models support almost any resolution you feel like trying.",
            "1:1", GetValues: (_) => ["1:1///1:1 (Square)", "4:3///4:3 (Old PC)", "3:2///3:2 (Semi-wide)", "8:5///8:5", "16:9///16:9 (Standard Widescreen)", "21:9///21:9 (Ultra-Widescreen)", "3:4///3:4", "2:3///2:3 (Semi-tall)", "5:8///5:8", "9:16///9:16 (Tall)", "9:21///9:21 (Ultra-Tall)", "Custom"], OrderPriority: -11, Group: GroupResolution
            ));
        Width = Register<int>(new("Width", "Image width, in pixels.\nSDv1 uses 512, SDv2 uses 768, SDXL prefers 1024.\nSome models allow variation within a range (eg 512 to 768) but almost always want a multiple of 64.\nFlux is very open to differing values.",
            "512", Min: 64, ViewMin: 256, Max: 16384, ViewMax: 2048, Step: 32, Examples: ["512", "768", "1024"], OrderPriority: -10, ViewType: ParamViewType.POT_SLIDER, Group: GroupResolution
            ));
        Height = Register<int>(new("Height", "Image height, in pixels.\nSDv1 uses 512, SDv2 uses 768, SDXL prefers 1024.\nSome models allow variation within a range (eg 512 to 768) but almost always want a multiple of 64.\nFlux is very open to differing values.",
            "512", Min: 64, ViewMin: 256, Max: 16384, ViewMax: 2048, Step: 32, Examples: ["512", "768", "1024"], OrderPriority: -9, ViewType: ParamViewType.POT_SLIDER, Group: GroupResolution
            ));
        // ================================================ Sampling ================================================
        GroupSampling = new("Sampling", Toggles: false, Open: false, OrderPriority: -8);
        CascadeLatentCompression = Register<int>(new("Cascade Latent Compression", "How deeply to compress latents when using Stable Cascade.\nDefault is 32, you can get slightly faster but lower quality results by using 42.",
            "32", IgnoreIf: "32", Min: 1, Max: 100, Step: 1, IsAdvanced: true, Group: GroupSampling, OrderPriority: 4.5, FeatureFlag: "cascade"
            ));
        SD3TextEncs = Register<string>(new("SD3 TextEncs", "Which text encoders to use for Stable Diffusion 3 (SD3) models.\nCan use CLIP pairs, or T5, or both.\nBoth is the standard way to run SD3, but CLIP only uses fewer system resources.",
            "CLIP + T5", GetValues: _ => ["CLIP Only", "T5 Only", "CLIP + T5"], Toggleable: true, Group: GroupSampling, FeatureFlag: "sd3", OrderPriority: 5, ChangeWeight: 9
            ));
        FluxGuidanceScale = Register<double>(new("Flux Guidance Scale", "What guidance scale to use for Flux-Dev or related models.\nDoes not apply to Flux-Schnell.\nFor Flux-Dev, this is a distilled embedded value the model was trained on, this is based on an alternative guidance methodology, and is not CFG.\n3.5 is default, but closer to 2.0 may allow for more stylistic flexibility.\nFor Hunyuan Video, this is distilled from CFG Scale, and prefers values closer to 6.",
            "3.5", Min: 0, Max: 100, ViewMax: 10, Step: 0.1, Toggleable: true, Group: GroupSampling, ViewType: ParamViewType.SLIDER, FeatureFlag: "flux-dev"
            ));
        ZeroNegative = Register<bool>(new("Zero Negative", "Zeroes the negative prompt if it's empty.\nDoes nothing if the negative prompt is not empty.\nThis may yield better quality on SD3.",
            "false", IgnoreIf: "false", Group: GroupSampling
            ));
        SeamlessTileable = Register<string>(new("Seamless Tileable", "Makes the generated image seamlessly tileable (like a 3D texture would be).\nOptionally, can be tileable on only the X axis (horizontal) or Y axis (vertical).",
            "false", IgnoreIf: "false", GetValues: _ => ["false", "true", "X-Only", "Y-Only"], Group: GroupSampling, FeatureFlag: "seamless", OrderPriority: 15
            ));
        // ================================================ Init Image ================================================
        GroupInitImage = new("Init Image", Toggles: true, Open: false, OrderPriority: -5, Description: "Init-image, to edit an image using diffusion.\nThis process is sometimes called 'img2img' or 'Image To Image'.");
        InitImage = Register<Image>(new("Init Image", "Init-image, to edit an image using diffusion.\nThis process is sometimes called 'img2img' or 'Image To Image'.",
            null, OrderPriority: -5, Group: GroupInitImage, ChangeWeight: 2
            ));
        InitImageCreativity = Register<double>(new("Init Image Creativity", "Higher values make the generation more creative, lower values follow the init image closer.\nSometimes referred to as 'Denoising Strength' for 'img2img'.\nIn simple terms: this is the fraction of steps to actually run, vs steps to pretend already ran.\n(Pretending that some steps already ran means the model will act as though it created the image, and only needs to refine the details.\nThis is how init images function on the inside.)\nFor example, at Steps=20 and Creativity=0.6, the model will skip the first 8 steps and run the next 12.\nIf you find your quality is low at low creativity values, it may be beneficial to make your Steps value higher to compensate for this fractional cut.",
            "0.6", Min: 0, Max: 1, Step: 0.05, OrderPriority: -4.5, ViewType: ParamViewType.SLIDER, Group: GroupInitImage, Examples: ["0", "0.4", "0.6", "1"]
            ));
        InitImageResetToNorm = Register<double>(new("Init Image Reset To Norm", "Merges the init image towards the latent norm.\nThis essentially lets you boost 'init image creativity' past 1.0.\nSet to 0 to disable.",
            "0", IgnoreIf: "0", Min: 0, Max: 1, Step: 0.05, OrderPriority: -4.5, ViewType: ParamViewType.SLIDER, Group: GroupInitImage, Examples: ["0", "0.2", "0.5", "1"], IsAdvanced: true
            ));
        InitImageNoise = Register<double>(new("Init Image Noise", "Adds non-latent image noise to the Init Image.\nThis is simple Gaussian noise directly on top of the image.\nThis tends to encourage more complex/creative generations from diffusion models.\nEspecially helpful when the init is a flat color reference.\nAt 0, no noise is added. At 1, heavy noise is added. You can overload up to 10 to more fully hide the source image if needed.",
            "0", IgnoreIf: "0", Min: 0, Max: 10, ViewMax: 1, Step: 0.05, OrderPriority: -4.2, ViewType: ParamViewType.SLIDER, Group: GroupInitImage, Examples: ["0", "0.2", "0.5", "1"], IsAdvanced: true
            ));
        MaskImage = Register<Image>(new("Mask Image", "Mask-image, white pixels are changed, black pixels are not changed, gray pixels are half-changed.",
            null, OrderPriority: -4, Group: GroupInitImage, ChangeWeight: 2
            ));
        MaskShrinkGrow = Register<int>(new("Mask Shrink Grow", "If enabled, the image will be shrunk to just the mask, and then grow by this value many pixels.\nAfter that, the generation process will run in full, and the image will be composited back into the original image at the end.\nThis allows for refining small details of an image more effectively.\nThis is also known as 'Inpaint Only Masked'.\nLarger values increase the surrounding context the generation receives, lower values contain it tighter and allow the AI to create more detail.",
            "8", Toggleable: true, Min: 0, Max: 512, OrderPriority: -3.7, Group: GroupInitImage, Examples: ["0", "8", "32"]
            ));
        MaskBlur = Register<int>(new("Mask Blur", "If enabled, the mask will be blurred by this blur factor.\nThis makes the transition for the new image smoother.\nSet to 0 to disable.",
            "4", IgnoreIf: "0", Min: 0, Max: 64, OrderPriority: -3.6, Group: GroupInitImage, Examples: ["0", "4", "8", "16"]
            ));
        MaskGrow = Register<int>(new("Mask Grow", "If enabled, the mask will be grown by this size (approx equivalent to length in pixels).\nThis helps improve overlap with generated masks.\nSet to 0 to disable.",
            "0", IgnoreIf: "0", Min: 0, Max: 256, OrderPriority: -3.5, Group: GroupInitImage, Examples: ["0", "4", "8", "16"], IsAdvanced: true
            ));
        MaskBehavior = Register<string>(new("Mask Behavior", "How to process the mask.\n'Differential' = 'Differential Diffusion' technique, wherein the mask values are used as offsets for timestep of when to apply the mask or not.\n'Simple Latent' = the most basic latent masking technique.",
            "Differential", Toggleable: true, IsAdvanced: true, GetValues: (_) => ["Differential", "Simple Latent"], OrderPriority: -3.5, Group: GroupInitImage
            ));
        InitImageRecompositeMask = Register<bool>(new("Init Image Recomposite Mask", "If enabled and a mask is in use, this will recomposite the masked generated onto the original image for a cleaner result.\nIf disabled, VAE artifacts may build up across repeated inpaint operations.\nDefaults enabled.",
            "true", IgnoreIf: "true", Group: GroupInitImage, OrderPriority: -3.4, IsAdvanced: true
            ));
        UseInpaintingEncode = Register<bool>(new("Use Inpainting Encode", "Uses VAE Encode logic specifically designed for certain inpainting models.\nNotably this includes the RunwayML Stable-Diffusion-v1 Inpainting model.\nThis covers the masked area with gray.",
            "false", IgnoreIf: "false", Group: GroupInitImage, OrderPriority: -3.2, IsAdvanced: true
            ));
        UnsamplerPrompt = Register<string>(new("Unsampler Prompt", "If enabled, feeds this prompt to an unsampler before resampling with your main prompt.\nThis is powerful for controlled image editing.\n\nFor example, use unsampler prompt 'a photo of a man wearing a black hat',\nand give main prompt 'a photo of a man wearing a sombrero', to change what type of hat a person is wearing.",
            "", OrderPriority: -3, Toggleable: true, Clean: ApplyStringEdit, ViewType: ParamViewType.PROMPT, Group: GroupInitImage, IsAdvanced: true
            ));
        // ================================================ Refine/Upscale ================================================
        GroupRefiners = new("Refine / Upscale", Toggles: true, Open: false, OrderPriority: -3, Description: "This group contains everything related to two-stage image generation.\nNotably this includes post-refinement, step-swap refinement, and upscaled refinement.\nUpscaling an image and refining with the same model has been referred to as 'hires fix' in other UIs.");
        static List<string> listRefinerModels(Session s)
        {
            List<T2IModel> baseList = [.. Program.MainSDModels.ListModelsFor(s).OrderBy(m => m.Name)];
            List<T2IModel> refinerList = baseList.Where(m => m.ModelClass is not null && m.ModelClass.Name.Contains("Refiner")).ToList();
            List<string> bases = CleanModelList(baseList.Select(m => m.Name));
            return ["(Use Base)", .. CleanModelList(refinerList.Select(m => m.Name)), "-----", .. bases];
        }
        RefinerModel = Register<T2IModel>(new("Refiner Model", "The model to use for refinement. This should be a model that's good at small-details, and use a structural model as your base model.\n'Use Base' will use your base model rather than switching.\nSDXL 1.0 released with an official refiner model.",
            "(Use Base)", IgnoreIf: "(Use Base)", GetValues: listRefinerModels, OrderPriority: -5, Group: GroupRefiners, FeatureFlag: "refiners", Subtype: "Stable-Diffusion", ChangeWeight: 9, DoNotPreview: true
            ));
        RefinerVAE = Register<T2IModel>(new("Refiner VAE", "Optional VAE replacement for the refiner stage.",
            "None", IgnoreIf: "None", GetValues: listVaes, IsAdvanced: true, OrderPriority: -4.5, Group: GroupRefiners, FeatureFlag: "refiners", Subtype: "VAE", ChangeWeight: 7, DoNotPreview: true
            ));
        RefinerControl = Register<double>(new("Refiner Control Percentage", "Higher values give the refiner more control, lower values give the base more control.\nThis is similar to 'Init Image Creativity', but for the refiner. This controls how many steps the refiner takes.\nIn simple terms: this is the fraction of total steps to let the refiner run\nFor example, at Steps=20 with ControlPercentage=0.2 and Method=PostApply, the base will run 20 steps, then the refiner will run 20*0.2=just 4 steps.\nIf you find your quality is low at low control percentage values, it may be beneficial to set the advanced Refiner Steps parameter to a very high value let the refine logic run more actual steps.\nFor example, set RefinerSteps=60 so that 60*0.2=12 steps actually ran in the refiner.",
            "0.2", Min: 0, Max: 1, Step: 0.05, OrderPriority: -4, ViewType: ParamViewType.SLIDER, Group: GroupRefiners, FeatureFlag: "refiners", DoNotPreview: true, Examples: ["0.2", "0.3", "0.4"]
            ));
        RefinerSteps = Register<int>(new("Refiner Steps", "Alternate Steps value for when calculating the refiner stage.\nThis replaces the 'Steps' total count before calculating the Refiner Control Percentage.\nFor example, with Control=0.2, set RefinerSteps=60 so that 60*0.2=12 steps actually ran in the refiner.",
            "40", Min: 1, Max: 200, ViewMax: 100, Step: 1, Examples: ["20", "40", "60"], OrderPriority: -3.75, Toggleable: true, IsAdvanced: true, Group: GroupRefiners, ViewType: ParamViewType.SLIDER
            ));
        RefinerCFGScale = Register<double>(new("Refiner CFG Scale", "For the refiner model independently of the base model, how strongly to scale prompt input.\nHigher CFG scales tend to produce more contrast, and lower CFG scales produce less contrast.\n"
            + "Too-high values can cause corrupted/burnt images, too-low can cause nonsensical images.\n7 is a good baseline. Normal usages vary between 4 and 9.\nSome model types, such as Turbo, expect CFG around 1.",
            "7", Min: 0, Max: 100, ViewMax: 20, Step: 0.5, Examples: ["5", "6", "7", "8", "9"], OrderPriority: -3.5, ViewType: ParamViewType.SLIDER, Group: GroupRefiners, ChangeWeight: -3, Toggleable: true, IsAdvanced: true
            ));
        RefinerMethod = Register<string>(new("Refiner Method", "How to apply the refiner. Different methods create different results.\n'PostApply' runs the base in full, then runs the refiner with an Init Image.\n'StepSwap' swaps the model after x steps during generation.\n'StepSwapNoisy' is StepSwap but with first-stage noise only.",
            "PostApply", GetValues: (_) => ["PostApply///Post-Apply (Normal)", "StepSwap///Step-Swap (SDXL Refiner Model Original)", "StepSwapNoisy///Step-Swap Noisy (Modified Refiner)"], OrderPriority: -3, Group: GroupRefiners, FeatureFlag: "refiners", DoNotPreview: true, IsAdvanced: true
            ));
        RefinerUpscale = Register<double>(new("Refiner Upscale", "Optional upscale of the image between the base and refiner stage.\nSometimes referred to as 'high-res fix'.\nSetting to '1' disables the upscale.",
            "1", IgnoreIf: "1", Min: 0.25, Max: 8, ViewMax: 4, Step: 0.25, OrderPriority: -2, ViewType: ParamViewType.SLIDER, Group: GroupRefiners, FeatureFlag: "refiners", DoNotPreview: true, Examples: ["1", "1.5", "2"]
            ));
        RefinerDoTiling = Register<bool>(new("Refiner Do Tiling", "If enabled, do generation tiling in the refiner stage.\nThis can fix some visual artifacts from scaling, but also introduce others (eg seams).\nThis may take a while to run.\nRecommended for SD3 if upscaling.",
            "false", IgnoreIf: "false", OrderPriority: 5, Group: GroupRefiners, FeatureFlag: "refiners", DoNotPreview: true
            ));
        static List<string> listVaes(Session s)
        {
            return ["Automatic", "None", .. CleanModelList(Program.T2IModelSets["VAE"].ListModelsFor(s).Select(m => m.Name))];
        }
        // ================================================ ControlNet ================================================
        for (int i = 1; i <= 3; i++)
        {
            string suffix = i switch { 1 => "", 2 => " Two", 3 => " Three", _ => "Error" };
            T2IParamGroup group = new($"ControlNet{suffix}", Toggles: true, Open: false, IsAdvanced: i != 1, OrderPriority: -1 + i * 0.1, Description: $"Guide your image generations with ControlNets.\n<a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}/Features/ControlNet.md\">See more docs here.</a>");
            Controlnets[i - 1] = new()
            {
                NameSuffix = suffix,
                Group = group,
                Image = Register<Image>(new($"ControlNet{suffix} Image Input", "The image to use as the input to ControlNet guidance.\nThis image will be preprocessed by the chosen preprocessor.\nIf ControlNet is enabled, but this input is not, Init Image will be used instead.",
                    null, Toggleable: true, FeatureFlag: "controlnet", Permission: Permissions.ParamControlNet, Group: group, OrderPriority: 1, ChangeWeight: 2
                    )),
                Model = Register<T2IModel>(new($"ControlNet{suffix} Model", "The ControlNet model to use.",
                    "(None)", FeatureFlag: "controlnet", Permission: Permissions.ParamControlNet, Group: group, Subtype: "ControlNet", OrderPriority: 5, ChangeWeight: 5
                    )),
                Strength = Register<double>(new($"ControlNet{suffix} Strength", "Higher values make the ControlNet apply more strongly. Weaker values let the prompt overrule the ControlNet.",
                    "1", FeatureFlag: "controlnet", Permission: Permissions.ParamControlNet, Min: 0, Max: 2, Step: 0.05, OrderPriority: 8, ViewType: ParamViewType.SLIDER, Group: group, Examples: ["0", "0.5", "1", "2"]
                    )),
                Start = Register<double>(new($"ControlNet{suffix} Start", "When to start applying controlnet, as a fraction of steps.\nFor example, 0.5 starts applying halfway through. Must be less than End.\nExcluding early steps reduces the controlnet's impact on overall image structure.",
                    "0", IgnoreIf: "0", FeatureFlag: "controlnet", Permission: Permissions.ParamControlNet, Min: 0, Max: 1, Step: 0.05, OrderPriority: 10, IsAdvanced: true, ViewType: ParamViewType.SLIDER, Group: group, Examples: ["0", "0.2", "0.5"]
                    )),
                End = Register<double>(new($"ControlNet{suffix} End", "When to stop applying controlnet, as a fraction of steps.\nFor example, 0.5 stops applying halfway through. Must be greater than Start.\nExcluding later steps reduces the controlnet's impact on finer details.",
                    "1", IgnoreIf: "1", FeatureFlag: "controlnet", Permission: Permissions.ParamControlNet, Min: 0, Max: 1, Step: 0.05, OrderPriority: 11, IsAdvanced: true, ViewType: ParamViewType.SLIDER, Group: group, Examples: ["1", "0.8", "0.5"]
                    )),
            };
        }
        ControlNetPreviewOnly = Register<bool>(new("ControlNet Preview Only", "(For API usage) If enabled, requests preview output from ControlNet and no image generation at all.",
            "false", IgnoreIf: "false", FeatureFlag: "controlnet", Permission: Permissions.ParamControlNet, VisibleNormally: false
            ));
        // ================================================ Image To Video ================================================
        GroupVideo = new("Image To Video", Open: false, OrderPriority: 0, Toggles: true, Description: $"Generate videos with Stable Video Diffusion.\n<a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}/Features/Video.md\">See more docs here.</a>");
        static bool isVideoClass(string id) => id.Contains("stable-video-diffusion") || id.Contains("lightricks-ltx-video") || id.Contains("-video2world") || id.Contains("-i2v") || id.Contains("-image2video");
        VideoModel = Register<T2IModel>(new("Video Model", "The model to use for video generation.\nSelect an image-to-video conversion model, note that text-to-video models do not work.",
            "", GetValues: s => CleanModelList(Program.MainSDModels.ListModelsFor(s).Where(m => m.ModelClass is not null && isVideoClass(m.ModelClass.ID)).Select(m => m.Name)),
            OrderPriority: 1, Group: GroupVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", Subtype: "Stable-Diffusion", ChangeWeight: 9, DoNotPreview: true
            ));
        VideoFrames = Register<int>(new("Video Frames", "How many frames to generate within the video.\nSVD-XT normally uses 25 frames, and SVD (non-XT) 0.9 used 14 frames.\nLTXV supports frame counts anywhere up to 257. Multiples of 8 plus 1 (9, 17, 25, 33, 41, ...) are required and will automatically round if you enter an invalid value. Defaults to 97.\nCosmos was only trained for 121.\nWan 2.1 expects 81, but will mostly work with other values.",
            "25", Min: 1, Max: 1000, OrderPriority: 2, Group: GroupVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", DoNotPreview: true, Toggleable: true
            ));
        VideoSteps = Register<int>(new("Video Steps", "How many steps to use for the video model.\nHigher step counts yield better quality, but much longer generation time.\n20 is sufficient as a basis, but some video models need higher steps to achieve coherence.",
            "20", Min: 1, Max: 200, ViewMax: 100, ViewType: ParamViewType.SLIDER, OrderPriority: 3, Group: GroupVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", DoNotPreview: true
            ));
        VideoCFG = Register<double>(new("Video CFG", "The CFG Scale to use for video generation.\nWith SVD, videos start with this CFG on the first frame, and then reduce to MinCFG (normally 1) by the end frame.\nSVD prefers 2.5\nCosmos takes normal CFGs (around 7).\nLTXV prefers around 3 for its CFG.\nWan prefers around 6.",
            "7", Min: 1, Max: 100, ViewMax: 20, Step: 0.5, OrderPriority: 4, ViewType: ParamViewType.SLIDER, Group: GroupVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", DoNotPreview: true, Toggleable: true
            ));
        VideoBoomerang = Register<bool>(new("Video Boomerang", "Whether to boomerang (aka pingpong) the video.\nIf true, the video will play and then play again in reverse to enable smooth looping.",
            "false", IgnoreIf: "false", OrderPriority: 18, Group: GroupVideo, Permission: Permissions.ParamVideo, IsAdvanced: true, FeatureFlag: "video", DoNotPreview: true
            ));
        VideoResolution = Register<string>(new("Video Resolution", "What resolution/aspect the video should use.\n'Image Aspect, Model Res' uses the aspect-ratio of the image, but the pixel-count size of the model standard resolution.\n'Model Preferred' means use the model's exact resolution (eg 1024x576).\n'Image' means your input image resolution.",
            "Image Aspect, Model Res", GetValues: _ => ["Image Aspect, Model Res", "Model Preferred", "Image"], OrderPriority: 19, Group: GroupVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", DoNotPreview: true
            ));
        Video2VideoCreativity = Register<double>(new("Video2Video Creativity", "Optional advanced method to start the video diffusion late.\nThis is equivalent to Init Image Creativity.\nSet below 1 to skip some fraction of steps.\nThis only makes sense if the base input is a video.\n'Video Frame's param must have same frame length as the input video.\nIf set to 1, video2video logic is not applied, and the input is treated as a single image.",
            "1", IgnoreIf: "1", Min: 0, Max: 1, Step: 0.05, OrderPriority: 19.5, ViewType: ParamViewType.SLIDER, Group: GroupVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", IsAdvanced: true, DoNotPreview: true
            ));
        VideoFormat = Register<string>(new("Video Format", "What format to save videos in.\nWebp video is ideal, but has compatibility issues. Gif is simple and compatible, while gif-hd is higher quality via ffmpeg.\nh264-mp4 is a standard video file that works anywhere, but doesn't get treated like an image file.\nh265-mp4 is a smaller file size but may not work for all devices.\nprores is a specialty format.",
            "webp", GetValues: _ => videoFormats, OrderPriority: 20, Group: GroupVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", DoNotPreview: true
            ));
        // ================================================ Advanced Video ================================================
        GroupAdvancedVideo = new("Advanced Video", Open: false, OrderPriority: 6, Description: "Advanced/special Video model features that only apply to some video models.");
        VideoFPS = Register<int>(new("Video FPS", "The FPS (frames per second) to use for video generation.\nThis configures the target FPS the video will try to generate for, or will output as.\nMost models are locked to a specific framerate, so altering this is a bad idea.\nSVD prefers 6, LTXV prefers 24.",
            "24", Min: 1, Max: 1024, ViewMax: 30, ViewType: ParamViewType.SLIDER, OrderPriority: 2.5, Group: GroupAdvancedVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", IsAdvanced: true, Toggleable: true
            ));
        VideoMinCFG = Register<double>(new("Video Min CFG", "The minimum CFG to use for video generation.\nVideos start with max CFG on first frame, and then reduce to this CFG. Set to -1 to disable.\nOnly used for SVD.",
            "1.0", Min: -1, Max: 100, ViewMax: 30, Step: 0.5, OrderPriority: 4.5, ViewType: ParamViewType.SLIDER, Group: GroupAdvancedVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", IsAdvanced: true, Toggleable: true
            ));
        VideoMotionBucket = Register<int>(new("Video Motion Bucket", "Which trained 'motion bucket' to use for the video model.\nHigher values induce more motion. Most values should stay in the 100-200 range.\n127 is a good baseline, as it is the most common value in SVD's training set.\nOnly used for SVD.",
            "127", Min: 1, Max: 1023, OrderPriority: 10, Group: GroupAdvancedVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", IsAdvanced: true, Toggleable: true
            ));
        VideoAugmentationLevel = Register<double>(new("Video Augmentation Level", "How much noise to add to the init image for Image2Video.\nHigher values yield more motion.\nFor SVD, default is 0.\nFor LTX, default is 0.15.\nOther models do not use this.",
            "0.0", Min: 0, ViewMax: 1, Max: 10, Step: 0.01, OrderPriority: 11, ViewType: ParamViewType.SLIDER, Group: GroupAdvancedVideo, Permission: Permissions.ParamVideo, FeatureFlag: "video", Toggleable: true, IsAdvanced: true
            ));
        // ================================================ Video Extend ================================================
        GroupVideoExtend = new("Video Extend", Open: false, OrderPriority: 7, IsAdvanced: true, Toggles: true);
        VideoExtendFrameOverlap = Register<int>(new("Video Extend Frame Overlap", "How many frames at the end of the video should be repeated into the start of next video.\nThis is a balancing act, more frames gets better motion clarity, but also wastes more performance on redundant calculations.\nMake sure this is a valid frame count for your video model, eg a multiple of 4 plus 1 for Wan (5, 9, 13, 17, ...).\nShould be no more than 1/3rd the frame count of your shortest extend window.",
            "9", Min: 0, Max: 128, OrderPriority: 5.5, Group: GroupVideoExtend, Examples: ["0", "5", "9"], DoNotPreview: true
            ));
        VideoExtendModel = Register<T2IModel>(new("Video Extend Model", "The model to use for video extending.\nSelect an image-to-video model, note that text-to-video models do not work.",
            "", GetValues: s => CleanModelList(Program.MainSDModels.ListModelsFor(s).Where(m => m.ModelClass is not null && isVideoClass(m.ModelClass.ID)).Select(m => m.Name)),
            OrderPriority: 1, Group: GroupVideoExtend, Permission: Permissions.ParamVideo, FeatureFlag: "video", Subtype: "Stable-Diffusion", ChangeWeight: 9, DoNotPreview: true
            ));
        VideoExtendFormat = Register<string>(new("Video Extend Format", "What format to save extended videos in.\nWebp video is ideal, but has compatibility issues. Gif is simple and compatible, while gif-hd is higher quality via ffmpeg.\nh264-mp4 is a standard video file that works anywhere, but doesn't get treated like an image file.\nh265-mp4 is a smaller file size but may not work for all devices.\nprores is a specialty format.",
            "webp", GetValues: _ => videoFormats, OrderPriority: 20, Group: GroupVideoExtend, Permission: Permissions.ParamVideo, FeatureFlag: "video", DoNotPreview: true
            ));
        // ================================================ Advanced Model Addons ================================================
        GroupAdvancedModelAddons = new("Advanced Model Addons", Open: false, OrderPriority: 8, IsAdvanced: true);
        Model = Register<T2IModel>(new("Model", "What main checkpoint model should be used.",
            "", Permission: Permissions.ModelParams, VisibleNormally: false, Subtype: "Stable-Diffusion", ChangeWeight: 10
            ));
        ReVisionModel = Register<T2IModel>(new("ReVision Model", "The CLIP Vision model to use for ReVision inputs.\nThis will also override IPAdapter (if IPAdapter-G is in use).",
            "", Subtype: "ClipVision", IsAdvanced: true, Toggleable: true, Group: GroupAdvancedModelAddons, FeatureFlag: "sdxl"
            ));
        VAE = Register<T2IModel>(new("VAE", "The VAE (Variational Auto-Encoder) controls the translation between images and latent space.\nIf your images look faded out, or glitched, you may have the wrong VAE.\nAll models have a VAE baked in by default, this option lets you swap to a different one if you want to.",
            "None", IgnoreIf: "None", Permission: Permissions.ModelParams, IsAdvanced: true, Toggleable: true, GetValues: listVaes, Subtype: "VAE", Group: GroupAdvancedModelAddons, ChangeWeight: 7
            ));
        AutomaticVAE = Register<bool>(new("Automatic VAE", "Whether to automatically select the VAE based on the main model and your user settings.\nOnly applied if a VAE is not specified.",
            "false", IgnoreIf: "false", Permission: Permissions.ModelParams, IsAdvanced: true, Toggleable: true, VisibleNormally: false, Group: GroupAdvancedModelAddons, ChangeWeight: 7
            ));
        Loras = Register<List<string>>(new("LoRAs", "LoRAs (Low-Rank-Adaptation Models) are a way to customize the content of a model without totally replacing it.\nYou can enable one or several LoRAs over top of one model.",
            "", IgnoreIf: "", IsAdvanced: true, Clean: (_, s) => CleanModelNameList(s), GetValues: (session) => CleanModelList(Program.T2IModelSets["LoRA"].ListModelNamesFor(session)), Group: GroupAdvancedModelAddons, VisibleNormally: false, ChangeWeight: 8
            ));
        LoraWeights = Register<List<string>>(new("LoRA Weights", "Weight values for the LoRA model list.\nComma separated list of weight numbers.\nMust match the length of the LoRAs input.",
            "", IgnoreIf: "", Min: -10, Max: 10, Step: 0.1, IsAdvanced: true, Group: GroupAdvancedModelAddons, VisibleNormally: false
            ));
        LoraTencWeights = Register<List<string>>(new("LoRA Tenc Weights", "Distinct weight values for the text encoders of LoRA model list.\nComma separated list of weight numbers.\nMust match the length of the LoRAs input.",
            "", IgnoreIf: "", Min: -10, Max: 10, Step: 0.1, IsAdvanced: true, Group: GroupAdvancedModelAddons, VisibleNormally: false
            ));
        LoraSectionConfinement = Register<List<string>>(new("LoRA Section Confinement", "Optional internal parameter used to confine LoRAs to certain sections of generation (eg a 'segment' block).\nComma separated list of section IDs (0 to mean global).\nMust match the length of the LoRAs input.",
            "", IgnoreIf: "", IsAdvanced: true, Group: GroupAdvancedModelAddons, VisibleNormally: false
            ));
        ClipLModel = Register<T2IModel>(new("CLIP-L Model", "Which CLIP-L model to use, for SD3/Flux style 'diffusion_models' folder models.",
            "", IgnoreIf: "", Group: GroupAdvancedModelAddons, Subtype: "Clip", Permission: Permissions.ModelParams, Toggleable: true, IsAdvanced: true, OrderPriority: 15, ChangeWeight: 7
            ));
        ClipGModel = Register<T2IModel>(new("CLIP-G Model", "Which CLIP-G model to use, for SD3 style 'diffusion_models' folder models.",
            "", IgnoreIf: "", Group: GroupAdvancedModelAddons, Subtype: "Clip", Permission: Permissions.ModelParams, Toggleable: true, IsAdvanced: true, OrderPriority: 16, ChangeWeight: 7
            ));
        T5XXLModel = Register<T2IModel>(new("T5-XXL Model", "Which T5-XXL model to use, for SD3/Flux style 'diffusion_models' folder models.",
            "", IgnoreIf: "", Group: GroupAdvancedModelAddons, Subtype: "Clip", Permission: Permissions.ModelParams, Toggleable: true, IsAdvanced: true, OrderPriority: 17, ChangeWeight: 7
            ));
        LLaVAModel = Register<T2IModel>(new("LLaVA Model", "Which LLaVA model to use, for Hunyuan Video 'diffusion_models' folder models.",
            "", IgnoreIf: "", Group: GroupAdvancedModelAddons, Subtype: "Clip", Permission: Permissions.ModelParams, Toggleable: true, IsAdvanced: true, OrderPriority: 15, ChangeWeight: 7
            ));
        TorchCompile = Register<string>(new("Torch Compile", "Torch.Compile is a way to dynamically accelerate AI models.\nIt wastes a bit of time (around a minute) on the first call compiling a graph of the generation, and then all subsequent generations run faster thanks to the compiled graph.\nTorch.Compile depends on Triton, which is difficult to install on Windows, easier on Linux.",
            "Disabled", IgnoreIf: "Disabled", GetValues: _ => ["Disabled", "inductor", "cudagraphs"], OrderPriority: 40, Group: GroupAdvancedModelAddons
            ));
        // ================================================ Swarm Internal ================================================
        GroupSwarmInternal = new("Swarm Internal", Open: false, OrderPriority: 0, IsAdvanced: true);
        BatchSize = Register<int>(new("Batch Size", "Batch size - generates more images at once on a single GPU.\nThis increases VRAM usage.\nMay in some cases increase overall speed by a small amount (runs slower to get the images, but slightly faster per-image).",
            "1", IgnoreIf: "1", Min: 1, Max: 100, Step: 1, IsAdvanced: true, ViewType: ParamViewType.SLIDER, ViewMax: 10, ChangeWeight: 2, Group: GroupSwarmInternal, OrderPriority: -20
            ));
        AltResolutionHeightMult = Register<double>(new("Alt Resolution Height Multiplier", "When enabled, the normal width parameter is used, and this value is multiplied by the width to derive the image height.",
            "1", Min: 0, Max: 10, Step: 0.1, Examples: ["0.5", "1", "1.5"], IsAdvanced: true, Toggleable: true, ViewType: ParamViewType.SLIDER, Group: GroupSwarmInternal, OrderPriority: -19
            ));
        RawResolution = Register<string>(new("Raw Resolution", "Optional advanced way to manually specify raw resolutions, useful for grids.\nWhen enabled, this overrides the default width/height params.",
            "1024x1024", Examples: ["512x512", "1024x1024", "1344x768"], Toggleable: true, IsAdvanced: true, Group: GroupSwarmInternal, OrderPriority: -18, Clean: (_, s) =>
            {
                (string widthText, string heightText) = s.BeforeAndAfter('x');
                int width = int.Parse(widthText.Trim());
                int height = int.Parse(heightText.Trim());
                if (width < 64 || height < 64 || width > 16384 || height > 16384)
                {
                    throw new SwarmUserErrorException($"Invalid resolution: {width}x{height} (must be between 64x64 and 16384x16384)");
                }
                return s;
            }
            ));
        SaveIntermediateImages = Register<bool>(new("Save Intermediate Images", "If checked, intermediate images (eg before a refiner or segment stage) will be saved separately alongside the final image.",
            "false", IgnoreIf: "false", IsAdvanced: true, Group: GroupSwarmInternal, OrderPriority: -16
            ));
        DoNotSave = Register<bool>(new("Do Not Save", "If checked, tells the server to not save this image.\nUseful for quick test generations, or 'generate forever' usage.",
            "false", IgnoreIf: "false", IsAdvanced: true, Group: GroupSwarmInternal, AlwaysRetain: true, OrderPriority: -15
            ));
        NoPreviews = Register<bool>(new("No Previews", "If checked, tells the server that previews are not desired.\nMay make generations slightly faster in some cases.",
            "false", IgnoreIf: "false", IsAdvanced: true, Group: GroupSwarmInternal, AlwaysRetain: true, OrderPriority: -14
            ));
        Webhooks = Register<string>(new("Webhooks", "What webhooks are enabled for this generation job.",
            "Normal", IgnoreIf: "Normal", GetValues: (_) => ["None", "Normal///Normal (fire 'Every Gen')", "Manual///Manual (fire 'Every Gen' and 'Manual' for each image)", "Manual At End///Manual At End (fire 'Every Gen', then one 'Manual' for the full set of queued gens)"], IsAdvanced: true, AlwaysRetain: true, Group: GroupSwarmInternal, OrderPriority: -12
            ));
        BackendType = Register<string>(new("[Internal] Backend Type", "Which SwarmUI backend type should be used for this request.",
            "Any", IgnoreIf: "Any", GetValues: (_) => ["Any", .. Program.Backends.BackendTypes.Values.Select(b => $"{b.ID}///{b.Name}")],
            IsAdvanced: true, Permission: Permissions.ParamBackendType, Group: GroupSwarmInternal, AlwaysRetain: true, OrderPriority: -10
            ));
        ExactBackendID = Register<int>(new("Exact Backend ID", "Manually force a specific exact backend (by ID #) to be used for this generation.",
            "0", Toggleable: true, IsAdvanced: true, ViewType: ParamViewType.BIG, Permission: Permissions.ParamBackendID, Group: GroupSwarmInternal, AlwaysRetain: true, OrderPriority: -9
            ));
        WildcardSeed = Register<long>(new("Wildcard Seed", "Wildcard selection seed.\nIf enabled, this seed will be used for selecting entries from wildcards.\nIf disabled, the image seed will be used.\n-1 = random.",
            "-1", Min: -1, Max: uint.MaxValue, Step: 1, Toggleable: true, Examples: ["1", "2", "...", "10"], ViewType: ParamViewType.SEED, Group: GroupSwarmInternal, AlwaysRetain: true, ChangeWeight: -4, OrderPriority: -5
            ));
        WildcardSeedBehavior = Register<string>(new("Wildcard Seed Behavior", "How Wildcard Seed should behave.\nIf 'Random', seed is a random seed.\nIf 'Index', the seed is a 0-based index into the wildcard list. (Eg if you have 5 entries, seed 0 gets the first entry, seed 4 gets the last entry, seed 5 goes back to the first entry again.)",
            "Random", IgnoreIf: "Random", GetValues: (_) => ["Random", "Index"], IsAdvanced: true, Group: GroupSwarmInternal, AlwaysRetain: true, OrderPriority: -4.5
            ));
        NoSeedIncrement = Register<bool>(new("No Seed Increment", "If checked, the seed will not be incremented when Images is above 1.\nUseful for example to test different wildcards for the same seed rapidly.",
            "false", IgnoreIf: "false", IsAdvanced: true, Group: GroupSwarmInternal, AlwaysRetain: true, OrderPriority: -4
            ));
        PersonalNote = Register<string>(new("Personal Note", "Optional field to type in any personal text note you want.\nThis will be stored in the image metadata.",
            "", IgnoreIf: "", IsAdvanced: true, Clean: ApplyStringEdit, Group: GroupSwarmInternal, ViewType: ParamViewType.BIG, AlwaysRetain: true, OrderPriority: 0
            ));
        ImageFormat = Register<string>(new("Image Format", "Optional override for the final image file format.",
            "PNG", GetValues: (_) => [.. Enum.GetNames(typeof(Image.ImageFormat))], IsAdvanced: true, Group: GroupSwarmInternal, AlwaysRetain: true, Toggleable: true, OrderPriority: 1
            ));
        BitDepth = Register<string>(new("Color Depth", "Specifies the color depth (in bits per channel) to use.\nOnly works for 'PNG' image file format currently.\n'8-bit' is normal (8 bits per red, 8 for green, 8 for blue, making 24 bits total per pixel).\nand '16-bit' encodes additional high-precision (HDR-like) data.\nNote that overprecision data is unlikely to be meaningful, as currently available models haven't been trained for that.",
            "8bit", IgnoreIf: "8bit", GetValues: (_) => ["8bit///8-bit per channel (24-bit total)", "16bit///16-bit per channel (48-bit total)"], IsAdvanced: true, Group: GroupSwarmInternal, OrderPriority: 1.5
            ));
        ModelSpecificEnhancements = Register<bool>(new("Model Specific Enhancements", "If checked, enables model-specific enhancements.\nFor example, on SDXL, smarter res-cond will be used.\nIf unchecked, will prefer more 'raw' behavior.",
            "true", IgnoreIf: "true", IsAdvanced: true, Group: GroupSwarmInternal, OrderPriority: 2
            ));
        // ================================================ FreeU (TODO: remove/extensionize?) ================================================
        GroupFreeU = new("FreeU", Open: false, OrderPriority: 10, IsAdvanced: true, Toggles: true, Description: "<a class=\"translate\" href=\"https://arxiv.org/abs/2309.11497\">Implements 'FreeU: Free Lunch in Diffusion U-Net'</a>\nThis is a minor adjustment to legacy Unet models (eg SDv1, SDXL).\nIt does not apply to newer DiT models, and even for Unet models it's not recommended.");
        FreeUApplyTo = Register<string>(new("[FreeU] Apply To", "Which models to apply FreeU to, as base, refiner, or both. Irrelevant when not using refiner.",
            "Both", GetValues: (_) => ["Both", "Base", "Refiner"], IsAdvanced: true, Group: GroupFreeU, FeatureFlag: "freeu", OrderPriority: -10
            ));
        FreeUVersion = Register<string>(new("[FreeU] Version", "Which version of FreeU to use.\n1 is the version in the original paper, 2 is a variation of it developed by the same original author of FreeU.",
            "1", GetValues: (_) => ["1", "2"], IsAdvanced: true, Group: GroupFreeU, FeatureFlag: "freeu", OrderPriority: -9
            ));
        FreeUBlock1 = Register<double>(new("[FreeU] Block One", "Block1 multiplier value for FreeU.\nPaper recommends 1.1.",
            "1.1", Min: 0, Max: 10, Step: 0.05, IsAdvanced: true, Group: GroupFreeU, FeatureFlag: "freeu", OrderPriority: -4
            ));
        FreeUBlock2 = Register<double>(new("[FreeU] Block Two", "Block2 multiplier value for FreeU.\nPaper recommends 1.2.",
            "1.2", Min: 0, Max: 10, Step: 0.05, IsAdvanced: true, Group: GroupFreeU, FeatureFlag: "freeu", OrderPriority: -3
            ));
        FreeUSkip1 = Register<double>(new("[FreeU] Skip One", "Skip1 multiplier value for FreeU.\nPaper recommends 0.9.",
            "0.9", Min: 0, Max: 10, Step: 0.05, IsAdvanced: true, Group: GroupFreeU, FeatureFlag: "freeu", OrderPriority: -2
            ));
        FreeUSkip2 = Register<double>(new("[FreeU] Skip Two", "Skip2 multiplier value for FreeU.\nPaper recommends 0.2.",
            "0.2", Min: 0, Max: 10, Step: 0.05, IsAdvanced: true, Group: GroupFreeU, FeatureFlag: "freeu", OrderPriority: -1
            ));
        // ================================================ Regional Prompting ================================================
        GroupRegionalPrompting = new("Regional Prompting", Open: false, OrderPriority: 9, IsAdvanced: true);
        GlobalRegionFactor = Register<double>(new("Global Region Factor", "When using regionalized prompts, this factor controls how strongly the global prompt overrides the regional prompts.\n0 means ignore global prompt, 1 means ignore regional, 0.5 means half-n-half.",
            "0.5", Toggleable: true, IgnoreIf: "0.5", Min: 0, Max: 1, Step: 0.05, ViewType: ParamViewType.SLIDER, Group: GroupRegionalPrompting, OrderPriority: -5
            ));
        RegionalObjectCleanupFactor = Register<double>(new("Regional Object Cleanup Factor", "When using an 'object' prompt, how much to cleanup the end result by.\nThis is the 'init image creativity' of the final cleanup step.\nSet to 0 to disable.",
            "0", IgnoreIf: "0", Min: 0, Max: 1, Step: 0.05, ViewType: ParamViewType.SLIDER, Group: GroupRegionalPrompting, OrderPriority: -4, IsAdvanced: true
            ));
        RegionalObjectInpaintingModel = Register<T2IModel>(new("Regional Object Inpainting Model", "When using regionalized prompts with distinct 'object' values, this overrides the model used to inpaint those objects.",
            "", Toggleable: true, Subtype: "Stable-Diffusion", Group: GroupRegionalPrompting, OrderPriority: -3, IsAdvanced: true
            ));
        SegmentModel = Register<T2IModel>(new("Segment Model", "Optionally specify a distinct model to use for 'segment' values.",
            "", Toggleable: true, Subtype: "Stable-Diffusion", Group: GroupRegionalPrompting, OrderPriority: 2, IsAdvanced: true
            ));
        MaskCompositeUnthresholded = Register<bool>(new("Mask Composite Unthresholded", "If checked, when masks are recomposited (eg from a '<segment:>'), it will be recomposited with the exact raw mask.\nIf false, it will boolean threshold the mask first.\nThe boolean threshold is 'more correct' and leads to better content replacement, whereas disabling threshold (by checking this option) may lead to better looking refinements.",
            "false", IgnoreIf: "false", Group: GroupRegionalPrompting, OrderPriority: 3, IsAdvanced: true
            ));
        SaveSegmentMask = Register<bool>(new("Save Segment Mask", "If checked, any usage of '<segment:>' syntax in prompts will save the generated mask in output.",
            "false", IgnoreIf: "false", Group: GroupRegionalPrompting, OrderPriority: 3
            ));
        SegmentMaskBlur = Register<int>(new("Segment Mask Blur", "Amount of blur to apply to the segment mask before using it.\nThis is for '<segment:>' syntax usage.\nDefaults to 10.",
            "10", Min: 0, Max: 64, Group: GroupRegionalPrompting, Examples: ["0", "4", "8", "16"], Toggleable: true, OrderPriority: 4
            ));
        SegmentMaskGrow = Register<int>(new("Segment Mask Grow", "Number of pixels of grow the segment mask by.\nThis is for '<segment:>' syntax usage.\nDefaults to 16.",
            "16", Min: 0, Max: 512, Group: GroupRegionalPrompting, Examples: ["0", "4", "8", "16", "32"], Toggleable: true, OrderPriority: 5
            ));
        SegmentMaskOversize = Register<int>(new("Segment Mask Oversize", "How wide a segment mask should be oversized by.\nLarger values include more context to get more accurate inpaint,\nand smaller values get closer to get better details.",
            "16", Min: 0, Max: 512, Toggleable: true, OrderPriority: 5.5, Group: GroupRegionalPrompting, Examples: ["0", "8", "32"]
            ));
        SegmentThresholdMax = Register<double>(new("Segment Threshold Max", "Maximum mask match value of a segment before clamping.\nLower values force more of the mask to be counted as maximum masking.\nToo-low values may include unwanted areas of the image.\nHigher values may soften the mask.",
            "1", Min: 0, Max: 1, Step: 0.05, Toggleable: true, ViewType: ParamViewType.SLIDER, Group: GroupRegionalPrompting, OrderPriority: 6
            ));
        SegmentSortOrder = Register<string>(new("Segment Sort Order", "How to sort segments when using '<segment:yolo->' syntax with indices.\nFor example: <segment:yolo-face_yolov8m-seg_60.pt-2> with largest-smallest, will select the second largest face segment.",
            "left-right", IgnoreIf: "left-right", GetValues: _ => ["left-right", "right-left", "top-bottom", "bottom-top", "largest-smallest", "smallest-largest"], Group: GroupRegionalPrompting, OrderPriority: 7
            ));
        EndStepsEarly = Register<double>(new("End Steps Early", "Percentage of steps to cut off before the image is done generation.",
            "0", Toggleable: true, IgnoreIf: "0", VisibleNormally: false, Min: 0, Max: 1, FeatureFlag: "endstepsearly"
            ));
        // ================================================ Advanced Sampling ================================================
        GroupAdvancedSampling = new("Advanced Sampling", Open: false, OrderPriority: 15, IsAdvanced: true);
        SamplerSigmaMin = Register<double>(new("Sampler Sigma Min", "Minimum sigma value for the sampler.\nOnly applies to Karras/Exponential schedulers.",
            "0", Min: 0, Max: 1000, Step: 0.01, Toggleable: true, IsAdvanced: true, Group: GroupAdvancedSampling, OrderPriority: -23
            ));
        SamplerSigmaMax = Register<double>(new("Sampler Sigma Max", "Maximum sigma value for the sampler.\nOnly applies to Karras/Exponential schedulers.",
            "10", Min: 0, Max: 1000, Step: 0.01, Toggleable: true, IsAdvanced: true, Group: GroupAdvancedSampling, FeatureFlag: "sd3", OrderPriority: -22
            ));
        SigmaShift = Register<double>(new("Sigma Shift", "Sigma shift is used for MMDiT models (like SD3) specifically.\nFor SD3, this value is recommended to be in the range of 1.5 to 3, normally 3.\nFor AuraFlow, 1.73 (square root of 3) is recommended.\nFor Flux, Schnell uses 0, 1.15 may be good for Dev.",
            "3", Min: 0, Max: 100, Step: 0.01, Toggleable: true, IsAdvanced: true, Group: GroupAdvancedSampling, OrderPriority: -21
            ));
        SamplerRho = Register<double>(new("Sampler Rho", "Rho value for the sampler.\nOnly applies to Karras/Exponential schedulers.",
            "7", Min: 0, Max: 1000, Step: 0.01, Toggleable: true, IsAdvanced: true, Group: GroupAdvancedSampling, OrderPriority: -20
            ));
        IP2PCFG2 = Register<double>(new("IP2P CFG 2", "CFG Scale for Cond2-Negative in InstructPix2Pix (Edit) models.",
            "1.5", Toggleable: true, Min: 1, Max: 100, ViewMax: 20, Step: 0.5, Examples: ["1.5", "2"], ViewType: ParamViewType.SLIDER, Group: GroupAdvancedSampling, OrderPriority: -12
            ));
        ClipStopAtLayer = Register<int>(new("CLIP Stop At Layer", "What layer of CLIP to stop at, from the end.\nAlso known as 'CLIP Skip'. Default CLIP Skip is -1 for SDv1, some models prefer -2.\nSDv2, SDXL, and beyond do not need this set ever.",
            "-1", Min: -24, Max: -1, Step: 1, Toggleable: true, IsAdvanced: true, Group: GroupAdvancedSampling, OrderPriority: -10
            ));
        VAETileSize = Register<int>(new("VAE Tile Size", "If enabled, decodes images through the VAE using tiles of this size.\nVAE Tiling reduces VRAM consumption, but takes longer and may impact quality.",
            "256", Min: 128, Max: 4096, Step: 32, Toggleable: true, IsAdvanced: true, Group: GroupAdvancedSampling, OrderPriority: -5
            ));
        VAETileOverlap = Register<int>(new("VAE Tile Overlap", "If VAE Tile Size is enabled, this controls how much overlap between tiles there should be.\nHigher overlap improves quality but takes longer.",
            "64", Min: 0, Max: 4096, Step: 32, Toggleable: true, IsAdvanced: true, Group: GroupAdvancedSampling, OrderPriority: -4.8
            ));
        VAETemporalTileSize = Register<int>(new("VAE Temporal Tile Size", "If VAE Tile Size is enabled, decodes videos through the VAE using video frame tiles of this size.\nVAE Tiling reduces VRAM consumption, but takes longer and may impact quality.",
            "64", Min: 8, Max: 4096, Step: 4, Toggleable: true, IsAdvanced: true, Group: GroupAdvancedSampling, OrderPriority: -4.6
            ));
        VAETemporalTileOverlap = Register<int>(new("VAE Temporal Tile Overlap", "If VAE Tile Size is enabled, this controls how much overlap between video frames there should be.\nHigher overlap improves quality but takes longer.",
            "8", Min: 4, Max: 4096, Step: 4, Toggleable: true, IsAdvanced: true, Group: GroupAdvancedSampling, OrderPriority: -4.4
            ));
        ColorCorrectionBehavior = Register<string>(new("Color Correction Behavior", "Experimental: How to correct color when compositing a masked image.\n'None' = Do not attempt color correction.\n'Uniform' = Compute a fixed offset HSV correction for all pixels.\n'Linear' = Compute a linear correction that depends on each pixel's S and V.\nThis is useful for example when doing inpainting with Flux models, as the Flux VAE does not retain consistent colors - 'Linear' may help correct for this misbehavior.",
            "None", IgnoreIf: "None", IsAdvanced: true, GetValues: (_) => ["None", "Uniform", "Linear"], Group: GroupAdvancedSampling, OrderPriority: -3
            ));
        RemoveBackground = Register<bool>(new("Remove Background", "If enabled, removes the background from the generated image.\nThis internally uses RemBG.",
            "false", IgnoreIf: "false", IsAdvanced: true, Group: GroupAdvancedSampling, OrderPriority: -2
             ));
        // ================================================ Other Fixes ================================================
        GroupOtherFixes = new("Other Fixes", Open: false, OrderPriority: 20, IsAdvanced: true);
        TrimVideoStartFrames = Register<int>(new("Trim Video Start Frames", "Trim this many frames from the start of a video output.\nThis will shorten a video, and is just a fix for video models that corrupt start frames (such as Wan).",
            "0", IgnoreIf: "0", Min: 0, Max: 1000, IsAdvanced: true, Group: GroupOtherFixes, OrderPriority: -11
            ));
        TrimVideoEndFrames = Register<int>(new("Trim Video End Frames", "Trim this many frames from the end of a video output.\nThis will shorten a video, and is just a fix for video models that corrupt end frames (such as Wan).",
            "0", IgnoreIf: "0", Min: 0, Max: 1000, IsAdvanced: true, Group: GroupOtherFixes, OrderPriority: -10
            ));
    }

    /// <summary>Gets the value in the list that best matches the input text of a model name (for user input handling), or null if no match.</summary>
    public static string GetBestModelInList(string name, IEnumerable<string> list)
    {
        return GetBestInList(name, list, s => CleanNameGeneric(CleanModelName(s)));
    }

    /// <summary>Gets the value in the list that best matches the input text (for user input handling), or null if no match.</summary>
    public static string GetBestInList(string name, IEnumerable<string> list, Func<string, string> cleanFunc = null)
    {
        cleanFunc ??= CleanNameGeneric;
        string backup = null;
        int bestLen = 999;
        name = cleanFunc(name);
        foreach (string listVal in list)
        {
            string listValClean = cleanFunc(listVal);
            if (listValClean == name)
            {
                return listVal;
            }
            if (listValClean.Contains(name))
            {
                if (listValClean.Length < bestLen)
                {
                    backup = listVal;
                    bestLen = listValClean.Length;
                }
            }
        }
        return backup;
    }

    /// <summary>Quick hex validator.</summary>
    public static AsciiMatcher ValidBase64Matcher = new(AsciiMatcher.BothCaseLetters + AsciiMatcher.Digits + "+/=");

    /// <summary>Converts a parameter value in a valid input for that parameter, or throws <see cref="SwarmReadableErrorException"/> if it can't.</summary>
    public static string ValidateParam(T2IParamType type, string val, Session session)
    {
        string origVal = val;
        if (type is null)
        {
            throw new SwarmUserErrorException("Unknown parameter type");
        }
        switch (type.Type)
        {
            case T2IParamDataType.INTEGER:
                if (!long.TryParse(val, out long valInt))
                {
                    throw new SwarmUserErrorException($"Invalid integer value for param {type.Name} - '{origVal}' - must be a valid integer (eg '0', '3', '-5', etc)");
                }
                if (type.Min != 0 || type.Max != 0)
                {
                    if (valInt < type.Min || valInt > type.Max)
                    {
                        throw new SwarmUserErrorException($"Invalid integer value for param {type.Name} - '{origVal}' - must be between {type.Min} and {type.Max}");
                    }
                }
                return valInt.ToString();
            case T2IParamDataType.DECIMAL:
                if (!double.TryParse(val, out double valDouble))
                {
                    throw new SwarmUserErrorException($"Invalid decimal value for param {type.Name} - '{origVal}' - must be a valid decimal (eg '0.0', '3.5', '-5.2', etc)");
                }
                if (type.Min != 0 || type.Max != 0)
                {
                    if (valDouble < type.Min || valDouble > type.Max)
                    {
                        throw new SwarmUserErrorException($"Invalid decimal value for param {type.Name} - '{origVal}' - must be between {type.Min} and {type.Max}");
                    }
                }
                return valDouble.ToString();
            case T2IParamDataType.BOOLEAN:
                val = val.ToLowerFast();
                if (val != "true" && val != "false")
                {
                    throw new SwarmUserErrorException($"Invalid boolean value for param {type.Name} - '{origVal}' - must be exactly 'true' or 'false'");
                }
                return val;
            case T2IParamDataType.TEXT:
            case T2IParamDataType.DROPDOWN:
                if (type.GetValues is not null && type.ValidateValues)
                {
                    string[] rawVals = [.. type.GetValues(session).Select(v => v.Before("///"))];
                    val = GetBestInList(val, rawVals);
                    if (val is null)
                    {
                        throw new SwarmUserErrorException($"Invalid value for param {type.Name} - '{origVal}' - must be one of: `{string.Join("`, `", rawVals)}`");
                    }
                }
                return val;
            case T2IParamDataType.LIST:
                string[] vals = val.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (type.GetValues is not null && type.ValidateValues)
                {
                    string[] possible = [.. type.GetValues(session).Select(v => v.Before("///"))];
                    for (int i = 0; i < vals.Length; i++)
                    {
                        string search = vals[i];
                        vals[i] = GetBestInList(search, possible);
                        if (vals[i] is null)
                        {
                            vals[i] = GetBestModelInList(CleanModelName(search), possible);
                            if (vals[i] is null)
                            {
                                if (possible.Length < 10)
                                {
                                    throw new SwarmUserErrorException($"Invalid value for param {type.Name} - '{origVal}' - must be one of: `{possible.JoinString("`, `")}`");
                                }
                                else
                                {
                                    throw new SwarmUserErrorException($"Invalid value for param {type.Name} - '{origVal}' - option does not exist. Has it been deleted?");
                                }
                            }
                        }
                    }
                    return vals.JoinString(",");
                }
                return val;
            case T2IParamDataType.IMAGE:
                if (val.StartsWith("data:"))
                {
                    val = val.After(',');
                }
                if (string.IsNullOrWhiteSpace(val))
                {
                    return "";
                }
                if (!ValidBase64Matcher.IsOnlyMatches(val) || val.Length < 10)
                {
                    string shortText = val.Length > 10 ? val[..10] + "..." : val;
                    throw new SwarmUserErrorException($"Invalid image value for param {type.Name} - '{origVal}' - must be a valid base64 string - got '{shortText}'");
                }
                return origVal;
            case T2IParamDataType.IMAGE_LIST:
                foreach (string part in val.Split('|'))
                {
                    string partVal = part.Trim();
                    if (partVal.StartsWith("data:"))
                    {
                        partVal = partVal.After(',');
                    }
                    if (string.IsNullOrWhiteSpace(val))
                    {
                        continue;
                    }
                    if (!ValidBase64Matcher.IsOnlyMatches(partVal) || partVal.Length < 10)
                    {
                        string shortText = partVal.Length > 10 ? partVal[..10] + "..." : partVal;
                        throw new SwarmUserErrorException($"Invalid image-list value for param {type.Name} - '{origVal}' - must be a valid base64 string - got '{shortText}'");
                    }
                }
                return origVal;
            case T2IParamDataType.MODEL:
                if (!Program.T2IModelSets.TryGetValue(type.Subtype ?? "Stable-Diffusion", out T2IModelHandler handler))
                {
                    throw new SwarmUserErrorException($"Invalid model sub-type for param {type.Name}: '{type.Subtype}' - are you sure that type name is correct? (Developer error)");
                }
                val = GetBestModelInList(val, [.. handler.ListModelNamesFor(session)]);
                if (val is null)
                {
                    throw new SwarmUserErrorException($"Invalid model value for param {type.Name} - '{origVal}' - are you sure that model name is correct?");
                }
                return val;
        }
        throw new SwarmUserErrorException($"Unknown parameter type's data type? {type.Type}");
    }

    /// <summary>Takes user input of a parameter and applies it to the parameter tracking data object.</summary>
    public static void ApplyParameter(string paramTypeName, string value, T2IParamInput data)
    {
        if (!TryGetType(paramTypeName, out T2IParamType type, data))
        {
            throw new SwarmUserErrorException($"Unrecognized parameter type name '{paramTypeName}'.");
        }
        if (value == type.IgnoreIf)
        {
            return;
        }
        if (type.Permission is not null)
        {
            if (!data.SourceSession.User.HasPermission(type.Permission))
            {
                throw new SwarmUserErrorException($"You do not have permission to use parameter {type.Name}.");
            }
        }
        try
        {
            value = ValidateParam(type, value, data.SourceSession);
            data.Set(type, value);
        }
        catch (SwarmReadableErrorException ex)
        {
            throw new SwarmReadableErrorException($"Invalid value for parameter {type.Name}: {ex.Message}");
        }
        catch (Exception ex)
        {
            throw new Exception($"Invalid value for parameter {type.Name}", ex);
        }
    }

    /// <summary>Gets the type data for a given type name.</summary>
    public static T2IParamType GetType(string name, T2IParamInput context)
    {
        name = CleanTypeName(name);
        T2IParamType result;
        foreach (Func<string, T2IParamInput, T2IParamType> provider in FakeTypeProviders)
        {
            result = provider(name, context);
            if (result is not null)
            {
                return result;
            }
        }
        result = Types.GetValueOrDefault(name);
        if (result is not null)
        {
            return result;
        }
        return null;
    }

    /// <summary>Tries to get the type data for a given type name, returning whether it was found, and outputting the type if it was found.</summary>
    public static bool TryGetType(string name, out T2IParamType type, T2IParamInput context)
    {
        name = CleanTypeName(name);
        type = GetType(name, context);
        return type is not null;
    }

    /// <summary>Gets the actual width,height value for a given aspect ratio, based on a 512x512 base scale.</summary>
    public static (int, int) AspectRatioToSizeReference(string aspectRatio)
    {
        int width, height;
        if (aspectRatio == "1:1") { width = 512; height = 512; }
        else if (aspectRatio == "4:3") { width = 576; height = 448; }
        else if (aspectRatio == "3:2") { width = 608; height = 416; }
        else if (aspectRatio == "8:5") { width = 608; height = 384; }
        else if (aspectRatio == "16:9") { width = 672; height = 384; }
        else if (aspectRatio == "21:9") { width = 768; height = 320; }
        else if (aspectRatio == "3:4") { width = 448; height = 576; }
        else if (aspectRatio == "2:3") { width = 416; height = 608; }
        else if (aspectRatio == "5:8") { width = 384; height = 608; }
        else if (aspectRatio == "9:16") { width = 384; height = 672; }
        else if (aspectRatio == "9:21") { width = 320; height = 768; }
        else { width = -1; height = -1; }
        return (width, height);
    }

    /// <summary>Adds new entries to a list of dropdown values, in a clean way that avoids breaking from display names, and applying an async-safe concat.</summary>
    public static void ConcatDropdownValsClean(ref List<string> mainList, IEnumerable<string> addIn)
    {
        HashSet<string> existing = mainList.Select(v => v.Before("///")).ToHashSet();
        List<string> result = new(mainList);
        foreach (string str in addIn)
        {
            if (!existing.Contains(str.Before("///")))
            {
                result.Add(str);
            }
        }
        mainList = result;
    }
}
