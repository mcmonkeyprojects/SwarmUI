using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.IO;
using System.Runtime.InteropServices;

namespace SwarmUI.Builtin_ComfyUIBackend;

/// <summary>Helper class for generating ComfyUI workflows from input parameters.</summary>
public class WorkflowGenerator
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
        FinalLatentImage = ["5", 0],
        FinalPrompt = ["6", 0],
        FinalNegativePrompt = ["7", 0],
        FinalSamples = ["10", 0],
        FinalImageOut = null,
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
    public string CurrentCompatClass()
    {
        return CurrentModelClass()?.CompatClass;
    }

    /// <summary>Returns true if the current model is Stable Cascade.</summary>
    public bool IsCascade()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz == "stable-cascade-v1";
    }

    /// <summary>Returns true if the current model is Stable Diffusion 3.</summary>
    public bool IsSD3()
    {
        string clazz = CurrentCompatClass();
        if (clazz is null)
        {
            return false;
        }
        return clazz.StartsWith("stable-diffusion-v3");
    }

    /// <summary>Returns true if the current model is Mochi Text2Video.</summary>
    public bool IsMochi()
    {
        string clazz = CurrentCompatClass();
        if (clazz is null)
        {
            return false;
        }
        return clazz is not null && clazz == "genmo-mochi-1";
    }

    /// <summary>Returns true if the current model is Lightricks LTX Video.</summary>
    public bool IsLTXV()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz == "lightricks-ltx-video";
    }

    /// <summary>Returns true if the current model is Black Forest Labs' Flux.1.</summary>
    public bool IsFlux()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz == "flux-1";
    }

    /// <summary>Returns true if the current model supports Flux Guidance.</summary>
    public bool HasFluxGuidance()
    {
        return IsFlux() || IsHunyuanVideo();
    }

    /// <summary>Returns true if the current model is NVIDIA Sana.</summary>
    public bool IsSana()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz == "nvidia-sana-1600";
    }

    /// <summary>Returns true if the current model is Alpha-VLLM's Lumina 2.</summary>
    public bool IsLumina()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz == "lumina-2";
    }

    /// <summary>Returns true if the current model is Hunyuan Video.</summary>
    public bool IsHunyuanVideo()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz == "hunyuan-video";
    }

    /// <summary>Returns true if the current model is Hunyuan Video - Skyreels.</summary>
    public bool IsHunyuanVideoSkyreels()
    {
        string clazz = CurrentModelClass()?.ID;
        return clazz is not null && (clazz == "hunyuan-video-skyreels" || clazz == "hunyuan-video-skyreels-i2v");
    }

    /// <summary>Returns true if the current model is Hunyuan Video.</summary>
    public bool IsNvidiaCosmos()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz == "nvidia-cosmos-1";
    }

    /// <summary>Returns true if the current model is any Wan-2.1 variant.</summary>
    public bool IsWanVideo()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz.StartsWith("wan-21");
    }

    /// <summary>Returns true if the current main text input model model is a Video model (as opposed to image).</summary>
    public bool IsVideoModel()
    {
        return IsLTXV() || IsMochi() || IsHunyuanVideo() || IsNvidiaCosmos() || IsWanVideo();
    }

    /// <summary>Gets a dynamic ID within a semi-stable registration set.</summary>
    public string GetStableDynamicID(int index, int offset)
    {
        int id = 1000 + index + offset;
        string result = $"{id}";
        if (!HasNode(result))
        {
            return result;
        }
        return GetStableDynamicID(index, offset + 1);
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
    public string CreateNode(string classType, JObject input, string id = null)
    {
        string lookup = $"__generic_node__{classType}___{input}";
        if (id is null && NodeHelpers.TryGetValue(lookup, out string existingNode))
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

    /// <summary>Loads and applies LoRAs in the user parameters for the given LoRA confinement ID.</summary>
    public (JArray, JArray) LoadLorasForConfinement(int confinement, JArray model, JArray clip)
    {
        if (confinement < 0 || !UserInput.TryGet(T2IParamTypes.Loras, out List<string> loras))
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
            if (confinements is not null && confinements.Count > i)
            {
                int confinementId = int.Parse(confinements[i]);
                if (confinementId >= 0 && confinementId != confinement)
                {
                    continue;
                }
            }
            float weight = weights is null || i >= weights.Count ? 1 : float.Parse(weights[i]);
            float tencWeight = tencWeights is null || i >= tencWeights.Count ? weight : float.Parse(tencWeights[i]);
            string newId = CreateNode("LoraLoader", new JObject()
            {
                ["model"] = model,
                ["clip"] = clip,
                ["lora_name"] = lora.ToString(ModelFolderFormat),
                ["strength_model"] = weight,
                ["strength_clip"] = tencWeight
            }, GetStableDynamicID(500, i));
            model = [newId, 0];
            clip = [newId, 1];
        }
        return (model, clip);
    }

    /// <summary>Creates a new node to load an image.</summary>
    public string CreateLoadImageNode(Image img, string param, bool resize, string nodeId = null)
    {
        if (nodeId is null && NodeHelpers.TryGetValue($"imgloader_{param}_{resize}", out string alreadyLoaded))
        {
            return alreadyLoaded;
        }
        string result;
        if (Features.Contains("comfy_loadimage_b64") && !RestrictCustomNodes)
        {
            if (img.Type == Image.ImageType.IMAGE)
            {
                result = CreateNode("SwarmLoadImageB64", new JObject()
                {
                    ["image_base64"] = (resize ? img.Resize(UserInput.GetImageWidth(), UserInput.GetImageHeight()) : img).AsBase64
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
                        ["image"] = new JArray() { result, 0 },
                        ["width"] = UserInput.GetImageWidth(),
                        ["height"] = UserInput.GetImageHeight(),
                        ["upscale_method"] = "bilinear",
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
        string boundsNode = CreateNode("SwarmMaskBounds", new JObject()
        {
            ["mask"] = mask,
            ["grow"] = growBy
        });
        string croppedImage = CreateNode("SwarmImageCrop", new JObject()
        {
            ["image"] = image,
            ["x"] = new JArray() { boundsNode, 0 },
            ["y"] = new JArray() { boundsNode, 1 },
            ["width"] = new JArray() { boundsNode, 2 },
            ["height"] = new JArray() { boundsNode, 3 }
        });
        string croppedMask = CreateNode("CropMask", new JObject()
        {
            ["mask"] = mask,
            ["x"] = new JArray() { boundsNode, 0 },
            ["y"] = new JArray() { boundsNode, 1 },
            ["width"] = new JArray() { boundsNode, 2 },
            ["height"] = new JArray() { boundsNode, 3 }
        });
        string scaledImage = CreateNode("SwarmImageScaleForMP", new JObject()
        {
            ["image"] = new JArray() { croppedImage, 0 },
            ["width"] = model?.StandardWidth <= 0 ? UserInput.GetImageWidth() : model.StandardWidth,
            ["height"] = model?.StandardHeight <= 0 ? UserInput.GetImageHeight() : model.StandardHeight,
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
        string composited = CreateNode("SwarmImageCompositeMaskedColorCorrecting", new JObject()
        {
            ["destination"] = baseImage,
            ["source"] = newImage,
            ["mask"] = mask,
            ["x"] = 0,
            ["y"] = 0,
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
            ["width"] = new JArray() { boundsNode, 2 },
            ["height"] = new JArray() { boundsNode, 3 },
            ["upscale_method"] = "bilinear",
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
        string composited = CreateNode("SwarmImageCompositeMaskedColorCorrecting", new JObject()
        {
            ["destination"] = firstImage,
            ["source"] = new JArray() { scaledBack, 0 },
            ["mask"] = croppedMask,
            ["x"] = new JArray() { boundsNode, 0 },
            ["y"] = new JArray() { boundsNode, 1 },
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

    public int Text2VideoFPS()
    {
        if (T2VFPSOverride > 0)
        {
            return T2VFPSOverride;
        }
        int fpsDefault = 24;
        if (IsWanVideo())
        {
            fpsDefault = 16;
        }
        return UserInput.Get(T2IParamTypes.Text2VideoFPS, fpsDefault);
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
                ["format"] = UserInput.Get(T2IParamTypes.Text2VideoFormat, "webp")
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

    /// <summary>Creates a model loader and adapts it with any registered model adapters, and returns (Model, Clip, VAE).</summary>
    public (T2IModel, JArray, JArray, JArray) CreateStandardModelLoader(T2IModel model, string type, string id = null, bool noCascadeFix = false)
    {
        string helper = $"modelloader_{model.Name}_{type}";
        if (NodeHelpers.TryGetValue(helper, out string alreadyLoaded))
        {
            string[] parts = alreadyLoaded.SplitFast(':');
            LoadingModel = [parts[0], int.Parse(parts[1])];
            LoadingClip = parts[2].Length == 0 ? null : [parts[2], int.Parse(parts[3])];
            LoadingVAE = parts[4].Length == 0 ? null : [parts[4], int.Parse(parts[5])];
            return (model, LoadingModel, LoadingClip, LoadingVAE);
        }
        string requireClipModel(string name, string url, string hash, T2IRegisteredParam<T2IModel> param)
        {
            if (param is not null && UserInput.TryGet(param, out T2IModel model))
            {
                return model.Name;
            }
            if (ClipModelsValid.ContainsKey(name))
            {
                return name;
            }
            if (Program.T2IModelSets["Clip"].Models.ContainsKey(name))
            {
                ClipModelsValid.TryAdd(name, name);
                return name;
            }
            string filePath = Utilities.CombinePathWithAbsolute(Program.ServerSettings.Paths.ActualModelRoot, Program.ServerSettings.Paths.SDClipFolder.Split(';')[0], name);
            DownloadModel(name, filePath, url, hash);
            ClipModelsValid.TryAdd(name, name);
            return name;
        }
        string getT5XXLModel()
        {
            return requireClipModel("t5xxl_enconly.safetensors", "https://huggingface.co/mcmonkey/google_t5-v1_1-xxl_encoderonly/resolve/main/t5xxl_fp8_e4m3fn.safetensors", "7d330da4816157540d6bb7838bf63a0f02f573fc48ca4d8de34bb0cbfd514f09", T2IParamTypes.T5XXLModel);
        }
        string getOldT5XXLModel()
        {
            return requireClipModel("old_t5xxl_cosmos.safetensors", "https://huggingface.co/comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI/resolve/main/text_encoders/oldt5_xxl_fp8_e4m3fn_scaled.safetensors", "1d0dd711ec9866173d4b39e86db3f45e1614a4e3f84919556f854f773352ea81", T2IParamTypes.T5XXLModel);
        }
        string getUniMaxT5XXLModel()
        {
            return requireClipModel("umt5_xxl_fp8_e4m3fn_scaled.safetensors", "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors", "c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68", T2IParamTypes.T5XXLModel);
        }
        string getClipLModel()
        {
            if (UserInput.TryGet(T2IParamTypes.ClipLModel, out T2IModel model))
            {
                return model.Name;
            }
            if (Program.T2IModelSets["Clip"].Models.ContainsKey("clip_l_sdxl_base.safetensors"))
            {
                return "clip_l_sdxl_base.safetensors";
            }
            return requireClipModel("clip_l.safetensors", "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/text_encoder/model.fp16.safetensors", "660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd", T2IParamTypes.ClipLModel);
        }
        string getClipGModel()
        {
            if (UserInput.TryGet(T2IParamTypes.ClipGModel, out T2IModel model))
            {
                return model.Name;
            }
            if (Program.T2IModelSets["Clip"].Models.ContainsKey("clip_g_sdxl_base.safetensors"))
            {
                return "clip_g_sdxl_base.safetensors";
            }
            return requireClipModel("clip_g.safetensors", "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/text_encoder_2/model.fp16.safetensors", "ec310df2af79c318e24d20511b601a591ca8cd4f1fce1d8dff822a356bcdb1f4", T2IParamTypes.ClipGModel);
        }
        string getLlava3Model()
        {
            return requireClipModel("llava_llama3_fp8_scaled.safetensors", "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/resolve/main/split_files/text_encoders/llava_llama3_fp8_scaled.safetensors", "2f0c3ad255c282cead3f078753af37d19099cafcfc8265bbbd511f133e7af250", T2IParamTypes.LLaVAModel);
        }
        string getGemma2Model()
        {
            // TODO: Selector param?
            return requireClipModel("gemma_2_2b_fp16.safetensors", "https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/resolve/main/split_files/text_encoders/gemma_2_2b_fp16.safetensors", "29761442862f8d064d3f854bb6fabf4379dcff511a7f6ba9405a00bd0f7e2dbd", null);
        }
        IsDifferentialDiffusion = false;
        LoadingModelType = type;
        if (!noCascadeFix && model.ModelClass?.ID == "stable-cascade-v1-stage-b" && model.Name.Contains("stage_b") && Program.MainSDModels.Models.TryGetValue(model.Name.Replace("stage_b", "stage_c"), out T2IModel altCascadeModel))
        {
            model = altCascadeModel;
        }
        void doVaeLoader(string defaultVal, string compatClass, string knownName)
        {
            string vaeFile = defaultVal;
            string nodeId = null;
            if (!NoVAEOverride && UserInput.TryGet(T2IParamTypes.VAE, out T2IModel vaeModel))
            {
                vaeFile = vaeModel.Name;
                nodeId = "11";
            }
            if (string.IsNullOrWhiteSpace(vaeFile) || vaeFile == "None")
            {
                vaeFile = Program.T2IModelSets["VAE"].Models.Values.FirstOrDefault(m => m.ModelClass?.CompatClass == compatClass)?.Name;
            }
            if (string.IsNullOrWhiteSpace(vaeFile))
            {
                if (knownName is null)
                {
                    throw new SwarmUserErrorException("No default VAE for this model found, please download its VAE and set it as default in User Settings");
                }
                vaeFile = CommonModels.Known[knownName].FileName;
                if (!Program.T2IModelSets["VAE"].Models.ContainsKey(vaeFile))
                {
                    CommonModels.Known[knownName].DownloadNow().Wait();
                    Program.RefreshAllModelSets();
                }
            }
            LoadingVAE = CreateVAELoader(vaeFile, nodeId);
        }
        if (model.ModelClass?.ID.EndsWith("/tensorrt") ?? false)
        {
            string baseArch = model.ModelClass?.ID?.Before('/');
            string trtType = ComfyUIWebAPI.ArchitecturesTRTCompat[baseArch];
            string trtloader = CreateNode("TensorRTLoader", new JObject()
            {
                ["unet_name"] = model.ToString(ModelFolderFormat),
                ["model_type"] = trtType
            }, id);
            LoadingModel = [trtloader, 0];
            // TODO: This is a hack
            T2IModel[] sameArch = [.. Program.MainSDModels.Models.Values.Where(m => m.ModelClass?.ID == baseArch)];
            if (sameArch.Length == 0)
            {
                throw new SwarmUserErrorException($"No models found with architecture {baseArch}, cannot load CLIP/VAE for this Arch");
            }
            T2IModel matchedName = sameArch.FirstOrDefault(m => m.Name.Before('.') == model.Name.Before('.'));
            matchedName ??= sameArch.First();
            string secondaryNode = CreateNode("CheckpointLoaderSimple", new JObject()
            {
                ["ckpt_name"] = matchedName.ToString(ModelFolderFormat)
            });
            LoadingClip = [secondaryNode, 1];
            LoadingVAE = [secondaryNode, 2];
        }
        else if (model.Name.EndsWith(".engine"))
        {
            throw new SwarmUserErrorException($"Model {model.Name} appears to be TensorRT lacks metadata to identify its architecture, cannot load");
        }
        else if (model.ModelClass?.CompatClass == "pixart-ms-sigma-xl-2")
        {
            string pixartNode = CreateNode("PixArtCheckpointLoader", new JObject()
            {
                ["ckpt_name"] = model.ToString(ModelFolderFormat),
                ["model"] = model.ModelClass.ID == "pixart-ms-sigma-xl-2-2k" ? "PixArtMS_Sigma_XL_2_2K" : "PixArtMS_Sigma_XL_2"
            }, id);
            LoadingModel = [pixartNode, 0];
            string singleClipLoader = CreateNode("CLIPLoader", new JObject()
            {
                ["clip_name"] = getT5XXLModel(),
                ["type"] = "sd3"
            });
            LoadingClip = [singleClipLoader, 0];
            doVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultSDXLVAE, "stable-diffusion-xl-v1", "sdxl-vae");
        }
        else if (model.IsDiffusionModelsFormat)
        {
            if (model.Metadata?.SpecialFormat == "gguf")
            {
                if (!Features.Contains("gguf"))
                {
                    throw new SwarmUserErrorException($"Model '{model.Name}' is in GGUF format, but the server does not have GGUF support installed. Cannot run.");
                }
                string modelNode = CreateNode("UnetLoaderGGUF", new JObject()
                {
                    ["unet_name"] = model.ToString(ModelFolderFormat)
                }, id);
                LoadingModel = [modelNode, 0];
            }
            else
            {
                if (model.RawFilePath.EndsWith(".gguf"))
                {
                    Logs.Error($"Model '{model.Name}' likely has corrupt/invalid metadata, and needs to be reset.");
                }
                string dtype = UserInput.Get(ComfyUIBackendExtension.PreferredDType, "automatic");
                if (dtype == "automatic")
                {
                    if (!RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                    {
                        dtype = "fp8_e4m3fn";
                        if (Utilities.PresumeNVidia30xx && Program.ServerSettings.Performance.AllowGpuSpecificOptimizations)
                        {
                            dtype = "fp8_e4m3fn_fast";
                        }
                    }
                    else
                    {
                        dtype = "default";
                    }
                }
                string modelNode = CreateNode("UNETLoader", new JObject()
                {
                    ["unet_name"] = model.ToString(ModelFolderFormat),
                    ["weight_dtype"] = dtype
                }, id);
                LoadingModel = [modelNode, 0];
            }
            LoadingClip = null;
            LoadingVAE = null;
        }
        else if (model.Metadata?.SpecialFormat == "bnb_nf4")
        {
            if (!Features.Contains("bnb_nf4"))
            {
                throw new SwarmUserErrorException($"Model '{model.Name}' is in BitsAndBytes-NF4 format, but the server does not have BNB_NF4 support installed. Cannot run.");
            }
            string modelNode = CreateNode("CheckpointLoaderNF4", new JObject()
            {
                ["ckpt_name"] = model.ToString(ModelFolderFormat)
            }, id);
            LoadingModel = [modelNode, 0];
            LoadingClip = [modelNode, 1];
            LoadingVAE = [modelNode, 2];
        }
        else if (IsSana())
        {
            string sanaNode = CreateNode("SanaCheckpointLoader", new JObject()
            {
                ["ckpt_name"] = model.ToString(ModelFolderFormat),
                ["model"] = "SanaMS_1600M_P1_D20"
            }, id);
            LoadingModel = [sanaNode, 0];
            string clipLoader = CreateNode("GemmaLoader", new JObject()
            {
                ["model_name"] = "unsloth/gemma-2-2b-it-bnb-4bit",
                ["device"] = "cpu",
                ["dtype"] = "default"
            });
            LoadingClip = [clipLoader, 0];
            doVaeLoader(null, "nvidia-sana-1600", "sana-dcae");
        }
        else
        {
            if (model.Metadata?.SpecialFormat == "gguf")
            {
                throw new SwarmUserErrorException($"Model '{model.Name}' is in GGUF format, but it's in your main Stable-Diffusion models folder. GGUF files are weird, and need to go in the special 'diffusion_models' folder.");
            }
            string modelNode = CreateNode("CheckpointLoaderSimple", new JObject()
            {
                ["ckpt_name"] = model.ToString(ModelFolderFormat)
            }, id);
            LoadingModel = [modelNode, 0];
            LoadingClip = [modelNode, 1];
            LoadingVAE = [modelNode, 2];
            if (IsFlux() && (model.Metadata?.TextEncoders ?? "") == "")
            {
                LoadingClip = null;
                LoadingVAE = null;
            }
        }
        string predType = model.Metadata?.PredictionType;
        if (IsSD3())
        {
            string sd3Node = CreateNode("ModelSamplingSD3", new JObject()
            {
                ["model"] = LoadingModel,
                ["shift"] = UserInput.Get(T2IParamTypes.SigmaShift, 3)
            });
            LoadingModel = [sd3Node, 0];
            string tencs = model.Metadata?.TextEncoders ?? "";
            if (!UserInput.TryGet(T2IParamTypes.SD3TextEncs, out string mode))
            {
                if (tencs == "")
                {
                    mode = "CLIP + T5";
                }
                else
                {
                    mode = null;
                }
            }
            if (mode == "CLIP Only" && tencs.Contains("clip_l") && !tencs.Contains("t5xxl")) { mode = null; }
            if (mode == "T5 Only" && !tencs.Contains("clip_l") && tencs.Contains("t5xxl")) { mode = null; }
            if (mode == "CLIP + T5" && tencs.Contains("clip_l") && tencs.Contains("t5xxl")) { mode = null; }
            if (mode is not null)
            {
                if (mode == "T5 Only")
                {
                    string loaderType = "CLIPLoader";
                    if (getT5XXLModel().EndsWith(".gguf"))
                    {
                        loaderType = "CLIPLoaderGGUF";
                    }
                    string singleClipLoader = CreateNode(loaderType, new JObject()
                    {
                        ["clip_name"] = getT5XXLModel(),
                        ["type"] = "sd3"
                    });
                    LoadingClip = [singleClipLoader, 0];
                }
                else if (mode == "CLIP Only")
                {
                    string dualClipLoader = CreateNode("DualCLIPLoader", new JObject()
                    {
                        ["clip_name1"] = getClipGModel(),
                        ["clip_name2"] = getClipLModel(),
                        ["type"] = "sd3"
                    });
                    LoadingClip = [dualClipLoader, 0];
                }
                else
                {
                    string loaderType = "TripleCLIPLoader";
                    if (getT5XXLModel().EndsWith(".gguf"))
                    {
                        loaderType = "TripleCLIPLoaderGGUF";
                    }
                    string tripleClipLoader = CreateNode(loaderType, new JObject()
                    {
                        ["clip_name1"] = getClipGModel(),
                        ["clip_name2"] = getClipLModel(),
                        ["clip_name3"] = getT5XXLModel()
                    });
                    LoadingClip = [tripleClipLoader, 0];
                }
            }
            else if (LoadingClip is null)
            {
                throw new SwarmUserErrorException($"Model '{model.Name}' is a full checkpoint format model, but was placed in the diffusion_models backbone folder. Please move it to the standard Stable Diffusion models folder.");
            }
            if (LoadingVAE is null)
            {
                doVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultSD3VAE, "stable-diffusion-v3", "sd35-vae");
            }
        }
        else if (IsFlux() && (LoadingClip is null || LoadingVAE is null || UserInput.Get(T2IParamTypes.T5XXLModel) is not null || UserInput.Get(T2IParamTypes.ClipLModel) is not null))
        {
            string loaderType = "DualCLIPLoader";
            if (getT5XXLModel().EndsWith(".gguf"))
            {
                loaderType = "DualCLIPLoaderGGUF";
            }
            string dualClipLoader = CreateNode(loaderType, new JObject()
            {
                ["clip_name1"] = getT5XXLModel(),
                ["clip_name2"] = getClipLModel(),
                ["type"] = "flux"
            });
            LoadingClip = [dualClipLoader, 0];
            doVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFluxVAE, "flux-1", "flux-ae");
        }
        else if (IsMochi() && (LoadingClip is null || LoadingVAE is null || UserInput.Get(T2IParamTypes.T5XXLModel) is not null))
        {
            string loaderType = "CLIPLoader";
            if (getT5XXLModel().EndsWith(".gguf"))
            {
                loaderType = "CLIPLoaderGGUF";
            }
            string clipLoader = CreateNode(loaderType, new JObject()
            {
                ["clip_name"] = getT5XXLModel(),
                ["type"] = "mochi"
            });
            LoadingClip = [clipLoader, 0];
            doVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultMochiVAE, "genmo-mochi-1", "mochi-vae");
        }
        else if (IsLTXV())
        {
            string loaderType = "CLIPLoader";
            if (getT5XXLModel().EndsWith(".gguf"))
            {
                loaderType = "CLIPLoaderGGUF";
            }
            string clipLoader = CreateNode(loaderType, new JObject()
            {
                ["clip_name"] = getT5XXLModel(),
                ["type"] = "ltxv"
            });
            LoadingClip = [clipLoader, 0];
        }
        else if (IsHunyuanVideo())
        {
            string loaderType = "DualCLIPLoader";
            if (getClipLModel().EndsWith(".gguf") || getLlava3Model().EndsWith(".gguf"))
            {
                loaderType = "DualCLIPLoaderGGUF";
            }
            string dualClipLoader = CreateNode(loaderType, new JObject()
            {
                ["clip_name1"] = getClipLModel(),
                ["clip_name2"] = getLlava3Model(),
                ["type"] = "hunyuan_video"
            });
            LoadingClip = [dualClipLoader, 0];
            doVaeLoader(null, "hunyuan-video", "hunyuan-video-vae");
        }
        else if (IsNvidiaCosmos())
        {
            string clipLoader = CreateNode("CLIPLoader", new JObject()
            {
                ["clip_name"] = getOldT5XXLModel(),
                ["type"] = "cosmos"
            });
            LoadingClip = [clipLoader, 0];
            doVaeLoader(null, "nvidia-cosmos-1", "cosmos-vae");
        }
        else if (IsWanVideo())
        {
            string clipLoader = CreateNode("CLIPLoader", new JObject()
            {
                ["clip_name"] = getUniMaxT5XXLModel(),
                ["type"] = "wan"
            });
            LoadingClip = [clipLoader, 0];
            doVaeLoader(null, "wan-21", "wan21-vae");
        }
        else if (CurrentCompatClass() == "auraflow-v1")
        {
            string auraNode = CreateNode("ModelSamplingAuraFlow", new JObject()
            {
                ["model"] = LoadingModel,
                ["shift"] = UserInput.Get(T2IParamTypes.SigmaShift, 1.73)
            });
            LoadingModel = [auraNode, 0];
        }
        else if (IsLumina())
        {
            string samplingNode = CreateNode("ModelSamplingAuraFlow", new JObject()
            {
                ["model"] = LoadingModel,
                ["shift"] = UserInput.Get(T2IParamTypes.SigmaShift, 6)
            });
            LoadingModel = [samplingNode, 0];
            if (LoadingClip is null)
            {
                string dualClipLoader = CreateNode("CLIPLoader", new JObject()
                {
                    ["clip_name"] = getGemma2Model(),
                    ["type"] = "lumina2"
                });
                LoadingClip = [dualClipLoader, 0];
            }
            if (LoadingVAE is null)
            {
                doVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFluxVAE, "flux-1", "flux-ae");
            }
        }
        else if (!string.IsNullOrWhiteSpace(predType))
        {
            string discreteNode = CreateNode("ModelSamplingDiscrete", new JObject()
            {
                ["model"] = LoadingModel,
                ["sampling"] = predType switch { "v" => "v_prediction", "v-zsnr" => "v_prediction", "epsilon" => "eps", _ => predType },
                ["zsnr"] = predType.Contains("zsnr")
            });
            LoadingModel = [discreteNode, 0];
        }
        if (UserInput.TryGet(T2IParamTypes.SigmaShift, out double shiftVal))
        {
            if (IsFlux())
            {
                string samplingNode = CreateNode("ModelSamplingFlux", new JObject()
                {
                    ["model"] = LoadingModel,
                    ["width"] = UserInput.GetImageWidth(),
                    ["height"] = UserInput.GetImageHeight(),
                    ["max_shift"] = shiftVal,
                    ["base_shift"] = 0.5 // TODO: Does this need an input?
                });
                LoadingModel = [samplingNode, 0];
            }
            else if (IsHunyuanVideo() || IsWanVideo())
            {
                string samplingNode = CreateNode("ModelSamplingSD3", new JObject()
                {
                    ["model"] = LoadingModel,
                    ["shift"] = shiftVal
                });
                LoadingModel = [samplingNode, 0];
            }
        }
        foreach (WorkflowGenStep step in ModelGenSteps)
        {
            step.Action(this);
        }
        if (LoadingClip is null)
        {
            if (string.IsNullOrWhiteSpace(model.Metadata?.ModelClassType))
            {
                throw new SwarmUserErrorException($"Model loader for {model.Name} didn't work - architecture ID is missing. Please click Edit Metadata on the model and apply a valid architecture ID.");
            }
            throw new SwarmUserErrorException($"Model loader for {model.Name} didn't work - are you sure it has an architecture ID set properly? (Currently set to: '{model.Metadata?.ModelClassType}')");
        }
        NodeHelpers[helper] = $"{LoadingModel[0]}:{LoadingModel[1]}" + (LoadingClip is null ? "::" : $":{LoadingClip[0]}:{LoadingClip[1]}") + (LoadingVAE is null ? "::" : $":{LoadingVAE[0]}:{LoadingVAE[1]}");
        return (model, LoadingModel, LoadingClip, LoadingVAE);
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
    public string CreateVAEDecode(JArray vae, JArray latent, string id = null)
    {
        if (UserInput.TryGet(T2IParamTypes.VAETileSize, out _) || UserInput.TryGet(T2IParamTypes.VAETemporalTileSize, out _))
        {
            return CreateNode("VAEDecodeTiled", new JObject()
            {
                ["vae"] = vae,
                ["samples"] = latent,
                ["tile_size"] = UserInput.Get(T2IParamTypes.VAETileSize, 256),
                ["overlap"] = UserInput.Get(T2IParamTypes.VAETileOverlap, 64),
                ["temporal_size"] = UserInput.Get(T2IParamTypes.VAETemporalTileSize, 32),
                ["temporal_overlap"] = UserInput.Get(T2IParamTypes.VAETemporalTileOverlap, 4)
            }, id);
        }
        else if (IsHunyuanVideo()) // The VAE requirements for hunyuan are basically unobtainable, so force tiling as stupidproofing
        {
            return CreateNode("VAEDecodeTiled", new JObject()
            {
                ["vae"] = vae,
                ["samples"] = latent,
                ["tile_size"] = 256,
                ["overlap"] = 64,
                ["temporal_size"] = 32,
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
    public string CreateKSampler(JArray model, JArray pos, JArray neg, JArray latent, double cfg, int steps, int startStep, int endStep, long seed, bool returnWithLeftoverNoise, bool addNoise, double sigmin = -1, double sigmax = -1, string previews = null, string defsampler = null, string defscheduler = null, string id = null, bool rawSampler = false, bool doTiled = false, bool isFirstSampler = false, bool hadSpecialCond = false)
    {
        if (IsVideoModel())
        {
            previews ??= UserInput.Get(ComfyUIBackendExtension.VideoPreviewType, "animate");
        }
        if (IsLTXV())
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
        else if (IsNvidiaCosmos())
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
        else if (IsWanVideo())
        {
            defscheduler ??= "simple";
        }
        bool willCascadeFix = false;
        JArray cascadeModel = null;
        if (!rawSampler && IsCascade() && FinalLoadedModel.Name.Contains("stage_c") && Program.MainSDModels.Models.TryGetValue(FinalLoadedModel.Name.Replace("stage_c", "stage_b"), out T2IModel bModel))
        {
            (_, cascadeModel, _, FinalVae) = CreateStandardModelLoader(bModel, LoadingModelType, null, true);
            willCascadeFix = true;
            defsampler ??= "euler_ancestral";
            defscheduler ??= "simple";
            if (!isFirstSampler)
            {
                willCascadeFix = false;
                model = cascadeModel;
            }
        }
        if (IsFlux())
        {
            defscheduler ??= "simple";
        }
        string classId = FinalLoadedModel?.ModelClass?.ID ?? "";
        static bool isSpecial(T2IModel model)
        {
            string modelId = model?.ModelClass?.ID ?? "";
            return modelId.EndsWith("/lora-depth") || modelId.EndsWith("/lora-canny");
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
        if (classId.EndsWith("/canny") || classId.EndsWith("/depth") || FinalLoadedModelList.Any(isSpecial))
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
        if (classId == "stable-diffusion-xl-v1-edit")
        {
            // TODO: SamplerCustomAdvanced logic should be used for *all* models, not just ip2p
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
            string noiseNode = CreateNode("RandomNoise", new JObject()
            {
                ["noise_seed"] = seed
            });
            // TODO: VarSeed, batching, etc. seed logic
            string cfgGuiderNode = CreateNode("DualCFGGuider", new JObject()
            {
                ["model"] = model,
                ["cond1"] = new JArray() { ip2p2condNode, 0 },
                ["cond2"] = new JArray() { ip2p2condNode, 1 },
                ["negative"] = neg,
                ["cfg_conds"] = cfg,
                ["cfg_cond2_negative"] = UserInput.Get(T2IParamTypes.IP2PCFG2, 1.5)
            });
            string samplerNode = CreateNode("KSamplerSelect", new JObject()
            {
                ["sampler_name"] = UserInput.Get(ComfyUIBackendExtension.SamplerParam, defsampler ?? DefaultSampler)
            });
            string scheduler = UserInput.Get(ComfyUIBackendExtension.SchedulerParam, defscheduler ?? DefaultScheduler).ToLowerFast();
            double denoise = 1;// 1.0 - (startStep / (double)steps); // NOTE: Edit model breaks on denoise<1
            JArray schedulerNode;
            if (scheduler == "turbo")
            {
                string turboNode = CreateNode("SDTurboScheduler", new JObject()
                {
                    ["model"] = model,
                    ["steps"] = steps,
                    ["denoise"] = denoise
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
                if (startStep > 0)
                {
                    string afterStart = CreateNode("SplitSigmas", new JObject()
                    {
                        ["sigmas"] = schedulerNode,
                        ["step"] = startStep
                    });
                    schedulerNode = [afterStart, 1];
                }
            }
            else
            {
                string basicNode = CreateNode("BasicScheduler", new JObject()
                {
                    ["model"] = model,
                    ["steps"] = steps,
                    ["scheduler"] = scheduler,
                    ["denoise"] = denoise
                });
                schedulerNode = [basicNode, 0];
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
            string finalSampler = CreateNode("SamplerCustomAdvanced", new JObject()
            {
                ["sampler"] = new JArray() { samplerNode, 0 },
                ["guider"] = new JArray() { cfgGuiderNode, 0 },
                ["sigmas"] = schedulerNode,
                ["latent_image"] = new JArray() { ip2p2condNode, 2 },
                ["noise"] = new JArray() { noiseNode, 0 }
            }, id);
            return finalSampler;
        }
        string firstId = willCascadeFix ? null : id;
        JObject inputs = new()
        {
            ["model"] = model,
            ["noise_seed"] = seed,
            ["steps"] = steps,
            ["cfg"] = cfg,
            // TODO: proper sampler input, and intelligent default scheduler per sampler
            ["sampler_name"] = UserInput.Get(ComfyUIBackendExtension.SamplerParam, defsampler ?? DefaultSampler),
            ["scheduler"] = UserInput.Get(ComfyUIBackendExtension.SchedulerParam, defscheduler ?? DefaultScheduler),
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
                ["stage_c"] = new JArray() { created, 0 },
                ["conditioning"] = pos
            });
            created = CreateKSampler(cascadeModel, [stageBCond, 0], neg, [latent[0], 1], 1.1, steps, startStep, endStep, seed + 27, returnWithLeftoverNoise, addNoise, sigmin, sigmax, previews ?? previews, defsampler, defscheduler, id, true);
        }
        return created;
    }

    /// <summary>Creates a VAE Encode node and applies mask..</summary>
    public JArray DoMaskedVAEEncode(JArray vae, JArray image, JArray mask, string id)
    {
        string encoded = CreateVAEEncode(vae, image, id, mask: mask);
        string appliedNode = CreateNode("SetLatentNoiseMask", new JObject()
        {
            ["samples"] = new JArray() { encoded, 0 },
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
        else
        {
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
            return CreateNode("VAEEncode", new JObject()
            {
                ["vae"] = vae,
                ["pixels"] = image
            }, id);
        }
    }

    /// <summary>Creates an Empty Latent Image node.</summary>
    public string CreateEmptyImage(int width, int height, int batchSize, string id = null)
    {
        if (IsCascade())
        {
            return CreateNode("StableCascade_EmptyLatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["compression"] = UserInput.Get(T2IParamTypes.CascadeLatentCompression, 32),
                ["height"] = height,
                ["width"] = width
            }, id);
        }
        else if (IsSD3() || IsFlux())
        {
            return CreateNode("EmptySD3LatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width
            }, id);
        }
        else if (IsSana())
        {
            return CreateNode("EmptySanaLatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width
            }, id);
        }
        else if (IsMochi())
        {
            return CreateNode("EmptyMochiLatentVideo", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = UserInput.Get(T2IParamTypes.Text2VideoFrames, 25),
                ["height"] = height,
                ["width"] = width
            }, id);
        }
        else if (IsLTXV())
        {
            return CreateNode("EmptyLTXVLatentVideo", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = UserInput.Get(T2IParamTypes.Text2VideoFrames, 97),
                ["height"] = height,
                ["width"] = width
            }, id);
        }
        else if (IsHunyuanVideo() || IsWanVideo())
        {
            int frames = 73;
            if (IsWanVideo())
            {
                frames = 81;
            }
            return CreateNode("EmptyHunyuanLatentVideo", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = UserInput.Get(T2IParamTypes.Text2VideoFrames, frames),
                ["height"] = height,
                ["width"] = width
            }, id);
        }
        else if (IsNvidiaCosmos())
        {

            return CreateNode("EmptyCosmosLatentVideo", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = UserInput.Get(T2IParamTypes.Text2VideoFrames, 121),
                ["height"] = height,
                ["width"] = width
            }, id);
        }
        else if (UserInput.Get(ComfyUIBackendExtension.ShiftedLatentAverageInit, false))
        {
            double offA = 0, offB = 0, offC = 0, offD = 0;
            switch (FinalLoadedModel.ModelClass?.CompatClass)
            {
                case "stable-diffusion-v1": // https://github.com/Birch-san/sdxl-diffusion-decoder/blob/4ba89847c02db070b766969c0eca3686a1e7512e/script/inference_decoder.py#L112
                case "stable-diffusion-v2":
                    offA = 2.1335;
                    offB = 0.1237;
                    offC = 0.4052;
                    offD = -0.0940;
                    break;
                case "stable-diffusion-xl-v1": // https://huggingface.co/datasets/Birchlabs/sdxl-latents-ffhq
                    offA = -2.8982;
                    offB = -0.9609;
                    offC = 0.2416;
                    offD = -0.3074;
                    break;
            }
            return CreateNode("SwarmOffsetEmptyLatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width,
                ["off_a"] = offA,
                ["off_b"] = offB,
                ["off_c"] = offC,
                ["off_d"] = offD
            }, id);
        }
        else
        {
            return CreateNode("EmptyLatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width
            }, id);
        }
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
    public void RequireVisionModel(string name, string url, string hash)
    {
        if (VisionModelsValid.ContainsKey(name))
        {
            return;
        }
        string filePath = Utilities.CombinePathWithAbsolute(Program.ServerSettings.Paths.ActualModelRoot, Program.ServerSettings.Paths.SDClipVisionFolder.Split(';')[0], name);
        DownloadModel(name, filePath, url, hash);
        VisionModelsValid.TryAdd(name, name);
    }

    /// <summary>Creates the execution logic for an Image-To-Video model.</summary>
    public void CreateImageToVideo(T2IModel vidModel, ref int? frames, double? videoCfg, ref int? videoFps, JToken width, JToken height, string prompt, string negPrompt, int steps, long seed, Func<JArray, JArray, (JArray, int)> altLatent = null, int batchInd = -1, int batchLen = -1)
    {
        bool hadSpecialCond = false;
        string defSampler = "dpmpp_2m_sde_gpu", defScheduler = "karras";
        double defCfg = 7;
        string scaled = CreateNode("ImageScale", new JObject()
        {
            ["image"] = FinalImageOut,
            ["width"] = width,
            ["height"] = height,
            ["upscale_method"] = "bilinear",
            ["crop"] = "disabled"
        });
        FinalImageOut = [scaled, 0];
        JArray posCond, negCond, latent, model, vae;
        if (vidModel.ModelClass?.CompatClass == "lightricks-ltx-video")
        {
            videoFps ??= 24;
            frames ??= 97;
            FinalLoadedModel = vidModel;
            (vidModel, model, JArray clip, vae) = CreateStandardModelLoader(vidModel, "image2video", null, true);
            posCond = CreateConditioning(prompt, clip, vidModel, true);
            negCond = CreateConditioning(negPrompt, clip, vidModel, false);
            string condNode = CreateNode("LTXVImgToVideo", new JObject()
            {
                ["positive"] = posCond,
                ["negative"] = negCond,
                ["vae"] = vae,
                ["image"] = FinalImageOut,
                ["width"] = width,
                ["height"] = height,
                ["length"] = frames,
                ["batch_size"] = 1,
                ["image_noise_scale"] = UserInput.Get(T2IParamTypes.VideoAugmentationLevel, 0.15)
            });
            defCfg = 3;
            posCond = [condNode, 0];
            negCond = [condNode, 1];
            latent = [condNode, 2];
            string ltxvcond = CreateNode("LTXVConditioning", new JObject()
            {
                ["positive"] = posCond,
                ["negative"] = negCond,
                ["frame_rate"] = videoFps
            });
            posCond = [ltxvcond, 0];
            negCond = [ltxvcond, 1];
            hadSpecialCond = true;
            defSampler = "euler";
            defScheduler = "ltxv-image";
        }
        else if (vidModel.ModelClass?.CompatClass == "nvidia-cosmos-1")
        {
            videoFps ??= 24;
            frames ??= 121;
            FinalLoadedModel = vidModel;
            (vidModel, model, JArray clip, vae) = CreateStandardModelLoader(vidModel, "image2video", null, true);
            posCond = CreateConditioning(prompt, clip, vidModel, true);
            negCond = CreateConditioning(negPrompt, clip, vidModel, false);
            string latentNode = CreateNode("CosmosImageToVideoLatent", new JObject()
            {
                ["vae"] = vae,
                ["start_image"] = FinalImageOut,
                ["width"] = width,
                ["height"] = height,
                ["length"] = frames,
                ["batch_size"] = 1
            });
            string ltxvcond = CreateNode("LTXVConditioning", new JObject() // (Despite the name, this is just setting the framerate)
            {
                ["positive"] = posCond,
                ["negative"] = negCond,
                ["frame_rate"] = videoFps
            });
            posCond = [ltxvcond, 0];
            negCond = [ltxvcond, 1];
            defCfg = 7;
            latent = [latentNode, 0];
            defSampler = "res_multistep";
            defScheduler = "karras";
        }
        else if (vidModel.ModelClass?.CompatClass == "hunyuan-video")
        {
            videoFps ??= 24;
            frames ??= 73;
            FinalLoadedModel = vidModel;
            (vidModel, model, JArray clip, vae) = CreateStandardModelLoader(vidModel, "image2video", null, true);
            posCond = CreateConditioning(prompt, clip, vidModel, true);
            negCond = CreateConditioning(negPrompt, clip, vidModel, false);
            string latentNode = CreateNode("EmptyHunyuanLatentVideo", new JObject()
            {
                ["width"] = width,
                ["height"] = height,
                ["length"] = frames,
                ["batch_size"] = 1
            });
            string ip2pNode = CreateNode("InstructPixToPixConditioning", new JObject()
            {
                ["positive"] = posCond,
                ["negative"] = negCond,
                ["vae"] = vae,
                ["pixels"] = FinalImageOut
            });
            posCond = [ip2pNode, 0];
            negCond = [ip2pNode, 1];
            defCfg = 6;
            latent = [latentNode, 0];
            defSampler = "dpmpp_2m";
            defScheduler = "beta";
        }
        else if (vidModel.ModelClass?.CompatClass == "wan-21-14b")
        {
            videoFps ??= 16;
            frames ??= 81;
            FinalLoadedModel = vidModel;
            (vidModel, model, JArray clip, vae) = CreateStandardModelLoader(vidModel, "image2video", null, true);
            posCond = CreateConditioning(prompt, clip, vidModel, true);
            negCond = CreateConditioning(negPrompt, clip, vidModel, false);
            string targetName = "clip_vision_h.safetensors";
            RequireVisionModel(targetName, "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors", "64a7ef761bfccbadbaa3da77366aac4185a6c58fa5de5f589b42a65bcc21f161");
            string clipLoader = CreateNode("CLIPVisionLoader", new JObject()
            {
                ["clip_name"] = targetName
            });
            JArray imageIn = FinalImageOut;
            if (batchInd != -1 && batchLen != -1)
            {
                string fromBatch = CreateNode("ImageFromBatch", new JObject()
                {
                    ["image"] = imageIn,
                    ["batch_index"] = batchInd,
                    ["length"] = batchLen
                });
                imageIn = [fromBatch, 0];
            }
            JArray encodeIn = imageIn;
            if (batchLen > 1)
            {
                string fromBatch = CreateNode("ImageFromBatch", new JObject()
                {
                    ["image"] = imageIn,
                    ["batch_index"] = batchInd,
                    ["length"] = 1
                });
                encodeIn = [fromBatch, 0];
            }
            string encoded = CreateNode("CLIPVisionEncode", new JObject()
            {
                ["clip_vision"] = new JArray() { clipLoader, 0 },
                ["image"] = encodeIn,
                ["crop"] = "center"
            });
            string img2vidNode = CreateNode("WanImageToVideo", new JObject()
            {
                ["width"] = width,
                ["height"] = height,
                ["length"] = frames,
                ["positive"] = posCond,
                ["negative"] = negCond,
                ["vae"] = vae,
                ["start_image"] = imageIn,
                ["clip_vision_output"] = new JArray() { encoded, 0 },
                ["batch_size"] = 1
            });
            posCond = [img2vidNode, 0];
            negCond = [img2vidNode, 1];
            defCfg = 6;
            latent = [img2vidNode, 2];
            defSampler = "euler";
            defScheduler = "simple";
        }
        else
        {
            videoFps ??= 6; // SVD
            frames ??= 25;
            defCfg = 2.5;
            JArray clipVision;
            if (vidModel.ModelClass?.ID.EndsWith("/tensorrt") ?? false)
            {
                string trtloader = CreateNode("TensorRTLoader", new JObject()
                {
                    ["unet_name"] = vidModel.ToString(ModelFolderFormat),
                    ["model_type"] = "svd"
                });
                model = [trtloader, 0];
                string fname = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors";
                RequireVisionModel(fname, "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors", "6ca9667da1ca9e0b0f75e46bb030f7e011f44f86cbfb8d5a36590fcd7507b030");
                string cliploader = CreateNode("CLIPVisionLoader", new JObject()
                {
                    ["clip_name"] = fname
                });
                clipVision = [cliploader, 0];
                string svdVae = UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultSVDVAE;
                if (string.IsNullOrWhiteSpace(svdVae))
                {
                    svdVae = Program.T2IModelSets["VAE"].Models.Keys.FirstOrDefault(m => m.ToLowerFast().Contains("sdxl"));
                }
                if (string.IsNullOrWhiteSpace(svdVae))
                {
                    throw new SwarmUserErrorException("No default SVD VAE found, please download an SVD VAE (any SDv1 VAE will do) and set it as default in User Settings");
                }
                vae = CreateVAELoader(svdVae, HasNode("11") ? null : "11");
            }
            else
            {
                string loader = CreateNode("ImageOnlyCheckpointLoader", new JObject()
                {
                    ["ckpt_name"] = vidModel.ToString()
                });
                model = [loader, 0];
                clipVision = [loader, 1];
                vae = [loader, 2];
            }
            double minCfg = UserInput.Get(T2IParamTypes.VideoMinCFG, 1);
            if (minCfg >= 0)
            {
                string cfgGuided = CreateNode("VideoLinearCFGGuidance", new JObject()
                {
                    ["model"] = model,
                    ["min_cfg"] = minCfg
                });
                model = [cfgGuided, 0];
            }
            string conditioning = CreateNode("SVD_img2vid_Conditioning", new JObject()
            {
                ["clip_vision"] = clipVision,
                ["init_image"] = FinalImageOut,
                ["vae"] = vae,
                ["width"] = width,
                ["height"] = height,
                ["video_frames"] = frames,
                ["motion_bucket_id"] = UserInput.Get(T2IParamTypes.VideoMotionBucket, 127),
                ["fps"] = videoFps,
                ["augmentation_level"] = UserInput.Get(T2IParamTypes.VideoAugmentationLevel, 0)
            });
            posCond = [conditioning, 0];
            negCond = [conditioning, 1];
            latent = [conditioning, 2];
        }
        int startStep = 0;
        if (altLatent is not null)
        {
            (latent, startStep) = altLatent(vae, latent);
        }
        videoCfg ??= defCfg;
        string previewType = UserInput.Get(ComfyUIBackendExtension.VideoPreviewType, "animate");
        string samplered = CreateKSampler(model, posCond, negCond, latent, videoCfg.Value, steps, startStep, 10000, seed, false, true, sigmin: 0.002, sigmax: 1000, previews: previewType, defsampler: defSampler, defscheduler: defScheduler, hadSpecialCond: hadSpecialCond);
        FinalLatentImage = [samplered, 0];
        string decoded = CreateVAEDecode(vae, FinalLatentImage);
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
        if (IsSana())
        {
            node = CreateNode("SanaTextEncode", new JObject()
            {
                ["GEMMA"] = clip,
                ["text"] = prompt
            }, id);
        }
        else if (Features.Contains("variation_seed") && (needsAdvancedEncode || (UserInput.TryGet(T2IParamTypes.FluxGuidanceScale, out _) && HasFluxGuidance()) || IsHunyuanVideoSkyreels()))
        {
            double defaultGuidance = -1;
            if (IsHunyuanVideoSkyreels())
            {
                defaultGuidance = 1;
            }
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
    public JArray CreateConditioning(string prompt, JArray clip, T2IModel model, bool isPositive, string firstId = null)
    {
        PromptRegion regionalizer = new(prompt);
        JArray globalCond = CreateConditioningLine(regionalizer.GlobalPrompt, clip, model, isPositive, firstId);
        if (!isPositive && string.IsNullOrWhiteSpace(prompt) && UserInput.Get(T2IParamTypes.ZeroNegative, false))
        {
            string zeroed = CreateNode("ConditioningZeroOut", new JObject()
            {
                ["conditioning"] = globalCond
            });
            return [zeroed, 0];
        }
        PromptRegion.Part[] parts = regionalizer.Parts.Where(p => p.Type == PromptRegion.PartType.Object || p.Type == PromptRegion.PartType.Region).ToArray();
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
                    ["gligen_textbox_model"] = new JArray() { gligenLoader, 0 },
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
            JArray partCond = CreateConditioningLine(part.Prompt, clip, model, isPositive);
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
                    ["mask"] = new JArray() { regionNode, 0 }
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
            ["main_mask"] = new JArray() { globalMask, 0 },
            ["exclude_mask"] = lastMergedMask
        });
        string backgroundPrompt = string.IsNullOrWhiteSpace(regionalizer.BackgroundPrompt) ? regionalizer.GlobalPrompt : regionalizer.BackgroundPrompt;
        JArray backgroundCond = CreateConditioningLine(backgroundPrompt, clip, model, isPositive);
        string mainConditioning = CreateNode("ConditioningSetMask", new JObject()
        {
            ["conditioning"] = backgroundCond,
            ["mask"] = new JArray() { maskBackground, 0 },
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
                ["mask"] = new JArray() { overlapped, 0 },
                ["strength"] = 1 - globalStrength,
                ["set_cond_area"] = "default"
            });
            mainConditioning = CreateNode("ConditioningCombine", new JObject()
            {
                ["conditioning_1"] = new JArray() { mainConditioning, 0 },
                ["conditioning_2"] = new JArray() { regionCond, 0 }
            });
        }
        string globalCondApplied = CreateNode("ConditioningSetMask", new JObject()
        {
            ["conditioning"] = globalCond,
            ["mask"] = new JArray() { globalMask, 0 },
            ["strength"] = globalStrength,
            ["set_cond_area"] = "default"
        });
        string finalCond = CreateNode("ConditioningCombine", new JObject()
        {
            ["conditioning_1"] = new JArray() { mainConditioning, 0 },
            ["conditioning_2"] = new JArray() { globalCondApplied, 0 }
        });
        return new(finalCond, 0);
    }

    /// <summary>Runs an action against all nodes of a given class_type.</summary>
    /// <param name="classType">The class_type to target.</param>
    /// <param name="action">The action(NodeID, JObject Data) to run against the node.</param>
    public void RunOnNodesOfClass(string classType, Action<string, JObject> action)
    {
        foreach (JProperty property in Workflow.Properties().Where(p => $"{p.Value["class_type"]}" == classType).ToArray())
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
    public bool NodeIsConnectedAnywhere(string nodeId)
    {
        if (UsedInputs is null)
        {
            UsedInputs = [];
            foreach (JObject node in Workflow.Values().Cast<JObject>())
            {
                JObject inputs = node["inputs"] as JObject;
                foreach (JProperty property in inputs.Properties().ToArray())
                {
                    if (property.Value is JArray jarr && jarr.Count == 2)
                    {
                        UsedInputs.Add($"{jarr[0]}");
                    }
                }
            }
        }
        return UsedInputs.Contains(nodeId);
    }

    /// <summary>Removes a class of nodes if they are not connected to anything.</summary>
    public void RemoveClassIfUnused(string className)
    {
        RunOnNodesOfClass(className, (id, data) =>
        {
            if (!NodeIsConnectedAnywhere(id))
            {
                Workflow.Remove(id);
            }
        });
    }
}
