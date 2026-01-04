# Troubleshooting Issues in SwarmUI

First of all: when in doubt, restart. The tried and true classic of solving IT problems is as true in SwarmUI as anywhere else - when you restart, a lot of problems solve themselves.

Second, feel free to open [issues here on GitHub](https://github.com/mcmonkeyprojects/SwarmUI/issues) or ask on [the SwarmUI Discord](https://discord.gg/q2y38cqjNw) where we have a `#help-forum` available for questions. These are also both great places to search for if anyone else has had the same problem before and already gotten an answer.

## Install Issues

### NuGet Errors

If you see an error message mentioning a failed connection to `https://api.nuget.org/v3/index.json`, such as `Unable to load the service index for source https://api.nuget.org/v3/index.json`

That is the build dependency service, connections to it are required for the first launch and when updating. To fix this:
- **A:** Ensure your network is enabled, not blocked by firewalls, VPNs, whatever. If you have anything like that running, disable it and try again. (Usually these aren't a problem but sometimes they can do weird things to your network)
- **B:** Sometimes temporary internet outages are at fault. So just waiting a few hours or until tomorrow and trying again might be all you need.
- **C:** It might also help to restart your computer.
- **D:** You can also try emptying your NuGet cache, see below

If you see errors like:
- `The type or namespace name 'Hardware' could not be found (are you missing a using directive or an assembly reference?) [src/SwarmUI.csproj]`, noting the mention of `Hardware` specifically (this is a NuGet package)
- `The type or namespace name 'Image<>' does not exist in the namespace 'SixLabors.ImageSharp'`

that might mean your NuGet cache is corrupt. This is rare, but can happen. In that case, you must reset your NuGet cache.

#### Reset NuGet Cache

If on Windows:
- open File Explorer to `%appdata%/NuGet` and delete the entire folder
- open `%localappdata%/NuGet` and delete that all
- open `%userprofile%/.nuget` and delete the `packages` folder

If on Linux/Mac, `rm -rf ~/.nuget`

## AMD On Windows

If you have an AMD (Radeon) GPU on Windows, AMD's "ROCm" library only recently added Windows support, and it is very feature-limited. As such, it tends to run a bit poorly, and only support only a certain subset of popular recent AMD GPUs.

It will run better if you use Linux instead of Windows. You can install Linux as a dualboot to run AI software on Linux but otherwise swap back to Windows for everything else. Linux drivers for AMD are much more reliable than the Windows ones.

As time goes on it's likely the Windows drivers will become more stable.

## Common Error Messages

### AssertionError: Torch not compiled with CUDA enabled

The message `AssertionError: Torch not compiled with CUDA enabled` means that python dependencies of Swarm's comfy backend have been mangled. This most often happens when custom nodes or packages have poorly built requirements files. You'll see issues like this most frequently if you often allow Comfy Manager to install nodepacks.

**So how do I fix it?** The concept is easy, just the details vary. You need to reinstall torch, which means you need to trigger a pip install of: `torch torchvision torchaudio -U --index-url https://download.pytorch.org/whl/cu128` (the cu128 is CUDA version and may change over time, refer to [PyTorch's Website](https://pytorch.org/get-started/locally/) for updated index-url options). Note the usage of `-U` to tell pip to upgrade/replace the existing torch. To see how to install pip packages, refer to [I need to install something with pip](#i-need-to-install-something-with-pip) below.

### fatal: detected dubious ownership in repository at '...'

The message `fatal: detected dubious ownership in repository at` is a relatively common error from git, indicating that you are trying to install Swarm on an improper drive. Most commonly this is an external drive (eg a USB flash drive).

Swarm needs to be installed on a standard system drive. On Windows, this means any NTFS formatted drive, such as your 'C:' drive or any secondary internal drive.

## I Have An Error Message And Don't Know What To Do

Step 1 is read the error message. A lot of error messages in Swarm are intentionally written in clear plain English to tell you exactly what went wrong and how to fix it. Sometimes it's not clear enough or you'll get an internal error without good info, so:

Step 2 is copy/paste the error message and search [GitHub](https://github.com/mcmonkeyprojects/SwarmUI/issues) and [Discord](https://discord.gg/q2y38cqjNw). Chances are you'll find somebody else has posted the same error message before and gotten an answer explaining what to do.

If both of those don't get you an instant easy answer, time for a bit more effort: Step 3 is go to `Server` -> `Logs` -> probably set `ViewType` to `Debug`, and look over the error details. Sometimes the full details of an error can give you the info you need to solve it yourself.

If you can't solve it yourself from there, Step 4 is either post on [GitHub](https://github.com/mcmonkeyprojects/SwarmUI/issues) or [Discord](https://discord.gg/q2y38cqjNw) (in `#help-forum`). When you're making a post, click the `Pastebin` button on the `Logs` tab, to automatically generate a full clean pastebin of the Logs, and include the link it gives you in your post (It's important to do it this way to ensure the full log is included, as the info at the top of the log when Swarm is booting up is often important, and that button goes to a specific pastebin server that provides color highlighting and all to make it easy to read for those looking at it to help you with it), also include details about what you're trying (what parameters are you using? What are you clicking on? Does a problem happen right away or only halfway through generating an image, or...?). It also helps to add a screenshot of your UI when the error happens.

## I Need To Install Something With Pip

So you have a pip dependency issue, eh? These usually happen from playing around with custom nodes too much, but sometimes can happen from updates. For the most part, when you stay on the "beaten path" of Swarm, this shouldn't come up. If you haven't been specifically told you need to install a pip package, you probably shouldn't do this.

When you need to install a pip dependency, you're gonna have to use the command line. The precise method depends on your OS (Windows vs Linux/Mac).

### Windows:

- Open a command line in `(Your Swarm Install)\dlbackend\comfy`
- type the command `python_embeded\python.exe -s -m pip install (your package)`
    - For example `python_embeded\python.exe -s -m pip install transformers -U` (if you got a message saying you need to reinstall `transformers`, such as the "`ImportError: huggingface-hub ...`" error message)

### Linux/Mac:

- Open a command line in `(Your Swarm Install)/dlbackend/ComfyUI/`
- activate the venv with `source venv/bin/activate`
- type the command `python -s -m pip install (your package)`
    - For example `python -s -m pip install transformers -U`
- For Docker, you'll want to explicitly call `./venv/bin/python -s -m pip install (your package)`

### Note

If you're an advanced user familiar with command line usage and/or with a custom python env, you can adapt the specifics as needed, just make note of the `python -s -m pip` syntax: that `-s` tells python to store the installed package in your current env. Without this (if you eg use just `pip install ...`) it may link to packages that are in your OS global install, which tends to cause a lot of issues. So, avoid that with `-s`.

## I Want To Reinstall SwarmUI

The easiest way to reinstall, is just:
- Close SwarmUI
- Rename the Swarm folder to `Old_SwarmUI`
- run the installer again, fully, until you get to a working Generate tab
- close SwarmUI
- copy/move over any files you want from Old to new.
    - Notably, you probably want to move back in: `Data`, `Models`, `Output`
- Then relaunch SwarmUI

However, if you want an "in-place reinstall":
- Close SwarmUI
- Move out the `SwarmUI/dlbackend` folder somewhere. This contains ComfyUI and anything saved in it, which may include eg workflows or past outputs. This is the most important part for Swarm to rebuild, but you should move not delete so you can restore any files you need.
- Also move or delete everything inside `SwarmUI/src/BuiltinExtensions/ComfyUIBackend/DLNodes`
- Open the `SwarmUI/Data` folder, and delete `Backends.fds`
- In the same Data folder, edit `Settings.fds` in any text editor, find `IsInstalled: true` and change it to `IsInstalled: false`, and save
- launch SwarmUI again. It will show you the usual installation interface.

Most importantly after reinstalling:
- Do not repeat whatever actions led to things breaking so bad you needed the reinstall in the first place!
- The most common reason for a total reinstall is overusage of Comfy Manager leading to a corrupted comfy backend installation. If this is the case for you, either avoid Manager, or just be much more cautious about when to use it in the future.

## Model Issues

### Newly Supported Model Isn't Working

If you're trying a new model class that Swarm supports, but it's not working, the most common cause is: you forgot to update first! So, update SwarmUI via the Server Info tab.
- If you have updated already SwarmUI, but you downloaded the model before that update, you can hit Utilities -> Reset All Metadata, which will cause Swarm to re-scan the model and re-detect what architecture it uses.
- If that doesn't fix it, look in the Models tab of the Generate tab. Is the `Type:` listed correct? If not, hit the `☰` hamburger menu then `Edit Metadata`, then change the Architecture to the correct value for the model.

## Other

If you have some other troubleshooting issue you think should be listed here, let me know on [the SwarmUI Discord](https://discord.gg/q2y38cqjNw).

<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>
