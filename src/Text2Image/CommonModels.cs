using System.IO;
using FreneticUtilities.FreneticExtensions;
using SwarmUI.Core;
using SwarmUI.Utils;

namespace SwarmUI.Text2Image;

/// <summary>Special registry of well-known common core Text2Image models that Swarm may make use of.</summary>
public static class CommonModels
{
    /// <summary>Information about an available model.</summary>
    /// <param name="ID">Shorthand lookup ID.</param>
    /// <param name="DisplayName">Human-readable display name.</param>
    /// <param name="Description">Human-readable simple description.</param>
    /// <param name="URL">Direct download URL.</param>
    /// <param name="Hash">SHA256 raw file hash for the download.</param>
    /// <param name="FolderType">The models subtype this belongs in.</param>
    /// <param name="FileName">The name of the file to save this as when downloading, including folder subpath.</param>
    public record class ModelInfo(string ID, string DisplayName, string Description, string URL, string Hash, string FolderType, string FileName)
    {
        /// <summary>Trigger a download of this model.</summary>
        public async Task DownloadNow(Action<long, long, long> updateProgress = null)
        {
            string folder = Program.T2IModelSets[FolderType].FolderPaths[0];
            string path = $"{folder}/{FileName}";
            if (File.Exists(path))
            {
                Logs.Warning($"Attempted re-download of pre-existing model '{FileName}', skipping.");
                return;
            }
            await Utilities.DownloadFile(URL, path, updateProgress, verifyHash: Hash);
        }
    }

    /// <summary>Set of known downloadable models, mapped from their IDs.</summary>
    public static ConcurrentDictionary<string, ModelInfo> Known = [];

    /// <summary>Register a new known model.</summary>
    public static void Register(ModelInfo info)
    {
        if (!info.FileName.EndsWith(".safetensors"))
        {
            throw new InvalidOperationException("May not register a known model that isn't '.safetensors'.");
        }
        if (info.Hash.Length != 64)
        {
            throw new InvalidOperationException($"Hash looks wrong, has {info.Hash.Length} characters, expected 64.");
        }
        if (!info.URL.StartsWith("https://"))
        {
            throw new InvalidOperationException("URL looks wrong.");
        }
        if (!Program.T2IModelSets.ContainsKey(info.FolderType))
        {
            throw new InvalidOperationException($"Folder type '{info.FolderType}' does not exist in set '{Program.T2IModelSets.Keys.JoinString("', '")}'.");
        }
        if (!Known.TryAdd(info.ID, info))
        {
            throw new InvalidOperationException($"Model ID already registered: {info.ID}");
        }
    }

    /// <summary>Internal method to register the core set of known models.</summary>
    public static void RegisterCoreSet()
    {
        //Register(new("", "", "", "", "", "", ""));

        // Core Reference Models:
        Register(new("sd15", "Stable Diffusion v1.5", "The original Stable Diffusion v1.5 model from 2022.", "https://huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive/resolve/main/v1-5-pruned-emaonly-fp16.safetensors", "e9476a13728cd75d8279f6ec8bad753a66a1957ca375a1464dc63b37db6e3916", "Stable-Diffusion", "OfficialStableDiffusion/v1-5-pruned-emaonly-fp16.safetensors"));
        Register(new("sd21", "Stable Diffusion v2.1", "Stable Diffusion v2.1 from 2022.", "https://huggingface.co/stabilityai/stable-diffusion-2-1/resolve/main/v2-1_768-ema-pruned.safetensors", "dcd690123cfc64383981a31d955694f6acf2072a80537fdb612c8e58ec87a8ac", "Stable-Diffusion", "OfficialStableDiffusion/v2-1_768-ema-pruned.safetensors"));
        Register(new("sdxl1", "Stable Diffusion XL 1.0 (Base)", "Stable Diffusion XL 1.0 from 2023, base variant.", "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors", "31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b", "Stable-Diffusion", "OfficialStableDiffusion/sd_xl_base_1.0.safetensors"));
        Register(new("sdxl1refiner", "Stable Diffusion XL 1.0 (Refiner)", "Stable Diffusion XL 1.0 from 2023, special refiner model variant.", "https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/resolve/main/sd_xl_refiner_1.0.safetensors", "7440042bbdc8a24813002c09b6b69b64dc90fded4472613437b7f55f9b7d9c5f", "Stable-Diffusion", "OfficialStableDiffusion/sd_xl_refiner_1.0.safetensors"));
        Register(new("sd35large", "Stable Diffusion v3.5 Large", "Stable Diffusion v3.5 Large (8B) from 2024.", "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main/sd3.5_large_fp8_scaled.safetensors", "5ad94d6f951556b1ab6b75930fd4effbafaf3130fe9df440e7f2d05a220dd1be", "Stable-Diffusion", "OfficialStableDiffusion/sd3.5_large_fp8_scaled.safetensors"));
        Register(new("fluxschnell", "Flux.1-Schnell", "Flux.1 (Schnell/Turbo variant) from 2024.", "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors", "ead426278b49030e9da5df862994f25ce94ab2ee4df38b556ddddb3db093bf72", "Stable-Diffusion", "Flux/flux1-schnell-fp8.safetensors"));
        Register(new("fluxdev", "Flux.1-Dev", "Flux.1 (Dev/standard variant) from 2024.", "https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev-fp8.safetensors", "8e91b68084b53a7fc44ed2a3756d821e355ac1a7b6fe29be760c1db532f3d88a", "Stable-Diffusion", "Flux/flux1-dev-fp8.safetensors"));
        Register(new("zimage", "Z-Image Turbo", "Z-Image Turbo (late 2025).", "https://huggingface.co/mcmonkey/swarm-models/resolve/main/SwarmUI_Z-Image-Turbo-FP8Mix.safetensors", "ba92d3705131c8d9b05ca9c6fefe39444d4eb02db16c30aafa9fcf5f85230e06", "Stable-Diffusion", "ZImage/SwarmUI_Z-Image-Turbo-FP8Mix.safetensors"));

        // VAEs
        Register(new("sdxl-vae", "Stable Diffusion XL 1.0 VAE", "The VAE for SDXL (madebyollin fp16 fix version)", "https://huggingface.co/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl_vae.safetensors", "235745af8d86bf4a4c1b5b4f529868b37019a10f7c0b2e79ad0abca3a22bc6e1", "VAE", "OfficialStableDiffusion/sdxl_vae.safetensors"));
        Register(new("sd35-vae", "Stable Diffusion v3.5 VAE", "The VAE for Stable Diffusion v3", "https://huggingface.co/mcmonkey/swarm-vaes/resolve/main/sd35_vae.safetensors", "6ad8546282f0f74d6a1184585f1c9fe6f1509f38f284e7c4f7ed578554209859", "VAE", "OfficialStableDiffusion/sd35_vae.safetensors"));
        Register(new("flux-ae", "Flux.1-AE", "The AE for Flux.1", "https://huggingface.co/mcmonkey/swarm-vaes/resolve/main/flux_ae.safetensors", "afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38", "VAE", "Flux/ae.safetensors"));
        Register(new("flux2-vae", "Flux.2-VAE", "The VAE for Flux.2", "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors", "d64f3a68e1cc4f9f4e29b6e0da38a0204fe9a49f2d4053f0ec1fa1ca02f9c4b5", "VAE", "Flux/flux2-vae.safetensors"));
        Register(new("mochi-vae", "Genmo Mochi 1 VAE", "The VAE for Genmo Mochi 1", "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/resolve/main/split_files/vae/mochi_vae.safetensors", "1be451cec94b911980406169286babc5269e7cf6a94bbbbdf45e8d3f2c961083", "VAE", "Mochi/mochi_vae.safetensors"));
        Register(new("sana-dcae", "NVIDIA Sana DC-AE", "The DC-AE VAE for NVIDIA Sana", "https://huggingface.co/Efficient-Large-Model/Sana_1600M_1024px_diffusers/resolve/38ebe9b227c30cf6b35f2b7871375e9a28c0ccce/vae/diffusion_pytorch_model.safetensors", "25a1d9ac3b3422160ce8a4b5454ed917f103bb18e30fc1b307dec66375167bb8", "VAE", "Sana/sana_dcae_vae.safetensors"));
        Register(new("hunyuan-video-vae", "Hunyuan Video VAE", "The VAE for Hunyuan Video", "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/resolve/main/split_files/vae/hunyuan_video_vae_bf16.safetensors", "e8f8553275406d84ccf22e7a47601650d8f98bdb8aa9ccfdd6506b57a9701aed", "VAE", "HunyuanVideo/hunyuan_video_vae_bf16.safetensors"));
        Register(new("cosmos-vae", "Cosmos VAE", "The VAE for Nvidia Cosmos", "https://huggingface.co/comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI/resolve/main/vae/cosmos_cv8x8x8_1.0.safetensors", "e4478fa8629160d16262276e52bdea91ecef636b005a2a29e93a3d7764e0863b", "VAE", "Cosmos/cosmos_cv8x8x8_1.0.safetensors"));
        Register(new("wan21-vae", "Wan 2.1 VAE", "The VAE for Wan 2.1", "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors", "2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b", "VAE", "Wan/wan_2.1_vae.safetensors"));
        Register(new("wan22-vae", "Wan 2.2 VAE", "The VAE for Wan 2.2", "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors", "e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156", "VAE", "Wan/wan2.2_vae.safetensors"));
        Register(new("ltxv-vae", "LTX-V VAE", "The VAE for Lightricks LTX-Video.", "https://huggingface.co/wsbagnsv1/ltxv-13b-0.9.7-dev-GGUF/resolve/c4296d06bab7719ce08e68bfa7a35042898e538b/ltxv-13b-0.9.7-vae-BF16.safetensors", "ee5ddcebc0b92d81b8aed9ee43445b7a4e66df1acf180678c5aa40e82f898dc5", "VAE", "LTXV/ltxv_vae.safetensors"));
        Register(new("qwen-image-vae", "Qwen Image VAE", "The VAE for Qwen Image", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors", "a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f", "VAE", "QwenImage/qwen_image_vae.safetensors"));
        Register(new("hunyuan-image-2_1-vae", "Hunyuan Image 2.1 VAE", "The VAE for Hunyuan Image 2.1 Base", "https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/resolve/main/split_files/vae/hunyuan_image_2.1_vae_fp16.safetensors", "f2ae19863609206196b5e3a86bfd94f67bd3866f5042004e3994f07e3c93b2f9", "VAE", "HunyuanImage/hunyuan_image_2.1_vae_fp16.safetensors"));
        Register(new("hunyuan-image-2_1-refiner-vae", "Hunyuan Image 2.1 Refiner VAE", "The VAE for Hunyuan Image 2.1 Refiner", "https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/resolve/main/split_files/vae/hunyuan_image_refiner_vae_fp16.safetensors", "e1b74e85d61b65e18cc05ca390e387d93cfadf161e737de229ebb800ea3db769", "VAE", "HunyuanImage/hunyuan_image_2.1_refiner_vae_fp16.safetensors"));
        Register(new("hunyuan-video-1_5-vae", "Hunyuan Video 1.5 VAE", "The VAE for Hunyuan Video 1.5", "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/resolve/main/split_files/vae/hunyuanvideo15_vae_fp16.safetensors", "e7c3091949c27e2d55ae6d5df917b99dadfebbf308e5a50d0ade0d16c90297ae", "VAE", "HunyuanVideo/hunyuanvideo15_vae_fp16.safetensors"));
    }
}
