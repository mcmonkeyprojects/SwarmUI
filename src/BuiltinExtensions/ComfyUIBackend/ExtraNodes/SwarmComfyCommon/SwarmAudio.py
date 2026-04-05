import torch, logging, time

logger = logging.getLogger(__name__)

class SwarmDebugAudio:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO",),
            }
        }

    CATEGORY = "SwarmUI/debug"
    RETURN_TYPES = ()
    FUNCTION = "debug_audio"
    OUTPUT_NODE = True
    DESCRIPTION = "Debugs audio info to the console"

    def debug_audio(self, audio):
        logger.info("------- AUDIO DEBUG -------")
        logger.info(f"Audio: {audio}")
        if audio is None:
            logger.info("No audio provided - NoneType")
        else:
            logger.info(f"Audio sample rate: {audio['sample_rate']}")
            audio = audio['waveform']
            logger.info(f"Audio shape: {audio.shape}")
            logger.info(f"Audio dtype: {audio.dtype}")
            logger.info(f"Audio min: {audio.min()}")
            logger.info(f"Audio max: {audio.max()}")
            logger.info(f"Audio mean: {audio.mean()}")
            logger.info(f"Audio std: {audio.std()}")
            logger.info(f"Audio sum: {audio.sum()}")
            logger.info(f"Audio effective duration: {audio.shape[2] / audio['sample_rate']}s")
        logger.info("------- END AUDIO DEBUG -------")
        return { }

    @classmethod
    def IS_CHANGED(s, audio):
        return time.time()

class SwarmEnsureAudio:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO",),
                "target_duration": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 9999999.0, "step": 0.1}),
            }
        }

    CATEGORY = "SwarmUI/audio"
    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "ensure_audio"
    DESCRIPTION = "Ensures audio exists and is at least the given duration"

    def ensure_audio(self, audio, target_duration):
        if audio is None:
            audio = { 'waveform': torch.zeros((1, 2, 0)), 'sample_rate': 48000 }
        waveform = audio['waveform']
        sample_rate = audio['sample_rate']
        pad_samples = int(target_duration * sample_rate) - waveform.shape[2]
        if pad_samples > 0:
            waveform = torch.cat([torch.zeros((waveform.shape[0], waveform.shape[1], pad_samples), dtype=waveform.dtype), waveform], dim=2)
        out_audio = { 'waveform': waveform, 'sample_rate': sample_rate }
        return (out_audio,)

NODE_CLASS_MAPPINGS = {
    "SwarmDebugAudio": SwarmDebugAudio,
    "SwarmEnsureAudio": SwarmEnsureAudio,
}
