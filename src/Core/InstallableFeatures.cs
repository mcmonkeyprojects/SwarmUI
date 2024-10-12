namespace SwarmUI.Core;

/// <summary>Handler for registries of installable features.</summary>
public static class InstallableFeatures
{
    /// <summary>Represents a comfy based feature you can install.</summary>
    /// <param name="DisplayName">Human-readable display name for this feature.</param>
    /// <param name="ID">Internal registration identifier. Keep it short, simple, lowercase, no spaces.</param>
    /// <param name="Author">Name of the author of the relevant comfy nodes.</param>
    /// <param name="HtmlButtonElem">Optional HTML ID for a button element that handles this installer normally.</param>
    public record class ComfyInstallableFeature(string DisplayName, string ID, string URL, string Author, string Notice = null, bool SkipPipCache = false, bool AutoInstall = false);

    /// <summary>Mapping of all known installable comfy based features.</summary>
    public static Dictionary<string, ComfyInstallableFeature> ComfyFeatures = [];

    /// <summary>Register a new installable comfy based features.</summary>
    public static void RegisterInstallableFeature(ComfyInstallableFeature feature)
    {
        if (string.IsNullOrWhiteSpace(feature.Notice))
        {
            feature = feature with { Notice = $"This will install {feature.URL} which is a third-party extension maintained by community developer '{feature.Author}'.\nWe cannot make any guarantees about it.\nDo you wish to install?" };
        }
        ComfyFeatures[feature.ID] = feature;
    }

    static InstallableFeatures()
    {
        RegisterInstallableFeature(new("IP Adapter", "ipadapter", "https://github.com/cubiq/ComfyUI_IPAdapter_plus", "cubiq", "revision_install_ipadapter", ""));
        RegisterInstallableFeature(new("ControlNet Preprocessors", "controlnet_preprocessors", "https://github.com/Fannovel16/comfyui_controlnet_aux", "Fannovel16", "controlnet_install_preprocessors", ""));
        RegisterInstallableFeature(new("Frame Interpolation Utilities", "frame_interpolation", "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation", "Fannovel16", "video_install_frameinterps", ""));
        RegisterInstallableFeature(new("TensorRT", "comfyui_tensorrt", "https://github.com/comfyanonymous/ComfyUI_TensorRT", "comfyanonymous + NVIDIA", "install_trt_button", "", "This will install TensorRT support developed by Comfy and NVIDIA.\nDo you wish to install?", true));
        RegisterInstallableFeature(new("Segment Anything 2", "sam2", "https://github.com/kijai/ComfyUI-segment-anything-2", "kijai", "install_sam2_button", "sam2_installer"));
        RegisterInstallableFeature(new("Bits-n-Bytes NF4", "bnb_nf4", "https://github.com/comfyanonymous/ComfyUI_bitsandbytes_NF4", "comfyanonymous", "install_bnbnf4_button", "bnb_nf4_installer", "This will install BnB NF4 support developed by Comfy and lllyasviel (AGPL License).\nDo you wish to install?"));
        RegisterInstallableFeature(new("GGUF", "gguf", "https://github.com/city96/ComfyUI-GGUF", "city96", "install_gguf_button", "gguf_installer", "This will install GGUF support developed by city96.\nDo you wish to install?"));
    }
}
