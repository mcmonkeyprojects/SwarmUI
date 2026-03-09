import json


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
        return ([[float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3])]],)


NODE_CLASS_MAPPINGS = {
    "Sam2BBoxFromJson": Sam2BBoxFromJson,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Sam2BBoxFromJson": "SAM2 BBox From JSON",
}
