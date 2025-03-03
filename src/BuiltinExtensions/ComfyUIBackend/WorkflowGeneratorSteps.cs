using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.IO;

namespace SwarmUI.Builtin_ComfyUIBackend;

public class WorkflowGeneratorSteps
{
    /// <summary>Register a new step to the workflow generator.</summary>
    public static void AddStep(Action<WorkflowGenerator> step, double priority)
    {
        WorkflowGenerator.AddStep(step, priority);
    }

    /// <summary>Register a new step to the workflow generator.</summary>
    public static void AddModelGenStep(Action<WorkflowGenerator> step, double priority)
    {
        WorkflowGenerator.AddModelGenStep(step, priority);
    }

    /* ========= RESERVED NODES ID MAP =========
     * 4: Initial Model Loader
     * 5: VAE Encode Init or Empty Latent
     * 6: Positive Prompt
     * 7: Negative Prompt
     * 8: Final VAEDecode
     * 9: Final Image Save
     * 10: Main KSampler
     * 11: Alternate Main VAE Loader
     * 15: Image Load
     * 20: Refiner Model Loader
     * 21: Refiner VAE Loader
     * 23: Refiner KSampler
     * 24: Refiner VAEDecoder
     * 25: Refiner VAEEncode
     * 26: Refiner ImageScale
     * 27: Refiner UpscaleModelLoader
     * 28: Refiner ImageUpscaleWithModel
     * 29: Refiner ImageSave
     * 30: Video Image Pre-Save
     *
     * 100+: Dynamic
     * 1500+: LoRA Loaders (Stable-Dynamic)
     * 50,000+: Intermediate Image Saves (Stable-Dynamic)
     */

    public static void Register()
    {
        #region Model Loader
        AddStep(g =>
        {
            g.FinalLoadedModel = g.UserInput.Get(T2IParamTypes.Model);
            if (g.FinalLoadedModel is null)
            {
                throw new SwarmUserErrorException($"No model input given. Did your UI load properly?");
            }
            g.FinalLoadedModelList = [g.FinalLoadedModel];
            (g.FinalLoadedModel, g.FinalModel, g.FinalClip, g.FinalVae) = g.CreateStandardModelLoader(g.FinalLoadedModel, "Base", "4");
        }, -15);
        AddModelGenStep(g =>
        {
            if (g.IsRefinerStage && g.UserInput.TryGet(T2IParamTypes.RefinerVAE, out T2IModel rvae))
            {
                g.LoadingVAE = g.CreateVAELoader(rvae.ToString(g.ModelFolderFormat), g.HasNode("21") ? null : "21");
            }
            else if (!g.NoVAEOverride && g.UserInput.TryGet(T2IParamTypes.VAE, out T2IModel vae))
            {
                if (g.FinalLoadedModel.ModelClass?.ID == "stable-diffusion-v3-medium" && vae.ModelClass?.CompatClass != "stable-diffusion-v3")
                {
                    Logs.Warning($"Model {g.FinalLoadedModel.Title} is an SD3 model, but you have VAE {vae.Title} selected. If that VAE is not an SD3 specific VAE, this is likely a mistake. Errors may follow. If this breaks, disable the custom VAE.");
                }
                g.LoadingVAE = g.CreateVAELoader(vae.ToString(g.ModelFolderFormat), g.HasNode("11") ? null : "11");
            }
            else if (!g.NoVAEOverride && g.UserInput.Get(T2IParamTypes.AutomaticVAE, false))
            {
                string clazz = g.FinalLoadedModel.ModelClass?.CompatClass;
                string vaeName = null;
                if (clazz == "stable-diffusion-xl-v1")
                {
                    vaeName = g.UserInput.SourceSession?.User?.Settings.VAEs.DefaultSDXLVAE;
                }
                else if (clazz == "stable-diffusion-v1")
                {
                    vaeName = g.UserInput.SourceSession?.User?.Settings.VAEs.DefaultSDv1VAE;
                }
                if (!string.IsNullOrWhiteSpace(vaeName) && vaeName.ToLowerFast() != "none")
                {
                    string match = T2IParamTypes.GetBestModelInList(vaeName, Program.T2IModelSets["VAE"].ListModelNamesFor(g.UserInput.SourceSession));
                    if (match is not null)
                    {
                        T2IModel vaeModel = Program.T2IModelSets["VAE"].Models[match];
                        g.LoadingVAE = g.CreateVAELoader(vaeModel.ToString(g.ModelFolderFormat), g.HasNode("11") ? null : "11");
                    }
                }
            }
        }, -14);
        AddModelGenStep(g =>
        {
            (g.LoadingModel, g.LoadingClip) = g.LoadLorasForConfinement(0, g.LoadingModel, g.LoadingClip);
        }, -10);
        AddModelGenStep(g =>
        {
            string applyTo = g.UserInput.Get(T2IParamTypes.FreeUApplyTo, null);
            if (ComfyUIBackendExtension.FeaturesSupported.Contains("freeu") && applyTo is not null)
            {
                if (applyTo == "Both" || applyTo == g.LoadingModelType)
                {
                    string version = g.UserInput.Get(T2IParamTypes.FreeUVersion, "1");
                    string freeU = g.CreateNode(version == "2" ? "FreeU_V2" : "FreeU", new JObject()
                    {
                        ["model"] = g.LoadingModel,
                        ["b1"] = g.UserInput.Get(T2IParamTypes.FreeUBlock1),
                        ["b2"] = g.UserInput.Get(T2IParamTypes.FreeUBlock2),
                        ["s1"] = g.UserInput.Get(T2IParamTypes.FreeUSkip1),
                        ["s2"] = g.UserInput.Get(T2IParamTypes.FreeUSkip2)
                    });
                    g.LoadingModel = [freeU, 0];
                }
            }
        }, -8);
        AddModelGenStep(g =>
        {
            if (g.UserInput.TryGet(ComfyUIBackendExtension.SelfAttentionGuidanceScale, out double sagScale))
            {
                string guided = g.CreateNode("SelfAttentionGuidance", new JObject()
                {
                    ["model"] = g.LoadingModel,
                    ["scale"] = sagScale,
                    ["blur_sigma"] = g.UserInput.Get(ComfyUIBackendExtension.SelfAttentionGuidanceSigmaBlur, 2.0)
                });
                g.LoadingModel = [guided, 0];
            }
            if (g.UserInput.TryGet(ComfyUIBackendExtension.PerturbedAttentionGuidanceScale, out double pagScale))
            {
                string guided = g.CreateNode("PerturbedAttentionGuidance", new JObject()
                {
                    ["model"] = g.LoadingModel,
                    ["scale"] = pagScale
                });
                g.LoadingModel = [guided, 0];
            }
            if (g.UserInput.TryGet(ComfyUIBackendExtension.RescaleCFGMultiplier, out double rescaleCfg))
            {
                string guided = g.CreateNode("RescaleCFG", new JObject()
                {
                    ["model"] = g.LoadingModel,
                    ["multiplier"] = rescaleCfg
                });
                g.LoadingModel = [guided, 0];
            }
            if (g.UserInput.TryGet(ComfyUIBackendExtension.RenormCFG, out double renormCfg))
            {
                string guided = g.CreateNode("RenormCFG", new JObject()
                {
                    ["model"] = g.LoadingModel,
                    ["cfg_trunc"] = 100, // This value is the weirdly named timestep where the renorm applies - less than this apply, above don't. 100 is default, not sure if it needs a customization param?
                    ["renorm_cfg"] = renormCfg
                });
                g.LoadingModel = [guided, 0];
            }
        }, -7);
        AddModelGenStep(g =>
        {
            if (g.UserInput.TryGet(T2IParamTypes.ClipStopAtLayer, out int layer))
            {
                string clipSkip = g.CreateNode("CLIPSetLastLayer", new JObject()
                {
                    ["clip"] = g.LoadingClip,
                    ["stop_at_clip_layer"] = layer
                });
                g.LoadingClip = [clipSkip, 0];
            }
        }, -6);
        AddModelGenStep(g =>
        {
            if (g.UserInput.TryGet(T2IParamTypes.SeamlessTileable, out string tileable) && tileable != "false")
            {
                string mode = "Both";
                if (tileable == "X-Only") { mode = "X"; }
                else if (tileable == "Y-Only") { mode = "Y"; }
                string tiling = g.CreateNode("SwarmModelTiling", new JObject()
                {
                    ["model"] = g.LoadingModel,
                    ["tile_axis"] = mode
                });
                g.LoadingModel = [tiling, 0];
                string tilingVae = g.CreateNode("SwarmTileableVAE", new JObject()
                {
                    ["vae"] = g.LoadingVAE,
                    ["tile_axis"] = mode
                });
                g.LoadingVAE = [tilingVae, 0];
            }
        }, -5);
        AddModelGenStep(g =>
        {
            if (g.UserInput.TryGet(ComfyUIBackendExtension.TeaCacheMode, out string teaCacheMode) && teaCacheMode != "disabled")
            {
                double teaCacheThreshold = g.UserInput.Get(ComfyUIBackendExtension.TeaCacheThreshold, 0.25);
                if (teaCacheMode == "base gen only" && g.LoadingModelType != "Base")
                {
                    // wrong step, skip
                }
                else if (g.IsFlux())
                {
                    if (teaCacheMode != "video only")
                    {
                        string teaCacheNode = g.CreateNode("TeaCacheForImgGen", new JObject()
                        {
                            ["model"] = g.LoadingModel,
                            ["model_type"] = "flux",
                            ["rel_l1_thresh"] = teaCacheThreshold
                        });
                        g.LoadingModel = [teaCacheNode, 0];
                    }
                }
                else if (g.IsHunyuanVideo() || g.IsLTXV())
                {
                    string teaCacheNode = g.CreateNode("TeaCacheForVidGen", new JObject()
                    {
                        ["model"] = g.LoadingModel,
                        ["model_type"] = g.IsHunyuanVideo() ? "hunyuan_video" : "ltxv",
                        ["rel_l1_thresh"] = teaCacheThreshold
                    });
                    g.LoadingModel = [teaCacheNode, 0];
                }
                else
                {
                    Logs.Debug($"Ignore TeaCache Mode parameter because the current model is '{g.CurrentModelClass()?.Name ?? "(none)"}' which does not support TeaCache.");
                }
            }
        }, -4);
        AddModelGenStep(g =>
        {
            if (ComfyUIBackendExtension.FeaturesSupported.Contains("aitemplate") && g.UserInput.Get(ComfyUIBackendExtension.AITemplateParam))
            {
                string aitLoad = g.CreateNode("AITemplateLoader", new JObject()
                {
                    ["model"] = g.LoadingModel,
                    ["keep_loaded"] = "disable"
                });
                g.LoadingModel = [aitLoad, 0];
            }
            if (g.UserInput.TryGet(T2IParamTypes.TorchCompile, out string compileMode) && compileMode != "Disabled")
            {
                string torchCompile = g.CreateNode("TorchCompileModel", new JObject()
                {
                    ["model"] = g.LoadingModel,
                    ["backend"] = compileMode
                });
                g.LoadingModel = [torchCompile, 0];
            }
        }, -3);
        #endregion
        #region Base Image
        AddStep(g =>
        {
            if (g.UserInput.TryGet(T2IParamTypes.InitImage, out Image img))
            {
                string maskImageNode = null;
                if (g.UserInput.TryGet(T2IParamTypes.MaskImage, out Image mask))
                {
                    string maskNode = g.CreateLoadImageNode(mask, "${maskimage}", true);
                    maskImageNode = g.CreateNode("ImageToMask", new JObject()
                    {
                        ["image"] = new JArray() { maskNode, 0 },
                        ["channel"] = "red"
                    });
                    g.EnableDifferential();
                    if (g.UserInput.TryGet(T2IParamTypes.MaskGrow, out int growAmount))
                    {
                        maskImageNode = g.CreateNode("SwarmMaskGrow", new JObject()
                        {
                            ["mask"] = new JArray() { maskImageNode, 0 },
                            ["grow"] = growAmount,
                        });
                    }
                    if (g.UserInput.TryGet(T2IParamTypes.MaskBlur, out int blurAmount))
                    {
                        maskImageNode = g.CreateNode("SwarmMaskBlur", new JObject()
                        {
                            ["mask"] = new JArray() { maskImageNode, 0 },
                            ["blur_radius"] = blurAmount,
                            ["sigma"] = 1.0
                        });
                    }
                    g.FinalMask = [maskImageNode, 0];
                }
                g.CreateLoadImageNode(img, "${initimage}", true, "15");
                g.FinalInputImage = ["15", 0];
                JArray currentMask = g.FinalMask;
                if (g.UserInput.TryGet(T2IParamTypes.InitImageNoise, out double initNoise))
                {
                    JObject noiseInput = new()
                    {
                        ["image"] = g.FinalInputImage,
                        ["amount"] = initNoise,
                        ["seed"] = g.UserInput.Get(T2IParamTypes.Seed, 0) + 327
                    };
                    if (currentMask is not null)
                    {
                        // cut the edges of a blurred mask back to make recompositing cleaner
                        string thresholded = g.CreateNode("SwarmMaskThreshold", new JObject()
                        {
                            ["mask"] = currentMask,
                            ["min"] = 0.5,
                            ["max"] = 1.0
                        });
                        noiseInput["mask"] = new JArray() { thresholded, 0 };
                    }
                    string noised = g.CreateNode("SwarmImageNoise", noiseInput);
                    g.FinalInputImage = [noised, 0];
                }
                if (currentMask is not null)
                {
                    if (g.UserInput.TryGet(T2IParamTypes.MaskShrinkGrow, out int shrinkGrow))
                    {
                        g.MaskShrunkInfo = g.CreateImageMaskCrop(g.FinalMask, g.FinalInputImage, shrinkGrow, g.FinalVae, g.FinalLoadedModel);
                        currentMask = [g.MaskShrunkInfo.CroppedMask, 0];
                        g.FinalLatentImage = [g.MaskShrunkInfo.MaskedLatent, 0];
                    }
                    else
                    {
                        g.FinalLatentImage = g.DoMaskedVAEEncode(g.FinalVae, g.FinalInputImage, currentMask, "5");
                    }
                }
                else
                {
                    g.CreateVAEEncode(g.FinalVae, g.FinalInputImage, "5");
                }
                if (g.UserInput.TryGet(T2IParamTypes.UnsamplerPrompt, out string unprompt))
                {
                    int steps = g.UserInput.Get(T2IParamTypes.Steps);
                    int startStep = 0;
                    if (g.UserInput.TryGet(T2IParamTypes.InitImageCreativity, out double creativity))
                    {
                        startStep = (int)Math.Round(steps * (1 - creativity));
                    }
                    JArray posCond = g.CreateConditioning(unprompt, g.FinalClip, g.FinalLoadedModel, true);
                    JArray negCond = g.CreateConditioning(g.UserInput.Get(T2IParamTypes.NegativePrompt, ""), g.FinalClip, g.FinalLoadedModel, false);
                    string unsampler = g.CreateNode("SwarmUnsampler", new JObject()
                    {
                        ["model"] = g.FinalModel,
                        ["steps"] = steps,
                        ["sampler_name"] = g.UserInput.Get(ComfyUIBackendExtension.SamplerParam, "euler"),
                        ["scheduler"] = g.UserInput.Get(ComfyUIBackendExtension.SchedulerParam, "normal"),
                        ["positive"] = posCond,
                        ["negative"] = negCond,
                        ["latent_image"] = g.FinalLatentImage,
                        ["start_at_step"] = startStep,
                        ["previews"] = g.UserInput.Get(T2IParamTypes.NoPreviews) ? "none" : "default"
                    });
                    g.FinalLatentImage = [unsampler, 0];
                    g.MainSamplerAddNoise = false;
                }
                if (g.UserInput.TryGet(T2IParamTypes.BatchSize, out int batchSize) && batchSize > 1)
                {
                    string batchNode = g.CreateNode("RepeatLatentBatch", new JObject()
                    {
                        ["samples"] = g.FinalLatentImage,
                        ["amount"] = batchSize
                    });
                    g.FinalLatentImage = [batchNode, 0];
                }
                if (g.UserInput.TryGet(T2IParamTypes.InitImageResetToNorm, out double resetFactor))
                {
                    string emptyImg = g.CreateEmptyImage(g.UserInput.GetImageWidth(), g.UserInput.GetImageHeight(), g.UserInput.Get(T2IParamTypes.BatchSize, 1));
                    if (g.Features.Contains("comfy_latent_blend_masked") && currentMask is not null)
                    {
                        string blended = g.CreateNode("SwarmLatentBlendMasked", new JObject()
                        {
                            ["samples0"] = g.FinalLatentImage,
                            ["samples1"] = new JArray() { emptyImg, 0 },
                            ["mask"] = currentMask,
                            ["blend_factor"] = resetFactor
                        });
                        g.FinalLatentImage = [blended, 0];
                    }
                    else
                    {
                        string emptyMultiplied = g.CreateNode("LatentMultiply", new JObject()
                        {
                            ["samples"] = new JArray() { emptyImg, 0 },
                            ["multiplier"] = resetFactor
                        });
                        string originalMultiplied = g.CreateNode("LatentMultiply", new JObject()
                        {
                            ["samples"] = g.FinalLatentImage,
                            ["multiplier"] = 1 - resetFactor
                        });
                        string added = g.CreateNode("LatentAdd", new JObject()
                        {
                            ["samples1"] = new JArray() { emptyMultiplied, 0 },
                            ["samples2"] = new JArray() { originalMultiplied, 0 }
                        });
                        g.FinalLatentImage = [added, 0];
                    }
                }
            }
            else
            {
                g.CreateEmptyImage(g.UserInput.GetImageWidth(), g.UserInput.GetImageHeight(), g.UserInput.Get(T2IParamTypes.BatchSize, 1), "5");
            }
        }, -9);
        #endregion
        #region Positive Prompt
        AddStep(g =>
        {
            g.FinalPrompt = g.CreateConditioning(g.UserInput.Get(T2IParamTypes.Prompt), g.FinalClip, g.UserInput.Get(T2IParamTypes.Model), true, "6");
        }, -8);
        #endregion
        #region ReVision/UnCLIP/IPAdapter
        AddStep(g =>
        {
            if (g.UserInput.TryGet(T2IParamTypes.PromptImages, out List<Image> images) && images.Any())
            {
                if (g.UserInput.TryGet(ComfyUIBackendExtension.StyleModelForRevision, out string styleModelName))
                {
                    g.RequireVisionModel("sigclip_vision_patch14_384.safetensors", "https://huggingface.co/Comfy-Org/sigclip_vision_384/resolve/main/sigclip_vision_patch14_384.safetensors", "1fee501deabac72f0ed17610307d7131e3e9d1e838d0363aa3c2b97a6e03fb33");
                    string styleModelClipLoader = g.CreateNode("CLIPVisionLoader", new JObject()
                    {
                        ["clip_name"] = "sigclip_vision_patch14_384.safetensors"
                    });
                    string styleModelLoader = g.CreateNode("StyleModelLoader", new JObject()
                    {
                        ["style_model_name"] = styleModelName
                    });
                    for (int i = 0; i < images.Count; i++)
                    {
                        string imageLoader = g.CreateLoadImageNode(images[i], "${promptimages." + i + "}", false);
                        string encoded = g.CreateNode("CLIPVisionEncode", new JObject()
                        {
                            ["clip_vision"] = new JArray() { $"{styleModelClipLoader}", 0 },
                            ["image"] = new JArray() { $"{imageLoader}", 0 },
                            ["crop"] = "none"
                        });
                        string styled = g.CreateNode("StyleModelApply", new JObject()
                        {
                            ["conditioning"] = g.FinalPrompt,
                            ["clip_vision_output"] = new JArray() { $"{encoded}", 0 },
                            ["style_model"] = new JArray() { $"{styleModelLoader}", 0 },
                            ["strength_type"] = "multiply",
                            ["strength"] = g.UserInput.Get(ComfyUIBackendExtension.StyleModelMultiplyStrength, 1)
                        });
                        if (g.UserInput.TryGet(ComfyUIBackendExtension.StyleModelMergeStrength, out double mergeStrength) && mergeStrength < 1)
                        {
                            styled = g.CreateNode("ConditioningAverage", new JObject()
                            {
                                ["conditioning_to"] = new JArray() { styled, 0 },
                                ["conditioning_from"] = g.FinalPrompt,
                                ["conditioning_to_strength"] = mergeStrength
                            });
                        }
                        if (g.UserInput.TryGet(ComfyUIBackendExtension.StyleModelApplyStart, out double applyAt) && applyAt > 0)
                        {
                            string cond1 = g.CreateNode("ConditioningSetTimestepRange", new JObject()
                            {
                                ["conditioning"] = g.FinalPrompt,
                                ["start"] = 0,
                                ["end"] = applyAt
                            });
                            string cond2 = g.CreateNode("ConditioningSetTimestepRange", new JObject()
                            {
                                ["conditioning"] = new JArray() { styled, 0 },
                                ["start"] = applyAt,
                                ["end"] = 1
                            });
                            string combined = g.CreateNode("ConditioningCombine", new JObject()
                            {
                                ["conditioning_1"] = new JArray() { cond1, 0 },
                                ["conditioning_2"] = new JArray() { cond2, 0 },
                            });
                            g.FinalPrompt = [combined, 0];
                        }
                        else
                        {
                            g.FinalPrompt = [styled, 0];
                        }
                    }
                }
                string visionLoaderId = null;
                string getVisionLoader()
                {
                    if (visionLoaderId is not null)
                    {
                        return visionLoaderId;
                    }
                    string visModelName = "clip_vision_g.safetensors";
                    if (g.UserInput.TryGet(T2IParamTypes.ReVisionModel, out T2IModel visionModel))
                    {
                        visModelName = visionModel.ToString(g.ModelFolderFormat);
                    }
                    else
                    {
                        g.RequireVisionModel(visModelName, "https://huggingface.co/stabilityai/control-lora/resolve/main/revision/clip_vision_g.safetensors", "9908329b3ead722a693ea400fab1d7c9ec91d6736fd194a94d20d793457f9c2e");
                    }
                    visionLoaderId = g.CreateNode("CLIPVisionLoader", new JObject()
                    {
                        ["clip_name"] = visModelName
                    });
                    return visionLoaderId;
                }
                double revisionStrength = g.UserInput.Get(T2IParamTypes.ReVisionStrength, 0);
                if (revisionStrength > 0)
                {
                    bool autoZero = g.UserInput.Get(T2IParamTypes.RevisionZeroPrompt, false);
                    if ((g.UserInput.TryGet(T2IParamTypes.Prompt, out string promptText) && string.IsNullOrWhiteSpace(promptText)) || autoZero)
                    {
                        string zeroed = g.CreateNode("ConditioningZeroOut", new JObject()
                        {
                            ["conditioning"] = g.FinalPrompt
                        });
                        g.FinalPrompt = [zeroed, 0];
                    }
                    if ((g.UserInput.TryGet(T2IParamTypes.NegativePrompt, out string negPromptText) && string.IsNullOrWhiteSpace(negPromptText)) || autoZero)
                    {
                        string zeroed = g.CreateNode("ConditioningZeroOut", new JObject()
                        {
                            ["conditioning"] = g.FinalNegativePrompt
                        });
                        g.FinalNegativePrompt = [zeroed, 0];
                    }
                    if (!g.UserInput.TryGet(T2IParamTypes.Model, out T2IModel model) || model.ModelClass is null || 
                        (model.ModelClass.CompatClass != "stable-diffusion-xl-v1"/* && model.ModelClass.CompatClass != "stable-diffusion-v3-medium"*/))
                    {
                        throw new SwarmUserErrorException($"Model type must be SDXL for ReVision (currently is {model?.ModelClass?.Name ?? "Unknown"}). Set ReVision Strength to 0 if you just want IP-Adapter.");
                    }
                    for (int i = 0; i < images.Count; i++)
                    {
                        string imageLoader = g.CreateLoadImageNode(images[i], "${promptimages." + i + "}", false);
                        string encoded = g.CreateNode("CLIPVisionEncode", new JObject()
                        {
                            ["clip_vision"] = new JArray() { $"{getVisionLoader()}", 0 },
                            ["image"] = new JArray() { $"{imageLoader}", 0 },
                            ["crop"] = "none"
                        });
                        string unclipped = g.CreateNode("unCLIPConditioning", new JObject()
                        {
                            ["conditioning"] = g.FinalPrompt,
                            ["clip_vision_output"] = new JArray() { $"{encoded}", 0 },
                            ["strength"] = revisionStrength,
                            ["noise_augmentation"] = 0
                        });
                        g.FinalPrompt = [unclipped, 0];
                    }
                }
                if (g.UserInput.Get(T2IParamTypes.UseReferenceOnly, false))
                {
                    string firstImg = g.CreateLoadImageNode(images[0], "${promptimages.0}", true);
                    string lastVae = g.CreateVAEEncode(g.FinalVae, [firstImg, 0]);
                    for (int i = 1; i < images.Count; i++)
                    {
                        string newImg = g.CreateLoadImageNode(images[i], "${promptimages." + i + "}", true);
                        string newVae = g.CreateVAEEncode(g.FinalVae, [newImg, 0]);
                        lastVae = g.CreateNode("LatentBatch", new JObject()
                        {
                            ["samples1"] = new JArray() { lastVae, 0 },
                            ["samples2"] = new JArray() { newVae, 0 }
                        });
                    }
                    string referencedModel = g.CreateNode("SwarmReferenceOnly", new JObject()
                    {
                        ["model"] = g.FinalModel,
                        ["reference"] = new JArray() { lastVae, 0 },
                        ["latent"] = g.FinalLatentImage
                    });
                    g.FinalModel = [referencedModel, 0];
                    g.FinalLatentImage = [referencedModel, 1];
                    g.DefaultPreviews = "second";
                }
                if (g.UserInput.TryGet(ComfyUIBackendExtension.UseIPAdapterForRevision, out string ipAdapter) && ipAdapter != "None")
                {
                    string getIPAvisionLoader()
                    {
                        string ipAdapterVisionLoader = getVisionLoader();
                        if (!g.Features.Contains("cubiqipadapterunified"))
                        {
                            if ((ipAdapter.Contains("sd15") && !ipAdapter.Contains("vit-G")) || ipAdapter.Contains("vit-h"))
                            {
                                string targetName = "clip_vision_h.safetensors";
                                g.RequireVisionModel(targetName, "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors", "6ca9667da1ca9e0b0f75e46bb030f7e011f44f86cbfb8d5a36590fcd7507b030");
                                ipAdapterVisionLoader = g.CreateNode("CLIPVisionLoader", new JObject()
                                {
                                    ["clip_name"] = targetName
                                });
                            }
                        }
                        return ipAdapterVisionLoader;
                    }
                    if (g.Features.Contains("cubiqipadapterunified"))
                    {
                        g.RequireVisionModel("CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors", "6ca9667da1ca9e0b0f75e46bb030f7e011f44f86cbfb8d5a36590fcd7507b030");
                        g.RequireVisionModel("CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/image_encoder/model.safetensors", "657723e09f46a7c3957df651601029f66b1748afb12b419816330f16ed45d64d");
                    }
                    string lastImage = g.CreateLoadImageNode(images[0], "${promptimages.0}", false);
                    for (int i = 1; i < images.Count; i++)
                    {
                        string newImg = g.CreateLoadImageNode(images[i], "${promptimages." + i + "}", false);
                        lastImage = g.CreateNode("ImageBatch", new JObject()
                        {
                            ["image1"] = new JArray() { lastImage, 0 },
                            ["image2"] = new JArray() { newImg, 0 }
                        });
                    }
                    if (g.Features.Contains("cubiqipadapterunified"))
                    {
                        string presetLow = ipAdapter.ToLowerFast();
                        bool isXl = g.CurrentCompatClass() == "stable-diffusion-xl-v1";
                        void requireIPAdapterModel(string name, string url, string hash)
                        {
                            if (WorkflowGenerator.IPAdapterModelsValid.ContainsKey(name))
                            {
                                return;
                            }
                            string filePath = Utilities.CombinePathWithAbsolute(Program.ServerSettings.Paths.ActualModelRoot, $"ipadapter/{name}");
                            g.DownloadModel(name, filePath, url, hash);
                            WorkflowGenerator.IPAdapterModelsValid.TryAdd(name, name);
                        }
                        void requireLora(string name, string url, string hash)
                        {
                            if (WorkflowGenerator.IPAdapterModelsValid.ContainsKey($"LORA-{name}"))
                            {
                                return;
                            }
                            string filePath = Utilities.CombinePathWithAbsolute(Program.ServerSettings.Paths.ActualModelRoot, Program.ServerSettings.Paths.SDLoraFolder.Split(';')[0], $"ipadapter/{name}");
                            g.DownloadModel(name, filePath, url, hash);
                            WorkflowGenerator.IPAdapterModelsValid.TryAdd($"LORA-{name}", name);
                        }
                        // IPAdapter model links @ https://github.com/cubiq/ComfyUI_IPAdapter_plus?tab=readme-ov-file#installation
                        // required model for any given type @ https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/main/utils.py#L29
                        if (presetLow.StartsWith("file:"))
                        {
                            // no autodownload
                        }
                        else if (presetLow.StartsWith("light"))
                        {
                            if (isXl) { throw new SwarmUserErrorException("IP-Adapter light model is not supported for SDXL"); }
                            else { requireIPAdapterModel("sd15_light_v11.bin", "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter_sd15_light_v11.bin", "350b63a57847c163e2e984b01090f85ffe60eaae20f32b2b2c9e1ccc7ddd972b"); }
                        }
                        else if (presetLow.StartsWith("standard"))
                        {
                            if (isXl) { requireIPAdapterModel("ip-adapter_sdxl_vit-h.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter_sdxl_vit-h.safetensors", "ebf05d918348aec7abb02a5e9ecef77e0aaea6914a5c4ea13f50d45eb1681831"); }
                            else { requireIPAdapterModel("ip-adapter_sd15.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter_sd15.safetensors", "289b45f16d043d0bf542e45831f971dcdaabe18b656f11e86d9dfba7e9ee3369"); }
                        }
                        else if (presetLow.StartsWith("vit-g"))
                        {
                            if (isXl) { requireIPAdapterModel("ip-adapter_sdxl.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter_sdxl.safetensors", "ba1002529e783604c5f326d49f0122025392d1d20ac8d573b3eeb3e6dea4ebb6"); }
                            else { requireIPAdapterModel("ip-adapter_sd15_vit-G.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter_sd15_vit-G.safetensors", "a26f736af07bb341a83dfea23713531d0575760e8ed947c68cb31a4c62d9c90b"); }
                        }
                        else if (presetLow.StartsWith("plus ("))
                        {
                            if (isXl) { requireIPAdapterModel("ip-adapter-plus_sdxl_vit-h.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors", "3f5062b8400c94b7159665b21ba5c62acdcd7682262743d7f2aefedef00e6581"); }
                            else { requireIPAdapterModel("ip-adapter-plus_sd15.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter-plus_sd15.safetensors", "a1c250be40455cc61a43da1201ec3f1edaea71214865fb47f57927e06cbe4996"); }
                        }
                        else if (presetLow.StartsWith("plus face"))
                        {
                            if (isXl) { requireIPAdapterModel("ip-adapter-plus-face_sdxl_vit-h.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter-plus-face_sdxl_vit-h.safetensors", "677ad8860204f7d0bfba12d29e6c31ded9beefdf3e4bbd102518357d31a292c1"); }
                            else { requireIPAdapterModel("ip-adapter-plus-face_sd15.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter-plus-face_sd15.safetensors", "1c9edc21af6f737dc1d6e0e734190e976cfacf802d6b024b77aa3be922f7569b"); }
                        }
                        else if (presetLow.StartsWith("full"))
                        {
                            if (isXl) { throw new SwarmUserErrorException("IP-Adapter full face model is not supported for SDXL"); }
                            else { requireIPAdapterModel("full_face_sd15.safetensors", "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter-full-face_sd15.safetensors", "f4a17fb643bf876235a45a0e87a49da2855be6584b28ca04c62a97ab5ff1c6f3"); }
                        }
                        else if (presetLow == "faceid")
                        {
                            if (isXl)
                            {
                                requireIPAdapterModel("ip-adapter-faceid_sdxl.bin", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid_sdxl.bin", "f455fed24e207c878ec1e0466b34a969d37bab857c5faa4e8d259a0b4ff63d7e");
                                requireLora("ip-adapter-faceid_sdxl_lora.safetensors", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid_sdxl_lora.safetensors", "4fcf93d6e8dc8dd18f5f9e51c8306f369486ed0aa0780ade9961308aff7f0d64");
                            }
                            else
                            {
                                requireIPAdapterModel("ip-adapter-faceid_sd15.bin", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid_sd15.bin", "201344e22e6f55849cf07ca7a6e53d8c3b001327c66cb9710d69fd5da48a8da7");
                                requireLora("ip-adapter-faceid_sd15_lora.safetensors", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid_sd15_lora.safetensors", "70699f0dbfadd47de1f81d263cf4c86bd4b7271d841304af9b340b3a7f38e86a");
                            }
                        }
                        else if (presetLow.StartsWith("faceid plus -"))
                        {
                            if (isXl) { throw new SwarmUserErrorException("IP-Adapter FaceID plus model is not supported for SDXL"); }
                            else
                            {
                                requireIPAdapterModel("ip-adapter-faceid-plus_sd15.bin", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plus_sd15.bin", "252fb53e0d018489d9e7f9b9e2001a52ff700e491894011ada7cfb471e0fadf2");
                                requireLora("ip-adapter-faceid-plus_sd15_lora.safetensors", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plus_sd15_lora.safetensors", "3f00341d11e5e7b5aadf63cbdead09ef82eb28669156161cf1bfc2105d4ff1cd");
                            }
                        }
                        else if (presetLow.StartsWith("faceid plus v2"))
                        {
                            if (isXl)
                            {
                                requireIPAdapterModel("ip-adapter-faceid-plusv2_sdxl.bin", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl.bin", "c6945d82b543700cc3ccbb98d363b837e9c596281607857c74b713a876daf5fb");
                                requireLora("ip-adapter-faceid-plusv2_sdxl_lora.safetensors", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl_lora.safetensors", "f24b4bb2dad6638a09c00f151cde84991baf374409385bcbab53c1871a30cb7b");
                            }
                            else
                            {
                                requireIPAdapterModel("ip-adapter-faceid-plusv2_sd15.bin", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sd15.bin", "26d0d86a1d60d6cc811d3b8862178b461e1eeb651e6fe2b72ba17aa95411e313");
                                requireLora("ip-adapter-faceid-plusv2_sd15_lora.safetensors", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sd15_lora.safetensors", "8abff87a15a049f3e0186c2e82c1c8e77783baf2cfb63f34c412656052eb57b0");
                            }
                        }
                        else if (presetLow.StartsWith("faceid portrait unnorm"))
                        {
                            if (isXl) { requireIPAdapterModel("ip-adapter-faceid-portrait_sdxl_unnorm.bin", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-portrait_sdxl_unnorm.bin", "220bb86e205393a3d0411631cb473caddbf35fd371be2905ca9008818170db55"); }
                            else { throw new SwarmUserErrorException("IP-Adapter FaceID Portrait UnNorm model is only supported for SDXL"); }
                        }
                        else if (presetLow.StartsWith("faceid portrait"))
                        {
                            if (isXl) { requireIPAdapterModel("ip-adapter-faceid-portrait_sdxl.bin", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-portrait_sdxl.bin", "5631ce7824cdafd2db37c5e85b985730a95ff59c5b4fc80c2b79b0bee5711512"); }
                            else { requireIPAdapterModel("ip-adapter-faceid-portrait-v11_sd15.bin", "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-portrait-v11_sd15.bin", "a48cb4f89ed18e02c6000f65aa9efec452e87eaed4a1bc9fcf4a460c8d0e3bc6"); }
                        }
                        string ipAdapterLoader;
                        if (presetLow.StartsWith("file:"))
                        {
                            ipAdapterLoader = g.CreateNode("IPAdapterModelLoader", new JObject()
                            {
                                ["ipadapter_file"] = ipAdapter["file:".Length..]
                            });
                        }
                        else if (presetLow.StartsWith("faceid"))
                        {
                            ipAdapterLoader = g.CreateNode("IPAdapterUnifiedLoaderFaceID", new JObject()
                            {
                                ["model"] = g.FinalModel,
                                ["preset"] = ipAdapter,
                                ["lora_strength"] = 0.6,
                                ["provider"] = "CPU"
                            });
                        }
                        else
                        {
                            ipAdapterLoader = g.CreateNode("IPAdapterUnifiedLoader", new JObject()
                            {
                                ["model"] = g.FinalModel,
                                ["preset"] = ipAdapter
                            });
                        }
                        double ipAdapterStart = g.UserInput.Get(ComfyUIBackendExtension.IPAdapterStart, 0.0);
                        double ipAdapterEnd = g.UserInput.Get(ComfyUIBackendExtension.IPAdapterEnd, 1.0);
                        if (ipAdapterStart >= ipAdapterEnd) 
                        {
                            throw new SwarmUserErrorException($"IP-Adapter Start must be less than IP-Adapter End.");
                        }
                        if (presetLow.StartsWith("file:"))
                        {
                            string weightType = g.UserInput.Get(ComfyUIBackendExtension.IPAdapterWeightType, "linear");
                            if (weightType == "standard") { weightType = "linear"; }
                            else if (weightType == "prompt is more important") { weightType = "ease out"; }
                            string ipAdapterNode = g.CreateNode("IPAdapterAdvanced", new JObject()
                            {
                                ["model"] = g.FinalModel,
                                ["ipadapter"] = new JArray() { ipAdapterLoader, 0 },
                                ["image"] = new JArray() { lastImage, 0 },
                                ["weight"] = g.UserInput.Get(ComfyUIBackendExtension.IPAdapterWeight, 1),
                                ["start_at"] = ipAdapterStart,
                                ["end_at"] = ipAdapterEnd,
                                ["weight_type"] = weightType,
                                ["combine_embeds"] = "concat",
                                ["embeds_scaling"] = "V only",
                                ["clip_vision"] = new JArray() { getVisionLoader(), 0 }
                            });
                            g.FinalModel = [ipAdapterNode, 0];
                        }
                        else
                        {
                            string ipAdapterNode = g.CreateNode("IPAdapter", new JObject()
                            {

                                ["model"] = new JArray() { ipAdapterLoader, 0 },
                                ["ipadapter"] = new JArray() { ipAdapterLoader, 1 },
                                ["image"] = new JArray() { lastImage, 0 },
                                ["weight"] = g.UserInput.Get(ComfyUIBackendExtension.IPAdapterWeight, 1),
                                ["start_at"] = ipAdapterStart,
                                ["end_at"] = ipAdapterEnd,
                                ["weight_type"] = g.UserInput.Get(ComfyUIBackendExtension.IPAdapterWeightType, "standard")
                            });
                            g.FinalModel = [ipAdapterNode, 0];
                        }
                    }
                    else if (g.Features.Contains("cubiqipadapter"))
                    {
                        string ipAdapterLoader = g.CreateNode("IPAdapterModelLoader", new JObject()
                        {
                            ["ipadapter_file"] = ipAdapter
                        });
                        string ipAdapterNode = g.CreateNode("IPAdapterApply", new JObject()
                        {
                            ["ipadapter"] = new JArray() { ipAdapterLoader, 0 },
                            ["model"] = g.FinalModel,
                            ["image"] = new JArray() { lastImage, 0 },
                            ["clip_vision"] = new JArray() { getIPAvisionLoader(), 0 },
                            ["weight"] = g.UserInput.Get(ComfyUIBackendExtension.IPAdapterWeight, 1),
                            ["noise"] = 0,
                            ["weight_type"] = "original"
                        });
                        g.FinalModel = [ipAdapterNode, 0];
                    }
                    else
                    {
                        string ipAdapterNode = g.CreateNode("IPAdapter", new JObject()
                        {
                            ["model"] = g.FinalModel,
                            ["image"] = new JArray() { lastImage, 0 },
                            ["clip_vision"] = new JArray() { getIPAvisionLoader(), 0 },
                            ["weight"] = g.UserInput.Get(ComfyUIBackendExtension.IPAdapterWeight, 1),
                            ["model_name"] = ipAdapter,
                            ["dtype"] = "fp16" // TODO: ...???
                        });
                        g.FinalModel = [ipAdapterNode, 0];
                    }
                }
            }
        }, -7);
        #endregion
        #region Negative Prompt
        AddStep(g =>
        {
            g.FinalNegativePrompt = g.CreateConditioning(g.UserInput.Get(T2IParamTypes.NegativePrompt, ""), g.FinalClip, g.UserInput.Get(T2IParamTypes.Model), false, "7");
        }, -7);
        #endregion
        #region ControlNet
        AddStep(g =>
        {
            JArray firstImageNode = null;
            for (int i = 0; i < 3; i++)
            {
                T2IParamTypes.ControlNetParamHolder controlnetParams = T2IParamTypes.Controlnets[i];
                if (g.UserInput.TryGet(controlnetParams.Strength, out double controlStrength))
                {
                    string imageInput = "${" + controlnetParams.Image.Type.ID + "}";
                    JArray imageNodeActual = null;
                    if (g.UserInput.TryGet(controlnetParams.Image, out Image img))
                    {
                        string imageNode = g.CreateLoadImageNode(img, imageInput, true);
                        imageNodeActual = [imageNode, 0];
                    }
                    else
                    {
                        if (i == 0 ? g.FinalInputImage is null : firstImageNode is null)
                        {
                            Logs.Verbose($"Following error relates to parameters: {g.UserInput.ToJSON().ToDenseDebugString()}");
                            throw new SwarmUserErrorException("Must specify either a ControlNet Image, or Init image. Or turn off ControlNet if not wanted.");
                        }
                        if (i == 0)
                        {
                            firstImageNode = g.FinalInputImage;
                            if (g.MaskShrunkInfo.ScaledImage is not null)
                            {
                                firstImageNode = [g.MaskShrunkInfo.ScaledImage, 0];
                            }
                        }
                        imageNodeActual = firstImageNode;
                    }
                    if (i == 0)
                    {
                        firstImageNode = imageNodeActual;
                    }
                    T2IModel controlModel = g.UserInput.Get(controlnetParams.Model, null);
                    if (!g.UserInput.TryGet(ComfyUIBackendExtension.ControlNetPreprocessorParams[i], out string preprocessor))
                    {
                        preprocessor = "none";
                        string wantedPreproc = controlModel?.Metadata?.Preprocessor;
                        string cnName = $"{controlModel?.Name}{controlModel?.RawFilePath.Replace('\\', '/').AfterLast('/')}".ToLowerFast();
                        if (string.IsNullOrWhiteSpace(wantedPreproc))
                        {
                            if (cnName.Contains("canny")) { wantedPreproc = "canny"; }
                            else if (cnName.Contains("depth") || cnName.Contains("midas")) { wantedPreproc = "depth"; }
                            else if (cnName.Contains("sketch")) { wantedPreproc = "sketch"; }
                            else if (cnName.Contains("scribble")) { wantedPreproc = "scribble"; }
                            else if (cnName.Contains("pose")) { wantedPreproc = "pose"; }
                        }
                        if (string.IsNullOrWhiteSpace(wantedPreproc))
                        {
                            Logs.Verbose($"No wanted preprocessor, and '{cnName}' doesn't imply any other option, skipping...");
                        }
                        else
                        {
                            string[] procs = [.. ComfyUIBackendExtension.ControlNetPreprocessors.Keys];
                            bool getBestFor(string phrase)
                            {
                                string result = procs.FirstOrDefault(m => m.ToLowerFast().Contains(phrase.ToLowerFast()));
                                if (result is not null)
                                {
                                    preprocessor = result;
                                    return true;
                                }
                                return false;
                            }
                            if (wantedPreproc == "depth")
                            {
                                if (!getBestFor("midas-depthmap") && !getBestFor("depthmap") && !getBestFor("depth") && !getBestFor("midas") && !getBestFor("zoe") && !getBestFor("leres"))
                                {
                                    throw new SwarmUserErrorException("No preprocessor found for depth - please install a Comfy extension that adds eg MiDaS depthmap preprocessors, or select 'none' if using a manual depthmap");
                                }
                            }
                            else if (wantedPreproc == "canny")
                            {
                                if (!getBestFor("cannyedge") && !getBestFor("canny"))
                                {
                                    preprocessor = "none";
                                }
                            }
                            else if (wantedPreproc == "sketch")
                            {
                                if (!getBestFor("sketch") && !getBestFor("lineart") && !getBestFor("scribble"))
                                {
                                    preprocessor = "none";
                                }
                            }
                            else if (wantedPreproc == "pose")
                            {
                                if (!getBestFor("openpose") && !getBestFor("pose"))
                                {
                                    preprocessor = "none";
                                }
                            }
                            else
                            {
                                Logs.Verbose($"Wanted preprocessor {wantedPreproc} unrecognized, skipping...");
                            }
                        }
                    }
                    if (preprocessor.ToLowerFast() != "none")
                    {
                        JArray preprocActual = g.CreatePreprocessor(preprocessor, imageNodeActual);
                        g.NodeHelpers["controlnet_preprocessor"] = $"{preprocActual[0]}";
                        if (g.UserInput.Get(T2IParamTypes.ControlNetPreviewOnly))
                        {
                            g.FinalImageOut = preprocActual;
                            g.CreateImageSaveNode(g.FinalImageOut, "9");
                            g.SkipFurtherSteps = true;
                            return;
                        }
                        imageNodeActual = preprocActual;
                    }
                    else if (g.UserInput.Get(T2IParamTypes.ControlNetPreviewOnly))
                    {
                        throw new SwarmUserErrorException("Cannot preview a ControlNet preprocessor without any preprocessor enabled.");
                    }
                    if (controlModel is null)
                    {
                        throw new SwarmUserErrorException("Cannot use ControlNet without a model selected.");
                    }
                    string controlModelNode = g.CreateNode("ControlNetLoader", new JObject()
                    {
                        ["control_net_name"] = controlModel.ToString(g.ModelFolderFormat)
                    });
                    if (g.UserInput.TryGet(ComfyUIBackendExtension.ControlNetUnionTypeParams[i], out string unionType))
                    {
                        controlModelNode = g.CreateNode("SetUnionControlNetType", new JObject()
                        {
                            ["control_net"] = new JArray() { $"{controlModelNode}", 0 },
                            ["type"] = unionType
                        });
                    }
                    string applyNode;
                    if (controlModel.Metadata?.ModelClassType == "flux.1-dev/controlnet-alimamainpaint")
                    {
                        if (g.FinalMask is null)
                        {
                            throw new SwarmUserErrorException("Alimama Inpainting ControlNet requires a mask.");
                        }
                        applyNode = g.CreateNode("ControlNetInpaintingAliMamaApply", new JObject()
                        {
                            ["positive"] = g.FinalPrompt,
                            ["negative"] = g.FinalNegativePrompt,
                            ["control_net"] = new JArray() { $"{controlModelNode}", 0 },
                            ["vae"] = g.FinalVae,
                            ["image"] = imageNodeActual,
                            ["mask"] = g.FinalMask,
                            ["strength"] = controlStrength,
                            ["start_percent"] = g.UserInput.Get(controlnetParams.Start, 0),
                            ["end_percent"] = g.UserInput.Get(controlnetParams.End, 1)
                        });
                    }
                    else if (g.IsSD3() || g.IsFlux())
                    {
                        applyNode = g.CreateNode("ControlNetApplySD3", new JObject()
                        {
                            ["positive"] = g.FinalPrompt,
                            ["negative"] = g.FinalNegativePrompt,
                            ["control_net"] = new JArray() { $"{controlModelNode}", 0 },
                            ["vae"] = g.FinalVae,
                            ["image"] = imageNodeActual,
                            ["strength"] = controlStrength,
                            ["start_percent"] = g.UserInput.Get(controlnetParams.Start, 0),
                            ["end_percent"] = g.UserInput.Get(controlnetParams.End, 1)
                        });
                    }
                    else
                    {
                        applyNode = g.CreateNode("ControlNetApplyAdvanced", new JObject()
                        {
                            ["positive"] = g.FinalPrompt,
                            ["negative"] = g.FinalNegativePrompt,
                            ["control_net"] = new JArray() { $"{controlModelNode}", 0 },
                            ["image"] = imageNodeActual,
                            ["strength"] = controlStrength,
                            ["start_percent"] = g.UserInput.Get(controlnetParams.Start, 0),
                            ["end_percent"] = g.UserInput.Get(controlnetParams.End, 1)
                        });
                    }
                    g.FinalPrompt = [applyNode, 0];
                    g.FinalNegativePrompt = [applyNode, 1];
                }
            }
        }, -6);
        #endregion
        #region Sampler
        AddStep(g =>
        {
            int steps = g.UserInput.Get(T2IParamTypes.Steps);
            bool noSkip = false;
            if (steps < 0)
            {
                noSkip = true;
                steps = 0;
            }
            int startStep = 0;
            int endStep = 10000;
            if (g.UserInput.TryGet(T2IParamTypes.InitImage, out Image _) && g.UserInput.TryGet(T2IParamTypes.InitImageCreativity, out double creativity))
            {
                startStep = (int)Math.Round(steps * (1 - creativity));
            }
            if (g.UserInput.TryGet(T2IParamTypes.RefinerMethod, out string method) && method == "StepSwap" && g.UserInput.TryGet(T2IParamTypes.RefinerControl, out double refinerControl))
            {
                endStep = (int)Math.Round(steps * (1 - refinerControl));
            }
            if (g.UserInput.TryGet(T2IParamTypes.EndStepsEarly, out double endEarly))
            {
                endStep = (int)(steps * (1 - endEarly));
            }
            double cfg = g.UserInput.Get(T2IParamTypes.CFGScale);
            if (!noSkip && (steps == 0 || endStep <= startStep))
            {
                g.CreateNode("SwarmJustLoadTheModelPlease", new JObject()
                {
                    ["model"] = g.FinalModel,
                    ["clip"] = g.FinalClip,
                    ["vae"] = g.FinalVae
                });
                g.FinalSamples = g.FinalLatentImage;
            }
            else
            {
                g.CreateKSampler(g.FinalModel, g.FinalPrompt, g.FinalNegativePrompt, g.FinalLatentImage, cfg, steps, startStep, endStep,
                    g.UserInput.Get(T2IParamTypes.Seed), g.UserInput.Get(T2IParamTypes.RefinerMethod, "none") == "StepSwapNoisy", g.MainSamplerAddNoise, id: "10", isFirstSampler: true);
                if (g.UserInput.Get(T2IParamTypes.UseReferenceOnly, false))
                {
                    string fromBatch = g.CreateNode("LatentFromBatch", new JObject()
                    {
                        ["samples"] = new JArray() { "10", 0 },
                        ["batch_index"] = 1,
                        ["length"] = 1
                    });
                    g.FinalSamples = [fromBatch, 0];
                }
            }
        }, -5);
        JArray doMaskShrinkApply(WorkflowGenerator g, JArray imgIn)
        {
            (string boundsNode, string croppedMask, string masked, string scaledImage) = g.MaskShrunkInfo;
            g.MaskShrunkInfo = new(null, null, null, null);
            if (boundsNode is not null)
            {
                imgIn = g.RecompositeCropped(boundsNode, [croppedMask, 0], g.FinalInputImage, imgIn);
            }
            else if (g.UserInput.Get(T2IParamTypes.InitImageRecompositeMask, true) && g.FinalMask is not null && !g.NodeHelpers.ContainsKey("recomposite_mask_result"))
            {
                imgIn = g.CompositeMask(g.FinalInputImage, imgIn, g.FinalMask);
            }
            g.NodeHelpers["recomposite_mask_result"] = $"{imgIn[0]}";
            return imgIn;
        }
        #endregion
        #region Refiner
        AddStep(g =>
        {
            if (g.UserInput.TryGet(T2IParamTypes.RefinerMethod, out string method)
                && g.UserInput.TryGet(T2IParamTypes.RefinerControl, out double refinerControl)
                && g.UserInput.TryGet(ComfyUIBackendExtension.RefinerUpscaleMethod, out string upscaleMethod))
            {
                g.IsRefinerStage = true;
                JArray origVae = g.FinalVae, prompt = g.FinalPrompt, negPrompt = g.FinalNegativePrompt;
                bool modelMustReencode = false;
                if (g.UserInput.TryGet(T2IParamTypes.RefinerModel, out T2IModel refineModel) && refineModel is not null)
                {
                    T2IModel baseModel = g.UserInput.Get(T2IParamTypes.Model);
                    modelMustReencode = refineModel.ModelClass?.CompatClass != "stable-diffusion-xl-v1-refiner" || baseModel.ModelClass?.CompatClass != "stable-diffusion-xl-v1";
                    g.NoVAEOverride = refineModel.ModelClass?.CompatClass != baseModel.ModelClass?.CompatClass;
                    g.FinalLoadedModel = refineModel;
                    g.FinalLoadedModelList = [refineModel];
                    (g.FinalLoadedModel, g.FinalModel, g.FinalClip, g.FinalVae) = g.CreateStandardModelLoader(refineModel, "Refiner", "20");
                    prompt = g.CreateConditioning(g.UserInput.Get(T2IParamTypes.Prompt), g.FinalClip, refineModel, true);
                    negPrompt = g.CreateConditioning(g.UserInput.Get(T2IParamTypes.NegativePrompt), g.FinalClip, refineModel, false);
                    g.NoVAEOverride = false;
                }
                bool doSave = g.UserInput.Get(T2IParamTypes.SaveIntermediateImages, false);
                bool doUspcale = g.UserInput.TryGet(T2IParamTypes.RefinerUpscale, out double refineUpscale) && refineUpscale != 1;
                // TODO: Better same-VAE check
                bool doPixelUpscale = doUspcale && (upscaleMethod.StartsWith("pixel-") || upscaleMethod.StartsWith("model-"));
                if (modelMustReencode || doPixelUpscale || doSave || g.MaskShrunkInfo.BoundsNode is not null)
                {
                    g.CreateVAEDecode(origVae, g.FinalSamples, "24");
                    JArray pixelsNode = ["24", 0];
                    pixelsNode = doMaskShrinkApply(g, pixelsNode);
                    if (doSave)
                    {
                        g.CreateImageSaveNode(pixelsNode, "29");
                    }
                    if (doPixelUpscale)
                    {
                        int width = (int)Math.Round(g.UserInput.GetImageWidth() * refineUpscale);
                        int height = (int)Math.Round(g.UserInput.GetImageHeight() * refineUpscale);
                        width = (width / 16) * 16; // avoid unworkable output sizes
                        height = (height / 16) * 16;
                        if (upscaleMethod.StartsWith("pixel-"))
                        {
                            g.CreateNode("ImageScale", new JObject()
                            {
                                ["image"] = pixelsNode,
                                ["width"] = width,
                                ["height"] = height,
                                ["upscale_method"] = upscaleMethod.After("pixel-"),
                                ["crop"] = "disabled"
                            }, "26");
                        }
                        else
                        {
                            g.CreateNode("UpscaleModelLoader", new JObject()
                            {
                                ["model_name"] = upscaleMethod.After("model-")
                            }, "27");
                            g.CreateNode("ImageUpscaleWithModel", new JObject()
                            {
                                ["upscale_model"] = new JArray() { "27", 0 },
                                ["image"] = pixelsNode
                            }, "28");
                            g.CreateNode("ImageScale", new JObject()
                            {
                                ["image"] = new JArray() { "28", 0 },
                                ["width"] = width,
                                ["height"] = height,
                                ["upscale_method"] = "bilinear",
                                ["crop"] = "disabled"
                            }, "26");
                        }
                        pixelsNode = ["26", 0];
                        if (refinerControl <= 0)
                        {
                            g.FinalImageOut = pixelsNode;
                            return;
                        }
                    }
                    if (modelMustReencode || doPixelUpscale)
                    {
                        g.CreateVAEEncode(g.FinalVae, pixelsNode, "25");
                        g.FinalSamples = ["25", 0];
                    }
                }
                if (doUspcale && upscaleMethod.StartsWith("latent-"))
                {
                    g.CreateNode("LatentUpscaleBy", new JObject()
                    {
                        ["samples"] = g.FinalSamples,
                        ["upscale_method"] = upscaleMethod.After("latent-"),
                        ["scale_by"] = refineUpscale
                    }, "26");
                    g.FinalSamples = ["26", 0];
                }
                JArray model = g.FinalModel;
                if (g.UserInput.TryGet(ComfyUIBackendExtension.RefinerHyperTile, out int tileSize))
                {
                    string hyperTileNode = g.CreateNode("HyperTile", new JObject()
                    {
                        ["model"] = model,
                        ["tile_size"] = tileSize,
                        ["swap_size"] = 2, // TODO: Do these other params matter?
                        ["max_depth"] = 0,
                        ["scale_depth"] = false
                    });
                    model = [hyperTileNode, 0];
                }
                int steps = g.UserInput.Get(T2IParamTypes.RefinerSteps, g.UserInput.Get(T2IParamTypes.Steps));
                double cfg = g.UserInput.Get(T2IParamTypes.RefinerCFGScale, g.UserInput.Get(T2IParamTypes.CFGScale));
                g.CreateKSampler(model, prompt, negPrompt, g.FinalSamples, cfg, steps, (int)Math.Round(steps * (1 - refinerControl)), 10000,
                    g.UserInput.Get(T2IParamTypes.Seed) + 1, false, method != "StepSwapNoisy", id: "23", doTiled: g.UserInput.Get(T2IParamTypes.RefinerDoTiling, false));
                g.FinalSamples = ["23", 0];
                g.IsRefinerStage = false;
            }
        }, -4);
        #endregion
        #region VAEDecode
        AddStep(g =>
        {
            if (g.FinalImageOut is null)
            {
                g.CreateVAEDecode(g.FinalVae, g.FinalSamples, "8");
                g.FinalImageOut = doMaskShrinkApply(g, ["8", 0]);
            }
        }, 1);
        #endregion
        #region Segmentation Processing
        AddStep(g =>
        {
            PromptRegion.Part[] parts = new PromptRegion(g.UserInput.Get(T2IParamTypes.Prompt, "")).Parts.Where(p => p.Type == PromptRegion.PartType.Segment).ToArray();
            if (parts.Any())
            {
                if (g.UserInput.Get(T2IParamTypes.SaveIntermediateImages, false))
                {
                    g.CreateImageSaveNode(g.FinalImageOut, g.GetStableDynamicID(50000, 0));
                }
                T2IModel t2iModel = g.FinalLoadedModel;
                JArray model = g.FinalModel, clip = g.FinalClip, vae = g.FinalVae;
                if (g.UserInput.TryGet(T2IParamTypes.SegmentModel, out T2IModel segmentModel))
                {
                    if (segmentModel.ModelClass?.CompatClass != t2iModel.ModelClass?.CompatClass)
                    {
                        g.NoVAEOverride = true;
                    }
                    t2iModel = segmentModel;
                    (t2iModel, model, clip, vae) = g.CreateStandardModelLoader(t2iModel, "Refiner");
                    g.FinalLoadedModel = t2iModel;
                    g.FinalModel = model;
                }
                PromptRegion negativeRegion = new(g.UserInput.Get(T2IParamTypes.NegativePrompt, ""));
                PromptRegion.Part[] negativeParts = negativeRegion.Parts.Where(p => p.Type == PromptRegion.PartType.Segment).ToArray();
                for (int i = 0; i < parts.Length; i++)
                {
                    PromptRegion.Part part = parts[i];
                    string segmentNode;
                    if (part.DataText.StartsWith("yolo-"))
                    {
                        string fullname = part.DataText.After("yolo-");
                        string[] modelParts = fullname.Split(':');
                        fullname = modelParts[0];
                        string classFilter = modelParts.Length > 1 ? modelParts[1] : "";
                        (string mname, string indexText) = fullname.BeforeAndAfterLast('-');
                        if (!string.IsNullOrWhiteSpace(indexText) && int.TryParse(indexText, out int index))
                        {
                            fullname = mname;
                        }
                        else
                        {
                            index = 0;
                        }
                        segmentNode = g.CreateNode("SwarmYoloDetection", new JObject()
                        {
                            ["image"] = g.FinalImageOut,
                            ["model_name"] = fullname,
                            ["index"] = index,
                            ["class_filter"] = classFilter,
                            ["sort_order"] = g.UserInput.Get(T2IParamTypes.SegmentSortOrder, "left-right")
                        });
                    }
                    else
                    {
                        segmentNode = g.CreateNode("SwarmClipSeg", new JObject()
                        {
                            ["images"] = g.FinalImageOut,
                            ["match_text"] = part.DataText,
                            ["threshold"] = Math.Abs(part.Strength)
                        });
                    }
                    if (part.Strength < 0)
                    {
                        segmentNode = g.CreateNode("InvertMask", new JObject()
                        {
                            ["mask"] = new JArray() { segmentNode, 0 }
                        });
                    }
                    int blurAmt = g.UserInput.Get(T2IParamTypes.SegmentMaskBlur, 10);
                    if (blurAmt > 0)
                    {
                        segmentNode = g.CreateNode("SwarmMaskBlur", new JObject()
                        {
                            ["mask"] = new JArray() { segmentNode, 0 },
                            ["blur_radius"] = blurAmt,
                            ["sigma"] = 1
                        });
                    }
                    int growAmt = g.UserInput.Get(T2IParamTypes.SegmentMaskGrow, 16);
                    if (growAmt > 0)
                    {
                        segmentNode = g.CreateNode("GrowMask", new JObject()
                        {
                            ["mask"] = new JArray() { segmentNode, 0 },
                            ["expand"] = growAmt,
                            ["tapered_corners"] = true
                        });
                    }
                    if (g.UserInput.Get(T2IParamTypes.SaveSegmentMask, false))
                    {
                        string imageNode = g.CreateNode("MaskToImage", new JObject()
                        {
                            ["mask"] = new JArray() { segmentNode, 0 }
                        });
                        g.CreateImageSaveNode([imageNode, 0], g.GetStableDynamicID(50000, 0));
                    }
                    int oversize = g.UserInput.Get(T2IParamTypes.SegmentMaskOversize, 16);
                    (string boundsNode, string croppedMask, string masked, string scaledImage) = g.CreateImageMaskCrop([segmentNode, 0], g.FinalImageOut, oversize, vae, g.FinalLoadedModel, thresholdMax: g.UserInput.Get(T2IParamTypes.SegmentThresholdMax, 1));
                    g.EnableDifferential();
                    (model, clip) = g.LoadLorasForConfinement(part.ContextID, g.FinalModel, clip);
                    JArray prompt = g.CreateConditioning(part.Prompt, clip, t2iModel, true);
                    string neg = negativeParts.FirstOrDefault(p => p.DataText == part.DataText)?.Prompt ?? negativeRegion.GlobalPrompt;
                    JArray negPrompt = g.CreateConditioning(neg, clip, t2iModel, false);
                    int steps = g.UserInput.Get(T2IParamTypes.Steps);
                    int startStep = (int)Math.Round(steps * (1 - part.Strength2));
                    long seed = g.UserInput.Get(T2IParamTypes.Seed) + 2 + i;
                    double cfg = g.UserInput.Get(T2IParamTypes.RefinerCFGScale, g.UserInput.Get(T2IParamTypes.CFGScale));
                    string sampler = g.CreateKSampler(model, prompt, negPrompt, [masked, 0], cfg, steps, startStep, 10000, seed, false, true);
                    string decoded = g.CreateVAEDecode(vae, [sampler, 0]);
                    g.FinalImageOut = g.RecompositeCropped(boundsNode, [croppedMask, 0], g.FinalImageOut, [decoded, 0]);
                }
            }
        }, 5);
        #endregion
        #region SaveImage
        AddStep(g =>
        {
            PromptRegion.Part[] parts = new PromptRegion(g.UserInput.Get(T2IParamTypes.Prompt, "")).Parts.Where(p => p.Type == PromptRegion.PartType.ClearSegment).ToArray();
            foreach (PromptRegion.Part part in parts)
            {
                if (g.UserInput.Get(T2IParamTypes.SaveIntermediateImages, false))
                {
                    g.CreateImageSaveNode(g.FinalImageOut, g.GetStableDynamicID(50000, 0));
                }
                string segmentNode = g.CreateNode("SwarmClipSeg", new JObject()
                {
                    ["images"] = g.FinalImageOut,
                    ["match_text"] = part.DataText,
                    ["threshold"] = Math.Abs(part.Strength)
                });
                if (part.Strength < 0)
                {
                    segmentNode = g.CreateNode("InvertMask", new JObject()
                    {
                        ["mask"] = new JArray() { segmentNode, 0 }
                    });
                }
                string blurNode = g.CreateNode("SwarmMaskBlur", new JObject()
                {
                    ["mask"] = new JArray() { segmentNode, 0 },
                    ["blur_radius"] = 10,
                    ["sigma"] = 1
                });
                string thresholded = g.CreateNode("SwarmMaskThreshold", new JObject()
                {
                    ["mask"] = new JArray() { blurNode, 0 },
                    ["min"] = 0.2,
                    ["max"] = 0.6
                });
                string joined = g.CreateNode("JoinImageWithAlpha", new JObject()
                {
                    ["image"] = g.FinalImageOut,
                    ["alpha"] = new JArray() { thresholded, 0 }
                });
                g.FinalImageOut = [joined, 0];
            }
            if (g.UserInput.Get(T2IParamTypes.RemoveBackground, false))
            {
                if (g.UserInput.Get(T2IParamTypes.SaveIntermediateImages, false))
                {
                    g.CreateImageSaveNode(g.FinalImageOut, g.GetStableDynamicID(50000, 0));
                }
                string removed = g.CreateNode("SwarmRemBg", new JObject()
                {
                    ["images"] = g.FinalImageOut
                });
                g.FinalImageOut = [removed, 0];
            }
            if (g.UserInput.SourceSession is null && g.UserInput.Get(T2IParamTypes.DoNotSave, false) && g.UserInput.Get(T2IParamTypes.Steps) == 0 && !g.UserInput.TryGet(T2IParamTypes.RefinerModel, out _))
            {
                // We don't actually want an image we're just aggressively loading a model or something
            }
            else
            {
                if (g.IsVideoModel())
                {
                    if (g.UserInput.TryGet(T2IParamTypes.TrimVideoStartFrames, out _) || g.UserInput.TryGet(T2IParamTypes.TrimVideoEndFrames, out _))
                    {
                        string trimNode = g.CreateNode("SwarmTrimFrames", new JObject()
                        {
                            ["image"] = g.FinalImageOut,
                            ["trim_start"] = g.UserInput.Get(T2IParamTypes.TrimVideoStartFrames, 0),
                            ["trim_end"] = g.UserInput.Get(T2IParamTypes.TrimVideoEndFrames, 0)
                        });
                        g.FinalImageOut = [trimNode, 0];
                    }
                    if (g.UserInput.TryGet(ComfyUIBackendExtension.Text2VideoFrameInterpolationMethod, out string method) && g.UserInput.TryGet(ComfyUIBackendExtension.Text2VideoFrameInterpolationMultiplier, out int mult) && mult > 1)
                    {
                        if (g.UserInput.Get(T2IParamTypes.SaveIntermediateImages, false))
                        {
                            g.CreateNode("SwarmSaveAnimationWS", new JObject()
                            {
                                ["images"] = g.FinalImageOut,
                                ["fps"] = g.Text2VideoFPS(),
                                ["lossless"] = false,
                                ["quality"] = 95,
                                ["method"] = "default",
                                ["format"] = g.UserInput.Get(T2IParamTypes.Text2VideoFormat, "webp")
                            }, g.GetStableDynamicID(50000, 0));
                        }
                        if (method == "RIFE")
                        {
                            string rife = g.CreateNode("RIFE VFI", new JObject()
                            {
                                ["frames"] = g.FinalImageOut,
                                ["multiplier"] = mult,
                                ["ckpt_name"] = "rife47.pth",
                                ["clear_cache_after_n_frames"] = 10,
                                ["fast_mode"] = true,
                                ["ensemble"] = true,
                                ["scale_factor"] = 1
                            });
                            g.FinalImageOut = [rife, 0];
                        }
                        else if (method == "FILM")
                        {
                            string film = g.CreateNode("FILM VFI", new JObject()
                            {
                                ["frames"] = g.FinalImageOut,
                                ["multiplier"] = mult,
                                ["ckpt_name"] = "film_net_fp32.pt",
                                ["clear_cache_after_n_frames"] = 10
                            });
                            g.FinalImageOut = [film, 0];
                        }
                        int fps = g.Text2VideoFPS();
                        fps *= mult;
                        g.T2VFPSOverride = fps;
                    }
                }
                string nodeId = "9";
                if (g.UserInput.TryGet(T2IParamTypes.VideoModel, out _) || g.UserInput.Get(T2IParamTypes.Prompt, "").Contains("<extend:"))
                {
                    nodeId = "30";
                }
                g.CreateImageSaveNode(g.FinalImageOut, nodeId);
            }
        }, 10);
        #endregion
        #region Image To Video
        AddStep(g =>
        {
            if (g.UserInput.TryGet(T2IParamTypes.VideoModel, out T2IModel vidModel))
            {
                int? frames = g.UserInput.TryGet(T2IParamTypes.VideoFrames, out int framesRaw) ? framesRaw : null;
                int? videoFps = g.UserInput.TryGet(T2IParamTypes.VideoFPS, out int fpsRaw) ? fpsRaw : null;
                double? videoCfg = g.UserInput.TryGet(T2IParamTypes.VideoCFG, out double cfgRaw) ? cfgRaw : null;
                int steps = g.UserInput.Get(T2IParamTypes.VideoSteps, 20);
                string format = g.UserInput.Get(T2IParamTypes.VideoFormat, "webp").ToLowerFast();
                string resFormat = g.UserInput.Get(T2IParamTypes.VideoResolution, "Model Preferred");
                long seed = g.UserInput.Get(T2IParamTypes.Seed) + 42;
                string prompt = g.UserInput.Get(T2IParamTypes.Prompt, "");
                string negPrompt = g.UserInput.Get(T2IParamTypes.NegativePrompt, "");
                int batchInd = -1, batchLen = -1;
                if (g.UserInput.TryGet(T2IParamTypes.Video2VideoCreativity, out _))
                {
                    batchInd = 0;
                    batchLen = 1;
                }
                int width = vidModel.StandardWidth <= 0 ? 1024 : vidModel.StandardWidth;
                int height = vidModel.StandardHeight <= 0 ? 576 : vidModel.StandardHeight;
                int imageWidth = g.UserInput.GetImageWidth();
                int imageHeight = g.UserInput.GetImageHeight();
                int resPrecision = 64;
                if (vidModel.ModelClass?.CompatClass == "hunyuan-video")
                {
                    resPrecision = 16; // wants 720x720, which is wonky x16 and not x32 or x64
                }
                if (resFormat == "Image Aspect, Model Res")
                {
                    if (width == 1024 && height == 576 && imageWidth == 1344 && imageHeight == 768)
                    {
                        width = 1024;
                        height = 576;
                    }
                    else
                    {
                        (width, height) = Utilities.ResToModelFit(imageWidth, imageHeight, width * height, resPrecision);
                    }
                }
                else if (resFormat == "Image")
                {
                    width = imageWidth;
                    height = imageHeight;
                }
                (JArray, int) altLatent(JArray vae, JArray latent)
                {
                    int startStep = 0;
                    if (g.UserInput.TryGet(T2IParamTypes.Video2VideoCreativity, out double v2vCreativity))
                    {
                        string fromBatch = g.CreateNode("ImageFromBatch", new JObject()
                        {
                            ["image"] = g.FinalImageOut,
                            ["batch_index"] = 0,
                            ["length"] = frames.Value
                        });
                        startStep = (int)Math.Floor(steps * (1 - v2vCreativity));
                        string reEncode = g.CreateNode("VAEEncode", new JObject()
                        {
                            ["vae"] = vae,
                            ["pixels"] = new JArray() { fromBatch, 0 }
                        });
                        latent = [reEncode, 0];
                    }
                    return (latent, startStep);
                }
                g.CreateImageToVideo(vidModel, ref frames, videoCfg, ref videoFps, width, height, prompt, negPrompt, steps, seed, altLatent, batchInd, batchLen);
                if (g.UserInput.TryGet(ComfyUIBackendExtension.VideoFrameInterpolationMethod, out string method) && g.UserInput.TryGet(ComfyUIBackendExtension.VideoFrameInterpolationMultiplier, out int mult) && mult > 1)
                {
                    if (g.UserInput.Get(T2IParamTypes.SaveIntermediateImages, false))
                    {
                        g.CreateNode("SwarmSaveAnimationWS", new JObject()
                        {
                            ["images"] = g.FinalImageOut,
                            ["fps"] = videoFps,
                            ["lossless"] = false,
                            ["quality"] = 95,
                            ["method"] = "default",
                            ["format"] = format
                        }, g.GetStableDynamicID(50000, 0));
                    }
                    if (method == "RIFE")
                    {
                        string rife = g.CreateNode("RIFE VFI", new JObject()
                        {
                            ["frames"] = g.FinalImageOut,
                            ["multiplier"] = mult,
                            ["ckpt_name"] = "rife47.pth",
                            ["clear_cache_after_n_frames"] = 10,
                            ["fast_mode"] = true,
                            ["ensemble"] = true,
                            ["scale_factor"] = 1
                        });
                        g.FinalImageOut = [rife, 0];
                    }
                    else if (method == "FILM")
                    {
                        string film = g.CreateNode("FILM VFI", new JObject()
                        {
                            ["frames"] = g.FinalImageOut,
                            ["multiplier"] = mult,
                            ["ckpt_name"] = "film_net_fp32.pt",
                            ["clear_cache_after_n_frames"] = 10
                        });
                        g.FinalImageOut = [film, 0];
                    }
                    videoFps *= mult;
                }
                if (g.UserInput.Get(T2IParamTypes.VideoBoomerang, false))
                {
                    string bounced = g.CreateNode("SwarmVideoBoomerang", new JObject()
                    {
                        ["images"] = g.FinalImageOut
                    });
                    g.FinalImageOut = [bounced, 0];
                }
                string nodeId = "9";
                if (prompt.Contains("<extend:"))
                {
                    nodeId = $"{g.GetStableDynamicID(50000, 0)}";
                }
                g.CreateNode("SwarmSaveAnimationWS", new JObject()
                {
                    ["images"] = g.FinalImageOut,
                    ["fps"] = videoFps,
                    ["lossless"] = false,
                    ["quality"] = 95,
                    ["method"] = "default",
                    ["format"] = format
                }, nodeId);
            }
        }, 11);
        #endregion
        #region Extend Video
        AddStep(g =>
        {
            string fullRawPrompt = g.UserInput.Get(T2IParamTypes.Prompt, "");
            if (fullRawPrompt.Contains("<extend:"))
            {
                string negPrompt = g.UserInput.Get(T2IParamTypes.NegativePrompt, "");
                double cfg = g.UserInput.Get(T2IParamTypes.CFGScale, 7);
                int steps = g.UserInput.Get(T2IParamTypes.Steps, 20);
                long seed = g.UserInput.Get(T2IParamTypes.Seed) + 600;
                int? videoFps = g.UserInput.TryGet(T2IParamTypes.VideoFPS, out int fpsRaw) ? fpsRaw : null;
                string format = g.UserInput.Get(T2IParamTypes.VideoExtendFormat, "webp").ToLowerFast();
                int frameExtendOverlap = g.UserInput.Get(T2IParamTypes.VideoExtendFrameOverlap, 9);
                bool saveIntermediate = g.UserInput.Get(T2IParamTypes.SaveIntermediateImages, false);
                T2IModel extendModel = g.UserInput.Get(T2IParamTypes.VideoExtendModel, null) ?? throw new SwarmUserErrorException("You have an '<extend:' block in your prompt, but you don't have a 'Video Extend Model' selected.");
                PromptRegion regionalizer = new(fullRawPrompt);
                List<JArray> vidChunks = [g.FinalImageOut];
                JArray conjoinedLast = g.FinalImageOut;
                string getWidthNode = g.CreateNode("SwarmImageWidth", new JObject()
                {
                    ["image"] = g.FinalImageOut
                });
                JArray width = [getWidthNode, 0];
                string getHeightNode = g.CreateNode("SwarmImageHeight", new JObject()
                {
                    ["image"] = g.FinalImageOut
                });
                JArray height = [getHeightNode, 0];
                PromptRegion.Part[] parts = [.. regionalizer.Parts.Where(p => p.Type == PromptRegion.PartType.Extend)];
                for (int i = 0; i < parts.Length; i++)
                {
                    PromptRegion.Part part = parts[i];
                    seed++;
                    int? frames = int.Parse(part.DataText);
                    string prompt = part.Prompt;
                    string frameCountNode = g.CreateNode("SwarmCountFrames", new JObject()
                    {
                        ["image"] = g.FinalImageOut
                    });
                    JArray frameCount = [frameCountNode, 0];
                    string fromEndCountNode = g.CreateNode("SwarmIntAdd", new JObject()
                    {
                        ["a"] = frameCount,
                        ["b"] = -frameExtendOverlap
                    });
                    JArray fromEndCount = [fromEndCountNode, 0];
                    string partialBatchNode = g.CreateNode("ImageFromBatch", new JObject()
                    {
                        ["image"] = g.FinalImageOut,
                        ["batch_index"] = fromEndCount,
                        ["length"] = frameExtendOverlap
                    });
                    JArray partialBatch = [partialBatchNode, 0];
                    g.FinalImageOut = partialBatch;
                    g.CreateImageToVideo(extendModel, ref frames, cfg, ref videoFps, width, height, prompt, negPrompt, steps, seed, null, 0, frameExtendOverlap);
                    if (saveIntermediate)
                    {
                        g.CreateNode("SwarmSaveAnimationWS", new JObject()
                        {
                            ["images"] = g.FinalImageOut,
                            ["fps"] = videoFps,
                            ["lossless"] = false,
                            ["quality"] = 95,
                            ["method"] = "default",
                            ["format"] = format
                        }, $"{g.GetStableDynamicID(50000, 0)}");
                    }
                    string cutNode = g.CreateNode("ImageFromBatch", new JObject()
                    {
                        ["image"] = g.FinalImageOut,
                        ["batch_index"] = frameExtendOverlap,
                        ["length"] = frameCount
                    });
                    JArray cut = [cutNode, 0];
                    g.FinalImageOut = cut;
                    vidChunks.Add(g.FinalImageOut);
                    string batchedNode = g.CreateNode("ImageBatch", new JObject()
                    {
                        ["image1"] = conjoinedLast,
                        ["image2"] = g.FinalImageOut
                    });
                    conjoinedLast = [batchedNode, 0];
                }
                g.FinalImageOut = conjoinedLast;
                g.CreateNode("SwarmSaveAnimationWS", new JObject()
                {
                    ["images"] = g.FinalImageOut,
                    ["fps"] = videoFps,
                    ["lossless"] = false,
                    ["quality"] = 95,
                    ["method"] = "default",
                    ["format"] = format
                }, "9");
            }
        }, 12);
        #endregion
        #region Post-Cleanup
        AddStep(g =>
        {
            g.RunOnNodesOfClass("SwarmKSampler", (id, data) =>
            {
                if (data["inputs"]["start_at_step"].Value<int>() >= data["inputs"]["steps"].Value<int>())
                {
                    g.ReplaceNodeConnection([id, 0], data["inputs"]["latent_image"] as JArray);
                    g.Workflow.Remove(id);
                }
            });
            g.RunOnNodesOfClass("VAEDecode", (id, data) =>
            {
                JArray source = data["inputs"]["samples"] as JArray;
                string sourceNode = $"{source[0]}";
                JObject actualNode = g.Workflow[sourceNode] as JObject;
                if ($"{actualNode["class_type"]}" == "VAEEncode")
                {
                    // (VAE is almost definitely the same but check to be safe)
                    JArray myVae = data["inputs"]["vae"] as JArray;
                    JArray srcVae = actualNode["inputs"]["vae"] as JArray;
                    if ($"{myVae[0]}" == $"{srcVae[0]}" && $"{myVae[1]}" == $"{srcVae[1]}")
                    {
                        JArray srcImage = actualNode["inputs"]["pixels"] as JArray;
                        g.ReplaceNodeConnection([id, 0], srcImage);
                        g.Workflow.Remove(id);
                    }
                }
            });
            g.RemoveClassIfUnused("VAEEncode");
            g.RemoveClassIfUnused("CLIPTextEncode");
        }, 200);
        #endregion
    }
}
