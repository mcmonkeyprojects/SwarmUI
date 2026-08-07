import folder_paths
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

NODE_CLASS_MAPPINGS = {
    "SwarmLTXVAudioVAELoader": SwarmLTXVAudioVAELoader,
    "SwarmMiniMaxH3AddKeyframes": SwarmMiniMaxH3AddKeyframes,
}
