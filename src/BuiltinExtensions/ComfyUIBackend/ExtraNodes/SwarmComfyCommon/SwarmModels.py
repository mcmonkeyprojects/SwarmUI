import folder_paths
import comfy.utils, comfy.sd
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

NODE_CLASS_MAPPINGS = {
    "SwarmLTXVAudioVAELoader": SwarmLTXVAudioVAELoader,
}
