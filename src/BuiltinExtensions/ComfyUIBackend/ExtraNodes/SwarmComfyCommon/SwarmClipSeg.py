import torch
from PIL import Image
import numpy as np
from transformers import CLIPSegProcessor, CLIPSegForImageSegmentation
import folder_paths
import os, requests

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
                print(f"[SwarmClipSeg] Downloading '{file}'...")
                f.write(requests.get(f"{urlbase}{file}").content)


def fallback_mask(mask, fallback_region):
    if fallback_region == "none":
        return mask
    result = torch.zeros_like(mask)
    height = result.shape[-2]
    width = result.shape[-1]
    def fill(x0, y0, x1, y1):
        ix0 = max(0, min(width - 1, int(width * x0)))
        iy0 = max(0, min(height - 1, int(height * y0)))
        ix1 = max(ix0 + 1, min(width, int(width * x1)))
        iy1 = max(iy0 + 1, min(height, int(height * y1)))
        result[..., iy0:iy1, ix0:ix1] = 1.0
    if fallback_region == "face":
        fill(0.30, 0.03, 0.70, 0.30)
    elif fallback_region == "hands":
        fill(0.02, 0.34, 0.33, 0.78)
        fill(0.67, 0.34, 0.98, 0.78)
    elif fallback_region == "breasts":
        fill(0.25, 0.24, 0.75, 0.52)
    elif fallback_region == "genitals":
        fill(0.32, 0.45, 0.68, 0.70)
    elif fallback_region == "butt":
        fill(0.25, 0.42, 0.75, 0.72)
    elif fallback_region == "feet":
        fill(0.18, 0.76, 0.82, 0.99)
    return result


class SwarmClipSeg:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "match_text": ("STRING", {"multiline": True, "tooltip": "A short description (a few words) to describe something within the image to find and mask."}),
                "threshold": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step":0.01, "round": False, "tooltip": "Threshold to apply to the mask, higher values will make the mask more strict. Without sufficient thresholding, CLIPSeg may include random stray content around the edges."}),
            },
            "optional": {
                "fallback_region": (["none", "face", "hands", "breasts", "genitals", "butt", "feet"], {"default": "none", "tooltip": "Optional conservative body-region fallback to use when CLIPSeg produces an empty mask."}),
            }
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK",)
    FUNCTION = "seg"
    DESCRIPTION = "Segment an image using CLIPSeg, creating a mask of what part of an image appears to match the given text."

    def seg(self, images, match_text, threshold, fallback_region="none"):
        # TODO: Batch support?
        i = 255.0 * images[0].cpu().numpy()
        img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
        # TODO: Cache the model in RAM in some way?
        path = get_path() + "/clipseg-rd64-refined-fp16-safetensors/"
        download_model(path, "https://huggingface.co/mcmonkey/clipseg-rd64-refined-fp16/resolve/main/")
        processor = CLIPSegProcessor.from_pretrained(path)
        model = CLIPSegForImageSegmentation.from_pretrained(path)
        with torch.no_grad():
            mask = model(**processor(text=match_text, images=img, return_tensors="pt", padding=True))[0]
        mask = torch.nn.functional.threshold(mask.sigmoid(), threshold, 0)
        mask -= mask.min()
        max = mask.max()
        if max <= 0:
            mask = fallback_mask(mask, fallback_region)
            max = mask.max()
        if max > 0:
            mask /= max
        while mask.ndim < 4:
            mask = mask.unsqueeze(0)
        mask = torch.nn.functional.interpolate(mask, size=(images.shape[1], images.shape[2]), mode="bilinear").squeeze(0)
        return (mask,)

NODE_CLASS_MAPPINGS = {
    "SwarmClipSeg": SwarmClipSeg,
}
