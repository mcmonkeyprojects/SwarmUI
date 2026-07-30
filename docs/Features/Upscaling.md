# Upscaling In SwarmUI

(TODO)

# Upscale Stages

There are two places to upscale, differing in what happens after:

- **Refine / Upscale** group: the refiner model samples over the upscaled result, per **Refiner Control Percentage**. Set that to `0` for an upscale-only stage.
- **Final Stage** group: runs after the base and refiner stages are done, and nothing samples over the result, only whatever the upscaler does itself.
    - **Final Upscale** stacks on top of Refiner Upscale, eg `1.5` refiner upscale and `2` final upscale is 3x total.
    - **Final Upscale Method** offers the same methods as Refiner Upscale Method, minus the latent upscalers (which need a sampler after them).

# Pixel Decoder (PiD)

(TODO)

Downloads here: <https://huggingface.co/Comfy-Org/PixelDiT/tree/main/diffusion_models>
