using System;
using System.Text;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using Newtonsoft.Json.Linq;
using FreneticUtilities.FreneticExtensions;

namespace SwarmUI.Builtin_ComfyUIBackend;

public partial class WorkflowGenerator
{
    /// <summary>
    /// Map of model architecture IDs to Func(int width, int height, int batchSize, string id = null) => WGNodeData.
    /// Used for custom model classes to implement <see cref="CreateEmptyImage"/>
    /// </summary>
    public static Dictionary<string, Func<int, int, int, string, WGNodeData>> EmptyImageCreators = [];

    public bool IsModelCompatClass(T2IModelCompatClass targetClazz)
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz == targetClazz.ID;
    }

    /// <summary>Returns true if the current model is Stable Cascade.</summary>
    public bool IsCascade() => IsModelCompatClass(T2IModelClassSorter.CompatCascade);

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
    public bool IsMochi() => IsModelCompatClass(T2IModelClassSorter.CompatGenmoMochi);

    /// <summary>Returns true if the current model is Lightricks LTX Video.</summary>
    public bool IsLTXV() => IsModelCompatClass(T2IModelClassSorter.CompatLtxv);

    /// <summary>Returns true if the current model is Lightricks LTX Video 2.</summary>
    public bool IsLTXV2() => IsModelCompatClass(T2IModelClassSorter.CompatLtxv2);

    /// <summary>Returns true if the current model is Black Forest Labs' Flux.1.</summary>
    public bool IsFlux() => IsModelCompatClass(T2IModelClassSorter.CompatFlux);

    /// <summary>Returns true if the current model is Black Forest Labs' Flux.2 Dev.</summary>
    public bool IsFlux2Dev() => IsModelCompatClass(T2IModelClassSorter.CompatFlux2);

    /// <summary>Returns true if the current model is Black Forest Labs' Flux.2 Klein (4B).</summary>
    public bool IsFlux2Klein4B() => IsModelCompatClass(T2IModelClassSorter.CompatFlux2Klein4B);

    /// <summary>Returns true if the current model is Black Forest Labs' Flux.2 Klein (9B).</summary>
    public bool IsFlux2Klein9B() => IsModelCompatClass(T2IModelClassSorter.CompatFlux2Klein9B);

    /// <summary>Returns true if the current model is any Black Forest Labs' Flux.2 variant.</summary>
    public bool IsAnyFlux2() => IsFlux2Dev() || IsFlux2Klein4B() || IsFlux2Klein9B();

    /// <summary>Returns true if the current model is AuraFlow.</summary>
    public bool IsAuraFlow() => IsModelCompatClass(T2IModelClassSorter.CompatAuraFlow);

    /// <summary>Returns true if the current model is Anima.</summary>
    public bool IsAnima() => IsModelCompatClass(T2IModelClassSorter.CompatAnima);

    /// <summary>Returns true if the current model is a Kontext model (eg Flux.1 Kontext Dev).</summary>
    public bool IsKontext()
    {
        string clazz = CurrentModelClass()?.ID;
        return clazz is not null && clazz.EndsWith("/kontext");
    }

    /// <summary>Returns true if the current model is Chroma.</summary>
    public bool IsChroma() => IsModelCompatClass(T2IModelClassSorter.CompatChroma);

    /// <summary>Returns true if the current model is Chroma Radiance.</summary>
    public bool IsChromaRadiance() => IsModelCompatClass(T2IModelClassSorter.CompatChromaRadiance);

    /// <summary>Returns true if the current model is HiDream-i1.</summary>
    public bool IsHiDream() => IsModelCompatClass(T2IModelClassSorter.CompatHiDreamI1);

    /// <summary>Returns true if the current model supports Flux Guidance.</summary>
    public bool HasFluxGuidance()
    {
        return (IsFlux() && CurrentModelClass()?.ID != "Flux.1-schnell") || IsAnyFlux2() || IsHunyuanVideo();
    }

    /// <summary>Returns true if the current model is NVIDIA Sana.</summary>
    public bool IsSana() => IsModelCompatClass(T2IModelClassSorter.CompatSana);

    /// <summary>Returns true if the current model is Alpha-VLLM's Lumina 2.</summary>
    public bool IsLumina() => IsModelCompatClass(T2IModelClassSorter.CompatLumina2);

    /// <summary>Returns true if the current model is a Z-Image model.</summary>
    public bool IsZImage() => IsModelCompatClass(T2IModelClassSorter.CompatZImage);

    /// <summary>Returns true if the current model is an Ovis model.</summary>
    public bool IsOvis() => IsModelCompatClass(T2IModelClassSorter.CompatOvis);

    /// <summary>Returns true if the current model is OmniGen.</summary>
    public bool IsOmniGen()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz.StartsWith("omnigen-");
    }

    /// <summary>Returns true if the current model is Qwen Image.</summary>
    public bool IsQwenImage()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz.StartsWith("qwen-image");
    }

    /// <summary>Returns true if the current model is Qwen Image Edit.</summary>
    public bool IsQwenImageEdit()
    {
        string clazz = CurrentModelClass()?.ID;
        return clazz is not null && clazz.StartsWith("qwen-image-edit");
    }

    /// <summary>Returns true if the current model is Qwen Image Edit Plus.</summary>
    public bool IsQwenImageEditPlus()
    {
        string clazz = CurrentModelClass()?.ID;
        return clazz is not null && clazz.StartsWith("qwen-image-edit-plus");
    }

    /// <summary>Returns true if the current model is Hunyuan Video (original / v1).</summary>
    public bool IsHunyuanVideo() => IsModelCompatClass(T2IModelClassSorter.CompatHunyuanVideo);

    /// <summary>Returns true if the current model is Hunyuan Video 1.5.</summary>
    public bool IsHunyuanVideo15() => IsModelCompatClass(T2IModelClassSorter.CompatHunyuanVideo1_5);

    /// <summary>Returns true if the current model is Hunyuan Video 1.5 SuperResolution.</summary>
    public bool IsHunyuanVideo15SR()
    {
        string clazz = CurrentModelClass()?.ID;
        return clazz is not null && clazz.StartsWith("hunyuan-video-1_5-sr");
    }

    /// <summary>Returns true if the current model is Hunyuan Image 2.1 Base.</summary>
    public bool IsHunyuanImage() => IsModelCompatClass(T2IModelClassSorter.CompatHunyuanImage2_1);

    /// <summary>Returns true if the current model is Hunyuan Image 2.1 Refiner.</summary>
    public bool IsHunyuanImageRefiner() => IsModelCompatClass(T2IModelClassSorter.CompatHunyuanImage2_1Refiner);

    /// <summary>Returns true if the current model is Hunyuan Video Image2Video.</summary>
    public bool IsHunyuanVideoI2V()
    {
        string clazz = CurrentModelClass()?.ID;
        return clazz is not null && (clazz == "hunyuan-video-i2v" || clazz == "hunyuan-video-i2v-v2");
    }

    /// <summary>Returns true if the current model is Hunyuan Video - Skyreels.</summary>
    public bool IsHunyuanVideoSkyreels()
    {
        string clazz = CurrentModelClass()?.ID;
        return clazz is not null && (clazz == "hunyuan-video-skyreels" || clazz == "hunyuan-video-skyreels-i2v");
    }

    /// <summary>Returns true if the current model is Nvidia Cosmos v1.</summary>
    public bool IsNvidiaCosmos1() => IsModelCompatClass(T2IModelClassSorter.CompatCosmos);

    /// <summary>Returns true if the current model is Nvidia Cosmos v2.</summary>
    public bool IsNvidiaCosmos2()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz.StartsWith("nvidia-cosmos-predict2");
    }

    /// <summary>Returns true if the current model is Kandinsky 5 Image Lite.</summary>
    public bool IsKandinsky5ImgLite() => IsModelCompatClass(T2IModelClassSorter.CompatKandinsky5ImgLite);

    /// <summary>Returns true if the current model is Kandinsky 5 Video Lite.</summary>
    public bool IsKandinsky5VidLite() => IsModelCompatClass(T2IModelClassSorter.CompatKandinsky5VidLite);

    /// <summary>Returns true if the current model is Kandinsky 5 Video Pro.</summary>
    public bool IsKandinsky5VidPro() => IsModelCompatClass(T2IModelClassSorter.CompatKandinsky5VidPro);

    /// <summary>Returns true if the current model is any Kandinsky 5 variant.</summary>
    public bool IsKandinsky5() => IsKandinsky5ImgLite() || IsKandinsky5VidLite() || IsKandinsky5VidPro();

    /// <summary>Returns true if the current model is any Wan-2.1 variant.</summary>
    public bool IsWanVideo()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz.StartsWith("wan-21");
    }

    /// <summary>Returns true if the current model is any Wan-2.2 variant.</summary>
    public bool IsWanVideo22()
    {
        string clazz = CurrentCompatClass();
        return clazz is not null && clazz.StartsWith("wan-22");
    }

    /// <summary>Returns true if the current model is any Wan-2.1 VACE variant.</summary>
    public bool IsWanVace()
    {
        string clazz = CurrentModelClass()?.ID;
        return clazz is not null && clazz.StartsWith("wan-2_1-vace-");
    }

    /// <summary>Returns true if the current model is any Wan variant.</summary>
    public bool IsAnyWanModel()
    {
        return IsWanVideo() || IsWanVideo22();
    }

    /// <summary>Returns true if the current main text input model model is a Video model (as opposed to image).</summary>
    public bool IsVideoModel()
    {
        return IsLTXV() || IsLTXV2() || IsMochi() || IsHunyuanVideo() || IsHunyuanVideo15() || IsNvidiaCosmos1() || IsAnyWanModel() || IsKandinsky5VidLite() || IsKandinsky5VidPro();
    }

    /// <summary>Returns true if the current model is Ace Step 1.5.</summary>
    public bool IsAceStep15()
    {
        return IsModelCompatClass(T2IModelClassSorter.CompatAceStep15);
    }

    /// <summary>Returns true if the current model primarily operates on audio.</summary>
    public bool IsAudioModel()
    {
        return CurrentCompat()?.IsAudioModel ?? false;
    }

    /// <summary>Creates an Empty Latent Image node.</summary>
    public string CreateEmptyImage(int width, int height, int batchSize, string id = null)
    {
        return EmptyImage(width, height, batchSize, id).Path[0].ToString();
    }

    /// <summary>Creates an Empty Latent Image node.</summary>
    public WGNodeData EmptyImage(int width, int height, int batchSize, string id = null)
    {
        if (EmptyImageCreators.TryGetValue(CurrentModelClass()?.ID ?? "", out Func<int, int, int, string, WGNodeData> creator))
        {
            return creator(width, height, batchSize, id);
        }
        WGNodeData resultImage(string node) => new([node, 0], this, WGNodeData.DT_LATENT_IMAGE, CurrentCompat()) { Width = width, Height = height };
        WGNodeData resultVideo(string node, int frames) => new([node, 0], this, WGNodeData.DT_LATENT_VIDEO, CurrentCompat()) { Width = width, Height = height, Frames = frames };
        WGNodeData resultAudio(string node) => new([node, 0], this, WGNodeData.DT_LATENT_AUDIO, CurrentCompat());
        if (IsCascade())
        {
            return resultImage(CreateNode("StableCascade_EmptyLatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["compression"] = UserInput.Get(T2IParamTypes.CascadeLatentCompression, 32),
                ["height"] = height,
                ["width"] = width
            }, id));
        }
        else if (IsAnyFlux2())
        {
            return resultImage(CreateNode("EmptyFlux2LatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width
            }, id));
        }
        else if (IsSD3() || IsFlux() || IsHiDream() || IsChroma() || IsOmniGen() || IsQwenImage() || IsZImage() || IsOvis() || IsKandinsky5ImgLite() || IsAnima())
        {
            return resultImage(CreateNode("EmptySD3LatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width
            }, id));
        }
        else if (IsHunyuanImage() || IsHunyuanImageRefiner())
        {
            return resultImage(CreateNode("EmptyHunyuanImageLatent", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width
            }, id));
        }
        else if (IsSana())
        {
            return resultImage(CreateNode("EmptySanaLatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width
            }, id));
        }
        else if (IsMochi())
        {
            int frames = UserInput.Get(T2IParamTypes.Text2VideoFrames, 25);
            return resultVideo(CreateNode("EmptyMochiLatentVideo", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = frames,
                ["height"] = height,
                ["width"] = width
            }, id), frames);
        }
        else if (IsLTXV())
        {
            int frames = UserInput.Get(T2IParamTypes.Text2VideoFrames, 97);
            return resultVideo(CreateNode("EmptyLTXVLatentVideo", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = frames,
                ["height"] = height,
                ["width"] = width
            }, id), frames);
        }
        else if (IsLTXV2())
        {
            int frames = UserInput.Get(T2IParamTypes.Text2VideoFrames, 97);
            int fps = UserInput.Get(T2IParamTypes.VideoFPS, 24);
            string emptyVideo = CreateNode("EmptyLTXVLatentVideo", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = frames,
                ["height"] = height,
                ["width"] = width
            }, id);
            string emptyAudio = CreateNode("LTXVEmptyLatentAudio", new JObject()
            {
                ["batch_size"] = batchSize,
                ["frames_number"] = frames,
                ["frame_rate"] = fps,
                ["audio_vae"] = CurrentAudioVae.Path
            });
            WGNodeData attachAudio = new([emptyAudio, 0], this, WGNodeData.DT_LATENT_AUDIO, CurrentCompat());
            return new([emptyVideo, 0], this, WGNodeData.DT_LATENT_VIDEO, CurrentCompat()) { Width = width, Height = height, Frames = frames, FPS = fps, AttachedAudio = attachAudio };
        }
        else if (IsAceStep15())
        {
            return resultAudio(CreateNode("EmptyAceStep1.5LatentAudio", new JObject()
            {
                ["batch_size"] = batchSize,
                ["seconds"] = UserInput.Get(T2IParamTypes.Text2AudioDuration, 120)
            }, id));
        }
        else if (IsWanVideo22())
        {
            int frames = UserInput.Get(T2IParamTypes.Text2VideoFrames, 81);
            return resultVideo(CreateNode("Wan22ImageToVideoLatent", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = frames,
                ["height"] = height,
                ["width"] = width,
                ["vae"] = CurrentVae.Path
            }, id), frames);
        }
        else if (IsHunyuanVideo15())
        {
            int frames = UserInput.Get(T2IParamTypes.Text2VideoFrames, 73);
            return resultVideo(CreateNode("EmptyHunyuanVideo15Latent", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = frames,
                ["height"] = height,
                ["width"] = width
            }, id), frames);
        }
        else if (IsHunyuanVideo() || IsWanVideo() || IsKandinsky5VidLite() || IsKandinsky5VidPro())
        {
            int frames = 73;
            if (IsWanVideo())
            {
                frames = 81;
            }
            frames = IsKandinsky5ImgLite() ? 1 : UserInput.Get(T2IParamTypes.Text2VideoFrames, frames);
            return resultVideo(CreateNode("EmptyHunyuanLatentVideo", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = frames,
                ["height"] = height,
                ["width"] = width
            }, id), frames);
        }
        else if (IsNvidiaCosmos1())
        {
            int frames = UserInput.Get(T2IParamTypes.Text2VideoFrames, 121);
            return resultVideo(CreateNode("EmptyCosmosLatentVideo", new JObject()
            {
                ["batch_size"] = batchSize,
                ["length"] = frames,
                ["height"] = height,
                ["width"] = width
            }, id), frames);
        }
        else if (IsChromaRadiance())
        {
            return resultImage(CreateNode("EmptyChromaRadianceLatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width
            }, id));
        }
        else if (UserInput.Get(ComfyUIBackendExtension.ShiftedLatentAverageInit, false))
        {
            double offA = 0, offB = 0, offC = 0, offD = 0;
            switch (FinalLoadedModel.ModelClass?.CompatClass?.ID)
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
            return resultImage(CreateNode("SwarmOffsetEmptyLatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width,
                ["off_a"] = offA,
                ["off_b"] = offB,
                ["off_c"] = offC,
                ["off_d"] = offD
            }, id));
        }
        else
        {
            return resultImage(CreateNode("EmptyLatentImage", new JObject()
            {
                ["batch_size"] = batchSize,
                ["height"] = height,
                ["width"] = width
            }, id));
        }
    }

    public class ModelLoadHelpers(WorkflowGenerator g)
    {
        public void DoVaeLoader(string defaultVal, T2IModelCompatClass compatClass, string knownName)
        {
            DoVaeLoader(defaultVal, compatClass?.ID, knownName);
        }

        public void DoVaeLoader(string defaultVal, string compatClass, string knownName)
        {
            string vaeFile = defaultVal;
            string nodeId = null;
            CommonModels.ModelInfo knownFile = knownName is null ? null : CommonModels.Known[knownName];
            if (!g.NoVAEOverride && g.UserInput.TryGet(T2IParamTypes.VAE, out T2IModel vaeModel))
            {
                vaeFile = vaeModel.Name;
                nodeId = "11";
            }
            if (vaeFile == "None")
            {
                vaeFile = null;
            }
            if (string.IsNullOrWhiteSpace(vaeFile) && knownFile is not null && Program.T2IModelSets["VAE"].Models.ContainsKey(knownFile.FileName))
            {
                vaeFile = knownFile.FileName;
            }
            if (string.IsNullOrWhiteSpace(vaeFile))
            {
                vaeModel = compatClass is null ? null : Program.T2IModelSets["VAE"].Models.Values.FirstOrDefault(m => m.ModelClass?.CompatClass?.ID == compatClass);
                if (vaeModel is not null)
                {
                    Logs.Debug($"Auto-selected first available VAE of compat class '{compatClass}', VAE '{vaeModel.Name}' will be applied");
                    vaeFile = vaeModel.Name;
                }
            }
            if (string.IsNullOrWhiteSpace(vaeFile))
            {
                if (knownFile is null)
                {
                    throw new SwarmUserErrorException("No default VAE for this model found, please download its VAE and set it as default in User Settings");
                }
                vaeFile = knownFile.FileName;
                knownFile.DownloadNow().Wait();
                Program.RefreshAllModelSets();
            }
            g.LoadingVAE = g.CreateVAELoader(vaeFile, nodeId);
        }

        public void AudioVaeLoad(string ckpt)
        {
            string avaeLoader = g.CreateNode("LTXVAudioVAELoader", new JObject()
            {
                ["ckpt_name"] = ckpt
            });
            g.CurrentAudioVae = new WGNodeData([avaeLoader, 0], g, WGNodeData.DT_AUDIOVAE, g.CurrentCompat());
        }

        public string RequireClipModel(string name, string url, string hash, T2IRegisteredParam<T2IModel> param)
        {
            if (param is not null && g.UserInput.TryGet(param, out T2IModel model))
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
            string filePath = $"{Program.T2IModelSets["Clip"].DownloadFolderPath}/{name}";
            g.DownloadModel(name, filePath, url, hash);
            ClipModelsValid.TryAdd(name, name);
            return name;
        }

        public string GetT5XXLModel()
        {
            return RequireClipModel("t5xxl_enconly.safetensors", "https://huggingface.co/mcmonkey/google_t5-v1_1-xxl_encoderonly/resolve/main/t5xxl_fp8_e4m3fn.safetensors", "7d330da4816157540d6bb7838bf63a0f02f573fc48ca4d8de34bb0cbfd514f09", T2IParamTypes.T5XXLModel);
        }

        public string GetOldT5XXLModel()
        {
            return RequireClipModel("old_t5xxl_cosmos.safetensors", "https://huggingface.co/comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI/resolve/main/text_encoders/oldt5_xxl_fp8_e4m3fn_scaled.safetensors", "1d0dd711ec9866173d4b39e86db3f45e1614a4e3f84919556f854f773352ea81", T2IParamTypes.T5XXLModel);
        }

        public string GetUniMaxT5XXLModel()
        {
            return RequireClipModel("umt5_xxl_fp8_e4m3fn_scaled.safetensors", "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors", "c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68", T2IParamTypes.T5XXLModel);
        }

        public string GetByT5SmallGlyphxl_tenc()
        {
            return RequireClipModel("byt5_small_glyphxl_fp16.safetensors", "https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/resolve/main/split_files/text_encoders/byt5_small_glyphxl_fp16.safetensors", "516910bb4c9b225370290e40585d1b0e6c8cd3583690f7eec2f7fb593990fb48", T2IParamTypes.T5XXLModel);
        }

        public string GetPileT5XLAuraFlow()
        {
            return RequireClipModel("pile_t5xl_auraflow.safetensors", "https://huggingface.co/fal/AuraFlow-v0.2/resolve/main/text_encoder/model.safetensors", "0a07449cf1141c0ec86e653c00465f6f0d79c6e58a2c60c8bcf4203d0e4ec4f6", T2IParamTypes.T5XXLModel);
        }
        public string GetOmniQwenModel()
        {
            return RequireClipModel("qwen_2.5_vl_fp16.safetensors", "https://huggingface.co/Comfy-Org/Omnigen2_ComfyUI_repackaged/resolve/main/split_files/text_encoders/qwen_2.5_vl_fp16.safetensors", "ba05dd266ad6a6aa90f7b2936e4e775d801fb233540585b43933647f8bc4fbc3", T2IParamTypes.QwenModel);
        }

        public string GetQwenImage25_7b_tenc()
        {
            return RequireClipModel("qwen_2.5_vl_7b_fp8_scaled.safetensors", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors", "cb5636d852a0ea6a9075ab1bef496c0db7aef13c02350571e388aea959c5c0b4", T2IParamTypes.QwenModel);
        }

        public string GetQwen3_600mModel()
        {
            return RequireClipModel("qwen_3_600m.safetensors", "https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/text_encoders/qwen_3_06b_base.safetensors", "cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba", T2IParamTypes.QwenModel);
        }

        public string GetQwen3_4bModel()
        {
            return RequireClipModel("qwen_3_4b.safetensors", "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b_fp8_mixed.safetensors", "72450b19758172c5a7273cf7de729d1c17e7f434a104a00167624cba94f68f15", T2IParamTypes.QwenModel);
        }

        public string GetQwen3_8bModel()
        {
            return RequireClipModel("qwen_3_8b.safetensors", "https://huggingface.co/Comfy-Org/flux2-klein-9B/resolve/main/split_files/text_encoders/qwen_3_8b_fp4mixed.safetensors", "bbf16f981d98e16d080c566134814c4e9f6aadd0d0e1383c60bc44ba939d760d", T2IParamTypes.QwenModel);
        }

        public string GetOvisQwenModel()
        {
            return RequireClipModel("ovis_2.5.safetensors", "https://huggingface.co/Comfy-Org/Ovis-Image/resolve/main/split_files/text_encoders/ovis_2.5.safetensors", "f453ee5e7a25cb23cf2adf7aae3e5b405f22097cb67f2cfcca029688cb3f740d", T2IParamTypes.QwenModel);
        }

        public string GetMistralFlux2Model()
        {
            return RequireClipModel("mistral_3_small_flux2.safetensors", "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/text_encoders/mistral_3_small_flux2_fp4_mixed.safetensors", "1ee1ff334d78228d73049ef0ee4fcd21c1700536b5a45c06547af057f92463a7", T2IParamTypes.MistralModel);
        }

        public string GetClipLModel()
        {
            if (g.UserInput.TryGet(T2IParamTypes.ClipLModel, out T2IModel model))
            {
                return model.Name;
            }
            if (Program.T2IModelSets["Clip"].Models.ContainsKey("clip_l_sdxl_base.safetensors"))
            {
                return "clip_l_sdxl_base.safetensors";
            }
            return RequireClipModel("clip_l.safetensors", "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/text_encoder/model.fp16.safetensors", "660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd", T2IParamTypes.ClipLModel);
        }

        public string GetClipGModel()
        {
            if (g.UserInput.TryGet(T2IParamTypes.ClipGModel, out T2IModel model))
            {
                return model.Name;
            }
            if (Program.T2IModelSets["Clip"].Models.ContainsKey("clip_g_sdxl_base.safetensors"))
            {
                return "clip_g_sdxl_base.safetensors";
            }
            return RequireClipModel("clip_g.safetensors", "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/text_encoder_2/model.fp16.safetensors", "ec310df2af79c318e24d20511b601a591ca8cd4f1fce1d8dff822a356bcdb1f4", T2IParamTypes.ClipGModel);
        }

        public string GetHiDreamClipLModel()
        {
            return RequireClipModel("long_clip_l_hi_dream.safetensors", "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/resolve/main/split_files/text_encoders/clip_l_hidream.safetensors", "706fdb88e22e18177b207837c02f4b86a652abca0302821f2bfa24ac6aea4f71", T2IParamTypes.ClipLModel);
        }

        public string GetHiDreamClipGModel()
        {
            return RequireClipModel("long_clip_g_hi_dream.safetensors", "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/resolve/main/split_files/text_encoders/clip_g_hidream.safetensors", "3771e70e36450e5199f30bad61a53faae85a2e02606974bcda0a6a573c0519d5", T2IParamTypes.ClipGModel);
        }

        public string GetLlava3Model()
        {
            return RequireClipModel("llava_llama3_fp8_scaled.safetensors", "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/resolve/main/split_files/text_encoders/llava_llama3_fp8_scaled.safetensors", "2f0c3ad255c282cead3f078753af37d19099cafcfc8265bbbd511f133e7af250", T2IParamTypes.LLaVAModel);
        }

        public string GetLlama31_8b_Model()
        {
            return RequireClipModel("llama_3.1_8b_instruct_fp8_scaled.safetensors", "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/resolve/main/split_files/text_encoders/llama_3.1_8b_instruct_fp8_scaled.safetensors", "9f86897bbeb933ef4fd06297740edb8dd962c94efcd92b373a11460c33765ea6", T2IParamTypes.LLaMAModel);
        }

        public string GetGemma2Model()
        {
            return RequireClipModel("gemma_2_2b_fp16.safetensors", "https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/resolve/main/split_files/text_encoders/gemma_2_2b_fp16.safetensors", "29761442862f8d064d3f854bb6fabf4379dcff511a7f6ba9405a00bd0f7e2dbd", T2IParamTypes.GemmaModel);
        }

        public string GetGemma3_12bModel()
        {
            return RequireClipModel("gemma_3_12B_it.safetensors", "https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors", "aaca463d11e6d8d2a4bdb0d6299214c15ef78a3f73e0ef8113d5a9d0219b3f6d", T2IParamTypes.GemmaModel);
        }

        public string GetLTX2EmbedClip()
        {
            // TODO: This is cursed and wrong.
            return RequireClipModel("ltx2/ltx2-embeddings-connector-distill.safetensors", "https://huggingface.co/Kijai/LTXV2_comfy/resolve/main/text_encoders/ltx-2-19b-embeddings_connector_distill_bf16.safetensors", "8990ec3fe88396ca33ac1795c89b1771d88190e51e24084b21f54b25399acbed", null);
        }

        public void LoadClip(string type, string model)
        {
            string loaderType = "CLIPLoader";
            if (model.EndsWith(".gguf"))
            {
                loaderType = "CLIPLoaderGGUF";
            }
            string singleClipLoader = g.CreateNode(loaderType, new JObject()
            {
                ["clip_name"] = model,
                ["type"] = type,
                ["device"] = "default"
            });
            g.LoadingClip = [singleClipLoader, 0];
        }

        public void LoadClipAudio(string model, string ckpt)
        {
            string loaderType = "LTXAVTextEncoderLoader";
            string clipLoader = g.CreateNode(loaderType, new JObject()
            {
                ["text_encoder"] = model,
                ["ckpt_name"] = ckpt
            });
            g.LoadingClip = [clipLoader, 0];
        }

        public void LoadClip2(string type, string modelA, string modelB)
        {
            string loaderType = "DualCLIPLoader";
            if (modelA.EndsWith(".gguf") || modelB.EndsWith(".gguf"))
            {
                loaderType = "DualCLIPLoaderGGUF";
            }
            string dualClipLoader = g.CreateNode(loaderType, new JObject()
            {
                ["clip_name1"] = modelA,
                ["clip_name2"] = modelB,
                ["type"] = type,
                ["device"] = "default"
            });
            g.LoadingClip = [dualClipLoader, 0];
        }

        public void LoadClip3(string type, string modelA, string modelB, string modelC)
        {
            string loaderType = "TripleCLIPLoader";
            if (modelA.EndsWith(".gguf") || modelB.EndsWith(".gguf") || modelC.EndsWith(".gguf"))
            {
                loaderType = "TripleCLIPLoaderGGUF";
            }
            string tripleClipLoader = g.CreateNode(loaderType, new JObject()
            {
                ["clip_name1"] = modelA,
                ["clip_name2"] = modelB,
                ["clip_name3"] = modelC,
                //["type"] = type // not currently used as only SD3 has triple thus far
            });
            g.LoadingClip = [tripleClipLoader, 0];
        }
    }

    /// <summary>Creates a model loader and adapts it with any registered model adapters, and returns (Model, Clip, VAE).</summary>
    [Obsolete("Use CreateModelLoader instead")]
    public (T2IModel, JArray, JArray, JArray) CreateStandardModelLoader(T2IModel model, string type, string id = null, bool noCascadeFix = false, int sectionId = 0)
    {
        (T2IModel modelObj, WGNodeData modelNode, WGNodeData tencNode, WGNodeData vaeNode) = CreateModelLoader(model, type, id, noCascadeFix, sectionId);
        return (modelObj, modelNode?.Path, tencNode?.Path, vaeNode?.Path);
    }

    /// <summary>Creates a model loader and adapts it with any registered model adapters, and returns (Model, Clip, VAE).</summary>
    public (T2IModel, WGNodeData, WGNodeData, WGNodeData) CreateModelLoader(T2IModel model, string type, string id = null, bool noCascadeFix = false, int sectionId = 0)
    {
        ModelLoadHelpers helpers = new(this);
        string helper = $"modelloader_{model.Name}_{type}";
        if (NodeHelpers.TryGetValue(helper, out string alreadyLoaded))
        {
            string[] parts = alreadyLoaded.SplitFast(':');
            LoadingModel = [parts[0], int.Parse(parts[1])];
            LoadingClip = parts[2].Length == 0 ? null : [parts[2], int.Parse(parts[3])];
            LoadingVAE = parts[4].Length == 0 ? null : [parts[4], int.Parse(parts[5])];
            WGNodeData modelNode = new(LoadingModel, this, WGNodeData.DT_MODEL, CurrentCompat());
            WGNodeData tencNode = LoadingClip is null ? null : new WGNodeData(LoadingClip, this, WGNodeData.DT_TEXTENC, CurrentCompat());
            WGNodeData vaeNode = LoadingVAE is null ? null : new WGNodeData(LoadingVAE, this, WGNodeData.DT_VAE, CurrentCompat());
            return (model, modelNode, tencNode, vaeNode);
        }
        IsDifferentialDiffusion = false;
        LoadingModelType = type;
        if (!noCascadeFix && model.ModelClass?.ID == "stable-cascade-v1-stage-b" && model.Name.Contains("stage_b") && Program.MainSDModels.Models.TryGetValue(model.Name.Replace("stage_b", "stage_c"), out T2IModel altCascadeModel))
        {
            model = altCascadeModel;
        }
        LoadingModel = null;
        foreach (WorkflowGenStep step in ModelGenSteps.Where(s => s.Priority <= -100))
        {
            step.Action(this);
        }
        if (LoadingModel is not null)
        {
            // Custom action has loaded it for us.
        }
        else if (model.ModelClass?.ID.EndsWith("/tensorrt") ?? false)
        {
            string baseArch = model.ModelClass?.ID?.Before('/');
            string trtType = ComfyUIWebAPI.ArchitecturesTRTCompat[baseArch];
            string trtloader = CreateNode("TensorRTLoader", new JObject()
            {
                ["unet_name"] = model.ToString(ModelFolderFormat),
                ["model_type"] = trtType
            }, id, false);
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
        else if (model.ModelClass?.CompatClass?.ID == "pixart-ms-sigma-xl-2")
        {
            string pixartNode = CreateNode("PixArtCheckpointLoader", new JObject()
            {
                ["ckpt_name"] = model.ToString(ModelFolderFormat),
                ["model"] = model.ModelClass.ID == "pixart-ms-sigma-xl-2-2k" ? "PixArtMS_Sigma_XL_2_2K" : "PixArtMS_Sigma_XL_2"
            }, id, false);
            LoadingModel = [pixartNode, 0];
            string singleClipLoader = CreateNode("CLIPLoader", new JObject()
            {
                ["clip_name"] = helpers.GetT5XXLModel(),
                ["type"] = "sd3"
            });
            LoadingClip = [singleClipLoader, 0];
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultSDXLVAE, "stable-diffusion-xl-v1", "sdxl-vae");
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
                }, id, false);
                LoadingModel = [modelNode, 0];
            }
            else if (model.Metadata?.SpecialFormat == "nunchaku" || model.Metadata?.SpecialFormat == "nunchaku-fp4")
            {
                if (!Features.Contains("nunchaku"))
                {
                    throw new SwarmUserErrorException($"Model '{model.Name}' is in Nunchaku format, but the server does not have Nunchaku support installed. Cannot run.");
                }
                if (IsFlux())
                {
                    // TODO: Configuration of these params?
                    string modelNode = CreateNode("NunchakuFluxDiTLoader", new JObject()
                    {
                        ["model_path"] = model.Name.EndsWith("/transformer_blocks.safetensors") ? model.Name.BeforeLast('/').Replace("/", ModelFolderFormat ?? $"{Path.DirectorySeparatorChar}") : model.ToString(ModelFolderFormat),
                        ["cache_threshold"] = UserInput.Get(ComfyUIBackendExtension.NunchakuCacheThreshold, 0, sectionId: sectionId),
                        ["attention"] = "nunchaku-fp16",
                        ["cpu_offload"] = "auto",
                        ["device_id"] = 0,
                        ["data_type"] = model.Metadata?.SpecialFormat == "nunchaku-fp4" ? "bfloat16" : "float16",
                        ["i2f_mode"] = "enabled"
                    }, id, false);
                    LoadingModel = [modelNode, 0];
                }
                else if (IsQwenImage())
                {
                    string modelNode = CreateNode("NunchakuQwenImageDiTLoader", new JObject()
                    {
                        ["model_name"] = model.Name.EndsWith("/transformer_blocks.safetensors") ? model.Name.BeforeLast('/').Replace("/", ModelFolderFormat ?? $"{Path.DirectorySeparatorChar}") : model.ToString(ModelFolderFormat),
                        ["cpu_offload"] = "auto",
                        ["num_blocks_on_gpu"] = 1, // TODO: If nunchaku doesn't fix automation here, add a param. Also enable cpu_offload if the param is given.
                        ["use_pin_memory"] = "enable"
                    }, id, false);
                    LoadingModel = [modelNode, 0];
                }
                else if (IsZImage())
                {
                    string modelNode = CreateNode("NunchakuZImageDiTLoader", new JObject()
                    {
                        ["model_name"] = model.ToString(ModelFolderFormat),
                    }, id, false);
                    LoadingModel = [modelNode, 0];
                }
                else
                {
                    throw new SwarmUserErrorException($"Cannot load nunchaku for model architecture '{model.ModelClass?.ID}'. If other model architectures are supported in the Nunchaku source, please report this on the SwarmUI GitHub or Discord.");
                }
            }
            else if (model.Metadata?.SpecialFormat == "bnb_nf4" || model.Metadata?.SpecialFormat == "bnb_fp4")
            {
                if (!Features.Contains("bnb_nf4"))
                {
                    throw new SwarmUserErrorException($"Model '{model.Name}' is in BitsAndBytes-NF4 format, but the server does not have BNB_NF4 support installed. Cannot run.");
                }
                string modelNode = CreateNode("UNETLoaderNF4", new JObject()
                {
                    ["unet_name"] = model.ToString(ModelFolderFormat),
                    ["bnb_dtype"] = model.Metadata?.SpecialFormat == "bnb_fp4" ? "fp4" : "nf4"
                }, id, false);
                LoadingModel = [modelNode, 0];
            }
            else
            {
                if (model.RawFilePath.EndsWith(".gguf"))
                {
                    Logs.Error($"Model '{model.Name}' likely has corrupt/invalid metadata, and needs to be reset.");
                }
                string dtype = UserInput.Get(ComfyUIBackendExtension.PreferredDType, "automatic", sectionId: sectionId);
                if (dtype == "automatic")
                {
                    if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX)) // TODO: Or AMD?
                    {
                        dtype = "default";
                    }
                    else if (model.Metadata?.SpecialFormat == "fp8_scaled")
                    {
                        dtype = "default";
                    }
                    else if (IsNvidiaCosmos2() || IsOmniGen() || IsChroma() || IsChromaRadiance()) // Obligatory due to model issues
                    {
                        dtype = "default";
                    }
                    else if (IsZImage() || IsAnima()) // Model is small and dense, so trust user preferred download format
                    {
                        dtype = "default";
                    }
                    else
                    {
                        dtype = "fp8_e4m3fn";
                        if (Utilities.PresumeNVidia30xx && Program.ServerSettings.Performance.AllowGpuSpecificOptimizations && !IsQwenImage())
                        {
                            dtype = "fp8_e4m3fn_fast";
                        }
                    }
                }
                string modelNode = CreateNode("UNETLoader", new JObject()
                {
                    ["unet_name"] = model.ToString(ModelFolderFormat),
                    ["weight_dtype"] = dtype
                }, id, false);
                LoadingModel = [modelNode, 0];
            }
            LoadingClip = null;
            LoadingVAE = null;
        }
        else if (model.Metadata?.SpecialFormat == "bnb_nf4" || model.Metadata?.SpecialFormat == "bnb_fp4")
        {
            if (!Features.Contains("bnb_nf4"))
            {
                throw new SwarmUserErrorException($"Model '{model.Name}' is in BitsAndBytes-NF4 format, but the server does not have BNB_NF4 support installed. Cannot run.");
            }
            string modelNode = CreateNode("CheckpointLoaderNF4", new JObject()
            {
                ["ckpt_name"] = model.ToString(ModelFolderFormat),
                ["bnb_dtype"] = model.Metadata?.SpecialFormat == "bnb_fp4" ? "fp4" : "nf4"
            }, id, false);
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
            }, id, false);
            LoadingModel = [sanaNode, 0];
            string clipLoader = CreateNode("GemmaLoader", new JObject()
            {
                ["model_name"] = "unsloth/gemma-2-2b-it-bnb-4bit",
                ["device"] = "cpu",
                ["dtype"] = "default"
            });
            LoadingClip = [clipLoader, 0];
            helpers.DoVaeLoader(null, "nvidia-sana-1600", "sana-dcae");
        }
        else
        {
            if (model.Metadata?.SpecialFormat == "gguf")
            {
                throw new SwarmUserErrorException($"Model '{model.Name}' is in GGUF format, but it's in your main Stable-Diffusion models folder. GGUF files are weird, and need to go in the special 'diffusion_models' folder.");
            }
            if (model.Metadata?.SpecialFormat == "nunchaku" || model.Metadata?.SpecialFormat == "nunchaku-fp4")
            {
                throw new SwarmUserErrorException($"Model '{model.Name}' is in Nunchaku format, but it's in your main Stable-Diffusion models folder. Nunchaku files are weird, and need to go in the special 'diffusion_models' folder with their own special subfolder.");
            }
            string modelNode = CreateNode("CheckpointLoaderSimple", new JObject()
            {
                ["ckpt_name"] = model.ToString(ModelFolderFormat)
            }, id, false);
            LoadingModel = [modelNode, 0];
            LoadingClip = [modelNode, 1];
            LoadingVAE = [modelNode, 2];
            if ((IsFlux() || IsFlux2Dev()) && (model.Metadata?.TextEncoders ?? "") == "")
            {
                LoadingClip = null;
                LoadingVAE = null;
            }
        }
        string predType = UserInput.Get(T2IParamTypes.OverridePredictionType, model.Metadata?.PredictionType, sectionId: sectionId);
        if (IsSD3())
        {
            string sd3Node = CreateNode("ModelSamplingSD3", new JObject()
            {
                ["model"] = LoadingModel,
                ["shift"] = UserInput.Get(T2IParamTypes.SigmaShift, 3, sectionId: sectionId)
            });
            LoadingModel = [sd3Node, 0];
            string tencs = model.Metadata?.TextEncoders ?? "";
            if (!UserInput.TryGet(T2IParamTypes.SD3TextEncs, out string mode, sectionId: sectionId))
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
                    helpers.LoadClip("sd3", helpers.GetT5XXLModel());
                }
                else if (mode == "CLIP Only")
                {
                    helpers.LoadClip2("sd3", helpers.GetClipGModel(), helpers.GetClipLModel());
                }
                else
                {
                    helpers.LoadClip3("sd3", helpers.GetClipGModel(), helpers.GetClipLModel(), helpers.GetT5XXLModel());
                }
            }
            else if (LoadingClip is null)
            {
                throw new SwarmUserErrorException($"Model '{model.Name}' is a full checkpoint format model, but was placed in the diffusion_models backbone folder. Please move it to the standard Stable Diffusion models folder.");
            }
            if (LoadingVAE is null)
            {
                helpers.DoVaeLoader( UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultSD3VAE, "stable-diffusion-v3", "sd35-vae");
            }
        }
        else if (IsFlux2Dev())
        {
            helpers.LoadClip("flux2", helpers.GetMistralFlux2Model());
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFlux2VAE, "flux-2", "flux2-vae");
        }
        else if (IsFlux2Klein4B())
        {
            helpers.LoadClip("flux2", helpers.GetQwen3_4bModel());
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFlux2VAE, "flux-2", "flux2-vae");
        }
        else if (IsFlux2Klein9B())
        {
            helpers.LoadClip("flux2", helpers.GetQwen3_8bModel());
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFlux2VAE, "flux-2", "flux2-vae");
        }
        else if (IsFlux() && (LoadingClip is null || LoadingVAE is null || UserInput.Get(T2IParamTypes.T5XXLModel) is not null || UserInput.Get(T2IParamTypes.ClipLModel) is not null))
        {
            helpers.LoadClip2("flux", helpers.GetT5XXLModel(), helpers.GetClipLModel());
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFluxVAE, "flux-1", "flux-ae");
        }
        else if (IsAuraFlow() && (LoadingClip is null || LoadingVAE is null || UserInput.Get(T2IParamTypes.T5XXLModel) is not null))
        {
            helpers.LoadClip("chroma", helpers.GetPileT5XLAuraFlow());
            string t5Patch = CreateNode("T5TokenizerOptions", new JObject()
            {
                ["clip"] = LoadingClip,
                ["min_padding"] = 768,
                ["min_length"] = 768
            });
            LoadingClip = [t5Patch, 0];
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultSDXLVAE, "stable-diffusion-xl-v1", "sdxl-vae");
        }
        else if (IsAnima())
        {
            helpers.LoadClip("stable_diffusion", helpers.GetQwen3_600mModel());
            helpers.DoVaeLoader(null, "qwen-image", "qwen-image-vae");
        }
        else if (IsChroma() || IsChromaRadiance())
        {
            helpers.LoadClip("chroma", helpers.GetT5XXLModel());
            string t5Patch = CreateNode("T5TokenizerOptions", new JObject() // TODO: This node is a temp patch
            {
                ["clip"] = LoadingClip,
                ["min_padding"] = 0,
                ["min_length"] = 0
            });
            LoadingClip = [t5Patch, 0];
            double shift = UserInput.Get(T2IParamTypes.SigmaShift, 1, sectionId: sectionId);
            if (shift > 0)
            {
                string samplingNode = CreateNode("ModelSamplingAuraFlow", new JObject()
                {
                    ["model"] = LoadingModel,
                    ["shift"] = shift
                });
                LoadingModel = [samplingNode, 0];
            }
            if (IsChromaRadiance())
            {
                LoadingVAE = CreateVAELoader("pixel_space");
            }
            else
            {
                helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFluxVAE, "flux-1", "flux-ae");
            }
        }
        else if (IsHiDream())
        {
            string loaderType = "QuadrupleCLIPLoader";
            if (helpers.GetT5XXLModel().EndsWith(".gguf") || helpers.GetLlama31_8b_Model().EndsWith(".gguf"))
            {
                loaderType = "QuadrupleCLIPLoaderGGUF";
            }
            string quadClipLoader = CreateNode(loaderType, new JObject()
            {
                ["clip_name1"] = helpers.GetHiDreamClipLModel(),
                ["clip_name2"] = helpers.GetHiDreamClipGModel(),
                ["clip_name3"] = helpers.GetT5XXLModel(),
                ["clip_name4"] = helpers.GetLlama31_8b_Model()
            });
            LoadingClip = [quadClipLoader, 0];
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFluxVAE, "flux-1", "flux-ae");
        }
        else if (IsOmniGen())
        {
            helpers.LoadClip("omnigen2", helpers.GetOmniQwenModel());
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFluxVAE, "flux-1", "flux-ae");
        }
        else if (IsQwenImage())
        {
            helpers.LoadClip("qwen_image", helpers.GetQwenImage25_7b_tenc());
            helpers.DoVaeLoader(null, "qwen-image", "qwen-image-vae");
            string samplingNode = CreateNode("ModelSamplingAuraFlow", new JObject()
            {
                ["model"] = LoadingModel,
                ["shift"] = UserInput.Get(T2IParamTypes.SigmaShift, 3, sectionId: sectionId)
            });
            LoadingModel = [samplingNode, 0];
        }
        else if (IsHunyuanImage())
        {
            helpers.LoadClip2("hunyuan_image", helpers.GetQwenImage25_7b_tenc(), helpers.GetByT5SmallGlyphxl_tenc());
            helpers.DoVaeLoader(null, "hunyuan-image-2_1", "hunyuan-image-2_1-vae");
        }
        else if (IsHunyuanImageRefiner())
        {
            helpers.LoadClip2("hunyuan_image", helpers.GetQwenImage25_7b_tenc(), helpers.GetByT5SmallGlyphxl_tenc());
            helpers.DoVaeLoader(null, "hunyuan-image-2_1-refiner", "hunyuan-image-2_1-refiner-vae");
        }
        else if (IsMochi() && (LoadingClip is null || LoadingVAE is null || UserInput.Get(T2IParamTypes.T5XXLModel) is not null))
        {
            helpers.LoadClip("mochi", helpers.GetT5XXLModel());
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultMochiVAE, "genmo-mochi-1", "mochi-vae");
        }
        else if (IsLTXV())
        {
            helpers.LoadClip("ltxv", helpers.GetT5XXLModel());
            helpers.DoVaeLoader(null, "lightricks-ltx-video", "ltxv-vae");
        }
        else if (IsLTXV2())
        {
            if (LoadingVAE is null)
            {
                // Hypothetical approximation of what would probably be right if comfy wasn't just entirely broken on handling this
                helpers.LoadClip2("ltxv", helpers.GetGemma3_12bModel(), helpers.GetLTX2EmbedClip());
                helpers.DoVaeLoader(null, (string)null, "ltx2-audio-vae");
                CurrentAudioVae = new WGNodeData([LoadingVAE, 0], this, WGNodeData.DT_AUDIOVAE, CurrentCompat());
                helpers.DoVaeLoader(null, "lightricks-ltx-video-2", "ltx2-video-vae");
                throw new SwarmUserErrorException("LTX2 requires the safetensors checkpoint format currently due to comfy limitations.");
            }
            else
            {
                helpers.LoadClipAudio(helpers.GetGemma3_12bModel(), model.ToString(ModelFolderFormat));
                helpers.AudioVaeLoad(model.ToString(ModelFolderFormat));
            }
        }
        else if (IsHunyuanVideo())
        {
            helpers.LoadClip2("hunyuan_video", helpers.GetClipLModel(), helpers.GetLlava3Model());
            helpers.DoVaeLoader(null, "hunyuan-video", "hunyuan-video-vae");
        }
        else if (IsHunyuanVideo15())
        {
            helpers.LoadClip2("hunyuan_video_15", helpers.GetQwenImage25_7b_tenc(), helpers.GetByT5SmallGlyphxl_tenc());
            helpers.DoVaeLoader(null, T2IModelClassSorter.CompatHunyuanVideo1_5.ID, "hunyuan-video-1_5-vae");
        }
        else if (IsNvidiaCosmos1())
        {
            helpers.LoadClip("cosmos", helpers.GetOldT5XXLModel());
            helpers.DoVaeLoader(null, "nvidia-cosmos-1", "cosmos-vae");
        }
        else if (IsNvidiaCosmos2())
        {
            helpers.LoadClip("cosmos", helpers.GetOldT5XXLModel());
            helpers.DoVaeLoader(null, "wan-21", "wan21-vae");
        }
        else if (IsWanVideo())
        {
            helpers.LoadClip("wan", helpers.GetUniMaxT5XXLModel());
            helpers.DoVaeLoader(null, "wan-21", "wan21-vae");
        }
        else if (IsWanVideo22())
        {
            helpers.LoadClip("wan", helpers.GetUniMaxT5XXLModel());
            helpers.DoVaeLoader(null, "wan-22", "wan22-vae");
        }
        else if (CurrentCompatClass() == "auraflow-v1")
        {
            string auraNode = CreateNode("ModelSamplingAuraFlow", new JObject()
            {
                ["model"] = LoadingModel,
                ["shift"] = UserInput.Get(T2IParamTypes.SigmaShift, 1.73, sectionId: sectionId)
            });
            LoadingModel = [auraNode, 0];
        }
        else if (IsZImage())
        {
            helpers.LoadClip("lumina2", helpers.GetQwen3_4bModel());
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFluxVAE, "flux-1", "flux-ae");
        }
        else if (IsOvis())
        {
            helpers.LoadClip("ovis", helpers.GetOvisQwenModel());
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFluxVAE, "flux-1", "flux-ae");
        }
        else if (IsLumina())
        {
            string samplingNode = CreateNode("ModelSamplingAuraFlow", new JObject()
            {
                ["model"] = LoadingModel,
                ["shift"] = UserInput.Get(T2IParamTypes.SigmaShift, 6, sectionId: sectionId)
            });
            LoadingModel = [samplingNode, 0];
            if (LoadingClip is null)
            {
                helpers.LoadClip("lumina2", helpers.GetGemma2Model());
            }
            if (LoadingVAE is null)
            {
                helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFluxVAE, "flux-1", "flux-ae");
            }
        }
        else if (IsKandinsky5ImgLite())
        {
            helpers.LoadClip2("kandinsky5_image", helpers.GetClipLModel(), helpers.GetQwenImage25_7b_tenc());
            helpers.DoVaeLoader(UserInput.SourceSession?.User?.Settings?.VAEs?.DefaultFluxVAE, "flux-1", "flux-ae");
        }
        else if (IsKandinsky5VidLite() || IsKandinsky5VidPro())
        {
            helpers.LoadClip2("kandinsky5", helpers.GetClipLModel(), helpers.GetQwenImage25_7b_tenc());
            helpers.DoVaeLoader(null, "hunyuan-video", "hunyuan-video-vae");
        }
        else if (IsAceStep15())
        {
            // TODO: WTF? these twin qwen tencs are wacky.
            if (LoadingClip is null)
            {
                string qwen06 = helpers.RequireClipModel("AceStep/qwen_0.6b_ace15.safetensors", "https://huggingface.co/Comfy-Org/ace_step_1.5_ComfyUI_files/resolve/main/split_files/text_encoders/qwen_0.6b_ace15.safetensors", "fd4590c82153b8ddb67e15a2e7aaa8afa8b83a858c8a9b82a4831063156aa7a7", T2IParamTypes.QwenModel);
                string qwen17 = helpers.RequireClipModel("AceStep/qwen_1.7b_ace15.safetensors", "https://huggingface.co/Comfy-Org/ace_step_1.5_ComfyUI_files/resolve/main/split_files/text_encoders/qwen_1.7b_ace15.safetensors", "ed63e9247d1f55f3ace04fa11e95b085fc82d459c82c5626f0b2e37b91ebd710", T2IParamTypes.QwenModel);
                helpers.LoadClip2("ace", qwen06, qwen17);
            }
            if (LoadingVAE is null)
            {
                helpers.DoVaeLoader(null, T2IModelClassSorter.CompatAceStep15, "ace-step-15-vae");
            }
            CurrentAudioVae = new WGNodeData([LoadingVAE, 0], this, WGNodeData.DT_AUDIOVAE, CurrentCompat());
        }
        else if (!string.IsNullOrWhiteSpace(predType) && LoadingModel is not null)
        {
            if (predType == "sd3")
            {
                string samplingNode = CreateNode("ModelSamplingSD3", new JObject()
                {
                    ["model"] = LoadingModel,
                    ["shift"] = UserInput.Get(T2IParamTypes.SigmaShift, 3, sectionId: sectionId)
                });
                LoadingModel = [samplingNode, 0];
            }
            else
            {
                string discreteNode = CreateNode("ModelSamplingDiscrete", new JObject()
                {
                    ["model"] = LoadingModel,
                    ["sampling"] = predType switch { "v" => "v_prediction", "v-zsnr" => "v_prediction", "epsilon" => "eps", _ => predType },
                    ["zsnr"] = predType.Contains("zsnr")
                });
                LoadingModel = [discreteNode, 0];
            }
        }
        if (UserInput.TryGet(T2IParamTypes.SigmaShift, out double shiftVal, sectionId: sectionId))
        {
            if (IsFlux() || IsAnyFlux2())
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
            else if (IsZImage() || IsAceStep15())
            {
                string samplingNode = CreateNode("ModelSamplingAuraFlow", new JObject()
                {
                    ["model"] = LoadingModel,
                    ["shift"] = shiftVal
                });
                LoadingModel = [samplingNode, 0];
            }
            else if (IsHunyuanVideo() || IsHunyuanVideo15() || IsHunyuanImage() || IsWanVideo() || IsWanVideo22() || IsHiDream())
            {
                string samplingNode = CreateNode("ModelSamplingSD3", new JObject()
                {
                    ["model"] = LoadingModel,
                    ["shift"] = shiftVal
                });
                LoadingModel = [samplingNode, 0];
            }
        }
        foreach (WorkflowGenStep step in ModelGenSteps.Where(s => s.Priority > -100))
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
        WGNodeData modelNodeData = new(LoadingModel, this, WGNodeData.DT_MODEL, CurrentCompat());
        WGNodeData tencNodeData = LoadingClip is null ? null : new WGNodeData(LoadingClip, this, WGNodeData.DT_TEXTENC, CurrentCompat());
        WGNodeData vaeNodeData = LoadingVAE is null ? null : new WGNodeData(LoadingVAE, this, WGNodeData.DT_VAE, CurrentCompat());
        return (model, modelNodeData, tencNodeData, vaeNodeData);
    }
}
