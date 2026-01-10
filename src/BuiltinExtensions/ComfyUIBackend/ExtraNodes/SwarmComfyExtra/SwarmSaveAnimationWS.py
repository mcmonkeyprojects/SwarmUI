import comfy, folder_paths, io, struct, subprocess, os, random, sys, time, wave
from PIL import Image
import numpy as np
from server import PromptServer, BinaryEventTypes
from imageio_ffmpeg import get_ffmpeg_exe

SPECIAL_ID = 12345
VIDEO_ID = 12346
FFMPEG_PATH = get_ffmpeg_exe()

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


class SwarmSaveAnimationWS:
    methods = {"default": 4, "fastest": 0, "slowest": 6}

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", ),
                "fps": ("FLOAT", {"default": 6.0, "min": 0.01, "max": 1000.0, "step": 0.01}),
                "lossless": ("BOOLEAN", {"default": True}),
                "quality": ("INT", {"default": 80, "min": 0, "max": 100}),
                "method": (list(s.methods.keys()),),
                "format": (["webp", "gif", "gif-hd", "h264-mp4", "h265-mp4", "webm", "prores"],),
            },
            "optional": {
                "audio": ("AUDIO", )
            }
        }

    CATEGORY = "SwarmUI/video"
    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True

    def save_images(self, images, fps, lossless, quality, method, format, audio=None):
        method = self.methods.get(method)
        if images.shape[0] == 0:
            return { }
        if images.shape[0] == 1:
            pbar = comfy.utils.ProgressBar(SPECIAL_ID)
            i = 255.0 * images[0].cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            def do_save(out):
                img.save(out, format='PNG')
            send_image_to_server_raw(2, do_save, SPECIAL_ID)
            #pbar.update_absolute(0, SPECIAL_ID, ("PNG", img, None))
            return { }

        out_img = io.BytesIO()
        if format in ["webp", "gif"]:
            if format == "webp":
                type_num = 3
            else:
                type_num = 4
            pil_images = []
            for image in images:
                i = 255. * image.cpu().numpy()
                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
                pil_images.append(img)
            pil_images[0].save(out_img, save_all=True, duration=int(1000.0 / fps), append_images=pil_images[1 : len(pil_images)], lossless=lossless, quality=quality, method=method, format=format.upper(), loop=0)
        else:
            i = 255. * images.cpu().numpy()
            raw_images = np.clip(i, 0, 255).astype(np.uint8)
            args = [FFMPEG_PATH, "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                    "-s", f"{len(raw_images[0][0])}x{len(raw_images[0])}", "-r", str(fps), "-i", "-", "-n" ]
            audio_args = None
            video_args = None
            if format == "h264-mp4":
                video_args = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19"]
                ext = "mp4"
                audio_args = ["-c:a", "aac"]
                type_num = 5
            elif format == "h265-mp4":
                video_args = ["-c:v", "libx265", "-pix_fmt", "yuv420p"]
                ext = "mp4"
                audio_args = ["-c:a", "aac"]
                type_num = 5
            elif format == "webm":
                video_args = ["-pix_fmt", "yuv420p", "-crf", "23"]
                ext = "webm"
                audio_args = ["-c:a", "libvorbis"]
                type_num = 6
            elif format == "prores":
                video_args = ["-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le"]
                ext = "mov"
                audio_args = ["-c:a", "pcm_s16le"]
                type_num = 7
            elif format == "gif-hd":
                video_args = ["-filter_complex", "split=2 [a][b]; [a] palettegen [pal]; [b] [pal] paletteuse"]
                ext = "gif"
                type_num = 4
            path = folder_paths.get_save_image_path("swarm_tmp_", folder_paths.get_temp_directory())[0]
            rand = '%016x' % random.getrandbits(64)
            file = os.path.join(path, f"swarm_tmp_{rand}.{ext}")
            file_2 = None
            audio_input = []
            if audio is not None and audio_args is not None:
                waveform = audio['waveform']
                if waveform.dim() == 3:
                    waveform = waveform[0]
                sample_rate = audio['sample_rate']
                channels = waveform.shape[0]
                num_audio_samples = waveform.shape[1]
                video_duration = len(raw_images) / fps
                target_samples = int(video_duration * sample_rate)
                audio_np = waveform.cpu().numpy()
                if num_audio_samples > target_samples:
                    audio_np = audio_np[:, :target_samples]
                elif num_audio_samples < target_samples:
                    padding = np.zeros((channels, target_samples - num_audio_samples), dtype=audio_np.dtype)
                    audio_np = np.concatenate([audio_np, padding], axis=1)
                audio_np = audio_np.T
                audio_int16 = (np.clip(audio_np, -1.0, 1.0) * 32767).astype(np.int16)
                file_2 = os.path.join(path, f"swarm_tmp_{rand}_audio.wav")
                with wave.open(file_2, 'wb') as wav_file:
                    wav_file.setnchannels(channels)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(sample_rate)
                    wav_file.writeframes(audio_int16.tobytes())
                audio_input = ["-i", file_2]
            else:
                audio_args = []
            result = subprocess.run(args + audio_input + video_args + audio_args + [file], input=raw_images.tobytes(), capture_output=True)
            if result.returncode != 0:
                print(f"ffmpeg failed with return code {result.returncode}", file=sys.stderr)
                f_out = result.stdout.decode("utf-8").strip()
                f_err = result.stderr.decode("utf-8").strip()
                if f_out:
                    print("ffmpeg out: " + f_out, file=sys.stderr)
                if f_err:
                    print("ffmpeg error: " + f_err, file=sys.stderr)
                raise Exception(f"ffmpeg failed: {f_err}")
            # TODO: Is there a way to get ffmpeg to operate entirely in memory?
            with open(file, "rb") as f:
                out_img.write(f.read())
            os.remove(file)
            if file_2 is not None:
                os.remove(file_2)

        out = io.BytesIO()
        header = struct.pack(">I", type_num)
        out.write(header)
        out.write(out_img.getvalue())
        out.seek(0)
        preview_bytes = out.getvalue()
        server = PromptServer.instance
        server.send_sync("progress", {"value": 12346, "max": 12346}, sid=server.client_id)
        server.send_sync(BinaryEventTypes.PREVIEW_IMAGE, preview_bytes, sid=server.client_id)

        return { }

    @classmethod
    def IS_CHANGED(s, images, fps, lossless, quality, method, format, audio=None):
        return time.time()


NODE_CLASS_MAPPINGS = {
    "SwarmSaveAnimationWS": SwarmSaveAnimationWS,
}
