import json

import numpy as np
import torch
import cv2


def fill_mask_holes(mask: np.ndarray, kernel_size: int = 5) -> np.ndarray:
    """Fill small holes in a binary mask using morphological close + flood fill."""
    mask = np.squeeze(mask)
    if mask.ndim == 0:
        return np.array([[255]], dtype=np.uint8)
    if mask.ndim > 2:
        mask = mask[:, :, 0]
    if mask.dtype != np.uint8:
        if mask.dtype == bool or (mask.max() <= 1 and mask.dtype in [np.float32, np.float64]):
            mask = (mask * 255).astype(np.uint8)
        else:
            mask = mask.astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    closed_mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    filled_mask = closed_mask.copy()
    h, w = filled_mask.shape
    canvas = np.zeros((h + 2, w + 2), dtype=np.uint8)
    canvas[1:-1, 1:-1] = filled_mask
    cv2.floodFill(canvas, None, (0, 0), 128)
    filled_mask = np.where(canvas[1:-1, 1:-1] == 128, 0, 255).astype(np.uint8)
    return filled_mask


class Sam2BBoxFromJson:
    """Converts a JSON bounding box string '[x1,y1,x2,y2]' into a BBOX type."""

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "bbox_json": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("BBOX",)
    RETURN_NAMES = ("bboxes",)
    FUNCTION = "convert"
    CATEGORY = "SAM2"

    def convert(self, bbox_json):
        coords = json.loads(bbox_json)
        return ([[float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3])]],)


class SwarmSam2MaskPostProcess:
    """Post-processes a SAM2 segmentation mask with hole-filling."""

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask": ("MASK",),
            },
            "optional": {
                "fill_holes": ("BOOLEAN", {"default": True}),
                "hole_kernel_size": ("INT", {"default": 5, "min": 1, "max": 21, "step": 2}),
            },
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "process"
    CATEGORY = "SAM2"

    def process(self, mask, fill_holes=True, hole_kernel_size=5):
        out_list = []
        for i in range(mask.shape[0]):
            m = mask[i].cpu().numpy()
            m_uint8 = (m * 255).astype(np.uint8)
            if fill_holes:
                m_uint8 = fill_mask_holes(m_uint8, kernel_size=hole_kernel_size)
            out_list.append(torch.from_numpy(m_uint8.astype(np.float32) / 255.0))
        return (torch.stack(out_list, dim=0),)


NODE_CLASS_MAPPINGS = {
    "Sam2BBoxFromJson": Sam2BBoxFromJson,
    "SwarmSam2MaskPostProcess": SwarmSam2MaskPostProcess,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Sam2BBoxFromJson": "SAM2 BBox From JSON",
    "SwarmSam2MaskPostProcess": "SAM2 Mask Post-Process (Fill Holes)",
}