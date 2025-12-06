# SwarmUI Image Prompting - Edit Models, IP-Adapter, Revision, Etc.

- To use image-prompting features in Swarm, simply drag an image into the prompt box, or copy an image and while in the prompt box press `CTRL+V` to paste.
- When you do this, the **Image Prompting** control panel will open on the left at the top of the parameters listing.

## Edit Models

- When using edit models (**Flux Kontext**, **Flux.2**, **Qwen Image Edit**, ...), there's no magic needed. Simply put images in the prompt box and go.
- For these model, don't enable anything in the **Image Prompting** parameter group.
- See the model-specific info in the [Model Support](/docs/Model%20Support.md) doc for details.

## ReVision

- ReVision is an SDXL-specific image-prompting technique that direct passes your image to the SDXL model. This has a light effect, but biases the model towards your prompt.
- If you want to use other image-prompt features without ReVision, simply drag the "ReVision Strength" slider down to `0`.
- ReVision works better if you leave your prompt blank than if you specify a prompt, as prompts tend to overpower the ReVision guidance.
- There's an additional `ReVision Model` parameter hidden under `Advanced Sampling` parameter group.

## IP-Adapter

- IP-Adapter is a technique developed by [TenCent AI Lab](https://github.com/tencent-ailab/IP-Adapter) to bias Stable Diffusion models strongly towards matching the content of an image.
    - This is similar to [ControlNet](/docs/Features/ControlNet.md), but where ControlNets match images features (such as canny lines, depth maps, etc), IP Adapter matches vaguer concepts (such as the general concept of an image, or the face of a person, or etc).
    - IP-Adapter support in Swarm is powered by a [ComfyUI addon developed by Matteo Spinelli aka cubiq](https://github.com/cubiq/ComfyUI_IPAdapter_plus). They've gone above and beyond in extended IP-Adapter beyond its initial state from TenCent. They have a [GitHub sponsors page](https://github.com/sponsors/cubiq) worth supporting if you use IP-Adapter often.
- In a default Swarm install, you will have an "`Install IP Adapter`" button in the parameter list.
    - Simply click this button, and accept the confirmation prompt, to install IP-Adapter to your ComfyUI backend.
    - This may take a minute to download, install, and restart your backend.
    - Once it's done, the UI will update and display IP-Adapter parameters.
        - If it gets stuck for weirdly long, check the Server Logs to see if something errored, or if it finished without updating the page (if so, simply refresh the page).
- When you have IP-Adapter installed, you have the option "Use IP-Adapter" under ReVision.
    - This is a listing of model types with short descriptions, simply select the one that fits your needs.
    - Whenever you select a model category you haven't tried before, Swarm will automatically download the model files for it.
        - Depending on your network speed, this may take a moment. Check the server logs to see a progress report of the download.
        - After being downloaded once, the models are stored in `(Swarm)/Models/ipadapter` (or wherever your models dir is), and won't need to be downloaded again.
- You can use non-standard IPAdapter models by saving them to `(Swarm)/Models/ipadapter`. If they don't use CLIPVision G, you will need to select the correct vision model under `Advanced Model Addons` -> `ReVision Model`.

# Style Models

- Style models, such as **Flux Redux**, can be used through the same interface.
    - See [the model support doc for Flux Redux specifics](/docs/Model%20Support.md#flux1-tools)
