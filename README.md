# SwarmUI

**SwarmUI v0.9.5 Beta**.

Formerly known as StableSwarmUI.

A Modular AI Image Generation Web-User-Interface, with an emphasis on making powertools easily accessible, high performance, and extensibility. Supports AI image models (Stable Diffusion, Flux, etc.), and AI video models (LTX-V, Hunyuan Video, Cosmos, Wan, etc.), with plans to support eg audio and more in the future.

![ui-screenshot](.github/images/swarmui.jpg)

Join the [Discord](https://discord.gg/q2y38cqjNw) to discuss the project, get support, see announcements, etc.

Follow the [Feature Announcements Thread](https://github.com/mcmonkeyprojects/SwarmUI/discussions/1) for updates on new features.

----

# Status

This project is in **Beta** status. This means for most tasks, Swarm has excellent tooling available to you, but there is much more planned. Swarm is recommended as an ideal UI for most users, beginners and pros alike. There are still some things to be worked out.

Beginner users will love Swarm's primary Generate tab interface, making it easy to generate anything with a variety of powerful features. Advanced users may favor the Comfy Workflow tab to get the unrestricted raw graph, but will still have reason to come back to the Generate tab for convenience features (image editor, auto-workflow-generation, etc) and powertools (eg Grid Generator).

Those interested in helping push Swarm from Beta to a Full ready-for-anything perfected Release status are welcome to submit PRs (read the [Contributing](/CONTRIBUTING.md) document first), and you can contact us here on GitHub or on [Discord](https://discord.gg/q2y38cqjNw). I highly recommend reaching out to ask about plans for a feature before PRing it. There may already be specific plans or even a work in progress.

Key feature targets not yet implemented:
- Better mobile browser support
- full detail "Current Model" display in UI, separate from the model selector (probably as a tab within the batch sidebar?)
- LLM-assisted prompting (there's an extension for it, but LLM control should be natively supported)
- convenient direct-distribution of Swarm as a program ([Tauri](https://tauri.app/), [Blazor Desktop](https://learn.microsoft.com/en-us/training/modules/build-blazor-hybrid/), or an Electron app?)

# Try It On Google Colab or Runpod

### Google Colab

**WARNING**: Google Colab does not necessarily allow remote WebUIs, particularly for free accounts, use at your own risk.

Colab link if you want to try Swarm: https://colab.research.google.com/github/mcmonkeyprojects/SwarmUI/blob/master/colab/colab-notebook.ipynb

### Runpod

Runpod template (note: maintained by third party contributor [nerdylive123](https://github.com/nerdylive123)): https://runpod.io/console/deploy?template=u7mlkrmxq3&ref=c6jd6jj0

Note it may take several minutes to start up the first time. Check the container logs to see setup progress. Check the template `?` info for hints on how to use.

# Installing on Windows

Note: if you're on Windows 10, you may need to manually install [git](https://git-scm.com/download/win) and [DotNET 8 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/8.0) first. (Windows 11 this is automated).

- Download [The Install-Windows.bat file](https://github.com/mcmonkeyprojects/SwarmUI/releases/download/0.9.5-Beta/install-windows.bat), store it somewhere you want to install at (not `Program Files`), and run it.
    - It should open a command prompt and install itself.
    - If it closes without going further, try running it again, it sometimes needs to run twice. (TODO: Fix that)
    - It will place an icon on your desktop that you can use to re-launch the server at any time.
    - When the installer completes, it will automatically launch the SwarmUI server, and open a browser window to the install page.
    - Follow the install instructions on the page.
    - After you submit, be patient, some of the install processing take a few minutes (downloading models and etc).

(TODO): Even easier self-contained pre-installer, a `.msi` or `.exe` that provides a general install screen and lets you pick folder and all.

# Alternate Manual Windows Install

- Install git from https://git-scm.com/download/win
- Install DotNET 8 SDK from https://dotnet.microsoft.com/en-us/download/dotnet/8.0 (Make sure to get the SDK x64 for Windows)
- open a terminal to the folder you want swarm in and run `git clone https://github.com/mcmonkeyprojects/SwarmUI`
- open the folder and run `launch-windows.bat`

# Installing on Linux

- Install `git`, `python3` via your OS package manager if they are not already installed (make sure to include `pip` and `venv` on distros that do not include them in python directly)
    - For example, on recent Ubuntu versions, `sudo apt install git python3-pip python3-venv`
- Download [the install-linux.sh file](https://github.com/mcmonkeyprojects/SwarmUI/releases/download/0.6.5-Beta/install-linux.sh), store it somewhere you want to install at, and run it
    - If you like terminals, you can open a terminal to the folder and run the following commands:
        - `wget https://github.com/mcmonkeyprojects/SwarmUI/releases/download/0.6.5-Beta/install-linux.sh -O install-linux.sh`
        - `chmod +x install-linux.sh`
- Run the `./install-linux.sh` script, it will install everything for you and eventually open the webpage in your browser.
- Follow the install instructions on-page.

- You can at any time in the future run the `launch-linux.sh` script to re-launch Swarm.
- If the page doesn't open itself, you can manually open `http://localhost:7801`

# Alternate Manual Linux Install

- Install `git`, `python3` via your OS package manager if they are not already installed (make sure to include `pip` and `venv` on distros that do not include them in python directly)
    - For example, on recent Ubuntu versions, `sudo apt install git python3-pip python3-venv`
    - You'll want Python 3.11. Things should also work fine with 3.10 or 3.12. Do not use 3.13.
- Install DotNET 8 using the instructions at https://dotnet.microsoft.com/en-us/download/dotnet/8.0 (you need `dotnet-sdk-8.0`, as that includes all relevant sub-packages)
    - Some users [have said](https://github.com/Stability-AI/StableSwarmUI/pull/6) that certain Linux distros expect `aspnet-runtime` to be installed separately
- Open a shell terminal and `cd` to a directory you want to install into
- Run shell commands:
    - `git clone https://github.com/mcmonkeyprojects/SwarmUI`
    - cd `SwarmUI`
    - `./launch-linux.sh`
    - or if running on a headless server, `./launch-linux.sh --launch_mode none --host 0.0.0.0` and/or swap host for [cloudflared](/docs/Advanced%20Usage.md)
- open `http://localhost:7801/Install` (if it doesn't launch itself)
- Follow the install instructions on-page.

(TODO): Maybe outlink a dedicated document with per-distro details and whatever. Maybe also make a one-click installer for Linux?

# Installing on Mac

> **Note**: You can only run SwarmUI on Mac computers with M-Series Apple silicon processors (eg M1, M2, ...).

- Open Terminal.
- Ensure your `brew` packages are updated with `brew update`.
- Verify your `brew` installation with `brew doctor`. You should not see any error in the command output.
- Install .NET for macOS: `brew install dotnet`.
- If you don't have Python, install it: `brew install python@3.11` and `brew install virtualenv`
    - Python 3.11, 3.10, 3.12 are all fine. 3.13 is not, do not use 3.13.
- Change the directory (`cd`) to the folder where you want to install SwarmUI.
- Clone the SwarmUI GitHub repository: `git clone https://github.com/mcmonkeyprojects/SwarmUI`.
- `cd SwarmUI` and run the installation script: `./launch-macos.sh`.

The installation starts now and downloads the Stable Diffusion models from the internet. Depending on your internet connection, this may take several minutes. Wait for your web browser to open the SwarmUI window.

> During the SwarmUI installation, you are prompted for the type of backend you want to use. For Mac computers with M1 or M2, you can safely choose the ComfyUI backend and choose the Stable Diffusion XL Base and Refiner models in the Download Models screen.

# Installing With Docker

See [Docs/Docker.md](/docs/Docker.md) for detailed instructions on using SwarmUI in Docker.

# Documentation

See [the documentation folder](/docs/README.md).

# Motivations

The "Swarm" name is in reference to the original key function of the UI: enabling a 'swarm' of GPUs to all generate images for the same user at once (especially for large grid generations). This is just the feature that inspired the name and not the end all of what Swarm is.

The overall goal of SwarmUI is to a be full-featured one-stop-shop for all things Stable Diffusion.

See [the motivations document](/docs/Motivations.md) for motivations on technical choices.

# Legal

This project:
- embeds a copy of [7-zip](https://7-zip.org/download.html) (LGPL).
- has the ability to auto-install [ComfyUI](https://github.com/comfyanonymous/ComfyUI) (GPL).
- has the option to use as a backend [AUTOMATIC1111/stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) (AGPL).
- can automatically install [christophschuhmann/improved-aesthetic-predictor](https://github.com/christophschuhmann/improved-aesthetic-predictor) (Apache2) and [yuvalkirstain/PickScore](https://github.com/yuvalkirstain/PickScore) (MIT).
- can automatically install [git-for-windows](https://git-scm.com/download/win) (GPLv2).
- can automatically install MIT/BSD/Apache2/PythonSoftwareFoundation pip packages: [spandrel](https://pypi.org/project/spandrel/), [dill](https://pypi.org/project/dill/), [imageio-ffmpeg](https://pypi.org/project/imageio-ffmpeg/), [opencv-python-headless](https://pypi.org/project/opencv-python-headless/), [matplotlib](https://pypi.org/project/matplotlib/), [rembg](https://pypi.org/project/rembg/), [kornia](https://pypi.org/project/kornia/), [Cython](https://pypi.org/project/Cython/)
- can automatically install [ultralytics](https://github.com/ultralytics/ultralytics) (AGPL) for `YOLOv8` face detection (ie `SwarmYoloDetection` node or `<segment:yolo-...>` syntax usage may become subject to AGPL terms),
- can automatically install [insightface](https://github.com/deepinsight/insightface) (MIT) for `IP Adapter - Face` support
- uses [JSON.NET](https://github.com/JamesNK/Newtonsoft.Json) (MIT), [FreneticUtilities](https://github.com/FreneticLLC/FreneticUtilities) (MIT), [LiteDB](https://github.com/mbdavid/LiteDB) (MIT), [ImageSharp](https://github.com/SixLabors/ImageSharp/) (Apache2 under open-source Split License)
- embeds copies of web assets from [BootStrap](https://getbootstrap.com/) (MIT), [Select2](https://select2.org/) (MIT), [JQuery](https://jquery.com/) (MIT), [exifr](https://github.com/MikeKovarik/exifr) (MIT).
- contains some icons from [Cristian Munoz](https://www.figma.com/community/file/1311159026125960259/7000-free-ui-icons) (CC-BY-4.0), the font [inter by rsms](https://github.com/rsms/inter) (OFL), [Unifont by GNU](https://unifoundry.com/unifont/) (OFL), [Material Symbols Outlined by Google](https://fonts.google.com/icons) (Apache2).
- can be used to install some custom node packs, which have individual license notices for any non-pure-FOSS licenses before install.
- supports user-built extensions which may have their own licenses or legal conditions.

SwarmUI itself is under the MIT license, however some usages may be affected by the GPL variant licenses of connected projects list above, and note that any models used have their own licenses.

### Previous License

(For updates prior to June 2024)

The MIT License (MIT)
Copyright (c) 2024 Stability AI

### License

The MIT License (MIT)

Copyright (c) 2024-2025 Alex "mcmonkey" Goodwin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
