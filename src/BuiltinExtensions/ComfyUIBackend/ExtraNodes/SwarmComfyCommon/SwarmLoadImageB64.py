from PIL import Image, ImageOps
import numpy as np
import torch, base64, io
from comfy_api.input_impl import VideoFromFile
try:
    from comfy_extras.nodes_audio import load as raw_audio_load
except:
    print("Error: Nodes_Audio failed to import, Swarm will not be able to load audio files.")

def b64_to_img_and_mask(image_base64):
    imageData = base64.b64decode(image_base64)
    i = Image.open(io.BytesIO(imageData))
    if hasattr(i, 'is_animated') and i.is_animated:
        images = []
        for frame in range(i.n_frames):
            i.seek(frame)
            images.append(i.convert("RGB"))
        i.seek(0)
        image = np.array(images).astype(np.float32) / 255.0
        image = torch.from_numpy(image)
    else:
        i = ImageOps.exif_transpose(i)
        image = i.convert("RGB")
        image = np.array(image).astype(np.float32) / 255.0
        image = torch.from_numpy(image)[None,]
    if 'A' in i.getbands():
        mask = np.array(i.getchannel('A')).astype(np.float32) / 255.0
        mask = 1. - torch.from_numpy(mask)
    else:
        mask = torch.zeros((64,64), dtype=torch.float32, device="cpu")
    return (image, mask.unsqueeze(0))

class SwarmLoadImageB64:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image_base64": ("STRING", {"multiline": True})
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "load_image_b64"
    DESCRIPTION = "Loads an image from a base64 string. Works like a regular LoadImage node, but with input format designed to be easier to use through automated calls, including SwarmUI with custom workflows."

    def load_image_b64(self, image_base64):
        return b64_to_img_and_mask(image_base64)

class SwarmLoadVideoB64:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "video_base64": ("STRING", {"multiline": True})
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("VIDEO",)
    FUNCTION = "load_video_b64"
    DESCRIPTION = "Loads a video from a base64 string. Works like a regular LoadVideo node, but with input format designed to be easier to use through automated calls, including SwarmUI with custom workflows."

    def load_video_b64(self, video_base64):
        video_data = base64.b64decode(video_base64)
        video_bytes = io.BytesIO(video_data)
        return (VideoFromFile(video_bytes), )

class SwarmLoadAudioB64:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio_base64": ("STRING", {"multiline": True})
            }
        }
    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "load_audio_b64"
    DESCRIPTION = "Loads an audio from a base64 string. Works like a regular LoadAudio node, but with input format designed to be easier to use through automated calls, including SwarmUI with custom workflows."

    def load_audio_b64(self, audio_base64):
        audio_data = base64.b64decode(audio_base64)
        audio_bytes = io.BytesIO(audio_data)
        waveform, sample_rate = raw_audio_load(audio_bytes)
        audio = {"waveform": waveform.unsqueeze(0), "sample_rate": sample_rate}
        return (audio, )

NODE_CLASS_MAPPINGS = {
    "SwarmLoadImageB64": SwarmLoadImageB64,
    "SwarmLoadVideoB64": SwarmLoadVideoB64,
    "SwarmLoadAudioB64": SwarmLoadAudioB64,
}
