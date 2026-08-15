import math
import comfy, torch

class SwarmOffsetEmptyLatentImage:
    def __init__(self):
        self.device = comfy.model_management.intermediate_device()

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "width": ("INT", {"default": 512, "min": 16, "max": 4096, "step": 8}),
                "height": ("INT", {"default": 512, "min": 16, "max": 4096, "step": 8}),
                "off_a": ("INT", {"default": 0, "min": -10, "max": 10, "step": 0.0001}),
                "off_b": ("INT", {"default": 0, "min": -10, "max": 10, "step": 0.0001}),
                "off_c": ("INT", {"default": 0, "min": -10, "max": 10, "step": 0.0001}),
                "off_d": ("INT", {"default": 0, "min": -10, "max": 10, "step": 0.0001}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 4096})
            }
        }

    CATEGORY = "SwarmUI/latents"
    RETURN_TYPES = ("LATENT",)
    FUNCTION = "generate"
    DESCRIPTION = "Generates a latent image with 4 channels, each channel filled with a different offset value. Designed to allow alternate empty value offsets for SDv1 and SDXL."

    def generate(self, width, height, off_a, off_b, off_c, off_d, batch_size=1):
        latent = torch.zeros([batch_size, 4, height // 8, width // 8], device=self.device)
        latent[:, 0, :, :] = off_a
        latent[:, 1, :, :] = off_b
        latent[:, 2, :, :] = off_c
        latent[:, 3, :, :] = off_d
        return ({"samples":latent}, )


class SwarmAudioSilentMaskPrefixSuffix:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "latent": ("LATENT",),
                "vae": ("VAE",),
                "prefix_duration": ("FLOAT", {"default": 0.1, "min": 0.0, "max": 9999.0, "step": 0.001, "tooltip": "Seconds of silence to encode and mask off at the start of the audio latent."}),
                "suffix_duration": ("FLOAT", {"default": 0, "min": 0.0, "max": 9999.0, "step": 0.001, "tooltip": "Seconds of silence to encode and mask off at the end of the audio latent."}),
            }
        }

    CATEGORY = "SwarmUI/latents"
    RETURN_TYPES = ("LATENT",)
    FUNCTION = "apply"
    DESCRIPTION = "Encodes silent audio and writes it into the start and/or end of a latent audio clip, masking that prefix/suffix so sampling cannot update it."

    def apply(self, latent, vae, prefix_duration, suffix_duration):
        out = latent.copy()
        samples = latent["samples"]
        if prefix_duration <= 0 and suffix_duration <= 0:
            return (out,)
        sample_rate = int(getattr(vae, "audio_sample_rate", 44100))
        channels = int(getattr(vae, "output_channels", 2) or 2)
        hop = getattr(vae, "downscale_ratio", 1)
        if not isinstance(hop, (int, float)):
            hop = 1
        hop = max(1, int(hop))
        def padded_samples(duration):
            num_samples = max(1, int(round(duration * sample_rate)))
            return int(math.ceil(num_samples / hop) * hop)
        max_duration = max(prefix_duration, suffix_duration)
        waveform = torch.zeros([1, channels, padded_samples(max_duration)])
        silence = vae.encode(waveform.movedim(1, -1)).to(device=samples.device, dtype=samples.dtype)
        if silence.shape[0] == 1 and samples.shape[0] != 1:
            silence = silence.expand(samples.shape[0], *silence.shape[1:])
        if silence.ndim != samples.ndim:
            raise ValueError(f"SwarmAudioSilentMaskPrefixSuffix: encoded silence shape {tuple(silence.shape)} does not match audio latent shape {tuple(samples.shape)}")
        diffs = [i for i in range(1, silence.ndim) if silence.shape[i] != samples.shape[i]]
        time_dim = diffs[0] if len(diffs) == 1 else silence.ndim - 1
        def frames_for(duration):
            if duration <= 0:
                return 0
            return min(max(1, padded_samples(duration) // hop), silence.shape[time_dim], samples.shape[time_dim])
        prefix_len = frames_for(prefix_duration)
        suffix_len = frames_for(suffix_duration)
        if prefix_len <= 0 and suffix_len <= 0:
            return (out,)
        samples = samples.clone()
        if "noise_mask" in latent and latent["noise_mask"] is not None:
            mask = comfy.utils.reshape_mask(latent["noise_mask"], samples.shape)
        else:
            mask = torch.ones_like(samples)
        mask = mask.clone()
        if prefix_len > 0:
            samples.narrow(time_dim, 0, prefix_len).copy_(silence.narrow(time_dim, 0, prefix_len))
            mask.narrow(time_dim, 0, prefix_len).zero_()
        if suffix_len > 0:
            end_start = samples.shape[time_dim] - suffix_len
            samples.narrow(time_dim, end_start, suffix_len).copy_(silence.narrow(time_dim, 0, suffix_len))
            mask.narrow(time_dim, end_start, suffix_len).zero_()
        out["samples"] = samples
        out["noise_mask"] = mask
        return (out,)


NODE_CLASS_MAPPINGS = {
    "SwarmOffsetEmptyLatentImage": SwarmOffsetEmptyLatentImage,
    "SwarmAudioSilentMaskPrefixSuffix": SwarmAudioSilentMaskPrefixSuffix
}
