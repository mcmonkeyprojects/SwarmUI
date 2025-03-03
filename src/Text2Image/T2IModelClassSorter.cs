using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.Utils;

namespace SwarmUI.Text2Image;

/// <summary>Helper to determine what classification a model should receive.</summary>
public class T2IModelClassSorter
{
    /// <summary>All known model classes.</summary>
    public static Dictionary<string, T2IModelClass> ModelClasses = [];

    /// <summary>Remaps for known typos or alternate labelings.</summary>
    public static Dictionary<string, string> Remaps = [];

    /// <summary>Register a new model class to the sorter.</summary>
    public static void Register(T2IModelClass clazz)
    {
        ModelClasses.Add(clazz.ID, clazz);
    }

    /// <summary>Initialize the class sorter.</summary>
    public static void Init()
    {
        bool IsAlt(JObject h) => h.ContainsKey("cond_stage_model.roberta.embeddings.word_embeddings.weight");
        bool isV1(JObject h) => h.ContainsKey("cond_stage_model.transformer.text_model.embeddings.position_ids");
        bool isV1Lora(JObject h) => h.ContainsKey("lora_unet_up_blocks_3_attentions_2_transformer_blocks_0_ff_net_2.lora_up.weight");
        bool isV1CNet(JObject h) => h.ContainsKey("input_blocks.1.0.emb_layers.1.bias") || h.ContainsKey("control_model.input_blocks.1.0.emb_layers.1.bias");
        bool isV2(JObject h) => h.ContainsKey("cond_stage_model.model.ln_final.bias");
        bool isV2Depth(JObject h) => h.ContainsKey("depth_model.model.pretrained.act_postprocess3.0.project.0.bias");
        bool isV2Unclip(JObject h) => h.ContainsKey("embedder.model.visual.transformer.resblocks.0.attn.in_proj_weight");
        bool isXL09Base(JObject h) => h.ContainsKey("conditioner.embedders.0.transformer.text_model.embeddings.position_embedding.weight");
        bool isXL09Refiner(JObject h) => h.ContainsKey("conditioner.embedders.0.model.ln_final.bias");
        bool isXLLora(JObject h) => h.ContainsKey("lora_unet_output_blocks_5_1_transformer_blocks_1_ff_net_2.lora_up.weight");
        bool isXLControlnet(JObject h) => h.ContainsKey("controlnet_down_blocks.0.bias");
        bool isSVD(JObject h) => h.ContainsKey("model.diffusion_model.input_blocks.1.0.time_stack.emb_layers.1.bias");
        bool isv2512name(string name) => name.Contains("512-") || name.Contains("-inpaint") || name.Contains("base-"); // keywords that identify the 512 vs the 768. Unfortunately no good proper detection here, other than execution-based hacks (see Auto WebUI ref)
        bool isControlLora(JObject h) => h.ContainsKey("lora_controlnet");
        bool isTurbo21(JObject h) => h.ContainsKey("denoiser.sigmas") && h.ContainsKey("conditioner.embedders.0.model.ln_final.bias");
        bool isSD3(JObject h) => h.ContainsKey("model.diffusion_model.joint_blocks.0.context_block.attn.proj.bias");
        bool isDitControlnet(JObject h) => h.ContainsKey("controlnet_blocks.0.bias") && h.ContainsKey("transformer_blocks.0.ff.net.0.proj.bias");
        bool isFluxControlnet(JObject h) => isDitControlnet(h) && h.ContainsKey("transformer_blocks.0.attn.norm_added_k.weight");
        bool isSD3Controlnet(JObject h) => isDitControlnet(h) && !isFluxControlnet(h);
        bool isSd35LargeControlnet(JObject h) => h.ContainsKey("controlnet_blocks.0.bias") && h.ContainsKey("transformer_blocks.0.adaLN_modulation.1.bias");
        bool isCascadeA(JObject h) => h.ContainsKey("vquantizer.codebook.weight");
        bool isCascadeB(JObject h) => h.ContainsKey("model.diffusion_model.clf.1.weight") && h.ContainsKey("model.diffusion_model.clip_mapper.weight");
        bool isCascadeC(JObject h) => h.ContainsKey("model.diffusion_model.clf.1.weight") && h.ContainsKey("model.diffusion_model.clip_txt_mapper.weight");
        bool isFluxSchnell(JObject h) => (h.ContainsKey("double_blocks.0.img_attn.norm.key_norm.scale") && !h.ContainsKey("guidance_in.in_layer.bias")) // 'unet'
                || (h.ContainsKey("model.diffusion_model.double_blocks.0.img_attn.norm.key_norm.scale") && !h.ContainsKey("model.diffusion_model.guidance_in.in_layer.bias")); // 'checkpoint'
        bool isFluxDev(JObject h) => (h.ContainsKey("double_blocks.0.img_attn.norm.key_norm.scale") && h.ContainsKey("guidance_in.in_layer.bias")) // 'unet'
                || h.ContainsKey("model.diffusion_model.double_blocks.0.img_attn.norm.key_norm.scale") && h.ContainsKey("model.diffusion_model.guidance_in.in_layer.bias"); // 'checkpoint'
        bool isFluxLora(JObject h)
        {
            // some models only have some but not all blocks, so...
            for (int i = 0; i < 22; i++)
            {
                // All of these examples seen in the way - so many competing LoRA formats for flux, wtf.
                if (h.ContainsKey($"diffusion_model.double_blocks.{i}.img_attn.proj.lora_down.weight")
                    || h.ContainsKey($"model.diffusion_model.double_blocks.{i}.img_attn.proj.lora_down.weight")
                    || h.ContainsKey($"lora_unet_double_blocks_{i}_img_attn_proj.lora_down.weight")
                    || h.ContainsKey($"lora_unet_single_blocks_{i}_linear1.lora_down.weight")
                    || h.ContainsKey($"lora_transformer_single_transformer_blocks_{i}_attn_to_k.lora_down.weight")
                    || h.ContainsKey($"transformer.single_transformer_blocks.{i}.attn.to_k.lora_A.weight")
                    || h.ContainsKey($"transformer.single_transformer_blocks.{i}.proj_out.lora_A.weight"))
                {
                    return true;
                }
            }
            return false;
        }
        bool isSD35Lora(JObject h) => h.ContainsKey("transformer.transformer_blocks.0.attn.to_k.lora_A.weight") && !isFluxLora(h);
        bool isMochi(JObject h) => h.ContainsKey("model.diffusion_model.blocks.0.attn.k_norm_x.weight") || h.ContainsKey("diffusion_model.blocks.0.attn.k_norm_x.weight") || h.ContainsKey("blocks.0.attn.k_norm_x.weight");
        bool isMochiVae(JObject h) => h.ContainsKey("encoder.layers.4.layers.1.attn_block.attn.qkv.weight") || h.ContainsKey("layers.4.layers.1.attn_block.attn.qkv.weight") || h.ContainsKey("blocks.2.blocks.3.stack.5.weight") || h.ContainsKey("decoder.blocks.2.blocks.3.stack.5.weight");
        bool isLtxv(JObject h) => h.ContainsKey("model.diffusion_model.adaln_single.emb.timestep_embedder.linear_1.bias");
        bool isSana(JObject h) => h.ContainsKey("attention_y_norm.weight") && h.ContainsKey("blocks.0.attn.proj.weight");
        bool isHunyuanVideo(JObject h) => h.ContainsKey("model.model.txt_in.individual_token_refiner.blocks.1.self_attn.qkv.weight");
        bool isHunyuanVideoSkyreels(JObject h) => h.ContainsKey("txt_in.individual_token_refiner.blocks.1.self_attn_qkv.weight");
        bool isHunyuanVideoSkyreelsImage2V(JObject h) => h.TryGetValue("img_in.proj.weight", out JToken jtok) && jtok["shape"].ToArray()[1].Value<long>() == 32;
        bool isHunyuanVideoVae(JObject h) => h.ContainsKey("decoder.conv_in.conv.bias");
        bool isHunyuanVideoLora(JObject h) => h.ContainsKey("transformer.single_blocks.9.modulation.linear.lora_B.weight") || h.ContainsKey("transformer.double_blocks.9.txt_mod.linear.lora_B.weight");
        bool isCosmos7b(JObject h) => h.TryGetValue("net.blocks.block0.blocks.0.adaLN_modulation.1.weight", out JToken jtok) && jtok["shape"].ToArray()[^1].Value<long>() == 4096;
        bool isCosmos14b(JObject h) => h.TryGetValue("net.blocks.block0.blocks.0.adaLN_modulation.1.weight", out JToken jtok) && jtok["shape"].ToArray()[^1].Value<long>() == 5120;
        bool isCosmosVae(JObject h) => h.ContainsKey("decoder.unpatcher3d._arange");
        bool isLumina2(JObject h) => h.ContainsKey("model.diffusion_model.cap_embedder.0.weight") || h.ContainsKey("cap_embedder.0.weight");
        bool tryGetWanTok(JObject h, out JToken tok) => h.TryGetValue("model.diffusion_model.blocks.0.cross_attn.k.bias", out tok) || h.TryGetValue("blocks.0.cross_attn.k.bias", out tok);
        bool isWan21_1_3b(JObject h) => tryGetWanTok(h, out JToken tok) && tok["shape"].ToArray()[0].Value<long>() == 1536;
        bool isWan21_14b(JObject h) => tryGetWanTok(h, out JToken tok) && tok["shape"].ToArray()[0].Value<long>() == 5120;
        bool tryGetWanLoraTok(JObject h, out JToken tok) => h.TryGetValue("diffusion_model.blocks.0.cross_attn.k.lora_A.weight", out tok) || h.TryGetValue("blocks.0.cross_attn.k.lora_A.weight", out tok);
        bool isWan21_1_3bLora(JObject h) => tryGetWanLoraTok(h, out JToken tok) && tok["shape"].ToArray()[1].Value<long>() == 1536;
        bool isWan21_14bLora(JObject h) => tryGetWanLoraTok(h, out JToken tok) && tok["shape"].ToArray()[1].Value<long>() == 5120;
        bool isWanI2v(JObject h) => h.ContainsKey("model.diffusion_model.blocks.0.cross_attn.k_img.bias") || h.ContainsKey("blocks.0.cross_attn.k_img.bias");
        // ====================== Stable Diffusion v1 ======================
        Register(new() { ID = "stable-diffusion-v1", CompatClass = "stable-diffusion-v1", Name = "Stable Diffusion v1", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV1(h) && !IsAlt(h) && !isV2(h) && !isXL09Base(h) && !isSD3(h);
        }});
        Register(new() { ID = "stable-diffusion-v1-inpainting", CompatClass = "stable-diffusion-v1", Name = "Stable Diffusion v1 (Inpainting)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO: How to detect accurately?
        }});
        Register(new() { ID = "stable-diffusion-v1/lora", CompatClass = "stable-diffusion-v1", Name = "Stable Diffusion v1 LoRA", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV1Lora(h) && !isXLLora(h);
        }});
        Register(new() { ID = "stable-diffusion-v1/controlnet", CompatClass = "stable-diffusion-v1", Name = "Stable Diffusion v1 ControlNet", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV1CNet(h) && !isControlLora(h) && !isDitControlnet(h);
        }});
        JToken GetEmbeddingKey(JObject h)
        {
            if (h.TryGetValue("emb_params", out JToken emb_data))
            {
                return emb_data;
            }
            JProperty[] props = h.Properties().Where(p => p.Name.StartsWith('<') && p.Name.EndsWith('>')).ToArray();
            if (props.Length == 1)
            {
                return props[0].Value;
            }
            return null;
        }
        Register(new() { ID = "stable-diffusion-v1/textual-inversion", CompatClass = "stable-diffusion-v1", Name = "Stable Diffusion v1 Embedding", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            JToken emb_data = GetEmbeddingKey(h);
            if (emb_data is null || !(emb_data as JObject).TryGetValue("shape", out JToken shape))
            {
                return false;
            }
            return shape.ToArray()[^1].Value<long>() == 768;
        }});
        // ====================== Stable Diffusion v2 ======================
        Register(new() { ID = "stable-diffusion-v2-512", CompatClass = "stable-diffusion-v2", Name = "Stable Diffusion v2-512", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV2(h) && !isV2Unclip(h) && isv2512name(m.Name);
        }});
        Register(new() { ID = "stable-diffusion-v2-768-v", CompatClass = "stable-diffusion-v2", Name = "Stable Diffusion v2-768v", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
        {
            return isV2(h) && !isV2Unclip(h) && !isv2512name(m.Name);
        }});
        Register(new() { ID = "stable-diffusion-v2-inpainting", CompatClass = "stable-diffusion-v2", Name = "Stable Diffusion v2 (Inpainting)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO: How to detect accurately?
        }});
        Register(new() { ID = "stable-diffusion-v2-depth", CompatClass = "stable-diffusion-v2", Name = "Stable Diffusion v2 (Depth)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV2Depth(h);
        }});
        Register(new() { ID = "stable-diffusion-v2-unclip", CompatClass = "stable-diffusion-v2", Name = "Stable Diffusion v2 (Unclip)", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
        {
            return isV2Unclip(h);
        }});
        Register(new() { ID = "stable-diffusion-v2-768-v/textual-inversion", CompatClass = "stable-diffusion-v2", Name = "Stable Diffusion v2 Embedding", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
        {
            JToken emb_data = GetEmbeddingKey(h);
            if (emb_data is null)
            {
                return false;
            }
            if (emb_data is null || !(emb_data as JObject).TryGetValue("shape", out JToken shape))
            {
                return false;
            }
            return shape.ToArray()[^1].Value<long>() == 1024;
        }
        });
        Register(new() { ID = "stable-diffusion-v2-turbo", CompatClass = "stable-diffusion-v2-turbo", Name = "Stable Diffusion v2 Turbo", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isTurbo21(h);
        }});
        // ====================== Stable Diffusion XL ======================
        Register(new() { ID = "stable-diffusion-xl-v1-base", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL 1.0-Base", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return Program.ServerSettings.Metadata.XLDefaultAsXL1 && isXL09Base(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v0_9-base", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL 0.9-Base", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return !Program.ServerSettings.Metadata.XLDefaultAsXL1 && isXL09Base(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v0_9-refiner", CompatClass = "stable-diffusion-xl-v1-refiner", Name = "Stable Diffusion XL 0.9-Refiner", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isXL09Refiner(h) && !isTurbo21(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v1-base/lora", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL 1.0-Base LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isXLLora(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v1-base/controlnet", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL 1.0-Base ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isXLControlnet(h) && !isDitControlnet(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v1-base/textual-inversion", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL 1.0-Base Embedding", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return h.TryGetValue("clip_g", out JToken clip_g) && (clip_g as JObject).TryGetValue("shape", out JToken shape_g) && shape_g[1].Value<long>() == 1280
                && h.TryGetValue("clip_l", out JToken clip_l) && (clip_l as JObject).TryGetValue("shape", out JToken shape_l) && shape_l[1].Value<long>() == 768;
        }});
        // ====================== Stable Video Diffusion ======================
        Register(new() { ID = "stable-video-diffusion-img2vid-v0_9", CompatClass = "stable-video-diffusion-img2vid-v1", Name = "Stable Video Diffusion Img2Vid 0.9", StandardWidth = 1024, StandardHeight = 576, IsThisModelOfClass = (m, h) =>
        {
            return isSVD(h);
        }});
        // ====================== Mochi (Genmo video) ======================
        Register(new() { ID = "genmo-mochi-1", CompatClass = "genmo-mochi-1", Name = "Genmo Mochi 1", StandardWidth = 848, StandardHeight = 480, IsThisModelOfClass = (m, h) =>
        {
            return isMochi(h);
        }});
        Register(new() { ID = "genmo-mochi-1/vae", CompatClass = "genmo-mochi-1", Name = "Genmo Mochi 1 VAE", StandardWidth = 848, StandardHeight = 480, IsThisModelOfClass = (m, h) =>
        {
            return isMochiVae(h);
        }});
        // ====================== Stable Cascade ======================
        Register(new() { ID = "stable-cascade-v1-stage-a/vae", CompatClass = "stable-cascade-v1", Name = "Stable Cascade v1 (Stage A)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
             return isCascadeA(h) && !isCascadeB(h) && !isCascadeC(h);
        }});
        Register(new() { ID = "stable-cascade-v1-stage-b", CompatClass = "stable-cascade-v1", Name = "Stable Cascade v1 (Stage B)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isCascadeB(h);
        }});
        Register(new() { ID = "stable-cascade-v1-stage-c", CompatClass = "stable-cascade-v1", Name = "Stable Cascade v1 (Stage C)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isCascadeC(h);
        }});
        // ====================== Stable Diffusion v3 ======================
        Register(new() { ID = "stable-diffusion-v3-medium", CompatClass = "stable-diffusion-v3-medium", Name = "Stable Diffusion 3 Medium", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD3(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-large", CompatClass = "stable-diffusion-v3.5-large", Name = "Stable Diffusion 3.5 Large", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "stable-diffusion-v3.5-large-turbo", CompatClass = "stable-diffusion-v3.5-large", Name = "Stable Diffusion 3.5 Large Turbo", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "stable-diffusion-v3.5-medium", CompatClass = "stable-diffusion-v3.5-medium", Name = "Stable Diffusion 3.5 Medium", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "stable-diffusion-v3-medium/lora", CompatClass = "stable-diffusion-v3-medium", Name = "Stable Diffusion 3 Medium LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO: ?
        }});
        Register(new() { ID = "stable-diffusion-v3.5-large/lora", CompatClass = "stable-diffusion-v3.5-large", Name = "Stable Diffusion 3.5 Large LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD35Lora(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-medium/lora", CompatClass = "stable-diffusion-v3.5-medium", Name = "Stable Diffusion 3.5 Medium LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "stable-diffusion-v3-medium/controlnet", CompatClass = "stable-diffusion-v3-medium", Name = "Stable Diffusion 3 Medium ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD3Controlnet(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-large/controlnet", CompatClass = "stable-diffusion-v3.5-large", Name = "Stable Diffusion 3.5 Large ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSd35LargeControlnet(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-medium/controlnet", CompatClass = "stable-diffusion-v3.5-medium", Name = "Stable Diffusion 3.5 Medium ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "stable-diffusion-v3/vae", CompatClass = "stable-diffusion-v3", Name = "Stable Diffusion 3 VAE", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        // ====================== BFL Flux.1 ======================
        Register(new() { ID = "flux.1/vae", CompatClass = "flux-1", Name = "Flux.1 Autoencoder", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "Flux.1-schnell", CompatClass = "flux-1", Name = "Flux.1 Schnell", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxSchnell(h);
        }});
        Register(new() { ID = "Flux.1-dev", CompatClass = "flux-1", Name = "Flux.1 Dev", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxDev(h);
        }});
        Register(new() { ID = "Flux.1-dev/lora", CompatClass = "flux-1", Name = "Flux.1 LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxLora(h);
        }});
        Register(new() { ID = "Flux.1-dev/depth", CompatClass = "flux-1", Name = "Flux.1 Depth", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/canny", CompatClass = "flux-1", Name = "Flux.1 Canny", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/inpaint", CompatClass = "flux-1", Name = "Flux.1 Fill/Inpaint", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/lora-depth", CompatClass = "flux-1", Name = "Flux.1 Depth LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/lora-canny", CompatClass = "flux-1", Name = "Flux.1 Canny LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/controlnet", CompatClass = "flux-1", Name = "Flux.1 ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxControlnet(h);
        }});
        Register(new() { ID = "flux.1-dev/controlnet-alimamainpaint", CompatClass = "flux-1", Name = "Flux.1 ControlNet - AliMama Inpaint", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        // ====================== Wan Video ======================
        Register(new() { ID = "wan-2_1-text2video/vae", CompatClass = "wan-21", Name = "Wan 2.1 VAE", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) => { return false; }});
        Register(new() { ID = "wan-2_1-text2video-1_3b", CompatClass = "wan-21-1_3b", Name = "Wan 2.1 Text2Video 1.3B", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_1_3b(h) && !isWanI2v(h);
        }});
        Register(new() { ID = "wan-2_1-text2video-1_3b/lora", CompatClass = "wan-21-1_3b", Name = "Wan 2.1 Text2Video 1.3B LoRA", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_1_3bLora(h);
        }});
        Register(new() { ID = "wan-2_1-text2video-14b", CompatClass = "wan-21-14b", Name = "Wan 2.1 Text2Video 14B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && !isWanI2v(h);
        }});
        Register(new() { ID = "wan-2_1-text2video-14b/lora", CompatClass = "wan-21-14b", Name = "Wan 2.1 Text2Video 14B LoRA", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14bLora(h);
        }});
        Register(new() { ID = "wan-2_1-image2video-14b", CompatClass = "wan-21-14b", Name = "Wan 2.1 Image2Video 14B", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && isWanI2v(h);
        }});
        // ====================== Random Other Models ======================
        Register(new() { ID = "alt_diffusion_v1_512_placeholder", CompatClass = "alt_diffusion_v1", Name = "Alt-Diffusion", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return IsAlt(h);
        }});
        Register(new() { ID = "lightricks-ltx-video", CompatClass = "lightricks-ltx-video", Name = "Lightricks LTX Video", StandardWidth = 768, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isLtxv(h);
        }});
        Register(new() { ID = "hunyuan-video", CompatClass = "hunyuan-video", Name = "Hunyuan Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideo(h);
        }});
        Register(new() { ID = "hunyuan-video-skyreels", CompatClass = "hunyuan-video", Name = "Hunyuan Video - SkyReels Text2Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideoSkyreels(h) && !isHunyuanVideoSkyreelsImage2V(h);
        }});
        Register(new() { ID = "hunyuan-video-skyreels-i2v", CompatClass = "hunyuan-video", Name = "Hunyuan Video - SkyReels Image2Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideoSkyreels(h) && isHunyuanVideoSkyreelsImage2V(h);
        }});
        Register(new() { ID = "hunyuan-video/vae", CompatClass = "hunyuan-video", Name = "Hunyuan Video VAE", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideoVae(h);
        }});
        Register(new() { ID = "hunyuan-video/lora", CompatClass = "hunyuan-video", Name = "Hunyuan Video LoRA", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideoLora(h);
        }});
        Register(new() { ID = "nvidia-sana-1600", CompatClass = "nvidia-sana-1600", Name = "NVIDIA Sana 1600M", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSana(h);
        }});
        Register(new() { ID = "nvidia-sana-1600/vae", CompatClass = "nvidia-sana-1600", Name = "NVIDIA Sana 1600M DC-AE VAE", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return h.ContainsKey("decoder.stages.0.0.main.conv.bias");
        }});
        Register(new() { ID = "nvidia-cosmos-1-7b-text2world", CompatClass = "nvidia-cosmos-1", Name = "NVIDIA Cosmos 1.0 Diffusion (7B) Text2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos7b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 68;
        }});
        Register(new() { ID = "nvidia-cosmos-1-14b-text2world", CompatClass = "nvidia-cosmos-1", Name = "NVIDIA Cosmos 1.0 Diffusion (14B) Text2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos14b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 68;
        }});
        Register(new() { ID = "nvidia-cosmos-1-7b-video2world", CompatClass = "nvidia-cosmos-1", Name = "NVIDIA Cosmos 1.0 Diffusion (7B) Video2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos7b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 72;
        }});
        Register(new() { ID = "nvidia-cosmos-1-14b-video2world", CompatClass = "nvidia-cosmos-1", Name = "NVIDIA Cosmos 1.0 Diffusion (14B) Video2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos14b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 72;
        }});
        Register(new() { ID = "nvidia-cosmos-1/vae", CompatClass = "nvidia-cosmos-1", Name = "NVIDIA Cosmos 1.0 Diffusion VAE", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmosVae(h);
        }});
        Register(new() { ID = "lumina-2", CompatClass = "lumina-2", Name = "Lumina 2", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isLumina2(h);
        }});
        // Everything below this point does not autodetect, it must match through ModelSpec
        Register(new() { ID = "stable-diffusion-v1/vae", CompatClass = "stable-diffusion-v1", Name = "Stable Diffusion v1 VAE", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v1/inpaint", CompatClass = "stable-diffusion-v1", Name = "Stable Diffusion v1 (Inpainting)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v2-768-v/lora", CompatClass = "stable-diffusion-v2", Name = "Stable Diffusion v2 LoRA", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-turbo-v1", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL Turbo", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-refiner", CompatClass = "stable-diffusion-xl-v1-refiner", Name = "Stable Diffusion XL 1.0-Refiner", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-base/vae", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL 1.0-Base VAE", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-edit", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL 1.0 Edit", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-base/control-lora", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL 1.0-Base Control-LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isControlLora(h);
        }});
        Register(new() { ID = "segmind-stable-diffusion-1b", CompatClass = "segmind-stable-diffusion-1b", Name = "Segmind Stable Diffusion 1B (SSD-1B)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-video-diffusion-img2vid-v1", CompatClass = "stable-video-diffusion-img2vid-v1", Name = "Stable Video Diffusion Img2Vid v1", StandardWidth = 1024, StandardHeight = 576, IsThisModelOfClass = (m, h) => { return false; }});
        // TensorRT variants
        Register(new() { ID = "stable-diffusion-v1/tensorrt", CompatClass = "stable-diffusion-v1", Name = "Stable Diffusion v1 (TensorRT Engine)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v2-768-v/tensorrt", CompatClass = "stable-diffusion-v2", Name = "Stable Diffusion v2 (TensorRT Engine)", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v0_9-base/tensorrt", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL 0.9-Base (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-base/tensorrt", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL 1.0-Base (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v3-medium/tensorrt", CompatClass = "stable-diffusion-v3-medium", Name = "Stable Diffusion 3 Medium (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-turbo-v1/tensorrt", CompatClass = "stable-diffusion-xl-v1", Name = "Stable Diffusion XL Turbo (TensorRT Engine)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-refiner/tensorrt", CompatClass = "stable-diffusion-xl-v1-refiner", Name = "Stable Diffusion XL 1.0-Refiner (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-video-diffusion-img2vid-v1/tensorrt", CompatClass = "stable-video-diffusion-img2vid-v1", Name = "Stable Video Diffusion Img2Vid v1 (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 576, IsThisModelOfClass = (m, h) => { return false; } });
        // Other model classes
        Register(new() { ID = "pixart-ms-sigma-xl-2", CompatClass = "pixart-ms-sigma-xl-2", Name = "PixArtMS Sigma XL 2", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "pixart-ms-sigma-xl-2-2k", CompatClass = "pixart-ms-sigma-xl-2", Name = "PixArtMS Sigma XL 2 (2K)", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "auraflow-v1", CompatClass = "auraflow-v1", Name = "AuraFlow", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "auraflow-v1/tensorrt", CompatClass = "auraflow-v1", Name = "AuraFlow (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        // ====================== General correction remaps ======================
        Remaps["flux-1-dev"] = "Flux.1-dev";
        Remaps["flux-1-dev/lora"] = "Flux.1-dev/lora";
        Remaps["flux-1-dev/lora"] = "Flux.1-dev/lora";
        Remaps["flux-dev/lora"] = "Flux.1-dev/lora";
        Remaps["Flux.1-depth-dev-lora"] = "Flux.1-dev/lora-depth";
        Remaps["Flux.1-canny-dev-lora"] = "Flux.1-dev/lora-canny";
        Remaps["Flux.1-depth-dev"] = "Flux.1-dev/depth";
        Remaps["Flux.1-canny-dev"] = "Flux.1-dev/canny";
        Remaps["Flux.1-fill-dev"] = "Flux.1-dev/inpaint";
        Remaps["flux-1-schnell"] = "Flux.1-schnell";
        Remaps["flux-1-schnell/lora"] = "Flux.1-dev/lora";
        Remaps["flux-1-schnell/controlnet"] = "Flux.1-dev/controlnet";
        Remaps["Flux.1-schnell/lora"] = "Flux.1-dev/lora";
        Remaps["Flux.1-schnell/controlnet"] = "Flux.1-dev/controlnet";
        Remaps["Flux.1-AE"] = "flux.1/vae";
        Remaps["stable-cascade-v1-stage-a"] = "stable-cascade-v1-stage-a/vae";
        Remaps["stable-diffusion-3-3-5-large"] = "stable-diffusion-v3.5-large";
        Remaps["stable-diffusion-3-3-5-large/lora"] = "stable-diffusion-v3.5-large/lora";
        Remaps["stable-diffusion-3-3-5-medium"] = "stable-diffusion-v3.5-medium";
        Remaps["stable-diffusion-3-3-5-medium/lora"] = "stable-diffusion-v3.5-medium/lora";
        // ====================== GGUF Remaps ======================
        Remaps["flux"] = "Flux.1-dev";
        Remaps["sd3"] = "stable-diffusion-v3-medium";
        Remaps["hyvid"] = "hunyuan-video";
    }

    /// <summary>Returns the model class that matches this model, or null if none.</summary>
    public static T2IModelClass IdentifyClassFor(T2IModel model, JObject header)
    {
        if (model.ModelClass is not null)
        {
            return model.ModelClass;
        }
        // "ot" trained loras seem to emit empty strings?! why god. Argh.
        static string fix(string s) => string.IsNullOrWhiteSpace(s) ? null : s;
        string arch = fix(header?["__metadata__"]?.Value<string>("modelspec.architecture"))
            ?? fix(header?["__metadata__"]?.Value<string>("architecture"))
            ?? fix(header?["__metadata__"]?.Value<string>("general.architecture"))
            ?? fix(header.Value<string>("modelspec.architecture"))
            ?? fix(header.Value<string>("architecture"))
            ?? fix(header.Value<string>("general.architecture"));
        if (arch is not null)
        {
            string res = fix(header["__metadata__"]?.Value<string>("modelspec.resolution"))
                ?? fix(header["__metadata__"]?.Value<string>("resolution"))
                ?? fix(header.Value<string>("modelspec.resolution"))
                ?? fix(header.Value<string>("resolution"));
            string h = null;
            int width = string.IsNullOrWhiteSpace(res) ? 0 : int.Parse(res.BeforeAndAfter('x', out h));
            int height = string.IsNullOrWhiteSpace(h) ? 0 : int.Parse(h);
            if (Remaps.TryGetValue(arch, out string remapTo))
            {
                arch = remapTo;
            }
            if (ModelClasses.TryGetValue(arch, out T2IModelClass clazz))
            {
                if ((width == clazz.StandardWidth && height == clazz.StandardHeight) || (width <= 0 && height <= 0))
                {
                    Logs.Debug($"Model {model.Name} matches {clazz.Name} by architecture ID");
                    return clazz;
                }
                else
                {
                    Logs.Debug($"Model {model.Name} matches {clazz.Name} by architecture ID, but resolution is different ({width}x{height} vs {clazz.StandardWidth}x{clazz.StandardHeight})");
                    return clazz with { StandardWidth = width, StandardHeight = height, IsThisModelOfClass = (m, h) => false };
                }
            }
            Logs.Debug($"Model {model.Name} has unknown architecture ID {arch}");
            return new() { ID = arch, CompatClass = arch, Name = arch, StandardWidth = width, StandardHeight = height, IsThisModelOfClass = (m, h) => false };
        }
        if (!model.RawFilePath.EndsWith(".safetensors") && !model.RawFilePath.EndsWith(".sft") && header is null)
        {
            Logs.Debug($"Model {model.Name} cannot have known type, not safetensors and no header");
            return null;
        }
        foreach (T2IModelClass modelClass in ModelClasses.Values)
        {
            if (modelClass.IsThisModelOfClass(model, header))
            {
                Logs.Debug($"Model {model.Name} seems to match type {modelClass.Name}");
                return modelClass;
            }
        }
        Logs.Debug($"Model {model.Name} did not match any of {ModelClasses.Count} options");
        return null;
    }
}
