import os

import folder_paths
import numpy as np
import torch
from PIL import Image


MODEL_ID = "IDEA-Research/grounding-dino-base"
MODEL_CACHE = {}


def get_path():
    if "groundingdino" in folder_paths.folder_names_and_paths:
        paths = folder_paths.folder_names_and_paths["groundingdino"]
        return paths[0][0]
    path = os.path.dirname(os.path.realpath(__file__)) + "/models/groundingdino"
    return path


def make_fallback_boxes(width, height, fallback_region, max_detections):
    regions = {
        "face": [(0.30, 0.03, 0.70, 0.30)],
        "hands": [(0.02, 0.34, 0.33, 0.78), (0.67, 0.34, 0.98, 0.78)],
        "breasts": [(0.25, 0.24, 0.75, 0.52)],
        "genitals": [(0.32, 0.45, 0.68, 0.70)],
        "butt": [(0.25, 0.42, 0.75, 0.72)],
        "feet": [(0.18, 0.76, 0.82, 0.99)],
    }
    source = regions.get(fallback_region, [(0.15, 0.15, 0.85, 0.85)])
    boxes = []
    for region in source[:max(1, max_detections)]:
        x0 = max(0, min(width - 1, int(width * region[0])))
        y0 = max(0, min(height - 1, int(height * region[1])))
        x1 = max(x0 + 1, min(width, int(width * region[2])))
        y1 = max(y0 + 1, min(height, int(height * region[3])))
        boxes.append([float(x0), float(y0), float(x1), float(y1)])
    return boxes


def clean_labels(text):
    labels = []
    for raw in text.replace("|", ".").split("."):
        label = raw.strip()
        if label:
            labels.append(label)
    return labels or [text.strip() or "subject"]


def make_query(text):
    labels = clean_labels(text)
    cleaned = [label.lower().rstrip(".") for label in labels]
    return ". ".join(cleaned) + "."


def load_model():
    if MODEL_ID in MODEL_CACHE:
        return MODEL_CACHE[MODEL_ID]
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor
    import comfy.model_management

    cache_dir = os.path.join(get_path(), "huggingface")
    os.makedirs(cache_dir, exist_ok=True)
    processor = AutoProcessor.from_pretrained(MODEL_ID, cache_dir=cache_dir)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(MODEL_ID, cache_dir=cache_dir)
    device = comfy.model_management.get_torch_device()
    model = model.to(device)
    model.eval()
    MODEL_CACHE[MODEL_ID] = (processor, model, device)
    return MODEL_CACHE[MODEL_ID]


class SwarmGroundingDinoDetection:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "text": ("STRING", {"multiline": True, "tooltip": "Text label to detect in the image."}),
                "threshold": ("FLOAT", {"default": 0.25, "min": 0.0, "max": 1.0, "step": 0.01, "round": False}),
                "max_detections": ("INT", {"default": 1, "min": 1, "max": 16, "step": 1}),
            },
            "optional": {
                "fallback_region": (["none", "face", "hands", "breasts", "genitals", "butt", "feet"], {"default": "none"}),
            },
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("BBOX", "BOOLEAN")
    RETURN_NAMES = ("bboxes", "found_detection")
    FUNCTION = "detect"
    DESCRIPTION = "Detect text-grounded bounding boxes with GroundingDINO for SAM2 segmentation."

    def detect(self, image, text, threshold, max_detections, fallback_region="none"):
        i = 255.0 * image[0].cpu().numpy()
        img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
        width, height = img.size
        fallback_boxes = make_fallback_boxes(width, height, fallback_region, max_detections)
        try:
            processor, model, device = load_model()
            query = make_query(text)
            inputs = processor(images=img, text=query, return_tensors="pt")
            inputs = inputs.to(device)
            with torch.no_grad():
                outputs = model(**inputs)
            try:
                results = processor.post_process_grounded_object_detection(
                    outputs,
                    inputs.input_ids,
                    box_threshold=threshold,
                    text_threshold=threshold,
                    target_sizes=[(height, width)],
                )
            except TypeError:
                results = processor.post_process_grounded_object_detection(
                    outputs,
                    inputs.input_ids,
                    threshold=threshold,
                    text_threshold=threshold,
                    target_sizes=[(height, width)],
                )
            if not results:
                print(f"[SwarmGroundingDino] No detection result for '{text}', using fallback region '{fallback_region}'.")
                return (fallback_boxes, False)
            boxes = results[0].get("boxes", [])
            scores = results[0].get("scores", [])
            candidates = []
            for index in range(len(boxes)):
                score = float(scores[index]) if len(scores) > index else 0.0
                box = boxes[index].detach().cpu().tolist()
                candidates.append((score, [float(box[0]), float(box[1]), float(box[2]), float(box[3])]))
            candidates.sort(key=lambda item: item[0], reverse=True)
            selected = [box for _, box in candidates[:max(1, max_detections)]]
            if not selected:
                print(f"[SwarmGroundingDino] No boxes for '{text}', using fallback region '{fallback_region}'.")
                selected = fallback_boxes
                return (selected, False)
            return (selected, True)
        except Exception as ex:
            print(f"[SwarmGroundingDino] Detection failed for '{text}', using fallback region '{fallback_region}': {ex}")
            return (fallback_boxes, False)


NODE_CLASS_MAPPINGS = {
    "SwarmGroundingDinoDetection": SwarmGroundingDinoDetection,
}
