import torch
import comfy
import math

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


NODE_CLASS_MAPPINGS = {
    "SwarmImageScaleForMP": SwarmImageScaleForMP,
    "SwarmImageCrop": SwarmImageCrop,
    "SwarmVideoBoomerang": SwarmVideoBoomerang,
    "SwarmImageNoise": SwarmImageNoise,
}
