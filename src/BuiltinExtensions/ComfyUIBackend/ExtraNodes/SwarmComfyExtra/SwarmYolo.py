import torch, folder_paths, comfy
from PIL import Image
import numpy as np

class SwarmYoloDetection:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "model_name": (folder_paths.get_filename_list("yolov8"), ),
                "index": ("INT", { "default": 0, "min": 0, "max": 256, "step": 1 }),
            },
            "optional": {
                "class_filter": ("STRING", { "default": "", "multiline": False }),
                "sort_order": (["left-right", "right-left", "top-bottom", "bottom-top", "largest-smallest", "smallest-largest"], ),
                "threshold": ("FLOAT", { "default": 0.25, "min": 0.0, "max": 1.0, "step": 0.01 }),
            }
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK",)
    FUNCTION = "seg"

    def seg(self, image, model_name, index, class_filter=None, sort_order="left-right", threshold=0.25):
        # TODO: Batch support?
        i = 255.0 * image[0].cpu().numpy()
        img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
        # TODO: Cache the model in RAM in some way?
        model_path = folder_paths.get_full_path("yolov8", model_name)
        if model_path is None:
            raise ValueError(f"Model {model_name} not found, or yolov8 folder path not defined")
        from ultralytics import YOLO
        model = YOLO(model_path)
        results = model.predict(img, conf=threshold)
        boxes = results[0].boxes
        class_ids = boxes.cls.cpu().numpy() if boxes is not None else []
        selected_classes = None

        if class_filter and class_filter.strip():
            class_filter_list = [cls_name.strip() for cls_name in class_filter.split(",") if cls_name.strip()]
            label_to_id = {name.lower(): id for id, name in model.names.items()}
            selected_classes = []
            for cls_name in class_filter_list:
                if cls_name.isdigit():
                    selected_classes.append(int(cls_name))
                else:
                    class_id = label_to_id.get(cls_name.lower())
                    if class_id is not None:
                        selected_classes.append(class_id)
                    else:
                        print(f"Class '{cls_name}' not found in the model")
            selected_classes = selected_classes if selected_classes else None

        masks = results[0].masks
        if masks is not None and selected_classes is not None:
            selected_masks = []
            for i, class_id in enumerate(class_ids):
                if class_id in selected_classes:
                    selected_masks.append(masks.data[i].cpu())
            if selected_masks:
                masks = torch.stack(selected_masks)
            else:
                masks = None

        if masks is None or masks.shape[0] == 0:
            if boxes is None or len(boxes) == 0:
                return (torch.zeros(1, image.shape[1], image.shape[2]), )
            else:
                if selected_classes:
                    boxes = [box for i, box in enumerate(boxes) if class_ids[i] in selected_classes]
            masks = torch.zeros((len(boxes), image.shape[1], image.shape[2]), dtype=torch.float32, device="cpu")
            for i, box in enumerate(boxes):
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                masks[i, int(y1):int(y2), int(x1):int(x2)] = 1.0
        else:
            masks = masks.data.cpu()
        if masks is None or masks.shape[0] == 0:
            return (torch.zeros(1, image.shape[1], image.shape[2]), )

        masks = torch.nn.functional.interpolate(masks.unsqueeze(1), size=(image.shape[1], image.shape[2]), mode="bilinear").squeeze(1)
        if index == 0:
            result = masks[0]
            for i in range(1, len(masks)):
                result = torch.max(result, masks[i])
            return (result.unsqueeze(0), )
        elif index > len(masks):
            return (torch.zeros_like(masks[0]).unsqueeze(0), )
        else:
            sortedindices = []
            for mask in masks:
                match sort_order:
                    case "left-right":
                        sum_x = (torch.sum(mask, dim=0) != 0).to(dtype=torch.int)
                        val = torch.argmax(sum_x).item()
                    case "right-left":
                        sum_x = (torch.sum(mask, dim=0) != 0).to(dtype=torch.int)
                        val = mask.shape[1] - torch.argmax(torch.flip(sum_x, [0])).item() - 1
                    case "top-bottom":
                        sum_y = (torch.sum(mask, dim=1) != 0).to(dtype=torch.int)
                        val = torch.argmax(sum_y).item()
                    case "bottom-top":
                        sum_y = (torch.sum(mask, dim=1) != 0).to(dtype=torch.int)
                        val = mask.shape[0] - torch.argmax(torch.flip(sum_y, [0])).item() - 1
                    case "largest-smallest" | "smallest-largest":
                        val = torch.sum(mask).item()
                sortedindices.append(val)
            sortedindices = np.argsort(sortedindices)
            if sort_order in ["right-left", "bottom-top", "largest-smallest"]:
                sortedindices = sortedindices[::-1].copy()
            masks = masks[sortedindices]
            return (masks[index - 1].unsqueeze(0), )

NODE_CLASS_MAPPINGS = {
    "SwarmYoloDetection": SwarmYoloDetection,
}
