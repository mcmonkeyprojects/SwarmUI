import folder_paths, torch, comfy, math, torchaudio
import comfy.utils, comfy.sd, nodes, node_helpers
from comfy_api.latest import io

MiniMaxReferences = io.Custom("MiniMaxReferences")

class SwarmLTXVAudioVAELoader(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="SwarmLTXVAudioVAELoader",
            display_name="Swarm LTXV Audio VAE Loader",
            category="SwarmUI/video",
            description="Loads an LTX-2 audio VAE from the VAE models folder.",
            inputs=[
                io.Combo.Input("vae_name", options=folder_paths.get_filename_list("vae"), tooltip="Audio VAE file."),
            ],
            outputs=[io.Vae.Output(display_name="Audio VAE")],
        )

    @classmethod
    def execute(cls, vae_name: str) -> io.NodeOutput:
        vae_path = folder_paths.get_full_path_or_raise("vae", vae_name)
        sd, metadata = comfy.utils.load_torch_file(vae_path, return_metadata=True)
        sd = comfy.utils.state_dict_prefix_replace(sd, {"audio_vae.": "autoencoder."})
        vae = comfy.sd.VAE(sd=sd, metadata=metadata)
        vae.throw_exception_if_invalid()
        return io.NodeOutput(vae)

def _resize(image, width, height, crop):
    # image [B, H, W, C] -> [B, height, width, 3]
    samples = image[..., :3].movedim(-1, 1)
    samples = comfy.utils.common_upscale(samples, width, height, "lanczos", crop)
    return samples.movedim(1, -1)

class SwarmMiniMaxH3AddKeyframes(io.ComfyNode):
    """Adds keyframes to MiniMax H3 format."""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SwarmMiniMaxH3AddKeyframes",
            display_name="Swarm MiniMax H3 Add Keyframes",
            category="SwarmUI/video",
            inputs=[
                io.Vae.Input("vae"),
                io.Latent.Input("latent"),
                io.Conditioning.Input("conditioning"),
                io.Image.Input("first_frame", optional=True),
                io.Image.Input("last_frame", optional=True),
            ],
            outputs=[io.Conditioning.Output(display_name="conditioning"),],
        )

    @classmethod
    def execute(cls, vae, latent, conditioning, first_frame=None, last_frame=None) -> io.NodeOutput:
        latent = latent["samples"].unbind()[0]
        frame_count = 5 + 17 * ((latent.shape[2] - 2) // 5)
        width = latent.shape[4] * 16
        height = latent.shape[3] * 16

        images = []
        keyframes = []
        if first_frame is not None:
            # geometry anchor: plain stretch to canvas
            img = _resize(first_frame[:1], width, height, "disabled")
            images.append(img)
            keyframes.append({"resolved_frame_index": 0, "image": img})
        if last_frame is not None:
            # follower: aspect-preserving cover-crop
            img = _resize(last_frame[:1], width, height, "center")
            images.append(img)
            keyframes.append({"resolved_frame_index": frame_count - 1, "image": img})

        if keyframes:
            for kf in keyframes:
                kf["latent"] = vae.encode(kf.pop("image"))
            conditioning = node_helpers.conditioning_set_values(conditioning, {
                "minimax_keyframes": keyframes,
                "minimax_frame_count": frame_count,
            })
        return io.NodeOutput(conditioning,)

########## MiniMax H3 direct rips - basically all the below is straight from comfy nodes_minimax_h3.py, but tweaked to be more useful ##########

def align_frame_count(n):
    while n % 17 != 5:
        n += 1
    return n

def video_latent_t(frame_count):
    return 2 if frame_count <= 5 else ((frame_count - 5) // 17) * 5 + 2

H3_FPS = 24
H3_AUDIO_LATENT_FPS = 40
H3_CANVAS_MULTIPLE = 32
H3_BASE_SHORT_EDGE = 768
H3_MAX_PIXELS = 768 * 1344
H3_REF_IMAGE_SHORT_EDGE = 2048

def temporal_shape(length):
    if length == 1:
        return 1, 1, 2
    elif length == 2:
        return 2, 2, 3
    frame_count = align_frame_count(max(5, length))
    duration = frame_count / H3_FPS
    return frame_count, video_latent_t(frame_count), round(duration * H3_AUDIO_LATENT_FPS)

def _empty_av_latent(width, height, length, batch_size=1):
    frame_count, latent_t, audio_t = temporal_shape(length)
    video = torch.zeros([batch_size, 24, latent_t, height // 16, width // 16],
                        device=comfy.model_management.intermediate_device())
    audio = torch.zeros([batch_size, 32, 2, audio_t],
                        device=comfy.model_management.intermediate_device())
    return {"samples": comfy.nested_tensor.NestedTensor((video, audio))}, frame_count

class SwarmEmptyMiniMaxH3LatentAV(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SwarmEmptyMiniMaxH3LatentAV",
            display_name="Swarm Empty MiniMax H3 AV Latent",
            category="SwarmUI/video",
            description="Joint video+audio latent for MiniMax H3.",
            inputs=[
                io.Int.Input("width", default=1344, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input("height", default=768, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input("length", default=124, min=1, max=3600, step=1, tooltip="Frame count at 24 fps, snapped up to the model's 17k+5 grid (124 = ~5s; trained range is ~124-362, longer is untested)"),
            ],
            outputs=[io.Latent.Output()],
        )

    @classmethod
    def execute(cls, width, height, length) -> io.NodeOutput:
        latent, _ = _empty_av_latent(width, height, length)
        return io.NodeOutput(latent)

def _adapt_canvas(width, height):
    ratio = width / height
    if ratio >= 1.0:
        nom_w, nom_h = H3_BASE_SHORT_EDGE * ratio, H3_BASE_SHORT_EDGE
    else:
        nom_w, nom_h = H3_BASE_SHORT_EDGE, H3_BASE_SHORT_EDGE / ratio
    if nom_w * nom_h > H3_MAX_PIXELS:
        s = math.sqrt(H3_MAX_PIXELS / (nom_w * nom_h))
        nom_w, nom_h = nom_w * s, nom_h * s
    return (max(H3_CANVAS_MULTIPLE, round(nom_w / H3_CANVAS_MULTIPLE) * H3_CANVAS_MULTIPLE),
            max(H3_CANVAS_MULTIPLE, round(nom_h / H3_CANVAS_MULTIPLE) * H3_CANVAS_MULTIPLE))

def _encode_ref_audio(audio_vae, audio):
    waveform = audio["waveform"]
    sr = audio["sample_rate"]
    vae_sr = getattr(audio_vae, "audio_sample_rate", 32000)
    if sr != vae_sr:
        waveform = torchaudio.functional.resample(waveform, sr, vae_sr)
    z = audio_vae.encode(waveform[:1].movedim(1, -1))
    return z, z.shape[-1]

class SwarmMiniMaxH3CollectReferences(io.ComfyNode):
    """Collects MiniMax H3 reference images / videos / audio into MiniMaxReferences."""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SwarmMiniMaxH3CollectReferences",
            display_name="Swarm MiniMax H3 Collect References",
            category="SwarmUI/video",
            description="<Picture i> / <Video k> / <Audio j> reference collection for MiniMax H3. Feed the output into SwarmTextEncodeAdvanced.",
            inputs=[
                io.Vae.Input("vae"),
                io.Vae.Input("audio_vae"),
                io.Int.Input("width", default=1344, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input("height", default=768, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input("length", default=124, min=1, max=3600, step=1, tooltip="Frame count at 24 fps, used to crop reference videos to the generation length."),
                io.Combo.Input("ref_image_size", options=["match", "max"], default="match", tooltip="Reference image sizing. 'match' scales each ref (down only, keeping aspect) to the generation's pixel area; 'max' uses the reference pipeline's 2048px short edge for best identity fidelity."),
                io.Autogrow.Input("ref_images", optional=True, template=io.Autogrow.TemplatePrefix(input=io.Image.Input("ref_image", tooltip="Reference image (downscaled to 2048 short edge if larger, never upscaled)"), prefix="ref_image_", min=0, max=9)),
                io.Autogrow.Input("ref_videos", optional=True, template=io.Autogrow.TemplatePrefix(input=io.Image.Input("ref_video", tooltip="Reference video frames at 24 fps (2-15s)"), prefix="ref_video_", min=0, max=3)),
                io.Autogrow.Input("ref_video_audios", optional=True, template=io.Autogrow.TemplatePrefix(input=io.Audio.Input("ref_video_audio", tooltip="Soundtrack of the same-numbered reference video"), prefix="ref_video_audio_", min=0, max=3)),
                io.Autogrow.Input("ref_audios", optional=True, template=io.Autogrow.TemplatePrefix(input=io.Audio.Input("ref_audio", tooltip="Standalone reference audio"), prefix="ref_audio_", min=0, max=3)),
            ],
            outputs=[MiniMaxReferences.Output(display_name="MiniMax References")],
        )

    @classmethod
    def execute(cls, vae, audio_vae, width, height, length, ref_image_size="match",
                ref_images=None, ref_videos=None, ref_video_audios=None, ref_audios=None) -> io.NodeOutput:
        frame_count, _, _ = temporal_shape(length)
        ref_items = []
        ref_blocks = []

        for img in (ref_images or {}).values():
            if img is None:
                continue
            h, w = img.shape[1], img.shape[2]
            if ref_image_size == "match":
                scale = min(1.0, math.sqrt((width * height) / (w * h)))
            else:
                scale = min(1.0, H3_REF_IMAGE_SHORT_EDGE / min(w, h))
            tw = max(H3_CANVAS_MULTIPLE, round(w * scale / H3_CANVAS_MULTIPLE) * H3_CANVAS_MULTIPLE)
            th = max(H3_CANVAS_MULTIPLE, round(h * scale / H3_CANVAS_MULTIPLE) * H3_CANVAS_MULTIPLE)
            resized = _resize(img[:1], tw, th, "disabled")
            z = vae.encode(resized)
            ref_items.append({"type": "image", "data": resized})
            ref_blocks.append({"kind": "image", "latent_h": th // 16, "latent_w": tw // 16, "latent": z})

        ref_video_audios = ref_video_audios or {}
        for name, video_frames in (ref_videos or {}).items():
            if video_frames is None:
                continue
            soundtrack = ref_video_audios.get("ref_video_audio_" + name.rsplit("_", 1)[-1])
            vh, vw = video_frames.shape[1], video_frames.shape[2]
            cw, ch = _adapt_canvas(vw, vh)
            if vw * vh < cw * ch:
                cw = max(H3_CANVAS_MULTIPLE, round(vw / H3_CANVAS_MULTIPLE) * H3_CANVAS_MULTIPLE)
                ch = max(H3_CANVAS_MULTIPLE, round(vh / H3_CANVAS_MULTIPLE) * H3_CANVAS_MULTIPLE)
            frames = _resize(video_frames, cw, ch, "disabled")
            if frames.shape[0] > frame_count:
                frames = frames[:frame_count]
            n = frames.shape[0]
            if n < 5:
                raise ValueError("MiniMax H3 reference videos need at least 5 frames (~0.2s at 24 fps)")
            while n % 17 != 5:
                n -= 1
            frames = frames[:n]
            z = vae.encode(frames)
            audio_latent, ref_audio_t = (None, 0)
            if soundtrack is not None:
                audio_latent, ref_audio_t = _encode_ref_audio(audio_vae, soundtrack)
                ref_items.append({"type": "audio"})
            sample_idx = list(range(0, frames.shape[0], H3_FPS // 2))
            qwen_frames = frames[sample_idx]
            ref_items.append({"type": "video", "data": qwen_frames,
                              "timestamps": [i / 2.0 for i in range(len(sample_idx))]})
            ref_blocks.append({"kind": "video_audio" if ref_audio_t else "video",
                               "latent_t": z.shape[2], "latent_h": ch // 16, "latent_w": cw // 16,
                               "ref_audio_t": ref_audio_t, "latent": z, "audio_latent": audio_latent})

        for audio in (ref_audios or {}).values():
            if audio is None:
                continue
            audio_latent, ref_audio_t = _encode_ref_audio(audio_vae, audio)
            ref_items.append({"type": "audio"})
            ref_blocks.append({"kind": "audio", "ref_audio_t": ref_audio_t, "audio_latent": audio_latent})

        return io.NodeOutput({"ref_items": ref_items, "ref_blocks": ref_blocks})

NODE_CLASS_MAPPINGS = {
    "SwarmLTXVAudioVAELoader": SwarmLTXVAudioVAELoader,
    "SwarmMiniMaxH3AddKeyframes": SwarmMiniMaxH3AddKeyframes,
    "SwarmEmptyMiniMaxH3LatentAV": SwarmEmptyMiniMaxH3LatentAV,
    "SwarmMiniMaxH3CollectReferences": SwarmMiniMaxH3CollectReferences,
}
