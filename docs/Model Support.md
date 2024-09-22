# Model Type Support In SwarmUI

Swarm natively supports [ModelSpec](https://github.com/Stability-AI/ModelSpec) metadata and can import metadata from some legacy formats used by other UIs (auto webui thumbnails, matrix jsons, etc)

Swarm supports models of all the common architectures:

### Stable Diffusion v1 and v2

SDv1/SDv2 models work exactly as normal. Even legacy (pre-[ModelSpec](https://github.com/Stability-AI/ModelSpec) models are supported).

### Stable Diffusion v1 Inpainting Models

SDv1 inpaint models (RunwayML) are supported, but will work best if you manually edit the Architecture ID to be `stable-diffusion-v1/inpaint`.

### Stable Diffusion XL

SDXL models work as normal, with the bonus that by default enhanced inference settings will be used (eg scaled up rescond).

Additional, SDXL-Refiner architecture models can be inferenced, both as refiner or even as a base (you must manually set res to 512x512 and it will generate weird results).

### Stable Diffusion 3

Stable Diffusion 3 Medium is supported and works as normal.

By default the first time you run an SD3 model, Swarm will download the text encoders for you.

Under the `Sampling` parameters group, a parameter named `SD3 TextEncs` is available to select whether to use CLIP, T5, or both. By default, CLIP is used (no T5) as results are near-identical but CLIP-only has much better performance, especially on systems with limited resources.

Under `Advanced Sampling`, the parameter `Sigma Shift` is available. This defaults to `3` on SD3, but you can lower it to around ~1.5 if you wish to experiment with different values. Messing with this value too much is not recommended.

For upscaling with SD3, the `Refiner Do Tiling` parameter is highly recommended (SD3 does not respond well to regular upscaling without tiling).

### SDXL Turbo and SD Turbo

Turbo models work the same as regular models, just set `CFG Scale` to `1` and `Steps` to `1` as well. Under the `Sampling` group set `Scheduler` to `Turbo`.

### Latency Consistency Models

LCM models work the same as regular models, just set `CFG Scale` to `1` and `Steps` to `4`. Under the `Sampling` group set `Sampler` to `lcm`.

### Lightning Models

Lightning models work the same as regular models, just set `CFG Scale` to `1` and (TODO: Sampling specifics for lightning).

### SegMind SSD-1B

SegMind SSD-1B models work the same as SD models.

### Stable Video Diffusion

SVD models are supported via the "Video" parameter group. Like XL, video by default uses enhanced inference settings (better sampler and larger sigma value).

You can do text2video by just checking Video as normal, or image2video by using an Init Image and setting Creativity to 0.

### Stable Cascade

Stable Cascade is supported if you use the "ComfyUI Format" models (aka "All In One") https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints that come as a pair of `stage_b` and `stage_c` models.

You must keep the two in the same folder, named the same with the only difference being `stage_b` vs `stage_c` in the filename.

Either model can be selected in the UI to use them, it will automatically use both.

### TensorRT

TensorRT support (`.engine`) is available for SDv1, SDv2-768-v, SDXL Base, SDXL Refiner, SD3-Medium

TensorRT is an nvidia-specific accelerator library that provides faster SD image generation at the cost of reduced flexibility. Generally this is best for heavy usages, especially for API/Bots/etc. and less useful for regular individual usage.

You can generate TensorRT engines from the model menu. This includes a button on-page to autoinstall TRT support your first time using it, and configuration of graph size limits and optimal scales. (TensorRT works fastest when you generate at the selected optimal resolution, and slightly less fast at any dynamic resolution outside the optimal setting.)

Note that TensorRT is not compatible with LoRAs, ControlNets, etc.

Note that you need to make a fresh TRT engine for any different model you want to use.

# PixArt Sigma

The [PixArt Sigma MS models](https://huggingface.co/PixArt-alpha/PixArt-Sigma/tree/main) are supported in Swarm with a few setup steps.

These steps are not friendly to beginners (if PixArt gains popularity, likely more direct/automated/native support will be added), but advanced users can follow:

- You must install https://github.com/city96/ComfyUI_ExtraModels to your Comfy backend.
- After downloading the model, run Swarm's **Utilities** -> **Pickle To Safetensors** -> `Convert Models`. You need a safetensors models for Swarm to accurately identify model type.
    - Or download a preconverted copy, like this one: https://huggingface.co/HDiffusion/Pixart-Sigma-Safetensors
- After you have a safetensors model, find it in the Models tab and click the menu button on the model and select "`Edit Metadata`"
    - From the `Architecture` dropdown, select `PixArtMS Sigma XL 2` for 1024 or lower models, or `XL 2 (2K)` for the 2k
    - In the `Standard Resolution` box, enter `1024x1024` for 1024 or `512x512` for the 512, or `2048x2048` for the 2k
- Make sure in **User Settings**, you have a `DefaultSDXLVae` selected. If not, you can download this one https://huggingface.co/madebyollin/sdxl-vae-fp16-fix and save it in `(Swarm)/Models/VAE`
- Swarm will autodownload T5XXL-EncoderOnly for you on first run (same as SD3-Medium T5-Only mode)
- You can now use the model as easily as any other model. Some feature compatibility features might arise.

# AuraFlow v0.1

[Fal.ai's AuraFlow v0.1](https://huggingface.co/fal/AuraFlow/tree/main) and [v0.2](https://huggingface.co/fal/AuraFlow-v0.2) is supported in Swarm, but you must manually select architecture to use it. (The AuraFlow team intend to add modelspec metadata in the near future).

Download the model, then click "`Edit Metadata`" and select `(Temporary) AuraFlow` as the architecture, and set resolution to `1024x1024`.

# Black Forest Labs' Flux.1 Models

- Black Forest Labs' Flux.1 model is fully supported in Swarm <https://blackforestlabs.ai/announcing-black-forest-labs/>
    - **Recommended:** use the [NF4 Format Files](#bits-and-bytes-nf4-format-models)
    - **Alternate:** the simplified fp8 file:
        - Dev <https://huggingface.co/Comfy-Org/flux1-dev/blob/main/flux1-dev-fp8.safetensors>
        - Schnell <https://huggingface.co/Comfy-Org/flux1-schnell/blob/main/flux1-schnell-fp8.safetensors>
        - goes in your regular `(Swarm)/Models/Stable-Diffusion` dir
    - **or, not recommended:** You can download BFL's original files:
        - Download "Schnell" (Turbo) from <https://huggingface.co/black-forest-labs/FLUX.1-schnell>
        - Or "Dev" (non-Turbo) from <https://huggingface.co/black-forest-labs/FLUX.1-dev>
        - Put dev/schnell in `(Swarm)/Models/diffusion_models`
        - Put the `ae.sft` file in `(Swarm)/Models/VAE`
    - For both models, use CFG=1 (negative prompt won't work). Sampling leave default (will use Euler + Simple)
        - For the Dev model, there is also a `Flux Guidance Scale` parameter under `Sampling`, which is a distilled embedding value that the model was trained to use.
        - Dev can use some slightly-higher CFG values (allowing for negative prompt), possibly higher if you reduce the Flux Guidance value and/or use Dynamic Thresholding.
    - For Schnell use Steps=4 (or lower, it can even do 1 step), for Dev use Steps=20 or higher
    - This is best on a very high end GPU (eg 4090) for now. It is a 12B model.
        - Smaller GPUs can run it, but will be slow. This requires a lot of system RAM (32GiB+). It's been shown to work as low down as an RTX 2070 or 2060 (very slowly).
    - On a 4090, schnell takes about 4/5 seconds to generate a 4-step image, very close to SDXL 20 steps in time, but much higher quality.
    - By default swarm will use fp8_e4m3fn for Flux, if you have a very very big GPU and want to use fp16/bf16, under `Advanced Sampling` set `Preferred DType` to `Default (16 bit)`
    - It natively supports any resolution up to 2 mp (1920x1088), and any aspect ratio thereof. By default will use 1MP 1024x1024 in Swarm. You can take it down to 256x256 and still get good results.
        - You can mess with the resolution quite a lot and still get decent results. It's very flexible even past what it was trained on.
    - You _can_ do a refiner upscale 2x and it will work but take a long time and might not have excellent quality. Refiner tiling may be better.

# Bits-and-Bytes NF4 Format Models

- BnB NF4 format models, such as this copy of Flux Dev <https://huggingface.co/lllyasviel/flux1-dev-bnb-nf4/tree/main?show_file_info=flux1-dev-bnb-nf4.safetensors>, are partially supported in SwarmUI automatically.
    - The detection internally works by looking for `bitsandbytes__nf4` in the model's keys
    - The first time you try to load an NF4 model, it will give you a popup asking to install support
        - This will autoinstall https://github.com/comfyanonymous/ComfyUI_bitsandbytes_NF4 which is developed by comfyanonymous and lllyasviel, and is under the AGPL license.
    - You can accept this popup, and it will install and reload the backend
    - Then try to generate again, and it should work
- Note that BnB-NF4 models have multiple compatibility limitations, including even LoRAs don't apply properly.
    - If you want a quantized flux model, GGUF is recommended instead.

# GGUF Quantized Models

- GGUF Quantized `diffusion_models` models, such as Flux Schnell <https://huggingface.co/city96/FLUX.1-schnell-gguf/tree/main> or Flux Dev <https://huggingface.co/city96/FLUX.1-dev-gguf/tree/main> are supported in SwarmUI automatically.
    - The detection is based on file extension.
    - They go in `(Swarm)/Models/diffusion_models` and work similar to other `diffusion_models` format models
        - You will need a relevant VAE in your `(Swarm)/Models/VAE` folder
        - For Flux you need <https://huggingface.co/black-forest-labs/FLUX.1-schnell/blob/main/ae.safetensors>
    - You will have to click `Edit Metadata` on the model and set the architecture, it cannot be autodetected currently.
    - The first time you try to load a GGUF model, it will give you a popup asking to install support
        - This will autoinstall https://github.com/city96/ComfyUI-GGUF which is developed by city96.
    - You can accept this popup, and it will install and reload the backend
    - Then try to generate again, and it should just work
