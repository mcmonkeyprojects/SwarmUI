import folder_paths, torch, comfy
import comfy.utils, comfy.sd, nodes, node_helpers
from comfy_api.latest import io

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

def align_frame_count(n):
    while n % 17 != 5:
        n += 1
    return n

def video_latent_t(frame_count):
    return 2 if frame_count <= 5 else ((frame_count - 5) // 17) * 5 + 2

H3_FPS = 24
H3_AUDIO_LATENT_FPS = 40

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

NODE_CLASS_MAPPINGS = {
    "SwarmLTXVAudioVAELoader": SwarmLTXVAudioVAELoader,
    "SwarmMiniMaxH3AddKeyframes": SwarmMiniMaxH3AddKeyframes,
    "SwarmEmptyMiniMaxH3LatentAV": SwarmEmptyMiniMaxH3LatentAV,
}
