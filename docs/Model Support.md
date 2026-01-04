# Model Type Support In SwarmUI

| Model | Architecture | Year | Author | Scale | Censored? | Quality/Status |
| ----  | ---- | ---- | ---- | ---- | ---- | ---- |
[Stable Diffusion XL](#stable-diffusion-xl) | unet | 2023 | Stability AI | 2B | Partial | Older but some finetunes are worth using |
[SD1 and SDXL Turbo Variants](#sd1-and-sdxl-turbo-variants) | unet | 2023 | Stability AI and others | 2B | Partial | Outdated |
[Stable Diffusion 3](#stable-diffusion-3) | MMDiT | 2024 | Stability AI | 2B | Yes | Outdated, prefer 3.5 |
[Stable Diffusion 3.5 Large](#stable-diffusion-35-large) | MMDiT | 2024 | Stability AI | 8B | Partial | Recent, Good Quality |
[Stable Diffusion 3.5 Medium](#stable-diffusion-35-medium) | MMDiT | 2024 | Stability AI | 2B | Partial | Recent, Good Quality |
[AuraFlow](#auraflow) | MMDiT | 2024 | Fal.AI | 6B | Yes | Outdated |
[Flux.1](#black-forest-labs-flux1-models) | MMDiT | 2024 | Black Forest Labs | 12B | Partial | Recent, High Quality |
[Flux.2](#flux-2) | MMDiT | 2025 | Black Forest Labs | 32B | Minimal | Recent, Incredible Quality, extremely memory intense |
[Chroma](#chroma) | MMDiT | 2025 | Lodestone Rock | 8.9B  | No | Recent, Decent Quality |
[Chroma Radiance](#chroma-radiance) | Pixel MMDiT | 2025 | Lodestone Rock | 8.9B  | No | Recent, Bad Quality (WIP) |
[Lumina 2.0](#lumina-2) | NextDiT | 2025 | Alpha-VLLM | 2.6B | Partial | Modern, Passable Quality |
[Qwen Image](#qwen-image) | MMDiT | 2025 | Alibaba-Qwen | 20B | Minimal | Modern, Great Quality, very memory intense |
[Hunyuan Image 2.1](#hunyuan-image-21) | MMDiT | 2025 | Tencent | 17B | No | Modern, Great Quality, very memory intense |
[Z-Image](#z-image) | S3-DiT | 2025 | Tongyi MAI (Alibaba) | 6B | No | Modern, Great Quality, lightweight |
[Kandinsky 5](#kandinsky-5) | DiT | 2025 | Kandinsky Lab | 6B | No | Modern, Decent Quality |

Old or bad options also tracked listed via [Obscure Model Support](/docs/Obscure%20Model%20Support.md):

| Model | Architecture | Year | Author | Scale | Censored? | Quality/Status |
| ----  | ---- | ---- | ---- | ---- | ---- | ---- |
[Stable Diffusion v1 and v2](/docs/Obscure%20Model%20Support.md#stable-diffusion-v1-and-v2) | unet | 2022 | Stability AI | 1B | No | Outdated |
[Stable Diffusion v1 Inpainting Models](/docs/Obscure%20Model%20Support.md#stable-diffusion-v1-inpainting-models) | unet | 2022 | RunwayML | 1B | No | Outdated |
[Segmind SSD 1B](/docs/Obscure%20Model%20Support.md#segmind-ssd-1b) | unet | 2023 | Segmind | 1B | Partial | Outdated |
[Stable Cascade](/docs/Obscure%20Model%20Support.md#stable-cascade) | unet cascade | 2024 | Stability AI | 5B | Partial | Outdated |
[PixArt Sigma](/docs/Obscure%20Model%20Support.md#pixart-sigma) | DiT | 2024 | PixArt | 1B | ? | Outdated |
[Nvidia Sana](/docs/Obscure%20Model%20Support.md#nvidia-sana) | DiT | 2024 | NVIDIA | 1.6B | No | Just Bad |
[Nvidia Cosmos Predict2](/docs/Obscure%20Model%20Support.md#cosmos-predict2) | DiT | 2025 | NVIDIA | 2B/14B | Partial | Just Bad |
[HiDream i1](/docs/Obscure%20Model%20Support.md#hidream-i1) | MMDiT | 2025 | HiDream AI (Vivago) | 17B | Minimal | Good Quality, lost community attention |
[OmniGen 2](/docs/Obscure%20Model%20Support.md#omnigen-2) | MLLM | 2025 | VectorSpaceLab | 7B | No | Modern, Decent Quality, quickly outclassed |
[Ovis](/docs/Obscure%20Model%20Support.md#ovis) | MMDiT | 2025 | AIDC-AI (Alibaba) | 7B | No | Passable quality, but outclassed on launch |

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

# Stable Diffusion XL

![img](/docs/images/models/sdxl.jpg)

SDXL models work as normal, with the bonus that by default enhanced inference settings will be used (eg scaled up rescond).

Additional, SDXL-Refiner architecture models can be inferenced, both as refiner or even as a base (you must manually set res to 512x512 and it will generate weird results).

### SDXL Controlnets

- There are official SDXL ControlNet LoRAs from Stability AI [here](https://huggingface.co/stabilityai/control-lora)
- and there's a general collection of community ControlNet models [here](https://huggingface.co/lllyasviel/sd_control_collection/tree/main) that you can use.

# SD1 and SDXL Turbo Variants

Turbo, LCM (Latent Consistency Models), Lightning, etc. models work the same as regular models, just set `CFG Scale` to `1` and:
    - For Turbo, `Steps` to `1` Under the `Sampling` group set `Scheduler` to `Turbo`.
    - For LCM, `Steps` to `4`. Under the `Sampling` group set `Sampler` to `lcm`.
    - For lightning, (?)

# Stable Diffusion 3

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

# AuraFlow

![img](/docs/images/models/auraflow-02.jpg)
*(above image is AuraFlow v0.2)*

- [Fal.ai's AuraFlow v0.1](https://huggingface.co/fal/AuraFlow/tree/main) and [v0.2](https://huggingface.co/fal/AuraFlow-v0.2) and v0.3 are supported in Swarm, but you must manually select architecture to use it.
- The model used "Pile T5-XXL" as it's text encoder.
- The model used the SDXL VAE as its VAE.
- This model group was quickly forgotten by the community due to quality issues, but came back into popular attention much later via community finetune "Pony v7".
    - Pony wants to be in the `diffusion_models` folder, but regular AuraFlow goes in `Stable-Diffusion` folder
- Parameters and usage is the same as any other normal model.
    - CFG recommended around 3.5 or 4.
    - Pony v7 allows higher resolutions than base AuraFlow normally targets.

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
        - Or the nunchaku version here <https://huggingface.co/mit-han-lab/nunchaku-flux.1-kontext-dev/tree/main>
        - Or the official BFL 16 bit upload <https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev>
        - Or some GGUFs here <https://huggingface.co/QuantStack/FLUX.1-Kontext-dev-GGUF/tree/main>
    - It's a regular model file, it goes in the regular `diffusion_models` folder same as other flux models.
    - You will have to manually edit the architecture to be `Flux.1 Kontext Dev`, it misdetects by default
        - Click the `☰` hamburger menu on the model, then `Edit Metadata`, then select the `Architecture` as `Flux.1 Kontext Dev`, then hit save
    - Paste images into the prompt box to serve as the reference images it will use to generate.
        - If you have an init image and no reference images, the init image will be used.
        - Swarm will automatically keep the size of the image correct for Kontext input, but make sure your aspect ratio is matched.
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

# Flux 2

![img](/docs/images/models/flux2.jpg)

- Black Forest Labs' [Flux.2 Models](https://bfl.ai/blog/flux-2) are supported in SwarmUI
- It is an extremely massive model (32B diffusion model, 24B text encoder) that will demand significant RAM availability on your PC.
    - This can easily fill up 128 gigs of system RAM in usage, but does still work on 64 gig systems. Lower than 64 may not be possible, or may require heavily using swapfile.
- Download the standard FP8 model here [silveroxides/FLUX.2-dev-fp8_scaled](<https://huggingface.co/silveroxides/FLUX.2-dev-fp8_scaled/blob/main/flux2-dev-fp8mixedfromscaled.safetensors>)
    - Or GGUF version here [city96/FLUX.2-dev-GGUF](<https://huggingface.co/city96/FLUX.2-dev-gguf/tree/main>)
    - Goes in `diffusion_models` folder
    - There's also a turbo model here [silveroxides/flux2-dev-turbo-fp8mixed.safetensors](<https://huggingface.co/silveroxides/FLUX.2-dev-fp8_scaled/blob/main/flux2-dev-turbo-fp8mixed.safetensors>)
         - or as a lora [fal/Flux_2-Turbo-LoRA_comfyui.safetensors](<https://huggingface.co/fal/FLUX.2-dev-Turbo/blob/main/comfy/Flux_2-Turbo-LoRA_comfyui.safetensors>)
         - Use scheduler `Align Your Steps` at exactly 8 steps to select the special Flux2-dev-turbo custom scheduler. Difference is minimal though.
- The VAE is a brand new 16x16 downsample VAE with 128 channels. It will be autodownloaded.
    - You can swap it for this one [CabalResearch/Flux2VAE-Anime-Decoder-Tune](<https://huggingface.co/CabalResearch/Flux2VAE-Anime-Decoder-Tune/blob/main/Flux2Anime%20VAE%20DecB1.safetensors>) which is a finetune to reduce detail artifacting.
- The Text Encoder is 24B Mistral Small 3.2 (2506). It will be autodownloaded.
    - There's a GGUF about half the size here [mcmonkey/flux2MistralGGUF](<https://huggingface.co/mcmonkey/Flux2MistralGGUF/blob/main/Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M-flux2fixed.gguf>)
        - Select via the advanced `Mistral Model` parameter
- **Parameters:**
    - **Prompt:** Prompting guide from the model creators here <https://docs.bfl.ai/guides/prompting_guide_flux2>
        - Notably, they trained heavily on complex JSON structured prompts to allow for very complex scene control, though this is not required
        - They used a powerful LLM for inputs, allow for multiple languages and a variety of ways of phrasing/formatting text to work out
    - **Resolution:** Flux2 supports just about any resolution you can think of, from 64x64 up to 4 megapixels (2048x2048)
    - **CFG Scale:** `1`
    - **Steps:** They recommend 50, 20 still works but may have some quality reduction
    - **Sigma Shift:** Defaults to `2.02`
    - **Flux Guidance Scale:** Defaults to `3.5`, fiddling this value up a bit (to eg `4`) may be better
    - **Sampler:** Defaults to regular `Euler`
    - **Scheduler:** Defaults to `Flux2`, a new specialty scheduler added for Flux.2 to use, but it makes very little difference
    - **Prompt Images:** add up to a max of 6 images to the prompt box to be used as reference images. This uses significantly more memory.

# Chroma

- Chroma is a derivative of Flux, and is supported in SwarmUI
    - FP8 Scaled versions here: [silveroxides/Chroma1-HD-fp8-scaled](<https://huggingface.co/silveroxides/Chroma1-HD-fp8-scaled/tree/main>)
        - Or older revs [Clybius/Chroma-fp8-scaled](<https://huggingface.co/Clybius/Chroma-fp8-scaled/tree/main>)
    - Or GGUF versions here: [silveroxides/Chroma-GGUF](<https://huggingface.co/silveroxides/Chroma-GGUF>)
    - Or original BF16 here (not recommended): [lodestones/Chroma](<https://huggingface.co/lodestones/Chroma/tree/main>)
    - Model files goes in `diffusion_models`
    - Uses standard CFG, not distilled to 1 like other Flux models
    - Original official reference workflow used Scheduler=`Align Your Steps` with Steps=`26` and CFG Scale=`4`
        - (It's named `Optimal Steps` in their workflow, but Swarm's AYS scheduler is equivalent to that)
        - "Sigmoid Offset" scheduler was their later recommendation, it requires a custom node
            - You can `git clone https://github.com/silveroxides/ComfyUI_SigmoidOffsetScheduler` into your ComfyUI `custom_nodes`, and then restart SwarmUI, and it will be available from the `Scheduler` param dropdown
        - Or, "power_shift" / "beta42" from [ComfyUI_PowerShiftScheduler](<https://github.com/silveroxides/ComfyUI_PowerShiftScheduler>) may be better
            - Works the same, `git clone https://github.com/silveroxides/ComfyUI_PowerShiftScheduler` into your ComfyUI `custom_nodes` and restart
    - Generally works better with longer prompts. Adding some "prompt fluff" on the end can help clean it up. This is likely related to it being a beta model with an odd training dataset.
- **Parameters**
    - **CFG Scale:** around `3.5`
    - **Sampler:** Defaults to regular `Euler`
    - **Scheduler:** Defaults to `Beta`
    - **Steps:** Normal step counts work, official recommendation is `26`
    - **Sigma Shift:** Defaults to `1`
    - **Resolution:** `1024x1024` or nearby values. The *HD* models were trained extra on `1152x1152`.

# Chroma Radiance

- Chroma Radiance is a pixel-space model derived from Flux, and is supported in SwarmUI
    - It is a work in progress, expect quality to be limited for now
    - Download here [lodestones/Chroma1-Radiance](<https://huggingface.co/lodestones/Chroma1-Radiance/tree/main>)
        - Model files goes in `diffusion_models`
    - It does not use a VAE
- **Parameters**
    - **CFG Scale:** around `3.5`
    - **Sampler:** Defaults to regular `Euler`
    - **Scheduler:** Defaults to `Beta`
    - **Steps:** Normal step counts work, higher is recommended to reduce quality issues
    - **Sigma Shift:** Defaults to `1`. Set to `0` to explicitly remove shift and use the underlying comfy default behavior.
    - **Prompt:** Long and detailed prompts are recommended.
    - **Negative Prompt:** Due to the model's experimental early train status, a good negative prompt is essential.
        - Official example: `This low quality greyscale unfinished sketch is inaccurate and flawed. The image is very blurred and lacks detail with excessive chromatic aberrations and artifacts. The image is overly saturated with excessive bloom. It has a toony aesthetic with bold outlines and flat colors.`

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


# Qwen Image

![img](/docs/images/models/qwen-image.jpg)
*(Qwen Image ran at CFG=4, Steps=50, Res=1328x1328. This took me about 3 minutes per image. This comparison is unfair to the other models, but this model seems intended to be a 'slow but smart' model, so this is the way to run it for now. The test prompt seems to be particularly hard on Qwen Image, I promise it's smarter than this makes it look lol.)*

- [Qwen Image](https://huggingface.co/Qwen/Qwen-Image) is natively supported in SwarmUI.
    - Download the model here [Comfy-Org/Qwen-Image_ComfyUI](<https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files/diffusion_models>)
        - There's an fp8 and a bf16 variant available. The fp8 model is highly recommended.
        - There's the 2512 version and the original available. 2512 is newer and better.
        - Or, for nunchaku accelerated version that uses a bit less VRAM and runs faster, [nunchaku-tech/nunchaku-qwen-image](<https://huggingface.co/nunchaku-tech/nunchaku-qwen-image/tree/main>)
        - Or, other option for limited memory space, GGUF versions [city96/Qwen-Image-gguf](<https://huggingface.co/city96/Qwen-Image-gguf/tree/main>)
        - Or a distilled version here [qwen_image_distill_full_fp8_e4m3fn](<https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/blob/main/non_official/diffusion_models/qwen_image_distill_full_fp8_e4m3fn.safetensors>)
            - This uses CFG=1, Steps=15 or so.
            - There's also a couple "Lightning" loras [lightx2v/Qwen-Image-Lightning](<https://huggingface.co/lightx2v/Qwen-Image-Lightning/tree/main>) for the base model, CFG=1 Steps=8 or 4
        - Save it to `diffusion_models`
    - The text encoder is Qwen 2.5 VL 7B (LLM), and will be automatically downloaded.
    - It has its own VAE, and will be automatically downloaded.
    - SageAttention has compatibility issues, if you use Sage it will need to be disabled.
    - **CFG:** You can use CFG=`1` for best performance. You can also happily use higher CFGs, eg CFG=`4`, at a performance cost.
    - **Steps:** normal ~20 works, but higher steps (eg 50) is recommended for best quality
    - **Resolution:** 1328x1328 is their recommended resolution, but you can shift it around to other resolutions in a range between 928 up to 1472.
    - **Performance:** Can be fast on Res=928x928 CFG=1 Steps=20, but standard params are very slow (one full minute for a standard res 20 step cfg 4 image on a 4090, compared to ~10 seconds for Flux on the same).
        - Requires >30 gigs of system RAM just to load at all in fp8. If you have limited sysram you're gonna have a bad time. Pagefile can help.
    - **Prompts:** TBD, but it seems very friendly to general prompts in both natural language and booru-tag styles. Official recommendations are very long LLM-ish prompts though.
    - **Sigma Shift:** Comfy defaults it to `1.15`, but this ruins fine details, so Swarm defaults it to `3` instead. Many different values are potentially valid. Proper guidance on choices TBD.

### Controlnets

- There are three controlnet versions available for Qwen Image currently
    - Regular form
        - There's a regular controlnet-union available here [InstantX/Qwen-Image-ControlNet-Union](<https://huggingface.co/InstantX/Qwen-Image-ControlNet-Union/blob/main/diffusion_pytorch_model.safetensors>) (be sure to rename the file when you save it)
        - works like any other controlnet. Select as controlnet model, give it an image, select a preprocessor. Probably lower the strength a bit.
        - Compatible with lightning loras.
        - If not using Lightning, probably raise your CFG a bit to ensure your prompt is stronger than the controlnet.
    - "Model Patch"
        - Download here [Comfy-Org/Qwen-Image-DiffSynth-ControlNets: model_patches](<https://huggingface.co/Comfy-Org/Qwen-Image-DiffSynth-ControlNets/tree/main/split_files/model_patches>)
        - Save to ControlNets folder
        - Work the same as any other controlnets for basic usage, but advanced controls (eg start/stop steps) don't quite work
    - LoRA form
        - Download here [Comfy-Org/Qwen-Image-DiffSynth-ControlNets: loras](<https://huggingface.co/Comfy-Org/Qwen-Image-DiffSynth-ControlNets/tree/main/split_files/loras>)
        - Save to loras folder
        - Select the lora, use with a regular qwen image base model
        - Upload a prompt image of controlnet input (depth or canny)
            - You can create this from an existing image by using the Controlnet Parameter group, select the preprocessor (Canny, or MiDAS Depth), and hit "Preview"
        - You cannot use the controlnet parameters directly for actual generation due to the weird lora-hack this uses
- Note that Qwen Image controlnets do not work the best on the Qwen Image Edit model.

### Qwen Image Edit

- The Qwen Image **Edit** model can be downloaded here: [Comfy-Org/Qwen-Image-Edit_ComfyUI](<https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files/diffusion_models>)
    - `qwen_image_edit_2511_fp8mixed` recommended currently
    - Or GGUF version here: [unsloth/Qwen-Image-Edit-2511-GGUF](<https://huggingface.co/unsloth/Qwen-Image-Edit-2511-GGUF/blob/main/qwen-image-edit-2511-Q4_K_M.gguf>) or old 2509 [QuantStack/Qwen-Image-Edit-2509-GGUF](<https://huggingface.co/QuantStack/Qwen-Image-Edit-2509-GGUF/tree/main>) (or old version [QuantStack/Qwen-Image-Edit-GGUF](<https://huggingface.co/QuantStack/Qwen-Image-Edit-GGUF/tree/main>))
    - Or nunchaku version here: [nunchaku-qwen-image-edit-2509](<https://huggingface.co/nunchaku-tech/nunchaku-qwen-image-edit-2509/tree/main>) (or old version [nunchaku-qwen-image-edit](<https://huggingface.co/nunchaku-tech/nunchaku-qwen-image-edit/tree/main>))
    - For original Edit or v2509, the architecture cannot be autodetected and must be set manually. 2511 can autodetect.
        - Click the `☰` hamburger menu on a model, then `Edit Metadata`, then change `Architecture` to `Qwen Image Edit Plus` and hit `Save`
            - For the original model (prior to 2509), use `Qwen Image Edit`
    - Most params are broadly the same as regular Qwen Image
    - **CFG** must be `1`, Edit is not compatible with higher CFGs normally (unless using an advanced alternate guidance option)
    - **Sigma Shift:** `3` or lower (as low as `0.5`) is a valid range. Some users report that a value below 1 might be ideal for single-image inputs.
    - You can insert image(s) to the prompt box to have it edit that image
        - It will focus the first image, but you can get it to pull features from additional images (with limited quality)
        - Qwen Image Edit Plus works with up to 3 images well
        - Use phrasing like `The person in Picture 1` to refer to the content of specific input images in the prompt
        - There are a few samples of how to prompt here <https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-api>
        - `Smart Image Prompt Resizing` parameter (top-left, under Image Prompting) will resize your input images automatically. Turn this off if you've carefully sized your images in advance.
            - Some versions of Qwen Edit require strict sizing to work well. 2511 reportedly works fine within a range of options.
    - There are a couple dedicated Qwen Image Edit Lightning Loras [lightx2v/Qwen-Image-Edit-2511-Lightning](<https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/tree/main>) or for older copies [lightx2v/Qwen-Image-Lightning](<https://huggingface.co/lightx2v/Qwen-Image-Lightning/tree/main>)
        - Take care to separate the Edit lora vs the base Qwen Image lora.

### Hunyuan Image 2.1

![img](/docs/images/models/hy-img-21.jpg)

- [Hunyuan Image 2.1](https://huggingface.co/tencent/HunyuanImage-2.1) is supported in SwarmUI.
    - The main model's official original download here: [tencent/HunyuanImage-2.1](https://huggingface.co/tencent/HunyuanImage-2.1/blob/main/dit/hunyuanimage2.1.safetensors), save to `diffusion_models`
        - FP8 download link pending
        - Or GGUF: [QuantStack/HunyuanImage-2.1-GGUF](<https://huggingface.co/QuantStack/HunyuanImage-2.1-GGUF/tree/main>)
    - There is also a distilled variant, you can download here: [Comfy-Org/HunyuanImage_2.1_ComfyUI](https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/blob/main/split_files/diffusion_models/hunyuanimage2.1_distilled_bf16.safetensors).
        - (The tencent upload does not work, use the linked upload)
        - FP8 download link pending
        - Or GGUF: [QuantStack/HunyuanImage-2.1-Distilled-GGUF](<https://huggingface.co/QuantStack/HunyuanImage-2.1-Distilled-GGUF/tree/main>)
    - They also provide and recommend a Refiner model, you can download that here: [hunyuanimage-refiner](https://huggingface.co/tencent/HunyuanImage-2.1/blob/main/dit/hunyuanimage-refiner.safetensors)
        - FP8 download link pending
        - Or GGUF: [QuantStack/HunyuanImage-2.1-Refiner-GGUF](<https://huggingface.co/QuantStack/HunyuanImage-2.1-Refiner-GGUF/tree/main>)
        - This naturally is meant to be used via the Refine/Upscale parameter group in Swarm.
            - Set `Refiner Control Percentage` to `1`, set `Refiner Steps` to `4`, set `Refiner CFG Scale` to `1`
            - You may also want to mess with the prompt, official recommend is some hacky LLM stuff: `<|start_header_id|>system<|end_header_id|>Describe the image by detailing the color, shape, size, texture, quantity, text, spatial relationships of the objects and background: <|eot_id|><|start_header_id|>user<|end_header_id|> Make the image high quality<|eot_id|>`. You can use `<base> my prompt here <refiner> that llm junk here` in Swarm to automatically emit refiner-specific prompts.
        - This specific model is not required. In fact, it's pretty bad. It can be replaced with other models of other architectures - pick the model with details you like and refine with that instead.
        - Running the base model without a refiner works too, but fine detail quality is bad. You'll want to pick a refiner. *(Possibly finetunes will fix the base in the future, as happened eg with SDXL Base years ago.)*
    - **CFG Scale:** Normal CFG range, recommended around `3.5`. The distilled model is capable of CFG=`1`. The refiner requires CFG=`1`.
    - **Steps:** Normal step values, around `20`. Refiner prefers `4`.
    - **Resolution:** Targets `2048x2048`, can work at lower resolutions too.
        - The VAE is a 32x32 downscale (vs most image models use 8x8), so it's a much smaller latent image than other models would have at this scale.
        - 2048 on this model is the same latent size as 512 on other models.
    - **Sigma Shift:** Default is `5`. Refine defaults to `4`.
    - TBD: Info specific to Distilled variant usage (doesn't seem to work well with their documented settings, testing TBD or comfy fix), and dedicated Refiner model

# Z-Image

![img](/docs/images/models/zimage.jpg)

*(Steps=9)*

- [Z-Image](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) is supported in SwarmUI!
    - It is a 6B scaled model designed to run extremely fast while competing at the top level of image models
- Only the "Turbo" model is currently released, download here [Z-Image-FP8Mixed](<https://huggingface.co/mcmonkey/swarm-models/blob/main/SwarmUI_Z-Image-Turbo-FP8Mix.safetensors>)
    - Or the original BF16 fat version [Comfy-Org/z_image_turbo](<https://huggingface.co/Comfy-Org/z_image_turbo/blob/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors>)
    - Or GGUF version here [jayn7/Z-Image-Turbo-GGUF](<https://huggingface.co/jayn7/Z-Image-Turbo-GGUF/tree/main>)
    - Save in `diffusion_models`
    - "Base" and "Edit" variants are expected to release in the future
- Uses the Flux.1 VAE
    - You might prefer swapping to the [UltraFlux VAE](<https://huggingface.co/Owen777/UltraFlux-v1/blob/main/vae/diffusion_pytorch_model.safetensors>) which gets better photorealism quality (be sure to rename the file when you save it, eg `Flux/UltraFlux-vae.safetensors`)
- **Parameters:**
    - **Prompt:** Supports general prompting in any format just fine. Speaks English and Chinese deeply, understands other languages decently well too.
    - **Sampler:** Default is fine. Some users find `Euler Ancestral` can be better on photorealism detail. Comfy examples suggests `Res MultiStep`.
    - **Scheduler:** Default is fine. Some users find `Beta` can be very slightly better.
    - **CFG Scale:** For Turbo, `1`
    - **Steps:** For Turbo, small numbers are fine. `4` will work, `8` is better
        - Original repo suggests 5/9, but this appears redundant in Swarm.
        - For particularly difficult prompts, raising Steps up to `20` may help get the full detail.
    - **Resolution:** Side length `1024` is the standard, but anywhere up to `2048` is good. `512` noticeably loses some quality, above `2048` corrupts the image.
    - **Sigma Shift:** Default is `3`, raising to `6` can yield stronger coherence.
    - Here's a big ol' grid of Z-Image Turbo params: [Z-Image MegaGrid](<https://sd.mcmonkey.org/zimagegrid/#auto-loc,true,true,false,true,false,cfgscale,steps,none,none,extremecloseupt,4,1,3,1024x1024,1,euler,simple>)

### Z-Image Turbo Seed Variety Trick

- There's a trick to get better seed variety in Z-Image:
    - Add an init image (Any image, doesn't matter much - the broad color bias of the image may be used, but that's about it).
    - Set Steps higher than normal (say 8 instead of 4)
    - Set Init Image Creativity to a relatively high value (eg 0.7)
    - Set Advanced Sampling -> Sigma Shift to a very high value like `22`
    - Hit generate.
    - (This basically just screws up the model in a way it can recover from, but the recovery makes it take very different paths depending on seed)

### Z-Image Controlnets

- There's a "DiffSynth Model Patch" controlnet-union available here [alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1](<https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1/blob/main/Z-Image-Turbo-Fun-Controlnet-Union-2.1-8steps.safetensors>)
    - This goes in your regular ControlNets folder
        - Comfy treats this as separate "model_patches", to use Comfy folder format, add `;model_patches` to the end of Server Config->Paths->SDControlNetsFolder
    - Proper Architecture ID is `Z-Image ControlNet (DiffPatch)`
    - Works like any other controlnet. Select as controlnet model, give it an image, select a preprocessor. Fiddle the strength to taste.
    - Despite being a Union controlnet, the Union Type parameter is not used.
    - Because it is "Model Patch" based, the Start and End parameters also do not work.

# Kandinsky 5

- Kandinsky 5 Image Lite is supported in SwarmUI
    - Also the video models, docs [in the video model support doc](/docs/Video%20Model%20Support.md#kandinsky-5)
- There are multiple variants, pick one to download from here: [kandinskylab/kandinsky-50-image-lite](<https://huggingface.co/collections/kandinskylab/kandinsky-50-image-lite>)
- **Parameters:**
    - **CFG Scale:** regular CFG such as `5` works.
    - **Steps:** Regular 20+ steps.
    - **Resolution:** Side length 1024.

# Video Models

- Video models are documented in [Video Model Support](/docs/Video%20Model%20Support.md).
- You can use some (not all) Text2Video models as Text2Image models.
    - Generally, just set **Text2Video Frames** to `1` and it will be treated as image gen.
    - Some models may favor different parameters (CFG, Steps, Shift, etc.) for images vs videos.

# Alternative Model Formats

## Bits-and-Bytes NF4 Format Models

- BnB NF4 and FP4 format models, such as this copy of Flux Dev [lllyasviel/flux1-dev-bnb-nf4](<https://huggingface.co/lllyasviel/flux1-dev-bnb-nf4/blob/main/flux1-dev-bnb-nf4.safetensors>), are partially supported in SwarmUI automatically.
    - The detection internally works by looking for `bitsandbytes__nf4` or `bitsandbytes__fp4` in the model's keys
    - The first time you try to load a BNB-NF4 or BNB-FP4 model, it will give you a popup asking to install support
        - This will autoinstall [silveroxides/ComfyUI_bnb_nf4_fp4_Loaders](<https://github.com/silveroxides/ComfyUI_bnb_nf4_fp4_Loaders>) which is developed by silveroxides, comfyanonymous, and lllyasviel, and is under the AGPL license.
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
        - This will autoinstall [city96/ComfyUI-GGUF](<https://github.com/city96/ComfyUI-GGUF>) which is developed by city96.
        - You can accept this popup, and it will install and reload the backend
        - Then try to generate again, and it should just work

## Nunchaku (MIT Han Lab)

- MIT Han Lab's "[Nunchaku](<https://github.com/mit-han-lab/nunchaku>)" / 4-bit SVDQuant models are a unusual quant format that is supported in SwarmUI.
    - Nunchaku is a very dense quantization of models (eg 6GiB for Flux models) that runs very fast (4.4 seconds for a 20 step Flux Dev image on Windows RTX 4090, vs fp8 is ~11 seconds on the same)
    - It is optimized for modern nvidia GPUs, with different optimizations per gpu generation
        - RTX 30xx and 40xx cards need "int4" format nunchaku models
        - RTX 50xx or newer cards need "fp4" format nunchaku models
    - They go in `(Swarm)/Models/diffusion_models` and work similar to other `diffusion_models` format models
        - Make sure you download a "singlefile" nunchaku file, not a legacy "SVDQuant" folder
        - Required VAE & TextEncoders will be autodownloaded if you do not already have them.
    - For the older "SVDQuant" Folder Models [mit-han-lab/svdquant](<https://huggingface.co/collections/mit-han-lab/svdquant-67493c2c2e62a1fc6e93f45c>), The detection is based on the folder structure, you need the files `transformer_blocks.safetensors` and `comfy_config.json` inside the folder. You cannot have unrelated files in the folder.
    - The first time you try to load a Nunchaku model, it will give you a popup asking to install support
        - This will autoinstall [mit-han-lab/ComfyUI-nunchaku](<https://github.com/mit-han-lab/ComfyUI-nunchaku>) and its dependencies
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

# Obscure Model Redirection

### Stable Diffusion v1 and v2
### SegMind SSD-1B
### Stable Cascade
### PixArt Sigma
### NVIDIA Sana
### HiDream-i1
### Cosmos Predict2
### OmniGen 2
### Ovis
These obscure/old/bad/unpopular/etc. models have been moved to [Obscure Model Support](/docs/Obscure%20Model%20Support.md)

<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>
