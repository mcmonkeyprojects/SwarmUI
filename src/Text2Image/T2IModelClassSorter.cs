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

    /// <summary>All known model compat classes.</summary>
    public static Dictionary<string, T2IModelCompatClass> CompatClasses = [];

    /// <summary>Remaps for known typos or alternate labelings.</summary>
    public static Dictionary<string, string> Remaps = [];

    /// <summary>Register a new model class to the sorter.</summary>
    public static T2IModelClass Register(T2IModelClass clazz)
    {
        ModelClasses.Add(clazz.ID, clazz);
        return clazz;
    }

    /// <summary>Register a new model compat class to the sorter.</summary>
    public static T2IModelCompatClass RegisterCompat(T2IModelCompatClass clazz)
    {
        CompatClasses.Add(clazz.ID, clazz);
        return clazz;
    }

    /// <summary>Initialize the class sorter.</summary>
    public static void Init()
    {
        bool IsAlt(JObject h) => h.ContainsKey("cond_stage_model.roberta.embeddings.word_embeddings.weight");
        bool isV1(JObject h) => h.ContainsKey("cond_stage_model.transformer.text_model.embeddings.position_ids") || h.ContainsKey("cond_stage_model.transformer.embeddings.position_ids");
        bool isV1Lora(JObject h) => h.ContainsKey("lora_unet_up_blocks_3_attentions_2_transformer_blocks_0_ff_net_2.lora_up.weight");
        bool isV1CNet(JObject h) => h.ContainsKey("input_blocks.1.0.emb_layers.1.bias") || h.ContainsKey("control_model.input_blocks.1.0.emb_layers.1.bias");
        bool isV2(JObject h) => h.ContainsKey("cond_stage_model.model.ln_final.bias");
        bool isV2Depth(JObject h) => h.ContainsKey("depth_model.model.pretrained.act_postprocess3.0.project.0.bias");
        bool isV2Unclip(JObject h) => h.ContainsKey("embedder.model.visual.transformer.resblocks.0.attn.in_proj_weight");
        bool isv2512name(string name) => name.Contains("512-") || name.Contains("-inpaint") || name.Contains("base-"); // keywords that identify the 512 vs the 768. Unfortunately no good proper detection here, other than execution-based hacks (see Auto WebUI ref)
        bool isXL09Base(JObject h) => h.ContainsKey("conditioner.embedders.0.transformer.text_model.embeddings.position_embedding.weight");
        bool isXL09Refiner(JObject h) => h.ContainsKey("conditioner.embedders.0.model.ln_final.bias");
        bool isXLLora(JObject h) => h.ContainsKey("lora_unet_output_blocks_5_1_transformer_blocks_1_ff_net_2.lora_up.weight") || h.ContainsKey("lora_unet_down_blocks_2_attentions_1_transformer_blocks_9_attn2_to_v.lora_up.weight");
        bool isXLControlnet(JObject h) => h.ContainsKey("controlnet_down_blocks.0.bias");
        bool isSVD(JObject h) => h.ContainsKey("model.diffusion_model.input_blocks.1.0.time_stack.emb_layers.1.bias");
        bool isControlLora(JObject h) => h.ContainsKey("lora_controlnet");
        bool isTurbo21(JObject h) => h.ContainsKey("denoiser.sigmas") && h.ContainsKey("conditioner.embedders.0.model.ln_final.bias");
        bool tryGetSd3Tok(JObject h, out JToken tok) => h.TryGetValue("model.diffusion_model.joint_blocks.0.context_block.attn.proj.bias", out tok);
        bool isSD3Med(JObject h) => tryGetSd3Tok(h, out JToken tok) && tok["shape"].ToArray()[0].Value<long>() != 2432;
        bool isSD3Large(JObject h) => tryGetSd3Tok(h, out JToken tok) && tok["shape"].ToArray()[0].Value<long>() == 2432;
        bool isDitControlnet(JObject h) => h.ContainsKey("controlnet_blocks.0.bias") && h.ContainsKey("transformer_blocks.0.ff.net.0.proj.bias");
        bool isFluxControlnet(JObject h) => isDitControlnet(h) && h.ContainsKey("transformer_blocks.0.attn.norm_added_k.weight");
        bool isSD3Controlnet(JObject h) => isDitControlnet(h) && !isFluxControlnet(h);
        bool isSd35LargeControlnet(JObject h) => h.ContainsKey("controlnet_blocks.0.bias") && h.ContainsKey("transformer_blocks.0.adaLN_modulation.1.bias");
        bool isCascadeA(JObject h) => h.ContainsKey("vquantizer.codebook.weight");
        bool isCascadeB(JObject h) => (h.ContainsKey("model.diffusion_model.clf.1.weight") && h.ContainsKey("model.diffusion_model.clip_mapper.weight")) || (h.ContainsKey("clf.1.weight") && h.ContainsKey("clip_mapper.weight"));
        bool isCascadeC(JObject h) => (h.ContainsKey("model.diffusion_model.clf.1.weight") && h.ContainsKey("model.diffusion_model.clip_txt_mapper.weight")) || (h.ContainsKey("clf.1.weight") && h.ContainsKey("clip_txt_mapper.weight"));
        bool isFluxSchnell(JObject h) => (h.ContainsKey("double_blocks.0.img_attn.norm.key_norm.scale") && !h.ContainsKey("guidance_in.in_layer.bias")) // 'diffusion_models'
                || (h.ContainsKey("model.diffusion_model.double_blocks.0.img_attn.norm.key_norm.scale") && !h.ContainsKey("model.diffusion_model.guidance_in.in_layer.bias")); // 'checkpoints'
        bool isFluxDev(JObject h) => (h.ContainsKey("double_blocks.0.img_attn.norm.key_norm.scale") && h.ContainsKey("guidance_in.in_layer.bias")) // 'diffusion_models'
                || (h.ContainsKey("time_text_embed.guidance_embedder.linear_1.weight") && h.ContainsKey("single_transformer_blocks.0.attn.norm_k.weight") && h.ContainsKey("transformer_blocks.0.attn.add_k_proj.weight") && h.ContainsKey("single_transformer_blocks.0.proj_mlp.weight")) // tencent funky models
                || (h.ContainsKey("single_transformer_blocks.0.norm.linear.qweight") && h.ContainsKey("transformer_blocks.0.mlp_context_fc1.bias") && (h.ContainsKey("transformer_blocks.0.mlp_context_fc1.wscales") || h.ContainsKey("transformer_blocks.0.mlp_context_fc1.wtscale")) // Nunchaku
                || (h.ContainsKey("model.diffusion_model.double_blocks.0.img_attn.norm.key_norm.scale") && h.ContainsKey("model.diffusion_model.guidance_in.in_layer.bias"))); // 'checkpoints'
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
        bool isLtxv(JObject h) => h.ContainsKey("model.diffusion_model.adaln_single.emb.timestep_embedder.linear_1.bias") || h.ContainsKey("adaln_single.emb.timestep_embedder.linear_1.bias");
        bool isLtxvVae(JObject h) => h.ContainsKey("decoder.conv_in.conv.bias") && h.ContainsKey("decoder.last_time_embedder.timestep_embedder.linear_1.bias");
        bool isSana(JObject h) => h.ContainsKey("attention_y_norm.weight") && h.ContainsKey("blocks.0.attn.proj.weight");
        bool isHunyuanVideo(JObject h) => h.ContainsKey("model.model.txt_in.individual_token_refiner.blocks.1.self_attn.qkv.weight") || h.ContainsKey("txt_in.individual_token_refiner.blocks.1.self_attn_qkv.weight");
        bool isHunyuanVideoSkyreelsImage2V(JObject h) => h.TryGetValue("img_in.proj.weight", out JToken jtok) && jtok["shape"].ToArray()[1].Value<long>() == 32;
        bool isHunyuanVideoNativeImage2V(JObject h) => h.TryGetValue("img_in.proj.weight", out JToken jtok) && jtok["shape"].ToArray()[1].Value<long>() == 33;
        bool isHunyuanVideoVae(JObject h) => h.ContainsKey("decoder.conv_in.conv.bias") && h.ContainsKey("decoder.mid.attn_1.k.bias");
        bool isHunyuanVideoLora(JObject h) => h.ContainsKey("transformer.single_blocks.9.modulation.linear.lora_B.weight") || h.ContainsKey("transformer.double_blocks.9.txt_mod.linear.lora_B.weight");
        bool isCosmos7b(JObject h) => h.TryGetValue("net.blocks.block0.blocks.0.adaLN_modulation.1.weight", out JToken jtok) && jtok["shape"].ToArray()[^1].Value<long>() == 4096;
        bool isCosmos14b(JObject h) => h.TryGetValue("net.blocks.block0.blocks.0.adaLN_modulation.1.weight", out JToken jtok) && jtok["shape"].ToArray()[^1].Value<long>() == 5120;
        bool isCosmosVae(JObject h) => h.ContainsKey("decoder.unpatcher3d._arange");
        bool isCosmosPredict2_2B(JObject h) => h.ContainsKey("norm_out.linear_1.weight") && h.ContainsKey("time_embed.t_embedder.linear_1.weight");
        bool isCosmosPredict2_14B(JObject h) => h.ContainsKey("net.blocks.0.adaln_modulation_cross_attn.1.weight");
        bool isLumina2(JObject h) => h.ContainsKey("model.diffusion_model.cap_embedder.0.weight") || h.ContainsKey("cap_embedder.0.weight");
        bool tryGetWanTok(JObject h, out JToken tok) => h.TryGetValue("model.diffusion_model.blocks.0.cross_attn.k.bias", out tok) || h.TryGetValue("blocks.0.cross_attn.k.bias", out tok) || h.TryGetValue("lora_unet_blocks_0_cross_attn_k.lora_down.weight", out tok);
        bool tryGetPatchEmbedTok(JObject h, out JToken tok) => h.TryGetValue("patch_embedding.weight", out tok) || h.TryGetValue("model.diffusion_model.patch_embedding.weight", out tok);
        bool isWan21_1_3b(JObject h) => tryGetWanTok(h, out JToken tok) && tok["shape"].ToArray()[0].Value<long>() == 1536;
        bool isWan21_14b(JObject h) => tryGetWanTok(h, out JToken tok) && tok["shape"].ToArray()[0].Value<long>() == 5120;
        bool isWan22_5b(JObject h) => tryGetWanTok(h, out JToken tok) && tok["shape"].ToArray()[0].Value<long>() == 3072;
        bool tryGetWanLoraTok(JObject h, out JToken tok) => h.TryGetValue("diffusion_model.blocks.0.cross_attn.k.lora_A.weight", out tok) || h.TryGetValue("blocks.0.cross_attn.k.lora_A.weight", out tok) || h.TryGetValue("diffusion_model.blocks.0.cross_attn.k.lora_down.weight", out tok) || h.TryGetValue("blocks.0.cross_attn.k.lora_down.weight", out tok) || h.TryGetValue("diffusion_model.blocks.1.cross_attn.k.lora_down.weight", out tok) || h.TryGetValue("blocks.1.cross_attn.k.lora_down.weight", out tok) || h.TryGetValue("lora_unet_blocks_0_cross_attn_k.lora_down.weight", out tok);
        bool isWan21_1_3bLora(JObject h) => tryGetWanLoraTok(h, out JToken tok) && tok["shape"].ToArray()[1].Value<long>() == 1536;
        bool isWan21_14bLora(JObject h) => tryGetWanLoraTok(h, out JToken tok) && tok["shape"].ToArray()[1].Value<long>() == 5120;
        bool isWanI2v(JObject h) => h.ContainsKey("model.diffusion_model.blocks.0.cross_attn.k_img.bias") || h.ContainsKey("blocks.0.cross_attn.k_img.bias");
        bool hasWani2vpatch(JObject h) => tryGetPatchEmbedTok(h, out JToken tok) && (tok["shape"].ToArray()[1].Value<long>() == 36 || tok["shape"].ToArray()[^2].Value<long>() == 36); // gguf convs have a reversed shape? wtf?
        bool isWan21i2v(JObject h) => h.ContainsKey("img_emb.proj.0.bias");
        bool isWanflf2v(JObject h) => h.ContainsKey("model.diffusion_model.img_emb.emb_pos") || h.ContainsKey("img_emb.emb_pos");
        bool isWanVace(JObject h) => h.ContainsKey("model.diffusion_model.vace_blocks.0.after_proj.bias") || h.ContainsKey("vace_blocks.0.after_proj.bias");
        bool isHiDream(JObject h) => h.ContainsKey("caption_projection.0.linear.weight");
        bool isHiDreamLora(JObject h) => h.ContainsKey("diffusion_model.double_stream_blocks.0.block.ff_i.shared_experts.w1.lora_A.weight");
        bool isChroma(JObject h) => h.ContainsKey("distilled_guidance_layer.in_proj.bias") && h.ContainsKey("double_blocks.0.img_attn.proj.bias");
        bool isChromaRadiance(JObject h) => h.ContainsKey("nerf_image_embedder.embedder.0.bias");
        bool isOmniGen(JObject h) => h.ContainsKey("time_caption_embed.timestep_embedder.linear_2.weight") && h.ContainsKey("context_refiner.0.attn.norm_k.weight");
        bool isQwenImage(JObject h) => (h.ContainsKey("time_text_embed.timestep_embedder.linear_1.bias") && h.ContainsKey("img_in.bias") && (h.ContainsKey("transformer_blocks.0.attn.add_k_proj.bias") || h.ContainsKey("transformer_blocks.0.attn.add_qkv_proj.bias")))
            || (h.ContainsKey("model.diffusion_model.time_text_embed.timestep_embedder.linear_1.bias") && h.ContainsKey("model.diffusion_model.img_in.bias") && (h.ContainsKey("model.diffusion_model.transformer_blocks.0.attn.add_k_proj.bias") || h.ContainsKey("model.diffusion_model.transformer_blocks.0.attn.add_qkv_proj.bias")));
        bool isQwenImageLora(JObject h) => (h.ContainsKey("transformer_blocks.0.attn.add_k_proj.lora_down.weight") && h.ContainsKey("transformer_blocks.0.img_mlp.net.0.proj.lora_down.weight"))
                                            || (h.ContainsKey("transformer.transformer_blocks.0.attn.to_k.lora.down.weight") && h.ContainsKey("transformer.transformer_blocks.0.attn.to_out.0.lora.down.weight"))
                                            || (h.ContainsKey("transformer_blocks.0.attn.add_k_proj.lora_A.default.weight") && h.ContainsKey("transformer_blocks.0.img_mlp.net.2.lora_A.default.weight"))
                                            || (h.ContainsKey("diffusion_model.transformer_blocks.0.attn.add_k_proj.lora_A.weight") && h.ContainsKey("diffusion_model.transformer_blocks.0.img_mlp.net.2.lora_A.weight"))
                                            || (h.ContainsKey("lora_unet_transformer_blocks_0_attn_add_k_proj.lora_down.weight") && h.ContainsKey("lora_unet_transformer_blocks_0_img_mlp_net_0_proj.lora_down.weight"));
        bool isControlnetX(JObject h) => h.ContainsKey("controlnet_x_embedder.weight");
        bool isHyImg(JObject h) => h.ContainsKey("byt5_in.fc1.bias") && h.ContainsKey("double_blocks.0.img_attn_k_norm.weight");
        bool isHyImgRefiner(JObject h) => h.ContainsKey("double_blocks.0.img_attn_k_norm.weight") && h.TryGetValue("time_r_in.mlp.0.bias", out JToken timeTok) && timeTok["shape"].ToArray()[0].Value<long>() == 3328;
        bool isAuraFlow(JObject h) => h.ContainsKey("model.cond_seq_linear.weight") && h.ContainsKey("model.double_layers.0.attn.w1k.weight");
        // ====================== Stable Diffusion v1 ======================
        T2IModelCompatClass compatSdv1 = RegisterCompat(new() { ID = "stable-diffusion-v1", ShortCode = "SDv1" });
        Register(new() { ID = "stable-diffusion-v1", CompatClass = compatSdv1, Name = "Stable Diffusion v1", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV1(h) && !IsAlt(h) && !isV2(h) && !isXL09Base(h) && !isSD3Med(h) && !isSD3Large(h) && !isV1CNet(h);
        }});
        Register(new() { ID = "stable-diffusion-v1-inpainting", CompatClass = compatSdv1, Name = "Stable Diffusion v1 (Inpainting)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO: How to detect accurately?
        }});
        Register(new() { ID = "stable-diffusion-v1/lora", CompatClass = compatSdv1, Name = "Stable Diffusion v1 LoRA", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV1Lora(h) && !isXLLora(h);
        }});
        Register(new() { ID = "stable-diffusion-v1/controlnet", CompatClass = compatSdv1, Name = "Stable Diffusion v1 ControlNet", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV1CNet(h) && !isControlLora(h) && !isDitControlnet(h);
        }});
        JToken GetEmbeddingKey(JObject h)
        {
            if (h.TryGetValue("emb_params", out JToken emb_data))
            {
                return emb_data;
            }
            JProperty[] props = [.. h.Properties().Where(p => p.Name.StartsWith('<') && p.Name.EndsWith('>'))];
            if (props.Length == 1)
            {
                return props[0].Value;
            }
            return null;
        }
        Register(new() { ID = "stable-diffusion-v1/textual-inversion", CompatClass = compatSdv1, Name = "Stable Diffusion v1 Embedding", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            JToken emb_data = GetEmbeddingKey(h);
            if (emb_data is null || !(emb_data as JObject).TryGetValue("shape", out JToken shape))
            {
                return false;
            }
            return shape.ToArray()[^1].Value<long>() == 768;
        }});
        // ====================== Stable Diffusion v2 ======================
        T2IModelCompatClass compatSdv2 = RegisterCompat(new() { ID = "stable-diffusion-v2", ShortCode = "SDv2" });
        Register(new() { ID = "stable-diffusion-v2-512", CompatClass = compatSdv2, Name = "Stable Diffusion v2-512", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV2(h) && !isV2Unclip(h) && isv2512name(m.Name) && !isV2Depth(h);
        }});
        Register(new() { ID = "stable-diffusion-v2-768-v", CompatClass = compatSdv2, Name = "Stable Diffusion v2-768v", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
        {
            return isV2(h) && !isV2Unclip(h) && !isv2512name(m.Name);
        }});
        Register(new() { ID = "stable-diffusion-v2-inpainting", CompatClass = compatSdv2, Name = "Stable Diffusion v2 (Inpainting)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO: How to detect accurately?
        }});
        Register(new() { ID = "stable-diffusion-v2-depth", CompatClass = compatSdv2, Name = "Stable Diffusion v2 (Depth)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV2Depth(h);
        }});
        Register(new() { ID = "stable-diffusion-v2-unclip", CompatClass = compatSdv2, Name = "Stable Diffusion v2 (Unclip)", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
        {
            return isV2Unclip(h);
        }});
        Register(new() { ID = "stable-diffusion-v2-768-v/textual-inversion", CompatClass = compatSdv2, Name = "Stable Diffusion v2 Embedding", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
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
        T2IModelCompatClass compatSdv2Turbo = RegisterCompat(new() { ID = "stable-diffusion-v2-turbo", ShortCode = "SDv2" });
        Register(new() { ID = "stable-diffusion-v2-turbo", CompatClass = compatSdv2Turbo, Name = "Stable Diffusion v2 Turbo", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isTurbo21(h);
        }});
        // ====================== Stable Diffusion XL ======================
        T2IModelCompatClass compatSdxl = RegisterCompat(new() { ID = "stable-diffusion-xl-v1", ShortCode = "SDXL" });
        Register(new() { ID = "stable-diffusion-xl-v1-base", CompatClass = compatSdxl, Name = "Stable Diffusion XL 1.0-Base", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return Program.ServerSettings.Metadata.XLDefaultAsXL1 && isXL09Base(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v0_9-base", CompatClass = compatSdxl, Name = "Stable Diffusion XL 0.9-Base", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return !Program.ServerSettings.Metadata.XLDefaultAsXL1 && isXL09Base(h);
        }});
        T2IModelCompatClass compatSdxlRefiner = RegisterCompat(new() { ID = "stable-diffusion-xl-v1-refiner", ShortCode = "SDXL" });
        Register(new() { ID = "stable-diffusion-xl-v0_9-refiner", CompatClass = compatSdxlRefiner, Name = "Stable Diffusion XL 0.9-Refiner", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isXL09Refiner(h) && !isTurbo21(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v1-base/lora", CompatClass = compatSdxl, Name = "Stable Diffusion XL 1.0-Base LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isXLLora(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v1-base/controlnet", CompatClass = compatSdxl, Name = "Stable Diffusion XL 1.0-Base ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isXLControlnet(h) && !isDitControlnet(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v1-base/textual-inversion", CompatClass = compatSdxl, Name = "Stable Diffusion XL 1.0-Base Embedding", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return h.TryGetValue("clip_g", out JToken clip_g) && (clip_g as JObject).TryGetValue("shape", out JToken shape_g) && shape_g[1].Value<long>() == 1280
                && h.TryGetValue("clip_l", out JToken clip_l) && (clip_l as JObject).TryGetValue("shape", out JToken shape_l) && shape_l[1].Value<long>() == 768;
        }});
        // ====================== Stable Video Diffusion ======================
        T2IModelCompatClass compatSvd = RegisterCompat(new() { ID = "stable-video-diffusion-img2vid-v1", ShortCode = "SVD", IsImage2Video = true });
        Register(new() { ID = "stable-video-diffusion-img2vid-v0_9", CompatClass = compatSvd, Name = "Stable Video Diffusion Img2Vid 0.9", StandardWidth = 1024, StandardHeight = 576, IsThisModelOfClass = (m, h) =>
        {
            return isSVD(h);
        }});
        // ====================== Mochi (Genmo video) ======================
        T2IModelCompatClass compatGenmoMochi = RegisterCompat(new() { ID = "genmo-mochi-1", IsText2Video = true, ShortCode = "Mochi" });
        Register(new() { ID = "genmo-mochi-1", CompatClass = compatGenmoMochi, Name = "Genmo Mochi 1", StandardWidth = 848, StandardHeight = 480, IsThisModelOfClass = (m, h) =>
        {
            return isMochi(h);
        }});
        Register(new() { ID = "genmo-mochi-1/vae", CompatClass = compatGenmoMochi, Name = "Genmo Mochi 1 VAE", StandardWidth = 848, StandardHeight = 480, IsThisModelOfClass = (m, h) =>
        {
            return isMochiVae(h);
        }});
        // ====================== Stable Cascade ======================
        T2IModelCompatClass compatCascade = RegisterCompat(new() { ID = "stable-cascade-v1", ShortCode = "Casc" });
        Register(new() { ID = "stable-cascade-v1-stage-a/vae", CompatClass = compatCascade, Name = "Stable Cascade v1 (Stage A)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
             return isCascadeA(h) && !isCascadeB(h) && !isCascadeC(h);
        }});
        Register(new() { ID = "stable-cascade-v1-stage-b", CompatClass = compatCascade, Name = "Stable Cascade v1 (Stage B)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isCascadeB(h);
        }});
        Register(new() { ID = "stable-cascade-v1-stage-c", CompatClass = compatCascade, Name = "Stable Cascade v1 (Stage C)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isCascadeC(h);
        }});
        // ====================== Stable Diffusion v3 ======================
        T2IModelCompatClass compatSd3Medium = RegisterCompat(new() { ID = "stable-diffusion-v3-medium", ShortCode = "SD3m" });
        Register(new() { ID = "stable-diffusion-v3-medium", CompatClass = compatSd3Medium, Name = "Stable Diffusion 3 Medium", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD3Med(h);
        }});
        T2IModelCompatClass compatSd35Large = RegisterCompat(new() { ID = "stable-diffusion-v3.5-large", ShortCode = "SD35L" });
        Register(new() { ID = "stable-diffusion-v3.5-large", CompatClass = compatSd35Large, Name = "Stable Diffusion 3.5 Large", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD3Large(h);
        }});
        T2IModelCompatClass compatSd35Medium = RegisterCompat(new() { ID = "stable-diffusion-v3.5-medium", ShortCode = "SD35m" });
        Register(new() { ID = "stable-diffusion-v3.5-medium", CompatClass = compatSd35Medium, Name = "Stable Diffusion 3.5 Medium", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "stable-diffusion-v3-medium/lora", CompatClass = compatSd3Medium, Name = "Stable Diffusion 3 Medium LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO: ?
        }});
        Register(new() { ID = "stable-diffusion-v3.5-large/lora", CompatClass = compatSd35Large, Name = "Stable Diffusion 3.5 Large LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD35Lora(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-medium/lora", CompatClass = compatSd35Medium, Name = "Stable Diffusion 3.5 Medium LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "stable-diffusion-v3-medium/controlnet", CompatClass = compatSd3Medium, Name = "Stable Diffusion 3 Medium ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD3Controlnet(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-large/controlnet", CompatClass = compatSd35Large, Name = "Stable Diffusion 3.5 Large ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSd35LargeControlnet(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-medium/controlnet", CompatClass = compatSd35Medium, Name = "Stable Diffusion 3.5 Medium ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        T2IModelCompatClass compatSd3 = RegisterCompat(new() { ID = "stable-diffusion-v3", ShortCode = "SD3" });
        Register(new() { ID = "stable-diffusion-v3/vae", CompatClass = compatSd3, Name = "Stable Diffusion 3 VAE", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        // ====================== BFL Flux.1 ======================
        T2IModelCompatClass compatFlux = RegisterCompat(new() { ID = "flux-1", ShortCode = "Flux" });
        Register(new() { ID = "flux.1/vae", CompatClass = compatFlux, Name = "Flux.1 Autoencoder", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "Flux.1-schnell", CompatClass = compatFlux, Name = "Flux.1 Schnell", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxSchnell(h) && !isChroma(h);
        }});
        Register(new() { ID = "Flux.1-dev", CompatClass = compatFlux, Name = "Flux.1 Dev", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxDev(h);
        }});
        Register(new() { ID = "Flux.1-dev/lora", CompatClass = compatFlux, Name = "Flux.1 LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxLora(h);
        }});
        Register(new() { ID = "Flux.1-dev/depth", CompatClass = compatFlux, Name = "Flux.1 Depth", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/canny", CompatClass = compatFlux, Name = "Flux.1 Canny", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/inpaint", CompatClass = compatFlux, Name = "Flux.1 Fill/Inpaint", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/kontext", CompatClass = compatFlux, Name = "Flux.1 Kontext Dev", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false; // ???
        }});
        Register(new() { ID = "Flux.1-dev/lora-depth", CompatClass = compatFlux, Name = "Flux.1 Depth LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/lora-canny", CompatClass = compatFlux, Name = "Flux.1 Canny LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/controlnet", CompatClass = compatFlux, Name = "Flux.1 ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxControlnet(h);
        }});
        Register(new() { ID = "flux.1-dev/controlnet-alimamainpaint", CompatClass = compatFlux, Name = "Flux.1 ControlNet - AliMama Inpaint", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        // ====================== Wan Video ======================
        T2IModelCompatClass compatWan21 = RegisterCompat(new() { ID = "wan-21", ShortCode = "Wan14B", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true });
        Register(new() { ID = "wan-2_1-text2video/vae", CompatClass = compatWan21, Name = "Wan 2.1 VAE", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) => { return false; }});
        T2IModelCompatClass compatWan21_1_3b = RegisterCompat(new() { ID = "wan-21-1_3b", ShortCode = "Wan1B", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true });
        Register(new() { ID = "wan-2_1-text2video-1_3b", CompatClass = compatWan21_1_3b, Name = "Wan 2.1 Text2Video 1.3B", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_1_3b(h) && !isWanI2v(h) && !isWanVace(h);
        }});
        Register(new() { ID = "wan-2_1-image2video-1_3b", CompatClass = compatWan21_1_3b, Name = "Wan 2.1 Image2Video 1.3B", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_1_3b(h) && isWanI2v(h) && !isWanVace(h);
        }});
        Register(new() { ID = "wan-2_1-text2video-1_3b/lora", CompatClass = compatWan21_1_3b, Name = "Wan 2.1 Text2Video 1.3B LoRA", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_1_3bLora(h);
        }});
        T2IModelCompatClass compatWan21_14b = RegisterCompat(new() { ID = "wan-21-14b", ShortCode = "Wan14B", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true });
        Register(new() { ID = "wan-2_1-text2video-14b", CompatClass = compatWan21_14b, Name = "Wan 2.1 Text2Video 14B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && !isWanI2v(h) && !isWanVace(h) && !hasWani2vpatch(h);
        }});
        Register(new() { ID = "wan-2_1-text2video-14b/lora", CompatClass = compatWan21_14b, Name = "Wan 2.1 14B LoRA", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14bLora(h);
        }});
        Register(new() { ID = "wan-2_1-image2video-14b", CompatClass = compatWan21_14b, Name = "Wan 2.1 Image2Video 14B", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && isWan21i2v(h) && isWanI2v(h) && !isWanflf2v(h) && !isWanVace(h);
        }});
        Register(new() { ID = "wan-2_1-flf2v-14b", CompatClass = compatWan21_14b, Name = "Wan 2.1 First/LastFrame2Video 14B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && isWanI2v(h) && isWanflf2v(h) && !isWanVace(h);
        }});
        Register(new() { ID = "wan-2_1-vace-14b", CompatClass = compatWan21_14b, Name = "Wan 2.1 Vace 14B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && !isWanflf2v(h) && isWanVace(h);
        }});
        Register(new() { ID = "wan-2_1-vace-1_3b", CompatClass = compatWan21_1_3b, Name = "Wan 2.1 Vace 1.3B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_1_3b(h) && !isWanflf2v(h) && isWanVace(h);
        }});
        T2IModelCompatClass compatWan22_5b = RegisterCompat(new() { ID = "wan-22-5b", ShortCode = "Wan5B", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true });
        Register(new() { ID = "wan-2_2-ti2v-5b", CompatClass = compatWan22_5b, Name = "Wan 2.2 Text/Image2Video 5B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan22_5b(h);
        }});
        Register(new() { ID = "wan-2_2-ti2v-5b/lora", CompatClass = compatWan22_5b, Name = "Wan 2.2 Text/Image2Video 5B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO
        }});
        Register(new() { ID = "wan-2_2-image2video-14b", CompatClass = compatWan21_14b, Name = "Wan 2.2 Image2Video 14B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && hasWani2vpatch(h) && !isWanI2v(h) && !isWan21i2v(h);
        }});
        // ====================== Hunyuan Video ======================
        T2IModelCompatClass compatHunyuanVideo = RegisterCompat(new() { ID = "hunyuan-video", ShortCode = "HyVid", IsText2Video = true, IsImage2Video = true });
        Register(new() { ID = "hunyuan-video", CompatClass = compatHunyuanVideo, Name = "Hunyuan Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideo(h) && !isHunyuanVideoNativeImage2V(h) && !isHyImg(h) && !isHyImgRefiner(h) && !isHunyuanVideoSkyreelsImage2V(h);
        }});
        Register(new() { ID = "hunyuan-video-skyreels", CompatClass = compatHunyuanVideo, Name = "Hunyuan Video - SkyReels Text2Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "hunyuan-video-skyreels-i2v", CompatClass = compatHunyuanVideo, Name = "Hunyuan Video - SkyReels Image2Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideo(h) && isHunyuanVideoSkyreelsImage2V(h) && !isHyImg(h) && !isHyImgRefiner(h);
        }});
        Register(new() { ID = "hunyuan-video-i2v", CompatClass = compatHunyuanVideo, Name = "Hunyuan Video - Image2Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideo(h) && isHunyuanVideoNativeImage2V(h) && !isHyImg(h) && !isHyImgRefiner(h);
        }});
        Register(new() { ID = "hunyuan-video-i2v-v2", CompatClass = compatHunyuanVideo, Name = "Hunyuan Video - Image2Video v2 ('Fixed')", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "hunyuan-video/vae", CompatClass = compatHunyuanVideo, Name = "Hunyuan Video VAE", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideoVae(h);
        }});
        Register(new() { ID = "hunyuan-video/lora", CompatClass = compatHunyuanVideo, Name = "Hunyuan Video LoRA", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideoLora(h);
        }});
        // ====================== Nvidia Cosmos ======================
        T2IModelCompatClass compatCosmos = RegisterCompat(new() { ID = "nvidia-cosmos-1", ShortCode = "Cosmos", IsText2Video = true, IsImage2Video = true });
        Register(new() { ID = "nvidia-cosmos-1-7b-text2world", CompatClass = compatCosmos, Name = "NVIDIA Cosmos 1.0 Diffusion (7B) Text2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos7b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 68;
        }});
        Register(new() { ID = "nvidia-cosmos-1-14b-text2world", CompatClass = compatCosmos, Name = "NVIDIA Cosmos 1.0 Diffusion (14B) Text2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos14b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 68;
        }});
        Register(new() { ID = "nvidia-cosmos-1-7b-video2world", CompatClass = compatCosmos, Name = "NVIDIA Cosmos 1.0 Diffusion (7B) Video2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos7b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 72;
        }});
        Register(new() { ID = "nvidia-cosmos-1-14b-video2world", CompatClass = compatCosmos, Name = "NVIDIA Cosmos 1.0 Diffusion (14B) Video2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos14b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 72;
        }});
        Register(new() { ID = "nvidia-cosmos-1/vae", CompatClass = compatCosmos, Name = "NVIDIA Cosmos 1.0 Diffusion VAE", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmosVae(h);
        }});
        // ====================== Nvidia Cosmos Predict2 ======================
        T2IModelCompatClass compatCosmosPredict2_2b = RegisterCompat(new() { ID = "nvidia-cosmos-predict2-t2i-2b", ShortCode = "Pred2", IsText2Video = true });
        Register(new() { ID = "nvidia-cosmos-predict2-t2i-2b", CompatClass = compatCosmosPredict2_2b, Name = "NVIDIA Cosmos Predict2 Text2Image 2B", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isCosmosPredict2_2B(h);
        }});
        T2IModelCompatClass compatCosmosPredict2_14b = RegisterCompat(new() { ID = "nvidia-cosmos-predict2-t2i-14b", ShortCode = "Pred2", IsText2Video = true });
        Register(new() { ID = "nvidia-cosmos-predict2-t2i-14b", CompatClass = compatCosmosPredict2_14b, Name = "NVIDIA Cosmos Predict2 Text2Image 14B", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isCosmosPredict2_14B(h);
        }});
        // ====================== Random Other Models ======================
        T2IModelCompatClass compatChroma = RegisterCompat(new() { ID = "chroma", ShortCode = "Chroma" });
        Register(new() { ID = "chroma", CompatClass = compatChroma, Name = "Chroma", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isChroma(h) && !isChromaRadiance(h);
        }});
        T2IModelCompatClass compatChromaRadiance = RegisterCompat(new() { ID = "chroma-radiance", ShortCode = "ChrRad" });
        Register(new() { ID = "chroma-radiance", CompatClass = compatChromaRadiance, Name = "Chroma Radiance", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isChroma(h) && isChromaRadiance(h);
        }});
        T2IModelCompatClass compatAltDiffusion = RegisterCompat(new() { ID = "alt_diffusion_v1", ShortCode = "AltD" });
        Register(new() { ID = "alt_diffusion_v1_512_placeholder", CompatClass = compatAltDiffusion, Name = "Alt-Diffusion", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return IsAlt(h);
        }});
        T2IModelCompatClass compatLtxv = RegisterCompat(new() { ID = "lightricks-ltx-video", ShortCode = "LTXV" });
        Register(new() { ID = "lightricks-ltx-video", CompatClass = compatLtxv, Name = "Lightricks LTX Video", StandardWidth = 768, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isLtxv(h);
        }});
        Register(new() { ID = "lightricks-ltx-video/vae", CompatClass = compatLtxv, Name = "Lightricks LTX Video VAE", StandardWidth = 768, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isLtxvVae(h);
        }});
        T2IModelCompatClass compatSana = RegisterCompat(new() { ID = "nvidia-sana-1600", ShortCode = "Sana" });
        Register(new() { ID = "nvidia-sana-1600", CompatClass = compatSana, Name = "NVIDIA Sana 1600M", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSana(h);
        }});
        Register(new() { ID = "nvidia-sana-1600/vae", CompatClass = compatSana, Name = "NVIDIA Sana 1600M DC-AE VAE", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return h.ContainsKey("decoder.stages.0.0.main.conv.bias");
        }});
        T2IModelCompatClass compatLumina2 = RegisterCompat(new() { ID = "lumina-2", ShortCode = "Lumi2" });
        Register(new() { ID = "lumina-2", CompatClass = compatLumina2, Name = "Lumina 2", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isLumina2(h);
        }});
        T2IModelCompatClass compatHiDreamI1 = RegisterCompat(new() { ID = "hidream-i1", ShortCode = "HiDrm" });
        Register(new() { ID = "hidream-i1", CompatClass = compatHiDreamI1, Name = "HiDream i1", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isHiDream(h);
        }});
        Register(new() { ID = "hidream-i1-edit", CompatClass = compatHiDreamI1, Name = "HiDream i1 Edit", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
        {
            return false; // Must manual edit, seems undetectable?
        }});
        Register(new() { ID = "hidream-i1/lora", CompatClass = compatHiDreamI1, Name = "HiDream i1 LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isHiDreamLora(h);
        }});
        T2IModelCompatClass compatOmniGen2 = RegisterCompat(new() { ID = "omnigen-2", ShortCode = "Omni2" });
        Register(new() { ID = "omnigen-2", CompatClass = compatOmniGen2, Name = "OmniGen 2", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isOmniGen(h);
        }});
        T2IModelCompatClass compatQwenImage = RegisterCompat(new() { ID = "qwen-image", ShortCode = "Qwen" });
        Register(new() { ID = "qwen-image", CompatClass = compatQwenImage, Name = "Qwen Image", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return isQwenImage(h) && !isControlnetX(h) && !isSD3Controlnet(h);
        }});
        Register(new() { ID = "qwen-image-edit", CompatClass = compatQwenImage, Name = "Qwen Image Edit", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "qwen-image-edit-plus", CompatClass = compatQwenImage, Name = "Qwen Image Edit Plus", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "qwen-image/controlnet", CompatClass = compatQwenImage, Name = "Qwen Image Controlnet", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return isQwenImage(h) && isControlnetX(h) &&!isFluxControlnet(h);
        }});
        Register(new() { ID = "qwen-image/vae", CompatClass = compatQwenImage, Name = "Qwen Image VAE", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO?
        }});
        Register(new() { ID = "qwen-image/lora", CompatClass = compatQwenImage, Name = "Qwen Image LoRA", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return isQwenImageLora(h);
        }});
        T2IModelCompatClass compatAuraFlow = RegisterCompat(new() { ID = "auraflow-v1", ShortCode = "Aura" });
        Register(new() { ID = "auraflow-v1", CompatClass = compatAuraFlow, Name = "AuraFlow", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isAuraFlow(h);
        }});
        // ====================== Hunyuan Image 2.1 ======================
        T2IModelCompatClass compatHunyuanImage2_1 = RegisterCompat(new() { ID = "hunyuan-image-2_1", ShortCode = "HyImg" });
        Register(new() { ID = "hunyuan-image-2_1", CompatClass = compatHunyuanImage2_1, Name = "Hunyuan Image", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return isHyImg(h) && !isHyImgRefiner(h);
        }});
        Register(new() { ID = "hunyuan-image-2_1/lora", CompatClass = compatHunyuanImage2_1, Name = "Hunyuan Image LoRA", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "hunyuan-image-2_1/vae", CompatClass = compatHunyuanImage2_1, Name = "Hunyuan Image VAE", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        T2IModelCompatClass compatHunyuanImage2_1Refiner = RegisterCompat(new() { ID = "hunyuan-image-2_1-refiner", ShortCode = "HyImg" });
        Register(new() { ID = "hunyuan-image-2_1-refiner", CompatClass = compatHunyuanImage2_1Refiner, Name = "Hunyuan Image Refiner", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return isHyImgRefiner(h);
        }});
        Register(new() { ID = "hunyuan-image-2_1-refiner/lora", CompatClass = compatHunyuanImage2_1Refiner, Name = "Hunyuan Image Refiner LoRA", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "hunyuan-image-2_1-refiner/vae", CompatClass = compatHunyuanImage2_1Refiner, Name = "Hunyuan Image Refiner VAE", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        // ====================== Everything below this point does not autodetect, it must match through ModelSpec or be manually set ======================
        // General Stable Diffusion variants
        Register(new() { ID = "stable-diffusion-v1/vae", CompatClass = compatSdv1, Name = "Stable Diffusion v1 VAE", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v1/inpaint", CompatClass = compatSdv1, Name = "Stable Diffusion v1 (Inpainting)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v2-768-v/lora", CompatClass = compatSdv2, Name = "Stable Diffusion v2 LoRA", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-turbo-v1", CompatClass = compatSdxl, Name = "Stable Diffusion XL Turbo", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-refiner", CompatClass = compatSdxlRefiner, Name = "Stable Diffusion XL 1.0-Refiner", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-base/vae", CompatClass = compatSdxl, Name = "Stable Diffusion XL 1.0-Base VAE", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-edit", CompatClass = compatSdxl, Name = "Stable Diffusion XL 1.0 Edit", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-base/control-lora", CompatClass = compatSdxl, Name = "Stable Diffusion XL 1.0-Base Control-LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isControlLora(h);
        }});
        T2IModelCompatClass compatSegmindStableDiffusion1b = RegisterCompat(new() { ID = "segmind-stable-diffusion-1b", ShortCode = "SSD1B" });
        Register(new() { ID = "segmind-stable-diffusion-1b", CompatClass = compatSegmindStableDiffusion1b, Name = "Segmind Stable Diffusion 1B (SSD-1B)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-video-diffusion-img2vid-v1", CompatClass = compatSvd, Name = "Stable Video Diffusion Img2Vid v1", StandardWidth = 1024, StandardHeight = 576, IsThisModelOfClass = (m, h) => { return false; }});
        // TensorRT variants
        Register(new() { ID = "stable-diffusion-v1/tensorrt", CompatClass = compatSdv1, Name = "Stable Diffusion v1 (TensorRT Engine)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v2-768-v/tensorrt", CompatClass = compatSdv2, Name = "Stable Diffusion v2 (TensorRT Engine)", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v0_9-base/tensorrt", CompatClass = compatSdxl, Name = "Stable Diffusion XL 0.9-Base (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-base/tensorrt", CompatClass = compatSdxl, Name = "Stable Diffusion XL 1.0-Base (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v3-medium/tensorrt", CompatClass = compatSd3Medium, Name = "Stable Diffusion 3 Medium (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-turbo-v1/tensorrt", CompatClass = compatSdxl, Name = "Stable Diffusion XL Turbo (TensorRT Engine)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-refiner/tensorrt", CompatClass = compatSdxlRefiner, Name = "Stable Diffusion XL 1.0-Refiner (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-video-diffusion-img2vid-v1/tensorrt", CompatClass = compatSvd, Name = "Stable Video Diffusion Img2Vid v1 (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 576, IsThisModelOfClass = (m, h) => { return false; } });
        // Other model classes
        T2IModelCompatClass compatPixartMsSigmaXl2 = RegisterCompat(new() { ID = "pixart-ms-sigma-xl-2", ShortCode = "Pix" });
        Register(new() { ID = "pixart-ms-sigma-xl-2", CompatClass = compatPixartMsSigmaXl2, Name = "PixArtMS Sigma XL 2", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "pixart-ms-sigma-xl-2-2k", CompatClass = compatPixartMsSigmaXl2, Name = "PixArtMS Sigma XL 2 (2K)", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "auraflow-v1/tensorrt", CompatClass = compatAuraFlow, Name = "AuraFlow (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
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
        Remaps["stable-diffusion-v3.5-large-turbo"] = "stable-diffusion-v3.5-large";
        Remaps["stable-diffusion-3-3-5-medium"] = "stable-diffusion-v3.5-medium";
        Remaps["stable-diffusion-3-3-5-medium/lora"] = "stable-diffusion-v3.5-medium/lora";
        // ====================== GGUF Remaps ======================
        Remaps["flux"] = "Flux.1-dev";
        Remaps["sd3"] = "stable-diffusion-v3-medium";
        Remaps["hyvid"] = "hunyuan-video";
    }

    /// <summary>Returns the model class that matches this model, or null if none.</summary>
    public static T2IModelClass IdentifyClassFor(T2IModel model, JObject header, string modelType)
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
                    Logs.Debug($"{modelType} Model {model.Name} matches {clazz.Name} by architecture ID");
                    return clazz;
                }
                else
                {
                    Logs.Debug($"{modelType} Model {model.Name} matches {clazz.Name} by architecture ID, but resolution is different ({width}x{height} vs {clazz.StandardWidth}x{clazz.StandardHeight})");
                    return clazz with { StandardWidth = width, StandardHeight = height, IsThisModelOfClass = (m, h) => false };
                }
            }
            Logs.Debug($"{modelType} Model {model.Name} has unknown architecture ID {arch}");
        }
        if (!model.RawFilePath.EndsWith(".safetensors") && !model.RawFilePath.EndsWith(".sft") && header is null)
        {
            Logs.Debug($"{modelType} Model {model.Name} cannot have known type, not safetensors and no header");
            return null;
        }
        T2IModelClass matchedClass = null;
        foreach (T2IModelClass modelClass in ModelClasses.Values)
        {
            if (modelClass.IsThisModelOfClass(model, header))
            {
                if (matchedClass is not null)
                {
                    Logs.Info($"{modelType} Model {model.Name} matches {matchedClass.Name}, but seems to also match type {modelClass.Name}. Class sorter may need refinement.");
                }
                else
                {
                    Logs.Debug($"{modelType} Model {model.Name} seems to match type {modelClass.Name}");
                    matchedClass = modelClass;
                }
            }
        }
        if (matchedClass is not null)
        {
            return matchedClass;
        }
        if (modelType == "Stable-Diffusion" || modelType == "LoRA")
        {
            Logs.Info($"{modelType} Model {model.Name} did not match any of {ModelClasses.Count} options. Class sorter may need refinement, or you may have a model that is not natively supported in SwarmUI.");
        }
        else
        {
            Logs.Debug($"{modelType} Model {model.Name} did not match any of {ModelClasses.Count} options. Not all model types are expected to be tracked.");
        }
        return null;
    }
}
