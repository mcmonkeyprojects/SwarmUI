import torch
from PIL import Image
import numpy as np
from transformers import CLIPSegProcessor, CLIPSegForImageSegmentation
import folder_paths
import os, requests
import time

_CLIPSEG_PROCESSOR = None
_CLIPSEG_MODEL = None
_CLIPSEG_DEVICE = None

def get_path():
    if "clipseg" in folder_paths.folder_names_and_paths:
        paths = folder_paths.folder_names_and_paths["clipseg"]
        return paths[0][0]
    else:
        # Jank backup path if you're not running properly in Swarm
        path = os.path.dirname(os.path.realpath(__file__)) + "/models"
        return path


# Manual download of the model from a safetensors conversion.
# Done manually to guarantee it's only a safetensors file ever and not a pickle
def download_model(path, urlbase):
    if os.path.exists(path):
        return
    for file in ["config.json", "merges.txt", "model.safetensors", "preprocessor_config.json", "special_tokens_map.json", "tokenizer_config.json", "vocab.json"]:
        os.makedirs(path, exist_ok=True)
        filepath = path + file
        if not os.path.exists(filepath):
            with open(filepath, "wb") as f:
                print(f"[SwarmClipSeg] Downloading '{file}'...", flush=True)
                f.write(requests.get(f"{urlbase}{file}").content)

def get_inference_device():
    try:
        import comfy
        return comfy.model_management.get_torch_device()
    except Exception:
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")

def move_inputs_to_device(inputs, device):
    if hasattr(inputs, "to"):
        return inputs.to(device)
    return {k: (v.to(device) if torch.is_tensor(v) else v) for k, v in inputs.items()}

def get_clipseg_cached():
    global _CLIPSEG_PROCESSOR, _CLIPSEG_MODEL, _CLIPSEG_DEVICE
    if _CLIPSEG_PROCESSOR is not None and _CLIPSEG_MODEL is not None and _CLIPSEG_DEVICE is not None:
        return _CLIPSEG_PROCESSOR, _CLIPSEG_MODEL, _CLIPSEG_DEVICE
    path = get_path() + "/clipseg-rd64-refined-fp16-safetensors/"
    load_start = time.perf_counter()
    download_model(path, "https://huggingface.co/mcmonkey/clipseg-rd64-refined-fp16/resolve/main/")
    _CLIPSEG_PROCESSOR = CLIPSegProcessor.from_pretrained(path, local_files_only=True)
    processor_loaded = time.perf_counter()
    _CLIPSEG_MODEL = CLIPSegForImageSegmentation.from_pretrained(path, local_files_only=True)
    model_loaded = time.perf_counter()
    _CLIPSEG_DEVICE = get_inference_device()
    _CLIPSEG_MODEL = _CLIPSEG_MODEL.to(_CLIPSEG_DEVICE)
    _CLIPSEG_MODEL.eval()
    ready_time = time.perf_counter()
    print(
        f"[SwarmClipSeg] loaded model on device: {_CLIPSEG_DEVICE} "
        f"(processor={processor_loaded - load_start:.2f}s model={model_loaded - processor_loaded:.2f}s "
        f"to_device={ready_time - model_loaded:.2f}s)",
        flush=True
    )
    return _CLIPSEG_PROCESSOR, _CLIPSEG_MODEL, _CLIPSEG_DEVICE


class SwarmClipSeg:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "match_text": ("STRING", {"multiline": True, "tooltip": "A short description (a few words) to describe something within the image to find and mask."}),
                "threshold": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step":0.01, "round": False, "tooltip": "Threshold to apply to the mask, higher values will make the mask more strict. Without sufficient thresholding, CLIPSeg may include random stray content around the edges."}),
            }
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK",)
    FUNCTION = "seg"
    DESCRIPTION = "Segment an image using CLIPSeg, creating a mask of what part of an image appears to match the given text."

    def seg(self, images, match_text, threshold):
        start_time = time.perf_counter()
        # TODO: Batch support?
        i = 255.0 * images[0].cpu().numpy()
        img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
        image_ready = time.perf_counter()
        processor, model, device = get_clipseg_cached()
        model_ready = time.perf_counter()
        inputs = processor(text=match_text, images=img, return_tensors="pt", padding=True)
        inputs_ready = time.perf_counter()
        try:
            with torch.no_grad():
                mask = model(**move_inputs_to_device(inputs, device))[0]
        except RuntimeError as ex:
            # If the selected compute device runs OOM, retry once on CPU for reliability.
            if "out of memory" in str(ex).lower() and str(device) != "cpu":
                global _CLIPSEG_DEVICE, _CLIPSEG_MODEL
                _CLIPSEG_DEVICE = torch.device("cpu")
                _CLIPSEG_MODEL = _CLIPSEG_MODEL.to(_CLIPSEG_DEVICE)
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                with torch.no_grad():
                    mask = _CLIPSEG_MODEL(**move_inputs_to_device(inputs, _CLIPSEG_DEVICE))[0]
            else:
                raise
        inference_ready = time.perf_counter()
        mask = torch.nn.functional.threshold(mask.sigmoid(), threshold, 0)
        mask -= mask.min()
        max = mask.max()
        if max > 0:
            mask /= max
        while mask.ndim < 4:
            mask = mask.unsqueeze(0)
        mask = torch.nn.functional.interpolate(mask, size=(images.shape[1], images.shape[2]), mode="bilinear").squeeze(0)
        elapsed = time.perf_counter() - start_time
        snippet = match_text.replace("\n", " ").strip()[:64]
        print(
            f"[SwarmClipSeg] seg total={elapsed:.2f}s prep={image_ready - start_time:.2f}s "
            f"cache={model_ready - image_ready:.2f}s inputs={inputs_ready - model_ready:.2f}s "
            f"infer={inference_ready - inputs_ready:.2f}s post={elapsed - (inference_ready - start_time):.2f}s "
            f"device={device} text='{snippet}'",
            flush=True
        )
        return (mask,)

NODE_CLASS_MAPPINGS = {
    "SwarmClipSeg": SwarmClipSeg,
}
