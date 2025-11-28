import comfy, folder_paths, execution
from server import PromptServer
from comfy import samplers
import functools

# This is purely a hack to provide a list of embeds in the object_info report.
# Code referenced from Comfy VAE impl. Probably does nothing useful in an actual workflow.
class SwarmEmbedLoaderListProvider:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "embed_name": (folder_paths.get_filename_list("embeddings"), )
            }
        }

    CATEGORY = "SwarmUI/internal"
    RETURN_TYPES = ("EMBEDDING",)
    FUNCTION = "load_embed"
    DESCRIPTION = "Internal node just intended to provide a list of currently known embeddings to Swarm. You can also use it to blindly load an embedding file if you need to."

    def load_embed(self, embed_name):
        embed_path = folder_paths.get_full_path("embedding", embed_name)
        sd = comfy.utils.load_torch_file(embed_path)
        return (sd,)


class SwarmJustLoadTheModelPlease:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP,GEMMA",),
                "vae": ("VAE",),
            }
        }

    CATEGORY = "SwarmUI/internal"
    RETURN_TYPES = ()
    FUNCTION = "just_load"
    OUTPUT_NODE = True
    DESCRIPTION = "Internal node that acts as a final output for a model/clip/vae. This allows swarm to load models when needed without generating anything."

    def just_load(self, model, clip, vae):
        if model is None:
            raise ValueError("The model failed to load")
        if clip is None:
            raise ValueError("The text encoders (CLIP) failed to load. This often means the model architecture is selected wrong in the models tab, or that you saved the model to the wrong folder.")
        if vae is None:
            raise ValueError("The VAE failed to load")
        return {}


NODE_CLASS_MAPPINGS = {
    "SwarmEmbedLoaderListProvider": SwarmEmbedLoaderListProvider,
    "SwarmJustLoadTheModelPlease": SwarmJustLoadTheModelPlease
}


# This is a dirty hack to shut up the errors from Dropdown combo mismatch, pending Comfy upstream fix
ORIG_EXECUTION_VALIDATE = execution.validate_inputs
async def validate_inputs(prompt_id, prompt, item, validated):
    raw_result = await ORIG_EXECUTION_VALIDATE(prompt_id, prompt, item, validated)
    if raw_result is None:
        return None
    (did_succeed, errors, unique_id) = raw_result
    if did_succeed:
        return raw_result
    for error in errors:
        if error['type'] == "return_type_mismatch":
            o_id = error['extra_info']['linked_node'][0]
            o_class_type = prompt[o_id]['class_type']
            if o_class_type == "SwarmInputModelName" or o_class_type == "SwarmInputDropdown":
                errors.remove(error)
    did_succeed = len(errors) == 0
    return (did_succeed, errors, unique_id)

execution.validate_inputs = validate_inputs

# Comfy's app logger has broken terminal compat, so violently force it to auto-flush
try:
    from app import logger
    def patch_interceptor(interceptor):
        if interceptor:
            orig_interceptor_write = interceptor.write
            def write(self, data):
                orig_interceptor_write(data)
                self.flush()
            interceptor.write = functools.partial(write, interceptor)
            # Force UTF-8 too, to prevent encoding errors (Comfy will full crash outputting some languages)
            # (Swarm's C# engine has code to forcibly assume UTF-8, so this is safe. Otherwise it would wonk the terminal if the terminal isn't set to UTF-8)
            interceptor.reconfigure(encoding='utf-8')
    patch_interceptor(logger.stdout_interceptor)
    patch_interceptor(logger.stderr_interceptor)
except Exception as e:
    import traceback
    traceback.print_exc()

# comfy's server/PromptServer is janky with EventID=4, so overwrite send_bytes to interpret EventID=9999123 as 4
try:
    server = PromptServer.instance
    orig_server_send_bytes = server.send_bytes
    async def send_bytes(self, event, data, sid=None):
        if event == 9999123:
            event = 4
        await orig_server_send_bytes(event, data, sid=sid)
    server.send_bytes = functools.partial(send_bytes, server)
except Exception as e:
    import traceback
    traceback.print_exc()

# Hide .swarmpreview files from Comfy image load list
try:
    orig_folder_paths_filter_files_content_types = folder_paths.filter_files_content_types
    def filter_files_content_types(*args, **kwargs):
        files = orig_folder_paths_filter_files_content_types(*args, **kwargs)
        files = [f for f in files if not f.endswith(".swarmpreview.jpg") and not f.endswith(".swarmpreview.webp")]
        return files
    folder_paths.filter_files_content_types = filter_files_content_types
except Exception as e:
    import traceback
    traceback.print_exc()
