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

        // VAEs
        Register(new("sdxl-vae", "Stable Diffusion XL 1.0 VAE", "The VAE for SDXL (madebyollin fp16 fix version)", "https://huggingface.co/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl_vae.safetensors", "235745af8d86bf4a4c1b5b4f529868b37019a10f7c0b2e79ad0abca3a22bc6e1", "VAE", "OfficialStableDiffusion/sdxl_vae.safetensors"));
        Register(new("sd35-vae", "Stable Diffusion v3.5 VAE", "The VAE for Stable Diffusion v3", "https://huggingface.co/mcmonkey/swarm-vaes/resolve/main/sd35_vae.safetensors", "6ad8546282f0f74d6a1184585f1c9fe6f1509f38f284e7c4f7ed578554209859", "VAE", "OfficialStableDiffusion/sd35_vae.safetensors"));
        Register(new("flux-ae", "Flux.1-AE", "The AE for Flux.1", "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors", "afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38", "VAE", "Flux/ae.safetensors"));
        Register(new("mochi-vae", "Genmo Mochi 1 VAE", "The VAE for Genmo Mochi 1", "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/resolve/main/split_files/vae/mochi_vae.safetensors", "1be451cec94b911980406169286babc5269e7cf6a94bbbbdf45e8d3f2c961083", "VAE", "Mochi/mochi_vae.safetensors"));
        Register(new("sana-dcae", "NVIDIA Sana DC-AE", "The DC-AE VAE for NVIDIA Sana", "https://huggingface.co/Efficient-Large-Model/Sana_1600M_1024px_diffusers/resolve/main/vae/diffusion_pytorch_model.safetensors", "25a1d9ac3b3422160ce8a4b5454ed917f103bb18e30fc1b307dec66375167bb8", "VAE", "Sana/sana_dcae_vae.safetensors"));
    }
}
