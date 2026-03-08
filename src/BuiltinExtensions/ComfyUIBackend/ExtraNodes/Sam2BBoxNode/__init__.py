import json
import torch
import numpy as np
from PIL import Image
from io import BytesIO

from .sam2 import (
    predict_mask_from_points,
    predict_mask_from_bboxes,
    crop_image_with_mask,
    remove_background,
)


class Sam2BBoxFromJson:
    """Converts a JSON bounding box string '[x1,y1,x2,y2]' into a BBOX type
    that can be passed directly to Sam2Segmentation's bboxes input."""

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
        # coords = [x1, y1, x2, y2]
        # BBOX type is a list of [x1, y1, x2, y2] lists (one per box)
        return ([[float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3])]],)


class Sam2PointSegmentation:
    """SAM2 segmentation using point prompts with hole-filling"""

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "points_json": ("STRING", {"multiline": True}),
                "model_name": (["sam2_b.pt", "sam2_l.pt", "sam2_s.pt", "sam2_t.pt"], {"default": "sam2_b.pt"}),
            },
            "optional": {
                "fill_holes": ("BOOLEAN", {"default": True}),
                "hole_kernel_size": ("INT", {"default": 5, "min": 1, "max": 21, "step": 2}),
                "mask_padding": ("INT", {"default": 0, "min": 0, "max": 50}),
            }
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "segment"
    CATEGORY = "SAM2"

    def segment(self, image, points_json, model_name, fill_holes=True, hole_kernel_size=5, mask_padding=0):
        """
        Generate segmentation mask from point prompts
        
        Points JSON format: [
            {"x": 100, "y": 200, "label": 1},
            {"x": 150, "y": 250, "label": 0}
        ]
        where label: 1 = foreground, 0 = background
        """
        # Parse points from JSON
        try:
            points_data = json.loads(points_json)
            if not isinstance(points_data, list):
                raise ValueError("Points must be a JSON array")
            
            points = [(p["x"], p["y"]) for p in points_data]
            labels = [p.get("label", 1) for p in points_data]
        except Exception as e:
            raise ValueError(f"Invalid points JSON: {e}")

        # Convert image to bytes
        img_pil = Image.fromarray((image[0].cpu().numpy() * 255).astype(np.uint8))
        img_buffer = BytesIO()
        img_pil.save(img_buffer, format="JPEG")
        image_bytes = img_buffer.getvalue()

        # Generate mask using helper function
        mask = predict_mask_from_points(
            image_bytes,
            points,
            labels,
            model_name=model_name,
            fill_holes=fill_holes,
            kernel_size=hole_kernel_size,
            padding=mask_padding,
        )

        # Convert to tensor format (B, H, W)
        mask_tensor = torch.from_numpy(mask).float() / 255.0
        return (mask_tensor.unsqueeze(0),)


class Sam2BBoxSegmentation:
    """SAM2 segmentation using bounding box prompts with hole-filling"""

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "bbox_json": ("STRING", {"multiline": True}),
                "model_name": (["sam2_b.pt", "sam2_l.pt", "sam2_s.pt", "sam2_t.pt"], {"default": "sam2_b.pt"}),
            },
            "optional": {
                "fill_holes": ("BOOLEAN", {"default": True}),
                "hole_kernel_size": ("INT", {"default": 5, "min": 1, "max": 21, "step": 2}),
                "mask_padding": ("INT", {"default": 0, "min": 0, "max": 50}),
            }
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "segment"
    CATEGORY = "SAM2"

    def segment(self, image, bbox_json, model_name, fill_holes=True, hole_kernel_size=5, mask_padding=0):
        """
        Generate segmentation mask from bounding box prompt
        
        BBox JSON format: [x1, y1, x2, y2] or [[x1, y1, x2, y2], ...]
        """
        # Parse bbox from JSON
        try:
            bbox_data = json.loads(bbox_json)
            if isinstance(bbox_data[0], (list, tuple)):
                bboxes = bbox_data[0]  # Multiple boxes
            else:
                bboxes = bbox_data  # Single box
        except Exception as e:
            raise ValueError(f"Invalid bbox JSON: {e}")

        # Convert image to bytes
        img_pil = Image.fromarray((image[0].cpu().numpy() * 255).astype(np.uint8))
        img_buffer = BytesIO()
        img_pil.save(img_buffer, format="JPEG")
        image_bytes = img_buffer.getvalue()

        # Generate mask using helper function
        mask = predict_mask_from_bboxes(
            image_bytes,
            bboxes,
            model_name=model_name,
            fill_holes=fill_holes,
            kernel_size=hole_kernel_size,
            padding=mask_padding,
        )

        # Convert to tensor format (B, H, W)
        mask_tensor = torch.from_numpy(mask).float() / 255.0
        return (mask_tensor.unsqueeze(0),)


class Sam2MaskPostProcess:
    """Post-process SAM2 masks: crop to bounds, remove background, etc."""

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
            },
            "optional": {
                "operation": (["crop_to_mask", "remove_background"], {"default": "crop_to_mask"}),
                "padding_pixels": ("INT", {"default": 0, "min": 0, "max": 100}),
                "aspect_ratio": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("result", "info")
    FUNCTION = "process"
    CATEGORY = "SAM2"

    def process(self, image, mask, operation, padding_pixels=0, aspect_ratio=1.0):
        """Post-process masks: crop or remove background"""
        # Convert image to bytes
        img_pil = Image.fromarray((image[0].cpu().numpy() * 255).astype(np.uint8))
        img_buffer = BytesIO()
        img_pil.save(img_buffer, format="JPEG")
        image_bytes = img_buffer.getvalue()

        # Convert mask to numpy (0 or 255)
        mask_np = (mask[0].cpu().numpy() * 255).astype(np.uint8)

        if operation == "crop_to_mask":
            target_ratio = aspect_ratio if aspect_ratio != 1.0 else None
            result_bytes, info_dict = crop_image_with_mask(
                image_bytes,
                mask_np,
                padding_pixels=padding_pixels,
                target_aspect_ratio=target_ratio,
            )
            result_img = Image.open(BytesIO(result_bytes))
        else:  # remove_background
            result_bytes = remove_background(image_bytes, mask_np)
            result_img = Image.open(BytesIO(result_bytes)).convert("RGB")
            info_dict = {"operation": "background_removed"}

        # Convert back to tensor
        result_tensor = torch.from_numpy(np.array(result_img)).float() / 255.0
        if result_tensor.ndim == 2:
            result_tensor = result_tensor.unsqueeze(-1).repeat(1, 1, 3)

        return (result_tensor.unsqueeze(0), json.dumps(info_dict))


NODE_CLASS_MAPPINGS = {
    "Sam2BBoxFromJson": Sam2BBoxFromJson,
    "Sam2PointSegmentation": Sam2PointSegmentation,
    "Sam2BBoxSegmentation": Sam2BBoxSegmentation,
    "Sam2MaskPostProcess": Sam2MaskPostProcess,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Sam2BBoxFromJson": "SAM2 BBox From JSON",
    "Sam2PointSegmentation": "SAM2 Point Segmentation",
    "Sam2BBoxSegmentation": "SAM2 BBox Segmentation",
    "Sam2MaskPostProcess": "SAM2 Mask Post-Process",
}
