import torch, struct, json
from io import BytesIO
import latent_preview, comfy
from server import PromptServer
from comfy.model_base import SDXL, SVD_img2vid, Flux, Flux2, WAN21, Chroma
from comfy import samplers, nested_tensor
import numpy as np
from math import ceil
from latent_preview import TAESDPreviewerImpl
from comfy_execution.utils import get_executing_context
from comfy_extras.nodes_flux import Flux2Scheduler

def slerp(val, low, high):
    low_norm = low / torch.norm(low, dim=1, keepdim=True)
    high_norm = high / torch.norm(high, dim=1, keepdim=True)
    dot = (low_norm * high_norm).sum(1)
    if dot.mean() > 0.9995:
        return low * val + high * (1 - val)
    omega = torch.acos(dot)
    so = torch.sin(omega)
    res = (torch.sin((1.0 - val) * omega) / so).unsqueeze(1) * low + (torch.sin(val * omega) / so).unsqueeze(1) * high
    return res


def swarm_partial_noise(seed, latent_image):
    generator = torch.manual_seed(seed)
    return torch.randn(latent_image.size(), dtype=latent_image.dtype, layout=latent_image.layout, generator=generator, device="cpu")


def swarm_fixed_noise_inner(seed, latent_image, var_seed, var_seed_strength):
    noises = []
    for i in range(latent_image.size()[0]):
        if var_seed_strength > 0:
            noise = swarm_partial_noise(seed, latent_image[i])
            var_noise = swarm_partial_noise(var_seed + i, latent_image[i])
            if noise.ndim == 4: # Video models are B C F H W, we're in a B loop already so sub-iterate over F (Frames)
                for j in range(noise.shape[1]):
                    noise[:, j] = slerp(var_seed_strength, noise[:, j], var_noise[:, j])
            else:
                noise = slerp(var_seed_strength, noise, var_noise)
        else:
            noise = swarm_partial_noise(seed + i, latent_image[i])
        noises.append(noise)
    return torch.stack(noises, dim=0)


def swarm_fixed_noise(seed, latent_image, var_seed, var_seed_strength):
    if latent_image.is_nested:
        tensors = latent_image.unbind()
        noises = []
        for t in tensors:
            noises.append(swarm_fixed_noise_inner(seed, t, var_seed, var_seed_strength))
        return nested_tensor.NestedTensor(noises)
    else:
        return swarm_fixed_noise_inner(seed, latent_image, var_seed, var_seed_strength)


def get_preview_metadata():
    executing_context = get_executing_context()
    prompt_id = None
    node_id = None
    if executing_context is not None:
        prompt_id = executing_context.prompt_id
        node_id = executing_context.node_id
    if prompt_id is None:
        prompt_id = PromptServer.instance.last_prompt_id
    if node_id is None:
        node_id = PromptServer.instance.last_node_id
    return {"node_id": node_id, "prompt_id": prompt_id, "display_node_id": node_id, "parent_node_id": node_id, "real_node_id": node_id} # display_node_id, parent_node_id, real_node_id? comfy_execution/progress.py has this.


def swarm_send_extra_preview(id, image):
    server = PromptServer.instance
    metadata = get_preview_metadata()
    metadata["mime_type"] = "image/jpeg"
    metadata["id"] = id
    metadata_json = json.dumps(metadata).encode('utf-8')
    bytesIO = BytesIO()
    image.save(bytesIO, format="JPEG", quality=90, compress_level=4)
    image_bytes = bytesIO.getvalue()
    combined_data = bytearray()
    combined_data.extend(struct.pack(">I", len(metadata_json)))
    combined_data.extend(metadata_json)
    combined_data.extend(image_bytes)
    server.send_sync(9999123, combined_data, sid=server.client_id)


def swarm_send_animated_preview(id, images):
    server = PromptServer.instance
    bytesIO = BytesIO()
    images[0].save(bytesIO, save_all=True, duration=int(1000.0/6), append_images=images[1 : len(images)], lossless=False, quality=60, method=0, format='WEBP')
    bytesIO.seek(0)
    image_bytes = bytesIO.getvalue()
    metadata = get_preview_metadata()
    metadata["mime_type"] = "image/webp"
    metadata["id"] = id
    metadata_json = json.dumps(metadata).encode('utf-8')
    combined_data = bytearray()
    combined_data.extend(struct.pack(">I", len(metadata_json)))
    combined_data.extend(metadata_json)
    combined_data.extend(image_bytes)
    server.send_sync(9999123, combined_data, sid=server.client_id)


def calculate_sigmas_scheduler(model, scheduler_name, steps, sigma_min, sigma_max, rho):
    model_sampling = model.get_model_object("model_sampling")
    if scheduler_name == "karras":
        return comfy.k_diffusion.sampling.get_sigmas_karras(n=steps, sigma_min=sigma_min if sigma_min >= 0 else float(model_sampling.sigma_min), sigma_max=sigma_max if sigma_max >= 0 else float(model_sampling.sigma_max), rho=rho)
    elif scheduler_name == "exponential":
        return comfy.k_diffusion.sampling.get_sigmas_exponential(n=steps, sigma_min=sigma_min if sigma_min >= 0 else float(model_sampling.sigma_min), sigma_max=sigma_max if sigma_max >= 0 else float(model_sampling.sigma_max))
    else:
        return None


def make_swarm_sampler_callback(steps, device, model, previews):
    previewer = latent_preview.get_previewer(device, model.model.latent_format) if previews != "none" else None
    pbar = comfy.utils.ProgressBar(steps)
    def callback(step, x0, x, total_steps):
        pbar.update_absolute(step + 1, total_steps, None)
        if previewer:
            if (step == 0 or (step < 3 and x0.ndim == 5 and x0.shape[1] > 8)) and not isinstance(previewer, TAESDPreviewerImpl):
                x0 = x0.clone().cpu() # Sync copy to CPU for first few steps to prevent reading old data, more steps for videos. Future steps allow comfy to do its async non_blocky stuff.
            if x0.ndim == 5:
                # video shape is [batch, channels, backwards time, width, height], for previews needs to be swapped to [forwards time, channels, width, height]
                x0 = x0[0].permute(1, 0, 2, 3)
                x0 = torch.flip(x0, [0])
            def do_preview(id, index):
                preview_img = previewer.decode_latent_to_preview_image("JPEG", x0[index:index+1])
                swarm_send_extra_preview(id, preview_img[1])
            if previews == "iterate":
                do_preview(0, step % x0.shape[0])
            elif previews == "animate":
                if x0.shape[0] == 1:
                    do_preview(0, 0)
                else:
                    images = []
                    for i in range(x0.shape[0]):
                        preview_img = previewer.decode_latent_to_preview_image("JPEG", x0[i:i+1])
                        images.append(preview_img[1])
                    swarm_send_animated_preview(0, images)
            elif previews == "default":
                for i in range(x0.shape[0]):
                    preview_img = previewer.decode_latent_to_preview_image("JPEG", x0[i:i+1])
                    swarm_send_extra_preview(i, preview_img[1])
            elif previews == "one":
                do_preview(0, 0)
            elif previews == "second":
                do_preview(0, 1 % x0.shape[0])
    return callback


def loglinear_interp(t_steps, num_steps):
    """
    Performs log-linear interpolation of a given array of decreasing numbers.
    """
    xs = np.linspace(0, 1, len(t_steps))
    ys = np.log(t_steps[::-1])

    new_xs = np.linspace(0, 1, num_steps)
    new_ys = np.interp(new_xs, xs, ys)

    interped_ys = np.exp(new_ys)[::-1].copy()
    return interped_ys


AYS_NOISE_LEVELS = {
    "SD1": [14.6146412293, 6.4745760956,  3.8636745985,  2.6946151520, 1.8841921177,  1.3943805092,  0.9642583904,  0.6523686016, 0.3977456272,  0.1515232662,  0.0291671582],
    "SDXL":[14.6146412293, 6.3184485287,  3.7681790315,  2.1811480769, 1.3405244945,  0.8620721141,  0.5550693289,  0.3798540708, 0.2332364134,  0.1114188177,  0.0291671582],
    "SVD": [700.00, 54.5, 15.886, 7.977, 4.248, 1.789, 0.981, 0.403, 0.173, 0.034, 0.002],
    # Flux and Wan from https://github.com/comfyanonymous/ComfyUI/pull/7584
    "Flux": [0.9968, 0.9886, 0.9819, 0.975, 0.966, 0.9471, 0.9158, 0.8287, 0.5512, 0.2808, 0.001],
    "Flux2": [1.0, 0.6509, 0.4374, 0.2932, 0.1893, 0.1108, 0.0495, 0.00031], # https://huggingface.co/fal/FLUX.2-dev-Turbo#usage
    "Wan": [1.0, 0.997, 0.995, 0.993, 0.991, 0.989, 0.987, 0.985, 0.98, 0.975, 0.973, 0.968, 0.96, 0.946, 0.927, 0.902, 0.864, 0.776, 0.539, 0.208, 0.001],
    # https://github.com/comfyanonymous/ComfyUI/commit/08ff5fa08a92e0b3f23b9abec979a830a6cffb03#diff-3e4e70e402dcd9e1070ad71ef9292277f10d9faccf36a1c405c0c717a7ee6485R23
    "Chroma": [0.992, 0.99, 0.988, 0.985, 0.982, 0.978, 0.973, 0.968, 0.961, 0.953, 0.943, 0.931, 0.917, 0.9, 0.881, 0.858, 0.832, 0.802, 0.769, 0.731, 0.69, 0.646, 0.599, 0.55, 0.501, 0.451, 0.402, 0.355, 0.311, 0.27, 0.232, 0.199, 0.169, 0.143, 0.12, 0.101, 0.084, 0.07, 0.058, 0.048, 0.001]
}


def split_latent_tensor(latent_tensor, tile_size=1024, scale_factor=8):
    """Generate tiles for a given latent tensor, considering the scaling factor."""
    latent_tile_size = tile_size // scale_factor  # Adjust tile size for latent space
    height, width = latent_tensor.shape[-2:]

    # Determine the number of tiles needed
    num_tiles_x = ceil(width / latent_tile_size)
    num_tiles_y = ceil(height / latent_tile_size)

    # If width or height is an exact multiple of the tile size, add an additional tile for overlap
    if width % latent_tile_size == 0:
        num_tiles_x += 1
    if height % latent_tile_size == 0:
        num_tiles_y += 1

    # Calculate the overlap
    overlap_x = 0 if num_tiles_x == 1 else (num_tiles_x * latent_tile_size - width) / (num_tiles_x - 1)
    overlap_y = 0 if num_tiles_y == 1 else (num_tiles_y * latent_tile_size - height) / (num_tiles_y - 1)
    if overlap_x < 32 and num_tiles_x > 1:
        num_tiles_x += 1
        overlap_x = (num_tiles_x * latent_tile_size - width) / (num_tiles_x - 1)
    if overlap_y < 32 and num_tiles_y > 1:
        num_tiles_y += 1
        overlap_y = (num_tiles_y * latent_tile_size - height) / (num_tiles_y - 1)

    tiles = []

    for i in range(num_tiles_y):
        for j in range(num_tiles_x):
            x_start = j * latent_tile_size - j * overlap_x
            y_start = i * latent_tile_size - i * overlap_y

            # Correct for potential float precision issues
            x_start = round(x_start)
            y_start = round(y_start)

            # Crop the tile from the latent tensor
            tile_tensor = latent_tensor[..., y_start:y_start + latent_tile_size, x_start:x_start + latent_tile_size]
            tiles.append(((x_start, y_start, x_start + latent_tile_size, y_start + latent_tile_size), tile_tensor))

    return tiles


def stitch_latent_tensors(original_size, tiles, scale_factor=8):
    """Stitch tiles together to create the final upscaled latent tensor with overlaps."""
    result = torch.zeros(original_size)

    # We assume tiles come in the format [(coordinates, tile), ...]
    sorted_tiles = sorted(tiles, key=lambda x: (x[0][1], x[0][0]))  # Sort by upper then left

    # Variables to keep track of the current row's starting point
    current_row_upper = None

    for (left, upper, right, lower), tile in sorted_tiles:

        # Check if we're starting a new row
        if current_row_upper != upper:
            current_row_upper = upper
            first_tile_in_row = True
        else:
            first_tile_in_row = False

        tile_width = right - left
        tile_height = lower - upper
        feather = tile_width // 8  # Assuming feather size is consistent with the example

        mask = torch.ones_like(tile)

        if not first_tile_in_row:  # Left feathering for tiles other than the first in the row
            for t in range(feather):
                mask[..., :, t:t+1] *= (1.0 / feather) * (t + 1)

        if upper != 0:  # Top feathering for all tiles except the first row
            for t in range(feather):
                mask[..., t:t+1, :] *= (1.0 / feather) * (t + 1)

        # Apply the feathering mask
        combined_area = tile * mask + result[..., upper:lower, left:right] * (1.0 - mask)
        result[..., upper:lower, left:right] = combined_area

    return result


class SwarmKSampler:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "noise_seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.5, "round": 0.001}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, ),
                "scheduler": (["turbo", "align_your_steps", "ltxv", "ltxv-image", "flux2"] + comfy.samplers.KSampler.SCHEDULERS, ),
                "positive": ("CONDITIONING", ),
                "negative": ("CONDITIONING", ),
                "latent_image": ("LATENT", ),
                "start_at_step": ("INT", {"default": 0, "min": 0, "max": 10000}),
                "end_at_step": ("INT", {"default": 10000, "min": 0, "max": 10000}),
                "var_seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "var_seed_strength": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.05, "round": 0.001}),
                "sigma_max": ("FLOAT", {"default": -1, "min": -1.0, "max": 1000.0, "step":0.01, "round": False}),
                "sigma_min": ("FLOAT", {"default": -1, "min": -1.0, "max": 1000.0, "step":0.01, "round": False}),
                "rho": ("FLOAT", {"default": 7.0, "min": 0.0, "max": 100.0, "step":0.01, "round": False}),
                "add_noise": (["enable", "disable"], ),
                "return_with_leftover_noise": (["disable", "enable"], ),
                "previews": (["default", "none", "one", "second", "iterate", "animate"], ),
                "tile_sample": ("BOOLEAN", {"default": False}),
                "tile_size": ("INT", {"default": 1024, "min": 256, "max": 4096}),
            }
        }

    CATEGORY = "SwarmUI/sampling"
    RETURN_TYPES = ("LATENT",)
    FUNCTION = "run_sampling"
    DESCRIPTION = "Works like a vanilla Comfy KSamplerAdvanced, but with extra inputs for advanced features such as sigma scale, tiling, previews, etc."

    def sample(self, model, noise_seed, steps, cfg, sampler_name, scheduler, positive, negative, latent_image, start_at_step, end_at_step, var_seed, var_seed_strength, sigma_max, sigma_min, rho, add_noise, return_with_leftover_noise, previews):
        device = comfy.model_management.get_torch_device()
        latent_samples = latent_image["samples"]
        latent_samples = comfy.sample.fix_empty_latent_channels(model, latent_samples)
        disable_noise = add_noise == "disable"

        if disable_noise:
            noise = torch.zeros(latent_samples.size(), dtype=latent_samples.dtype, layout=latent_samples.layout, device="cpu")
        else:
            noise = swarm_fixed_noise(noise_seed, latent_samples, var_seed, var_seed_strength)

        noise_mask = None
        if "noise_mask" in latent_image:
            noise_mask = latent_image["noise_mask"]

        sigmas = None
        if scheduler == "turbo":
            timesteps = torch.flip(torch.arange(1, 11) * 100 - 1, (0,))[:steps]
            sigmas = model.model.model_sampling.sigma(timesteps)
            sigmas = torch.cat([sigmas, sigmas.new_zeros([1])])
        elif scheduler == "ltx" or scheduler == "ltxv-image":
            from comfy_extras.nodes_lt import LTXVScheduler
            sigmas = LTXVScheduler.execute(steps, 2.05, 0.95, True, 0.1, latent_image if scheduler == "ltxv-image" else None).result[0]
        elif scheduler == "flux2":
            width = latent_image["samples"].shape[-1]
            height = latent_image["samples"].shape[-2]
            sigmas = Flux2Scheduler.execute(steps, width * 16, height * 16).result[0]
        elif scheduler == "align_your_steps":
            if isinstance(model.model, SDXL):
                model_type = "SDXL"
            elif isinstance(model.model, SVD_img2vid):
                model_type = "SVD"
            elif isinstance(model.model, Flux):
                model_type = "Flux"
            elif isinstance(model.model, Flux2):
                model_type = "Flux2"
            elif isinstance(model.model, WAN21):
                model_type = "Wan"
            elif isinstance(model.model, Chroma):
                model_type = "Chroma"
            else:
                print(f"AlignYourSteps: Unknown model type: {type(model.model)}, defaulting to SD1")
                model_type = "SD1"
            sigmas = AYS_NOISE_LEVELS[model_type][:]
            if (steps + 1) != len(sigmas):
                sigmas = loglinear_interp(sigmas, steps + 1)
            sigmas[-1] = 0
            sigmas = torch.FloatTensor(sigmas)
        elif sigma_min >= 0 and sigma_max >= 0 and scheduler in ["karras", "exponential"]:
            if sampler_name in ['dpm_2', 'dpm_2_ancestral']:
                sigmas = calculate_sigmas_scheduler(model, scheduler, steps + 1, sigma_min, sigma_max, rho)
                sigmas = torch.cat([sigmas[:-2], sigmas[-1:]])
            else:
                sigmas = calculate_sigmas_scheduler(model, scheduler, steps, sigma_min, sigma_max, rho)
            sigmas = sigmas.to(device)
        
        out = latent_image.copy()
        if steps > 0:
            callback = make_swarm_sampler_callback(steps, device, model, previews)

            samples = comfy.sample.sample(model, noise, steps, cfg, sampler_name, scheduler, positive, negative, latent_samples,
                                    denoise=1.0, disable_noise=disable_noise, start_step=start_at_step, last_step=end_at_step,
                                    force_full_denoise=return_with_leftover_noise == "disable", noise_mask=noise_mask, sigmas=sigmas, callback=callback, seed=noise_seed)
            out["samples"] = samples
        return (out, )

    # tiled sample version of sample function
    def tiled_sample(self, model, noise_seed, steps, cfg, sampler_name, scheduler, positive, negative, latent_image, start_at_step, end_at_step, var_seed, var_seed_strength, sigma_max, sigma_min, rho, add_noise, return_with_leftover_noise, previews, tile_size):
        out = latent_image.copy()
        # split image into tiles
        latent_samples = latent_image["samples"]
        tiles = split_latent_tensor(latent_samples, tile_size=tile_size)
        # resample each tile using self.sample
        resampled_tiles = []
        for coords, tile in tiles:
            resampled_tile = self.sample(model, noise_seed, steps, cfg, sampler_name, scheduler, positive, negative, {"samples": tile}, start_at_step, end_at_step, var_seed, var_seed_strength, sigma_max, sigma_min, rho, add_noise, return_with_leftover_noise, previews)
            resampled_tiles.append((coords, resampled_tile[0]["samples"]))
        # stitch the tiles to get the final upscaled image
        result = stitch_latent_tensors(latent_samples.shape, resampled_tiles)
        out["samples"] = result
        return (out,)

    def run_sampling(self, model, noise_seed, steps, cfg, sampler_name, scheduler, positive, negative, latent_image, start_at_step, end_at_step, var_seed, var_seed_strength, sigma_max, sigma_min, rho, add_noise, return_with_leftover_noise, previews, tile_sample,  tile_size):
        if tile_sample:
            return self.tiled_sample(model, noise_seed, steps, cfg, sampler_name, scheduler, positive, negative, latent_image, start_at_step, end_at_step, var_seed, var_seed_strength, sigma_max, sigma_min, rho, add_noise, return_with_leftover_noise, previews, tile_size)
        else:
            return self.sample(model, noise_seed, steps, cfg, sampler_name, scheduler, positive, negative, latent_image, start_at_step, end_at_step, var_seed, var_seed_strength, sigma_max, sigma_min, rho, add_noise, return_with_leftover_noise, previews)


NODE_CLASS_MAPPINGS = {
    "SwarmKSampler": SwarmKSampler,
}
