# Model Type Support In SwarmUI

| Model | Architecture | Year | Author | Scale | Censored? | Quality/Status |
| ----  | ---- | ---- | ---- | ---- | ---- | ---- |
[Stable Diffusion v1 and v2](#stable-diffusion-v1-and-v2) | unet | 2022 | Stability AI | 1B | No | Outdated |
[Stable Diffusion v1 Inpainting Models](#stable-diffusion-v1-inpainting-models) | unet | 2022 | RunwayML | 1B | No | Outdated |
[Stable Diffusion XL](#stable-diffusion-xl) | unet | 2023 | Stability AI | 2B | Partial | Older but some finetunes are worth using |
[SD1 and SDXL Turbo Variants](#sd1-and-sdxl-turbo-variants) | unet | 2023 | Stability AI and others | 2B | Partial | Outdated |
[Stable Diffusion 3](#stable-diffusion-3) | MMDiT | 2024 | Stability AI | 2B | Yes | Outdated, prefer 3.5 |
[Stable Diffusion 3.5 Large](#stable-diffusion-35-large) | MMDiT | 2024 | Stability AI | 8B | Partial | Modern, High Quality |
[Stable Diffusion 3.5 Medium](#stable-diffusion-35-medium) | MMDiT | 2024 | Stability AI | 2B | Partial | Modern, Good Quality |
[Segmind SSD 1B](#segmind-ssd-1b) | unet | 2023 | Segmind | 1B | Partial | Outdated |
[Stable Cascade](#stable-cascade) | unet cascade | 2024 | Stability AI | 5B | Partial | Outdated |
[PixArt Sigma](#pixart-sigma) | DiT | 2024 | PixArt | 1B | ? | Outdated |
[Nvidia Sana](#nvidia-sana) | DiT | 2024 | NVIDIA | 1.6B | No | Modern, Low Quality |
[AuraFlow](#auraflow) | MMDiT | 2024 | Fal.AI | 6B | Yes | Outdated |
[Flux.1](#black-forest-labs-flux1-models) | MMDiT | 2024 | Black Forest Labs | 12B | Partial | Modern, High Quality |
[Lumina 2.0](#lumina-2) | NextDiT | 2025 | Alpha-VLLM | 2.6B | Partial | Modern, Decent Quality |
[HiDream i1](#hidream-i1) | MMDiT | 2025 | HiDream AI (Vivago) | 17B | Minimal | Modern, High Quality, very memory intense |
[Nvidia Cosmos Predict2](#cosmos-predict2) | DiT | 2025 | NVIDIA | 2B/14B | Partial | Modern but bad |
[OmniGen 2](#omnigen-2) | MLLM | 2025 | VectorSpaceLab | 7B | No | Modern, Decent Quality |

- **Architecture** is the fundamental machine learning structure used for the model, UNet's were used in the past but DiT (Diffusion Transformers) are the modern choice
- **Scale** is how big the model is - "B" for "Billion", so for example "2B" means "Two billion parameters".
    - One parameter is one number value, so for example in fp16 (16 bit, ie 2 bytes per number), a 2B model is 4 gigabytes. In fp8 (8 bit, ie 1 byte per number), a 2B model is 2 gigabytes.
    - If you often use fp8 or q8 models, just read the "B" as "gigabytes" for a good approximation
- **Censored?** is tested by generating eg "a photo of a naked woman" on the model.
    - This test only refers to the base models, finetunes can add nudity and other "risque" content back in.
    - Most base models will not generate genitalia, and have limited quality with other body parts and poses. Every popular model has finetunes available to add those capabilities, if you want them.
        - Sometimes it's not even intentional censorship, just the simple fact that broad base models aren't good at any one thing - so, again, content-specific finetunes fix that.
    - Model censorship can take other forms (eg does it recognize names of celebrities/artists/brands, can it do gore, etc.) so if a model sounds right to you you may want do your own testing to see if it's capable of the type of content you like
    - "No" means it generates what was asked,
    - "Minimal" means it's eg missing genitals but otherwise complete,
    - "Partial" means it's clearly undertrained at NSFW content (eg difficult to prompt for or poor quality body) but doesn't explicitly refuse,
    - "Yes" means it's entirely incapable or provides an explicit refusal response.
- **Quality/Status** is a loose vibe-based metric to imply whether it's worth using in the current year or not.

- Video models are in [Video Model Support](/docs/Video%20Model%20Support.md)

# Current Recommendations

Image model(s) most worth using, as of April 2025:

- Flux Dev in Nunchaku format for best speed/quality combo
- SDXL finetunes for best broad availability of finetunes and loras, at high speed (with limited quality), especially for anime-style usage
- HiDream for best base model quality and least censorship, at cost of speed (especially with limited PC hardware)

# General Info

- Swarm natively supports `.safetensors` format models with [ModelSpec](https://github.com/Stability-AI/ModelSpec) metadata
    - can also import metadata from some legacy formats used by other UIs (auto webui thumbnails, matrix jsons, etc)
    - can also fallback to a `.swarm.json` sidecar file for other supported file formats
- Swarm can load other model file formats, see [Alternative Model Formats](#alternative-model-formats)
    - Notably, *quantization* technique formats. "Quantization" means shrinking a model to use lower memory than is normally reasonable.
        - Normal sizes are named like "BF16", "FP16", "FP8", ... ("BF"/"FP" prefixes are standard formats)
        - Quantized sizes have names like "NF4", "Q4_K_M", "Q8", "SVDQ-4", "Int-4", ("Q" means quantized, but there are technique-specific labels)
    - [BnB NF4](#bits-and-bytes-nf4-format-models) (not recommended, quantization technique)
    - [GGUF](#gguf-quantized-models) (recommended, good quality quantization technique, slower speed)
    - [Nunchaku](#nunchaku-mit-han-lab) (very recommended, great quality high speed quantization technique)
    - [TensorRT](#tensorrt) (not recommended, speedup technique)

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

## SD1 and SDXL Turbo Variants

Turbo, LCM (Latent Consistency Models), Lightning, etc. models work the same as regular models, just set `CFG Scale` to `1` and:
    - For Turbo, `Steps` to `1` Under the `Sampling` group set `Scheduler` to `Turbo`.
    - For LCM, `Steps` to `4`. Under the `Sampling` group set `Sampler` to `lcm`.
    - For lightning, (?)

## SegMind SSD-1B

SegMind SSD-1B models work the same as SD models.

## Stable Diffusion 3

![img](/docs/images/models/sd3m.jpg)

Stable Diffusion 3 Medium is supported and works as normal.

By default the first time you run an SD3 model, Swarm will download the text encoders for you.

Under the `Sampling` parameters group, a parameter named `SD3 TextEncs` is available to select whether to use CLIP, T5, or both. By default, CLIP is used (no T5) as results are near-identical but CLIP-only has much better performance, especially on systems with limited resources.

Under `Advanced Sampling`, the parameter `Sigma Shift` is available. This defaults to `3` on SD3, but you can lower it to around ~1.5 if you wish to experiment with different values. Messing with this value too much is not recommended.

For upscaling with SD3, the `Refiner Do Tiling` parameter is highly recommended (SD3 does not respond well to regular upscaling without tiling).

### Stable Diffusion 3.5 Large

![img](/docs/images/models/sd35l.jpg)

- Stable Diffusion 3.5 Large is supported and works as normal, including both normal and Turbo variants.
- The [TensorArt 3.5L TurboX](https://huggingface.co/tensorart/stable-diffusion-3.5-large-TurboX/tree/main) works too, just set `CFG Scale` to `1`, and `Steps` to `8`, and advanced `Sigma Shift` to `5`
- They behave approximately the same as the SD3 Medium models, including same settings and all, other than harsher resource requirements and better quality.
- You can also use [GGUF Versions](#gguf-quantized-models) of the models.
    - SD3.5 Large <https://huggingface.co/city96/stable-diffusion-3.5-large-gguf/tree/main> or LargeTurbo <https://huggingface.co/city96/stable-diffusion-3.5-large-turbo-gguf/tree/main>

### Stable Diffusion 3.5 Medium

![img](/docs/images/models/sd35m.jpg)

- Stable Diffusion 3.5 Medium is supported and works as normal.
- They behave approximately the same as the SD3 Medium models, including same settings and all.
- You can also use [GGUF Versions](#gguf-quantized-models) of the models.
    - SD3.5 Medium <https://huggingface.co/city96/stable-diffusion-3.5-medium-gguf/tree/main>
- SD 3.5 Medium support resolutions from 512x512 to 1440x1440, and the model metadata of the official model recommends 1440x1440. However, the official model is not good at this resolution. You will want to click the `☰` hamburger menu on a model, then `Edit Metadata`, then change the resolution to `1024x1024` for better results. You can of course set the `Aspect Ratio` parameter to `Custom` and the edit resolutions on the fly per-image.

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

# AuraFlow

![img](/docs/images/models/auraflow-02.jpg)
*(above image is AuraFlow v0.2)*

[Fal.ai's AuraFlow v0.1](https://huggingface.co/fal/AuraFlow/tree/main) and [v0.2](https://huggingface.co/fal/AuraFlow-v0.2) and v0.3 are supported in Swarm, but you must manually select architecture to use it.

Download the model, then click "`Edit Metadata`" and select `AuraFlow` as the architecture, and set resolution to `1024x1024`.

Parameters and usage is the same as any other normal model.

# Black Forest Labs' Flux.1 Models

### Flux Dev

![img](/docs/images/models/flux-dev.jpg)

### Flux Schnell

![img](/docs/images/models/flux-schnell.jpg)

### Install

- Black Forest Labs' Flux.1 model is fully supported in Swarm <https://blackforestlabs.ai/announcing-black-forest-labs/>
    - **Recommended:** for best performance on modern nvidia cards, use Nunchaku models.
        - These run twice as fast as the next best speed option (fp8) while using less memory too (close to gguf q4)
        - Flux dev <https://huggingface.co/mit-han-lab/nunchaku-flux.1-dev/tree/main>
        - Flux Schnell <https://huggingface.co/mit-han-lab/nunchaku-flux.1-schnell/tree/main>
        - Use "fp4" for Blackwell (eg RTX 5090) or newer cards, use "int4" for anything older (4090, 3090, etc.)
        - See the [Nunchaku Support](#nunchaku-mit-han-lab) section for more info on this format
    - **Recommended:** use the [GGUF Format Files](#gguf-quantized-models) (best for most graphics cards)
        - Flux Schnell <https://huggingface.co/city96/FLUX.1-schnell-gguf/tree/main>
        - Flux Dev <https://huggingface.co/city96/FLUX.1-dev-gguf/tree/main>
        - `Q6_K` is best accuracy on high VRAM, but `Q4_K_S` cuts VRAM requirements while still being very close to original quality, other variants shouldn't be used normally
        - Goes in `(Swarm)/Models/diffusion_models`
        - After adding the model, refresh the list, then you may need to click the `☰` hamburger menu on the model, then `Edit Metadata` and set the `Architecture` to `Flux Dev` or `Flux Schnell` as relevant, unless it detects correctly on its own.
    - **Alternate:** the simplified fp8 file (best on 3090, 4090, or higher tier cards):
        - Dev <https://huggingface.co/Comfy-Org/flux1-dev/blob/main/flux1-dev-fp8.safetensors>
        - Schnell <https://huggingface.co/Comfy-Org/flux1-schnell/blob/main/flux1-schnell-fp8.safetensors>
        - goes in your regular `(Swarm)/Models/Stable-Diffusion` dir
    - **or, not recommended:** You can download BFL's original files:
        - Download "Schnell" (Turbo) from <https://huggingface.co/black-forest-labs/FLUX.1-schnell>
        - Or "Dev" (non-Turbo) from <https://huggingface.co/black-forest-labs/FLUX.1-dev>
        - Goes in `(Swarm)/Models/diffusion_models`
    - Required VAE & TextEncoders will be autodownloaded if you do not already have them, you don't need to worry about those.

### Parameters

- **CFG Scale:** For both models, use `CFG Scale` = `1` (negative prompt won't work).
    - For the Dev model, there is also a `Flux Guidance Scale` parameter under `Sampling`, which is a distilled embedding value that the model was trained to use.
    - Dev can use some slightly-higher CFG values (allowing for negative prompt), possibly higher if you reduce the Flux Guidance value and/or use Dynamic Thresholding.
- **Sampler:** Leave it at default (Euler + Simple)
- **Steps:** For Schnell use Steps=4 (or lower, it can even do 1 step), for Dev use Steps=20 or higher
- **Resolution:** It natively supports any resolution up to 2 mp (1920x1088), and any aspect ratio thereof. By default will use 1MP 1024x1024 in Swarm. You can take it down to 256x256 and still get good results.
    - You can mess with the resolution quite a lot and still get decent results. It's very flexible even past what it was trained on.
- You _can_ do a refiner upscale 2x and it will work but take a long time and might not have excellent quality.
    - Enable `Refiner Do Tiling` for any upscale target resolution above 1536x1536.

### Performance

- Flux is best on a very high end GPU (eg 4090) for now. It is a 12B model.
    - Smaller GPUs can run it, but will be slow. This requires a lot of system RAM (32GiB+). It's been shown to work as low down as an RTX 2070 or 2060 (very slowly).
- On a 4090, schnell takes about 4/5 seconds to generate a 4-step image, very close to SDXL 20 steps in time, but much higher quality.
- By default swarm will use fp8_e4m3fn for Flux, if you have a very very big GPU and want to use fp16/bf16, under `Advanced Sampling` set `Preferred DType` to `Default (16 bit)`

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
    - Goes in the regular `diffusion_models` or lora folder depending on which you downloaded.
    - You must input an appropriate image. So eg for the depth model, input a Depth Map.
        - You can use the controlnet parameter group to generate depth maps or canny images from regular images.
            - (TODO: Native interface to make that easier instead of janking controlnet)
    - Make sure to set Creativity to `1`.
    - This is similar in operation to Edit models.
- For "**Fill**" (inpaint model), it works like other inpaint models.
    - It's a regular model file, it goes in the regular `diffusion_models` folder same as other flux models.
    - "Edit Image" interface encouraged.
    - Mask a region and go.
    - Creativity `1` works well.
    - Larger masks recommended. Small ones may not replace content.
    - Boosting the `Flux Guidance Scale` way up to eg `30` may improve quality
- For "**Kontext**" (edit model), it works like other edit models.
    - Model download here <https://huggingface.co/Comfy-Org/flux1-kontext-dev_ComfyUI/blob/main/split_files/diffusion_models/flux1-dev-kontext_fp8_scaled.safetensors>
    - Or the official BFL 16 bit upload <https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev>
    - Or some GGUFs here <https://huggingface.co/QuantStack/FLUX.1-Kontext-dev-GGUF/tree/main>
    - It's a regular model file, it goes in the regular `diffusion_models` folder same as other flux models.
    - You will have to manually edit the architecture to be `Flux.1 Kontext Dev`, it misdetects by default
    - Paste images into the prompt box to serve as the reference images it will use to generate.
        - If you have an init image and no reference images, the init image will be used.
        - Be aware that the first image used will be the resolution control of the input. You will want to keep the image between 1024 and 2048 pixels wide.
            - (If the image is significantly out of scale range, eg 512x512, it will be automatically rescaled for you)
    - Kontext can take as many images as you want, but the way this works on the inside is a bit hacky and limited quality.
    - Prompt should describe a *change* to make to the image.
    - BFL published an official prompting guide here, following it carefully is recommended: <https://docs.bfl.ai/guides/prompting_guide_kontext_i2i>
- If you want to use the **ACE Plus** Models (Character consistency)
    - Download the LoRAs from https://huggingface.co/ali-vilab/ACE_Plus/tree/main and save as normal loras
    - Enable the Flux Fill model, enable the LoRA you chose
    - Set `Flux Guidance Scale` way up to `50`
    - Open an image editor for the image you want to use as an input (Drag to center area, click Edit Image)
    - set `Init Image Creativity` to 1 (max)
    - Change your `Resolution` parameters to have double the `Width` (eg 1024 input, double to 2048)
    - Add a Mask, draw a dot anywhere in the empty area (this is just a trick to tell the editor to automask all the empty area to the side, you don't need to mask it manually)
    - Type your prompt, hit generate

### Chroma

- Chroma is a derivative of Flux, and is supported in SwarmUI
    - FP8 Scaled versions here: <https://huggingface.co/Clybius/Chroma-fp8-scaled/tree/main>
    - Or GGUF versions here: <https://huggingface.co/silveroxides/Chroma-GGUF>
    - Or original BF16 here (not recommended): <https://huggingface.co/lodestones/Chroma/tree/main>
    - Model files goes in `diffusion_models`
    - Uses standard CFG, not distilled to 1 like other Flux models
    - Official reference workflow uses Scheduler=`Align Your Steps` with Steps=`26` and CFG Scale=`4`
        - (It's named `Optimal Steps` in their workflow, but Swarm's AYS scheduler is equivalent to that)
    - Generally works better with longer prompts. Adding some "prompt fluff" on the end can help clean it up. This is likely related to it being a beta model with an odd training dataset.
    - "Sigmoid Offset" scheduler is their newer recommendation, it requires a custom node
        - You can `git clone https://github.com/silveroxides/ComfyUI_SigmoidOffsetScheduler` into your ComfyUI `custom_nodes`, and then restart SwarmUI, and it will be available from the `Scheduler` param dropdown

# Lumina 2

![img](/docs/images/models/lumina-2.png)
*(Generated with the `highest degree of image-text alignment` preprompt, CFG=4, SigmaShift=6, Steps=20)*

- Lumina 2 is an image diffusion transformer model, similar in structure to SD3/Flux/etc. rectified flow DiTs, with an LLM (Gemma 2 2B) as its input handler.
- It is a 2.6B model, similar size to SDXL or SD3.5M, much smaller than Flux or SD3.5L
- You can download the Comfy Org repackaged version of the model for use in SwarmUI here: <https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/blob/main/all_in_one/lumina_2.safetensors>
    - Or the `diffusion_models` variant <https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/blob/main/split_files/diffusion_models/lumina_2_model_bf16.safetensors> (this version will by default load in fp8, and run a bit faster on 40xx cards)
- Because of the LLM input, you have to prompt it like an LLM.
    - This means `a cat` yields terrible results, instead give it: `You are an assistant designed to generate superior images with the superior degree of image-text alignment based on textual prompts or user prompts. <Prompt Start> a cat` to get good results
    - Lumina's published reference list of prompt prefixes from [source code](https://github.com/Alpha-VLLM/Lumina-Image-2.0/blob/main/sample.py#L246):
        - `You are an assistant designed to generate high-quality images with the highest degree of image-text alignment based on textual prompts. <Prompt Start> `
        - `You are an assistant designed to generate high-quality images based on user prompts. <Prompt Start> `
        - `You are an assistant designed to generate high-quality images with highest degree of aesthetics based on user prompts. <Prompt Start> `
        - `You are an assistant designed to generate superior images with the superior degree of image-text alignment based on textual prompts or user prompts. <Prompt Start> `
        - `You are an assistant designed to generate four high-quality images with highest degree of aesthetics arranged in 2x2 grids based on user prompts. <Prompt Start> `
        - You can absolutely make up your own though.
        - For longer prompts the prefix becomes less needed.
- The model uses the Flux.1 VAE
- **Parameters:**
    - **CFG**: 4 is their base recommendation
    - **Sigma Shift:** The default is `6` per Lumina reference script, Comfy recommends `3` for use with lower step counts, so you can safely mess with this parameter if you want to. 6 seems to be generally better for structure, while 3 is better for fine details by sacrificing structure, but may have unwanted artifacts. Raising step count reduces some artifacts.
    - **Steps:** The usual 20 steps is fine, but reference Lumina script uses 250(?!) by default (it has a weird sampler that is akin to Euler at 36 steps actually supposedly?)
        - Quick initial testing shows that raising steps high doesn't work any particularly different on this model than others, but the model at SigmaShift=6 produces some noise artifacts at regular 20 steps, raising closer to 40 cuts those out.
    - **Renorm CFG:** Lumina 2 reference code sets a new advanced parameter `Renorm CFG` to 1. This is available in Swarm under `Advanced Sampling`.
        - The practical difference is subjective and hard to predict, but enabling it seems to tend towards more fine detail

# HiDream-i1

![img](/docs/images/models/hidream-i1-dev.jpg)
*(Generated with HiDream-i1 Dev, CFG=1, Steps=20, SigmaShift=3)*

- HiDream-i1 Models are supported in SwarmUI.
    - You can pick Full, Dev, or Fast variant. Most users should prefer Dev or Fast.
        - **Full:** Uses standard CFG and step counts, no distillation or other tricks. Slowest option, theoretically smartest model (in practice visual quality is poor, but prompt understanding is strong)
        - **Dev:** Uses CFG=1 distillation but standard step counts, akin to Flux-Dev. Best middle ground option.
        - **Fast:** Uses CFG=1 and low step count distillation, akin to Flux-Schnell. Best for speed focus, at cost of quality.
    - The models are 17B, which is massive, so you'll likely prefer a quantized version.
        - Dev model gguf quant: <https://huggingface.co/city96/HiDream-I1-Dev-gguf/tree/main>
        - Full model gguf quant: <https://huggingface.co/city96/HiDream-I1-Full-gguf/tree/main>
        - `Q6_K` is best accuracy on high VRAM, but `Q4_K_S` cuts VRAM requirements while still being very close to original quality, other variants shouldn't be used normally
        - Comfy Org's fp8 and fat bf16 versions: <https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/split_files/diffusion_models>
        - Goes in `(Swarm)/Models/diffusion_models`
        - All models share the same architecture identifiers. Make sure to configure parameters appropriately for the specific variant you're using (CFG and Steps).
    - There's also "Edit", a version that does ip2p style editing (give an init image, set creativity to 1, and prompt it with a change request, eg "draw a mustache on her")
        - BF16 raw fat file here <https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/blob/main/split_files/diffusion_models/hidream_e1_full_bf16.safetensors>
        - This model class cannot be automatically detected, and so you must manually click the `☰` hamburger menu on a model, then `Edit Metadata`, and set the `Architecture:` field to `HiDream i1 Edit`, otherwise it will not use the input image properly
        - Also set `Resolution:` to `768x768`, the Edit model misbehaves at high res
    - HiDream uses the Flux VAE, it will be autodownloaded for you if not already present
    - HiDream uses a quad-textencoder of Long-CLIP L, Long-CLIP G, T5-XXL, and LLaMA-3.1-8B (this is unhinged I'm so sorry for your RAM size)
        - These will be autodownloaded for you if not already present
    - LoRAs cross-apply between the three variants, but best alignment between dev/fast, full tends to be more different
- Parameters:
    - **CFG Scale:** HiDream Full uses standard standard CFG ranges (eg 6), HiDream Dev and Fast use CFG=1
    - **Steps:** HiDream Dev uses standard step counts (eg 20), HiDream Fast can use low counts (eg 8). HiDream Full requires higher than normal step counts (at least 30, maybe 50) for clean results.
        - Official recommendation from HiDream team is: Full=50, Dev=28, Fast=16.
    - **Sampler and Scheduler:** Standard samplers/schedulers work. Defaults to `Euler` and `Normal`
        - The dev model is more open to weirder samplers like `LCM` and official recommendation for Full is UniPC, but these are not needed
    - **Sigma Shift:** Sigma shift defaults to 3 and does not need to be modified.
        - Officially, HiDream Full and Fast recommend Shift of 3, but for Dev they recommend 6. That 6 on dev seems to look worse though, so I don't recommend it.

# Cosmos Predict2

![img](/docs/images/models/cosmos-predict2-14b.jpg)
*(Nvidia Cosmos Predict2 14B Text2Image)*

- Nvidia Cosmos Predict2 Text2Image models are natively supported in SwarmUI.
    - Do not recommend, generally just worse than other contemporary models.
    - There is a 2B and a 14B variant.
        - 2B: <https://huggingface.co/Comfy-Org/Cosmos_Predict2_repackaged/blob/main/cosmos_predict2_2B_t2i.safetensors>
        - 14B: <https://huggingface.co/Comfy-Org/Cosmos_Predict2_repackaged/blob/main/cosmos_predict2_14B_t2i.safetensors>
        - 14B GGUFs here <https://huggingface.co/city96/Cosmos-Predict2-14B-Text2Image-gguf/tree/main>
    - **Resolution:** ? 1024-ish.
    - **CFG and Steps:** Default recommends CFG=4 and Steps=35
    - **Performance:** Oddly slower than similar sized models by a fair margin. It does not make up for this in quality.
    - The text encoder is old T5-XXL v1, not the same T5-XXL used by other models.
        - It will be automatically downloaded.
    - The VAE is the Wan VAE, and will be automatically downloaded.

# OmniGen 2

- [OmniGen 2](https://github.com/VectorSpaceLab/OmniGen2) is natively partially supported in SwarmUI.
    - It is technically an LLM, and the LLM features are not supported, only the direct raw image features.
    - Download the model here <https://huggingface.co/Comfy-Org/Omnigen2_ComfyUI_repackaged/blob/main/split_files/diffusion_models/omnigen2_fp16.safetensors>
        - Save it to `diffusion_models`
    - The text encoder is Qwen 2.5 VL (LLM), and will be automatically downloaded.
    - The VAE is the Flux VAE, and will be automatically downloaded.
    - Add images to the prompt box to use them as input images for the model. If no input images are given, but you have an Init Image, that will be used as the input image.
    - **CFG:** Usual CFG rules, around 5 to 7 is a good baseline
        - The reference workflows for comfy used dual-CFG guidance, IP2P style. If you want to do this, you can use advanced param `IP2P CFG 2` to control the secondary CFG, defaults to 2, and set regular CFG to around 5.
    - **Steps:** normal ~20
    - **Resolution:** Normal 1024x1024-ish.
    - **Performance:** Pretty terribly slow. Incompatible with fp8, incompatible with sage attention.
    - **Prompts:** their demo page has some prompt tips and examples <https://huggingface.co/spaces/OmniGen2/OmniGen2>

# Video Models

Video models are documented in [Video Model Support](/docs/Video%20Model%20Support.md)

# Alternative Model Formats

## Bits-and-Bytes NF4 Format Models

- BnB NF4 and FP4 format models, such as this copy of Flux Dev <https://huggingface.co/lllyasviel/flux1-dev-bnb-nf4/blob/main/flux1-dev-bnb-nf4.safetensors>, are partially supported in SwarmUI automatically.
    - The detection internally works by looking for `bitsandbytes__nf4` or `bitsandbytes__fp4` in the model's keys
    - The first time you try to load a BNB-NF4 or BNB-FP4 model, it will give you a popup asking to install support
        - This will autoinstall <https://github.com/silveroxides/ComfyUI_bnb_nf4_fp4_Loaders> which is developed by silveroxides, comfyanonymous, and lllyasviel, and is under the AGPL license.
    - You can accept this popup, and it will install and reload the backend
    - Then try to generate again, and it should work
- Note that BnB-NF4 and BNB-FP4 models have multiple compatibility limitations, including even LoRAs don't apply properly.
    - If you want a quantized flux model, GGUF is recommended instead.
    - Support is barely tested, latest bnb doesn't work with comfy but old bnb is incompatible with other dependencies, good luck getting it to load.
        - Seriously, just use GGUF or something. bnb is not worth it.

## GGUF Quantized Models

- GGUF Quantized `diffusion_models` models are supported in SwarmUI automatically.
    - The detection is based on file extension.
    - They go in `(Swarm)/Models/diffusion_models` and work similar to other `diffusion_models` format models
        - Required VAE & TextEncoders will be autodownloaded if you do not already have them.
    - The first time you try to load a GGUF model, it will give you a popup asking to install support
        - This will autoinstall https://github.com/city96/ComfyUI-GGUF which is developed by city96.
        - You can accept this popup, and it will install and reload the backend
        - Then try to generate again, and it should just work

## Nunchaku (MIT Han Lab)

- MIT Han Lab's "[Nunchaku](https://github.com/mit-han-lab/ComfyUI-nunchaku)" / 4-bit SVDQuant models are a unusual quant format that is supported in SwarmUI.
    - Nunchaku is a very dense quantization of models (eg 6GiB for Flux models) that runs very fast (4.4 seconds for a 20 step Flux Dev image on Windows RTX 4090, vs fp8 is ~11 seconds on the same)
    - It is optimized for modern nvidia GPUs, with different optimizations per gpu generation
        - RTX 30xx and 40xx cards need "int4" format nunchaku models
        - RTX 50xx or newer cards need "fp4" format nunchaku models
    - They go in `(Swarm)/Models/diffusion_models` and work similar to other `diffusion_models` format models
        - Make sure you download a "singlefile" nunchaku file, not a legacy "SVDQuant" folder
        - Required VAE & TextEncoders will be autodownloaded if you do not already have them.
    - For the older "SVDQuant" Folder Models <https://huggingface.co/collections/mit-han-lab/svdquant-67493c2c2e62a1fc6e93f45c>, The detection is based on the folder structure, you need the files `transformer_blocks.safetensors` and `comfy_config.json` inside the folder. You cannot have unrelated files in the folder.
    - The first time you try to load a Nunchaku model, it will give you a popup asking to install support
        - This will autoinstall <https://github.com/mit-han-lab/ComfyUI-nunchaku> and its dependencies
        - You can accept this popup, and it will install and reload the backend
        - Then try to generate again, and it should just work
    - Nunchaku has various compatibility limitations due to hacks in the custom nodes. Not all lora, textenc, etc. features will work as intended.
        - It does not work on all python/torch/etc. versions, as they have deeply cursed dependency distribution
    - The `Nunchaku Cache Threshold` param is available to enable block-caching, which improves performance further at the cost of quality.

## TensorRT

- TensorRT support (`.engine`) is available for SDv1, SDv2-768-v, SDXL Base, SDXL Refiner, SVD, SD3-Medium
- TensorRT is an nvidia-specific accelerator library that provides faster SD image generation at the cost of reduced flexibility. Generally this is best for heavy usages, especially for API/Bots/etc. and less useful for regular individual usage.
- You can generate TensorRT engines from the model menu. This includes a button on-page to autoinstall TRT support your first time using it, and configuration of graph size limits and optimal scales. (TensorRT works fastest when you generate at the selected optimal resolution, and slightly less fast at any dynamic resolution outside the optimal setting.)
- Note that TensorRT is not compatible with LoRAs, ControlNets, etc.
- Note that you need to make a fresh TRT engine for any different model you want to use.
