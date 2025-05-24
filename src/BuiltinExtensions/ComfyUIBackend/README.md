# ComfyUI Backend Extension For SwarmUI

This extension enables the use of [ComfyUI](https://github.com/comfyanonymous/ComfyUI) as a backend provider for SwarmUI.

Among other benefits, this enables you to use custom ComfyUI-API workflow files within SwarmUI.

You can also view the ComfyUI node graph and work with custom workflows directly in the UI when any comfy backend is enabled.

### API vs Self-Start

- Self-Start lets swarm configure, launch, and manage the ComfyUI backend. This is highly recommended.
- API-By-URL is for if you want to launch and manage the ComfyUI instance entirely yourself, but still connect it from Swarm.
    - Configuration is significantly more complex, and misbehavior may occur. This is not recommended.
    - In other words: Unless you're a professional getting paid by the hour to build a complex AI network, you almost certainly do not need or want the API-By-URL option.

### Installation (Self-Start)

- First: Have a valid ComfyUI install. The SwarmUI installer automatically provides you one (if not disabled) as `dlbackend/comfy/ComfyUI/main.py`.
- Go to `Server` -> `Backends`, and click `ComfyUI Self-Starting`, and fill in the `StartScript` path as above. Other values can be left default or configured to your preference.
- Save the backend, and it should just work.

### Installation (API)

- First: have a valid and working ComfyUI installation.
- Make sure it uses the exact same model paths as your SwarmUI instance does. This means that if you have eg `OfficialStableDiffusion/sd_xl_base_1.0.safetensors` in Swarm, you need have *EXACTLY* that in ComfyUI. The only exception is Windows paths that use `\` instead of `/` are fine, Swarm will automatically correct for that (If you use Self-Start, this is automatically managed from your Swarm settings).
- Note that swarm may leave stray Input or Output images in the ComfyUI folder that you may wish to clean up (if you use Self-Start, this will be prevented automatically).
- Swarm provides extra Comfy nodes automatically to Self-Start ComfyUI instances from folders within the ComfyUI extension folder, including `DLNodes` and `ExtraNodes` - it is highly recommended you copy these to your remote Comfy's `custom_nodes` path, or point to them with your `extra_model_paths` file.
- If you use a Self-Start backend, it will autogenerate a valid extra model paths file into the `Data` folder, you may wish to do that to copy for your comfy API instance.

### Should I Use Comfy Manager?

You **can** use Manager if you want, there are no specific compatibility issues with SwarmUI.

*However*, bear in mind **what Manager is:** it dynamically installs random sections of source code made by a huge variety of random non-professional developers from across the planet. In other words: Manager, by its very nature, is likely to break things. This is not an issue related to SwarmUI, this is not an insult to the developer of Manager - this is just the reality of circumstances. If you install tons of random blobs of python, not all of them will work well, and some of them will cause cascading errors. Each custom node pack will want its own python pip dependencies *(which tend to cause issues of their own)* and won't always be intercompatible. Some will be built against outdated versions of comfy, some will use bad approaches in their code *(a common issue is packages doing their own custom dependency installation, which often can destroy an entire install and require you reinstall the entire UI)*.

What can you use instead of Manager? Here's a few options
- (1) Nothing! Comfy and Swarm support quite a lot out of the box. The most valuable bits not built into Comfy, Swarm has stable installers to add those in safely.
- (2) Manual installation. If you really want a custom node, go look at its github, look over how it works and what it requires, take the time to `git clone` the repo and `pip install` the dependencies yourself. Is this easy? No. But that added difficulty will force you to consider which nodes you actually need, and which dependencies you're willing to install. You'll end up not only with a more stable installation, but also making better comfy workflows (because when you share them, you won't have to tell people to install 500 custom nodes! And also they won't break when a custom node doesn't update or whatever).

### Basic Usage Within SwarmUI

(TODO): tldr don't worry about it, it just works, follow general Swarm usage docs

### Using Workflows In The UI

(TODO): explain the Node tab and how to use it within SwarmUI, link out to Comfy docs for usage of the node editor itself.

- When using a custom workflow in the main Generate tab:
    - Default nodes (KSampler, LoadCheckpoint, etc) will automatically detect and link to standard Swarm workflows.
    - You can use the `SwarmLoraLoader` node to allow loading loras in your workflow, see [here](https://github.com/Stability-AI/StableSwarmUI/issues/130#issuecomment-1772718963)

### Making and Using Your Own Custom Workflow Files

(TODO): explain the API-specific workflow file format, how it differs from workflows in the UI, and how to use it.

(TODO): Are API-format custom workflows even relevant anymore? UI-workflows are easier and nicer.

(Note: this readme section should mention that the main checkpoint loader should be ID `4` for best compatibility, due to how ComfyUI loads models - see `just_load_model.json`)
