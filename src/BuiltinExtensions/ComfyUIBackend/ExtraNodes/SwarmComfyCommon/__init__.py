import os, folder_paths

from . import SwarmBlending, SwarmClipSeg, SwarmImages, SwarmInternalUtil, SwarmKSampler, SwarmLoadImageB64, SwarmLoraLoader, SwarmMasks, SwarmSaveImageWS, SwarmTiling, SwarmExtractLora, SwarmUnsampler, SwarmLatents, SwarmInputNodes, SwarmTextHandling, SwarmReference, SwarmMath

WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS = (
    SwarmBlending.NODE_CLASS_MAPPINGS
    | SwarmClipSeg.NODE_CLASS_MAPPINGS
    | SwarmImages.NODE_CLASS_MAPPINGS
    | SwarmInternalUtil.NODE_CLASS_MAPPINGS
    | SwarmKSampler.NODE_CLASS_MAPPINGS
    | SwarmLoadImageB64.NODE_CLASS_MAPPINGS
    | SwarmLoraLoader.NODE_CLASS_MAPPINGS
    | SwarmMasks.NODE_CLASS_MAPPINGS
    | SwarmSaveImageWS.NODE_CLASS_MAPPINGS
    | SwarmTiling.NODE_CLASS_MAPPINGS
    | SwarmExtractLora.NODE_CLASS_MAPPINGS
    | SwarmUnsampler.NODE_CLASS_MAPPINGS
    | SwarmLatents.NODE_CLASS_MAPPINGS
    | SwarmInputNodes.NODE_CLASS_MAPPINGS
    | SwarmTextHandling.NODE_CLASS_MAPPINGS
    | SwarmReference.NODE_CLASS_MAPPINGS
    | SwarmMath.NODE_CLASS_MAPPINGS
)

# TODO: Why is there no comfy core register method? 0.o
def register_model_folder(name):
    if name not in folder_paths.folder_names_and_paths:
        folder_paths.folder_names_and_paths[name] = ([os.path.join(folder_paths.models_dir, name)], folder_paths.supported_pt_extensions)
    else:
        folder_paths.folder_names_and_paths[name] = (folder_paths.folder_names_and_paths[name][0], folder_paths.supported_pt_extensions)

register_model_folder("yolov8")
