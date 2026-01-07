# Video Model Type Support In SwarmUI

| Model | Year | Author | Scale | Type | Censored? | Quality/Status |
| ----  | ---- | ---- | ---- | ---- | ---- | ---- |
[Hunyuan Video](#hunyuan-video) | 2024 | Tencent | 12B MMDiT | Text2Video and Image2Video variants | No | Modern, Decent Quality |
[Hunyuan Video 1.5](#hunyuan-video-15) | 2025 | Tencent | 8B MMDiT | Text2Video and Image2Video variants | No | Modern, Decent Quality |
[Lightricks LTX Video](#lightricks-ltx-video) | 2024 | Lightricks | 3B DiT | Text/Image 2Video | ? | Modern, Fast but ugly |
[Lightricks LTX Video 2](#lightricks-ltx-video-2) | 2026 | Lightricks | 19B DiT | Text/Image 2Video+Audio | ? | ? |
[Wan 2.1](#wan-21) and [2.2](#wan-22) | 2025 | Alibaba - Wan-AI | 1.3B, 5B, 14B | Text/Image 2Video | No | Modern, Incredible Quality |
[Kandinsky 5](#kandinsky-5) | 2025 | Kandinsky Lab | 2B, 19B | Text/Image 2Video | No | Modern, Decent Quality |

Support for image models and technical formats is documented in [the Model Support doc](/docs/Model%20Support.md), as well as explanation of the table columns above

Old or bad options also tracked listed:

| Model | Year | Author | Scale | Type | Censored? | Quality/Status |
| ----  | ---- | ---- | ---- | ---- | ---- | ---- |
[Stable Video Diffusion](/docs/Obscure%20Model%20Support.md#stable-video-diffusion) | 2023 | Stability AI | 1B Unet | Image2Video | Yes | Outdated |
[Genmo Mochi 1](/docs/Obscure%20Model%20Support.md#genmo-mochi-1-text2video) | 2024 | Genmo | 10B DiT | Text2Video | ? | Outdated |
[Nvidia Cosmos](/docs/Obscure%20Model%20Support.md#nvidia-cosmos) | 2025 | NVIDIA | Various | Text/Image/Video 2Video | ? | Modern, very slow, poor quality |

## Current Recommendations

Video model(s) most worth using, as of December 2025:

- Wan 2.2 or 2.1, in 14B either way. It's the best you can get locally currently.
- Kandinsky 19B looks interesting, but is new and struggling to reach its potential. Could be worth playing with.

## Demo Gifs

- Video demos included below are seed `1` of the prompt `wide shot, video of a cat with mixed black and white fur, walking in the middle of an open roadway, carrying a cardboard sign that says "Meow I'm a Cat". In the distance behind is a green road sign that says "Model Testing Street"` ran on each model.
- For all models, "standard parameters" are used.
    - Steps is set to 20 for all models.
    - Frame count is set as model default.
    - CFG is set appropriate to the model.
    - Resolution is model default.
    - FPS is model default.
    - Note that outputs are converted and shrunk to avoid wasting too much space / processor power on the docs page.
- For image2video models, an era-appropriate text2image model is used and noted.
- This is just the image test prompt from [Model Support](/docs/Model%20Support.md) but I swapped 'photo' to 'video', 'sitting' to 'walking', and 'holding' to 'carrying'. Goal is to achieve the same test as the image prompt does, but with a request for motion.
- All generations are done on the base model of the relevant class, not on any finetune/lora/etc. Finetunes are likely to significantly change the qualitative capabilities, but unlikely to significantly change general ability to understand and follow prompts.
- At time of writing, Hunyuan Video is the only properly good model. LTXV is really fast though.

## Basic Usage

There's a full step by step guide for video model usage here: <https://github.com/mcmonkeyprojects/SwarmUI/discussions/716>

### Text-To-Video Models

- Select the video model in the usual `Models` sub-tab, and configure parameters as usual, and hit Generate.
- The `Text To Video` parameter group will be available to configure video-specific parameters.

### Image-To-Video Models

- Select a normal model as the base in the `Models` sub-tab, not your video model. Eg SDXL or Flux.
- Select the video model under the `Image To Video` parameter group.
- Generate as normal - the image model will generate an image, then the video model will turn it into a video.
- If you want a raw/external image as your input:
    - Use the `Init Image` parameter group, upload your image there
    - Set `Init Image Creativity` to 0
    - The image model will be skipped entirely
    - You can use the `Res` button next to your image to copy the resolution in (otherwise your image may be stretched or squished)

# Video Models

## Hunyuan Video

![hunyuan-video](https://github.com/user-attachments/assets/12d898c4-d9c8-447e-99b3-42ad0f0eb16d)

**This section is for the original Hunyuan Video (v1), for later version see next major section below.**

### Hunyuan Video Basic Install

- Hunyuan Video is supported natively in SwarmUI as a Text-To-Video model, and a separate Image2Video model.
- Use the Comfy Org repackaged Text2Video model <https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/blob/main/split_files/diffusion_models/hunyuan_video_t2v_720p_bf16.safetensors>
    - Or the Image2Video model <https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/blob/main/split_files/diffusion_models/hunyuan_video_image_to_video_720p_bf16.safetensors>
    - Or Kijai's fp8/gguf variants <https://huggingface.co/Kijai/HunyuanVideo_comfy/tree/main>
    - Save to the `diffusion_models` folder
- Or use the gguf models from city96 <https://huggingface.co/city96/HunyuanVideo-gguf/tree/main>
    - `Q6_K` is near identical to full precision and is recommended for 24 gig cards, `Q4_K_M` is recommended if you have low VRAM, results are still very close, other variants shouldn't be used normally
    - Save to the `diffusion_models` folder, then load up Swarm and click the `☰` hamburger menu on the model, then `Edit Metadata`, and set the `Architecture:` field to `Hunyuan Video` (this *might* autodetect but not guaranteed so double-check it)
- The text encoders (CLIP-L, and LLaVA-LLaMA3) and VAE will be automatically downloaded.
- When selected, the `Text To Video` parameter group will become visible

### Hunyuan Video Parameters

- **Resolution:** The model is trained for 1280x720 (960x960) or 960x544 (720x720) resolutions or other aspect ratios of the same total pixel count
    - Using a lower resolution, like 848x480, can work with only some quality loss, and much lower mem/gen time.
- **FPS:** The model is trained for 24 fps (cannot be changed, editing the FPS value will just give you 'slowmo' outputs)
- **FrameCount (Length):** The model supports dynamic frame counts (eg 73 or 129 is solid), so you can pick the duration you want via the `Text2Video Frames` parameter.
    - Multiples of 4 plus 1 (4, 9, 13, 17, ...) are required due to the 4x temporal compression in the Hunyuan VAE.
    - The input parameter will automatically round if you enter an invalid value.
    - For quick generations, `25` is a good short frame count that creates about 1 second of video.
        - Use `49` for 2 seconds, `73` for 3 seconds, `97` for 4 seconds, `121` for 5 seconds, `145` for 6 seconds, 
    - Supposedly, a frame count of 201 yields a perfect looping video (about 8.5 seconds long).
- **Guidance Scale:** Hunyuan Video is based on the Flux Dev architecture, and has similar requirements.
    - Set the core `CFG Scale` parameter to 1.
    - You can use the `Flux Guidance Scale` parameter on this model (for Hunyuan Video, unlike Flux Dev, this value is embedded from CFG scale, and so prefers values around 6).
        - For "FastVideo" raise it up to 10.
- **Sigma Shift:** Leave `Sigma Shift` disabled for regular Hunyuan Video, but for "FastVideo" enable it and raise it to 17.

### Hunyuan Video Performance / Optimization

- Hunyuan Video is very GPU and memory intensive, especially the VAE
    - Even on an RTX 4090, this will max out your VRAM and will be very slow to generate. (the GGUF models help reduce this)
- The VAE has a harsh memory requirement that may limit you from high duration videos.
    - VAE Tiling is basically mandatory for consumer GPUs. You can configure both image space tiling, and video frame tiling, with the parameters under `Advanced Sampling`.
    - If you do not manually enable VAE Tiling, Swarm will automatically enable it at 256 with 64 overlap, and temporal 32 frames with 4 overlap. (Because the memory requirements without tiling are basically impossible. You can set the tiling values very very high if you want to make the tile artifacts invisible and you have enough memory to handle it).
- By default the BF16 version of the model will be loaded in FP8. To change this, use the `Preferred DType` advanced parameter.
    - FP8 noticeably changes results compared to BF16, but lets it run much much faster.
    - The GGUF versions of the model are highly recommended, as they get much closer to original and very close performance to fp8.
        - GGUF Q6_K is nearly identical to BF16.

### Hunyuan Video Additional Notes

- You can use Hunyuan Video as a Text2Image model by setting `Text2Video Frames` to `1`.
    - The base model as an image generator performs like a slightly dumber version of Flux Dev.

### FastVideo

- FastVideo is a version of Hunyuan Video trained for lower step counts (as low as 6)
- You can get the FastVideo fp8 from Kijai <https://huggingface.co/Kijai/HunyuanVideo_comfy/blob/main/hunyuan_video_FastVideo_720_fp8_e4m3fn.safetensors>
    - Save to the `diffusion_models` folder
- Or the gguf FastVideo from city96 <https://huggingface.co/city96/FastHunyuan-gguf/tree/main>
    - Save to the `diffusion_models` folder, then load up Swarm and click the `☰` hamburger menu on the model, then `Edit Metadata`, and set the `Architecture:` field to `Hunyuan Video` (this *might* autodetect but not guaranteed so double-check it)
- Set the advanced `Sigma Shift` param to a high value around 17
- Set the Flux Guidance at a higher than normal value as well (eg 10).
- Not adjusting these values well will yield terribly distorted results. Swarm does not automate these for FastVideo currently!

### Hunyuan Image2Video

- Hunyuan Image2Video is the official image-to-video model from Hunyuan's team, install info above.
- Works like any other Image2Video model, with the same general parameter expectations as regular Hunyuan Video.
- For I2V "v1", You will want to use the Advanced -> `Other Fixes` -> `Trim Video Start Frames` parameter with a value of `4`, as the model tends to corrupt the first few frames.
- For I2V "v2" / "Fixed" version, you will need to click the `☰` hamburger menu on the model, then `Edit Metadata`, and set the `Architecture:` field to `Hunyuan Video - Image2Video V2 ('Fixed')`

### SkyReels Text2Video

- SkyReels is a finetune of Hunyuan video produced by SkyWorkAI, see their repo [here](https://github.com/SkyworkAI/SkyReels-V1)
- You can download a SkyReels Text2Video fp8 model from here <https://huggingface.co/Kijai/SkyReels-V1-Hunyuan_comfy/blob/main/skyreels_hunyuan_t2v_fp8_e4m3fn.safetensors>
    - Save to the `diffusion_models` folder
- Broadly used like any other Hunyuan Video model
- This model prefers you use real CFG Scale of `6`, and set `Flux Guidance` value to `1`
- Their docs say you should prefix prompts with `FPS-24, ` as this was trained in. In practice the differences seem to be minor.
- `Sigma Shift` default value is `7`, you do not need to edit it

### SkyReels Image2Video

- You can download a SkyReels Image2Video fp8 model from here <https://huggingface.co/Kijai/SkyReels-V1-Hunyuan_comfy/blob/main/skyreels_hunyuan_i2v_fp8_e4m3fn.safetensors>
    - Save to the `diffusion_models` folder
- Or you can select a `gguf` variant from <https://huggingface.co/Kijai/SkyReels-V1-Hunyuan_comfy/tree/main>
    - Save to the `diffusion_models` folder, reload Swarm models list, click the `☰` hamburger menu on the model, then `Edit Metadata`, and set the `Architecture:` field to `Hunyuan Video - SkyReels Image2Video`
- Use via the `Image To Video` param group
- This model prefers you use real CFG Scale of around `4` to `6`, and set `Flux Guidance` value to `1`
- Their docs say you should prefix prompts with `FPS-24, ` as this was trained in. In practice the differences seem to be minor.
- The model seems to be pretty hit-or-miss as to whether it creates a video of your image, or just "transitions" from your image to something else based on the prompt.
- The model seems to have visual quality artifacts
    - Set Video Steps higher, at least `30`, to reduce these
- `Sigma Shift` default value is `7`, you do not need to edit it

## Hunyuan Video 1.5

https://github.com/user-attachments/assets/b3605901-78ed-4f13-a065-adfbc0d63232

*(Hunyuan Video 1.5 - T2V 720p non-distilled CFG=6 Steps=20 Frames=121)*

- SwarmUI supports [Hunyuan Video 1.5 Models](https://huggingface.co/tencent/HunyuanVideo-1.5)
    - There appear to be quality issues not related to the Swarm impl, either in the model or in the upstream comfy impl.
- Downloads here <https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/diffusion_models>
    - save to `diffusion_models` folder
    - There are variants for Text2Video vs Image2Video
        - Despite the labeled difference, both variants can equally do both text2video and image2video.
        - Also a dedicated superresolution v2v upscaler, see [below](#hunyuan-video-15-superresolution-model)
    - There are 480p and 720p variants
        - Swarm will assume all models are 720p (`960x960`). For the 480p models, you may want to edit the model metadata and set the resolution to `640x640`.
        - They are actually pretty friendly to mixing the resolution, 720p can do 480 fine and 480p can mostly do 720.
    - There are CFG Distilled and non-distilled versions
        - CFG distilled runs faster and with less vram, non-distilled is slower but MIGHT yield better quality
- The VAE is a 16x16 downsample (as opposed to most prior models using 8x8)
    - This allows HyVid1.5 to run faster than most, but with some quality reduction on small details
- **Parameters**:
    - **CFG:** `1` for Distilled, otherwise normal high CFG values, eg `6`
    - **Steps:** Normal step counts (20+)
    - **Frames:** Trained for `121` (5 seconds), shorter lengths work fine too, or longer up to 241 (10 seconds). When not specified, Swarm will default to `73` (3 seconds).
        - You can do Frames=`1` for image generation.
    - **FPS:** The model is trained for `24` fps
    - **Resolution:** Aside from the trained resolution, the models seem happy with different smaller resolutions or different aspect ratios as well.
    - **Sigma Shift:** defaults to `7`. They recommend lowering to `5` for 480p and raising to `9` on specifically `720p T2V`.
        - SuperResolution uses `2`

### Hunyuan Video 1.5 SuperResolution Model

- The SuperResolution models function equivalent to basic models, and are meant to be used as a Refiner model.
    - Save in the same folder as the rest.
    - You may need to manually edit the model metadata to architecture `Hunyuan Video 1.5 SuperResolution`
    - Probably edit model metadata to set the resolution to `1920x1080` (or approx 1:1 of `1456x1456`)
    - The SR models have "distilled" in the filename but seem to respond better to CFG=6 and make a mess at CFG=1.
- There are dedicated latent upscale models here <https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/latent_upscale_models>
    - Save to `(SwarmUI)/Models/latent_upscale_models` (create the folder if it doesn't already exist)
    - Select the model as the *Refiner Upscale Method*
    - If you have a 720p gen, and you are using the 1080p upscale, set Refiner Upscale to `1.5`.

- Not yet supported, WIP.

## Lightricks LTX Video

![ltxv](https://github.com/user-attachments/assets/23e51754-79c6-47cd-9840-e65ec24fac1f)

*(LTX-Video 0.9.1, Text2Video, CFG=7 because 3 was really bad)*

### LTXV Install

- Lightricks LTX Video ("LTXV") is supported natively in SwarmUI as a Text-To-Video and also as an Image-To-Video model.
    - The text2video is not great quality compared to other models, but the image2video functionality is popular.
- Download your preferred safetensors version from <https://huggingface.co/Lightricks/LTX-Video/tree/main>
    - At time of writing, they have 0.9, 0.9.1, 0.9.5, and 0.9.6, each new version better than the last, but all pretty bad
    - save to `Stable-Diffusion` folder
    - The text encoder (T5-XXL) and VAE will be automatically downloaded
        - You can also set these manually if preferred
- On the `Server` -> `Extensions` tab, you'll want to grab `SkipLayerGuidanceExtension`, so you can use "STG", a quality improvement for LTXV

### LTXV Parameters

- **FPS:** The model is trained for 24 fps but supports custom fps values
- **Frames:** frame counts dynamic anywhere up to 257. Multiples of 8 plus 1 (9, 17, 25, 33, 41, ...) are required due to the 8x temporal compression in the LTXV VAE. The input parameter will automatically round if you enter an invalid value.
- **Resolution:** They recommend 768x512, which is a 3:2 resolution. Other aspect ratios are fine, but the recommended resolution does appear to yield better quality.
- **CFG:** Recommended CFG=3
- **Prompt:** very very long descriptive prompts.
    - Seriously this model will make a mess with short prompts. If you ask for `a video of a cat` you will just get a dark blur.
    - Example prompt (from ComfyUI's reference workflow):
        - Prompt: `best quality, 4k, HDR, a tracking shot of a beautiful scene of the sea waves on the beach`
        - Or Prompt: `A drone quickly rises through a bank of morning fog, revealing a pristine alpine lake surrounded by snow-capped mountains. The camera glides forward over the glassy water, capturing perfect reflections of the peaks. As it continues, the perspective shifts to reveal a lone wooden cabin with a curl of smoke from its chimney, nestled among tall pines at the lake's edge. The final shot tracks upward rapidly, transitioning from intimate to epic as the full mountain range comes into view, bathed in the golden light of sunrise breaking through scattered clouds.`
        - Negative Prompt: `low quality, worst quality, deformed, distorted, disfigured, motion smear, motion artifacts, fused fingers, bad anatomy, weird hand, ugly`
- If you installed the `SkipLayerGuidanceExtension`, Find the `Skip Layer Guidance` parameter group in advanced
    - Set `[SLG] Scale` to `1`
    - Leave `Rescaling Scale` and `Layer Target` unchecked, leave the start/end percents default
- LTX has some official tips and info on their HF page <https://huggingface.co/Lightricks/LTX-Video>

### LTXV Image To Video

- You can use the regular LTXV model as an Image-To-Video model
    - Select the LTXV model under the `Image To Video` group's `Video Model` parameter
    - Set `Video FPS` to `24` and `Video CFG` to `3`, set `Video Frames` to a higher value eg `97`
    - Pay attention that your prompt is used for both the image, and video stages
        - You may wish to generate the image once, then do the video separately
        - To do that, set the image as an `Init Image`, and set `Creativity` to `0`

### LTXV Performance

- LTXV has the best performance of any video model supported in Swarm. It is wildly fast. This comes at the cost of quality.

## Lightricks LTX Video 2

- LTXV-2 is the first proper Audio+Video combo model available as open source
- SwarmUI has basic support for LTXV-2 (however the model is new and has very different tech than usual, so some edge cases are weird)
    - Download the model from [Lightricks](<https://huggingface.co/Lightricks/LTX-2/tree/main>)
    - Save in `Stable-Diffusion` models folder
    - Details TBD
- LTXV-2 has a dedicated latent spatial upscler model
    - If you want to use it, download [ltx-2-spatial-upscaler-x2-1.0.safetensors](<https://huggingface.co/Lightricks/LTX-2/blob/main/ltx-2-spatial-upscaler-x2-1.0.safetensors>)
    - save it to `(SwarmUI)/Models/latent_upscale_models`
    - Set `Refiner Upscale` to 2, select the model as the `Refiner Upscale Method` parameter, and set `Refiner Control Percentage` to 0.5. Set your base resolution to half of your target (eg 320 instead of 640).
        - The upscaler is hardlocked at 2x and will not work at any other upscale amount.
- Parameters:
    - **Prompt:** LTXV really needs long prompts to accomplish anything.
    - **CFG Scale:** The regular model uses normal CFG values such as ~4, the distilled model uses `1`.
    - **Steps:** The regular model uses normal step values, 20+. The distilled model uses `8` but works at `4`.
    - **Negative Prompt:** Reference workflow suggests using this giant negative:
        <details>
            <summary>Giant negative</summary>
            ```
            blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, grainy texture, poor lighting, flickering, motion blur, distorted proportions, unnatural skin tones, deformed facial features, asymmetrical face, missing facial features, extra limbs, disfigured hands, wrong hand count, artifacts around text, unreadable text on shirt or hat, incorrect lettering on cap (“PNTR”), incorrect t-shirt slogan (“JUST DO IT”), missing microphone, misplaced microphone, inconsistent perspective, camera shake, incorrect depth of field, background too sharp, background clutter, distracting reflections, harsh shadows, inconsistent lighting direction, color banding, cartoonish rendering, 3D CGI look, unrealistic materials, uncanny valley effect, incorrect ethnicity, wrong gender, exaggerated expressions, smiling, laughing, exaggerated sadness, wrong gaze direction, eyes looking at camera, mismatched lip sync, silent or muted audio, distorted voice, robotic voice, echo, background noise, off-sync audio, missing sniff sounds, incorrect dialogue, added dialogue, repetitive speech, jittery movement, awkward pauses, incorrect timing, unnatural transitions, inconsistent framing, tilted camera, missing door or shelves, missing shallow depth of field, flat lighting, inconsistent tone, cinematic oversaturation, stylized filters, or AI artifacts.
            ```
        </details>

# Wan 2.1

![wan21_14b](https://github.com/user-attachments/assets/17ace901-bc5f-48d0-ab01-ed8984a1b1dc)

*(Wan 2.1 - 14B Text2Video)*

![wan21_13b](https://github.com/user-attachments/assets/51c40a08-9a05-4553-9785-67ae4fe8b2ac)

*(Wan 2.1 - 1.3B Text2Video)*

### Wan 2.1 Install

- [Wan 2.1](https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B), a video model series from Alibaba, is supported in SwarmUI.
    - Supports separate models for Text2Video or Image2Video.
- Download the comfy-format Wan model from <https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models>
    - Favor the `fp8_scaled` models as the main choice, or `fp16` for the 1.3B.
    - Or Kijai's versions <https://huggingface.co/Kijai/WanVideo_comfy/tree/main> (has a lot of other variants)
    - For I2V 1.3B, you can use <https://huggingface.co/alibaba-pai/Wan2.1-Fun-1.3B-InP/blob/main/diffusion_pytorch_model.safetensors>  (rename the file when you save it to avoid confusion)
    - For Text2Video, pick either 1.3B (small) model, or 14B (large) model
    - For Image2Video, pick either 480p (640x640 res) or 720p (960x960 res) model, OR the new "Fun-Inp" models (1.3B or 14B)
        - These are not autodetected separately, 480p is assumed.
        - For 720p variant, you will want to click the `☰` hamburger menu on the model, then `Edit Metadata`, and set the `Resolution` to `960x960`
        - The 720p variant is not recommended. The 480p is actually capable of high resolutions just fine, and has better compatibility.
    - the 1.3B model is very small and can run on almost any modern GPU
    - the 14B versions are 10x larger and require around 10x more VRAM, requires nvidia xx90 tier models to run at decent speed
    - The FLF2V Model ("First-Last Frame To Video") <https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Wan2_1-FLF2V-14B-720P_fp8_e4m3fn.safetensors> is an Image-To-Video model that requires an End Frame input as well
    - save to `diffusion_models`
- Or GGUF format for reduced VRAM requirements
    - For T2V 14B <https://huggingface.co/city96/Wan2.1-T2V-14B-gguf/tree/main>
    - For I2V 480p <https://huggingface.co/city96/Wan2.1-I2V-14B-480P-gguf/tree/main>
    - For I2V 720p <https://huggingface.co/city96/Wan2.1-I2V-14B-720P-gguf/tree/main>
    - save to `diffusion_models`
    - click the `☰` hamburger menu on the model, then `Edit Metadata`, and set the `Architecture` to whichever is correct for the model (eg `Wan 2.1 Text2Video 14B`)
- The text encoder is `umt5-xxl` ("UniMax" T5 from Google), not the same T5-XXL used by other models.
    - It will be automatically downloaded.
- The VAE will be automatically downloaded.

### Wan 2.1 Parameters

- **Prompt:** Standard. Supports English and Chinese text.
    - They have an official reference negative prompt in Chinese, it is not required but may help: `色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走`
        - (This is just a word spam negative "bright colors, overexposed, static, blurred details, subtitles, ..." but in Chinese. It does help though.)
- **FPS:** The original Wan 2.1 base model is trained for 16 FPS. Most variants, including Wan 2.2-5B, CausVid, Lightx2v, Lightning, etc, are trained for 24 FPS.
    - Swarm will default to 24 FPS for Wan. You must manually select 16 FPS when using the original Wan 2.1 base.
- **Resolution:** The models are trained for `832x480`, which is a 16:9 equivalent for `640x640`
    - the 14B models are trained also for `1280x720`, which is a 16:9 equivalent for `960x960`
    - Other resolutions seem to work fine. Even the 1.3B, which is not trained for 960, can technically still do 960 just with a quality drop as it gets too large.
        - As a vid2vid gen, the model seem to be very good at generating very high res directly.
    - Any aspect ratio is fine.
- **Frame Count (Length):** you can select pretty freely, different values work fine. If unspecified, will default to `81` (5 seconds if at 16 fps).
    - Use 17 for one second, 33 for two, 49 for three, 65 for 4, 81 for 5.
    - Higher frame counts above 81 seem to become distorted - still work but quality degrades and glitching appears.
    - The Text2Video models seem to favor 81 frames (5 seconds) and exhibit some signs of quality degradation at very low values, the Image2Video models are much more malleable
- **Steps:** Standard, eg Steps=20, is fine. Changing this value works broadly as expected with other models.
    - Slightly higher (25 or 30) is probably better for small detail quality
- **CFG Scale:** Standard CFG ranges are fine. Official recommended CFG is `6`, but you can play with it.
    - Image2Video models may work better at lower CFGs, eg `4`. High CFGs will produce aggressive shifts in lighting.
- **Sampler and Scheduler:** Standard, eg Euler + Simple
    - You can experiment with changing these around, some may be better than others
- **Sigma Shift:** range of 8 to 12 suggested. Default is `8`.
- **Performance:**
    - Wan 14B is pretty slow unless you have top-end hardware (4090/5090). With topend hardware and all the best speed optimizations... it's still generally going to run in the "minutes per video" range.
    - If you see generations completing but then freezing or dying at the end, the advanced `VAE Tiling` parameters may help fix that. Ignore the temporal tiling (the Wan VAE is implicitly temporally tiled).
    - The Image2Video models are much more performance-intensive than the Text2Video models
    - The lightning/causvid/lightx2v models make Wan much faster, see [the section below](#wan-causvid---high-speed-14b)
    - To run faster, use a "HighRes Fix" style setup, there's a guide to that here: <https://www.reddit.com/r/StableDiffusion/comments/1j0znur/run_wan_faster_highres_fix_in_2025/>
- **Quality:**
    - The Wan models sometimes produce glitched content on the first or last few frames - under Advanced->`Other Fixes`->you can adjust `Trim Video Start Frames` (and `End`) to a small number (1 to 4) to cut the first/last few frames to dodge this.

### Wan CausVid - High Speed 14B

- Want to generate 14B videos way faster? Here's how:
    - Pick one of the options below, and save it to your LoRAs folder. "Lightx2v" is the current best recommendation for Wan 2.1.
        - Here's the v2 version <https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Wan21_CausVid_14B_T2V_lora_rank32_v2.safetensors>
        - Or the V1 version <https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Wan21_CausVid_14B_T2V_lora_rank32.safetensors>
            - V1 has some visual side effects (noise pattern on the video), whereas V2 seems to have motion delay (the first couple seconds of a video have little motion, requiring longer video gens)
        - (Despite the T2V name, this works on I2V too)
        - If you care what "CausVid" means, here's where it's from: <https://github.com/tianweiy/CausVid>
        - If you want a 1.3B version, <https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Wan21_CausVid_bidirect2_T2V_1_3B_lora_rank32.safetensors>
        - There's also "FusionX", a merge of multiple accel loras, that works the same in concept (but expressly favors higher res, eg 720p), find files here: <https://huggingface.co/vrgamedevgirl84/Wan14BT2VFusioniX/tree/main/FusionX_LoRa>
        - There's also the "Lightx2v" LoRA, a newer causvid variant <https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Wan21_T2V_14B_lightx2v_cfg_step_distill_lora_rank32.safetensors>
    - Set up a Wan gen with 14B as normal, but also set:
        - **CFG Scale** to `1`
            - If doing I2V, set **Video CFG** to `1`
        - **Steps** to `4` for fastest generation, `8` for high quality while still fast, or `12` if you really want to ensure max quality by letting the gen take a while
            - If doing I2V, set **Video Steps** to `4`, `8`, or `12`
        - **Sampler:** can be default (Euler), but `UniPC` might be a touch better
        - **Scheduler:** not sure what's best atm, but default usually seems alright
        - **Frame Count (Length):** supports the same ranges as regular Wan, but seems to extend happily to at least 97 frames (4 seconds at 24 fps), and possibly also 121 frames (5 seconds).
            - Wan defaults to 81 in Swarm (3.3 seconds) so you may want to tweak this manually.
            - Use 25 for one second, 49 for two, 73 for three, 97 for four, 121 for five, 145 for six.
        - With Text2Video, you may want to set **Other Fixes** -> **Trim Video Start Frames** to about 8, to prevent first-frame-flash (there tends to be 2 latent frames, ie 8 real frames, in glitched quality)
    - Note you still have to consider VRAM and res/frame count, as you will still get slow gens if you exceed your GPU's VRAM capacity. The net speed will still be faster, but not as impressive as compared to when you fit your GPU properly.
    - Then generate as normal. You'll get a completed video in a fraction of the time with higher framerate quality, thanks to the CausVid lora.

### Wan For Image Generation

- You can use Wan T2V as an image generation model too!
- Just set **Text2Video Frames** to `1`
- This works for all Wan T2V variants (2.1 1.3B, 2.1 14B, 2.2 14B, 2.2 5B, ...)
- This is compatible with Lightx2v/Lightning LoRAs.
- Some parameter adjustments may be needed
    - Notably, setting **Sigma Shift** to `1` or `2` seems to improve quality significantly.
    - Wan may be overly resolution and aspect sensitive when generating images
        - For example, 3:4 or 2:3 at side length 1280 might make pretty great portraits on some Wan variants, but swap to 9:16 or to default side length on the same model and it looks terrible.

### Wan Phantom

- Wan Phantom is supported in SwarmUI.
    - It lets you add reference images to a video generation.
    - Download the phantom 14B base model here <https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Phantom-Wan-14B_fp8_e4m3fn.safetensors>
        - Or as a gguf <https://huggingface.co/QuantStack/Phantom_Wan_14B-GGUF/blob/main/Phantom_Wan_14B-Q4_K_M.gguf>
        - Save to `diffusion_models`
    - It works like Wan-14B-Text2Video, but with image inputs. This is not i2v, this is a "reference" image (you prompt it for how your images get added into the video)
    - Add images to the prompt box (drag in or paste in). You can use just one, or multiple (up to 6 supposedly).
    - Your first input image determines the resolution of the input image set. 512x512 seems to be fine, 1024 is good too. Avoid very high res inputs as it will cost extra VRAM.

### Wan VACE

- Wan VACE has initial support in SwarmUI.
    - For **Reference Image** mode:
        - Select your VACE model as your regular text2video base model
        - Set the reference image as your Init Image
        - Set Creativity to 1
        - Generate as normal
    - For **Control Video** mode:
        - Not yet supported in main interface, use Comfy Workflow tab

### Wan 2.2

- Wan 2.2 is natively supported in SwarmUI
    - Wan 2.2 is better in some regards (notably photorealistic video quality), but not all, compared to Wan 2.1. Notably, it is more complicated to set up. If you're new, start with Wan 2.1, and try an upgrade to 2.2 after you're familiar with the basics.
    - You can download the standard version of the model(s) from here <https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models>
        - Or, there's a collection of GGUF files here: <https://huggingface.co/collections/QuantStack/wan22-ggufs-6887ec891bdea453a35b95f3>
        - There's a **14B T2V (Text To Video)**, in a high+low noise pair
            - You're expected to run the high noise as a base and the low noise as a refiner, with:
                - **RefinerMethod** as `StepSwap`, and
                - **RefinerControlPercentage** as `0.5` (or higher if preferred, cannot go lower)
            - Reference **CFG** range is `5`
        - There's a **14B I2V (Image To Video)**, in a high+low noise pair
            - You're expected to run the high noise as a base and the low noise as a refiner
                - In the **Image To Video** params:
                    - Set the regular **Video Model** to the high noise model,
                    - and set the advanced **Video Swap Model** to the low noise model,
                    - and leave **Video Swap Percent** at `0.5` (or higher if preferred, cannot go lower)
            - Reference **CFG** range is `3.5`
            - This also supports the `Video End Frame` input to create a video that moves between two known places
        - For both 14B types:
            - **FPS** is `16`, but loras or even parameter adjustments can change it to a more normal-looking `24`.
                - Swarm will default to `24`, but if your videos "feel sped up", change the FPS parameter to `16`.
            - Sigma shift may be worth experimenting with. The default is 8, but a wide range of values are functional.
                - Some users recommend `1.5` for T2V
        - There's a **5B T/I2V (single model that does both text and image to video)** as well
            - It has its own VAE. Will be autodownloaded.
            - No funky model pair like the 14b has, just a straight single model
            - Reference **CFG** is `3.5`
            - Native **FPS** of `24`
        - There are some Wan 2.2 Lightx2v models available
            - Notably this pair: <https://huggingface.co/Kijai/WanVideo_comfy/tree/main/LoRAs/Wan22-Lightning>
                - There's also an enhanced I2V Lightning High LoRA: <https://huggingface.co/Kijai/WanVideo_comfy/tree/main/LoRAs/Wan22_Lightx2v>
            - You use a separate High and Low variant together
            - There are two ways to set the pair loras...
                - Option 1: via the UI
                    - Click "Edit Metadata" on the model, find "Default Confinement", select the appropriate confinement, and hit Save
                        - For T2V high this is "Base", for T2V Low this is "Refiner", for I2V High this is "Video", for I2V Low this is "VideoSwap"
                    - Then just select both loras as normal
                - Option 2: in the prompt
                    - For T2V Use with this at the end of your prompt: `<base> <lora:Wan2.2-Lightning_T2V-A14B-4steps-lora_HIGH_fp16>   <refiner> <lora:Wan2.2-Lightning_T2V-A14B-4steps-lora_LOW_fp16>` (adapt the lora filenames to whatever specific filenames you have locally)
                        - You can use your LoRA browser tab at the top, find the LoRA, and click the `☰` hamburger menu and then `Add To Prompt`
                    - For I2V, use `<video> <lora:...i2v-high>   <videoswap> <lora:...i2v-low>` and of course use the i2v loras
                        - the I2V Lightning LoRA appears to target 16 fps
                    - Because this is wonky, once you get it working, it is recommended that you make a Preset with the Prompt set like `{value} <base> ... <refiner> ...` to make it easy to click straight into this behavior rather than doing it manually every time. You can also select the models, CFG, etc. in the preset to have it all ready in one click.
        - You can use the Wan 2.1 Lightx2v or other causvid-likes (see [CausVid Section Above](#wan-causvid---high-speed-14b)) on the Wan 2.2 14B (not on the 5B)
            - For I2V, this seems to "just work"
            - For T2V, this has some visual oddities but does still mostly work
        - Wan 2.2 has an official prompting guide book: <https://alidocs.dingtalk.com/i/nodes/EpGBa2Lm8aZxe5myC99MelA2WgN7R35y>

# Kandinsky 5

- Kandinsky 5 Video Lite and Video Pro are supported in SwarmUI!
    - Also the image models, docs [in the image model support doc](/docs/Model%20Support.md#kandinsky-5)
- They come in a variety of variants, you will have to pick what you want, or experimental with several.
    - Do you want "Lite" or "Pro"?
        - Lite is a 2B (very small) video model with a variety of distilled and other variants. Its quality is not quite on par with competitors like Wan 14B, but its small size makes it easier to run.
            - Files are here <https://huggingface.co/collections/kandinskylab/kandinsky-50-video-lite>
                - NoCFG or Distilled16Steps are the fastest variants, SFT is supposedly the best quality.
        - Pro is a 19B (very large) video model with only different quality tune variants.
            - Files are here <https://huggingface.co/collections/kandinskylab/kandinsky-50-video-pro>
                - You probably want the SFT 10s version.
- At time of writing, the current implementation has bugs, and some hacks are used to workaround them. Not all features work. What does work is kinda bad.
- **Parameters:**
    - These vary heavily based on model you choose.
    - **CFG Scale:** for regular models, regular CFG such as `5` works. For CFG-distill and step distill, use CFG of `1`.
    - **Steps:** For regular, 20 or higher is used. For Step Distill, 16 is the target. Going lower will work but with a severe quality hit.
    - **Resolution:** All video models primarily target a side length of 640. Higher resolutions can work, Pro handles 960x960 fine.

# Obscure Model Redirection

### Stable Video Diffusion
### Genmo Mochi 1 (Text2Video)
### NVIDIA Cosmos

These obscure/old/bad/unpopular/etc. models have been moved to [Obscure Model Support](/docs/Obscure%20Model%20Support.md#video-models)

<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>
