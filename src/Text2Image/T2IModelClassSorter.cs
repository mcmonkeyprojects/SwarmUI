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
        ModelClasses.Add(clazz.ID.ToLowerFast(), clazz);
        return clazz;
    }

    /// <summary>Register a new model compat class to the sorter.</summary>
    public static T2IModelCompatClass RegisterCompat(T2IModelCompatClass clazz)
    {
        CompatClasses.Add(clazz.ID.ToLowerFast(), clazz);
        return clazz;
    }

    /// <summary>Core Compatibility classes.</summary>
    public static T2IModelCompatClass CompatSdv1 = RegisterCompat(new() { ID = "stable-diffusion-v1", ShortCode = "SDv1" }),
        CompatSdv2 = RegisterCompat(new() { ID = "stable-diffusion-v2", ShortCode = "SDv2" }),
        CompatSdv2Turbo = RegisterCompat(new() { ID = "stable-diffusion-v2-turbo", ShortCode = "SDv2" }),
        CompatSdxl = RegisterCompat(new() { ID = "stable-diffusion-xl-v1", ShortCode = "SDXL" }),
        CompatSdxlRefiner = RegisterCompat(new() { ID = "stable-diffusion-xl-v1-refiner", ShortCode = "SDXL" }),
        CompatSvd = RegisterCompat(new() { ID = "stable-video-diffusion-img2vid-v1", ShortCode = "SVD", IsImage2Video = true }),
        CompatGenmoMochi = RegisterCompat(new() { ID = "genmo-mochi-1", IsText2Video = true, ShortCode = "Mochi" }),
        CompatCascade = RegisterCompat(new() { ID = "stable-cascade-v1", ShortCode = "Casc" }),
        CompatSd3Medium = RegisterCompat(new() { ID = "stable-diffusion-v3-medium", ShortCode = "SD3m" }),
        CompatSd35Large = RegisterCompat(new() { ID = "stable-diffusion-v3.5-large", ShortCode = "SD35L" }),
        CompatSd35Medium = RegisterCompat(new() { ID = "stable-diffusion-v3.5-medium", ShortCode = "SD35m" }),
        CompatSd3 = RegisterCompat(new() { ID = "stable-diffusion-v3", ShortCode = "SD3" }),
        CompatFlux = RegisterCompat(new() { ID = "flux-1", ShortCode = "Flux", LorasTargetTextEnc = false }),
        CompatFlux2 = RegisterCompat(new() { ID = "flux-2", ShortCode = "Flux2", LorasTargetTextEnc = false }),
        CompatWan21 = RegisterCompat(new() { ID = "wan-21", ShortCode = "Wan14B", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true }),
        CompatWan21_1_3b = RegisterCompat(new() { ID = "wan-21-1_3b", ShortCode = "Wan1B", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true }),
        CompatWan21_14b = RegisterCompat(new() { ID = "wan-21-14b", ShortCode = "Wan14B", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true }),
        CompatWan22_5b = RegisterCompat(new() { ID = "wan-22-5b", ShortCode = "Wan5B", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true }),
        CompatHunyuanVideo = RegisterCompat(new() { ID = "hunyuan-video", ShortCode = "HyVid", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true }),
        CompatCosmos = RegisterCompat(new() { ID = "nvidia-cosmos-1", ShortCode = "Cosmos", IsText2Video = true, IsImage2Video = true }),
        CompatCosmosPredict2_2b = RegisterCompat(new() { ID = "nvidia-cosmos-predict2-t2i-2b", ShortCode = "Pred2", IsText2Video = true }),
        CompatCosmosPredict2_14b = RegisterCompat(new() { ID = "nvidia-cosmos-predict2-t2i-14b", ShortCode = "Pred2", IsText2Video = true }),
        CompatChroma = RegisterCompat(new() { ID = "chroma", ShortCode = "Chroma" }),
        CompatChromaRadiance = RegisterCompat(new() { ID = "chroma-radiance", ShortCode = "ChrRad" }),
        CompatAltDiffusion = RegisterCompat(new() { ID = "alt_diffusion_v1", ShortCode = "AltD" }),
        CompatLtxv = RegisterCompat(new() { ID = "lightricks-ltx-video", ShortCode = "LTXV", IsText2Video = true, IsImage2Video = true }),
        CompatLtxv2 = RegisterCompat(new() { ID = "lightricks-ltx-video-2", ShortCode = "LTXV2", IsText2Video = true, IsImage2Video = true }),
        CompatSana = RegisterCompat(new() { ID = "nvidia-sana-1600", ShortCode = "Sana" }),
        CompatLumina2 = RegisterCompat(new() { ID = "lumina-2", ShortCode = "Lumi2" }),
        CompatHiDreamI1 = RegisterCompat(new() { ID = "hidream-i1", ShortCode = "HiDrm", LorasTargetTextEnc = false }),
        CompatOmniGen2 = RegisterCompat(new() { ID = "omnigen-2", ShortCode = "Omni2" }),
        CompatQwenImage = RegisterCompat(new() { ID = "qwen-image", ShortCode = "Qwen", LorasTargetTextEnc = false }),
        CompatAuraFlow = RegisterCompat(new() { ID = "auraflow-v1", ShortCode = "Aura" }),
        CompatHunyuanImage2_1 = RegisterCompat(new() { ID = "hunyuan-image-2_1", ShortCode = "HyImg", LorasTargetTextEnc = false }),
        CompatHunyuanImage2_1Refiner = RegisterCompat(new() { ID = "hunyuan-image-2_1-refiner", ShortCode = "HyImg", LorasTargetTextEnc = false }),
        CompatHunyuanVideo1_5 = RegisterCompat(new() { ID = "hunyuan-video-1_5", ShortCode = "HyVid", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true }),
        CompatSegmindStableDiffusion1b = RegisterCompat(new() { ID = "segmind-stable-diffusion-1b", ShortCode = "SSD1B" }),
        CompatPixartMsSigmaXl2 = RegisterCompat(new() { ID = "pixart-ms-sigma-xl-2", ShortCode = "Pix" }),
        CompatZImage = RegisterCompat(new() { ID = "z-image", ShortCode = "ZImg", LorasTargetTextEnc = false }),
        CompatOvis = RegisterCompat(new() { ID = "ovis", ShortCode = "Ovis", LorasTargetTextEnc = false }),
        CompatKandinsky5ImgLite = RegisterCompat(new() { ID = "kandinsky5-imglite", ShortCode = "Kan5IL", LorasTargetTextEnc = false }),
        CompatKandinsky5VidLite = RegisterCompat(new() { ID = "kandinsky5-vidlite", ShortCode = "Kan5VL", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true }),
        CompatKandinsky5VidPro = RegisterCompat(new() { ID = "kandinsky5-vidpro", ShortCode = "Kan5VP", LorasTargetTextEnc = false, IsText2Video = true, IsImage2Video = true });

    /// <summary>Initialize the class sorter.</summary>
    public static void Init()
    {
        bool hasKey(JObject h, string key) => h.ContainsKey(key) || h.ContainsKey($"diffusion_model.{key}") || h.ContainsKey($"model.diffusion_model.{key}");
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
        bool isFluxSchnell(JObject h) => hasKey(h, "double_blocks.0.img_attn.norm.key_norm.scale") && !hasKey(h, "guidance_in.in_layer.bias");
        bool isFluxDev(JObject h) => (hasKey(h, "double_blocks.0.img_attn.norm.key_norm.scale") && hasKey(h, "guidance_in.in_layer.bias")) // 'diffusion_models'
                || (h.ContainsKey("time_text_embed.guidance_embedder.linear_1.weight") && h.ContainsKey("single_transformer_blocks.0.attn.norm_k.weight") && h.ContainsKey("transformer_blocks.0.attn.add_k_proj.weight") && h.ContainsKey("single_transformer_blocks.0.proj_mlp.weight")) // tencent funky models
                || (h.ContainsKey("single_transformer_blocks.0.norm.linear.qweight") && h.ContainsKey("transformer_blocks.0.mlp_context_fc1.bias") && (h.ContainsKey("transformer_blocks.0.mlp_context_fc1.wscales") || h.ContainsKey("transformer_blocks.0.mlp_context_fc1.wtscale"))); // Nunchaku
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
        bool isFlux2Dev(JObject h) => hasKey(h, "double_stream_modulation_img.lin.weight");
        bool isFlux2DevLora(JObject h) => h.ContainsKey("diffusion_model.single_blocks.47.linear2.lora_A.weight");
        bool isSD35Lora(JObject h) => h.ContainsKey("transformer.transformer_blocks.0.attn.to_k.lora_A.weight") && !isFluxLora(h);
        bool isMochi(JObject h) => hasKey(h, "blocks.0.attn.k_norm_x.weight");
        bool isMochiVae(JObject h) => h.ContainsKey("encoder.layers.4.layers.1.attn_block.attn.qkv.weight") || h.ContainsKey("layers.4.layers.1.attn_block.attn.qkv.weight") || h.ContainsKey("blocks.2.blocks.3.stack.5.weight") || h.ContainsKey("decoder.blocks.2.blocks.3.stack.5.weight");
        bool isLtxv(JObject h) => hasKey(h, "adaln_single.emb.timestep_embedder.linear_1.bias");
        bool isLtxvVae(JObject h) => h.ContainsKey("decoder.conv_in.conv.bias") && h.ContainsKey("decoder.last_time_embedder.timestep_embedder.linear_1.bias");
        bool isLtxv2(JObject h) => hasKey(h, "transformer_blocks.1.audio_to_video_attn.k_norm.weight");
        bool isLtxv2Lora(JObject h) => hasKey(h, "transformer_blocks.0.attn1.to_k.lora_A.weight") && hasKey(h, "transformer_blocks.0.attn1.to_out.0.lora_A.weight") && hasKey(h, "transformer_blocks.0.ff.net.0.proj.lora_A.weight");
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
        bool isLumina2(JObject h) => hasKey(h, "cap_embedder.0.weight");
        bool isZImage(JObject h) => (hasKey(h, "context_refiner.0.attention.k_norm.weight") || hasKey(h, "context_refiner.0.attention.norm_k.weight")) && hasKey(h, "layers.0.adaLN_modulation.0.bias");
        bool isOvis(JObject h) => hasKey(h, "double_blocks.0.img_mlp.down_proj.weight");
        bool isZImageLora(JObject h) => hasKey(h, "layers.0.adaLN_modulation.0.lora_A.weight") && hasKey(h, "layers.9.feed_forward.w3.lora_B.weight");
        bool isZImageControlNetDiffPatch(JObject h) => h.ContainsKey("control_layers.0.adaLN_modulation.0.weight") && h.ContainsKey("control_noise_refiner.0.adaLN_modulation.0.weight") && h.ContainsKey("control_layers.0.feed_forward.w3.weight");
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
        bool isWanflf2v(JObject h) => hasKey(h, "img_emb.emb_pos");
        bool isWanVace(JObject h) => hasKey(h, "vace_blocks.0.after_proj.bias");
        bool isHiDream(JObject h) => h.ContainsKey("caption_projection.0.linear.weight");
        bool isHiDreamLora(JObject h) => hasKey(h, "double_stream_blocks.0.block.ff_i.shared_experts.w1.lora_A.weight");
        bool isChroma(JObject h) => h.ContainsKey("distilled_guidance_layer.in_proj.bias") && h.ContainsKey("double_blocks.0.img_attn.proj.bias");
        bool isChromaRadiance(JObject h) => h.ContainsKey("nerf_image_embedder.embedder.0.bias");
        bool isOmniGen(JObject h) => h.ContainsKey("time_caption_embed.timestep_embedder.linear_2.weight") && h.ContainsKey("context_refiner.0.attn.norm_k.weight");
        bool isQwenImage(JObject h) => (h.ContainsKey("time_text_embed.timestep_embedder.linear_1.bias") && h.ContainsKey("img_in.bias") && (h.ContainsKey("transformer_blocks.0.attn.add_k_proj.bias") || h.ContainsKey("transformer_blocks.0.attn.add_qkv_proj.bias")))
            || (h.ContainsKey("model.diffusion_model.time_text_embed.timestep_embedder.linear_1.bias") && h.ContainsKey("model.diffusion_model.img_in.bias") && (h.ContainsKey("model.diffusion_model.transformer_blocks.0.attn.add_k_proj.bias") || h.ContainsKey("model.diffusion_model.transformer_blocks.0.attn.add_qkv_proj.bias")));
        bool isQwenImageEdit2511(JObject h) => h.ContainsKey("__index_timestep_zero__");
        bool isQwenImageLora(JObject h) => (h.ContainsKey("transformer_blocks.0.attn.add_k_proj.lora_down.weight") && h.ContainsKey("transformer_blocks.0.img_mlp.net.0.proj.lora_down.weight"))
                                            || (h.ContainsKey("transformer.transformer_blocks.0.attn.to_k.lora.down.weight") && h.ContainsKey("transformer.transformer_blocks.0.attn.to_out.0.lora.down.weight"))
                                            || (h.ContainsKey("transformer_blocks.0.attn.add_k_proj.lora_A.default.weight") && h.ContainsKey("transformer_blocks.0.img_mlp.net.2.lora_A.default.weight"))
                                            || (h.ContainsKey("diffusion_model.transformer_blocks.0.attn.add_k_proj.lora_A.weight") && h.ContainsKey("diffusion_model.transformer_blocks.0.img_mlp.net.2.lora_A.weight"))
                                            || (h.ContainsKey("lora_unet_transformer_blocks_0_attn_add_k_proj.lora_down.weight") && h.ContainsKey("lora_unet_transformer_blocks_0_img_mlp_net_0_proj.lora_down.weight"));
        bool isQwenImageControlnet(JObject h) => h.ContainsKey("controlnet_blocks.0.input_proj.weight") && h.ContainsKey("controlnet_blocks.0.x_rms.weight") && h.ContainsKey("controlnet_blocks.59.input_proj.bias") && h.ContainsKey("img_in.weight");
        bool isControlnetX(JObject h) => h.ContainsKey("controlnet_x_embedder.weight");
        bool isHyImg(JObject h) => h.ContainsKey("byt5_in.fc1.bias") && h.ContainsKey("double_blocks.0.img_attn_k_norm.weight");
        bool isHyVid15(JObject h) => h.ContainsKey("vision_in.proj.0.bias");
        bool isHyVid15Lora(JObject h) => hasKey(h, "cond_type_embedding.lora_down.weight") && hasKey(h, "byt5_in.fc1.lora_down.weight") && hasKey(h, "vision_in.proj.1.lora_down.weight");
        bool isHyImgRefiner(JObject h) => h.ContainsKey("double_blocks.0.img_attn_k_norm.weight") && h.TryGetValue("time_r_in.mlp.0.bias", out JToken timeTok) && timeTok["shape"].ToArray()[0].Value<long>() == 3328;
        bool isAuraFlow(JObject h) => h.ContainsKey("model.cond_seq_linear.weight") && h.ContainsKey("model.double_layers.0.attn.w1k.weight");
        bool isKandinsky5(JObject h) => hasKey(h, "pooled_text_embeddings.in_layer.weight") && hasKey(h, "text_transformer_blocks.0.feed_forward.in_layer.weight");
        bool tryGetKan5IdKey(JObject h, out JToken tok) => h.TryGetValue("text_embeddings.in_layer.weight", out tok);
        bool isKan5VidLite(JObject h) => tryGetKan5IdKey(h, out JToken tok) && tok["shape"].ToArray()[0].Value<long>() == 1792;
        bool isKan5ImgLite(JObject h) => tryGetKan5IdKey(h, out JToken tok) && tok["shape"].ToArray()[0].Value<long>() == 2560;
        bool isKan5VidPro(JObject h) => tryGetKan5IdKey(h, out JToken tok) && tok["shape"].ToArray()[0].Value<long>() == 4096;
        // ====================== Stable Diffusion v1 ======================
        Register(new() { ID = "stable-diffusion-v1", CompatClass = CompatSdv1, Name = "Stable Diffusion v1", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV1(h) && !IsAlt(h) && !isV2(h) && !isXL09Base(h) && !isSD3Med(h) && !isSD3Large(h) && !isV1CNet(h);
        }});
        Register(new() { ID = "stable-diffusion-v1-inpainting", CompatClass = CompatSdv1, Name = "Stable Diffusion v1 (Inpainting)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO: How to detect accurately?
        }});
        Register(new() { ID = "stable-diffusion-v1/lora", CompatClass = CompatSdv1, Name = "Stable Diffusion v1 LoRA", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV1Lora(h) && !isXLLora(h);
        }});
        Register(new() { ID = "stable-diffusion-v1/controlnet", CompatClass = CompatSdv1, Name = "Stable Diffusion v1 ControlNet", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
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
        Register(new() { ID = "stable-diffusion-v1/textual-inversion", CompatClass = CompatSdv1, Name = "Stable Diffusion v1 Embedding", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            JToken emb_data = GetEmbeddingKey(h);
            if (emb_data is null || !(emb_data as JObject).TryGetValue("shape", out JToken shape))
            {
                return false;
            }
            return shape.ToArray()[^1].Value<long>() == 768;
        }});
        // ====================== Stable Diffusion v2 ======================
        Register(new() { ID = "stable-diffusion-v2-512", CompatClass = CompatSdv2, Name = "Stable Diffusion v2-512", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV2(h) && !isV2Unclip(h) && isv2512name(m.Name) && !isV2Depth(h);
        }});
        Register(new() { ID = "stable-diffusion-v2-768-v", CompatClass = CompatSdv2, Name = "Stable Diffusion v2-768v", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
        {
            return isV2(h) && !isV2Unclip(h) && !isv2512name(m.Name);
        }});
        Register(new() { ID = "stable-diffusion-v2-inpainting", CompatClass = CompatSdv2, Name = "Stable Diffusion v2 (Inpainting)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO: How to detect accurately?
        }});
        Register(new() { ID = "stable-diffusion-v2-depth", CompatClass = CompatSdv2, Name = "Stable Diffusion v2 (Depth)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isV2Depth(h);
        }});
        Register(new() { ID = "stable-diffusion-v2-unclip", CompatClass = CompatSdv2, Name = "Stable Diffusion v2 (Unclip)", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
        {
            return isV2Unclip(h);
        }});
        Register(new() { ID = "stable-diffusion-v2-768-v/textual-inversion", CompatClass = CompatSdv2, Name = "Stable Diffusion v2 Embedding", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
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
        Register(new() { ID = "stable-diffusion-v2-turbo", CompatClass = CompatSdv2Turbo, Name = "Stable Diffusion v2 Turbo", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isTurbo21(h);
        }});
        // ====================== Stable Diffusion XL ======================
        Register(new() { ID = "stable-diffusion-xl-v1-base", CompatClass = CompatSdxl, Name = "Stable Diffusion XL 1.0-Base", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return Program.ServerSettings.Metadata.XLDefaultAsXL1 && isXL09Base(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v0_9-base", CompatClass = CompatSdxl, Name = "Stable Diffusion XL 0.9-Base", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return !Program.ServerSettings.Metadata.XLDefaultAsXL1 && isXL09Base(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v0_9-refiner", CompatClass = CompatSdxlRefiner, Name = "Stable Diffusion XL 0.9-Refiner", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isXL09Refiner(h) && !isTurbo21(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v1-base/lora", CompatClass = CompatSdxl, Name = "Stable Diffusion XL 1.0-Base LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isXLLora(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v1-base/controlnet", CompatClass = CompatSdxl, Name = "Stable Diffusion XL 1.0-Base ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isXLControlnet(h) && !isDitControlnet(h);
        }});
        Register(new() { ID = "stable-diffusion-xl-v1-base/textual-inversion", CompatClass = CompatSdxl, Name = "Stable Diffusion XL 1.0-Base Embedding", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return h.TryGetValue("clip_g", out JToken clip_g) && (clip_g as JObject).TryGetValue("shape", out JToken shape_g) && shape_g[1].Value<long>() == 1280
                && h.TryGetValue("clip_l", out JToken clip_l) && (clip_l as JObject).TryGetValue("shape", out JToken shape_l) && shape_l[1].Value<long>() == 768;
        }});
        // ====================== Stable Video Diffusion ======================
        Register(new() { ID = "stable-video-diffusion-img2vid-v0_9", CompatClass = CompatSvd, Name = "Stable Video Diffusion Img2Vid 0.9", StandardWidth = 1024, StandardHeight = 576, IsThisModelOfClass = (m, h) =>
        {
            return isSVD(h);
        }});
        // ====================== Mochi (Genmo video) ======================
        Register(new() { ID = "genmo-mochi-1", CompatClass = CompatGenmoMochi, Name = "Genmo Mochi 1", StandardWidth = 848, StandardHeight = 480, IsThisModelOfClass = (m, h) =>
        {
            return isMochi(h);
        }});
        Register(new() { ID = "genmo-mochi-1/vae", CompatClass = CompatGenmoMochi, Name = "Genmo Mochi 1 VAE", StandardWidth = 848, StandardHeight = 480, IsThisModelOfClass = (m, h) =>
        {
            return isMochiVae(h);
        }});
        // ====================== Stable Cascade ======================
        Register(new() { ID = "stable-cascade-v1-stage-a/vae", CompatClass = CompatCascade, Name = "Stable Cascade v1 (Stage A)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
             return isCascadeA(h) && !isCascadeB(h) && !isCascadeC(h);
        }});
        Register(new() { ID = "stable-cascade-v1-stage-b", CompatClass = CompatCascade, Name = "Stable Cascade v1 (Stage B)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isCascadeB(h);
        }});
        Register(new() { ID = "stable-cascade-v1-stage-c", CompatClass = CompatCascade, Name = "Stable Cascade v1 (Stage C)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isCascadeC(h);
        }});
        Register(new() { ID = "stable-cascade-v1-stage-c/controlnet", CompatClass = CompatCascade, Name = "Stable Cascade v1 (Stage C ControlNet)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        // ====================== Stable Diffusion v3 ======================
        Register(new() { ID = "stable-diffusion-v3-medium", CompatClass = CompatSd3Medium, Name = "Stable Diffusion 3 Medium", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD3Med(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-large", CompatClass = CompatSd35Large, Name = "Stable Diffusion 3.5 Large", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD3Large(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-medium", CompatClass = CompatSd35Medium, Name = "Stable Diffusion 3.5 Medium", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "stable-diffusion-v3-medium/lora", CompatClass = CompatSd3Medium, Name = "Stable Diffusion 3 Medium LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO: ?
        }});
        Register(new() { ID = "stable-diffusion-v3.5-large/lora", CompatClass = CompatSd35Large, Name = "Stable Diffusion 3.5 Large LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD35Lora(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-medium/lora", CompatClass = CompatSd35Medium, Name = "Stable Diffusion 3.5 Medium LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "stable-diffusion-v3-medium/controlnet", CompatClass = CompatSd3Medium, Name = "Stable Diffusion 3 Medium ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSD3Controlnet(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-large/controlnet", CompatClass = CompatSd35Large, Name = "Stable Diffusion 3.5 Large ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSd35LargeControlnet(h);
        }});
        Register(new() { ID = "stable-diffusion-v3.5-medium/controlnet", CompatClass = CompatSd35Medium, Name = "Stable Diffusion 3.5 Medium ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "stable-diffusion-v3/vae", CompatClass = CompatSd3, Name = "Stable Diffusion 3 VAE", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        // ====================== BFL Flux.1 ======================
        Register(new() { ID = "flux.1/vae", CompatClass = CompatFlux, Name = "Flux.1 Autoencoder", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "Flux.1-schnell", CompatClass = CompatFlux, Name = "Flux.1 Schnell", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxSchnell(h) && !isChroma(h) && !isFlux2Dev(h) && !isOvis(h);;
        }});
        Register(new() { ID = "Flux.1-dev", CompatClass = CompatFlux, Name = "Flux.1 Dev", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxDev(h) && !isFlux2Dev(h) && !isOvis(h);
        }});
        Register(new() { ID = "Flux.1-dev/lora", CompatClass = CompatFlux, Name = "Flux.1 LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxLora(h) && !isHyVid15Lora(h);
        }});
        Register(new() { ID = "Flux.1-dev/depth", CompatClass = CompatFlux, Name = "Flux.1 Depth", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/canny", CompatClass = CompatFlux, Name = "Flux.1 Canny", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/inpaint", CompatClass = CompatFlux, Name = "Flux.1 Fill/Inpaint", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/kontext", CompatClass = CompatFlux, Name = "Flux.1 Kontext Dev", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false; // ???
        }});
        Register(new() { ID = "Flux.1-dev/lora-depth", CompatClass = CompatFlux, Name = "Flux.1 Depth LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/lora-canny", CompatClass = CompatFlux, Name = "Flux.1 Canny LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "Flux.1-dev/controlnet", CompatClass = CompatFlux, Name = "Flux.1 ControlNet", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFluxControlnet(h);
        }});
        Register(new() { ID = "flux.1-dev/controlnet-alimamainpaint", CompatClass = CompatFlux, Name = "Flux.1 ControlNet - AliMama Inpaint", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        // ====================== BFL Flux.2 ======================
        Register(new() { ID = "Flux.2-dev", CompatClass = CompatFlux2, Name = "Flux.2 Dev", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFlux2Dev(h);
        }});
        Register(new() { ID = "Flux.2-dev/lora", CompatClass = CompatFlux2, Name = "Flux.2 Dev LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isFlux2DevLora(h);
        }});
        // ====================== Wan Video ======================
        Register(new() { ID = "wan-2_1-text2video/vae", CompatClass = CompatWan21, Name = "Wan 2.1 VAE", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) => { return false; }});
        Register(new() { ID = "wan-2_1-text2video-1_3b", CompatClass = CompatWan21_1_3b, Name = "Wan 2.1 Text2Video 1.3B", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_1_3b(h) && !isWanI2v(h) && !isWanVace(h);
        }});
        Register(new() { ID = "wan-2_1-image2video-1_3b", CompatClass = CompatWan21_1_3b, Name = "Wan 2.1 Image2Video 1.3B", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_1_3b(h) && isWanI2v(h) && !isWanVace(h);
        }});
        Register(new() { ID = "wan-2_1-text2video-1_3b/lora", CompatClass = CompatWan21_1_3b, Name = "Wan 2.1 Text2Video 1.3B LoRA", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_1_3bLora(h);
        }});
        Register(new() { ID = "wan-2_1-text2video-14b", CompatClass = CompatWan21_14b, Name = "Wan 2.1 Text2Video 14B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && !isWanI2v(h) && !isWanVace(h) && !hasWani2vpatch(h);
        }});
        Register(new() { ID = "wan-2_1-text2video-14b/lora", CompatClass = CompatWan21_14b, Name = "Wan 2.1 14B LoRA", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14bLora(h);
        }});
        Register(new() { ID = "wan-2_1-image2video-14b", CompatClass = CompatWan21_14b, Name = "Wan 2.1 Image2Video 14B", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && isWan21i2v(h) && isWanI2v(h) && !isWanflf2v(h) && !isWanVace(h);
        }});
        Register(new() { ID = "wan-2_1-flf2v-14b", CompatClass = CompatWan21_14b, Name = "Wan 2.1 First/LastFrame2Video 14B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && isWanI2v(h) && isWanflf2v(h) && !isWanVace(h);
        }});
        Register(new() { ID = "wan-2_1-vace-14b", CompatClass = CompatWan21_14b, Name = "Wan 2.1 Vace 14B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && !isWanflf2v(h) && isWanVace(h);
        }});
        Register(new() { ID = "wan-2_1-vace-1_3b", CompatClass = CompatWan21_1_3b, Name = "Wan 2.1 Vace 1.3B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_1_3b(h) && !isWanflf2v(h) && isWanVace(h);
        }});
        Register(new() { ID = "wan-2_2-ti2v-5b", CompatClass = CompatWan22_5b, Name = "Wan 2.2 Text/Image2Video 5B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan22_5b(h);
        }});
        Register(new() { ID = "wan-2_2-ti2v-5b/lora", CompatClass = CompatWan22_5b, Name = "Wan 2.2 Text/Image2Video 5B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO
        }});
        Register(new() { ID = "wan-2_2-image2video-14b", CompatClass = CompatWan21_14b, Name = "Wan 2.2 Image2Video 14B", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isWan21_14b(h) && hasWani2vpatch(h) && !isWanI2v(h) && !isWan21i2v(h);
        }});
        // ====================== Hunyuan Video ======================
        Register(new() { ID = "hunyuan-video", CompatClass = CompatHunyuanVideo, Name = "Hunyuan Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideo(h) && !isHunyuanVideoNativeImage2V(h) && !isHyImg(h) && !isHyImgRefiner(h) && !isHunyuanVideoSkyreelsImage2V(h);
        }});
        Register(new() { ID = "hunyuan-video-skyreels", CompatClass = CompatHunyuanVideo, Name = "Hunyuan Video - SkyReels Text2Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "hunyuan-video-skyreels-i2v", CompatClass = CompatHunyuanVideo, Name = "Hunyuan Video - SkyReels Image2Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideo(h) && isHunyuanVideoSkyreelsImage2V(h) && !isHyImg(h) && !isHyImgRefiner(h);
        }});
        Register(new() { ID = "hunyuan-video-i2v", CompatClass = CompatHunyuanVideo, Name = "Hunyuan Video - Image2Video", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideo(h) && isHunyuanVideoNativeImage2V(h) && !isHyImg(h) && !isHyImgRefiner(h);
        }});
        Register(new() { ID = "hunyuan-video-i2v-v2", CompatClass = CompatHunyuanVideo, Name = "Hunyuan Video - Image2Video v2 ('Fixed')", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "hunyuan-video/vae", CompatClass = CompatHunyuanVideo, Name = "Hunyuan Video VAE", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideoVae(h);
        }});
        Register(new() { ID = "hunyuan-video/lora", CompatClass = CompatHunyuanVideo, Name = "Hunyuan Video LoRA", StandardWidth = 720, StandardHeight = 720, IsThisModelOfClass = (m, h) =>
        {
            return isHunyuanVideoLora(h);
        }});
        // ====================== Nvidia Cosmos ======================
        Register(new() { ID = "nvidia-cosmos-1-7b-text2world", CompatClass = CompatCosmos, Name = "NVIDIA Cosmos 1.0 Diffusion (7B) Text2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos7b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 68;
        }});
        Register(new() { ID = "nvidia-cosmos-1-14b-text2world", CompatClass = CompatCosmos, Name = "NVIDIA Cosmos 1.0 Diffusion (14B) Text2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos14b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 68;
        }});
        Register(new() { ID = "nvidia-cosmos-1-7b-video2world", CompatClass = CompatCosmos, Name = "NVIDIA Cosmos 1.0 Diffusion (7B) Video2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos7b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 72;
        }});
        Register(new() { ID = "nvidia-cosmos-1-14b-video2world", CompatClass = CompatCosmos, Name = "NVIDIA Cosmos 1.0 Diffusion (14B) Video2World", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmos14b(h) && (int)h["net.x_embedder.proj.1.weight"]["shape"].ToArray()[^1].Value<long>() == 72;
        }});
        Register(new() { ID = "nvidia-cosmos-1/vae", CompatClass = CompatCosmos, Name = "NVIDIA Cosmos 1.0 Diffusion VAE", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isCosmosVae(h);
        }});
        // ====================== Nvidia Cosmos Predict2 ======================
        Register(new() { ID = "nvidia-cosmos-predict2-t2i-2b", CompatClass = CompatCosmosPredict2_2b, Name = "NVIDIA Cosmos Predict2 Text2Image 2B", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isCosmosPredict2_2B(h);
        }});
        Register(new() { ID = "nvidia-cosmos-predict2-t2i-14b", CompatClass = CompatCosmosPredict2_14b, Name = "NVIDIA Cosmos Predict2 Text2Image 14B", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isCosmosPredict2_14B(h);
        }});
        // ====================== Z-Image ======================
        Register(new() { ID = "z-image", CompatClass = CompatZImage, Name = "Z-Image", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isLumina2(h) && isZImage(h);
        }});
        Register(new() { ID = "z-image/lora", CompatClass = CompatZImage, Name = "Z-Image LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isZImageLora(h);
        }});
        Register(new() { ID = "z-image/control-diffpatch", CompatClass = CompatZImage, Name = "Z-Image ControlNet (DiffPatch)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isZImageControlNetDiffPatch(h);
        }});
        // ====================== Qwen Image ======================
        Register(new() { ID = "qwen-image", CompatClass = CompatQwenImage, Name = "Qwen Image", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return isQwenImage(h) && !isControlnetX(h) && !isSD3Controlnet(h) && !isQwenImageEdit2511(h);
        }});
        Register(new() { ID = "qwen-image-edit", CompatClass = CompatQwenImage, Name = "Qwen Image Edit", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "qwen-image-edit-plus", CompatClass = CompatQwenImage, Name = "Qwen Image Edit Plus", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return isQwenImage(h) && !isControlnetX(h) && !isSD3Controlnet(h) && isQwenImageEdit2511(h);
        }});
        Register(new() { ID = "qwen-image/controlnet", CompatClass = CompatQwenImage, Name = "Qwen Image ControlNet", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return isQwenImage(h) && isControlnetX(h) &&!isFluxControlnet(h);
        }});
        Register(new() { ID = "qwen-image/control-diffpatch", CompatClass = CompatQwenImage, Name = "Qwen Image ControlNet (DiffPatch)", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return isQwenImageControlnet(h);
        }});
        Register(new() { ID = "qwen-image/vae", CompatClass = CompatQwenImage, Name = "Qwen Image VAE", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO?
        }});
        Register(new() { ID = "qwen-image/lora", CompatClass = CompatQwenImage, Name = "Qwen Image LoRA", StandardWidth = 1328, StandardHeight = 1328, IsThisModelOfClass = (m, h) =>
        {
            return isQwenImageLora(h);
        }});
        // ====================== Kandinsky5 ======================
        Register(new() { ID = "kandinsky5-image-lite", CompatClass = CompatKandinsky5ImgLite, Name = "Kandinsky5 Image Lite", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isKandinsky5(h) && isKan5ImgLite(h);
        }});
        Register(new() { ID = "kandinsky5-image-lite/lora", CompatClass = CompatKandinsky5ImgLite, Name = "Kandinsky5 Image Lite LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO?
        }});
        Register(new() { ID = "kandinsky5-video-lite", CompatClass = CompatKandinsky5VidLite, Name = "Kandinsky5 Video Lite", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isKandinsky5(h) && isKan5VidLite(h);
        }});
        Register(new() { ID = "kandinsky5-video-lite/lora", CompatClass = CompatKandinsky5VidLite, Name = "Kandinsky5 Video Lite LoRA", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO?
        }});
        Register(new() { ID = "kandinsky5-video-pro", CompatClass = CompatKandinsky5VidPro, Name = "Kandinsky5 Video Pro", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isKandinsky5(h) && isKan5VidPro(h);
        }});
        Register(new() { ID = "kandinsky5-video-pro/lora", CompatClass = CompatKandinsky5VidPro, Name = "Kandinsky5 Video Pro LoRA", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO?
        }});
        // ====================== LTX-V ======================
        Register(new() { ID = "lightricks-ltx-video", CompatClass = CompatLtxv, Name = "Lightricks LTX Video", StandardWidth = 768, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isLtxv(h) && !isLtxv2(h);
        }});
        Register(new() { ID = "lightricks-ltx-video/vae", CompatClass = CompatLtxv, Name = "Lightricks LTX Video VAE", StandardWidth = 768, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return isLtxvVae(h);
        }});
        Register(new() { ID = "lightricks-ltx-video-2", CompatClass = CompatLtxv2, Name = "Lightricks LTX Video 2", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isLtxv2(h);
        }});
        Register(new() { ID = "lightricks-ltx-video-2/lora", CompatClass = CompatLtxv2, Name = "Lightricks LTX Video 2 LoRA", StandardWidth = 640, StandardHeight = 640, IsThisModelOfClass = (m, h) =>
        {
            return isLtxv2Lora(h);
        }});
        // ====================== Random Other Models ======================
        Register(new() { ID = "chroma", CompatClass = CompatChroma, Name = "Chroma", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isChroma(h) && !isChromaRadiance(h);
        }});
        Register(new() { ID = "chroma-radiance", CompatClass = CompatChromaRadiance, Name = "Chroma Radiance", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isChroma(h) && isChromaRadiance(h);
        }});
        Register(new() { ID = "alt_diffusion_v1_512_placeholder", CompatClass = CompatAltDiffusion, Name = "Alt-Diffusion", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) =>
        {
            return IsAlt(h);
        }});
        Register(new() { ID = "nvidia-sana-1600", CompatClass = CompatSana, Name = "NVIDIA Sana 1600M", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isSana(h);
        }});
        Register(new() { ID = "nvidia-sana-1600/vae", CompatClass = CompatSana, Name = "NVIDIA Sana 1600M DC-AE VAE", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return h.ContainsKey("decoder.stages.0.0.main.conv.bias");
        }});
        Register(new() { ID = "lumina-2", CompatClass = CompatLumina2, Name = "Lumina 2", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isLumina2(h) && !isZImage(h);
        }});
        Register(new() { ID = "hidream-i1", CompatClass = CompatHiDreamI1, Name = "HiDream i1", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isHiDream(h);
        }});
        Register(new() { ID = "hidream-i1-edit", CompatClass = CompatHiDreamI1, Name = "HiDream i1 Edit", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) =>
        {
            return false; // Must manual edit, seems undetectable?
        }});
        Register(new() { ID = "hidream-i1/lora", CompatClass = CompatHiDreamI1, Name = "HiDream i1 LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isHiDreamLora(h);
        }});
        Register(new() { ID = "omnigen-2", CompatClass = CompatOmniGen2, Name = "OmniGen 2", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isOmniGen(h);
        }});
        Register(new() { ID = "auraflow-v1", CompatClass = CompatAuraFlow, Name = "AuraFlow", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isAuraFlow(h);
        }});
        // ====================== Hunyuan Image 2.1 ======================
        Register(new() { ID = "hunyuan-image-2_1", CompatClass = CompatHunyuanImage2_1, Name = "Hunyuan Image", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return isHyImg(h) && !isHyImgRefiner(h) && !isHyVid15(h);
        }});
        Register(new() { ID = "hunyuan-image-2_1/lora", CompatClass = CompatHunyuanImage2_1, Name = "Hunyuan Image LoRA", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "hunyuan-image-2_1/vae", CompatClass = CompatHunyuanImage2_1, Name = "Hunyuan Image VAE", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "hunyuan-image-2_1-refiner", CompatClass = CompatHunyuanImage2_1Refiner, Name = "Hunyuan Image Refiner", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return isHyImgRefiner(h) && !isHyVid15(h);
        }});
        Register(new() { ID = "hunyuan-image-2_1-refiner/lora", CompatClass = CompatHunyuanImage2_1Refiner, Name = "Hunyuan Image Refiner LoRA", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        Register(new() { ID = "hunyuan-image-2_1-refiner/vae", CompatClass = CompatHunyuanImage2_1Refiner, Name = "Hunyuan Image Refiner VAE", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) =>
        {
            return false;
        }});
        // ====================== Hunyuan Video 1.5 ======================
        Register(new() { ID = "hunyuan-video-1_5", CompatClass = CompatHunyuanVideo1_5, Name = "Hunyuan Video 1.5", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isHyImg(h) && isHyVid15(h);
        }});
        Register(new() { ID = "hunyuan-video-1_5/lora", CompatClass = CompatHunyuanVideo1_5, Name = "Hunyuan Video 1.5 LoRA", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return isHyVid15Lora(h);
        }});
        Register(new() { ID = "hunyuan-video-1_5-sr", CompatClass = CompatHunyuanVideo1_5, Name = "Hunyuan Video 1.5 SuperResolution", StandardWidth = 960, StandardHeight = 960, IsThisModelOfClass = (m, h) =>
        {
            return false; // TODO: Possible to detect?
        }});
        // ====================== Ovis ======================
        Register(new() { ID = "ovis", CompatClass = CompatOvis, Name = "Ovis", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isOvis(h);
        }});
        // ====================== Everything below this point does not autodetect, it must match through ModelSpec or be manually set ======================
        // General Stable Diffusion variants
        Register(new() { ID = "stable-diffusion-v1/vae", CompatClass = CompatSdv1, Name = "Stable Diffusion v1 VAE", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v1/inpaint", CompatClass = CompatSdv1, Name = "Stable Diffusion v1 (Inpainting)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v2-768-v/lora", CompatClass = CompatSdv2, Name = "Stable Diffusion v2 LoRA", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-turbo-v1", CompatClass = CompatSdxl, Name = "Stable Diffusion XL Turbo", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-refiner", CompatClass = CompatSdxlRefiner, Name = "Stable Diffusion XL 1.0-Refiner", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-base/vae", CompatClass = CompatSdxl, Name = "Stable Diffusion XL 1.0-Base VAE", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-edit", CompatClass = CompatSdxl, Name = "Stable Diffusion XL 1.0 Edit", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-base/control-lora", CompatClass = CompatSdxl, Name = "Stable Diffusion XL 1.0-Base Control-LoRA", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) =>
        {
            return isControlLora(h);
        }});
        Register(new() { ID = "segmind-stable-diffusion-1b", CompatClass = CompatSegmindStableDiffusion1b, Name = "Segmind Stable Diffusion 1B (SSD-1B)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-video-diffusion-img2vid-v1", CompatClass = CompatSvd, Name = "Stable Video Diffusion Img2Vid v1", StandardWidth = 1024, StandardHeight = 576, IsThisModelOfClass = (m, h) => { return false; }});
        // TensorRT variants
        Register(new() { ID = "stable-diffusion-v1/tensorrt", CompatClass = CompatSdv1, Name = "Stable Diffusion v1 (TensorRT Engine)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v2-768-v/tensorrt", CompatClass = CompatSdv2, Name = "Stable Diffusion v2 (TensorRT Engine)", StandardWidth = 768, StandardHeight = 768, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v0_9-base/tensorrt", CompatClass = CompatSdxl, Name = "Stable Diffusion XL 0.9-Base (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-base/tensorrt", CompatClass = CompatSdxl, Name = "Stable Diffusion XL 1.0-Base (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-v3-medium/tensorrt", CompatClass = CompatSd3Medium, Name = "Stable Diffusion 3 Medium (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-turbo-v1/tensorrt", CompatClass = CompatSdxl, Name = "Stable Diffusion XL Turbo (TensorRT Engine)", StandardWidth = 512, StandardHeight = 512, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-diffusion-xl-v1-refiner/tensorrt", CompatClass = CompatSdxlRefiner, Name = "Stable Diffusion XL 1.0-Refiner (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "stable-video-diffusion-img2vid-v1/tensorrt", CompatClass = CompatSvd, Name = "Stable Video Diffusion Img2Vid v1 (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 576, IsThisModelOfClass = (m, h) => { return false; } });
        // Other model classes
        Register(new() { ID = "pixart-ms-sigma-xl-2", CompatClass = CompatPixartMsSigmaXl2, Name = "PixArtMS Sigma XL 2", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "pixart-ms-sigma-xl-2-2k", CompatClass = CompatPixartMsSigmaXl2, Name = "PixArtMS Sigma XL 2 (2K)", StandardWidth = 2048, StandardHeight = 2048, IsThisModelOfClass = (m, h) => { return false; } });
        Register(new() { ID = "auraflow-v1/tensorrt", CompatClass = CompatAuraFlow, Name = "AuraFlow (TensorRT Engine)", StandardWidth = 1024, StandardHeight = 1024, IsThisModelOfClass = (m, h) => { return false; } });
        // ====================== General correction remaps ======================
        Remaps["flux-1-dev"] = "Flux.1-dev";
        Remaps["flux-1-dev/lora"] = "Flux.1-dev/lora";
        Remaps["flux-1-dev/lora"] = "Flux.1-dev/lora";
        Remaps["flux-dev/lora"] = "Flux.1-dev/lora";
        Remaps["flux.1-depth-dev-lora"] = "Flux.1-dev/lora-depth";
        Remaps["flux.1-canny-dev-lora"] = "Flux.1-dev/lora-canny";
        Remaps["flux.1-depth-dev"] = "Flux.1-dev/depth";
        Remaps["flux.1-canny-dev"] = "Flux.1-dev/canny";
        Remaps["flux.1-fill-dev"] = "Flux.1-dev/inpaint";
        Remaps["flux-1-schnell"] = "Flux.1-schnell";
        Remaps["flux-1-schnell/lora"] = "Flux.1-dev/lora";
        Remaps["flux-1-schnell/controlnet"] = "Flux.1-dev/controlnet";
        Remaps["flux.1-schnell/lora"] = "Flux.1-dev/lora";
        Remaps["flux.1-schnell/controlnet"] = "Flux.1-dev/controlnet";
        Remaps["flux.1-ae"] = "flux.1/vae";
        Remaps["stable-cascade-v1-stage-a"] = "stable-cascade-v1-stage-a/vae";
        Remaps["stable-diffusion-3-3-5-large"] = "stable-diffusion-v3.5-large";
        Remaps["stable-diffusion-3-3-5-large/lora"] = "stable-diffusion-v3.5-large/lora";
        Remaps["stable-diffusion-v3.5-large-turbo"] = "stable-diffusion-v3.5-large";
        Remaps["stable-diffusion-3-3-5-medium"] = "stable-diffusion-v3.5-medium";
        Remaps["stable-diffusion-3-3-5-medium/lora"] = "stable-diffusion-v3.5-medium/lora";
        // ====================== Comfy model_type remaps ======================
        Remaps["hunyuanvideo1.5_480p_t2v_distilled"] = "hunyuan-video-1_5";
        Remaps["hunyuanvideo1.5_480p_i2v_distilled"] = "hunyuan-video-1_5";
        Remaps["hunyuanvideo1.5_720p_t2v_distilled"] = "hunyuan-video-1_5";
        Remaps["hunyuanvideo1.5_720p_i2v_distilled"] = "hunyuan-video-1_5";
        Remaps["hunyuanvideo1.5_480p_t2v"] = "hunyuan-video-1_5";
        Remaps["hunyuanvideo1.5_480p_i2v"] = "hunyuan-video-1_5";
        Remaps["hunyuanvideo1.5_720p_t2v"] = "hunyuan-video-1_5";
        Remaps["hunyuanvideo1.5_720p_i2v"] = "hunyuan-video-1_5";
        Remaps["hunyuanvideo1.5_1080p_sr_distilled"] = "hunyuan-video-1_5-sr";
        Remaps["hunyuanvideo1.5_720p_sr_distilled"] = "hunyuan-video-1_5-sr";
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
            ?? fix(header.Value<string>("general.architecture"))
            ?? fix(header?["__metadata__"]?.Value<string>("model_type"))
            ?? fix(header.Value<string>("model_type"));
        if (arch is not null)
        {
            arch = arch.ToLowerFast();
            string res = fix(header["__metadata__"]?.Value<string>("modelspec.resolution"))
                ?? fix(header["__metadata__"]?.Value<string>("resolution"))
                ?? fix(header.Value<string>("modelspec.resolution"))
                ?? fix(header.Value<string>("resolution"));
            string h = null;
            int width = string.IsNullOrWhiteSpace(res) ? 0 : int.Parse(res.BeforeAndAfter('x', out h));
            int height = string.IsNullOrWhiteSpace(h) ? 0 : int.Parse(h);
            if (Remaps.TryGetValue(arch, out string remapTo))
            {
                arch = remapTo.ToLowerFast();
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
