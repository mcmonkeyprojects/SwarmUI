# Obscure Model Support in SwarmUI

See [Model Support](/docs/Model%20Support.md) for general information about model support.

This doc tracks specifically the old, bad, unpopular, etc. models that are supported in SwarmUI but not relevant for most people to use.

| Model | Architecture | Year | Author | Scale | Censored? | Quality/Status |
| ----  | ---- | ---- | ---- | ---- | ---- | ---- |
[Stable Diffusion v1 and v2](#stable-diffusion-v1-and-v2) | unet | 2022 | Stability AI | 1B | No | Outdated |
[Stable Diffusion v1 Inpainting Models](#stable-diffusion-v1-inpainting-models) | unet | 2022 | RunwayML | 1B | No | Outdated |
[Segmind SSD 1B](#segmind-ssd-1b) | unet | 2023 | Segmind | 1B | Partial | Outdated |
[Stable Cascade](#stable-cascade) | unet cascade | 2024 | Stability AI | 5B | Partial | Outdated |
[PixArt Sigma](#pixart-sigma) | DiT | 2024 | PixArt | 1B | ? | Outdated |
[Nvidia Sana](#nvidia-sana) | DiT | 2024 | NVIDIA | 1.6B | No | Just Bad |
[Nvidia Cosmos Predict2](#cosmos-predict2) | DiT | 2025 | NVIDIA | 2B/14B | Partial | Just Bad |
[HiDream i1](#hidream-i1) | MMDiT | 2025 | HiDream AI (Vivago) | 17B | Minimal | Good Quality, lost community attention |
[OmniGen 2](#omnigen-2) | MLLM | 2025 | VectorSpaceLab | 7B | No | Modern, Decent Quality, quickly outclassed |
[Ovis](#ovis) | MMDiT | 2025 | AIDC-AI (Alibaba) | 7B | No | Passable quality, but outclassed on launch |

Obscure video models are tracked at the [Video Models heading](#video-models)

# Stable Diffusion v1 and v2

![img](/docs/images/models/sd15.jpg)
*(Above image is SDv1.5)*

SDv1/SDv2 models work exactly as normal. Even legacy (pre-[ModelSpec](https://github.com/Stability-AI/ModelSpec) models are supported).

### Stable Diffusion v1 Inpainting Models

SDv1 inpaint models (RunwayML) are supported, but will work best if you manually edit the Architecture ID to be `stable-diffusion-v1/inpaint`.

Under `Init Image` param group, checkmark `Use Inpainting Encode`.

# SegMind SSD-1B

SegMind SSD-1B models work the same as SD models.

# Stable Cascade

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

# OmniGen 2

- [OmniGen 2](https://github.com/VectorSpaceLab/OmniGen2) is natively partially supported in SwarmUI.
    - It is technically an LLM, and the LLM features are not supported, only the direct raw image features.
    - Download the model here <https://huggingface.co/Comfy-Org/Omnigen2_ComfyUI_repackaged/blob/main/split_files/diffusion_models/omnigen2_fp16.safetensors>
        - Save it to `diffusion_models`
    - The text encoder is Qwen 2.5 VL 3B (LLM), and will be automatically downloaded.
    - The VAE is the Flux VAE, and will be automatically downloaded.
    - Add images to the prompt box to use them as input images for the model. If no input images are given, but you have an Init Image, that will be used as the input image.
    - **CFG:** Usual CFG rules, around 5 to 7 is a good baseline
        - The reference workflows for comfy used dual-CFG guidance, IP2P style. If you want to do this, you can use advanced param `IP2P CFG 2` to control the secondary CFG, defaults to 2, and set regular CFG to around 5.
    - **Steps:** normal ~20
    - **Resolution:** Normal 1024x1024-ish.
    - **Performance:** Pretty terribly slow. Incompatible with fp8, incompatible with sage attention.
    - **Prompts:** their demo page has some prompt tips and examples <https://huggingface.co/spaces/OmniGen2/OmniGen2>

# Ovis

- [Ovis](https://huggingface.co/AIDC-AI/Ovis-Image-7B) is supported in SwarmUI.
    - It is a 7B-scale MMDiT image model from Alibaba's AIDC-AI, with image quality roughly a bit above base SDXL and a focus on strong text understanding.
- Download the model from [Comfy-Org/Ovis-Image](<https://huggingface.co/Comfy-Org/Ovis-Image/blob/main/split_files/diffusion_models/ovis_image_bf16.safetensors>)
    - Save in `diffusion_models`
- Uses the Flux.1 VAE
- **Parameters:**
    - **Prompt:** Supports general prompting in any format just fine. Speaks English and Chinese.
    - **Sampler:** Default is fine (`Euler`)
    - **Scheduler:** Default works, but `Beta` may be better
    - **CFG Scale:** Normal CFG ranges, `5` is the official recommendation
    - **Steps:** Normal step counts (eg `20`), but they recommend `50`
    - **Resolution:** Side length `1024`. Quickly breaks above that.

--------------------------------------------------------------------------

# Video Models

| Model | Year | Author | Scale | Type | Censored? | Quality/Status |
| ----  | ---- | ---- | ---- | ---- | ---- | ---- |
[Stable Video Diffusion](#stable-video-diffusion) | 2023 | Stability AI | 1B Unet | Image2Video | Yes | Outdated |
[Genmo Mochi 1](#genmo-mochi-1-text2video) | 2024 | Genmo | 10B DiT | Text2Video | ? | Outdated |
[Nvidia Cosmos](#nvidia-cosmos) | 2025 | NVIDIA | Various | Text/Image/Video 2Video | ? | Modern, very slow, poor quality |

--------------------------------------------------------------------------

# Stable Video Diffusion

![svd11_out](https://github.com/user-attachments/assets/ebeb3419-2c96-4746-863c-85ae4bc250d6)

*(SVD XT 1.1, Generated using SDXL 1.0 Base as the Text2Image model)*

- SVD models are supported via the `Image To Video` parameter group. Like XL, video by default uses enhanced inference settings (better sampler and larger sigma value).
- The model has no native text2video, so do not select it as your main model.
- You can do image2video by using an Init Image and setting Creativity to 0.
- You can replicate text2video by just using a normal image model (eg SDXL) as the first-frame generator.
- This model was released after SDXL, but was built based on SDv2.

# Genmo Mochi 1 (Text2Video)

![mochi](https://github.com/user-attachments/assets/4d64443e-c46f-415d-8203-17f6aa0f4cc5)

- Genmo Mochi 1 is supported natively in SwarmUI as a Text-To-Video model.
- You can get either the all-in-one checkpoint <https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/all_in_one>
    - save to `Stable-Diffusion` folder
- Or get the DiT only variant <https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/split_files/diffusion_models> (FP8 Scaled option recommended)
    - save to `diffusion_models` folder
- The text encoder (T5-XXL) and VAE will be automatically downloaded
    - You can also set these manually if preferred
- When selected, the `Text To Video` parameter group will become visible
- Mochi is very GPU and memory intensive, especially the VAE
- Standard CFG values, eg `7`.
- The model is trained for 24 fps, and frame counts dynamic anywhere up to 200. Multiples of 6 plus 1 (7, 13, 19, 25, ...) are required due to the 6x temporal compression in the Mochi VAE. The input parameter will automatically round if you enter an invalid value.
- The VAE has a harsh memory requirement that may limit you from high duration videos.
    - To reduce VRAM impact and fit on most normal GPUs, set `VAE Tile Size` to `160` or `128`, and `VAE Tile Overlap` to `64` or `96`. There will be a slightly noticeable tiling pattern on the output, but not too bad at 160 and 96.
    - If you have a lot of VRAM (eg 4090) and want to max quality but can't quite fit the VAE without tiling, Tile Size 480 Overlap 32 will tile the VAE in just two chunks to cut the VAE VRAM usage significantly while retaining near perfect quality.

# NVIDIA Cosmos

![cosmos-7b](https://github.com/user-attachments/assets/d4e4047e-1706-4f61-b560-3fe6f70783c6)

*(Cosmos 7B Text2World)*

### Nvidia Cosmos Basic Install

- NVIDIA Cosmos Text2World and Video2World (image2video) has initial support in SwarmUI.
- Cosmos Autoregressive is not yet supported.
- You can download the models from here: <https://huggingface.co/mcmonkey/cosmos-1.0/tree/main>
    - pick 7B (small) or 14B (large) - 7B needs less memory/time, but has worse quality. 14B needs more but has better quality. Both will be very slow even on a 4090.
    - Text2World takes a prompt and generates a video (as a base model in Swarm), Video2World takes text+an image and generates a video (via the Image To Video param group in Swarm).
    - Save to `diffusion_models`
- The text encoder is old T5-XXL v1, not the same T5-XXL used by other models.
    - It will be automatically downloaded.
- The VAE will be automatically downloaded.

### Nvidia Cosmos Parameters

- **Prompt:** Cosmos responds poorly to standard prompts, as it was trained for very long LLM-generated prompts.
- **FPS:** The model is trained for 24 FPS, but supports any value in a range from 12 to 40.
- **Resolution:** The model is trained for 1280x704 but works at other resolutions, including 960x960 as base square res.
    - Cannot go below 704x704.
- **Frame Count:** The model is trained only for 121 frames. Some of the model variants work at lower frame counts with quality loss, but generally you're stuck at exactly 121.
- **CFG and Steps:** Nvidia default recommends CFG=7 and Steps=35
- **Performance:** The models are extremely slow. Expect over 10 minutes for a single video even on a 4090.

<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>
