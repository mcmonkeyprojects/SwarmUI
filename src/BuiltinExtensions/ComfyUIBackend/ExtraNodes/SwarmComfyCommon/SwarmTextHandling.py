import torch, comfy
from nodes import MAX_RESOLUTION


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
            }
        }

    CATEGORY = "SwarmUI/clip"
    RETURN_TYPES = ("CONDITIONING",)
    FUNCTION = "encode"
    DESCRIPTION = "Acts like the regular CLIPTextEncode, but supports more advanced special features like '<break>', '[from:to:when]', '[alter|nate]', ..."

    def encode(self, clip, steps: int, prompt: str, width: int, height: int, target_width: int, target_height: int, guidance: float = -1):

        encoding_cache = {}

        def text_to_cond(text: str, start_percent: float, end_percent: float):
            text = text.replace("\0\1", "[").replace("\0\2", "]").replace("\0\3", "embedding:")
            if text in encoding_cache:
                cond, pooled = encoding_cache[text]
            else:
                cond_chunks = text.split("<break>")
                tokens = clip.tokenize(cond_chunks[0])
                cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
                if len(cond_chunks) > 1:
                    for chunk in cond_chunks[1:]:
                        tokens = clip.tokenize(chunk)
                        cond_chunk, pooled_chunk = clip.encode_from_tokens(tokens, return_pooled=True)
                        cond = torch.cat([cond, cond_chunk], dim=1)
                encoding_cache[text] = (cond, pooled)
            result = {"pooled_output": pooled, "width": width, "height": height, "crop_w": 0, "crop_h": 0, "target_width": target_width, "target_height": target_height, "start_percent": start_percent, "end_percent": end_percent}
            if guidance >= 0:
                result["guidance"] = guidance
            return [cond, result]

        prompt = prompt.replace("\\[", "\0\1").replace("\\]", "\0\2").replace("embedding:", "\0\3")

        chunks = []
        any = [False]

        def append_chunk(text: str, applies_to: list[int], can_subprocess: bool, limit_to: list[int]):
            applies_to = [i for i in applies_to if i in limit_to]
            if can_subprocess and '[' in text:
                get_chunks(text, applies_to)
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
                colon_indices = []
                pipe_indices = []
                for i in range(start + 1, len(remaining)):
                    if remaining[i] == "[":
                        count += 1
                    elif remaining[i] == "]":
                        if count == 0:
                            end = i
                            break
                        count -= 1
                    elif remaining[i] == ":" and count == 0 and len(pipe_indices) == 0:
                        colon_indices.append(i)
                    elif remaining[i] == "|" and count == 0 and len(colon_indices) == 0:
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
            return ([text_to_cond(prompt, 0, 1)], )

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
                    conds_out.append(text_to_cond(last_text, start_perc - 0.001, perc + 0.001))
                last_text = text
                start_perc = perc
        conds_out.append(text_to_cond(last_text, start_perc - 0.001, 1))
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
