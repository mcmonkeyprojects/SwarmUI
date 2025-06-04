import torch, comfy

intermediate_device = comfy.model_management.intermediate_device()
main_device = comfy.model_management.get_torch_device()

class SwarmSquareMaskFromPercent:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "x": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.05, "round": 0.0001, "tooltip": "The x position of the mask as a percentage of the image size."}),
                "y": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.05, "round": 0.0001, "tooltip": "The y position of the mask as a percentage of the image size."}),
                "width": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.05, "round": 0.0001, "tooltip": "The width of the mask as a percentage of the image size."}),
                "height": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.05, "round": 0.0001, "tooltip": "The height of the mask as a percentage of the image size."}),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "tooltip": "The strength of the mask, ie the value of all masked pixels, leaving the rest black ie 0."}),
            }
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK",)
    FUNCTION = "mask_from_perc"
    DESCRIPTION = "Creates a simple square mask with the specified dimensions and position, with the specified strength (ie value of all masked pixels, leaving the rest black ie 0)."

    def mask_from_perc(self, x, y, width, height, strength):
        SCALE = 256
        mask = torch.zeros((SCALE, SCALE), dtype=torch.float32, device=intermediate_device)
        mask[int(y*SCALE):int((y+height)*SCALE), int(x*SCALE):int((x+width)*SCALE)] = strength
        return (mask.unsqueeze(0),)


def mask_size_match(mask_a, mask_b):
    if len(mask_a.shape) == 2:
        mask_a = mask_a.unsqueeze(0)
    if len(mask_b.shape) == 2:
        mask_b = mask_b.unsqueeze(0)
    height = max(mask_a.shape[1], mask_b.shape[1])
    width = max(mask_a.shape[2], mask_b.shape[2])
    if mask_a.shape[1] != height or mask_a.shape[2] != width:
        mask_a = torch.nn.functional.interpolate(mask_a.unsqueeze(0), size=(height, width), mode="bicubic")[0]
    if mask_b.shape[1] != height or mask_b.shape[2] != width:
        mask_b = torch.nn.functional.interpolate(mask_b.unsqueeze(0), size=(height, width), mode="bicubic")[0]
    return (mask_a, mask_b)


class SwarmOverMergeMasksForOverlapFix:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask_a": ("MASK",),
                "mask_b": ("MASK",),
            }
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK",)
    FUNCTION = "mask_overmerge"
    DESCRIPTION = "Merges two masks by simply adding them together, without any overlap handling. Intended for use with the Overlap nodes."

    def mask_overmerge(self, mask_a, mask_b):
        mask_a, mask_b = mask_size_match(mask_a, mask_b)
        mask_sum = mask_a + mask_b
        return (mask_sum,)


class SwarmCleanOverlapMasks:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask_a": ("MASK",),
                "mask_b": ("MASK",),
            }
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK","MASK",)
    FUNCTION = "mask_overlap"
    DESCRIPTION = "Normalizes the overlap between two masks, such that where they overlap each mask will receive only partial strength that sums to no more than 1.0. This allows you to then add the masks together and the result will not exceed 1 at any point."

    def mask_overlap(self, mask_a, mask_b):
        mask_a, mask_b = mask_size_match(mask_a, mask_b)
        mask_sum = mask_a + mask_b
        mask_sum = mask_sum.clamp(1.0, 9999.0)
        mask_a = mask_a / mask_sum
        mask_b = mask_b / mask_sum
        return (mask_a, mask_b)


class SwarmCleanOverlapMasksExceptSelf:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask_self": ("MASK",),
                "mask_merged": ("MASK",),
            }
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK",)
    FUNCTION = "mask_clean"
    DESCRIPTION = "If masks have been overmerged, this takes a single mask and grabs just the CleanOverlap result for the one mask relative to the overmerge result."

    def mask_clean(self, mask_self, mask_merged):
        mask_self, mask_merged = mask_size_match(mask_self, mask_merged)
        mask_sum = mask_merged.clamp(1.0, 9999.0)
        mask_self = mask_self / mask_sum
        return (mask_self,)


class SwarmExcludeFromMask:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "main_mask": ("MASK",),
                "exclude_mask": ("MASK",),
            }
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK",)
    FUNCTION = "mask_exclude"
    DESCRIPTION = "Excludes the area of the exclude mask from the main mask, such that the main mask will be black in the area of the exclude mask. This is a simple subtract and clamp."

    def mask_exclude(self, main_mask, exclude_mask):
        main_mask, exclude_mask = mask_size_match(main_mask, exclude_mask)
        main_mask = main_mask - exclude_mask
        main_mask = main_mask.clamp(0.0, 1.0)
        return (main_mask,)


class SwarmMaskBounds:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask": ("MASK",),
                "grow": ("INT", {"default": 0, "min": 0, "max": 1024, "tooltip": "Number of pixels to grow the mask by."}),
            },
            "optional": {
                "aspect_x": ("INT", {"default": 0, "min": 0, "max": 4096, "tooltip": "An X width value, used to indicate a target aspect ratio. 0 to allow any aspect."}),
                "aspect_y": ("INT", {"default": 0, "min": 0, "max": 4096, "tooltip": "A Y height value, used to indicate a target aspect ratio. 0 to allow any aspect."}),
            }
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("INT", "INT", "INT", "INT")
    RETURN_NAMES = ("x", "y", "width", "height")
    FUNCTION = "get_bounds"
    DESCRIPTION = "Returns the bounding box of the mask (as pixel coordinates x,y,width,height), optionally grown by the number of pixels specified in 'grow'."

    def get_bounds(self, mask, grow, aspect_x=0, aspect_y=0):
        if len(mask.shape) == 3:
            mask = mask[0]
        sum_x = (torch.sum(mask, dim=0) != 0).to(dtype=torch.int)
        sum_y = (torch.sum(mask, dim=1) != 0).to(dtype=torch.int)
        def getval(arr, direction):
            val = torch.argmax(arr).item()
            val += grow * direction
            val = max(0, min(val, arr.shape[0] - 1))
            return val
        x_start = getval(sum_x, -1)
        x_end = mask.shape[1] - getval(sum_x.flip(0), -1)
        y_start = getval(sum_y, -1)
        y_end = mask.shape[0] - getval(sum_y.flip(0), -1)
        if aspect_x > 0 and aspect_y > 0:
            actual_aspect = aspect_x / aspect_y
            width = x_end - x_start
            height = y_end - y_start
            found_aspect = width / height
            if found_aspect > actual_aspect:
                desired_height = width / actual_aspect
                y_start = max(0, y_start - (desired_height - height) / 2)
                y_end = min(mask.shape[0], y_start + desired_height)
            else:
                desired_width = height * actual_aspect
                x_start = max(0, x_start - (desired_width - width) / 2)
                x_end = min(mask.shape[1], x_start + desired_width)
        return (int(x_start), int(y_start), int(x_end - x_start), int(y_end - y_start))


class SwarmMaskGrow:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask": ("MASK",),
                "grow": ("INT", {"default": 0, "min": 0, "max": 1024, "tooltip": "Number of pixels to grow the mask by."}),
            }
        }

    CATEGORY = "SwarmUI/masks"
    RETURN_TYPES = ("MASK",)
    FUNCTION = "grow"
    DESCRIPTION = "Expands the contents of the max, such that masked (white) areas grow and cover the unmasked (black) areas by the number of pixels specified in 'grow'."

    def grow(self, mask, grow):
        while mask.ndim < 4:
            mask = mask.unsqueeze(0)
        mask = mask.to(device=main_device)
        # iterate rather than all at once - this avoids padding and runs much faster for large sizes
        for _ in range((grow + 1) // 2):
            mask = torch.nn.functional.max_pool2d(mask, kernel_size=3, stride=1, padding=1)
        return (mask.to(device=intermediate_device),)


# Blur code is copied out of ComfyUI's default ImageBlur
def gaussian_kernel(kernel_size: int, sigma: float, device=None):
    x, y = torch.meshgrid(torch.linspace(-1, 1, kernel_size, device=device), torch.linspace(-1, 1, kernel_size, device=device), indexing="ij")
    d = torch.sqrt(x * x + y * y)
    g = torch.exp(-(d * d) / (2.0 * sigma * sigma))
    return g / g.sum()


class SwarmMaskBlur:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask": ("MASK",),
                "blur_radius": ("INT", { "default": 1, "min": 1, "max": 64, "step": 1, "tooltip": "The radius of the blur kernel." }),
                "sigma": ("FLOAT", { "default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1, "tooltip": "The standard deviation of the Gaussian blur kernel." }),
            },
        }

    RETURN_TYPES = ("MASK",)
    FUNCTION = "blur"
    CATEGORY = "SwarmUI/masks"
    DESCRIPTION = "Blurs the contents of the mask."

    def blur(self, mask, blur_radius, sigma):
        if blur_radius == 0:
            return (mask,)
        mask = mask.to(device=main_device)
        kernel_size = blur_radius * 2 + 1
        kernel = gaussian_kernel(kernel_size, sigma, device=mask.device).repeat(1, 1, 1).unsqueeze(1)
        while mask.ndim < 4:
            mask = mask.unsqueeze(0)
        padded_mask = torch.nn.functional.pad(mask, (blur_radius,blur_radius,blur_radius,blur_radius), 'reflect')
        blurred = torch.nn.functional.conv2d(padded_mask, kernel, padding=kernel_size // 2, groups=1)[:,:,blur_radius:-blur_radius, blur_radius:-blur_radius]
        blurred = blurred.squeeze(0).squeeze(0)
        mask = mask.to(device=intermediate_device)
        return (blurred.to(device=intermediate_device),)


class SwarmMaskThreshold:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask": ("MASK",),
                "min": ("FLOAT", { "default": 0.2, "min": 0, "max": 1, "step": 0.01, "tooltip": "The minimum value to threshold the mask to." }),
                "max": ("FLOAT", { "default": 0.8, "min": 0, "max": 1, "step": 0.01, "tooltip": "The maximum value to threshold the mask to." }),
            },
        }

    RETURN_TYPES = ("MASK",)
    FUNCTION = "threshold"
    CATEGORY = "SwarmUI/masks"
    DESCRIPTION = "Thresholds the mask to the specified range, clamping any lower or higher values and rescaling the range to 0-1."

    def threshold(self, mask, min, max):
        mask = mask.clamp(min, max)
        mask = mask - min
        mask = mask / (max - min)
        return (mask,)


NODE_CLASS_MAPPINGS = {
    "SwarmSquareMaskFromPercent": SwarmSquareMaskFromPercent,
    "SwarmCleanOverlapMasks": SwarmCleanOverlapMasks,
    "SwarmCleanOverlapMasksExceptSelf": SwarmCleanOverlapMasksExceptSelf,
    "SwarmExcludeFromMask": SwarmExcludeFromMask,
    "SwarmOverMergeMasksForOverlapFix": SwarmOverMergeMasksForOverlapFix,
    "SwarmMaskBounds": SwarmMaskBounds,
    "SwarmMaskGrow": SwarmMaskGrow,
    "SwarmMaskBlur": SwarmMaskBlur,
    "SwarmMaskThreshold": SwarmMaskThreshold,
}
