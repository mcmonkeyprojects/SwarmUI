from __future__ import annotations
import logging, math, torch
from comfy_api.latest import io

logger = logging.getLogger(__name__)


class SwarmVideoResampleFPS(io.ComfyNode):
    MIN_FPS: float = 0.01
    MAX_FPS: float = 99999.9
    STEP_FPS: float = 1.0
    DEFAULT_FPS_OUT: float = 24.0
    METHOD_LINEAR: str = "linear"
    METHOD_NEAREST: str = "nearest"

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="SwarmVideoResampleFPS",
            display_name="Swarm Video Resample FPS",
            category="SwarmUI/video",
            description="Resample a video from fps_in to fps_out while preserving total duration.",
            inputs=[
                io.Image.Input("images", tooltip="The images to resample."),
                io.Float.Input("fps_in", min=cls.MIN_FPS, max=cls.MAX_FPS, step=cls.STEP_FPS, tooltip="Source frame rate."),
                io.Float.Input("fps_out", default=cls.DEFAULT_FPS_OUT, min=cls.MIN_FPS, max=cls.MAX_FPS, step=cls.STEP_FPS, tooltip="Target frame rate."),
                io.Combo.Input("method", options=[cls.METHOD_LINEAR, cls.METHOD_NEAREST], default=cls.METHOD_LINEAR,
                    tooltip=(
                        "linear: each output frame is a linear blend of the two source frames bracketing its timestamp. Equivalent to ffmpeg's framerate filter. Slightly more expensive; avoids the duplicated-frame artifact. See https://ffmpeg.org/ffmpeg-filters.html#framerate\n"
                        "nearest: each output frame is the source frame closest in time. Equivalent to ffmpeg's fps filter. Cheap; can produce visible judder on pans. See https://ffmpeg.org/ffmpeg-filters.html#fps-1"
                    ),
                ),
            ],
            outputs=[io.Image.Output("images")],
        )

    @classmethod
    @torch.inference_mode()
    def execute(cls, images: torch.Tensor, fps_in: float, fps_out: float, method: str) -> io.NodeOutput:
        if fps_in <= 0 or fps_out <= 0:
            raise ValueError(f"SwarmVideoResampleFPS: fps_in and fps_out must be positive (got {fps_in}, {fps_out})")

        frame_count_in = int(images.shape[0])
        if frame_count_in <= 1 or math.isclose(fps_in, fps_out):
            return io.NodeOutput(images)

        # Compute output frame count and the fractional source-frame position for each output frame: 4 frames @ 2fps -> 4fps yields 8 frames at source positions [0, 0.5, 1.0, ..., 3.5]
        frame_count_out = max(1, round(frame_count_in / fps_in * fps_out))
        source_positions = torch.arange(frame_count_out, dtype=torch.float64, device=images.device) / fps_out * fps_in

        if method == cls.METHOD_NEAREST:
            resampled = cls._sample_nearest(images, source_positions)
        else:
            resampled = cls._sample_linear(images, source_positions)

        logger.info(f"SwarmVideoResampleFPS: {frame_count_in} frames @ {fps_in} fps -> {frame_count_out} frames @ {fps_out} fps ({method})")
        return io.NodeOutput(resampled)

    @classmethod
    def _sample_nearest(cls, source_frames: torch.Tensor, source_positions: torch.Tensor) -> torch.Tensor:
        """Pick the closest source frame for each fractional position.

        See https://ffmpeg.org/ffmpeg-filters.html#fps-1
        """
        nearest_idx = source_positions.round().long()
        last_valid_idx = source_frames.shape[0] - 1
        nearest_idx = torch.clamp(nearest_idx, 0, last_valid_idx)
        return source_frames[nearest_idx].contiguous()

    @classmethod
    def _sample_linear(cls, source_frames: torch.Tensor, source_positions: torch.Tensor) -> torch.Tensor:
        """Linearly blend the two source frames bracketing each fractional position.

        See https://ffmpeg.org/ffmpeg-filters.html#framerate
        """
        last_valid_idx = source_frames.shape[0] - 1
        lower_idx = torch.clamp(source_positions.floor().long(), 0, last_valid_idx)
        upper_idx = torch.clamp(lower_idx + 1, 0, last_valid_idx)
        blend_weight = (source_positions - lower_idx.to(torch.float64)).to(source_frames.dtype)
        while blend_weight.ndim < source_frames.ndim:
            blend_weight = blend_weight.unsqueeze(-1)

        lower_frames = source_frames[lower_idx]
        upper_frames = source_frames[upper_idx]
        return ((1.0 - blend_weight) * lower_frames + blend_weight * upper_frames).contiguous()


NODE_CLASS_MAPPINGS = {
    "SwarmVideoResampleFPS": SwarmVideoResampleFPS,
}
