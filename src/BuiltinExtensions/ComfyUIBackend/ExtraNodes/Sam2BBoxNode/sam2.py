"""
SAM 2 segmentation utilities
Provides model loading and inference for interactive segmentation
"""

import numpy as np
from PIL import Image
from io import BytesIO
from typing import List, Tuple
from pathlib import Path
from ultralytics import SAM
import torch
import cv2

# Global model cache
_model_cache = {}

# Models directory
MODELS_DIR = Path(__file__).parent.parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

# Detect GPU availability
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(
    f"CUDA version (compiled): {torch.version.cuda if torch.version.cuda else 'None'}"
)
print(
    f"cuDNN version: {torch.backends.cudnn.version() if torch.backends.cudnn.is_available() else 'None'}"
)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"SAM 2 will use device: {DEVICE}")
if DEVICE == "cuda":
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(
        f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB"
    )
else:
    print("⚠️ Running on CPU - segmentation will be slower")
    print(
        "To enable GPU: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121"
    )


def get_sam_model(model_name: str = "sam2_b.pt") -> SAM:
    """
    Load and cache SAM 2 model with GPU support

    Args:
        model_name: Model name (sam2_b.pt, sam2_l.pt, sam2_s.pt, sam2_t.pt)

    Returns:
        SAM model instance
    """
    if model_name not in _model_cache:
        model_path = MODELS_DIR / model_name

        # If model doesn't exist locally, ultralytics will auto-download it
        # Just use the model name without .pt extension for auto-download
        if not model_path.exists():
            print(f"Model not found at {model_path}")
            print(f"Ultralytics will auto-download {model_name} to cache...")
            # Use just the model name (e.g., 'sam2_b.pt') - ultralytics handles download
            model = SAM(model_name)
        else:
            print(f"Loading SAM model from: {model_path} on {DEVICE}")
            model = SAM(str(model_path))

        # Move model to GPU if available
        if DEVICE == "cuda":
            model.to(DEVICE)
        _model_cache[model_name] = model
        print(f"SAM model loaded: {model_name} on {DEVICE}")

    return _model_cache[model_name]


def clear_model_cache():
    """Clear the model cache to force reload"""
    global _model_cache
    _model_cache = {}


def fill_mask_holes(mask: np.ndarray, kernel_size: int = 5) -> np.ndarray:
    """
    Fill small holes in a binary mask using morphological operations

    Args:
        mask: Binary mask as numpy array (H, W) or (H, W, C) with values 0 or 255
        kernel_size: Size of the morphological kernel (larger = fills bigger holes)

    Returns:
        Cleaned mask with holes filled
    """
    # Squeeze to remove any single-dimensional entries and ensure 2D
    mask = np.squeeze(mask)
    if mask.ndim == 0:
        # Scalar case - shouldn't happen but handle it
        return np.array([[255]], dtype=np.uint8)
    if mask.ndim > 2:
        # If still 3D+, take first channel
        mask = mask[:, :, 0]
    
    # Ensure mask is uint8 with values 0 or 255
    if mask.dtype != np.uint8:
        if mask.dtype == bool or (mask.max() <= 1 and mask.dtype in [np.float32, np.float64]):
            mask = (mask * 255).astype(np.uint8)
        else:
            mask = mask.astype(np.uint8)
    
    # Create a kernel for morphological operations
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))

    # Morphological closing: dilation followed by erosion
    # This fills small holes while preserving the outer boundary
    closed_mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # Optional: Fill any remaining interior holes using flood fill
    # This catches larger holes that closing might miss
    filled_mask = closed_mask.copy()
    h, w = filled_mask.shape

    # Create a slightly larger canvas for flood fill
    canvas = np.zeros((h + 2, w + 2), dtype=np.uint8)
    canvas[1:-1, 1:-1] = filled_mask

    # Flood fill from the border to mark the background
    cv2.floodFill(canvas, None, (0, 0), 128)

    # Extract the filled region (anything not marked as background is foreground)
    filled_mask = np.where(canvas[1:-1, 1:-1] == 128, 0, 255).astype(np.uint8)

    return filled_mask


def add_mask_padding(mask: np.ndarray, padding: int = 10) -> np.ndarray:
    """
    Add padding to a mask by dilating it outward

    This expands the mask boundary, which is useful for inpainting to:
    - Include border pixels for better blending
    - Provide more context around the masked area
    - Avoid hard edges at the mask boundary

    Args:
        mask: Binary mask as numpy array (H, W) with values 0 or 255
        padding: Number of pixels to expand the mask (kernel size for dilation)

    Returns:
        Dilated mask with padding added
    """
    if padding <= 0:
        return mask

    # Create a circular/elliptical kernel for smooth expansion
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (padding * 2 + 1, padding * 2 + 1)
    )

    # Dilate the mask to expand it outward
    padded_mask = cv2.dilate(mask, kernel, iterations=1)

    return padded_mask


def predict_mask_from_points(
    image_bytes: bytes,
    points: List[Tuple[int, int]],
    labels: List[int],
    model_name: str = "sam2_b.pt",
    fill_holes: bool = True,
    kernel_size: int = 5,
    padding: int = 0,
) -> np.ndarray:
    """
    Generate segmentation mask from point prompts

    Args:
        image_bytes: Image data as bytes
        points: List of (x, y) coordinates for prompts
        labels: List of labels (1 for foreground, 0 for background)
        model_name: SAM model to use
        fill_holes: Whether to fill small holes in the mask
        kernel_size: Size of morphological kernel for hole filling
        padding: Number of pixels to expand the mask boundary (0 = no padding)

    Returns:
        Binary mask as numpy array (H, W) with values 0 or 255
    """
    # Load image
    img = Image.open(BytesIO(image_bytes))
    img_array = np.array(img)

    # Get cached model (now that wrapping is fixed, caching works properly)
    model = get_sam_model(model_name)

    # Convert points and labels to numpy arrays
    points_array = np.array(points, dtype=np.float32)
    labels_array = np.array(labels, dtype=np.int32)

    print(f"Predicting with {len(points)} points: {points_array}")
    print(f"Labels: {labels_array}")

    # IMPORTANT: Wrap points and labels in an extra list dimension
    # This tells SAM that all points belong to ONE object
    # points=[[[x1,y1], [x2,y2]]] instead of [[x1,y1], [x2,y2]]
    points_wrapped = [points_array.tolist()]
    labels_wrapped = [labels_array.tolist()]

    print(f"Wrapped points: {points_wrapped}")
    print(f"Wrapped labels: {labels_wrapped}")

    # Run prediction with point prompts
    results = model(
        img_array, points=points_wrapped, labels=labels_wrapped, verbose=False
    )

    # Extract mask from results
    if (
        len(results) > 0
        and hasattr(results[0], "masks")
        and results[0].masks is not None
    ):
        # Get the first mask
        mask = results[0].masks.data[0].cpu().numpy()
        # Convert to uint8 (0 or 255)
        mask = (mask * 255).astype(np.uint8)
        print(
            f"Generated mask with shape: {mask.shape}, unique values: {np.unique(mask)}, sum: {mask.sum()}"
        )

        # Fill holes if requested
        if fill_holes:
            print(f"Filling holes in mask with kernel size {kernel_size}")
            mask = fill_mask_holes(mask, kernel_size)

        # Add padding if requested
        if padding > 0:
            print(f"Adding {padding}px padding to mask")
            mask = add_mask_padding(mask, padding)

        return mask

    # Return empty mask if no result
    print("No mask generated!")
    return np.zeros(img_array.shape[:2], dtype=np.uint8)


def predict_mask_from_bboxes(
    image_bytes: bytes,
    bboxes: List[float],
    model_name: str = "sam2_b.pt",
    fill_holes: bool = True,
    kernel_size: int = 5,
    padding: int = 0,
) -> np.ndarray:
    """
    Generate segmentation mask from bounding box prompt

    Args:
        image_bytes: Image data as bytes
        bboxes: Bounding box as [x1, y1, x2, y2]
        model_name: SAM model to use
        fill_holes: Whether to fill small holes in the mask
        kernel_size: Size of morphological kernel for hole filling
        padding: Number of pixels to expand the mask boundary (0 = no padding)

    Returns:
        Binary mask as numpy array (H, W) with values 0 or 255
    """
    # Load image
    img = Image.open(BytesIO(image_bytes))
    img_array = np.array(img)

    # Get cached model
    model = get_sam_model(model_name)

    print(f"Predicting with bounding box: {bboxes}")

    # Run prediction with bboxes prompt
    # SAM expects bboxes as a list: [x1, y1, x2, y2]
    results = model(img_array, bboxes=bboxes, verbose=False)

    # Extract mask from results
    if (
        len(results) > 0
        and hasattr(results[0], "masks")
        and results[0].masks is not None
    ):
        # Get the first mask
        mask = results[0].masks.data[0].cpu().numpy()
        # Convert to uint8 (0 or 255)
        mask = (mask * 255).astype(np.uint8)
        print(
            f"Generated mask with shape: {mask.shape}, unique values: {np.unique(mask)}, sum: {mask.sum()}"
        )

        # Fill holes if requested
        if fill_holes:
            print(f"Filling holes in mask with kernel size {kernel_size}")
            mask = fill_mask_holes(mask, kernel_size)

        # Add padding if requested
        if padding > 0:
            print(f"Adding {padding}px padding to mask")
            mask = add_mask_padding(mask, padding)

        return mask

    # Return empty mask if no result
    print("No mask generated!")
    return np.zeros(img_array.shape[:2], dtype=np.uint8)


