from PIL import Image
import numpy as np
import av, comfy.audio
from server import PromptServer, BinaryEventTypes
import time, io, struct

SPECIAL_ID = 12345 # Tells swarm that the node is going to output final images
VIDEO_ID = 12346
TEXT_ID = 12347

def send_image_to_server_raw(type_num: int, save_me: callable, id: int, event_type: int = BinaryEventTypes.PREVIEW_IMAGE):
    out = io.BytesIO()
    header = struct.pack(">I", type_num)
    out.write(header)
    save_me(out)
    out.seek(0)
    preview_bytes = out.getvalue()
    server = PromptServer.instance
    server.send_sync("progress", {"value": id, "max": id}, sid=server.client_id)
    server.send_sync(event_type, preview_bytes, sid=server.client_id)

class SwarmSaveImageWS:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", ),
            },
            "optional": {
                "bit_depth": (["8bit", "16bit", "raw"], {"default": "8bit"})
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    DESCRIPTION = "Acts like a special version of 'SaveImage' that doesn't actual save to disk, instead it sends directly over websocket. This is intended so that SwarmUI can save the image itself rather than having Comfy's Core save it."

    def save_images(self, images, bit_depth = "8bit"):
        for image in images:
            if bit_depth == "raw":
                i = 255.0 * image.cpu().numpy()
                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
                def do_save(out):
                    img.save(out, format='BMP')
                send_image_to_server_raw(1, do_save, SPECIAL_ID, event_type=10)
            elif bit_depth == "16bit":
                i = 65535.0 * image.cpu().numpy()
                img = self.convert_img_16bit(np.clip(i, 0, 65535).astype(np.uint16))
                send_image_to_server_raw(2, lambda out: out.write(img), SPECIAL_ID)
            else:
                i = 255.0 * image.cpu().numpy()
                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
                def do_save(out):
                    img.save(out, format='PNG')
                send_image_to_server_raw(2, do_save, SPECIAL_ID)

        return {}

    def convert_img_16bit(self, img_np):
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
    def IS_CHANGED(s, images, bit_depth = "8bit"):
        return time.time()


class SwarmSaveAudioWS:
    formats = {
        "mp3": ("mp3", "libmp3lame", 8),
        "wav": ("wav", "pcm_s16le", 9),
        "flac": ("flac", "flac", 10),
        "ogg": ("opus", "libopus", 11),
    }
    opus_rates = [8000, 12000, 16000, 24000, 48000]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO",),
                "format": (list(cls.formats.keys()), {"default": "mp3"}),
            }
        }

    CATEGORY = "SwarmUI/audio"
    RETURN_TYPES = ()
    FUNCTION = "save_audio"
    OUTPUT_NODE = True
    DESCRIPTION = "Acts like a special version of 'SaveAudio' that doesn't actual save to disk, instead it sends directly over websocket. This is intended so that SwarmUI can save the audio itself rather than having Comfy's Core save it."

    def save_audio(self, audio, format):
        if audio is None:
            raise ValueError("SwarmSaveAudioWS: input audio is None.")
        container_format, codec, type_num = self.formats[format]
        for batch_number, waveform in enumerate(audio["waveform"].cpu()):
            sample_rate = audio["sample_rate"]
            if format == "ogg" and sample_rate not in self.opus_rates:
                sample_rate = min((rate for rate in self.opus_rates if rate > sample_rate), default=48000)
                waveform = comfy.audio.resample(waveform, audio["sample_rate"], sample_rate)

            layout = "mono" if waveform.shape[0] == 1 else "stereo"
            output_buffer = io.BytesIO()
            output_container = av.open(output_buffer, mode="w", format=container_format)
            output_stream = output_container.add_stream(codec, rate=sample_rate, layout=layout)
            if format == "mp3":
                output_stream.codec_context.qscale = 1
            elif format == "ogg":
                output_stream.bit_rate = 128000

            frame = av.AudioFrame.from_ndarray(
                waveform.movedim(0, 1).reshape(1, -1).float().numpy(),
                format="flt",
                layout=layout,
            )
            frame.sample_rate = sample_rate
            frame.pts = 0
            output_container.mux(output_stream.encode(frame))
            output_container.mux(output_stream.encode(None))
            output_container.close()

            send_image_to_server_raw(type_num | (batch_number << 4), lambda out: out.write(output_buffer.getvalue()), SPECIAL_ID)
        return { }

    @classmethod
    def IS_CHANGED(cls, audio, format):
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

        def do_save(out):
            pil_images[0].save(out, save_all=True, duration=int(1000.0/fps), append_images=pil_images[1 : len(pil_images)], lossless=lossless, quality=quality, method=method, format='WEBP')
        send_image_to_server_raw(3, do_save, VIDEO_ID)

        return { }

    @classmethod
    def IS_CHANGED(s, images, fps, lossless, quality, method):
        return time.time()


class SwarmAddSaveMetadataWS:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "key": ("STRING", {"tooltip": "The key to add to the metadata tracker. Must be simple A-Z plain text or underscores."}),
                "value": ("STRING", {"tooltip": "The value to add to the metadata tracker."}),
            }
        }

    CATEGORY = "SwarmUI/images"
    RETURN_TYPES = ()
    FUNCTION = "add_save_metadata"
    OUTPUT_NODE = True
    DESCRIPTION = "Adds a metadata key/value pair to SwarmUI's metadata tracker for this generation, which will be appended to any images saved after this node triggers. Note that keys overwrite, not add. Any key can have only one value."

    def add_save_metadata(self, key, value):
        full_text = f"{key}:{value}"
        full_text_bytes = full_text.encode('utf-8')
        send_image_to_server_raw(0, lambda out: out.write(full_text_bytes), TEXT_ID, event_type=BinaryEventTypes.TEXT)
        return {}

    @classmethod
    def IS_CHANGED(s, key, value):
        return time.time()


NODE_CLASS_MAPPINGS = {
    "SwarmSaveImageWS": SwarmSaveImageWS,
    "SwarmSaveAudioWS": SwarmSaveAudioWS,
    "SwarmSaveAnimatedWebpWS": SwarmSaveAnimatedWebpWS,
    "SwarmAddSaveMetadataWS": SwarmAddSaveMetadataWS,
}
