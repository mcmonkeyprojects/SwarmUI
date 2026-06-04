# AMD Radeon GPU Support in SwarmUI

Swarm automatically installs proper-ish support for AMD Radeon graphics cards when you first install, and will prompt you to confirm during the install process.

This is driven by ROCm, AMD's AI accelerator internals (the equivalent to Nvidia CUDA), via a pytorch version compiled for it. Because this pytorch version is a direct compatibility port, logs from torch will generally still say 'cuda' where in fact rocm is in use.

It is important to know that AMD is infamous for much worse software and driver support than nvidia. Things will simply be much harder to get working at all, much less well. Some features simply won't work, or will have noticeably worse performance. If you have a choice, get an nvidia GPU.

Documentation specific to AMD is a bit limited, subject matter experts able to contribute here are needed.

## Mixed Nvidia and AMD

Mixing Nvidia and AMD installs on one machine is messy. You will need to install separate backends for each. If you install one version of Swarm for AMD and one for Nvidia, you can launch both and link the two together.

## Using Multiple AMD GPUs

Nvidia GPUs have simple numerical indices, but AMD GPUs have more complicated IDs. The [Using More GPUs](/docs/Using%20More%20GPUs.md) information generally applies, but you'll have to be more careful with the `GPU_ID` input.
(TODO: Specific guidance?)

## Common Issues

## General Boot Errors

The first thing to do with an error on an AMD Radeon GPU is ensure your AMD/Radeon drivers are fully up to date. (They get very version-sensitive.)

### Unsupported GPU Model

AMD's ROCm Drivers only support some of the common AMD GPUs, particularly recent ones. Older ones are not well supported.

You can sometimes fix this by telling AMD to target a different HSA GFX version by setting an environment variable of `HSA_OVERRIDE_GFX_VERSION=10.3.0`, see [Command Line Arguments: Environment Variables](/docs/Command%20Line%20Arguments.md#environment-variables-envvars) for more info on how to set this.

### Fatal Exception on Backend Boot

This is marked by `Windows fatal exception: access violation`, usually with a stack starting `SwarmUI\dlbackend\comfy\python_embeded\Lib\site-packages\torch\cuda\__init__.py", line 182 in is_available`

This may be solved via the HSA_OVERRIDE flag above?
(TODO: need an AMD expert to verify what correct guidance here is?)

### RDNA Nightlies

If you have an integrated AMD GPU, you can try the RDNA nightly builds explained [in the Comfy docs](https://github.com/Comfy-Org/ComfyUI#amd-gpus-experimental-windows-and-linux-rdna-3-35-and-4-only), see also [troubleshooting guide to installing custom pip packages](/docs/Troubleshooting.md#i-need-to-install-something-with-pip)
