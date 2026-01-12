using System;
using System.Text;
using System.Collections.Generic;
using System.IO;
using SwarmUI.Core;
using SwarmUI.Media;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using Newtonsoft.Json.Linq;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;

namespace SwarmUI.Builtin_ComfyUIBackend;

/// <summary>Helper class for generating ComfyUI workflows from input parameters.</summary>
public partial class WorkflowGenerator
{
    /// <summary>Represents a step in the workflow generation process.</summary>
    /// <param name="Action">The action to take.</param>
    /// <param name="Priority">The priority to apply it at.
    /// These are such from lowest to highest.
    /// "-10" is the priority of the first core pre-init,
    /// "0" is before final outputs,
    /// "10" is final output.</param>
    public record class WorkflowGenStep(Action<WorkflowGenerator> Action, double Priority);

    /// <summary>Callable steps for modifying workflows as they go.</summary>
    public static List<WorkflowGenStep> Steps = [];

    /// <summary>Callable steps for configuring model generation.</summary>
    public static List<WorkflowGenStep> ModelGenSteps = [];

    /// <summary>Can be set to globally block custom nodes, if needed.</summary>
    public static volatile bool RestrictCustomNodes = false;

    /// <summary>Supported Features of the comfy backend.</summary>
    public HashSet<string> Features = [];

    /// <summary>Helper tracker for CLIP Models that are loaded (to skip a datadrive read from being reused every time).</summary>
    public static ConcurrentDictionary<string, string> ClipModelsValid = [];

    /// <summary>Helper tracker for Vision Models that are loaded (to skip a datadrive read from being reused every time).</summary>
    public static ConcurrentDictionary<string, string> VisionModelsValid = [];

    /// <summary>Helper tracker for IP Adapter Models that are loaded (to skip a datadrive read from being reused every time).</summary>
    public static ConcurrentDictionary<string, string> IPAdapterModelsValid = [];

    /// <summary>Register a new step to the workflow generator.</summary>
    public static void AddStep(Action<WorkflowGenerator> step, double priority)
    {
        Steps.Add(new(step, priority));
        Steps = [.. Steps.OrderBy(s => s.Priority)];
    }

    /// <summary>Register a new step to the workflow generator.</summary>
    public static void AddModelGenStep(Action<WorkflowGenerator> step, double priority)
    {
        ModelGenSteps.Add(new(step, priority));
        ModelGenSteps = [.. ModelGenSteps.OrderBy(s => s.Priority)];
    }

    static WorkflowGenerator()
    {
        WorkflowGeneratorSteps.Register();
    }

    /// <summary>Lock for when ensuring the backend has valid models.</summary>
    public static MultiLockSet<string> ModelDownloaderLocks = new(32);

    /// <summary>Helper to create a NodePath: [nodeId, outputIndex].</summary>
    public static JArray NodePath(string node, int index)
    {
        return [node, index];
    }

    /// <summary>The raw user input data.</summary>
    public T2IParamInput UserInput;

    /// <summary>The output workflow object.</summary>
    public JObject Workflow;

    /// <summary>Lastmost node ID for key input trackers.</summary>
    public JArray FinalModel = ["4", 0],
        FinalClip = ["4", 1],
        FinalInputImage = null,
        FinalMask = null,
        FinalVae = ["4", 2],
        FinalAudioVae = null,
        FinalLatentImage = ["5", 0],
        FinalLatentAudio = null,
        FinalPrompt = ["6", 0],
        FinalNegativePrompt = ["7", 0],
        FinalSamples = ["10", 0],
        FinalImageOut = null,
        FinalAudioOut = null,
        FinalTrimLatent = null,
        LoadingModel = null, LoadingClip = null, LoadingVAE = null;

    /// <summary>If true, something has required the workflow stop now.</summary>
    public bool SkipFurtherSteps = false;

    /// <summary>What model currently matches <see cref="FinalModel"/>.</summary>
    public T2IModel FinalLoadedModel;

    /// <summary>What models currently match <see cref="FinalModel"/> (including eg loras).</summary>
    public List<T2IModel> FinalLoadedModelList = [];

    /// <summary>Mapping of any extra nodes to keep track of, Name->ID, eg "MyNode" -> "15".</summary>
    public Dictionary<string, string> NodeHelpers = [];

    /// <summary>Last used ID, tracked to safely add new nodes with sequential IDs. Note that this starts at 100, as below 100 is reserved for constant node IDs.</summary>
    public int LastID = 100;

    /// <summary>Model folder separator format, if known.</summary>
    public string ModelFolderFormat;

    /// <summary>Type id ('Base', 'Refiner') of the current loading model.</summary>
    public string LoadingModelType;

    /// <summary>If true, user-selected VAE may be wrong, so ignore it.</summary>
    public bool NoVAEOverride = false;

    /// <summary>If true, the generator is currently working on the refiner stage.</summary>
    public bool IsRefinerStage = false;

    /// <summary>If true, the generator is currently working on Image2Video.</summary>
    public bool IsImageToVideo = false;

    /// <summary>If true, the generator is currently working on Image2Video-SwapModel.</summary>
    public bool IsImageToVideoSwap = false;

    /// <summary>If true, the main sampler should add noise. If false, it shouldn't.</summary>
    public bool MainSamplerAddNoise = true;

    /// <summary>If true, Differential Diffusion node has been attached to the current model.</summary>
    public bool IsDifferentialDiffusion = false;

    /// <summary>Outputs of <see cref="CreateImageMaskCrop(JArray, JArray, int, JArray, T2IModel, double, double)"/> if used for the main image.</summary>
    public ImageMaskCropData MaskShrunkInfo = new(null, null, null, null);

    /// <summary>Gets the current loaded model class.</summary>
    public T2IModelClass CurrentModelClass()
    {
        FinalLoadedModel ??= UserInput.Get(T2IParamTypes.Model, null);
        return FinalLoadedModel?.ModelClass;
    }

    /// <summary>Gets the current loaded model compat class.</summary>
    public T2IModelCompatClass CurrentCompat()
    {
        return CurrentModelClass()?.CompatClass;
    }

    /// <summary>Gets the current loaded model compat class ID.</summary>
    public string CurrentCompatClass()
    {
        return CurrentModelClass()?.CompatClass?.ID;
    }

    /// <summary>Gets a dynamic ID within a semi-stable registration set.</summary>
    public string GetStableDynamicID(int index, int offset)
    {
        for (int i = 0; i < 99999; i++)
        {
            int id = 1000 + index + offset + i;
            string result = $"{id}";
            if (!HasNode(result))
            {
                return result;
            }
        }
        throw new Exception("Failed to find a stable dynamic ID.");
    }

    /// <summary>Creates a new node with the given class type and configuration action, and optional manual ID.</summary>
    public string CreateNode(string classType, Action<string, JObject> configure, string id = null)
    {
        id ??= $"{LastID++}";
        JObject obj = new() { ["class_type"] = classType };
        configure(id, obj);
        Workflow[id] = obj;
        return id;
    }

    /// <summary>Creates a new node with the given class type and input data, and optional manual ID.</summary>
    public string CreateNode(string classType, JObject input, string id = null, bool idMandatory = true)
    {
        string lookup = $"__generic_node__{classType}___{input}";
        if ((id is null || !idMandatory) && NodeHelpers.TryGetValue(lookup, out string existingNode))
        {
            return existingNode;
        }
        string result = CreateNode(classType, (_, n) => n["inputs"] = input, id);
        NodeHelpers[lookup] = result;
        return result;
    }

    /// <summary>Helper to download a core model file required by the workflow.</summary>
    public void DownloadModel(string name, string filePath, string url, string hash)
    {
        if (File.Exists(filePath))
        {
            return;
        }
        lock (ModelDownloaderLocks.GetLock(name))
        {
            if (File.Exists(filePath)) // Double-check in case another thread downloaded it
            {
                return;
            }
            Logs.Info($"Downloading {name} to {filePath}...");
            double nextPerc = 0.05;
            string tmpPath = $"{filePath}.tmp";
            try
            {
                if (File.Exists(tmpPath))
                {
                    File.Delete(tmpPath);
                }
                Utilities.DownloadFile(url, tmpPath, (bytes, total, perSec) =>
                {
                    double perc = bytes / (double)total;
                    if (perc >= nextPerc)
                    {
                        Logs.Info($"{name} download at {perc * 100:0.0}%...");
                        // TODO: Send a signal back so a progress bar can be displayed on a UI
                        nextPerc = Math.Round(perc / 0.05) * 0.05 + 0.05;
                    }
                }, verifyHash: hash).Wait();
                File.Move(tmpPath, filePath);
            }
            catch (Exception ex)
            {
                Logs.Error($"Failed to download {name} from {url}: {ex.Message}");
                File.Delete(tmpPath);
                throw new SwarmReadableErrorException("Required model download failed.");
            }
            Logs.Info($"Downloading complete, continuing.");
        }
    }

    /// <summary>Loads and applies LoRAs in the user parameters for the given LoRA confinement ID, as a Set CLIP Hooks node.</summary>
    public JArray CreateHookLorasForConfinement(int confinement, JArray clip)
    {
        if (!UserInput.TryGet(T2IParamTypes.Loras, out List<string> loras))
        {
            return clip;
        }
        List<string> weights = UserInput.Get(T2IParamTypes.LoraWeights);
        List<string> tencWeights = UserInput.Get(T2IParamTypes.LoraTencWeights);
        List<string> confinements = UserInput.Get(T2IParamTypes.LoraSectionConfinement);
        if (confinement > 0 && (confinements is null || confinements.Count == 0))
        {
            return clip;
        }
        T2IModelHandler loraHandler = Program.T2IModelSets["LoRA"];
        JArray last = null;
        for (int i = 0; i < loras.Count; i++)
        {
            int confinementId = -1;
            if (confinements is not null && confinements.Count > i)
            {
                confinementId = int.Parse(confinements[i]);
            }
            if (confinementId != confinement)
            {
                continue;
            }
            if (!loraHandler.Models.TryGetValue(loras[i] + ".safetensors", out T2IModel lora))
            {
                if (!loraHandler.Models.TryGetValue(loras[i], out lora))
                {
                    throw new SwarmUserErrorException($"LoRA Model '{loras[i]}' not found in the model set.");
                }
            }
            FinalLoadedModelList.Add(lora);
            if (Program.ServerSettings.Metadata.ImageMetadataIncludeModelHash)
            {
                lora.GetOrGenerateTensorHashSha256(); // Ensure hash is preloaded early
            }
            float weight = weights is null || i >= weights.Count ? 1 : float.Parse(weights[i]);
            float tencWeight = tencWeights is null || i >= tencWeights.Count ? weight : float.Parse(tencWeights[i]);
            string newId = CreateNode("CreateHookLora", new JObject()
            {
                ["prev_hooks"] = last,
                ["lora_name"] = lora.ToString(ModelFolderFormat),
                ["strength_model"] = weight,
                ["strength_clip"] = tencWeight
            }, GetStableDynamicID(2500, i), false);
            last = [newId, 0];
        }
        if (last is null)
        {
            return clip;
        }
        string newHooks = CreateNode("SetClipHooks", new JObject()
        {
            ["hooks"] = last,
            ["clip"] = clip,
            ["apply_to_conds"] = true,
            ["schedule_clip"] = false
        }, GetStableDynamicID(2500, loras.Count), false);
        return [newHooks, 0];
    }

    /// <summary>Loads and applies LoRAs in the user parameters for the given LoRA confinement ID.</summary>
    public (JArray, JArray) LoadLorasForConfinement(int confinement, JArray model, JArray clip)
    {
        if (!UserInput.TryGet(T2IParamTypes.Loras, out List<string> loras))
        {
            return (model, clip);
        }
        List<string> weights = UserInput.Get(T2IParamTypes.LoraWeights);
        List<string> tencWeights = UserInput.Get(T2IParamTypes.LoraTencWeights);
        List<string> confinements = UserInput.Get(T2IParamTypes.LoraSectionConfinement);
        if (confinement > 0 && (confinements is null || confinements.Count == 0))
        {
            return (model, clip);
        }
        T2IModelHandler loraHandler = Program.T2IModelSets["LoRA"];
        for (int i = 0; i < loras.Count; i++)
        {
            int confinementId = -1;
            if (confinements is not null && confinements.Count > i)
            {
                confinementId = int.Parse(confinements[i]);
            }
            if (confinementId != confinement)
            {
                continue;
            }
            if (!loraHandler.Models.TryGetValue(loras[i] + ".safetensors", out T2IModel lora))
            {
                if (!loraHandler.Models.TryGetValue(loras[i], out lora))
                {
                    throw new SwarmUserErrorException($"LoRA Model '{loras[i]}' not found in the model set.");
                }
            }
            FinalLoadedModelList.Add(lora);
            if (Program.ServerSettings.Metadata.ImageMetadataIncludeModelHash)
            {
                lora.GetOrGenerateTensorHashSha256(); // Ensure hash is preloaded early
            }
            float weight = weights is null || i >= weights.Count ? 1 : float.Parse(weights[i]);
            float tencWeight = tencWeights is null || i >= tencWeights.Count ? weight : float.Parse(tencWeights[i]);
            string id = GetStableDynamicID(2000, i);
            string specialFormat = FinalLoadedModel?.Metadata?.SpecialFormat;
            if (IsFlux() && (specialFormat == "nunchaku" || specialFormat == "nunchaku-fp4"))
            {
                // This is dirty to use this alt node, but it seems required for Nunchaku.
                string newId = CreateNode("NunchakuFluxLoraLoader", new JObject()
                {
                    ["model"] = model,
                    ["lora_name"] = lora.ToString(ModelFolderFormat),
                    ["lora_strength"] = weight
                }, id, false);
                model = [newId, 0];
            }
            else if (CurrentCompat()?.LorasTargetTextEnc == false || tencWeight == 0)
            {
                string newId = CreateNode("LoraLoaderModelOnly", new JObject()
                {
                    ["model"] = model,
                    ["lora_name"] = lora.ToString(ModelFolderFormat),
                    ["strength_model"] = weight,
                }, id, false);
                model = [newId, 0];
            }
            else
            {
                string newId = CreateNode("LoraLoader", new JObject()
                {
                    ["model"] = model,
                    ["clip"] = clip,
                    ["lora_name"] = lora.ToString(ModelFolderFormat),
                    ["strength_model"] = weight,
                    ["strength_clip"] = tencWeight
                }, id, false);
                model = [newId, 0];
                clip = [newId, 1];
            }
        }
        return (model, clip);
    }

    /// <summary>Creates a new node to load an image.</summary>
    public string CreateLoadImageNode(ImageFile img, string param, bool resize, string nodeId = null, int? width = null, int? height = null)
    {
        if (nodeId is null && NodeHelpers.TryGetValue($"imgloader_{param}_{resize}", out string alreadyLoaded))
        {
            return alreadyLoaded;
        }
        string result;
        if (Features.Contains("comfy_loadimage_b64") && !RestrictCustomNodes)
        {
            if (img.Type.MetaType == MediaMetaType.Image)
            {
                result = CreateNode("SwarmLoadImageB64", new JObject()
                {
                    ["image_base64"] = (resize ? img.Resize(width ?? UserInput.GetImageWidth(), height ?? UserInput.GetImageHeight()) : img).AsBase64
                }, nodeId);
            }
            else
            {
                result = CreateNode("SwarmLoadImageB64", new JObject()
                {
                    ["image_base64"] = img.AsBase64
                }, resize ? null : nodeId);
                if (resize)
                {
                    result = CreateNode("ImageScale", new JObject()
                    {
                        ["image"] = NodePath(result, 0),
                        ["width"] = UserInput.GetImageWidth(),
                        ["height"] = UserInput.GetImageHeight(),
                        ["upscale_method"] = "lanczos",
                        ["crop"] = "disabled"
                    }, nodeId);
                }
            }
        }
        else
        {
            result = CreateNode("LoadImage", new JObject()
            {
                ["image"] = param
            }, nodeId);
        }
        NodeHelpers[$"imgloader_{param}_{resize}"] = result;
        return result;
    }

    /// <summary>For <see cref="CreateImageMaskCrop(JArray, JArray, int, JArray, T2IModel, double, double)"/>.</summary>
    public record class ImageMaskCropData(string BoundsNode, string CroppedMask, string MaskedLatent, string ScaledImage);

    /// <summary>Creates an automatic image mask-crop before sampling, to be followed by <see cref="RecompositeCropped(string, string, JArray, JArray)"/> after sampling.</summary>
    /// <param name="mask">The mask node input.</param>
    /// <param name="image">The image node input.</param>
    /// <param name="growBy">Number of pixels to grow the boundary by.</param>
    /// <param name="vae">The relevant VAE.</param>
    /// <param name="model">The model in use, for determining resolution.</param>
    /// <param name="threshold">Optional minimum value threshold.</param>
    /// <param name="thresholdMax">Optional maximum value of the threshold.</param>
    /// <returns>(boundsNode, croppedMask, maskedLatent, scaledImage).</returns>
    public ImageMaskCropData CreateImageMaskCrop(JArray mask, JArray image, int growBy, JArray vae, T2IModel model, double threshold = 0.01, double thresholdMax = 1)
    {
        if (threshold > 0)
        {
            string thresholded = CreateNode("SwarmMaskThreshold", new JObject()
            {
                ["mask"] = mask,
                ["min"] = threshold,
                ["max"] = thresholdMax
            });
            mask = [thresholded, 0];
        }
        string targetRes = UserInput.Get(T2IParamTypes.SegmentTargetResolution, "0x0");
        (string targetWidth, string targetHeight) = targetRes.BeforeAndAfter('x');
        int targetX = int.Parse(targetWidth);
        int targetY = int.Parse(targetHeight);
        bool isCustomRes = targetX > 0 && targetY > 0;
        string boundsNode = CreateNode("SwarmMaskBounds", new JObject()
        {
            ["mask"] = mask,
            ["grow"] = growBy,
            ["aspect_x"] = isCustomRes ? targetX : 0,
            ["aspect_y"] = isCustomRes ? targetY : 0
        });
        string croppedImage = CreateNode("SwarmImageCrop", new JObject()
        {
            ["image"] = image,
            ["x"] = NodePath(boundsNode, 0),
            ["y"] = NodePath(boundsNode, 1),
            ["width"] = NodePath(boundsNode, 2),
            ["height"] = NodePath(boundsNode, 3)
        });
        string croppedMask = CreateNode("CropMask", new JObject()
        {
            ["mask"] = mask,
            ["x"] = NodePath(boundsNode, 0),
            ["y"] = NodePath(boundsNode, 1),
            ["width"] = NodePath(boundsNode, 2),
            ["height"] = NodePath(boundsNode, 3)
        });
        string scaledImage = CreateNode("SwarmImageScaleForMP", new JObject()
        {
            ["image"] = NodePath(croppedImage, 0),
            ["width"] = isCustomRes ? targetX : model?.StandardWidth <= 0 ? UserInput.GetImageWidth() : model.StandardWidth,
            ["height"] = isCustomRes ? targetY : model?.StandardHeight <= 0 ? UserInput.GetImageHeight() : model.StandardHeight,
            ["can_shrink"] = true
        });
        JArray encoded = DoMaskedVAEEncode(vae, [scaledImage, 0], [croppedMask, 0], null);
        return new(boundsNode, croppedMask, $"{encoded[0]}", scaledImage);
    }

    /// <summary>Returns a masked image composite with mask thresholding.</summary>
    public JArray CompositeMask(JArray baseImage, JArray newImage, JArray mask)
    {
        if (!UserInput.Get(T2IParamTypes.MaskCompositeUnthresholded, false))
        {
            string thresholded = CreateNode("ThresholdMask", new JObject()
            {
                ["mask"] = mask,
                ["value"] = 0.001
            });
            mask = [thresholded, 0];
        }
        string nodeClass = "ImageCompositeMasked";
        if (Features.Contains("variation_seed") && !RestrictCustomNodes)
        {
            nodeClass = "SwarmImageCompositeMaskedColorCorrecting";
        }
        string composited = CreateNode(nodeClass, new JObject()
        {
            ["destination"] = baseImage,
            ["source"] = newImage,
            ["mask"] = mask,
            ["x"] = 0,
            ["y"] = 0,
            ["resize_source"] = false,
            ["correction_method"] = UserInput.Get(T2IParamTypes.ColorCorrectionBehavior, "None")
        });
        return [composited, 0];
    }

    /// <summary>Recomposites a masked image edit, after <see cref="CreateImageMaskCrop(JArray, JArray, int)"/> was used.</summary>
    public JArray RecompositeCropped(string boundsNode, JArray croppedMask, JArray firstImage, JArray newImage)
    {
        string scaledBack = CreateNode("ImageScale", new JObject()
        {
            ["image"] = newImage,
            ["width"] = NodePath(boundsNode, 2),
            ["height"] = NodePath(boundsNode, 3),
            ["upscale_method"] = "lanczos",
            ["crop"] = "disabled"
        });
        if (!UserInput.Get(T2IParamTypes.MaskCompositeUnthresholded, false))
        {
            string thresholded = CreateNode("ThresholdMask", new JObject()
            {
                ["mask"] = croppedMask,
                ["value"] = 0.001
            });
            croppedMask = [thresholded, 0];
        }
        string nodeClass = "ImageCompositeMasked";
        if (Features.Contains("variation_seed") && !RestrictCustomNodes)
        {
            nodeClass = "SwarmImageCompositeMaskedColorCorrecting";
        }
        string composited = CreateNode(nodeClass, new JObject()
        {
            ["destination"] = firstImage,
            ["source"] = NodePath(scaledBack, 0),
            ["mask"] = croppedMask,
            ["x"] = NodePath(boundsNode, 0),
            ["y"] = NodePath(boundsNode, 1),
            ["resize_source"] = false,
            ["correction_method"] = UserInput.Get(T2IParamTypes.ColorCorrectionBehavior, "None")
        });
        return [composited, 0];
    }

    /// <summary>Call to run the generation process and get the result.</summary>
    public JObject Generate()
    {
        Workflow = [];
        foreach (WorkflowGenStep step in Steps)
        {
            step.Action(this);
            if (SkipFurtherSteps)
            {
                break;
            }
        }
        return Workflow;
    }

    /// <summary>Returns true if the given node ID has already been used.</summary>
    public bool HasNode(string id)
    {
        return Workflow.ContainsKey(id);
    }

    public int T2VFPSOverride = -1;

    public static List<Func<WorkflowGenerator, int, int>> AltT2VFPSDefaulters = [];

    public int Text2VideoFPS()
    {
        if (T2VFPSOverride > 0)
        {
            return T2VFPSOverride;
        }
        int fpsDefault = 24;
        if (IsWanVideo())
        {
            // TODO: Detect CausVid (24 fps LoRA) and/or Wan 2.2 (also 24fps) somehow, to be able to set the base to 16 and leave the rest at 24.
            //fpsDefault = 16;
        }
        foreach (Func<WorkflowGenerator, int, int> fpsOverride in AltT2VFPSDefaulters)
        {
            fpsDefault = fpsOverride(this, fpsDefault);
        }
        return UserInput.Get(T2IParamTypes.Text2VideoFPS, UserInput.Get(T2IParamTypes.VideoFPS, fpsDefault));
    }

    /// <summary>Creates a node to save an image output.</summary>
    public string CreateImageSaveNode(JArray image, string id = null)
    {
        if (IsVideoModel())
        {
            if (UserInput.Get(T2IParamTypes.Text2VideoBoomerang, false))
            {
                string bounced = CreateNode("SwarmVideoBoomerang", new JObject()
                {
                    ["images"] = image
                });
                image = [bounced, 0];
            }
            return CreateNode("SwarmSaveAnimationWS", new JObject()
            {
                ["images"] = image,
                ["fps"] = Text2VideoFPS(),
                ["lossless"] = false,
                ["quality"] = 95,
                ["method"] = "default",
                ["format"] = UserInput.Get(T2IParamTypes.Text2VideoFormat, "h264-mp4"),
                ["audio"] = FinalAudioOut
            }, id);
        }
        else if (Features.Contains("comfy_saveimage_ws") && !RestrictCustomNodes)
        {
            return CreateNode("SwarmSaveImageWS", new JObject()
            {
                ["images"] = image,
                ["bit_depth"] = UserInput.Get(T2IParamTypes.BitDepth, "8bit")
            }, id);
        }
        else
        {
            return CreateNode("SaveImage", new JObject()
            {
                ["filename_prefix"] = $"SwarmUI_{Random.Shared.Next():X4}_",
                ["images"] = image
            }, id);
        }
    }

    /// <summary>Creates a node to save an animation output.</summary>
    public string CreateAnimationSaveNode(JArray anim, int fps, string format, string id = null)
    {
        return CreateNode("SwarmSaveAnimationWS", new JObject()
        {
            ["images"] = anim,
            ["fps"] = fps,
            ["lossless"] = false,
            ["quality"] = 95,
            ["method"] = "default",
            ["format"] = format,
            ["audio"] = FinalAudioOut
        }, id);
    }

    /// <summary>Creates a VAELoader node and returns its node ID. Avoids duplication.</summary>
    public JArray CreateVAELoader(string vae, string id = null)
    {
        string vaeFixed = vae.Replace('\\', '/').Replace("/", ModelFolderFormat ?? $"{Path.DirectorySeparatorChar}");
        if (id is null && NodeHelpers.TryGetValue($"vaeloader-{vaeFixed}", out string helper))
        {
            return [helper, 0];
        }
        string vaeLoader;
        if (IsSana())
        {
            vaeLoader = CreateNode("ExtraVAELoader", new JObject()
            {
                ["vae_name"] = vaeFixed,
                ["vae_type"] = "dcae-f32c32-sana-1.0",
                ["dtype"] = "FP16"
            }, id);
        }
        else
        {
            vaeLoader = CreateNode("VAELoader", new JObject()
            {
                ["vae_name"] = vaeFixed
            }, id);
        }
        NodeHelpers[$"vaeloader-{vaeFixed}"] = vaeLoader;
        return [vaeLoader, 0];
    }

    /// <summary>Creates a VAEDecode node and returns its node ID.</summary>
    public string CreateVAEDecode(JArray vae, JArray latent, string id = null, bool canAudioDecode = true)
    {
        if (IsLTXV2() && FinalAudioVae is not null && canAudioDecode)
        {
            string separated = CreateNode("LTXVSeparateAVLatent", new JObject()
            {
                ["av_latent"] = latent
            });
            FinalLatentAudio = [separated, 1];
            string audioDecoded = CreateNode("LTXVAudioVAEDecode", new JObject()
            {
                ["audio_vae"] = FinalAudioVae,
                ["samples"] = FinalLatentAudio
            });
            FinalAudioOut = [audioDecoded, 0];
            return CreateVAEDecode(vae, [separated, 0], id, false);
        }
        if (UserInput.TryGet(T2IParamTypes.VAETileSize, out _) || UserInput.TryGet(T2IParamTypes.VAETemporalTileSize, out _))
        {
            return CreateNode("VAEDecodeTiled", new JObject()
            {
                ["vae"] = vae,
                ["samples"] = latent,
                ["tile_size"] = UserInput.Get(T2IParamTypes.VAETileSize, 256),
                ["overlap"] = UserInput.Get(T2IParamTypes.VAETileOverlap, 64),
                ["temporal_size"] = UserInput.Get(T2IParamTypes.VAETemporalTileSize, IsAnyWanModel() || IsHunyuanVideo15() ? 9999 : 32),
                ["temporal_overlap"] = UserInput.Get(T2IParamTypes.VAETemporalTileOverlap, 4)
            }, id);
        }
        // The VAE requirements for hunyuan are basically unobtainable, so force tiling as stupidproofing
        else if ((IsHunyuanVideo() || IsHunyuanVideo15() || IsKandinsky5VidLite() || IsKandinsky5VidPro()) && UserInput.Get(T2IParamTypes.ModelSpecificEnhancements, true))
        {
            return CreateNode("VAEDecodeTiled", new JObject()
            {
                ["vae"] = vae,
                ["samples"] = latent,
                ["tile_size"] = 256,
                ["overlap"] = 64,
                ["temporal_size"] = IsHunyuanVideo15() ? 9999 : 32, // HyVid 1.5 dies on temporal tiling
                ["temporal_overlap"] = 4
            }, id);
        }
        return CreateNode("VAEDecode", new JObject()
        {
            ["vae"] = vae,
            ["samples"] = latent
        }, id);
    }

    /// <summary>Default sampler type.</summary>
    public string DefaultSampler = "euler";

    /// <summary>Default sampler scheduler type.</summary>
    public string DefaultScheduler = "normal";

    /// <summary>Default previews type.</summary>
    public string DefaultPreviews = "default";

    /// <summary>Creates a KSampler and returns its node ID.</summary>
    public string CreateKSampler(JArray model, JArray pos, JArray neg, JArray latent, double cfg, int steps, int startStep, int endStep, long seed, bool returnWithLeftoverNoise, bool addNoise, double sigmin = -1, double sigmax = -1, string previews = null, string defsampler = null, string defscheduler = null, string id = null, bool rawSampler = false, bool doTiled = false, bool isFirstSampler = false, bool hadSpecialCond = false, string explicitSampler = null, string explicitScheduler = null, int sectionId = 0)
    {
        if (IsVideoModel())
        {
            previews ??= UserInput.Get(ComfyUIBackendExtension.VideoPreviewType, "animate");
        }
        if (IsLTXV() || IsLTXV2())
        {
            if (!hadSpecialCond)
            {
                string ltxvcond = CreateNode("LTXVConditioning", new JObject()
                {
                    ["positive"] = pos,
                    ["negative"] = neg,
                    ["frame_rate"] = UserInput.Get(T2IParamTypes.Text2VideoFPS, 24)
                });
                pos = [ltxvcond, 0];
                neg = [ltxvcond, 1];
            }
            defscheduler ??= "ltxv";
        }
        else if (IsNvidiaCosmos1())
        {
            if (!hadSpecialCond)
            {
                string ltxvcond = CreateNode("LTXVConditioning", new JObject() // (Despite the name, this is just setting the framerate)
                {
                    ["positive"] = pos,
                    ["negative"] = neg,
                    ["frame_rate"] = UserInput.Get(T2IParamTypes.Text2VideoFPS, 24)
                });
                pos = [ltxvcond, 0];
                neg = [ltxvcond, 1];
            }
            defsampler ??= "res_multistep";
            defscheduler ??= "karras";
        }
        else if (IsHunyuanImageRefiner())
        {
            if (!hadSpecialCond)
            {
                string refinerCond = CreateNode("HunyuanRefinerLatent", new JObject()
                {
                    ["positive"] = pos,
                    ["negative"] = neg,
                    ["latent"] = latent,
                    ["noise_augmentation"] = 0.1 // TODO: User input?
                });
                pos = [refinerCond, 0];
                neg = [refinerCond, 1];
                latent = [refinerCond, 2];
            }
            defscheduler ??= "simple";
        }
        else if (IsHunyuanVideo15SR())
        {
            if (!hadSpecialCond)
            {
                string srCond = CreateNode("HunyuanVideo15SuperResolution", new JObject()
                {
                    ["positive"] = pos,
                    ["negative"] = neg,
                    ["vae"] = FinalVae,
                    ["latent"] = latent,
                    ["noise_augmentation"] = 0.7 // TODO: User input?
                });
                pos = [srCond, 0];
                neg = [srCond, 1];
                latent = [srCond, 2];
            }
        }
        else if (IsFlux() || IsWanVideo() || IsWanVideo22() || IsOmniGen() || IsQwenImage() || IsZImage())
        {
            defscheduler ??= "simple";
        }
        else if (IsChroma() || IsChromaRadiance())
        {
            defscheduler ??= "beta";
        }
        else if (IsFlux2())
        {
            defscheduler ??= "flux2";
        }
        bool willCascadeFix = false;
        JArray cascadeModel = null;
        if (!rawSampler && IsCascade() && FinalLoadedModel.Name.Contains("stage_c") && Program.MainSDModels.Models.TryGetValue(FinalLoadedModel.Name.Replace("stage_c", "stage_b"), out T2IModel bModel))
        {
            (_, cascadeModel, _, FinalVae) = CreateStandardModelLoader(bModel, LoadingModelType, null, true, sectionId: sectionId);
            willCascadeFix = true;
            defsampler ??= "euler_ancestral";
            defscheduler ??= "simple";
            if (!isFirstSampler)
            {
                willCascadeFix = false;
                model = cascadeModel;
            }
        }
        string classId = FinalLoadedModel?.ModelClass?.ID ?? "";
        static bool isSpecial(T2IModel model)
        {
            string modelId = model?.ModelClass?.ID ?? "";
            return modelId.EndsWith("/lora-depth") || modelId.EndsWith("/lora-canny");
        }
        if (UserInput.Get(T2IParamTypes.FluxDisableGuidance, false))
        {
            string disabledPos = CreateNode("FluxDisableGuidance", new JObject()
            {
                ["conditioning"] = pos
            });
            pos = [disabledPos, 0];
            string disabledNeg = CreateNode("FluxDisableGuidance", new JObject()
            {
                ["conditioning"] = neg
            });
            neg = [disabledNeg, 0];
        }
        if (classId == "Flux.1-dev/inpaint")
        {
            // Not sure why, but InpaintModelConditioning is required here.
            JArray img = FinalInputImage;
            JArray mask = FinalMask;
            if (MaskShrunkInfo is not null && MaskShrunkInfo.ScaledImage is not null)
            {
                img = [MaskShrunkInfo.ScaledImage, 0];
                mask = [MaskShrunkInfo.CroppedMask, 0];
            }
            if (mask is null)
            {
                string maskNode = CreateNode("SolidMask", new JObject()
                {
                    ["value"] = 1,
                    ["width"] = UserInput.GetImageWidth(),
                    ["height"] = UserInput.GetImageHeight()
                });
                mask = [maskNode, 0];
            }
            string inpaintNode = CreateNode("InpaintModelConditioning", new JObject()
            {
                ["positive"] = pos,
                ["negative"] = neg,
                ["vae"] = FinalVae,
                ["pixels"] = img,
                ["mask"] = mask,
                ["noise_mask"] = false
            });
            pos = [inpaintNode, 0];
            neg = [inpaintNode, 1];
            latent = [inpaintNode, 2];
        }
        if (classId.EndsWith("/canny") || classId.EndsWith("/depth") || FinalLoadedModelList.Any(isSpecial) || classId == "hidream-i1-edit")
        {
            if (FinalInputImage is null)
            {
                // TODO: Get the correct image (eg if canny/depth is used as a refiner or something silly it should still work)
                string decoded = CreateVAEDecode(FinalVae, latent);
                FinalInputImage = [decoded, 0];
            }
            string ip2p2condNode = CreateNode("InstructPixToPixConditioning", new JObject()
            {
                ["positive"] = pos,
                ["negative"] = neg,
                ["vae"] = FinalVae,
                ["pixels"] = FinalInputImage
            });
            pos = [ip2p2condNode, 0];
            neg = [ip2p2condNode, 1];
            latent = [ip2p2condNode, 2];
        }
        else if (IsKontext() || IsOmniGen() || IsQwenImage() || IsFlux2())
        {
            JArray img = null;
            JArray imgNeg = null;
            bool doLatentChain = !IsKontext(); // Arguably even kontext should just do this?
            bool onlyExplicit = (IsQwenImage() && !IsQwenImageEdit()) || IsFlux2();
            if (IsOmniGen() || IsQwenImageEditPlus())
            {
                imgNeg = neg;
            }
            void makeRefLatent(JArray image)
            {
                string vaeEncode = CreateVAEEncode(FinalVae, image);
                string refLatentNode = CreateNode("ReferenceLatent", new JObject()
                {
                    ["conditioning"] = pos,
                    ["latent"] = NodePath(vaeEncode, 0)
                });
                pos = [refLatentNode, 0];
                if (imgNeg is not null)
                {
                    string refLatentNodeNeg = CreateNode("ReferenceLatent", new JObject()
                    {
                        ["conditioning"] = imgNeg,
                        ["latent"] = NodePath(vaeEncode, 0)
                    });
                    imgNeg = [refLatentNodeNeg, 0];
                }
            }
            if (UserInput.TryGet(T2IParamTypes.PromptImages, out List<Image> images) && images.Count > 0)
            {
                img = GetPromptImage(true);
                if (doLatentChain)
                {
                    makeRefLatent(img);
                }
                for (int i = 1; i < images.Count; i++)
                {
                    JArray img2 = GetPromptImage(true, false, i);
                    if (doLatentChain)
                    {
                        makeRefLatent(img2);
                    }
                    else
                    {
                        string stitched = CreateNode("ImageStitch", new JObject()
                        {
                            ["image1"] = img,
                            ["image2"] = img2,
                            ["direction"] = "right",
                            ["match_image_size"] = true,
                            ["spacing_width"] = 0,
                            ["spacing_color"] = "white"
                        });
                        img = [stitched, 0];
                    }
                }
                if (!doLatentChain)
                {
                    makeRefLatent(img);
                }
            }
            else if (!onlyExplicit && MaskShrunkInfo is not null && MaskShrunkInfo.ScaledImage is not null)
            {
                img = [MaskShrunkInfo.ScaledImage, 0];
                makeRefLatent(img);
            }
            else if (!onlyExplicit && FinalInputImage is not null)
            {
                img = FinalInputImage;
                makeRefLatent(img);
            }
            if (img is not null)
            {
                if (IsOmniGen())
                {
                    if (UserInput.TryGet(T2IParamTypes.IP2PCFG2, out double cfg2))
                    {
                        string cfgGuiderNode = CreateNode("DualCFGGuider", new JObject()
                        {
                            ["model"] = model,
                            ["cond1"] = pos,
                            ["cond2"] = imgNeg,
                            ["negative"] = neg,
                            ["cfg_conds"] = cfg,
                            ["cfg_cond2_negative"] = cfg2
                        });
                        return emitAsCustomAdvanced([cfgGuiderNode, 0], latent);
                    }
                    else
                    {
                        neg = imgNeg;
                    }
                }
                else if (IsQwenImageEditPlus())
                {
                    neg = imgNeg;
                }
            }
        }
        else if (IsWanVideo()) // TODO: Somehow check if this is actually a phantom model?
        {
            if (UserInput.TryGet(T2IParamTypes.PromptImages, out List<Image> images) && images.Count > 0)
            {
                string img1 = CreateLoadImageNode(images[0], "${promptimages.0}", false);
                JArray img = [img1, 0];
                for (int i = 1; i < images.Count; i++)
                {
                    string img2 = CreateLoadImageNode(images[i], "${promptimages." + i + "}", false);
                    string batched = CreateNode("ImageBatch", new JObject()
                    {
                        ["image1"] = img,
                        ["image2"] = NodePath(img2, 0)
                    });
                    img = [batched, 0];
                }
                double width = UserInput.GetImageWidth();
                double height = UserInput.GetImageHeight();
                if (IsRefinerStage)
                {
                    double scale = UserInput.Get(T2IParamTypes.RefinerUpscale, 1);
                    int iwidth = (int)Math.Round(width * scale);
                    int iheight = (int)Math.Round(height * scale);
                    width = (iwidth / 16) * 16;
                    height = (iheight / 16) * 16;
                }
                // TODO: This node asking for latent info is wacky. Maybe have a reader node that grabs it from the current actual latent, so it's more plug-n-play-ish
                string phantomNode = CreateNode("WanPhantomSubjectToVideo", new JObject()
                {
                    ["positive"] = pos,
                    ["negative"] = neg,
                    ["vae"] = FinalVae,
                    ["images"] = img,
                    ["width"] = (int)width,
                    ["height"] = (int)height,
                    ["length"] = UserInput.Get(T2IParamTypes.Text2VideoFrames, 81),
                    ["batch_size"] = 1
                });
                string negCombine = CreateNode("ConditioningCombine", new JObject()
                {
                    ["conditioning_1"] = NodePath(phantomNode, 1),
                    ["conditioning_2"] = NodePath(phantomNode, 2)
                });
                pos = [phantomNode, 0];
                neg = [negCombine, 0];
                //latent = [phantomNode, 3]; // This latent is actually pretty stupid, it's just inline generating an empty latent for some reason? Ignore it.
            }
        }
        string emitAsCustomAdvanced(JArray guider, JArray latentImage)
        {
            // TODO: SamplerCustomAdvanced logic should be used for *all* models, not just ip2p
            string noiseNode = CreateNode("RandomNoise", new JObject()
            {
                ["noise_seed"] = seed
            });
            string samplerNode = CreateNode("KSamplerSelect", new JObject()
            {
                ["sampler_name"] = explicitSampler ?? UserInput.Get(ComfyUIBackendExtension.SamplerParam, defsampler ?? DefaultSampler, sectionId: sectionId)
            });
            string scheduler = explicitScheduler ?? UserInput.Get(ComfyUIBackendExtension.SchedulerParam, defscheduler ?? DefaultScheduler, sectionId: sectionId).ToLowerFast();
            JArray schedulerNode;
            if (scheduler == "turbo")
            {
                string turboNode = CreateNode("SDTurboScheduler", new JObject()
                {
                    ["model"] = model,
                    ["steps"] = steps,
                    ["denoise"] = 1
                });
                schedulerNode = [turboNode, 0];
            }
            else if (scheduler == "karras")
            {
                string karrasNode = CreateNode("KarrasScheduler", new JObject()
                {
                    ["steps"] = steps,
                    ["sigma_max"] = sigmax <= 0 ? 14.614642 : sigmax,
                    ["sigma_min"] = sigmin <= 0 ? 0.0291675 : sigmin,
                    ["rho"] = UserInput.Get(T2IParamTypes.SamplerRho, 7)
                });
                schedulerNode = [karrasNode, 0];
            }
            else
            {
                string basicNode = CreateNode("BasicScheduler", new JObject()
                {
                    ["model"] = model,
                    ["steps"] = steps,
                    ["scheduler"] = scheduler,
                    ["denoise"] = 1
                });
                schedulerNode = [basicNode, 0];
            }
            if (startStep > 0)
            {
                string afterStart = CreateNode("SplitSigmas", new JObject()
                {
                    ["sigmas"] = schedulerNode,
                    ["step"] = startStep
                });
                schedulerNode = [afterStart, 1];
            }
            if (endStep < steps)
            {
                string beforeEnd = CreateNode("SplitSigmas", new JObject()
                {
                    ["sigmas"] = schedulerNode,
                    ["step"] = endStep
                });
                schedulerNode = [beforeEnd, 0];
            }
            // TODO: VarSeed, batching, etc. seed logic
            string finalSampler = CreateNode("SamplerCustomAdvanced", new JObject()
            {
                ["sampler"] = NodePath(samplerNode, 0),
                ["guider"] = guider,
                ["sigmas"] = schedulerNode,
                ["latent_image"] = latentImage,
                ["noise"] = NodePath(noiseNode, 0)
            }, id);
            return finalSampler;
        }
        if (classId == "stable-diffusion-xl-v1-edit")
        {
            if (FinalInputImage is null)
            {
                // TODO: Get the correct image (eg if edit is used as a refiner or something silly it should still work)
                string decoded = CreateVAEDecode(FinalVae, latent);
                FinalInputImage = [decoded, 0];
            }
            string ip2p2condNode = CreateNode("InstructPixToPixConditioning", new JObject()
            {
                ["positive"] = pos,
                ["negative"] = neg,
                ["vae"] = FinalVae,
                ["pixels"] = FinalInputImage
            });
            string cfgGuiderNode = CreateNode("DualCFGGuider", new JObject()
            {
                ["model"] = model,
                ["cond1"] = NodePath(ip2p2condNode, 0),
                ["cond2"] = NodePath(ip2p2condNode, 1),
                ["negative"] = neg,
                ["cfg_conds"] = cfg,
                ["cfg_cond2_negative"] = UserInput.Get(T2IParamTypes.IP2PCFG2, 1.5)
            });
            return emitAsCustomAdvanced([cfgGuiderNode, 0], [ip2p2condNode, 2]);
        }
        string firstId = willCascadeFix ? null : id;
        JObject inputs = new()
        {
            ["model"] = model,
            ["noise_seed"] = seed,
            ["steps"] = steps,
            ["cfg"] = cfg,
            ["sampler_name"] = explicitSampler ?? UserInput.Get(ComfyUIBackendExtension.SamplerParam, defsampler ?? DefaultSampler, sectionId: sectionId),
            ["scheduler"] = explicitScheduler ?? UserInput.Get(ComfyUIBackendExtension.SchedulerParam, defscheduler ?? DefaultScheduler, sectionId: sectionId),
            ["positive"] = pos,
            ["negative"] = neg,
            ["latent_image"] = latent,
            ["start_at_step"] = startStep,
            ["end_at_step"] = endStep,
            ["return_with_leftover_noise"] = returnWithLeftoverNoise ? "enable" : "disable",
            ["add_noise"] = addNoise ? "enable" : "disable"
        };
        if (UserInput.RawOriginalSeed.HasValue && UserInput.RawOriginalSeed >= 0)
        {
            inputs["control_after_generate"] = "fixed";
        }
        string created;
        if (Features.Contains("variation_seed") && !RestrictCustomNodes)
        {
            inputs["var_seed"] = UserInput.Get(T2IParamTypes.VariationSeed, 0);
            inputs["var_seed_strength"] = UserInput.Get(T2IParamTypes.VariationSeedStrength, 0);
            inputs["sigma_min"] = UserInput.Get(T2IParamTypes.SamplerSigmaMin, sigmin);
            inputs["sigma_max"] = UserInput.Get(T2IParamTypes.SamplerSigmaMax, sigmax);
            inputs["rho"] = UserInput.Get(T2IParamTypes.SamplerRho, 7);
            inputs["previews"] = UserInput.Get(T2IParamTypes.NoPreviews) ? "none" : previews ?? DefaultPreviews;
            inputs["tile_sample"] = doTiled;
            inputs["tile_size"] = FinalLoadedModel.StandardWidth <= 0 ? 768 : FinalLoadedModel.StandardWidth;
            created = CreateNode("SwarmKSampler", inputs, firstId);
        }
        else
        {
            created = CreateNode("KSamplerAdvanced", inputs, firstId);
        }
        if (willCascadeFix)
        {
            string stageBCond = CreateNode("StableCascade_StageB_Conditioning", new JObject()
            {
                ["stage_c"] = NodePath(created, 0),
                ["conditioning"] = pos
            });
            created = CreateKSampler(cascadeModel, [stageBCond, 0], neg, [latent[0], 1], 1.1, steps, startStep, endStep, seed + 27, returnWithLeftoverNoise, addNoise, sigmin, sigmax, previews ?? previews, defsampler, defscheduler, id, true, sectionId: sectionId);
        }
        return created;
    }

    /// <summary>Returns a reference to the first prompt image, if given. Null if not.</summary>
    /// <param name="fixSize">If true, rescale the image an appropriate size. If false, leave it as-is.</param>
    /// <param name="promptSize">If true, and fixSize is true, then use "prompt size" targets rather than latent size targets.</param>
    /// <param name="index">Index of image to grab.</param>
    public JArray GetPromptImage(bool fixSize, bool promptSize = false, int index = 0)
    {
        if (UserInput.TryGet(T2IParamTypes.PromptImages, out List<Image> images) && images.Count > index)
        {
            string img1 = CreateLoadImageNode(images[index], "${promptimages." + index + "}", false);
            JArray img = [img1, 0];
            (int width, int height) = images[index].GetResolution();
            int genWidth = UserInput.GetImageWidth(), genHeight = UserInput.GetImageHeight();
            int actual = (int)Math.Sqrt(width * height), target = (int)Math.Sqrt(genWidth * genHeight);
            bool doesFit = true;
            if (!UserInput.Get(T2IParamTypes.SmartImagePromptResizing, true))
            {
                doesFit = Math.Abs(actual - target) <= 64;
            }
            else if (IsKontext()) // Kontext needs <= target gen size, and is sufficient once input hits 1024.
            {
                if (target < 1024)
                {
                    doesFit = Math.Abs(actual - target) <= 32;
                }
                else if (target >= 1024)
                {
                    if (actual < 1024)
                    {
                        target = 1024;
                        doesFit = false;
                    } // else does fit
                }
            }
            else if (IsQwenImageEditPlus() && promptSize)
            {
                target = 384;
                doesFit = false;
            }
            else if (IsQwenImage())
            {
                target = 1024; // Qwen image targets 1328 for gen but wants 1024 inputs.
                doesFit = Math.Abs(actual - target) <= 64;
            }
            if (fixSize && !doesFit)
            {
                (width, height) = Utilities.ResToModelFit(width, height, target * target, precision: promptSize ? 1 : 64);
                string scaleFix = CreateNode("ImageScale", new JObject()
                {
                    ["image"] = img,
                    ["width"] = width,
                    ["height"] = height,
                    ["crop"] = "disabled",
                    ["upscale_method"] = "lanczos"
                });
                img = [scaleFix, 0];
            }
            return img;
        }
        return null;
    }

    /// <summary>Creates a VAE Encode node and applies mask..</summary>
    public JArray DoMaskedVAEEncode(JArray vae, JArray image, JArray mask, string id)
    {
        string encoded = CreateVAEEncode(vae, image, id, mask: mask);
        string appliedNode = CreateNode("SetLatentNoiseMask", new JObject()
        {
            ["samples"] = NodePath(encoded, 0),
            ["mask"] = mask
        });
        return [appliedNode, 0];
    }

    /// <summary>Creates a VAE Encode node.</summary>
    public string CreateVAEEncode(JArray vae, JArray image, string id = null, bool noCascade = false, JArray mask = null)
    {
        if (!noCascade && IsCascade())
        {
            return CreateNode("StableCascade_StageC_VAEEncode", new JObject()
            {
                ["vae"] = vae,
                ["image"] = image,
                ["compression"] = UserInput.Get(T2IParamTypes.CascadeLatentCompression, 32)
            }, id);
        }
        if (mask is not null && (UserInput.Get(T2IParamTypes.UseInpaintingEncode) || (CurrentModelClass()?.ID ?? "").EndsWith("/inpaint")))
        {
            return CreateNode("VAEEncodeForInpaint", new JObject()
            {
                ["vae"] = vae,
                ["pixels"] = image,
                ["mask"] = mask,
                ["grow_mask_by"] = 6
            }, id);
        }
        if (UserInput.TryGet(T2IParamTypes.VAETileSize, out _) || UserInput.TryGet(T2IParamTypes.VAETemporalTileSize, out _))
        {
            return CreateNode("VAEEncodeTiled", new JObject()
            {
                ["vae"] = vae,
                ["pixels"] = image,
                ["tile_size"] = UserInput.Get(T2IParamTypes.VAETileSize, 256),
                ["overlap"] = UserInput.Get(T2IParamTypes.VAETileOverlap, 64),
                ["temporal_size"] = UserInput.Get(T2IParamTypes.VAETemporalTileSize, IsAnyWanModel() ? 9999 : 32),
                ["temporal_overlap"] = UserInput.Get(T2IParamTypes.VAETemporalTileOverlap, 4)
            }, id);
        }
        return CreateNode("VAEEncode", new JObject()
        {
            ["vae"] = vae,
            ["pixels"] = image
        }, id);
    }

    /// <summary>Enables Differential Diffusion on the current model if is enabled in user settings.</summary>
    public void EnableDifferential()
    {
        if (IsDifferentialDiffusion || UserInput.Get(T2IParamTypes.MaskBehavior, "Differential") != "Differential")
        {
            return;
        }
        IsDifferentialDiffusion = true;
        string diffNode = CreateNode("DifferentialDiffusion", new JObject()
        {
            ["model"] = FinalModel
        });
        FinalModel = [diffNode, 0];
    }
    public string RequireVisionModel(string name, string url, string hash, T2IRegisteredParam<T2IModel> param = null)
    {
        if (param is not null && UserInput.TryGet(param, out T2IModel visModel))
        {
            return visModel.Name;
        }
        if (VisionModelsValid.ContainsKey(name))
        {
            return name;
        }
        string filePath = Utilities.CombinePathWithAbsolute(Program.ServerSettings.Paths.ActualModelRoot, Program.ServerSettings.Paths.SDClipVisionFolder.Split(';')[0], name);
        DownloadModel(name, filePath, url, hash);
        VisionModelsValid.TryAdd(name, name);
        return name;
    }

    /// <summary>Do a video frame interpolation.</summary>
    public JArray DoInterpolation(JArray imageIn, string method, double mult)
    {
        if (method == "RIFE")
        {
            string rife = CreateNode("RIFE VFI", new JObject()
            {
                ["frames"] = imageIn,
                ["multiplier"] = mult,
                ["ckpt_name"] = "rife47.pth",
                ["clear_cache_after_n_frames"] = 10,
                ["fast_mode"] = true,
                ["ensemble"] = true,
                ["scale_factor"] = 1
            });
            return [rife, 0];
        }
        else if (method == "FILM")
        {
            string film = CreateNode("FILM VFI", new JObject()
            {
                ["frames"] = imageIn,
                ["multiplier"] = mult,
                ["ckpt_name"] = "film_net_fp32.pt",
                ["clear_cache_after_n_frames"] = 10
            });
            return [film, 0];
        }
        else if (method == "GIMM-VFI")
        {
            string modelLoader = CreateNode("DownloadAndLoadGIMMVFIModel", new JObject()
            {
                ["model"] = "gimmvfi_f_arb_lpips_fp32.safetensors",
                ["precision"] = "fp16",
                ["torch_compile"] = false
            });
            string gimm = CreateNode("GIMMVFI_interpolate", new JObject()
            {
                ["gimmvfi_model"] = NodePath(modelLoader, 0),
                ["images"] = imageIn,
                ["ds_factor"] = 0.5, // TODO: They recommend this as a factor relative to size. 0.5 for 2k, 0.25 for 4k. This is a major performance alteration.
                ["interpolation_factor"] = mult,
                ["seed"] = 1,
                ["output_flows"] = false
            });
            return [gimm, 0];
        }
        return imageIn;
    }

    public static List<Action<ImageToVideoGenInfo>> AltImageToVideoPreHandlers = [], AltImageToVideoPostHandlers = [];

    public class ImageToVideoGenInfo
    {
        public WorkflowGenerator Generator;
        public T2IModel VideoModel, VideoSwapModel;
        public int? Frames, VideoFPS;
        public double? VideoCFG;
        public double VideoSwapPercent = 0.5;
        public JToken Width, Height;
        public string Prompt, NegativePrompt;
        public int Steps;
        public int StartStep = 0;
        public long Seed;
        public Action<ImageToVideoGenInfo> AltLatent;
        public int BatchIndex = -1;
        public int BatchLen = -1;
        public bool HasMatchedModelData = false;
        public JArray PosCond, NegCond, Latent, Model, Vae;
        public string DefaultSampler = null, DefaultScheduler = null;
        public double DefaultCFG = 7;
        public bool HadSpecialCond = false;
        public int ContextID = T2IParamInput.SectionID_Video;
        public Image VideoEndFrame = null;
        public JArray DoFirstFrameLatentSwap = null;

        public void PrepModelAndCond(WorkflowGenerator g)
        {
            g.FinalLoadedModel = VideoModel;
            (VideoModel, Model, JArray clip, Vae) = g.CreateStandardModelLoader(VideoModel, "image2video", null, true, sectionId: ContextID);
            string promptText = Prompt;
            if (VideoModel.ModelClass?.ID == "hunyuan-video-i2v" || VideoModel.ModelClass?.ID == "hunyuan-video-i2v-v2")
            {
                promptText = $"<image:{g.FinalImageOut[0]},{g.FinalImageOut[1]}>{Prompt}";
            }
            PosCond = g.CreateConditioning(promptText, clip, VideoModel, true, isVideo: true);
            NegCond = g.CreateConditioning(NegativePrompt, clip, VideoModel, false, isVideo: true);
        }

        public void PrepFullCond(WorkflowGenerator g)
        {
            if (VideoModel.ModelClass?.CompatClass?.ID == T2IModelClassSorter.CompatLtxv.ID)
            {
                VideoFPS ??= 24;
                Frames ??= 97;
                if (VideoEndFrame is not null)
                {
                    throw new SwarmReadableErrorException("LTX-V end-frame is TODO");
                }
                else
                {
                    string condNode = g.CreateNode("LTXVImgToVideo", new JObject()
                    {
                        ["positive"] = PosCond,
                        ["negative"] = NegCond,
                        ["vae"] = Vae,
                        ["image"] = g.FinalImageOut,
                        ["width"] = Width,
                        ["height"] = Height,
                        ["length"] = Frames,
                        ["batch_size"] = 1,
                        ["image_noise_scale"] = g.UserInput.Get(T2IParamTypes.VideoAugmentationLevel, 0.15),
                        ["strength"] = 1
                    });
                    PosCond = [condNode, 0];
                    NegCond = [condNode, 1];
                    Latent = [condNode, 2];
                }
                DefaultCFG = 3;
                string ltxvcond = g.CreateNode("LTXVConditioning", new JObject()
                {
                    ["positive"] = PosCond,
                    ["negative"] = NegCond,
                    ["frame_rate"] = VideoFPS
                });
                PosCond = [ltxvcond, 0];
                NegCond = [ltxvcond, 1];
                HadSpecialCond = true;
                DefaultSampler = "euler";
                DefaultScheduler = "ltxv-image";
            }
            else if (VideoModel.ModelClass?.CompatClass?.ID == T2IModelClassSorter.CompatLtxv2.ID)
            {
                VideoFPS ??= 24;
                Frames ??= 97;
                if (VideoEndFrame is not null)
                {
                    throw new SwarmReadableErrorException("LTX-V2 end-frame is TODO");
                }
                else
                {
                    string emptyLatent = g.CreateNode("EmptyLTXVLatentVideo", new JObject()
                    {
                        ["width"] = Width,
                        ["height"] = Height,
                        ["length"] = Frames,
                        ["batch_size"] = 1
                    });
                    string emptyAudio = g.CreateNode("LTXVEmptyLatentAudio", new JObject()
                    {
                        ["audio_vae"] = g.FinalAudioVae,
                        ["frames_number"] = Frames,
                        ["frame_rate"] = VideoFPS,
                        ["batch_size"] = 1
                    });
                    string preproc = g.CreateNode("LTXVPreprocess", new JObject()
                    {
                        ["image"] = g.FinalImageOut,
                        ["img_compression"] = 32
                    });
                    string latentOutNode = g.CreateNode("LTXVImgToVideoInplace", new JObject()
                    {
                        ["vae"] = Vae,
                        ["image"] = NodePath(preproc, 0),
                        ["latent"] = NodePath(emptyLatent, 0),
                        ["strength"] = 1.0,
                        ["bypass"] = false
                    });
                    string concatNode = g.CreateNode("LTXVConcatAVLatent", new JObject()
                    {
                        ["video_latent"] = NodePath(latentOutNode, 0),
                        ["audio_latent"] = NodePath(emptyAudio, 0)
                    });
                    Latent = [concatNode, 0];
                }
                DefaultCFG = 3;
                string ltxvcond = g.CreateNode("LTXVConditioning", new JObject()
                {
                    ["positive"] = PosCond,
                    ["negative"] = NegCond,
                    ["frame_rate"] = VideoFPS
                });
                PosCond = [ltxvcond, 0];
                NegCond = [ltxvcond, 1];
                HadSpecialCond = true;
                DefaultSampler = "euler";
                DefaultScheduler = "ltxv-image";
            }
            else if (VideoModel.ModelClass?.CompatClass?.ID == "nvidia-cosmos-1")
            {
                VideoFPS ??= 24;
                Frames ??= 121;
                if (VideoEndFrame is not null)
                {
                    throw new SwarmReadableErrorException("Cosmos end-frame is TODO");
                }
                else
                {
                    string latentNode = g.CreateNode("CosmosImageToVideoLatent", new JObject()
                    {
                        ["vae"] = Vae,
                        ["start_image"] = g.FinalImageOut,
                        ["width"] = Width,
                        ["height"] = Height,
                        ["length"] = Frames,
                        ["batch_size"] = 1
                    });
                    Latent = [latentNode, 0];
                }
                string ltxvcond = g.CreateNode("LTXVConditioning", new JObject() // (Despite the name, this is just setting the framerate)
                {
                    ["positive"] = PosCond,
                    ["negative"] = NegCond,
                    ["frame_rate"] = VideoFPS
                });
                PosCond = [ltxvcond, 0];
                NegCond = [ltxvcond, 1];
                DefaultCFG = 7;
                DefaultSampler = "res_multistep";
                DefaultScheduler = "karras";
            }
            else if (VideoModel.ModelClass?.ID == "hunyuan-video-i2v" || VideoModel.ModelClass?.ID == "hunyuan-video-i2v-v2")
            {
                VideoFPS ??= 24;
                Frames ??= 53;
                string i2vnode = g.CreateNode("HunyuanImageToVideo", new JObject()
                {
                    ["positive"] = PosCond,
                    ["vae"] = Vae,
                    ["width"] = Width,
                    ["height"] = Height,
                    ["length"] = Frames,
                    ["batch_size"] = 1,
                    ["start_image"] = g.FinalImageOut,
                    ["guidance_type"] = VideoModel.ModelClass?.ID == "hunyuan-video-i2v-v2" ? "v2 (replace)" : "v1 (concat)"
                });
                PosCond = [i2vnode, 0];
                DefaultCFG = 1;
                Latent = [i2vnode, 1];
                DefaultSampler = "euler";
                DefaultScheduler = "simple";
            }
            else if (VideoModel.ModelClass?.ID == "kandinsky5-video-pro" || VideoModel.ModelClass?.ID == "kandinsky5-video-lite")
            {
                VideoFPS ??= 24;
                Frames ??= 49;
                string i2vnode = g.CreateNode("Kandinsky5ImageToVideo", new JObject()
                {
                    ["positive"] = PosCond,
                    ["negative"] = NegCond,
                    ["vae"] = Vae,
                    ["width"] = Width,
                    ["height"] = Height,
                    ["length"] = Frames,
                    ["batch_size"] = 1,
                    ["start_image"] = g.FinalImageOut
                });
                PosCond = [i2vnode, 0];
                NegCond = [i2vnode, 1];
                DefaultCFG = 1;
                Latent = [i2vnode, 2];
                DefaultSampler = "euler";
                DefaultScheduler = "simple";
                DoFirstFrameLatentSwap = [i2vnode, 3];
            }
            else if (VideoModel.ModelClass?.ID == "hunyuan-video-1_5")
            {
                VideoFPS ??= 24;
                Frames ??= 73;
                string targetName = "sigclip_vision_patch14_384.safetensors";
                targetName = g.RequireVisionModel(targetName, "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/clip_vision/sigclip_vision_patch14_384.safetensors", "1fee501deabac72f0ed17610307d7131e3e9d1e838d0363aa3c2b97a6e03fb33", T2IParamTypes.ClipVisionModel);
                string clipLoader = g.CreateNode("CLIPVisionLoader", new JObject()
                {
                    ["clip_name"] = targetName
                });
                JArray clipLoaderNode = [clipLoader, 0];
                string encoded = g.CreateNode("CLIPVisionEncode", new JObject()
                {
                    ["clip_vision"] = clipLoaderNode,
                    ["image"] = g.FinalImageOut,
                    ["crop"] = "center"
                });
                JArray clipVis = [encoded, 0];
                string i2vnode = g.CreateNode("HunyuanVideo15ImageToVideo", new JObject()
                {
                    ["positive"] = PosCond,
                    ["negative"] = NegCond,
                    ["vae"] = Vae,
                    ["width"] = Width,
                    ["height"] = Height,
                    ["length"] = Frames,
                    ["batch_size"] = 1,
                    ["start_image"] = g.FinalImageOut,
                    ["clip_vision_output"] = clipVis
                });
                PosCond = [i2vnode, 0];
                NegCond = [i2vnode, 1];
                DefaultCFG = 1;
                Latent = [i2vnode, 2];
                DefaultSampler = "euler";
                DefaultScheduler = "simple";
            }
            else if (VideoModel.ModelClass?.CompatClass?.ID == "hunyuan-video") // skyreels
            {
                VideoFPS ??= 24;
                Frames ??= 73;
                string latentNode = g.CreateNode("EmptyHunyuanLatentVideo", new JObject()
                {
                    ["width"] = Width,
                    ["height"] = Height,
                    ["length"] = Frames,
                    ["batch_size"] = 1
                });
                string ip2pNode = g.CreateNode("InstructPixToPixConditioning", new JObject()
                {
                    ["positive"] = PosCond,
                    ["negative"] = NegCond,
                    ["vae"] = Vae,
                    ["pixels"] = g.FinalImageOut
                });
                PosCond = [ip2pNode, 0];
                NegCond = [ip2pNode, 1];
                DefaultCFG = 6;
                Latent = [latentNode, 0];
                DefaultSampler = "dpmpp_2m";
                DefaultScheduler = "beta";
            }
            else if (VideoModel.ModelClass?.ID == "wan-2_2-image2video-14b")
            {
                VideoFPS ??= 24;
                Frames ??= 49;
                JArray imageIn = g.FinalImageOut;
                if (BatchIndex != -1 && BatchLen != -1)
                {
                    string fromBatch = g.CreateNode("ImageFromBatch", new JObject()
                    {
                        ["image"] = imageIn,
                        ["batch_index"] = BatchIndex,
                        ["length"] = BatchLen
                    });
                    imageIn = [fromBatch, 0];
                }
                if (VideoEndFrame is not null)
                {
                    string endFrame = g.CreateLoadImageNode(VideoEndFrame, "${videoendframe}", false);
                    JArray endFrameNode = [endFrame, 0];
                    string scaled = g.CreateNode("ImageScale", new JObject()
                    {
                        ["image"] = endFrameNode,
                        ["width"] = Width,
                        ["height"] = Height,
                        ["upscale_method"] = "lanczos",
                        ["crop"] = "disabled"
                    });
                    endFrameNode = [scaled, 0];
                    string img2vidNode = g.CreateNode("WanFirstLastFrameToVideo", new JObject()
                    {
                        ["width"] = Width,
                        ["height"] = Height,
                        ["length"] = Frames,
                        ["positive"] = PosCond,
                        ["negative"] = NegCond,
                        ["vae"] = Vae,
                        ["start_image"] = imageIn,
                        ["end_image"] = endFrameNode,
                        ["clip_vision_start_image"] = null,
                        ["clip_vision_end_image"] = null,
                        ["batch_size"] = 1
                    });
                    PosCond = [img2vidNode, 0];
                    NegCond = [img2vidNode, 1];
                    Latent = [img2vidNode, 2];
                }
                else
                {
                    string img2vidNode = g.CreateNode("WanImageToVideo", new JObject()
                    {
                        ["width"] = Width,
                        ["height"] = Height,
                        ["length"] = Frames,
                        ["positive"] = PosCond,
                        ["negative"] = NegCond,
                        ["vae"] = Vae,
                        ["start_image"] = imageIn,
                        ["batch_size"] = 1
                    });
                    PosCond = [img2vidNode, 0];
                    NegCond = [img2vidNode, 1];
                    Latent = [img2vidNode, 2];
                }
                DefaultCFG = 3.5;
                DefaultSampler = "euler";
                DefaultScheduler = "simple";
            }
            else if (VideoModel.ModelClass?.CompatClass?.ID == "wan-21-14b" || VideoModel.ModelClass?.CompatClass?.ID == "wan-21-1_3b")
            {
                VideoFPS ??= 24;
                Frames ??= 81;
                string targetName = "clip_vision_h.safetensors";
                targetName = g.RequireVisionModel(targetName, "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors", "64a7ef761bfccbadbaa3da77366aac4185a6c58fa5de5f589b42a65bcc21f161", T2IParamTypes.ClipVisionModel);
                string clipLoader = g.CreateNode("CLIPVisionLoader", new JObject()
                {
                    ["clip_name"] = targetName
                });
                JArray clipLoaderNode = [clipLoader, 0];
                JArray imageIn = g.FinalImageOut;
                if (BatchIndex != -1 && BatchLen != -1)
                {
                    string fromBatch = g.CreateNode("ImageFromBatch", new JObject()
                    {
                        ["image"] = imageIn,
                        ["batch_index"] = BatchIndex,
                        ["length"] = BatchLen
                    });
                    imageIn = [fromBatch, 0];
                }
                JArray encodeIn = imageIn;
                if (BatchLen > 1)
                {
                    string fromBatch = g.CreateNode("ImageFromBatch", new JObject()
                    {
                        ["image"] = imageIn,
                        ["batch_index"] = BatchIndex,
                        ["length"] = 1
                    });
                    encodeIn = [fromBatch, 0];
                }
                string encoded = g.CreateNode("CLIPVisionEncode", new JObject()
                {
                    ["clip_vision"] = clipLoaderNode,
                    ["image"] = encodeIn,
                    ["crop"] = "center"
                });
                if (VideoEndFrame is not null)
                {
                    string endFrame = g.CreateLoadImageNode(VideoEndFrame, "${videoendframe}", false);
                    JArray endFrameNode = [endFrame, 0];
                    string scaled = g.CreateNode("ImageScale", new JObject()
                    {
                        ["image"] = endFrameNode,
                        ["width"] = Width,
                        ["height"] = Height,
                        ["upscale_method"] = "lanczos",
                        ["crop"] = "disabled"
                    });
                    endFrameNode = [scaled, 0];
                    string encodedEnd = g.CreateNode("CLIPVisionEncode", new JObject()
                    {
                        ["clip_vision"] = clipLoaderNode,
                        ["image"] = endFrameNode,
                        ["crop"] = "center"
                    });
                    string img2vidNode = g.CreateNode("WanFirstLastFrameToVideo", new JObject()
                    {
                        ["width"] = Width,
                        ["height"] = Height,
                        ["length"] = Frames,
                        ["positive"] = PosCond,
                        ["negative"] = NegCond,
                        ["vae"] = Vae,
                        ["start_image"] = imageIn,
                        ["clip_vision_start_image"] = NodePath(encoded, 0),
                        ["end_image"] = endFrameNode,
                        ["clip_vision_end_image"] = NodePath(encodedEnd, 0),
                        ["batch_size"] = 1
                    });
                    PosCond = [img2vidNode, 0];
                    NegCond = [img2vidNode, 1];
                    Latent = [img2vidNode, 2];
                }
                else
                {
                    string img2vidNode = g.CreateNode("WanImageToVideo", new JObject()
                    {
                        ["width"] = Width,
                        ["height"] = Height,
                        ["length"] = Frames,
                        ["positive"] = PosCond,
                        ["negative"] = NegCond,
                        ["vae"] = Vae,
                        ["start_image"] = imageIn,
                        ["clip_vision_output"] = NodePath(encoded, 0),
                        ["batch_size"] = 1
                    });
                    PosCond = [img2vidNode, 0];
                    NegCond = [img2vidNode, 1];
                    Latent = [img2vidNode, 2];
                }
                DefaultCFG = 6;
                DefaultSampler = "euler";
                DefaultScheduler = "simple";
            }
            else if (VideoModel.ModelClass?.CompatClass?.ID == "wan-22-5b")
            {
                VideoFPS ??= 22;
                Frames ??= 49;
                JArray imageIn = g.FinalImageOut;
                if (BatchIndex != -1 && BatchLen != -1)
                {
                    string fromBatch = g.CreateNode("ImageFromBatch", new JObject()
                    {
                        ["image"] = imageIn,
                        ["batch_index"] = BatchIndex,
                        ["length"] = BatchLen
                    });
                    imageIn = [fromBatch, 0];
                }
                string img2vidNode = g.CreateNode("Wan22ImageToVideoLatent", new JObject()
                {
                    ["width"] = Width,
                    ["height"] = Height,
                    ["length"] = Frames,
                    ["vae"] = Vae,
                    ["start_image"] = imageIn,
                    ["batch_size"] = 1
                });
                Latent = [img2vidNode, 0];
                DefaultCFG = 5;
                DefaultSampler = "euler";
                DefaultScheduler = "simple";
            }
            else
            {
                VideoFPS ??= 6; // SVD
                Frames ??= 25;
                DefaultCFG = 2.5;
                DefaultSampler = "dpmpp_2m_sde_gpu";
                DefaultScheduler = "karras";
                JArray clipVision;
                if (VideoModel.ModelClass?.ID.EndsWith("/tensorrt") ?? false)
                {
                    string trtloader = g.CreateNode("TensorRTLoader", new JObject()
                    {
                        ["unet_name"] = VideoModel.ToString(g.ModelFolderFormat),
                        ["model_type"] = "svd"
                    });
                    Model = [trtloader, 0];
                    string fname = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors";
                    fname = g.RequireVisionModel(fname, "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors", "6ca9667da1ca9e0b0f75e46bb030f7e011f44f86cbfb8d5a36590fcd7507b030", T2IParamTypes.ClipVisionModel);
                    string cliploader = g.CreateNode("CLIPVisionLoader", new JObject()
                    {
                        ["clip_name"] = fname
                    });
                    clipVision = [cliploader, 0];
                    string svdVae = g.UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultSVDVAE;
                    if (string.IsNullOrWhiteSpace(svdVae))
                    {
                        svdVae = Program.T2IModelSets["VAE"].Models.Keys.FirstOrDefault(m => m.ToLowerFast().Contains("sdxl"));
                    }
                    if (string.IsNullOrWhiteSpace(svdVae))
                    {
                        throw new SwarmUserErrorException("No default SVD VAE found, please download an SVD VAE (any SDv1 VAE will do) and set it as default in User Settings");
                    }
                    Vae = g.CreateVAELoader(svdVae, g.HasNode("11") ? null : "11");
                }
                else
                {
                    string loader = g.CreateNode("ImageOnlyCheckpointLoader", new JObject()
                    {
                        ["ckpt_name"] = VideoModel.ToString()
                    });
                    Model = [loader, 0];
                    clipVision = [loader, 1];
                    Vae = [loader, 2];
                }
                double minCfg = g.UserInput.Get(T2IParamTypes.VideoMinCFG, 1);
                if (minCfg >= 0)
                {
                    string cfgGuided = g.CreateNode("VideoLinearCFGGuidance", new JObject()
                    {
                        ["model"] = Model,
                        ["min_cfg"] = minCfg
                    });
                    Model = [cfgGuided, 0];
                }
                string conditioning = g.CreateNode("SVD_img2vid_Conditioning", new JObject()
                {
                    ["clip_vision"] = clipVision,
                    ["init_image"] = g.FinalImageOut,
                    ["vae"] = Vae,
                    ["width"] = Width,
                    ["height"] = Height,
                    ["video_frames"] = Frames,
                    ["motion_bucket_id"] = g.UserInput.Get(T2IParamTypes.VideoMotionBucket, 127),
                    ["fps"] = VideoFPS,
                    ["augmentation_level"] = g.UserInput.Get(T2IParamTypes.VideoAugmentationLevel, 0)
                });
                PosCond = [conditioning, 0];
                NegCond = [conditioning, 1];
                Latent = [conditioning, 2];
            }
        }
    }

    /// <summary>Creates the execution logic for an Image-To-Video model.</summary>
    public void CreateImageToVideo(ImageToVideoGenInfo genInfo)
    {
        IsImageToVideo = true;
        string scaled = CreateNode("ImageScale", new JObject()
        {
            ["image"] = FinalImageOut,
            ["width"] = genInfo.Width,
            ["height"] = genInfo.Height,
            ["upscale_method"] = "lanczos",
            ["crop"] = "disabled"
        });
        FinalImageOut = [scaled, 0];
        foreach (Action<ImageToVideoGenInfo> altHandler in AltImageToVideoPreHandlers)
        {
            altHandler(genInfo);
        }
        if (!genInfo.HasMatchedModelData)
        {
            genInfo.PrepModelAndCond(this);
            genInfo.PrepFullCond(this);
        }
        if (genInfo.AltLatent is not null)
        {
            genInfo.AltLatent(genInfo);
        }
        genInfo.VideoCFG ??= genInfo.DefaultCFG;
        foreach (Action<ImageToVideoGenInfo> altHandler in AltImageToVideoPostHandlers)
        {
            altHandler(genInfo);
        }
        string previewType = UserInput.Get(ComfyUIBackendExtension.VideoPreviewType, "animate");
        int endStep = 10000;
        bool returnLeftoverNoise = false;
        if (genInfo.VideoSwapModel is not null)
        {
            endStep = (int)Math.Round(genInfo.Steps * (1 - genInfo.VideoSwapPercent));
            returnLeftoverNoise = true;
        }
        string explicitSampler = UserInput.Get(ComfyUIBackendExtension.SamplerParam, null, sectionId: genInfo.ContextID, includeBase: false);
        string explicitScheduler = UserInput.Get(ComfyUIBackendExtension.SchedulerParam, null, sectionId: genInfo.ContextID, includeBase: false);
        string samplered = CreateKSampler(genInfo.Model, genInfo.PosCond, genInfo.NegCond, genInfo.Latent, genInfo.VideoCFG.Value, genInfo.Steps, genInfo.StartStep, endStep, genInfo.Seed, returnLeftoverNoise, true, sigmin: 0.002, sigmax: 1000, previews: previewType, defsampler: genInfo.DefaultSampler, defscheduler: genInfo.DefaultScheduler, hadSpecialCond: genInfo.HadSpecialCond, explicitSampler: explicitSampler, explicitScheduler: explicitScheduler, sectionId: genInfo.ContextID);
        FinalLatentImage = [samplered, 0];
        if (genInfo.VideoSwapModel is not null)
        {
            IsImageToVideoSwap = true;
            (T2IModel swapModel, JArray swapVideoModel, JArray clip, _) = CreateStandardModelLoader(genInfo.VideoSwapModel, "image2video", null, true, sectionId: genInfo.ContextID);
            double cfg = genInfo.VideoCFG.Value;
            int steps = genInfo.Steps;
            genInfo.PosCond = CreateConditioning(genInfo.Prompt, clip, swapModel, true, isVideo: true, isVideoSwap: true);
            genInfo.NegCond = CreateConditioning(genInfo.NegativePrompt, clip, swapModel, false, isVideo: true, isVideoSwap: true);
            genInfo.PrepFullCond(this);
            explicitSampler = UserInput.Get(ComfyUIBackendExtension.SamplerParam, null, sectionId: T2IParamInput.SectionID_VideoSwap, includeBase: false) ?? explicitSampler;
            explicitScheduler = UserInput.Get(ComfyUIBackendExtension.SchedulerParam, null, sectionId: T2IParamInput.SectionID_VideoSwap, includeBase: false) ?? explicitScheduler;
            cfg = UserInput.GetNullable(T2IParamTypes.CFGScale, T2IParamInput.SectionID_VideoSwap, false) ?? cfg;
            steps = UserInput.GetNullable(T2IParamTypes.Steps, T2IParamInput.SectionID_VideoSwap, false) ?? steps;
            endStep = (int)Math.Round(steps * (1 - genInfo.VideoSwapPercent));
            // TODO: Should class-changes be allowed (must re-emit all the model-specific cond logic, maybe a vae reencoder - this is basically a refiner run)
            samplered = CreateKSampler(swapVideoModel, genInfo.PosCond, genInfo.NegCond, FinalLatentImage, cfg, steps, endStep, 10000, genInfo.Seed + 1, false, false, sigmin: 0.002, sigmax: 1000, previews: previewType, defsampler: genInfo.DefaultSampler, defscheduler: genInfo.DefaultScheduler, hadSpecialCond: genInfo.HadSpecialCond, explicitSampler: explicitSampler, explicitScheduler: explicitScheduler, sectionId: T2IParamInput.SectionID_VideoSwap);
            FinalLatentImage = [samplered, 0];
            IsImageToVideoSwap = false;
        }
        if (genInfo.DoFirstFrameLatentSwap is not null) // This is some weird jank hack that kan5 i2v needs
        {
            string replaceNode = CreateNode("ReplaceVideoLatentFrames", new JObject()
            {
                ["destination"] = FinalLatentImage,
                ["source"] = genInfo.DoFirstFrameLatentSwap,
                ["index"] = 0
            });
            FinalLatentImage = [replaceNode, 0];
            string normalized = CreateNode("NormalizeVideoLatentStart", new JObject()
            {
                ["latent"] = FinalLatentImage,
                ["start_frame_count"] = 4,
                ["reference_frame_count"] = 5
            });
            FinalLatentImage = [normalized, 0];
            genInfo.DoFirstFrameLatentSwap = null;
        }
        string decoded = CreateVAEDecode(genInfo.Vae, FinalLatentImage);
        FinalImageOut = [decoded, 0];
        if (UserInput.TryGet(T2IParamTypes.TrimVideoStartFrames, out _) || UserInput.TryGet(T2IParamTypes.TrimVideoEndFrames, out _))
        {
            string trimNode = CreateNode("SwarmTrimFrames", new JObject()
            {
                ["image"] = FinalImageOut,
                ["trim_start"] = UserInput.Get(T2IParamTypes.TrimVideoStartFrames, 0),
                ["trim_end"] = UserInput.Get(T2IParamTypes.TrimVideoEndFrames, 0)
            });
            FinalImageOut = [trimNode, 0];
        }
        IsImageToVideo = false;
    }

    /// <summary>Creates an image preprocessor node.</summary>
    public JArray CreatePreprocessor(string preprocessor, JArray imageNode)
    {
        JToken objectData = ComfyUIBackendExtension.ControlNetPreprocessors[preprocessor] ?? throw new SwarmUserErrorException($"ComfyUI backend does not have a preprocessor named '{preprocessor}'");
        if (objectData is JObject objObj && objObj.TryGetValue("swarm_custom", out JToken swarmCustomTok) && swarmCustomTok.Value<bool>())
        {
            return CreateNodesFromSpecialSyntax(objObj, [imageNode]);
        }
        string preProcNode = CreateNode(preprocessor, (_, n) =>
        {
            n["inputs"] = new JObject()
            {
                ["image"] = imageNode
            };
            foreach (string type in new[] { "required", "optional" })
            {
                if (((JObject)objectData["input"]).TryGetValue(type, out JToken set))
                {
                    foreach ((string key, JToken data) in (JObject)set)
                    {
                        if (key == "mask")
                        {
                            if (FinalMask is null)
                            {
                                throw new SwarmUserErrorException($"Preprocessor '{preprocessor}' requires a mask. Please set a mask under the Init Image parameter group.");
                            }
                            n["inputs"]["mask"] = FinalMask;
                        }
                        else if (key == "resolution")
                        {
                            n["inputs"]["resolution"] = (int)Math.Round(Math.Sqrt(UserInput.GetImageWidth() * UserInput.GetImageHeight()) / 64) * 64;
                        }
                        else if (data.Count() == 2 && data[1] is JObject settings && settings.TryGetValue("default", out JToken defaultValue))
                        {
                            n["inputs"][key] = defaultValue;
                        }
                    }
                }
            }
        });
        return [preProcNode, 0];
    }

    /// <summary>Create nodes from a special prebuilt node structure data definition.</summary>
    public JArray CreateNodesFromSpecialSyntax(JObject data, JArray[] inputs)
    {
        if (!data.TryGetValue("nodes", out JToken nodesToken) || nodesToken is not JArray nodesArr)
        {
            throw new InvalidDataException("Special node generator requires a 'nodes' array.");
        }
        if (!data.TryGetValue("output", out JToken outputTok) || outputTok.Type != JTokenType.String)
        {
            throw new InvalidDataException("Special node generator requires an 'output' string.");
        }
        List<string> nodeIds = [];
        JArray dataToNodePath(string data)
        {
            if (!data.StartsWith("SWARM:"))
            {
                return null;
            }
            data = data.After(':');
            if (data.StartsWith("NODE_"))
            {
                string node = data.After('_');
                int subId = 0;
                if (node.Contains(','))
                {
                    (node, string subval) = node.BeforeAndAfter(',');
                    subId = int.Parse(subval);
                }
                int nodeId = int.Parse(node);
                if (nodeId < 0 || nodeId >= nodeIds.Count)
                {
                    throw new InvalidDataException($"Invalid node index in special node generator: requested id {nodeId} but have {nodeIds.Count} nodes.");
                }
                return [nodeIds[nodeId], subId];
            }
            else if (data.StartsWith("INPUT_"))
            {
                string input = data.After('_');
                int inputId = int.Parse(input);
                if (inputId < 0 || inputId >= inputs.Length)
                {
                    throw new InvalidDataException($"Invalid input index in special node generator: requested id {inputId} but have {inputs.Length} inputs.");
                }
                return inputs[inputId];
            }
            else
            {
                throw new InvalidDataException($"Invalid special node generator syntax: {data}");
            }
        }
        foreach (JToken node in nodesArr)
        {
            if (node is not JObject nodeObj || !nodeObj.TryGetValue("class_type", out JToken classTok) || !nodeObj.TryGetValue("inputs", out JToken inputsTok) || inputsTok is not JObject inputsArr)
            {
                throw new InvalidDataException("Special node generator requires each node to be an object with an 'class_type' field and 'inputs' obj.");
            }
            JObject actualInputs = [];
            foreach (KeyValuePair<string, JToken> input in inputsArr)
            {
                if (input.Value.Type == JTokenType.String && $"{input.Value}".StartsWith("SWARM:"))
                {
                    actualInputs[input.Key] = dataToNodePath($"{input.Value}");
                }
                else
                {
                    actualInputs[input.Key] = input.Value;
                }
            }
            if (nodeObj.TryGetValue("node_data", out JToken nodeData))
            {
                foreach ((string key, JToken paramData) in (JObject)nodeData["input"]["required"])
                {
                    if (!actualInputs.ContainsKey(key) && paramData.Count() == 2 && paramData[1] is JObject settings && settings.TryGetValue("default", out JToken defaultValue))
                    {
                        actualInputs[key] = defaultValue;
                    }
                }
                if (((JObject)nodeData["input"]).TryGetValue("optional", out JToken optional))
                {
                    foreach ((string key, JToken paramData) in (JObject)optional)
                    {
                        if (!actualInputs.ContainsKey(key) && paramData.Count() == 2 && paramData[1] is JObject settings && settings.TryGetValue("default", out JToken defaultValue))
                        {
                            actualInputs[key] = defaultValue;
                        }
                    }
                }
            }
            string createdId = CreateNode($"{classTok}", actualInputs);
            nodeIds.Add(createdId);
        }
        return dataToNodePath($"{outputTok}");
    }

    /// <summary>Creates a "CLIPTextEncode" or equivalent node for the given input.</summary>
    public JArray CreateConditioningDirect(string prompt, JArray clip, T2IModel model, bool isPositive, string id = null)
    {
        string trackerId = $"__cond_direct____{clip[0]}_{clip[1]}_{isPositive}____{prompt}";
        if (id is null && NodeHelpers.TryGetValue(trackerId, out string nodeId))
        {
            return [nodeId, 0];
        }
        string node;
        double mult = isPositive ? 1.5 : 0.8;
        int width = UserInput.GetImageWidth();
        int height = UserInput.GetImageHeight();
        bool enhance = UserInput.Get(T2IParamTypes.ModelSpecificEnhancements, true);
        bool needsAdvancedEncode = (prompt.Contains('[') && prompt.Contains(']')) || prompt.Contains("<break>");
        double defaultGuidance = -1;
        if (IsHunyuanVideoSkyreels())
        {
            defaultGuidance = 1;
        }
        bool wantsSwarmCustom = Features.Contains("variation_seed") && (needsAdvancedEncode || (UserInput.TryGet(T2IParamTypes.FluxGuidanceScale, out _) && HasFluxGuidance()) || IsHunyuanVideoSkyreels());
        JArray qwenImage;
        if (IsSana())
        {
            node = CreateNode("SanaTextEncode", new JObject()
            {
                ["GEMMA"] = clip,
                ["text"] = prompt
            }, id);
        }
        else if (IsQwenImageEdit() && (isPositive || IsQwenImageEditPlus()) && (qwenImage = GetPromptImage(true, true)) is not null)
        {
            if (wantsSwarmCustom)
            {
                JArray image2 = GetPromptImage(true, true, 1);
                if (IsQwenImageEditPlus() && image2 is not null)
                {
                    string batched = CreateNode("ImageBatch", new JObject()
                    {
                        ["image1"] = qwenImage,
                        ["image2"] = image2
                    });
                    qwenImage = [batched, 0];
                    JArray image3 = GetPromptImage(true, true, 2);
                    if (image3 is not null)
                    {
                        string batched2 = CreateNode("ImageBatch", new JObject()
                        {
                            ["image1"] = qwenImage,
                            ["image2"] = image3
                        });
                        qwenImage = [batched2, 0];
                    }
                }
                node = CreateNode("SwarmClipTextEncodeAdvanced", new JObject()
                {
                    ["clip"] = clip,
                    ["steps"] = UserInput.Get(T2IParamTypes.Steps),
                    ["prompt"] = prompt,
                    ["width"] = width,
                    ["height"] = height,
                    ["target_width"] = width,
                    ["target_height"] = height,
                    ["guidance"] = UserInput.Get(T2IParamTypes.FluxGuidanceScale, defaultGuidance),
                    ["images"] = qwenImage,
                    ["llama_template"] = "qwen_image_edit_plus"
                }, id);
            }
            else if (IsQwenImageEditPlus())
            {
                node = CreateNode("TextEncodeQwenImageEditPlus", new JObject()
                {
                    ["clip"] = clip,
                    ["prompt"] = prompt,
                    ["vae"] = null, // Explicitly handled separately
                    ["image1"] = qwenImage,
                    ["image2"] = GetPromptImage(true, true, 1),
                    ["image3"] = GetPromptImage(true, true, 2)
                }, id);
            }
            else
            {
                node = CreateNode("TextEncodeQwenImageEdit", new JObject()
                {
                    ["clip"] = clip,
                    ["prompt"] = prompt,
                    ["vae"] = null, // Explicitly handled separately
                    ["image"] = qwenImage
                }, id);
            }
        }
        else if (IsHunyuanVideoI2V() && prompt.StartsWith("<image:"))
        {
            (string prefix, string content) = prompt.BeforeAndAfter('>');
            (string imgNodeId, string imgNodePart) = prefix.After(':').BeforeAndAfter(',');
            string targetName = "llava_llama3_vision.safetensors";
            targetName = RequireVisionModel(targetName, "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/resolve/main/split_files/clip_vision/llava_llama3_vision.safetensors", "7d0f89bf7860815f3a994b9bdae8ebe3a29c161825d03ca9262cb13b0c973aa6", T2IParamTypes.ClipVisionModel);
            string clipLoader = CreateNode("CLIPVisionLoader", new JObject()
            {
                ["clip_name"] = targetName
            });
            string encoded = CreateNode("CLIPVisionEncode", new JObject()
            {
                ["clip_vision"] = NodePath(clipLoader, 0),
                ["image"] = NodePath(imgNodeId, int.Parse(imgNodePart)),
                ["crop"] = "center"
            });
            if (wantsSwarmCustom)
            {
                node = CreateNode("SwarmClipTextEncodeAdvanced", new JObject()
                {
                    ["clip"] = clip,
                    ["steps"] = UserInput.Get(T2IParamTypes.Steps),
                    ["prompt"] = content,
                    ["width"] = width,
                    ["height"] = height,
                    ["target_width"] = width,
                    ["target_height"] = height,
                    ["guidance"] = UserInput.Get(T2IParamTypes.FluxGuidanceScale, defaultGuidance),
                    ["clip_vision_output"] = NodePath(encoded, 0),
                    ["llama_template"] = "hunyuan_image"
                }, id);
            }
            else
            {
                node = CreateNode("TextEncodeHunyuanVideo_ImageToVideo", new JObject()
                {
                    ["clip"] = clip,
                    ["clip_vision_output"] = NodePath(encoded, 0),
                    ["prompt"] = content,
                    ["image_interleave"] = CurrentModelClass()?.ID == "hunyuan-video-i2v-v2" ? 4 : 2
                }, id);
            }
        }
        else if (wantsSwarmCustom)
        {
            node = CreateNode("SwarmClipTextEncodeAdvanced", new JObject()
            {
                ["clip"] = clip,
                ["steps"] = UserInput.Get(T2IParamTypes.Steps),
                ["prompt"] = prompt,
                ["width"] = enhance ? (int)Utilities.RoundToPrecision(width * mult, 64) : width,
                ["height"] = enhance ? (int)Utilities.RoundToPrecision(height * mult, 64) : height,
                ["target_width"] = width,
                ["target_height"] = height,
                ["guidance"] = UserInput.Get(T2IParamTypes.FluxGuidanceScale, defaultGuidance)
            }, id);
        }
        else if (model is not null && model.ModelClass is not null && model.ModelClass.ID == "stable-diffusion-xl-v1-base")
        {
            node = CreateNode("CLIPTextEncodeSDXL", new JObject()
            {
                ["clip"] = clip,
                ["text_g"] = prompt,
                ["text_l"] = prompt,
                ["crop_w"] = 0,
                ["crop_h"] = 0,
                ["width"] = enhance ? (int)Utilities.RoundToPrecision(width * mult, 64) : width,
                ["height"] = enhance ? (int)Utilities.RoundToPrecision(height * mult, 64) : height,
                ["target_width"] = width,
                ["target_height"] = height
            }, id);
        }
        else
        {
            node = CreateNode("CLIPTextEncode", new JObject()
            {
                ["clip"] = clip,
                ["text"] = prompt
            }, id);
        }
        NodeHelpers[trackerId] = node;
        return [node, 0];
    }

    /// <summary>Creates a "CLIPTextEncode" or equivalent node for the given input, with support for '&lt;break&gt;' syntax.</summary>
    public JArray CreateConditioningLine(string prompt, JArray clip, T2IModel model, bool isPositive, string id = null)
    {
        if (Features.Contains("variation_seed"))
        {
            return CreateConditioningDirect(prompt, clip, model, isPositive, id);
        }
        // Backup to at least process "<break>" for if Swarm nodes are missing
        string[] breaks = prompt.Split("<break>", StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (breaks.Length <= 1)
        {
            return CreateConditioningDirect(prompt, clip, model, isPositive, id);
        }
        JArray first = CreateConditioningDirect(breaks[0], clip, model, isPositive);
        for (int i = 1; i < breaks.Length; i++)
        {
            JArray second = CreateConditioningDirect(breaks[i], clip, model, isPositive);
            string concatted = CreateNode("ConditioningConcat", new JObject()
            {
                ["conditioning_to"] = first,
                ["conditioning_from"] = second
            });
            first = [concatted, 0];
        }
        return first;
    }

    public record struct RegionHelper(JArray PartCond, JArray Mask);

    /// <summary>Creates a "CLIPTextEncode" or equivalent node for the given input, applying prompt-given conditioning modifiers as relevant.</summary>
    public JArray CreateConditioning(string prompt, JArray clip, T2IModel model, bool isPositive, string firstId = null, bool isRefiner = false, bool isVideo = false, bool isVideoSwap = false)
    {
        PromptRegion regionalizer = new(prompt);
        string globalPromptText = regionalizer.GlobalPrompt;
        if (isVideoSwap && !string.IsNullOrWhiteSpace(regionalizer.VideoSwapPrompt))
        {
            globalPromptText = regionalizer.VideoSwapPrompt;
        }
        else if (isVideo && !string.IsNullOrWhiteSpace(regionalizer.VideoPrompt))
        {
            globalPromptText = regionalizer.VideoPrompt;
        }
        else if (isRefiner && !string.IsNullOrWhiteSpace(regionalizer.RefinerPrompt))
        {
            globalPromptText = $"{globalPromptText} {regionalizer.RefinerPrompt}";
        }
        else if (!isVideo && !isRefiner && !string.IsNullOrWhiteSpace(regionalizer.BasePrompt))
        {
            globalPromptText = $"{globalPromptText} {regionalizer.BasePrompt}";
        }
        JArray globalCond = CreateConditioningLine(globalPromptText.Trim(), clip, model, isPositive, firstId);
        if (!isPositive && string.IsNullOrWhiteSpace(prompt) && UserInput.Get(T2IParamTypes.ZeroNegative, false))
        {
            string zeroed = CreateNode("ConditioningZeroOut", new JObject()
            {
                ["conditioning"] = globalCond
            });
            return [zeroed, 0];
        }
        PromptRegion.Part[] parts = [.. regionalizer.Parts.Where(p => p.Type == PromptRegion.PartType.Object || p.Type == PromptRegion.PartType.Region)];
        if (parts.IsEmpty())
        {
            return globalCond;
        }
        string gligenModel = UserInput.Get(ComfyUIBackendExtension.GligenModel, "None");
        if (gligenModel != "None")
        {
            string gligenLoader = NodeHelpers.GetOrCreate("gligen_loader", () =>
            {
                return CreateNode("GLIGENLoader", new JObject()
                {
                    ["gligen_name"] = gligenModel
                });
            });
            int width = UserInput.GetImageWidth();
            int height = UserInput.GetImageHeight();
            JArray lastCond = globalCond;
            foreach (PromptRegion.Part part in parts)
            {
                string applied = CreateNode("GLIGENTextBoxApply", new JObject()
                {
                    ["gligen_textbox_model"] = NodePath(gligenLoader, 0),
                    ["clip"] = clip,
                    ["conditioning_to"] = lastCond,
                    ["text"] = part.Prompt,
                    ["x"] = part.X * width,
                    ["y"] = part.Y * height,
                    ["width"] = part.Width * width,
                    ["height"] = part.Height * height
                });
                lastCond = [applied, 0];
            }
            return lastCond;
        }
        double globalStrength = UserInput.Get(T2IParamTypes.GlobalRegionFactor, 0.5);
        List<RegionHelper> regions = [];
        JArray lastMergedMask = null;
        foreach (PromptRegion.Part part in parts)
        {
            JArray subClip = part.ContextID <= 1 ? clip : CreateHookLorasForConfinement(part.ContextID, clip);
            JArray partCond = CreateConditioningLine(part.Prompt, subClip, model, isPositive);
            string regionNode = CreateNode("SwarmSquareMaskFromPercent", new JObject()
            {
                ["x"] = part.X,
                ["y"] = part.Y,
                ["width"] = part.Width,
                ["height"] = part.Height,
                ["strength"] = Math.Abs(part.Strength)
            });
            if (part.Strength < 0)
            {
                regionNode = CreateNode("InvertMask", new JObject()
                {
                    ["mask"] = NodePath(regionNode, 0)
                });
            }
            RegionHelper region = new(partCond, [regionNode, 0]);
            regions.Add(region);
            if (lastMergedMask is null)
            {
                lastMergedMask = region.Mask;
            }
            else
            {
                string overlapped = CreateNode("SwarmOverMergeMasksForOverlapFix", new JObject()
                {
                    ["mask_a"] = lastMergedMask,
                    ["mask_b"] = region.Mask
                });
                lastMergedMask = [overlapped, 0];
            }
        }
        string globalMask = CreateNode("SwarmSquareMaskFromPercent", new JObject()
        {
            ["x"] = 0,
            ["y"] = 0,
            ["width"] = 1,
            ["height"] = 1,
            ["strength"] = 1
        });
        string maskBackground = CreateNode("SwarmExcludeFromMask", new JObject()
        {
            ["main_mask"] = NodePath(globalMask, 0),
            ["exclude_mask"] = lastMergedMask
        });
        string backgroundPrompt = string.IsNullOrWhiteSpace(regionalizer.BackgroundPrompt) ? regionalizer.GlobalPrompt : regionalizer.BackgroundPrompt;
        JArray backgroundCond = CreateConditioningLine(backgroundPrompt, clip, model, isPositive);
        string mainConditioning = CreateNode("ConditioningSetMask", new JObject()
        {
            ["conditioning"] = backgroundCond,
            ["mask"] = NodePath(maskBackground, 0),
            ["strength"] = 1 - globalStrength,
            ["set_cond_area"] = "default"
        });
        EnableDifferential();
        DebugMask([maskBackground, 0]);
        void DebugMask(JArray mask)
        {
            if (UserInput.Get(ComfyUIBackendExtension.DebugRegionalPrompting))
            {
                string imgNode = CreateNode("MaskToImage", new JObject()
                {
                    ["mask"] = mask
                });
                CreateImageSaveNode([imgNode, 0]);
            }
        }
        foreach (RegionHelper region in regions)
        {
            string overlapped = CreateNode("SwarmCleanOverlapMasksExceptSelf", new JObject()
            {
                ["mask_self"] = region.Mask,
                ["mask_merged"] = lastMergedMask
            });
            DebugMask([overlapped, 0]);
            string regionCond = CreateNode("ConditioningSetMask", new JObject()
            {
                ["conditioning"] = region.PartCond,
                ["mask"] = NodePath(overlapped, 0),
                ["strength"] = 1 - globalStrength,
                ["set_cond_area"] = "default"
            });
            mainConditioning = CreateNode("ConditioningCombine", new JObject()
            {
                ["conditioning_1"] = NodePath(mainConditioning, 0),
                ["conditioning_2"] = NodePath(regionCond, 0)
            });
        }
        string globalCondApplied = CreateNode("ConditioningSetMask", new JObject()
        {
            ["conditioning"] = globalCond,
            ["mask"] = NodePath(globalMask, 0),
            ["strength"] = globalStrength,
            ["set_cond_area"] = "default"
        });
        string finalCond = CreateNode("ConditioningCombine", new JObject()
        {
            ["conditioning_1"] = NodePath(mainConditioning, 0),
            ["conditioning_2"] = NodePath(globalCondApplied, 0)
        });
        return new(finalCond, 0);
    }

    /// <summary>Returns an array of all nodes currently in the workflow with a given class_type.</summary>
    public JProperty[] NodesOfClass(string classType)
    {
        return [.. Workflow.Properties().Where(p => $"{p.Value["class_type"]}" == classType)];
    }

    /// <summary>Runs an action against all nodes of a given class_type.</summary>
    /// <param name="classType">The class_type to target.</param>
    /// <param name="action">The action(NodeID, JObject Data) to run against the node.</param>
    public void RunOnNodesOfClass(string classType, Action<string, JObject> action)
    {
        foreach (JProperty property in NodesOfClass(classType))
        {
            action(property.Name, property.Value as JObject);
        }
    }

    /// <summary>Replace all instances of <paramref name="oldNode"/> with <paramref name="newNode"/> in node input connections.</summary>
    public void ReplaceNodeConnection(JArray oldNode, JArray newNode)
    {
        string target0 = $"{oldNode[0]}", target1 = $"{oldNode[1]}";
        foreach (JObject node in Workflow.Values().Cast<JObject>())
        {
            JObject inputs = node["inputs"] as JObject;
            foreach (JProperty property in inputs.Properties().ToArray())
            {
                if (property.Value is JArray jarr && jarr.Count == 2 && $"{jarr[0]}" == target0 && $"{jarr[1]}" == target1)
                {
                    inputs[property.Name] = newNode;
                }
            }
        }
    }

    public HashSet<string> UsedInputs = null;

    /// <summary>Returns true if the node is connected to anything, or false if it has no outbound connections.</summary>
    public bool NodeIsConnectedAnywhere(string nodeId, int ind = -1, string exclude = null)
    {
        if (UsedInputs is null)
        {
            UsedInputs = [];
            foreach (JProperty node in Workflow.Properties())
            {
                if (node.Name == exclude)
                {
                    continue;
                }
                JObject inputs = node.Value["inputs"] as JObject;
                foreach (JProperty property in inputs.Properties().ToArray())
                {
                    if (property.Value is JArray jarr && jarr.Count == 2)
                    {
                        UsedInputs.Add($"{jarr[0]}:-1");
                        UsedInputs.Add($"{jarr[0]}:{jarr[1]}");
                    }
                }
            }
        }
        return UsedInputs.Contains($"{nodeId}:{ind}");
    }

    /// <summary>Removes a class of nodes if they are not connected to anything.</summary>
    public void RemoveClassIfUnused(string classType)
    {
        RunOnNodesOfClass(classType, (id, data) =>
        {
            if (!NodeIsConnectedAnywhere(id))
            {
                Workflow.Remove(id);
            }
        });
    }
}
