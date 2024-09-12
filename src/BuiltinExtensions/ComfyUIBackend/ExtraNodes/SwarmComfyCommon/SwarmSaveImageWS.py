from PIL import Image
import numpy as np
import comfy.utils
from server import PromptServer, BinaryEventTypes
import time, io, struct
import cv2

SPECIAL_ID = 12345 # Tells swarm that the node is going to output final images
VIDEO_ID = 12346

class SwarmSaveImageWS:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", ),
            },
            "optional": {
                "bit_depth": (["8", "16", "32"], {"default": "8"})
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    DESCRIPTION = "Acts like a special version of 'SaveImage' that doesn't actual save to disk, instead it sends directly over websocket. This is intended so that SwarmUI can save the image itself rather than having Comfy's Core save it."

    def save_images(self, images, bit_depth):
        pbar = comfy.utils.ProgressBar(SPECIAL_ID)
        step = 0
        for image in images:
            img_np = image.cpu().numpy()

            if img_np.ndim != 3 or img_np.shape[2] != 3:
                raise ValueError("Expected an RGB image with 3 channels.")

            if bit_depth == "32":
                img_np = img_np.astype(np.float32)
                img = self.convert_opencv_to_pil(img_np)
            elif bit_depth == "16":
                img_np = np.clip(img_np * 65535.0, 0, 65535).astype(np.uint16)
                img = self.convert_opencv_to_pil(img_np)
            else:
                i = np.clip(img_np * 255.0, 0, 255).astype(np.uint8)
                img = Image.fromarray(i, mode='RGB')
            pbar.update_absolute(step, SPECIAL_ID, ("PNG", img, None))
            step += 1

        return {}

    def convert_opencv_to_pil(self, img_np):
        try:
            if img_np.dtype == np.float32:
                # For 32-bit float images
                img_np = (img_np * 65535).astype(np.uint16)
            elif img_np.dtype == np.uint8:
                # For 8-bit images, no change needed
                pass
            elif img_np.dtype == np.uint16:
                # For 16-bit images, no change needed
                pass
            else:
                raise ValueError(f"Unsupported image dtype: {img_np.dtype}")

            # Convert BGR to RGB
            img_np = cv2.cvtColor(img_np, cv2.COLOR_BGR2RGB)

            # Create PIL Image directly from numpy array
            img = Image.fromarray(img_np)

            return img

        except Exception as e:
            print(f"Error converting OpenCV image to PIL: {e}")
            raise

    @classmethod
    def IS_CHANGED(s, images, bit_depth):
        return time.time()


class SwarmSaveAnimatedWebpWS:
    methods = {"default": 4, "fastest": 0, "slowest": 6}

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", ),
                "fps": ("FLOAT", {"default": 6.0, "min": 0.01, "max": 1000.0, "step": 0.01, "tooltip": "Frames per second, must match the actual generated speed or else you will get slow/fast motion."}),
                "lossless": ("BOOLEAN", {"default": True, "tooltip": "If true, the image will be saved losslessly, otherwise it will be saved with the quality specified. Lossless is best quality, but takes more file space."}),
                "quality": ("INT", {"default": 80, "min": 0, "max": 100, "tooltip": "Quality of the image as a percentage, only used if lossless is false. Smaller values save more space but look worse. 80 is a fine general value."}),
                "method": (list(s.methods.keys()),),
            },
        }

    CATEGORY = "SwarmUI/video"
    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    DESCRIPTION = "Acts like a special version of 'SaveAnimatedWEBP' that doesn't actual save to disk, instead it sends directly over websocket. This is intended so that SwarmUI can save the image itself rather than having Comfy's Core save it."

    def save_images(self, images, fps, lossless, quality, method):
        method = self.methods.get(method)
        pil_images = []
        for image in images:
            i = 255. * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            pil_images.append(img)

        out = io.BytesIO()
        type_num = 3
        header = struct.pack(">I", type_num)
        out.write(header)
        pil_images[0].save(out, save_all=True, duration=int(1000.0/fps), append_images=pil_images[1 : len(pil_images)], lossless=lossless, quality=quality, method=method, format='WEBP')
        out.seek(0)
        preview_bytes = out.getvalue()
        server = PromptServer.instance
        server.send_sync("progress", {"value": 12346, "max": 12346}, sid=server.client_id)
        server.send_sync(BinaryEventTypes.PREVIEW_IMAGE, preview_bytes, sid=server.client_id)

        return { }

    @classmethod
    def IS_CHANGED(s, images, fps, lossless, quality, method):
        return time.time()


NODE_CLASS_MAPPINGS = {
    "SwarmSaveImageWS": SwarmSaveImageWS,
    "SwarmSaveAnimatedWebpWS": SwarmSaveAnimatedWebpWS,
}
