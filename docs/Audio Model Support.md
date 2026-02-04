# Audio Model Type Support In SwarmUI


| Model | Year | Author | Scale | Type | Quality/Status |
| ----  | ---- | ---- | ---- | ---- | ---- |
[Ace Step 1.5](#ace-step-15) | 2026 | StepFun | 2B DiT | Music | No | Modern, Fast, Decent Quality |

Support for image models and technical formats is documented in [the Model Support doc](/docs/Model%20Support.md), as well as explanation of the table columns above.

Audio models vary in intention and purpose. Some examples include:
- Sound effect models are used to create general purpose sound effects, useful to adjust videos with (see eg mmaudio)
- Music models create full songs. Often these support instruments, styles, and lyrics (see eg ACE-Step)
- Speech models create speech. Often these take in voice references and text prompts for what to say (see eg VibeVoice)

# Ace Step 1.5

- [Ace Step 1.5](<https://huggingface.co/ACE-Step/Ace-Step1.5>) is the first audio model to be natively supported in SwarmUI!
- Download it from [Comfy-Org/ace_step_1.5](<https://huggingface.co/Comfy-Org/ace_step_1.5_ComfyUI_files/blob/main/split_files/diffusion_models/acestep_v1.5_turbo.safetensors>)
    - save in `diffusion_models`
- It uses twin small Qwen text encoders, they will be autodownloaded.
- The audio VAE will be autodownloaded.
- Parameters:
    - **Prompt:** Write the lyrics of the song, you can add section hint labels like `[Intro]` or `[Chorus - Pop Explosion]`
        - See [the official examples page](<https://ace-step.github.io/ace-step-v1.5.github.io/>) for examples of valid lyric and style inputs.
    - **Text2Audio Parameter Group** will appear on the sidebar after the model is selected:
        - **Audio Duration:** defaults to 120 seconds (2 minutes), but designed to short any duration from a few seconds to up to 10 minutes
        - **Audio Style:** write a short description of the music style.
    - **CFG Scale:** For the turbo, use `1`
    - **Steps:** For the turbo, use `8`
    - **Sigma Shift:** Defaults to `3`
