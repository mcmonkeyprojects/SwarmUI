from PIL import Image
import numpy as np
import comfy.utils
from server import PromptServer, BinaryEventTypes
import time, io, struct

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
                "bit_depth": (["8bit", "16bit"], {"default": "8bit"})
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
            if bit_depth == "16bit":
                i = 65535.0 * image.cpu().numpy()
                img = self.convert_opencv_to_pil(np.clip(i, 0, 65535).astype(np.uint16))
                server = PromptServer.instance
                server.send_sync("progress", {"value": SPECIAL_ID, "max": SPECIAL_ID}, sid=server.client_id)
                server.send_sync(BinaryEventTypes.PREVIEW_IMAGE, img, sid=server.client_id)
            else:
                i = 255.0 * image.cpu().numpy()
                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
                pbar.update_absolute(step, SPECIAL_ID, ("PNG", img, None))
            step += 1

        return {}

    def convert_opencv_to_pil(self, img_np):
        try:
            import cv2
            img_np = cv2.cvtColor(img_np, cv2.COLOR_BGR2RGB)
            success, img_encoded = cv2.imencode('.png', img_np)

            if img_encoded is None or not success:
                raise RuntimeError("OpenCV failed to encode image.")

            return img_encoded.tobytes()
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
