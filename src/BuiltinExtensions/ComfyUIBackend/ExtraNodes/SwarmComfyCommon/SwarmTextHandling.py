import torch, comfy
from nodes import MAX_RESOLUTION


# LLaMA template for Hunyuan Image2Video.
# This is actually a single-line monstrosity due to the way it's formatted.
# This is probably an accident from the python devs misunderstanding how string lines work,
# but, well, we're just matching what they did and that's what they did.
PROMPT_TEMPLATE_ENCODE_VIDEO_I2V = (
    "<|start_header_id|>system<|end_header_id|>\n\n<image>\nDescribe the video by detailing the following aspects according to the reference image: "
    "1. The main content and theme of the video."
    "2. The color, shape, size, texture, quantity, text, and spatial relationships of the objects."
    "3. Actions, events, behaviors temporal relationships, physical movement changes of the objects."
    "4. background environment, light, style and atmosphere."
    "5. camera angles, movements, and transitions used in the video:<|eot_id|>\n\n"
    "<|start_header_id|>user<|end_header_id|>\n\n{}<|eot_id|>"
    "<|start_header_id|>assistant<|end_header_id|>\n\n"
)

class SwarmClipTextEncodeAdvanced:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "clip": ("CLIP", ),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000, "tooltip": "How many sampling steps will be ran - this is needed for per-step features (from-to/alternate/...) to work properly."}),
                "prompt": ("STRING", {"multiline": True, "dynamicPrompts": True, "tooltip": "Your actual prompt text."} ),
                "width": ("INT", {"default": 1024.0, "min": 0, "max": MAX_RESOLUTION, "tooltip": "Intended width of the image, used by some models (eg SDXL)."}),
                "height": ("INT", {"default": 1024.0, "min": 0, "max": MAX_RESOLUTION, "tooltip": "Intended height of the image, used by some models (eg SDXL)."}),
                "target_width": ("INT", {"default": 1024.0, "min": 0, "max": MAX_RESOLUTION, "tooltip": "Actual width of the image, used by some models (eg SDXL)."}),
                "target_height": ("INT", {"default": 1024.0, "min": 0, "max": MAX_RESOLUTION, "tooltip": "Actual height of the image, used by some models (eg SDXL)."}),
            },
            "optional": {
                "guidance": ("FLOAT", {"default": -1, "min": -1, "max": 100.0, "step": 0.1, "tooltip": "Guidance value to embed, used by some models (eg Flux)."}),
                "llama_template": ("STRING", {"default": "", "multiline": True, "tooltip": "Template for the LLaMA model, if applicable."}),
                "clip_vision_output": ("CLIP_VISION_OUTPUT", {"default": None, "tooltip": "Optional CLIP Vision Output to use for the LLaMA model, if applicable."}),
            }
        }

    CATEGORY = "SwarmUI/clip"
    RETURN_TYPES = ("CONDITIONING",)
    FUNCTION = "encode"
    DESCRIPTION = "Acts like the regular CLIPTextEncode, but supports more advanced special features like '<break>', '[from:to:when]', '[alter|nate]', ..."

    def encode(self, clip, steps: int, prompt: str, width: int, height: int, target_width: int, target_height: int, guidance: float = -1, llama_template = None, clip_vision_output = None):
        if llama_template == "hunyuan_image":
            llama_template = PROMPT_TEMPLATE_ENCODE_VIDEO_I2V

        def tokenize(text: str):
            if clip_vision_output is not None:
                return clip.tokenize(text, llama_template=llama_template, image_embeds=clip_vision_output.mm_projected)
            else:
                return clip.tokenize(text)

        encoding_cache = {}

        def text_to_cond(text: str, start_percent: float, end_percent: float):
            text = text.replace("\0\1", "[").replace("\0\2", "]").replace("\0\3", "embedding:")
            if text in encoding_cache:
                cond_arr = encoding_cache[text]
            else:
                cond_chunks = text.split("<break>")
                tokens = tokenize(cond_chunks[0])
                cond_arr = clip.encode_from_tokens_scheduled(tokens)
                if len(cond_chunks) > 1:
                    for chunk in cond_chunks[1:]:
                        tokens = tokenize(chunk)
                        cond_arr_chunk = clip.encode_from_tokens_scheduled(tokens)
                        catted_cond = torch.cat([cond_arr[0][0], cond_arr_chunk[0][0]], dim=1)
                        cond_arr[0] = [catted_cond, cond_arr[0][1]]
                encoding_cache[text] = cond_arr
            result = {"pooled_output": cond_arr[0][1]["pooled_output"], "width": width, "height": height, "crop_w": 0, "crop_h": 0, "target_width": target_width, "target_height": target_height, "start_percent": start_percent, "end_percent": end_percent}
            if guidance >= 0:
                result["guidance"] = guidance
            out_cond_arr = [[cond_arr[0][0], result]]
            out_cond_arr.extend(cond_arr[1:])
            return out_cond_arr

        prompt = prompt.replace("\\[", "\0\1").replace("\\]", "\0\2").replace("embedding:", "\0\3")

        chunks = []
        any = [False]
        escapable = ["\\", "[", "]", ":", "|", "(", ")", "<", ">"]

        def append_chunk(text: str, applies_to: list[int], can_subprocess: bool, limit_to: list[int]):
            applies_to = [i for i in applies_to if i in limit_to]
            fixed_text = ""
            do_skip = False
            for i in range(len(text)):
                if text[i] == "\\" and not do_skip and i + 1 < len(text) and text[i + 1] in escapable:
                    do_skip = True
                else:
                    do_skip = False
                    fixed_text += text[i]
            if can_subprocess and '[' in fixed_text:
                get_chunks(fixed_text, applies_to)
            else:
                chunks.append({'text': text, 'applies_to': applies_to})

        def get_chunks(remaining: str, limit_to: list[int] = [i for i in range(steps)]):
            while True:
                start = remaining.find("[")
                if start == -1:
                    append_chunk(remaining, [i for i in range(steps)], False, limit_to)
                    break

                end = -1
                count = 0
                do_skip = False
                colon_indices = []
                pipe_indices = []
                for i in range(start + 1, len(remaining)):
                    char = remaining[i]
                    if char == "\\" and not do_skip and i + 1 < len(remaining) and remaining[i + 1] in escapable:
                        do_skip = True
                    elif do_skip:
                        do_skip = False
                    elif char == "[":
                        count += 1
                    elif char == "]":
                        if count == 0:
                            end = i
                            break
                        count -= 1
                    elif char == ":" and count == 0 and len(pipe_indices) == 0:
                        colon_indices.append(i)
                    elif char == "|" and count == 0 and len(colon_indices) == 0:
                        pipe_indices.append(i)

                if end == -1:
                    chunks[-1].text += remaining
                    break
                append_chunk(remaining[:start], [i for i in range(steps)], False, limit_to)
                control = remaining[start + 1:end]

                if len(pipe_indices) > 0:
                    data = split_text_on(control, pipe_indices, start + 1)
                    for i in range(len(data)):
                        append_chunk(data[i], [step for step in range(steps) if step % len(data) == i], True, limit_to)
                    any[0] = True
                elif len(colon_indices) == 2:
                    coloned = split_text_on(control, colon_indices, start + 1)
                    when = float(coloned[2])
                    if when < 1:
                        when = when * steps
                    append_chunk(coloned[0], [i for i in range(steps) if i < when], True, limit_to)
                    append_chunk(coloned[1], [i for i in range(steps) if i >= when], True, limit_to)
                    any[0] = True
                elif len(colon_indices) == 1:
                    coloned = split_text_on(control, colon_indices, start + 1)
                    when = float(coloned[1])
                    if when < 1:
                        when = when * steps
                    append_chunk(coloned[0], [i for i in range(steps) if i >= when], True, limit_to)
                    any[0] = True
                else:
                    append_chunk(control, [i for i in range(steps)], False, limit_to)

                remaining = remaining[end + 1:]

        get_chunks(prompt)

        if not any[0]:
            return (text_to_cond(prompt, 0, 1), )

        conds_out = []
        last_text = ""
        start_perc = 0
        for i in range(steps):
            perc = i / steps
            text = ""
            for chunk in chunks:
                if i in chunk['applies_to']:
                    text += chunk['text']
            if text != last_text or i == 0:
                if i != 0:
                    conds_out.extend(text_to_cond(last_text, start_perc - 0.001, perc + 0.001))
                last_text = text
                start_perc = perc
        conds_out.extend(text_to_cond(last_text, start_perc - 0.001, 1))
        return (conds_out, )


def split_text_on(text: str, indices: list[str], offset: int) -> list[str]:
    indices = [i - offset for i in indices]
    result = []
    result.append(text[:indices[0]])
    for i in range(len(indices) - 1):
        result.append(text[indices[i] + 1:indices[i + 1]])
    result.append(text[indices[-1] + 1:])
    return result


NODE_CLASS_MAPPINGS = {
    "SwarmClipTextEncodeAdvanced": SwarmClipTextEncodeAdvanced,
}
