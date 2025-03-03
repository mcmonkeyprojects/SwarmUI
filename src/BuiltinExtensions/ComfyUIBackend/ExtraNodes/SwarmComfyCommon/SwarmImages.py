import torch
import comfy
import math
from nodes import MAX_RESOLUTION

class SwarmImageScaleForMP:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "width": ("INT", {"default": 0, "min": 0, "max": 8192, "tooltip": "The target width of the image."}),
                "height": ("INT", {"default": 0, "min": 0, "max": 8192, "tooltip": "The target height of the image."}),
                "can_shrink": ("BOOLEAN", {"default": True, "tooltip": "If true, the image can be shrunk to fit the target size, otherwise it will only be scaled up or left the same."}),
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "scale"
    DESCRIPTION = "Scales an image to a target width and height, while keeping the aspect ratio."

    def scale(self, image, width, height, can_shrink):
        mpTarget = width * height
        oldWidth = image.shape[2]
        oldHeight = image.shape[1]

        scale = math.sqrt(mpTarget / (oldWidth * oldHeight))
        if not can_shrink and scale < 1:
            return (image,)
        newWid = int(round(oldWidth * scale / 64) * 64)
        newHei = int(round(oldHeight * scale / 64) * 64)
        samples = image.movedim(-1, 1)
        s = comfy.utils.common_upscale(samples, newWid, newHei, "bilinear", "disabled")
        s = s.movedim(1, -1)
        return (s,)


class SwarmImageCrop:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "x": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 8, "tooltip": "The x coordinate in pixels of the top left corner of the crop."}),
                "y": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 8, "tooltip": "The y coordinate in pixels of the top left corner of the crop."}),
                "width": ("INT", {"default": 512, "min": 64, "max": 8192, "step": 8, "tooltip": "The width in pixels of the crop."}),
                "height": ("INT", {"default": 512, "min": 64, "max": 8192, "step": 8, "tooltip": "The height in pixels of the crop."}),
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "crop"
    DESCRIPTION = "Crops an image to a specific region."

    def crop(self, image, x, y, width, height):
        if width <= 0 or height <= 0:
            return (image,)
        to_x = width + x
        to_y = height + y
        img = image[:, y:to_y, x:to_x, :]
        return (img,)


class SwarmVideoBoomerang:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
            }
        }

    CATEGORY = "SwarmUI/video"
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "boomerang"
    DESCRIPTION = "Creates a boomerang effect by having the video play in reverse after the end, as a simple trick to make it appear to loop smoothly forever."

    def boomerang(self, images):
        # return images followed by  reverse images
        images = torch.cat((images, images.flip(0)), 0)
        return (images,)


class SwarmImageNoise:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "amount": ("FLOAT", {"default": 0.25, "min": 0.0, "max": 10.0, "step": 0.01, "round": False}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff})
            },
            "optional": {
                "mask": ("MASK",)
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "add_noise"
    DESCRIPTION = "Adds random noise to an image."

    def add_noise(self, image, amount, seed, mask=None):
        generator = torch.manual_seed(seed)
        while image.dim() < 4:
            image = image.unsqueeze(0)
        noise = torch.randn(image.size(), dtype=image.dtype, layout=image.layout, generator=generator, device="cpu") * amount
        if mask is not None:
            while mask.dim() < 4:
                mask = mask.unsqueeze(0)
            mask = torch.nn.functional.interpolate(mask.to(image.device), size=(image.shape[1], image.shape[2]), mode="bicubic")
            if image.shape[3] == 3 and image.shape[1] > 3: # (channels-last)
                mask = mask.movedim(1, -1)
            noise = noise * mask
        img = image + noise.to(image.device)
        img = torch.clamp(img, 0, 1)
        return (img,)


class SwarmTrimFrames:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "trim_start": ("INT", {"default": 0, "min": 0, "max": 4096}),
                "trim_end": ("INT", {"default": 0, "min": 0, "max": 4096})
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "trim"
    DESCRIPTION = "Trims frames from the start and end of a video."

    def trim(self, image, trim_start, trim_end):
        if image.shape[0] <= 1:
            return (image,)
        s_in = image
        start = max(0, min(s_in.shape[0], trim_start))
        end = max(0, min(s_in.shape[0], trim_end))
        s = s_in[start:s_in.shape[0] - end].clone()
        return (s,)


class SwarmCountFrames:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",)
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("INT",)
    FUNCTION = "count"
    DESCRIPTION = "Counts the number of frames in an image."

    def count(self, image):
        return (image.shape[0],)


class SwarmImageWidth:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",)
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("INT",)
    FUNCTION = "get_width"
    DESCRIPTION = "Gets the width of an image."

    def get_width(self, image):
        return (image.shape[-2],)


class SwarmImageHeight:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",)
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("INT",)
    FUNCTION = "get_height"
    DESCRIPTION = "Gets the height of an image."

    def get_height(self, image):
        return (image.shape[-3],)


class SwarmImageCompositeMaskedColorCorrecting:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "destination": ("IMAGE",),
                "source": ("IMAGE",),
                "x": ("INT", {"default": 0, "min": 0, "max": MAX_RESOLUTION, "step": 1}),
                "y": ("INT", {"default": 0, "min": 0, "max": MAX_RESOLUTION, "step": 1}),
                "mask": ("MASK",),
                "correction_method": (["None", "Uniform", "Linear"], )
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "composite"
    DESCRIPTION = "Works like ImageCompositeMasked, but does color correction for inpainted images (ie outside-the-mask areas are expected to be identical)"

    def composite(self, destination, source, x, y, mask, correction_method):
        destination = destination.clone().movedim(-1, 1)
        source = source.clone().movedim(-1, 1).to(destination.device)
        source = comfy.utils.repeat_to_batch_size(source, destination.shape[0])

        x = max(-source.shape[3], min(x, destination.shape[3]))
        y = max(-source.shape[2], min(y, destination.shape[2]))

        left, top = (x, y)
        right, bottom = (left + source.shape[3], top + source.shape[2],)

        mask = mask.to(destination.device, copy=True)
        mask = torch.nn.functional.interpolate(mask.reshape((-1, 1, mask.shape[-2], mask.shape[-1])), size=(source.shape[2], source.shape[3]), mode="bilinear")
        mask = comfy.utils.repeat_to_batch_size(mask, source.shape[0])

        visible_width, visible_height = (destination.shape[3] - left + min(0, x), destination.shape[2] - top + min(0, y),)

        mask = mask[:, :, :visible_height, :visible_width]
        inverse_mask = torch.ones_like(mask) - mask

        source_section = source[:, :, :visible_height, :visible_width]
        dest_section = destination[:, :, top:bottom, left:right]

        # Fall through on "None"
        if correction_method == "Uniform":
            source_section = color_correct_uniform(source_section, dest_section, inverse_mask)
        elif correction_method == "Linear":
            source_section = color_correct_linear(source_section, dest_section, inverse_mask)

        source_portion = mask * source_section
        destination_portion = inverse_mask * dest_section

        destination[:, :, top:bottom, left:right] = source_portion + destination_portion
        return (destination.movedim(1, -1),)


def color_correct_uniform(source_section: torch.Tensor, dest_section: torch.Tensor, inverse_mask: torch.Tensor) -> torch.Tensor:
    thresholded = (inverse_mask.clamp(0, 1) - 0.9999).clamp(0, 1) * 10000
    thresholded_sum = thresholded.sum()
    if thresholded_sum > 50:
        source_hsv = rgb2hsv(source_section)
        dest_hsv = rgb2hsv(dest_section)
        source_hsv_masked = source_hsv * thresholded
        dest_hsv_masked = dest_hsv * thresholded
        diff = dest_hsv_masked - source_hsv_masked
        diff = diff.sum(dim=[0, 2, 3]) / thresholded_sum
        diff[0] = 0.0
        diff = diff.unsqueeze(0).unsqueeze(2).unsqueeze(2)
        source_hsv = source_hsv + diff
        source_hsv = source_hsv.clamp(0, 1)
        source_section = hsv2rgb(source_hsv)
    return source_section


def color_correct_linear(source_section: torch.Tensor, dest_section: torch.Tensor, inverse_mask: torch.Tensor) -> torch.Tensor:
    thresholded = (inverse_mask.clamp(0, 1) - 0.9999).clamp(0, 1) * 10000
    thresholded_sum = thresholded.sum()
    if thresholded_sum > 50:
        source_hsv = rgb2hsv(source_section)
        dest_hsv = rgb2hsv(dest_section)
        source_hsv_masked = source_hsv * thresholded
        dest_hsv_masked = dest_hsv * thresholded
        # Simple linear regression on dest as a function of source
        source_mean = source_hsv_masked.sum(dim=[0, 2, 3]) / thresholded_sum
        dest_mean = dest_hsv_masked.sum(dim=[0, 2, 3]) / thresholded_sum
        source_mean = source_mean.unsqueeze(0).unsqueeze(2).unsqueeze(2)
        dest_mean = dest_mean.unsqueeze(0).unsqueeze(2).unsqueeze(2)
        source_deviation = (source_hsv - source_mean) * thresholded
        dest_deviation = (dest_hsv - dest_mean) * thresholded
        numerator = torch.sum(source_deviation * dest_deviation, (0, 2, 3))
        denominator = torch.sum(source_deviation * source_deviation, (0, 2, 3)) 
        # When all src the same color, we fall back to assuming m = 1 (uniform offset)
        m = torch.where(denominator != 0, numerator / denominator, torch.tensor(1.0))
        m = m.unsqueeze(0).unsqueeze(2).unsqueeze(2) # 3
        b = dest_mean - source_mean * m
        m[0][0][0][0] = 1.0
        b[0][0][0][0] = 0.0
        source_hsv = m * source_hsv + b
        source_hsv = source_hsv.clamp(0, 1)
        source_section = hsv2rgb(source_hsv)
    return source_section


# from https://github.com/limacv/RGB_HSV_HSL
def rgb2hsv(rgb: torch.Tensor) -> torch.Tensor:
    cmax, cmax_idx = torch.max(rgb, dim=1, keepdim=True)
    cmin = torch.min(rgb, dim=1, keepdim=True)[0]
    delta = cmax - cmin
    hsv_h = torch.empty_like(rgb[:, 0:1, :, :])
    cmax_idx[delta == 0] = 3
    hsv_h[cmax_idx == 0] = (((rgb[:, 1:2] - rgb[:, 2:3]) / delta) % 6)[cmax_idx == 0]
    hsv_h[cmax_idx == 1] = (((rgb[:, 2:3] - rgb[:, 0:1]) / delta) + 2)[cmax_idx == 1]
    hsv_h[cmax_idx == 2] = (((rgb[:, 0:1] - rgb[:, 1:2]) / delta) + 4)[cmax_idx == 2]
    hsv_h[cmax_idx == 3] = 0.0
    hsv_h /= 6.0
    hsv_s = torch.where(cmax == 0, torch.tensor(0.0).type_as(rgb), delta / cmax)
    hsv_v = cmax
    return torch.cat([hsv_h, hsv_s, hsv_v], dim=1)


def hsv2rgb(hsv: torch.Tensor) -> torch.Tensor:
    hsv_h, hsv_s, hsv_l = hsv[:, 0:1], hsv[:, 1:2], hsv[:, 2:3]
    _c = hsv_l * hsv_s
    _x = _c * (- torch.abs(hsv_h * 6.0 % 2.0 - 1) + 1.0)
    _m = hsv_l - _c
    _o = torch.zeros_like(_c)
    idx = (hsv_h * 6.0).type(torch.uint8)
    idx = (idx % 6).expand(-1, 3, -1, -1)
    rgb = torch.empty_like(hsv)
    rgb[idx == 0] = torch.cat([_c, _x, _o], dim=1)[idx == 0]
    rgb[idx == 1] = torch.cat([_x, _c, _o], dim=1)[idx == 1]
    rgb[idx == 2] = torch.cat([_o, _c, _x], dim=1)[idx == 2]
    rgb[idx == 3] = torch.cat([_o, _x, _c], dim=1)[idx == 3]
    rgb[idx == 4] = torch.cat([_x, _o, _c], dim=1)[idx == 4]
    rgb[idx == 5] = torch.cat([_c, _o, _x], dim=1)[idx == 5]
    rgb += _m
    return rgb


NODE_CLASS_MAPPINGS = {
    "SwarmImageScaleForMP": SwarmImageScaleForMP,
    "SwarmImageCrop": SwarmImageCrop,
    "SwarmVideoBoomerang": SwarmVideoBoomerang,
    "SwarmImageNoise": SwarmImageNoise,
    "SwarmTrimFrames": SwarmTrimFrames,
    "SwarmCountFrames": SwarmCountFrames,
    "SwarmImageWidth": SwarmImageWidth,
    "SwarmImageHeight": SwarmImageHeight,
    "SwarmImageCompositeMaskedColorCorrecting": SwarmImageCompositeMaskedColorCorrecting
}
