import torch
import numpy as np
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


def add_mask_padding(mask: np.ndarray, padding: int = 0) -> np.ndarray:
    """Expand a mask boundary by dilating outward."""
    if padding <= 0:
        return mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (padding * 2 + 1, padding * 2 + 1))
    return cv2.dilate(mask, kernel, iterations=1)


class SwarmSam2MaskPostProcess:
    """Post-processes a SAM2 segmentation mask with hole-filling and padding."""

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask": ("MASK",),
            },
            "optional": {
                "fill_holes": ("BOOLEAN", {"default": True}),
                "hole_kernel_size": ("INT", {"default": 5, "min": 1, "max": 21, "step": 2}),
                "mask_padding": ("INT", {"default": 0, "min": 0, "max": 256, "step": 1}),
            },
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "process"
    CATEGORY = "SAM2"

    def process(self, mask, fill_holes=True, hole_kernel_size=5, mask_padding=0):
        out_list = []
        for i in range(mask.shape[0]):
            m = mask[i].cpu().numpy()
            m_uint8 = (m * 255).astype(np.uint8)
            if fill_holes:
                m_uint8 = fill_mask_holes(m_uint8, kernel_size=hole_kernel_size)
            if mask_padding > 0:
                m_uint8 = add_mask_padding(m_uint8, padding=mask_padding)
            out_list.append(torch.from_numpy(m_uint8.astype(np.float32) / 255.0))
        return (torch.stack(out_list, dim=0),)


NODE_CLASS_MAPPINGS = {
    "SwarmSam2MaskPostProcess": SwarmSam2MaskPostProcess,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SwarmSam2MaskPostProcess": "SAM2 Mask Post-Process (Fill Holes + Padding)",
}
