import os
import urllib.request

import cv2
import folder_paths
import numpy as np
import torch
from PIL import Image


ANATOMY_MODEL_REPO = "Felldude/Yolo11_NSFW_Nano"
ANATOMY_MODEL_FILE = "yolo_nsfw_n.pt"
ANATOMY_MODEL_URL = f"https://huggingface.co/{ANATOMY_MODEL_REPO}/resolve/main/{ANATOMY_MODEL_FILE}"
ANATOMY_MODEL_LICENSE = "AGPL-3.0"
ERAX_MODEL_REPO = "erax-ai/EraX-NSFW-V1.0"
ERAX_MODEL_FILE = "erax_nsfw_yolo11n.pt"
ERAX_MODEL_URL = f"https://huggingface.co/{ERAX_MODEL_REPO}/resolve/main/{ERAX_MODEL_FILE}"
ERAX_MODEL_LICENSE = "Apache-2.0"
SAM3_MODEL_REPO = "Comfy-Org/sam3.1"
SAM3_MODEL_FILE = "sam3.1_multiplex_fp16.safetensors"
SAM3_MODEL_URL = f"https://huggingface.co/{SAM3_MODEL_REPO}/resolve/main/checkpoints/{SAM3_MODEL_FILE}"
SAM3_MODEL_LICENSE = "Meta SAM3.1 / Comfy-Org mirror; see the Hugging Face model card for current terms."
SAPIENS2_MODEL_REPO = "facebook/sapiens2-seg-0.4b"
SAPIENS2_MODEL_FILE = "sapiens2_0.4b_seg.safetensors"
SAPIENS2_MODEL_URL = f"https://huggingface.co/{SAPIENS2_MODEL_REPO}/resolve/main/{SAPIENS2_MODEL_FILE}"
SAPIENS2_MODEL_LICENSE = "Sapiens2 License"
ANATOMY_MODEL_CACHE = {}
SAM3_MODEL_CACHE = {}
SAPIENS2_MODEL_CACHE = {}
DWPose_CACHE = {}


ANATOMY_ALIASES = {
    "breast": ["breast"],
    "breasts": ["breast"],
    "boob": ["breast"],
    "boobs": ["breast"],
    "bust": ["breast"],
    "chest": ["breast"],
    "cleavage": ["breast"],
    "female chest": ["breast"],
    "upper torso": ["breast"],
    "nipple": ["breast"],
    "nipples": ["breast"],
    "vulva": ["vulva", "vaginal"],
    "vagina": ["vulva", "vaginal"],
    "vaginal": ["vulva", "vaginal"],
    "pussy": ["vulva", "vaginal"],
    "crotch": ["vulva", "vaginal"],
    "groin": ["vulva", "vaginal"],
    "pubic": ["vulva", "vaginal"],
    "pubic area": ["vulva", "vaginal"],
    "penis": ["penis"],
    "cock": ["penis"],
    "dick": ["penis"],
    "shaft": ["penis"],
    "phallus": ["penis"],
    "butt": ["butt"],
    "buttocks": ["butt"],
    "ass": ["butt"],
    "booty": ["butt"],
    "rear": ["butt"],
    "hips": ["butt"],
    "anus": ["anal", "anus"],
    "anal": ["anal", "anus"],
    "asshole": ["anal", "anus"],
}


POSE_REGIONS = {
    "face": ["face"],
    "facial": ["face"],
    "head": ["face"],
    "eyes": ["face"],
    "eye": ["face"],
    "mouth": ["face"],
    "lips": ["face"],
    "lip": ["face"],
    "hand": ["hands"],
    "hands": ["hands"],
    "finger": ["hands"],
    "fingers": ["hands"],
    "foot": ["feet"],
    "feet": ["feet"],
    "toe": ["feet"],
    "toes": ["feet"],
    "breast": ["upper_torso"],
    "breasts": ["upper_torso"],
    "chest": ["upper_torso"],
    "cleavage": ["upper_torso"],
    "butt": ["pelvis"],
    "buttocks": ["pelvis"],
    "ass": ["pelvis"],
    "rear": ["pelvis"],
    "vulva": ["pelvis"],
    "vagina": ["pelvis"],
    "pussy": ["pelvis"],
    "crotch": ["pelvis"],
    "groin": ["pelvis"],
    "penis": ["pelvis"],
    "anal": ["pelvis"],
    "anus": ["pelvis"],
}


SAPIENS2_CLASS_NAMES = [
    "Background", "Apparel", "Eyeglass", "Face_Neck", "Hair", "Left_Foot",
    "Left_Hand", "Left_Lower_Arm", "Left_Lower_Leg", "Left_Shoe", "Left_Sock",
    "Left_Upper_Arm", "Left_Upper_Leg", "Lower_Clothing", "Right_Foot",
    "Right_Hand", "Right_Lower_Arm", "Right_Lower_Leg", "Right_Shoe",
    "Right_Sock", "Right_Upper_Arm", "Right_Upper_Leg", "Torso",
    "Upper_Clothing", "Lower_Lip", "Upper_Lip", "Lower_Teeth", "Upper_Teeth",
    "Tongue",
]


SAPIENS2_ALIASES = {
    "face": ["Face_Neck"],
    "facial": ["Face_Neck"],
    "head": ["Face_Neck", "Hair"],
    "eyes": ["Face_Neck"],
    "eye": ["Face_Neck"],
    "mouth": ["Lower_Lip", "Upper_Lip", "Lower_Teeth", "Upper_Teeth", "Tongue"],
    "lip": ["Lower_Lip", "Upper_Lip"],
    "lips": ["Lower_Lip", "Upper_Lip"],
    "hand": ["Left_Hand", "Right_Hand"],
    "hands": ["Left_Hand", "Right_Hand"],
    "finger": ["Left_Hand", "Right_Hand"],
    "fingers": ["Left_Hand", "Right_Hand"],
    "foot": ["Left_Foot", "Right_Foot", "Left_Shoe", "Right_Shoe", "Left_Sock", "Right_Sock"],
    "feet": ["Left_Foot", "Right_Foot", "Left_Shoe", "Right_Shoe", "Left_Sock", "Right_Sock"],
    "toe": ["Left_Foot", "Right_Foot"],
    "toes": ["Left_Foot", "Right_Foot"],
    "torso": ["Torso"],
    "upper torso": ["Torso", "Upper_Clothing"],
    "chest": ["Torso", "Upper_Clothing"],
    "breast": ["Torso", "Upper_Clothing"],
    "breasts": ["Torso", "Upper_Clothing"],
    "cleavage": ["Torso", "Upper_Clothing"],
    "arm": ["Left_Lower_Arm", "Left_Upper_Arm", "Right_Lower_Arm", "Right_Upper_Arm"],
    "arms": ["Left_Lower_Arm", "Left_Upper_Arm", "Right_Lower_Arm", "Right_Upper_Arm"],
    "leg": ["Left_Lower_Leg", "Left_Upper_Leg", "Right_Lower_Leg", "Right_Upper_Leg"],
    "legs": ["Left_Lower_Leg", "Left_Upper_Leg", "Right_Lower_Leg", "Right_Upper_Leg"],
}


def get_yolo_path():
    if "yolov8" in folder_paths.folder_names_and_paths:
        paths = folder_paths.folder_names_and_paths["yolov8"]
        return paths[0][0]
    return os.path.join(folder_paths.models_dir, "yolov8")


def get_checkpoint_path():
    try:
        paths = folder_paths.get_folder_paths("checkpoints")
        if paths:
            return paths[0]
    except Exception:
        pass
    return os.path.join(folder_paths.models_dir, "checkpoints")


def get_sapiens2_path():
    try:
        paths = folder_paths.get_folder_paths("sapiens2")
        if paths:
            return paths[0]
    except Exception:
        pass
    return os.path.join(folder_paths.models_dir, "sapiens2")


def empty_outputs(image):
    height = image.shape[1]
    width = image.shape[2]
    mask = torch.zeros((1, height, width), dtype=torch.float32, device="cpu")
    return ([[0.0, 0.0, float(width), float(height)]], mask, False)


def clamp_box(box, width, height):
    x0 = max(0, min(width - 1, int(box[0])))
    y0 = max(0, min(height - 1, int(box[1])))
    x1 = max(x0 + 1, min(width, int(box[2])))
    y1 = max(y0 + 1, min(height, int(box[3])))
    return [float(x0), float(y0), float(x1), float(y1)]


def boxes_to_mask(boxes, width, height):
    mask = torch.zeros((1, height, width), dtype=torch.float32, device="cpu")
    for box in boxes:
        x0, y0, x1, y1 = [int(value) for value in clamp_box(box, width, height)]
        mask[0, y0:y1, x0:x1] = 1.0
    return mask


def mask_has_area(mask):
    if mask is None:
        return False
    try:
        mask_float = mask.detach().cpu().float()
        return float(mask_float.max()) > 0.0 and float((mask_float > 0.05).sum()) > 16.0
    except Exception:
        return False


def normalize_labels(text):
    labels = []
    for raw in str(text).replace("|", ",").replace(".", ",").split(","):
        label = raw.strip().lower()
        if label:
            labels.append(label)
    return labels


def anatomy_classes_for_text(text):
    classes = []
    seen = set()
    for label in normalize_labels(text):
        mapped = ANATOMY_ALIASES.get(label, [])
        for class_name in mapped:
            if class_name not in seen:
                seen.add(class_name)
                classes.append(class_name)
    return classes


def pose_regions_for_text(text):
    regions = []
    seen = set()
    for label in normalize_labels(text):
        mapped = POSE_REGIONS.get(label, [])
        for region in mapped:
            if region not in seen:
                seen.add(region)
                regions.append(region)
    return regions


def sapiens2_class_ids_for_text(text):
    ids = []
    seen = set()
    for label in normalize_labels(text):
        for class_name in SAPIENS2_ALIASES.get(label, []):
            if class_name in SAPIENS2_CLASS_NAMES and class_name not in seen:
                seen.add(class_name)
                ids.append(SAPIENS2_CLASS_NAMES.index(class_name))
    return ids


def ensure_anatomy_model(repo=ANATOMY_MODEL_REPO, filename=ANATOMY_MODEL_FILE, url=ANATOMY_MODEL_URL, license_name=ANATOMY_MODEL_LICENSE):
    model_dir = os.path.join(get_yolo_path(), "anatomy")
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, filename)
    if os.path.exists(model_path):
        return model_path
    print(f"[SwarmAnatomyYolo] Downloading {repo}/{filename} to {model_path}. License: {license_name}.")
    print(f"[SwarmAnatomyYolo] Source: {url}")
    tmp_path = model_path + ".tmp"
    try:
        urllib.request.urlretrieve(url, tmp_path)
        os.replace(tmp_path, model_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    return model_path


def load_anatomy_yolo(repo=ANATOMY_MODEL_REPO, filename=ANATOMY_MODEL_FILE, url=ANATOMY_MODEL_URL, license_name=ANATOMY_MODEL_LICENSE):
    model_path = ensure_anatomy_model(repo, filename, url, license_name)
    if model_path in ANATOMY_MODEL_CACHE:
        return ANATOMY_MODEL_CACHE[model_path]
    from ultralytics import YOLO
    model = YOLO(model_path)
    ANATOMY_MODEL_CACHE[model_path] = model
    return model


def ensure_sam3_model():
    model_dir = get_checkpoint_path()
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, SAM3_MODEL_FILE)
    if os.path.exists(model_path):
        return model_path
    print(f"[SwarmSAM3] Downloading {SAM3_MODEL_REPO}/{SAM3_MODEL_FILE} to {model_path}. License/source: {SAM3_MODEL_LICENSE}")
    print(f"[SwarmSAM3] Source: {SAM3_MODEL_URL}")
    tmp_path = model_path + ".tmp"
    try:
        urllib.request.urlretrieve(SAM3_MODEL_URL, tmp_path)
        os.replace(tmp_path, model_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    return model_path


def load_sam3_checkpoint():
    model_path = ensure_sam3_model()
    if model_path in SAM3_MODEL_CACHE:
        return SAM3_MODEL_CACHE[model_path]
    import nodes
    model, clip, _vae = nodes.CheckpointLoaderSimple().load_checkpoint(SAM3_MODEL_FILE)
    SAM3_MODEL_CACHE[model_path] = (model, clip)
    return SAM3_MODEL_CACHE[model_path]


def ensure_sapiens2_model():
    model_dir = get_sapiens2_path()
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, SAPIENS2_MODEL_FILE)
    if os.path.exists(model_path):
        return model_path
    print(f"[SwarmSapiens2] Downloading {SAPIENS2_MODEL_REPO}/{SAPIENS2_MODEL_FILE} to {model_path}. License: {SAPIENS2_MODEL_LICENSE}.")
    print(f"[SwarmSapiens2] Source: {SAPIENS2_MODEL_URL}")
    tmp_path = model_path + ".tmp"
    try:
        urllib.request.urlretrieve(SAPIENS2_MODEL_URL, tmp_path)
        os.replace(tmp_path, model_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    return model_path


def load_sapiens2_segmentation_model():
    model_path = ensure_sapiens2_model()
    if model_path in SAPIENS2_MODEL_CACHE:
        return SAPIENS2_MODEL_CACHE[model_path]
    import nodes
    loader_class = nodes.NODE_CLASS_MAPPINGS.get("Sapiens2Loader")
    if loader_class is None:
        raise RuntimeError("ComfyUI-Sapiens2 is not installed.")
    result = loader_class.execute(SAPIENS2_MODEL_FILE)
    model = result[0] if hasattr(result, "__getitem__") else result.result[0]
    SAPIENS2_MODEL_CACHE[model_path] = model
    return model


def normalize_sam3_bboxes(bboxes):
    if not bboxes:
        return None
    normalized = []
    for box in bboxes:
        if isinstance(box, dict):
            normalized.append(box)
            continue
        if len(box) < 4:
            continue
        x0, y0, x1, y1 = [float(value) for value in box[:4]]
        normalized.append({
            "x": x0,
            "y": y0,
            "width": max(1.0, x1 - x0),
            "height": max(1.0, y1 - y0),
        })
    return normalized if normalized else None


def sort_boxes(candidates):
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates


def label_tokens(label):
    normalized = str(label).lower().replace("_", " ").replace("-", " ").replace("/", " ")
    return [token for token in normalized.split() if token]


def model_class_ids_for_labels(model, classes):
    selected_ids = []
    seen = set()
    for class_id, name in model.names.items():
        name_lower = str(name).lower()
        tokens = label_tokens(name_lower)
        for class_name in classes:
            class_lower = str(class_name).lower()
            if name_lower == class_lower or class_lower in tokens:
                if int(class_id) not in seen:
                    seen.add(int(class_id))
                    selected_ids.append(int(class_id))
                break
    return selected_ids


def detect_with_yolo_model(model, classes, img, threshold, max_detections, width, height, text, source_name):
    selected_ids = model_class_ids_for_labels(model, classes)
    if not selected_ids:
        print(f"[SwarmAnatomyYolo] No {source_name} model classes matched '{text}' ({classes}).")
        return []
    results = model.predict(img, conf=threshold, verbose=False)
    boxes = results[0].boxes
    if boxes is None or len(boxes) == 0:
        print(f"[SwarmAnatomyYolo] No boxes from {source_name} for '{text}' at threshold {threshold}.")
        return []
    candidates = []
    class_ids = boxes.cls.cpu().numpy()
    confidences = boxes.conf.cpu().numpy()
    for index, box in enumerate(boxes):
        if int(class_ids[index]) in selected_ids:
            candidates.append((float(confidences[index]), clamp_box(box.xyxy[0].tolist(), width, height)))
    return [box for _, box in sort_boxes(candidates)[:max(1, max_detections)]]


class SwarmAnatomyYoloDetection:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "text": ("STRING", {"multiline": True, "tooltip": "Segment text to map to anatomy model classes."}),
                "threshold": ("FLOAT", {"default": 0.25, "min": 0.0, "max": 1.0, "step": 0.01, "round": False}),
                "max_detections": ("INT", {"default": 1, "min": 1, "max": 16, "step": 1}),
            },
            "optional": {
                "class_filter": ("STRING", {"default": "", "multiline": False}),
            },
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("BBOX", "MASK", "BOOLEAN")
    RETURN_NAMES = ("bboxes", "bbox_mask", "found_detection")
    FUNCTION = "detect"
    DESCRIPTION = "Detects explicit anatomy classes using Swarm's auto-downloaded anatomy YOLO model."

    def detect(self, image, text, threshold, max_detections, class_filter=""):
        classes = [label.strip().lower() for label in class_filter.split(",") if label.strip()] if class_filter else anatomy_classes_for_text(text)
        if not classes:
            return empty_outputs(image)
        i = 255.0 * image[0].cpu().numpy()
        img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
        width, height = img.size
        try:
            model = load_anatomy_yolo()
            selected = detect_with_yolo_model(model, classes, img, threshold, max_detections, width, height, text, "Felldude")
            if not selected:
                erax_model = load_anatomy_yolo(ERAX_MODEL_REPO, ERAX_MODEL_FILE, ERAX_MODEL_URL, ERAX_MODEL_LICENSE)
                selected = detect_with_yolo_model(erax_model, classes, img, threshold, max_detections, width, height, text, "EraX")
            if not selected:
                print(f"[SwarmAnatomyYolo] No anatomy class matches for '{text}' using classes {classes}.")
                return empty_outputs(image)
            return (selected, boxes_to_mask(selected, width, height), True)
        except Exception as ex:
            print(f"[SwarmAnatomyYolo] Detection failed for '{text}', falling back: {ex}")
            return empty_outputs(image)


def load_dwpose():
    cache_key = "dwpose"
    if cache_key in DWPose_CACHE:
        return DWPose_CACHE[cache_key]
    import comfy.model_management
    try:
        from controlnet_aux import DWposeDetector
        detector = DWposeDetector()
    except Exception:
        from custom_controlnet_aux.dwpose import DWposeDetector
        detector = DWposeDetector()
    try:
        detector.to(comfy.model_management.get_torch_device())
    except Exception:
        pass
    DWPose_CACHE[cache_key] = detector
    return detector


def padded_bounds(points, width, height, pad_x, pad_y):
    valid = []
    for point in points:
        if len(point) >= 2 and point[0] >= 0 and point[1] >= 0:
            valid.append(point)
    if not valid:
        return None
    arr = np.array(valid)
    x0 = float(np.min(arr[:, 0])) - pad_x
    y0 = float(np.min(arr[:, 1])) - pad_y
    x1 = float(np.max(arr[:, 0])) + pad_x
    y1 = float(np.max(arr[:, 1])) + pad_y
    return clamp_box([x0, y0, x1, y1], width, height)


def pose_region_boxes(candidate, subset, width, height, region):
    boxes = []
    for person_index in range(candidate.shape[0]):
        points = candidate[person_index]
        if subset is not None:
            visible = subset[person_index] >= 0.3
            points = points.copy()
            points[~visible] = -1
        if region == "face":
            box = padded_bounds(np.vstack([points[0:1], points[14:18], points[24:92]]), width, height, width * 0.04, height * 0.04)
        elif region == "hands":
            left = padded_bounds(points[92:113], width, height, width * 0.03, height * 0.03)
            right = padded_bounds(points[113:134], width, height, width * 0.03, height * 0.03)
            box = None
            for hand in [left, right]:
                if hand is not None:
                    boxes.append(hand)
            continue
        elif region == "feet":
            box = padded_bounds(points[18:24], width, height, width * 0.04, height * 0.035)
        elif region == "upper_torso":
            box = padded_bounds(points[[1, 2, 5, 8, 11]], width, height, width * 0.08, height * 0.05)
        elif region == "pelvis":
            box = padded_bounds(points[[8, 9, 10, 11, 12, 13]], width, height, width * 0.08, height * 0.06)
        else:
            box = None
        if box is not None:
            boxes.append(box)
    return boxes


class SwarmDWPoseRegionDetection:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "text": ("STRING", {"multiline": True, "tooltip": "Segment text to map to body pose regions."}),
                "max_detections": ("INT", {"default": 1, "min": 1, "max": 16, "step": 1}),
            },
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("BBOX", "MASK", "BOOLEAN")
    RETURN_NAMES = ("bboxes", "bbox_mask", "found_detection")
    FUNCTION = "detect"
    DESCRIPTION = "Uses DWPose/controlnet-aux keypoints when available to derive body-region boxes."

    def detect(self, image, text, max_detections):
        regions = pose_regions_for_text(text)
        if not regions:
            return empty_outputs(image)
        i = 255.0 * image[0].cpu().numpy()
        np_image = np.clip(i, 0, 255).astype(np.uint8)
        height, width = np_image.shape[:2]
        try:
            detector = load_dwpose()
            resized = cv2.cvtColor(np_image, cv2.COLOR_RGB2BGR)
            with torch.no_grad():
                candidate, subset = detector.pose_estimation(resized)
            if candidate is None or candidate.shape[0] == 0:
                return empty_outputs(image)
            boxes = []
            for region in regions:
                boxes.extend(pose_region_boxes(candidate, subset, width, height, region))
            selected = boxes[:max(1, max_detections)]
            if not selected:
                print(f"[SwarmDWPoseRegion] No pose boxes for '{text}'.")
                return empty_outputs(image)
            return (selected, boxes_to_mask(selected, width, height), True)
        except Exception as ex:
            print(f"[SwarmDWPoseRegion] DWPose unavailable for '{text}', falling back: {ex}")
            return empty_outputs(image)


class SwarmSapiens2Segmentation:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "text": ("STRING", {"multiline": True, "tooltip": "Segment text to map to Sapiens2 body-part classes."}),
                "frames_per_batch": ("INT", {"default": 1, "min": 1, "max": 16, "step": 1}),
            },
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK", "BOOLEAN")
    RETURN_NAMES = ("mask", "found_detection")
    FUNCTION = "segment"
    DESCRIPTION = "Uses ComfyUI-Sapiens2 body-part segmentation when installed, auto-downloading the 0.4B segmentation checkpoint."

    def segment(self, image, text, frames_per_batch):
        height = image.shape[1]
        width = image.shape[2]
        empty_mask = torch.zeros((1, height, width), dtype=torch.float32, device="cpu")
        class_ids = sapiens2_class_ids_for_text(text)
        if not class_ids:
            return (empty_mask, False)
        try:
            import nodes
            seg_class = nodes.NODE_CLASS_MAPPINGS.get("Sapiens2Seg")
            if seg_class is None:
                raise RuntimeError("ComfyUI-Sapiens2 Sapiens2Seg node is not installed.")
            sapiens_model = load_sapiens2_segmentation_model()
            result = seg_class.execute(image=image, sapiens2_model=sapiens_model, frames_per_batch=frames_per_batch)
            class_id_mask = result[0] if hasattr(result, "__getitem__") else result.result[0]
            ids = (class_id_mask.float() * max(len(SAPIENS2_CLASS_NAMES) - 1, 1)).round().long()
            combined = torch.zeros_like(ids, dtype=torch.bool)
            for class_id in class_ids:
                combined |= ids == class_id
            mask = combined.to(dtype=torch.float32)
            if mask_has_area(mask):
                print(f"[SwarmSapiens2] Used body-part classes {class_ids} for '{text}'.")
                return (mask, True)
            print(f"[SwarmSapiens2] Sapiens2 produced no usable body-part mask for '{text}'.")
        except Exception as ex:
            print(f"[SwarmSapiens2] Sapiens2 unavailable for '{text}', falling back: {ex}")
        return (empty_mask, False)


def short_sam3_prompt(text):
    labels = normalize_labels(text)
    prompt = labels[0] if labels else str(text).strip()
    tokens = prompt.split()
    return " ".join(tokens[:32]) or "subject"


def try_mask_from_result(result, image):
    if hasattr(result, "result"):
        result = result.result
    candidates = result if isinstance(result, (list, tuple)) else [result]
    height = image.shape[1]
    width = image.shape[2]
    for candidate in candidates:
        if isinstance(candidate, torch.Tensor) and candidate.ndim in [2, 3]:
            mask = candidate.detach().cpu().float()
            if mask.ndim == 2:
                mask = mask.unsqueeze(0)
            if mask.shape[1] != height or mask.shape[2] != width:
                mask = torch.nn.functional.interpolate(mask.unsqueeze(1), size=(height, width), mode="bilinear").squeeze(1)
            if mask.max() > 0:
                return mask.clamp(0.0, 1.0)
    return None


class SwarmSam3TextSegmentation:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "text": ("STRING", {"multiline": True, "tooltip": "Short text prompt to pass to Comfy's native SAM3 text segmentation graph."}),
                "threshold": ("FLOAT", {"default": 0.25, "min": 0.0, "max": 1.0, "step": 0.01, "round": False}),
                "max_detections": ("INT", {"default": 1, "min": 1, "max": 16, "step": 1}),
            },
            "optional": {
                "bboxes": ("BBOX",),
            },
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK", "BOOLEAN")
    RETURN_NAMES = ("mask", "found_detection")
    FUNCTION = "segment"
    DESCRIPTION = "Uses Comfy's native SAM3/SAM3.1 loader, CLIP text encoder, and SAM3_Detect node path with an auto-downloaded SAM3.1 checkpoint."

    def segment(self, image, text, threshold, max_detections, bboxes=None):
        height = image.shape[1]
        width = image.shape[2]
        empty_mask = torch.zeros((1, height, width), dtype=torch.float32, device="cpu")
        try:
            import nodes
            from comfy_extras.nodes_sam3 import SAM3_Detect
            model, clip = load_sam3_checkpoint()
            prompt = short_sam3_prompt(text)
            conditioning = None
            if prompt and prompt != "subject":
                conditioning = nodes.CLIPTextEncode().encode(clip, prompt)[0]
                if len(conditioning) > 0 and isinstance(conditioning[0][1], dict):
                    conditioning[0][1]["sam3_multi_cond"] = [{
                        "cond": conditioning[0][0],
                        "attention_mask": conditioning[0][1].get("attention_mask"),
                        "max_detections": max(1, int(max_detections)),
                    }]
            normalized_bboxes = normalize_sam3_bboxes(bboxes)
            result = SAM3_Detect.execute(
                model=model,
                image=image,
                conditioning=conditioning,
                bboxes=normalized_bboxes,
                threshold=threshold,
                refine_iterations=2,
                individual_masks=False,
            )
            mask = try_mask_from_result(result, image)
            if mask is not None and mask_has_area(mask):
                source = "text" if conditioning is not None else "boxes"
                print(f"[SwarmSam3TextSegmentation] Used native SAM3 {source} segmentation for '{prompt}'.")
                return (mask, True)
            print(f"[SwarmSam3TextSegmentation] Native SAM3 produced no usable mask for '{prompt}'.")
        except Exception as ex:
            print(f"[SwarmSam3TextSegmentation] SAM3 text segmentation unavailable for '{text}', falling back: {ex}")
        return (empty_mask, False)


class SwarmSegmentMaskPreview:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "label": ("STRING", {"default": "Segment detection", "multiline": False}),
                "detail": ("STRING", {"default": "", "multiline": False}),
            },
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("preview",)
    FUNCTION = "preview"
    DESCRIPTION = "Creates a live preview overlay that shows the detected segment mask before segment refinement sampling."

    def preview(self, image, mask, label, detail):
        img = image[0].detach().cpu().float().numpy()
        height, width = img.shape[:2]
        mask_np = mask.detach().cpu().float()
        if mask_np.ndim == 3:
            mask_np = mask_np[0]
        if mask_np.shape[0] != height or mask_np.shape[1] != width:
            mask_np = torch.nn.functional.interpolate(mask_np.unsqueeze(0).unsqueeze(0), size=(height, width), mode="bilinear").squeeze(0).squeeze(0)
        mask_np = np.clip(mask_np.numpy(), 0.0, 1.0)
        overlay = np.clip(img.copy(), 0.0, 1.0)
        highlight = np.zeros_like(overlay)
        highlight[:, :, 0] = 1.0
        highlight[:, :, 1] = 0.22
        alpha = (mask_np > 0.05).astype(np.float32)[:, :, None] * 0.45
        overlay = overlay * (1.0 - alpha) + highlight * alpha
        contour = ((mask_np > 0.45).astype(np.uint8) * 255)
        contours, _hierarchy = cv2.findContours(contour, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        overlay_u8 = np.clip(overlay * 255.0, 0, 255).astype(np.uint8)
        cv2.drawContours(overlay_u8, contours, -1, (255, 255, 255), 2)
        text = str(label or "Segment detection")[:72]
        subtext = str(detail or "")[:96]
        cv2.rectangle(overlay_u8, (0, 0), (width, min(height, 58)), (0, 0, 0), -1)
        cv2.putText(overlay_u8, text, (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 1, cv2.LINE_AA)
        if subtext:
            cv2.putText(overlay_u8, subtext, (12, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (230, 230, 230), 1, cv2.LINE_AA)
        return (torch.from_numpy(overlay_u8.astype(np.float32) / 255.0).unsqueeze(0),)


NODE_CLASS_MAPPINGS = {
    "SwarmAnatomyYoloDetection": SwarmAnatomyYoloDetection,
    "SwarmDWPoseRegionDetection": SwarmDWPoseRegionDetection,
    "SwarmSapiens2Segmentation": SwarmSapiens2Segmentation,
    "SwarmSam3TextSegmentation": SwarmSam3TextSegmentation,
    "SwarmSegmentMaskPreview": SwarmSegmentMaskPreview,
}
