# Model Type Support In SwarmUI

- [Image Models](#image-models)

| Model | Architecture | Year | Author | Scale | Quality/Status |
| ----  | ---- | ---- | ---- | ---- | ---- |
[Stable Diffusion v1 and v2](#stable-diffusion-v1-and-v2) | unet | 2022 | Stability AI | 1B | Outdated |
[Stable Diffusion v1 Inpainting Models](#stable-diffusion-v1-inpainting-models) | unet | 2022 | RunwayML | 1B | Outdated |
[Stable Diffusion XL](#stable-diffusion-xl) | unet | 2023 | Stability AI | 2B | Older but some finetunes are worth using |
[Stable Diffusion 3](#stable-diffusion-3) | MMDiT | 2024 | Stability AI | 2B | Outdated, prefer .5 |
[Stable Diffusion 3.5 Large](#stable-diffusion-35-large) | MMDiT | 2024 | Stability AI | 8B | Modern, High Quality |
[Stable Diffusion 3.5 Medium](#stable-diffusion-35-medium) | MMDiT | 2024 | Stability AI | 2B | Modern, High Quality |
[SDXL Turbo and SD Turbo](#sdxl-turbo-and-sd-turbo) | unet | 2023 | Stability AI | 2B | Outdated |
[Latent Consistency Models](#latency-consistency-models) | unet | 2023 | Tsinghua University | 1B/2B | Outdated |
[Lightning Models](#lightning-models) | unet | 2024 | ByteDance | 1B/2B | Outdated |
[Segmind SSD 1B](#segmind-ssd-1b) | unet | 2023 | Segmind | 1B | Outdated |
[Stable Cascade](#stable-cascade) | unet cascade | 2024 | Stability AI | 5B | Outdated |
[PixArt Sigma](#pixart-sigma) | DiT | 2024 | PixArt | 1B | Outdated |
[Nvidia Sana](#nvidia-sana) | DiT | 2024 | NVIDIA | 1.6B | Modern, Low Quality |
[AuraFlow v0.1 and v0.2](#auraflow-v01) | MMDiT | 2024 | Fal.AI | 6B | Outdated |
[Flux.1](#black-forest-labs-flux1-models) | MMDiT | 2024 | Black Forest Labs | 12B | Modern, High Quality |

- [Video Models](#video-models)
    - [Hunyuan Video](#hunyuan-video)
    - [Genmo Mochi 1](#genmo-mochi-1-text2video)
    - [Stable Video Diffusion](#stable-video-diffusion)
    - [Lightricks LTX Videoo](#lightricks-ltx-video)
- [Alternative Model Formats](#alternative-model-formats)
    - [BnB NF4](#bits-and-bytes-nf4-format-models)
    - [GGUF](#gguf-quantized-models)
    - [TensorRT](#tensorrt)

# General Info

- Swarm natively supports `.safetensors` format models with [ModelSpec](https://github.com/Stability-AI/ModelSpec) metadata
    - can also import metadata from some legacy formats used by other UIs (auto webui thumbnails, matrix jsons, etc)

# Image Models

- Image demos included below are mini-grids of seeds `1, 2, 3` of the prompt `wide shot, photo of a cat with mixed black and white fur, sitting in the middle of an open roadway, holding a cardboard sign that says "Meow I'm a Cat". In the distance behind is a green road sign that says "Model Testing Street".` ran on each model.
- For all models, "standard parameters" are used.
    - Steps is set to 20 except for Turbo models. Turbo models are ran at their standard fast steps (usually 4).
    - CFG is set appropriate to the model.
    - Resolution is model default.
- This prompt is designed to require (1) multiple complex components (2) photorealism (3) text (4) impossible actions (cat holding a sign - Most models get very confused how to do this).
- All generations are done on the base model of the relevant class, not on any finetune/lora/etc. Finetunes are likely to significantly change the qualitative capabilities, but unlikely to significantly change general ability to understand and follow prompts.
- This is not a magic perfect test prompt, just a decent coverage of range to showcase approximately what you can expect from the model in terms of understanding and handling challenges.
    - You could make a point that maybe I should have set CFG different or used a sigma value or changed up prompt phrasing or etc. and get better quality - this test intentionally uses very bland parameters to maximize identical comparison. Keep in mind that you can get better results out of a model by fiddling parameters.
- You'll note models started being able to do decently well on this test in late 2024. Older models noticeable fail at the basic requirements of this test.


## Stable Diffusion v1 and v2

![img](/docs/images/models/sd15.jpg)
*(Above image is SDv1.5)*

SDv1/SDv2 models work exactly as normal. Even legacy (pre-[ModelSpec](https://github.com/Stability-AI/ModelSpec) models are supported).

### Stable Diffusion v1 Inpainting Models

SDv1 inpaint models (RunwayML) are supported, but will work best if you manually edit the Architecture ID to be `stable-diffusion-v1/inpaint`.

Under `Init Image` param group, checkmark `Use Inpainting Encode`.

## Stable Diffusion XL

![img](/docs/images/models/sdxl.jpg)

SDXL models work as normal, with the bonus that by default enhanced inference settings will be used (eg scaled up rescond).

Additional, SDXL-Refiner architecture models can be inferenced, both as refiner or even as a base (you must manually set res to 512x512 and it will generate weird results).

## Stable Diffusion 3

![img](/docs/images/models/sd3m.jpg)

Stable Diffusion 3 Medium is supported and works as normal.

By default the first time you run an SD3 model, Swarm will download the text encoders for you.

Under the `Sampling` parameters group, a parameter named `SD3 TextEncs` is available to select whether to use CLIP, T5, or both. By default, CLIP is used (no T5) as results are near-identical but CLIP-only has much better performance, especially on systems with limited resources.

Under `Advanced Sampling`, the parameter `Sigma Shift` is available. This defaults to `3` on SD3, but you can lower it to around ~1.5 if you wish to experiment with different values. Messing with this value too much is not recommended.

For upscaling with SD3, the `Refiner Do Tiling` parameter is highly recommended (SD3 does not respond well to regular upscaling without tiling).

### Stable Diffusion 3.5 Large

![img](/docs/images/models/sd35l.jpg)

Stable Diffusion 3.5 Large is supported and works as normal, including both normal and Turbo variants.

They behave approximately the same as the SD3 Medium models, including same settings and all, other than harsher resource requirements and better quality.

You can also use [GGUF Versions](#gguf-quantized-models) of the models.

### Stable Diffusion 3.5 Medium

![img](/docs/images/models/sd35m.jpg)

Stable Diffusion 3.5 Medium is supported and works as normal.

They behave approximately the same as the SD3 Medium models, including same settings and all.

You can also use [GGUF Versions](#gguf-quantized-models) of the models.

SD 3.5 Medium support resolutions from 512x512 to 1440x1440, and the model metadata of the official model recommends 1440x1440. However, the official model is not good at this resolution. You will want to click the `☰` hamburger menu on a model, then `Edit Metadata`, then change the resolution to `1024x1024` for better results. You can of course set the `Aspect Ratio` parameter to `Custom` and the edit resolutions on the fly per-image.

## SDXL Turbo and SD Turbo

Turbo models work the same as regular models, just set `CFG Scale` to `1` and `Steps` to `1` as well. Under the `Sampling` group set `Scheduler` to `Turbo`.

## Latency Consistency Models

LCM models work the same as regular models, just set `CFG Scale` to `1` and `Steps` to `4`. Under the `Sampling` group set `Sampler` to `lcm`.

## Lightning Models

Lightning models work the same as regular models, just set `CFG Scale` to `1` and (TODO: Sampling specifics for lightning).

## SegMind SSD-1B

SegMind SSD-1B models work the same as SD models.

## Stable Cascade

![img](/docs/images/models/cascade.jpg)

Stable Cascade is supported if you use the "ComfyUI Format" models (aka "All In One") https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints that come as a pair of `stage_b` and `stage_c` models.

You must keep the two in the same folder, named the same with the only difference being `stage_b` vs `stage_c` in the filename.

Either model can be selected in the UI to use them, it will automatically use both.

# PixArt Sigma

![img](/docs/images/models/pixart-sigma-xl-2.jpg)
*(above image is PixArt Sigma XL 2 1024 MS)*

The [PixArt Sigma MS models](https://huggingface.co/PixArt-alpha/PixArt-Sigma/tree/main) are supported in Swarm with a few setup steps.

These steps are not friendly to beginners (if PixArt gains popularity, likely more direct/automated/native support will be added), but advanced users can follow:

- After downloading the model, run Swarm's **Utilities** -> **Pickle To Safetensors** -> `Convert Models`. You need a safetensors models for Swarm to accurately identify model type.
    - Or download a preconverted copy, like this one: https://huggingface.co/HDiffusion/Pixart-Sigma-Safetensors
- After you have a safetensors model, find it in the Models tab and click the menu button on the model and select "`Edit Metadata`"
    - From the `Architecture` dropdown, select `PixArtMS Sigma XL 2` for 1024 or lower models, or `XL 2 (2K)` for the 2k
    - In the `Standard Resolution` box, enter `1024x1024` for 1024 or `512x512` for the 512, or `2048x2048` for the 2k
- The first time you run a PixArt model, it will prompt you to install [Extra Models by City96](https://github.com/city96/ComfyUI_ExtraModels). You must accept this for PixArt models to work.
- Make sure in **User Settings**, you have a `DefaultSDXLVae` selected. If not, Swarm will autodownload a valid SDXL VAE.
- Swarm will autodownload T5XXL-EncoderOnly for you on first run (same as SD3-Medium T5-Only mode)
- You can now use the model as easily as any other model. Some feature compatibility features might arise.

# NVIDIA Sana

![img](/docs/images/models/sana-1600m.jpg)
*(above image is Nvidia Sana 1600M 1024)*

The [Nvidia Sana models](https://huggingface.co/Efficient-Large-Model/Sana_1600M_1024px) are supported in Swarm with a few setup steps.

These steps are not friendly to beginners (if Sana gains popularity, likely more direct/automated/native support will be added), but advanced users can follow:

- Recommended: use the [preconverted Sana model](https://huggingface.co/mcmonkey/sana-models/blob/main/Sana_1600M_1024px.safetensors)
- Otherwise, if you use the original 'pth' version, after downloading the model, run Swarm's **Utilities** -> **Pickle To Safetensors** -> `Convert Models`. You need a safetensors models for Swarm to accurately identify model type.
- The first time you run a Sana model, it will prompt you to install [Extra Models by City96](https://github.com/city96/ComfyUI_ExtraModels). You must accept this for Sana models to work.
- You may need to manually install pip packages: `python -s -m pip install -U transformers`, possibly also `bitsandbytes`
- Swarm will autodownload the Sana DCAE VAE for you on the first run.
- The text encoder, Gemma 2B, will also be autodownloaded (in this case by the backing comfy nodes)
- You can now use the model as easily as any other model. Some feature compatibility features might arise.
- Only Sana 1600M 1024 has been validated currently
- use a CFG around 4

# AuraFlow v0.1

![img](/docs/images/models/auraflow-02.jpg)
*(above image is AuraFlow v0.2)*

[Fal.ai's AuraFlow v0.1](https://huggingface.co/fal/AuraFlow/tree/main) and [v0.2](https://huggingface.co/fal/AuraFlow-v0.2) is supported in Swarm, but you must manually select architecture to use it. (The AuraFlow team said they intend to add modelspec metadata in the future).

Download the model, then click "`Edit Metadata`" and select `(Temporary) AuraFlow` as the architecture, and set resolution to `1024x1024`.

# Black Forest Labs' Flux.1 Models

### Flux Dev

![img](/docs/images/models/flux-dev.jpg)

### Flux Schnell

![img](/docs/images/models/flux-schnell.jpg)

### Info

- Black Forest Labs' Flux.1 model is fully supported in Swarm <https://blackforestlabs.ai/announcing-black-forest-labs/>
    - **Recommended:** use the [GGUF Format Files](#gguf-quantized-models)
    - **Alternate:** the simplified fp8 file:
        - Dev <https://huggingface.co/Comfy-Org/flux1-dev/blob/main/flux1-dev-fp8.safetensors>
        - Schnell <https://huggingface.co/Comfy-Org/flux1-schnell/blob/main/flux1-schnell-fp8.safetensors>
        - goes in your regular `(Swarm)/Models/Stable-Diffusion` dir
    - **or, not recommended:** You can download BFL's original files:
        - Download "Schnell" (Turbo) from <https://huggingface.co/black-forest-labs/FLUX.1-schnell>
        - Or "Dev" (non-Turbo) from <https://huggingface.co/black-forest-labs/FLUX.1-dev>
        - Put dev/schnell in `(Swarm)/Models/diffusion_models`
        - Required VAE & TextEncoders will be autodownloaded if you do not already have them.
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
    - You can also use [GGUF Versions](#gguf-quantized-models) of the models.

### Flux.1 Tools

- The Flux.1 Tools announced [here by BFL](https://blackforestlabs.ai/flux-1-tools/) are supported in SwarmUI
- For "**Redux**", a Flux form of image prompting:
    - Download [the Redux model](https://huggingface.co/black-forest-labs/FLUX.1-Redux-dev/blob/main/flux1-redux-dev.safetensors) to `(SwarmUI)/Models/style_models`
    - (Don't worry about sigclip, it is automanaged)
    - Drag an image to the prompt area
    - On the top left, find the `Image Prompting` parameter group
    - Select the `Use Style Model` parameter to the Redux model
    - There's an advanced `Style Model Apply Start` param to allow better structural control from your text prompt
        - set to 0.1 or 0.2 or so to have the text prompt guide structure before redux takes over styling
        - at 0, text prompt is nearly ignored
    - The advanced `Style Model Merge Strength` param lets you partial merge the style model against the nonstyled input, similar to Multiply Strength
    - The advanced `Style Model Multiply Strength` param directly multiplies the style model output, similar to Merge Strength
- For "**Canny**" / "**Depth**" models, they work like regular models (or LoRAs), but require an Init Image to function.
    - You must input an appropriate image. So eg for the depth model, input a Depth Map.
        - You can use the controlnet parameter group to generate depth maps or canny images from regular images.
            - (TODO: Native interface to make that easier instead of janking controlnet)
    - Make sure to set Creativity to `1`.
    - This is similar in operation to Edit models.
- For "**Fill**" (inpaint model), it works like other inpaint models.
    - "Edit Image" interface encouraged.
    - Mask a region and go.
    - Creativity `1` works well.
    - Larger masks recommended. Small ones may not replace content.
    - Boosting the `Flux Guidance Scale` way up to eg `30` may improve quality

# Video Models

## Stable Video Diffusion

SVD models are supported via the `Image To Video` parameter group. Like XL, video by default uses enhanced inference settings (better sampler and larger sigma value).

You can do text2video by just checking Video as normal, or image2video by using an Init Image and setting Creativity to 0.

## Hunyuan Video

- Hunyuan Video is supported natively in SwarmUI as a Text-To-Video model.
- Use the Comfy Org repackaged model <https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/blob/main/split_files/diffusion_models/hunyuan_video_t2v_720p_bf16.safetensors> or the FastVideo fp8 from Kijai <https://huggingface.co/Kijai/HunyuanVideo_comfy/blob/main/hunyuan_video_FastVideo_720_fp8_e4m3fn.safetensors>
    - Save to the `diffusion_models` folder
    - For FastVideo, you can use step counts as low as 6. Use the `Sigma Shift` param at a high value around 17, and the Flux Guidance at a higher than normal value as well
- Or use the gguf models from city96 <https://huggingface.co/city96/HunyuanVideo-gguf/tree/main>
    - Save to the `diffusion_models` folder, then load up Swarm and click the `☰` hamburger menu on the model, then `Edit Metadata`, and set the `Architecture:` field to `Hunyuan Video`
- The text encoders (T5-XXL, and LLaVA-LLaMA3) and VAE will be automatically downloaded.
- When selected, the `Text To Video` parameter group will become visible
- The model is trained for 1280x720 or 960x544 resolutions or other aspect ratios of the same total pixel count, but can work at other scales (with some quality loss). Swarm will default to a scale of 848x480, which is stable and reduces VRAM impact for normal home GPUs.
- The model is trained for 24 fps, and dynamic frame counts (eg 73 or 129 is solid). Multiples of 4 plus 1 (4, 9, 13, 17, ...) are required due to the 4x temporal compression in the Hunyuan VAE. The input parameter will automatically round if you enter an invalid value.
- Hunyuan Video is very GPU and memory intensive, especially the VAE
    - Even on an RTX 4090, this will max out your VRAM and will be very slow to generate. (GGUF model coming soon may help?)
- The VAE has a harsh memory requirement that may limit you from high duration videos.
    - To reduce VRAM impact and fit on most normal GPUs, set `VAE Tile Size` to `160` or `128`, and `VAE Tile Overlap` to `64` or `96`. The tiling pattern is not particularly noticeable.
    - If you do not manually enable VAE Tiling, Swarm will automatically enable it at 256 with 64 overlap. (Because the memory requirements without tiling are basically impossible. You can set the tiling values very very high if you want to make the tile artifacts invisible and have enough memory to handle it).
- Hunyuan Video is based on the Flux Dev architecture, and has similar requirements.
    - Set CFG Scale to 1.
    - You can use Flux Guidance parameter on this model (for Hunyuan Video, unlike Flux Dev, this value is embedded from CFG scale, and so prefers values around 6).
- By default the BF16 version of the model will be loaded in FP8 model. To change this, use the `Preferred DType` advanced parameter. FP8 noticeably changes results compared to BF16, but lets it run much much faster. The GGUF versions of the model are highly recommended, as they get much closer to original and very close performance to fp8. GGUF Q6_K is nearly identical to BF16.

## Genmo Mochi 1 (Text2Video)

- Genmo Mochi 1 is supported natively in SwarmUI as a Text-To-Video model.
- You can get either the all-in-one checkpoint <https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/all_in_one>
    - save to `Stable-Diffusion` folder
- Or get the DiT only variant <https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/split_files/diffusion_models> (FP8 Scaled option recommended)
    - save to `diffusion_models` folder
- The text encoder (T5-XXL) and VAE will be automatically downloaded
    - You can also set these manually if preferred
- When selected, the `Text To Video` parameter group will become visible
- Mochi is very GPU and memory intensive, especially the VAE
- The model is trained for 24 fps, and frame counts dynamic anywhere up to 200. Multiples of 6 plus 1 (7, 13, 19, 25, ...) are required due to the 6x temporal compression in the Mochi VAE. The input parameter will automatically round if you enter an invalid value.
- The VAE has a harsh memory requirement that may limit you from high duration videos.
    - To reduce VRAM impact and fit on most normal GPUs, set `VAE Tile Size` to `160` or `128`, and `VAE Tile Overlap` to `64` or `96`. There will be a slightly noticeable tiling pattern on the output, but not too bad at 160 and 96.
    - If you have a lot of VRAM (eg 4090) and want to max quality but can't quite fit the VAE without tiling, Tile Size 480 Overlap 32 will tile the VAE in just two chunks to cut the VAE VRAM usage significantly while retaining near perfect quality.

## Lightricks LTX Video

- Lightricks LTX Video ("LTXV") is supported natively in SwarmUI as a Text-To-Video and also as an Image-To-Video model.
- Download <https://huggingface.co/Lightricks/LTX-Video/blob/main/ltx-video-2b-v0.9.safetensors>
    - save to `Stable-Diffusion` folder
    - The text encoder (T5-XXL) and VAE will be automatically downloaded
        - You can also set these manually if preferred
- When selected in the Models list, the `Text To Video` parameter group will become visible
- The model is trained for 24 fps but supports custom fps values, and frame counts dynamic anywhere up to 257. Multiples of 8 plus 1 (9, 17, 25, 33, 41, ...) are required due to the 8x temporal compression in the LTXV VAE. The input parameter will automatically round if you enter an invalid value.
- Recommended CFG=3, and very very long descriptive prompts.
    - Seriously this model will make a mess with short prompts.
    - Example prompt (from ComfyUI's reference workflow):
        - Prompt: `best quality, 4k, HDR, a tracking shot of a beautiful scene of the sea waves on the beach`
        - Negative Prompt: `low quality, worst quality, deformed, distorted, disfigured, motion smear, motion artifacts, fused fingers, bad anatomy, weird hand, ugly`
- You can use it as an Image-To-Video model
    - Select an image model and configure usual generation parameters
    - Select the LTXV model under the `Image To Video` group's `Video Model` parameter
    - Set `Video FPS` to `24` and `Video CFG` to `3`, set `Video Frames` to a higher value eg `97`
    - Pay attention that your prompt is used for both the image, and video stages
        - You may wish to generate the image once, then do the video separately
        - To do that, set the image as an `Init Image`, and set `Creativity` to `0`

# Alternative Model Formats

## Bits-and-Bytes NF4 Format Models

- BnB NF4 format models, such as this copy of Flux Dev <https://huggingface.co/lllyasviel/flux1-dev-bnb-nf4/tree/main?show_file_info=flux1-dev-bnb-nf4.safetensors>, are partially supported in SwarmUI automatically.
    - The detection internally works by looking for `bitsandbytes__nf4` in the model's keys
    - The first time you try to load an NF4 model, it will give you a popup asking to install support
        - This will autoinstall https://github.com/comfyanonymous/ComfyUI_bitsandbytes_NF4 which is developed by comfyanonymous and lllyasviel, and is under the AGPL license.
    - You can accept this popup, and it will install and reload the backend
    - Then try to generate again, and it should work
- Note that BnB-NF4 models have multiple compatibility limitations, including even LoRAs don't apply properly.
    - If you want a quantized flux model, GGUF is recommended instead.

## GGUF Quantized Models

- GGUF Quantized `diffusion_models` models are supported in SwarmUI automatically.
    - Examples of GGUF core models include:
        - Flux Schnell <https://huggingface.co/city96/FLUX.1-schnell-gguf/tree/main> or Flux Dev <https://huggingface.co/city96/FLUX.1-dev-gguf/tree/main>
        - SD3.5 Large <https://huggingface.co/city96/stable-diffusion-3.5-large-gguf/tree/main> or LargeTurbo <https://huggingface.co/city96/stable-diffusion-3.5-large-turbo-gguf/tree/main>
        - SD3.5 Medium <https://huggingface.co/city96/stable-diffusion-3.5-medium-gguf/tree/main>
    - The detection is based on file extension.
    - They go in `(Swarm)/Models/diffusion_models` and work similar to other `diffusion_models` format models
        - Required VAE & TextEncoders will be autodownloaded if you do not already have them.
    - You will have to click the `☰` hamburger menu on a model, then `Edit Metadata`, and set the `Architecture:` field to the relevant correct one (it cannot be autodetected currently).
    - The first time you try to load a GGUF model, it will give you a popup asking to install support
        - This will autoinstall https://github.com/city96/ComfyUI-GGUF which is developed by city96.
    - You can accept this popup, and it will install and reload the backend
    - Then try to generate again, and it should just work

## TensorRT

- TensorRT support (`.engine`) is available for SDv1, SDv2-768-v, SDXL Base, SDXL Refiner, SVD, SD3-Medium
- TensorRT is an nvidia-specific accelerator library that provides faster SD image generation at the cost of reduced flexibility. Generally this is best for heavy usages, especially for API/Bots/etc. and less useful for regular individual usage.
- You can generate TensorRT engines from the model menu. This includes a button on-page to autoinstall TRT support your first time using it, and configuration of graph size limits and optimal scales. (TensorRT works fastest when you generate at the selected optimal resolution, and slightly less fast at any dynamic resolution outside the optimal setting.)
- Note that TensorRT is not compatible with LoRAs, ControlNets, etc.
- Note that you need to make a fresh TRT engine for any different model you want to use.
