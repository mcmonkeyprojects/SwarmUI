import comfy.model_management
import safetensors.torch
import torch, os, comfy, json

# ATTRIBUTION: This code is a mix of code from kohya-ss, comfy, and Swarm. It would be annoying to disentangle but it's all FOSS and relatively short so it's fine.

CLAMP_QUANTILE = 0.99
def extract_lora(diff, rank):
    conv2d = (len(diff.shape) == 4)
    kernel_size = None if not conv2d else diff.size()[2:4]
    conv2d_3x3 = conv2d and kernel_size != (1, 1)
    out_dim, in_dim = diff.size()[0:2]
    rank = min(rank, in_dim, out_dim)

    if conv2d:
        if conv2d_3x3:
            diff = diff.flatten(start_dim=1)
        else:
            diff = diff.squeeze()

    U, S, Vh = torch.linalg.svd(diff.float(), full_matrices=False)
    U = U[:, :rank]
    S = S[:rank]
    U = U @ torch.diag(S)
    Vh = Vh[:rank, :]

    dist = torch.cat([U.flatten(), Vh.flatten()])
    hi_val = torch.quantile(dist, CLAMP_QUANTILE)
    low_val = -hi_val

    U = U.clamp(low_val, hi_val)
    Vh = Vh.clamp(low_val, hi_val)
    if conv2d:
        U = U.reshape(out_dim, rank, 1, 1)
        Vh = Vh.reshape(rank, in_dim, kernel_size[0], kernel_size[1])
    return (U, Vh)


def do_lora_handle(base_data, other_data, rank, callback):
    out_data = {}
    device = comfy.model_management.get_torch_device()
    for key in base_data.keys():
        callback()
        if key not in other_data:
            continue
        if key.endswith(".weight_scale") or key.endswith(".comfy_quant"):
            continue
        base_tensor = base_data[key]
        other_tensor = other_data[key]
        fixed_key = key
        if key.endswith(".weight"):
            fixed_key = key[:-len(".weight")]
            scale_key = f"{fixed_key}.weight_scale"
            if scale_key in base_data:
                scale = base_data[scale_key]
                base_tensor = base_tensor.to(dtype=torch.bfloat16) * scale
            if scale_key in other_data:
                scale = other_data[scale_key]
                other_tensor = other_tensor.to(dtype=torch.bfloat16) * scale
        elif key.endswith(".bias") or key.endswith(".scale") or key.endswith(".lin"):
            fixed_key = key
        if base_tensor.shape != other_tensor.shape:
            print(f"discard mismatched shapes {base_tensor.shape} != {other_tensor.shape}")
            continue
        target_dtype = base_tensor.dtype
        if target_dtype == torch.float8_e4m3fn or target_dtype == torch.float8_e5m2:
            target_dtype = torch.bfloat16
        base_tensor = base_tensor.to(dtype=target_dtype)
        other_tensor = other_tensor.to(dtype=target_dtype)
        diff = other_tensor.to(device, dtype=torch.float32) - base_tensor.to(device, dtype=torch.float32)
        other_tensor = other_tensor.cpu()
        base_tensor = base_tensor.cpu()
        max_diff = float(diff.abs().max())
        if max_diff < 1e-4:
            print(f"discard unaltered key {key} ({max_diff})")
            continue
        if len(base_tensor.shape) >= 2 and base_tensor.numel() > 1024:
            print(f"extract key {key} (shape={base_tensor.shape}, maxdiff={max_diff}, numel={base_tensor.numel()})")
            out = extract_lora(diff, rank)
            up = out[0].contiguous().to(dtype=target_dtype).cpu()
            down = out[1].contiguous().to(dtype=target_dtype).cpu()
            if up.isnan().any() or up.isinf().any():
                print(f"bad data for {key}.lora_up.weight")
                continue
            if down.isnan().any() or down.isinf().any():
                print(f"bad data for {key}.lora_down.weight")
                continue
            out_data[f"diffusion_model.{fixed_key}.lora_up.weight"] = up
            out_data[f"diffusion_model.{fixed_key}.lora_down.weight"] = down
        else:
            print(f"simple diff key {key} (shape={base_tensor.shape}, maxdiff={max_diff}, numel={base_tensor.numel()})")
            out = diff.contiguous().to(dtype=target_dtype).cpu()
            if out.isnan().any() or out.isinf().any():
                print(f"bad data for {key}")
                continue
            out_data[f"diffusion_model.{fixed_key}.diff"] = out


    return out_data

class SwarmExtractLora:
    def __init__(self):
        self.loaded_lora = None

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "base_model": ("MODEL", ),
                "other_model": ("MODEL", ),
                "rank": ("INT", {"default": 16, "min": 1, "max": 320}),
                "save_rawpath": ("STRING", {"multiline": False}),
                "save_filename": ("STRING", {"multiline": False}),
                "metadata": ("STRING", {"multiline": True}),
            }
        }

    CATEGORY = "SwarmUI/models"
    RETURN_TYPES = ()
    FUNCTION = "extract_lora"
    OUTPUT_NODE = True
    DESCRIPTION = "Internal node, do not use directly - extracts a LoRA from the difference between two models. This is used by SwarmUI Utilities tab."

    def extract_lora(self, base_model, other_model, rank, save_rawpath, save_filename, metadata):
        base_data = base_model.model_state_dict()
        other_data = other_model.model_state_dict()
        def clean_key(k):
            if k.startswith("model."):
                k = k[len("model."):]
            if k.startswith("diffusion_model."):
                k = k[len("diffusion_model."):]
            return k
        base_data = {clean_key(k): v for k, v in base_data.items()}
        other_data = {clean_key(k): v for k, v in other_data.items()}
        key_count = len(base_data.keys())
        pbar = comfy.utils.ProgressBar(key_count)
        class Helper:
            steps = 0
            def callback(self):
                self.steps += 1
                pbar.update_absolute(self.steps, key_count, None)
        helper = Helper()
        out_data = do_lora_handle(base_data, other_data, rank, lambda: helper.callback())

        # Can't easily autodetect all the correct modelspec info, but at least supply some basics
        out_metadata = {
            "modelspec.title": f"(Extracted LoRA) {save_filename}",
            "modelspec.description": f"LoRA extracted in SwarmUI"
        }
        if metadata:
            out_metadata.update(json.loads(metadata))
        path = f"{save_rawpath}{save_filename}.safetensors"
        print(f"saving to path {path}")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        safetensors.torch.save_file(out_data, path, metadata=out_metadata)
        return ()

NODE_CLASS_MAPPINGS = {
    "SwarmExtractLora": SwarmExtractLora,
}
