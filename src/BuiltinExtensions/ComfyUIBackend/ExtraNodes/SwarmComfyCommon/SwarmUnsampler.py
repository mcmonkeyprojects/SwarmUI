import torch, comfy
from .SwarmKSampler import make_swarm_sampler_callback

class SwarmUnsampler:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, ),
                "scheduler": (["turbo"] + comfy.samplers.KSampler.SCHEDULERS, ),
                "positive": ("CONDITIONING", ),
                "negative": ("CONDITIONING", ),
                "latent_image": ("LATENT", ),
                "start_at_step": ("INT", {"default": 0, "min": 0, "max": 10000}),
                "previews": (["default", "none", "one"], )
            }
        }

    CATEGORY = "SwarmUI/sampling"
    RETURN_TYPES = ("LATENT",)
    FUNCTION = "unsample"
    DESCRIPTION = "Runs sampling in reverse. The function of this is to create noise that matches an image, such that you can the run forward sampling with an altered version of the unsampling prompt to get a closely altered image. May not work on all models, may not work perfectly. Input values should largely match your Sampler inputs."

    def unsample(self, model, steps, sampler_name, scheduler, positive, negative, latent_image, start_at_step, previews):
        device = comfy.model_management.get_torch_device()
        latent_samples = latent_image["samples"].to(device)

        noise = torch.zeros(latent_samples.size(), dtype=latent_samples.dtype, layout=latent_samples.layout, device=device)
        noise_mask = None
        if "noise_mask" in latent_image:
            noise_mask = latent_image["noise_mask"]

        sampler = comfy.samplers.KSampler(model, steps=steps, device=device, sampler=sampler_name, scheduler=scheduler, denoise=1.0, model_options=model.model_options)
        sigmas = sampler.sigmas.flip(0) + 0.0001

        callback = make_swarm_sampler_callback(steps, device, model, previews)

        samples = comfy.sample.sample(model, noise, steps, 1, sampler_name, scheduler, positive, negative, latent_samples,
                                    denoise=1.0, disable_noise=False, start_step=0, last_step=steps - start_at_step,
                                    force_full_denoise=False, noise_mask=noise_mask, sigmas=sigmas, callback=callback, seed=0)
        out = latent_image.copy()
        out["samples"] = samples
        return (out, )


NODE_CLASS_MAPPINGS = {
    "SwarmUnsampler": SwarmUnsampler,
}
