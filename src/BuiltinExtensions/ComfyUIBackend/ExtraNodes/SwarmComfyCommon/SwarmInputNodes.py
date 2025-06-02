from . import SwarmLoadImageB64
import folder_paths
from nodes import CheckpointLoaderSimple

INT_MAX = 0xffffffffffffffff
INT_MIN = -INT_MAX

class SwarmInputGroup:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "title": ("STRING", {"default": "My Group", "tooltip": "The title of the group."}),
                "open_by_default": ("BOOLEAN", {"default": True, "tooltip": "Whether the group should be open by default."}),
                "description": ("STRING", {"default": "", "multiline": True, "tooltip": "A description of the group that shows up when you click the '?' button."}),
                "order_priority": ("FLOAT", {"default": 0, "min": -1024, "max": 1024, "step": 0.5, "round": 0.0000001, "tooltip": "The order priority of the group. Higher values go further down in the list of groups."}),
                "is_advanced": ("BOOLEAN", {"default": False, "tooltip": "If true, the group will only be visible when 'Display Advanced' is clicked."}),
                "can_shrink": ("BOOLEAN", {"default": True, "tooltip": "If true, the group can be collapsed by the user. If false, will be forced to remain open."}),
            },
        }

    CATEGORY = "SwarmUI/inputs"
    RETURN_TYPES = ("GROUP",)
    FUNCTION = "do_input"
    DESCRIPTION = "SwarmInput nodes let you define custom input controls in Swarm-Comfy Workflows. Group defines a parameter groupging - link this to other nodes to create a collapsible group, all nodes this links to will be inside the group."

    def do_input(self, **kwargs):
        return (None, )


STANDARD_REQ_INPUTS = {
    "description": ("STRING", {"default": "", "multiline": True, "tooltip": "A description of the input that shows up when you click the '?' button."}),
    "order_priority": ("FLOAT", {"default": 0, "min": -1024, "max": 1024, "step": 0.5, "round": 0.0000001, "tooltip": "The order priority of the input. Higher values go further down in the list of inputs. This only applies within the group this node is part of."}),
    "is_advanced": ("BOOLEAN", {"default": False, "tooltip": "If true, the input will only be visible when 'Display Advanced' is clicked."}),
    "raw_id": ("STRING", {"default": "", "tooltip": "The raw ID of the input. This can be used to customize the input for API usage, or to make use of default SwarmUI parameters. Most of the time, you don't need to touch this. By default this will autogenerate a unique ID based on the title value."}),
}
STANDARD_OTHER_INPUTS = {
    "optional": {
        "group": ("GROUP", )
    }
}


class SwarmInputInteger:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "title": ("STRING", {"default": "My Integer", "tooltip": "The name of the input."}),
                "value": ("INT", {"default": 0, "min": INT_MIN, "max": INT_MAX, "step": 1, "tooltip": "The default value of the input."}),
                "step": ("INT", {"default": 1, "min": INT_MIN, "max": INT_MAX, "step": 1, "tooltip": "The step size of the input. That is, how much the value changes when you click the up/down arrows or move the slider."}),
                "min": ("INT", {"default": 0, "min": INT_MIN, "max": INT_MAX, "step": 1, "tooltip": "The minimum value of the input."}),
                "max": ("INT", {"default": 100, "min": INT_MIN, "max": INT_MAX, "step": 1, "tooltip": "The maximum value of the input."}),
                "view_max": ("INT", {"default": 100, "min": INT_MIN, "max": INT_MAX, "step": 1, "tooltip": "The maximum value of the input that is displayed in the UI when using a slider. This is useful if you want to allow a higher range of values, but don't want to clutter the UI with a huge slider."}),
                "view_type": (["big", "small", "seed", "slider", "pot_slider"],{"tooltip": "The type of input control to use. 'big' is a large text input, 'small' is a small text input, 'seed' is a text input with seed-specific controls, 'slider' is a slider, and 'pot_slider' is a Power-Of-Two scaled slider - this is useful for large inputs like resolutions to allow a more natural feeling selection range."}),
            } | STANDARD_REQ_INPUTS,
        } | STANDARD_OTHER_INPUTS

    CATEGORY = "SwarmUI/inputs"
    RETURN_TYPES = ("INT",)
    FUNCTION = "do_input"
    DESCRIPTION = "SwarmInput nodes let you define custom input controls in Swarm-Comfy Workflows. Integer lets you input a whole number without a decimal point."

    def do_input(self, value, **kwargs):
        return (value, )


class SwarmInputFloat:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "title": ("STRING", {"default": "My Floating-Point Number", "tooltip": "The name of the input."}),
                "value": ("FLOAT", {"default": 0, "min": INT_MIN, "max": INT_MAX, "step": 0.1, "round": 0.0000001, "tooltip": "The default value of the input."}),
                "step": ("FLOAT", {"default": 0.1, "min": INT_MIN, "max": INT_MAX, "step": 0.01, "round": 0.0000001, "tooltip": "The step size of the input. That is, how much the value changes when you click the up/down arrows or move the slider."}),
                "min": ("FLOAT", {"default": 0, "min": INT_MIN, "max": INT_MAX, "step": 0.1, "round": 0.0000001, "tooltip": "The minimum value of the input."}),
                "max": ("FLOAT", {"default": 100, "min": INT_MIN, "max": INT_MAX, "step": 0.1, "round": 0.0000001, "tooltip": "The maximum value of the input."}),
                "view_max": ("FLOAT", {"default": 100, "min": INT_MIN, "max": INT_MAX, "step": 0.1, "round": 0.0000001, "tooltip": "The maximum value of the input that is displayed in the UI when using a slider. This is useful if you want to allow a higher range of values, but don't want to clutter the UI with a huge slider."}),
                "view_type": (["big", "small", "slider", "pot_slider"], {"tooltip": "The type of input control to use. 'big' is a large text input, 'small' is a small text input, 'slider' is a slider, and 'pot_slider' is a Power-Of-Two scaled slider - this is useful for large inputs like resolutions to allow a more natural feeling selection range."}),
            } | STANDARD_REQ_INPUTS,
        } | STANDARD_OTHER_INPUTS

    CATEGORY = "SwarmUI/inputs"
    RETURN_TYPES = ("FLOAT",)
    FUNCTION = "do_input"
    DESCRIPTION = "SwarmInput nodes let you define custom input controls in Swarm-Comfy Workflows. Float lets you input a number with a decimal point."

    def do_input(self, value, **kwargs):
        return (value, )


class SwarmInputText:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "title": ("STRING", {"default": "My Text", "tooltip": "The name of the input."}),
                "value": ("STRING", {"default": "", "multiline": True, "tooltip": "The default value of the input."}),
                "view_type": (["normal", "prompt"], {"tooltip": "How to format this text input. 'normal' is a simple single line text input, 'prompt' is a prompt-like text input that has multiple lines and other prompting-specific features."}),
            } | STANDARD_REQ_INPUTS,
        } | STANDARD_OTHER_INPUTS

    CATEGORY = "SwarmUI/inputs"
    RETURN_TYPES = ("STRING",)
    FUNCTION = "do_input"
    DESCRIPTION = "SwarmInput nodes let you define custom input controls in Swarm-Comfy Workflows. Text lets you input a string of text. This can be simple text inputs, or prompt-like text inputs."

    def do_input(self, value, **kwargs):
        return (value, )


class SwarmInputModelName:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "title": ("STRING", {"default": "My Model Name Input", "tooltip": "The name of the input."}),
                "value": ("STRING", {"default": "", "multiline": False, "tooltip": "The default value of the input."}),
                "subtype": (["Stable-Diffusion", "VAE", "LoRA", "Embedding", "ControlNet", "ClipVision"], {"tooltip": "The model subtype to select from."}),
            } | STANDARD_REQ_INPUTS,
        } | STANDARD_OTHER_INPUTS

    CATEGORY = "SwarmUI/inputs"
    RETURN_TYPES = ("",)
    FUNCTION = "do_input"
    DESCRIPTION = "SwarmInput nodes let you define custom input controls in Swarm-Comfy Workflows. Model Name lets you have a dropdown select for models of a given model sub-type."

    def do_input(self, value, **kwargs):
        return (value, )


class SwarmInputCheckpoint:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "title": ("STRING", {"default": "My Checkpoint Model Name Input", "tooltip": "The name of the input."}),
                "value": (folder_paths.get_filename_list("checkpoints"), {"tooltip": "The default value of the input."}),
            } | STANDARD_REQ_INPUTS,
        } | STANDARD_OTHER_INPUTS

    CATEGORY = "SwarmUI/inputs"
    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    FUNCTION = "do_input"
    DESCRIPTION = "SwarmInput nodes let you define custom input controls in Swarm-Comfy Workflows. Checkpoint lets you have a dropdown select for checkpoint models. Acts like the Checkpoint Loader node."

    def do_input(self, value, **kwargs):
        return CheckpointLoaderSimple().load_checkpoint(value)


class SwarmInputDropdown:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "title": ("STRING", {"default": "My Dropdown", "tooltip": "The name of the input."}),
                "value": ("STRING", {"default": "", "multiline": False, "tooltip": "The default value of the input."}),
                "values": ("STRING", {"default": "one, two, three", "multiline": True, "tooltip": "A comma-separated list of values to choose from. If you leave this blank, the dropdown will automatically load the value list from the connected node."}),
            } | STANDARD_REQ_INPUTS,
        } | STANDARD_OTHER_INPUTS

    CATEGORY = "SwarmUI/inputs"
    RETURN_TYPES = ("STRING", "",)
    FUNCTION = "do_input"
    DESCRIPTION = "SwarmInput nodes let you define custom input controls in Swarm-Comfy Workflows. Dropdown lets you have a dropdown select for a list of values. You can leave the values list empty and attach the blank output to a real dropdown in another node to have it automatically load the value list from that connected node."

    def do_input(self, value, **kwargs):
        return (value, value, )


class SwarmInputBoolean:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "title": ("STRING", {"default": "My Boolean", "tooltip": "The name of the input."}),
                "value": ("BOOLEAN", {"default": False, "tooltip": "The default value of the input."}),
            } | STANDARD_REQ_INPUTS,
        } | STANDARD_OTHER_INPUTS

    CATEGORY = "SwarmUI/inputs"
    RETURN_TYPES = ("BOOLEAN",)
    FUNCTION = "do_input"
    DESCRIPTION = "SwarmInput nodes let you define custom input controls in Swarm-Comfy Workflows. Boolean lets you have a checkbox for a true/false value."

    def do_input(self, value, **kwargs):
        return (value, )


class SwarmInputImage:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "title": ("STRING", {"default": "My Image", "tooltip": "The name of the input."}),
                "value": ("STRING", {"default": "(Do Not Set Me)", "multiline": True, "tooltip": "Always leave this blank, the SwarmUI server will fill it for you."}),
                "auto_resize": ("BOOLEAN", {"default": True, "tooltip": "If true, the image will be resized to match the current generation resolution. If false, the image will be kept at whatever size the user input it at."}),
            } | STANDARD_REQ_INPUTS,
        } | STANDARD_OTHER_INPUTS

    CATEGORY = "SwarmUI/inputs"
    RETURN_TYPES = ("IMAGE","MASK",)
    FUNCTION = "do_input"
    DESCRIPTION = "SwarmInput nodes let you define custom input controls in Swarm-Comfy Workflows. Image lets you input an image. Internally this node uses a Base64 string as input, so may not be the most friendly to use on the Comfy Workflow tab, but is very convenient to use on the Generate tab."

    def do_input(self, value, **kwargs):
        return SwarmLoadImageB64.b64_to_img_and_mask(value)


NODE_CLASS_MAPPINGS = {
    "SwarmInputGroup": SwarmInputGroup,
    "SwarmInputInteger": SwarmInputInteger,
    "SwarmInputFloat": SwarmInputFloat,
    "SwarmInputText": SwarmInputText,
    "SwarmInputModelName": SwarmInputModelName,
    "SwarmInputCheckpoint": SwarmInputCheckpoint,
    "SwarmInputDropdown": SwarmInputDropdown,
    "SwarmInputBoolean": SwarmInputBoolean,
    "SwarmInputImage": SwarmInputImage,
}
