import torch, node_helpers
from nodes import MAX_RESOLUTION
from .SwarmTextHandling import PROMPT_TEMPLATE_ENCODE_VIDEO_I2V, PROMPT_TEMPLATE_QWEN_IMAGE_EDIT_PLUS, KREA2_TEMPLATE


class ParsedText:
    def __init__(self, text=None, embed=None, is_break=False, weight=1.0, parts=None, alternate=None, fromto=None, fromto_when=None):
        self.text = text
        self.embed = embed
        self.is_break = is_break
        self.weight = weight
        self.parts = parts or []
        self.alternate = alternate
        self.fromto = fromto
        self.fromto_when = fromto_when

    def has_steps(self):
        if self.alternate is not None or self.fromto is not None:
            return True
        return any(p.has_steps() for p in self.parts)

    def flatten(self, step, steps, weight=1.0):
        w = self.weight * weight
        if self.alternate is not None:
            if len(self.alternate) == 0:
                return []
            return self.alternate[step % len(self.alternate)].flatten(step, steps, w)
        if self.fromto is not None:
            when = self.fromto_when
            if when < 1:
                when = when * steps
            chosen = self.fromto[0] if step < when else self.fromto[1]
            return chosen.flatten(step, steps, w)
        if self.parts:
            out = []
            for p in self.parts:
                out.extend(p.flatten(step, steps, w))
            return out
        if not self.is_break and self.embed is None and not self.text:
            return []
        return [ParsedText(text=self.text, embed=self.embed, is_break=self.is_break, weight=w)]


def quick_simple_tag_filler(tagged_text, prefix, suffix, tag_reader, do_subtags=True, max_recurse=0):
    start = tagged_text.find(prefix)
    if start == -1:
        return ParsedText(text=tagged_text)
    end = tagged_text.rfind(suffix)
    if end < start:
        return ParsedText(text=tagged_text)
    prefix0 = prefix[0]
    suffix0 = suffix[0]
    result = []
    if tagged_text[:start]:
        result.append(ParsedText(text=tagged_text[:start]))
    sub_tag_count = 0
    i = start + len(prefix)
    while i < len(tagged_text):
        c = tagged_text[i]
        if c == prefix0 and tagged_text.startswith(prefix, i):
            sub_tag_count += 1
        if c == suffix0 and tagged_text.startswith(suffix, i):
            if sub_tag_count == 0:
                i += len(suffix)
                innards = tagged_text[start:i]
                content = innards[len(prefix):-len(suffix)]
                if do_subtags:
                    content = quick_simple_tag_filler(content, prefix, suffix, tag_reader, do_subtags, max_recurse)
                read = tag_reader(content)
                if read is None:
                    result.append(ParsedText(text=innards))
                else:
                    if max_recurse > 0:
                        read = quick_simple_tag_filler(read, prefix, suffix, tag_reader, do_subtags, max_recurse - 1)
                    result.append(read)
                start = tagged_text.find(prefix, i)
                if start == -1:
                    if tagged_text[i:]:
                        result.append(ParsedText(text=tagged_text[i:]))
                    return ParsedText(parts=result)
                if tagged_text[i:start]:
                    result.append(ParsedText(text=tagged_text[i:start]))
                i = start + len(prefix)
                continue
            sub_tag_count -= 1
        i += 1
    result.append(ParsedText(text=tagged_text[start:]))
    return ParsedText(parts=result)


def index_of_noncontained(val, c):
    depth = 0
    for i in range(len(val)):
        ch = val[i]
        if ch == '<':
            depth += 1
        elif ch == '>':
            depth -= 1
        elif ch == c and depth == 0:
            return i
    return -1


def split_tag(tag):
    prefix = tag
    data = ""
    colon_index = index_of_noncontained(tag, ':')
    if colon_index != -1:
        prefix = tag[:colon_index]
        data = tag[colon_index + 1:]
    predata = None
    bracket = index_of_noncontained(prefix, '[')
    if prefix.endswith(']') and bracket != -1:
        predata = prefix[bracket + 1:-1]
        prefix = prefix[:bracket]
    return prefix.lower(), predata, data


def split_smart(inp):
    separator = ","
    count = 0
    for i in range(len(inp)):
        if inp[i] == '<':
            count += 1
        elif inp[i] == '>':
            count -= 1
        elif count == 0 and inp[i] == '|' and i > 0 and inp[i - 1] == '|':
            separator = "||"
            break
        elif count == 0 and inp[i] == '|':
            separator = "|"
    output = []
    count = 0
    start = 0
    sep_len = len(separator)
    i = 0
    while i < len(inp):
        if inp[i] == '<':
            count += 1
        elif inp[i] == '>':
            count -= 1
        elif count == 0 and i + sep_len - 1 < len(inp) and inp[i:i + sep_len] == separator:
            output.append(inp[start:i])
            start = i + sep_len
            i += sep_len - 1
        i += 1
    if start <= len(inp):
        output.append(inp[start:])
    return [v.strip() for v in output]


def parse_prompt(text):
    def reader(content):
        if isinstance(content, ParsedText):
            return content
        prefix, predata, data = split_tag(content)
        if prefix == 'break':
            return ParsedText(is_break=True)
        if prefix == 'embed' or prefix == 'embedding':
            return ParsedText(embed=data)
        if prefix == 'weight':
            try:
                w = float(predata)
            except:
                return ParsedText(text=f'<{content}>')
            inner = parse_prompt(data)
            return ParsedText(weight=w, parts=inner.parts if inner.parts else [inner])
        if prefix == 'alternate' or prefix == 'alt':
            return ParsedText(alternate=[parse_prompt(v) for v in split_smart(data)])
        if prefix == 'fromto':
            try:
                when = float(predata)
            except:
                return ParsedText(text=f'<{content}>')
            vals = split_smart(data)
            if len(vals) != 2:
                return ParsedText(text=f'<{content}>')
            return ParsedText(fromto=(parse_prompt(vals[0]), parse_prompt(vals[1])), fromto_when=when)
        return ParsedText(text=f'<{content}>')
    return quick_simple_tag_filler(text, '<', '>', reader, False, 0)


def chunks_from_leaves(leaves):
    chunks = [[]]
    for leaf in leaves:
        if leaf.is_break:
            chunks.append([])
        else:
            chunks[-1].append(leaf)
    return chunks


def join_text(leaves, weighted):
    out = []
    for leaf in leaves:
        if leaf.embed is not None or not leaf.text:
            continue
        if weighted and leaf.weight != 1.0:
            escaped = leaf.text.replace('(', '\\(').replace(')', '\\)')
            out.append(f"({escaped}:{leaf.weight})")
        else:
            out.append(leaf.text)
    return ''.join(out)


def token_batches_have_weights(batches):
    if not batches:
        return False
    for batch in batches:
        for item in batch:
            if isinstance(item, (list, tuple)) and len(item) > 1 and item[1] != 1.0:
                return True
    return False


def apply_comfy_token_weights(flat_tokens, weighted_tokens):
    applied = False
    if isinstance(flat_tokens, dict) and isinstance(weighted_tokens, dict):
        for key in flat_tokens:
            if key in weighted_tokens and token_batches_have_weights(weighted_tokens[key]):
                flat_tokens[key] = weighted_tokens[key]
                applied = True
        return flat_tokens, applied
    if token_batches_have_weights(weighted_tokens):
        return weighted_tokens, True
    return flat_tokens, False


def stamp_token_weight(tokens, weight):
    if isinstance(tokens, dict):
        return {k: stamp_token_weight(v, weight) for k, v in tokens.items()}
    out = []
    for batch in tokens:
        new_batch = []
        for item in batch:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                new_batch.append((item[0], weight) + tuple(item[2:]))
            else:
                new_batch.append(item)
        out.append(new_batch)
    return out


def token_weights_from_tokens(tokens, cond_len):
    batch = tokens[next(iter(tokens))][0] if isinstance(tokens, dict) else tokens[0]
    visible_start = len(batch) - cond_len
    pairs = []
    for i in range(cond_len):
        item = batch[visible_start + i]
        w = item[1] if isinstance(item, (list, tuple)) and len(item) > 1 else 1.0
        if w != 1.0:
            pairs.append((int(i), float(w)))
    return pairs


def attn1_token_weight_patch(q, k, v, extra_options=None, pe=None, attn_mask=None, **kwargs):
    extra_options = extra_options or {}
    weights = extra_options.get("attn_token_weights")
    if not weights:
        return {"q": q, "k": k, "v": v, "pe": pe, "attn_mask": attn_mask}
    seq = v.shape[2]
    batch = v.shape[0]
    cu = extra_options.get("cond_or_uncond")
    if cu is None:
        slots = list(range(batch))
    else:
        n = max(batch // len(cu), 1)
        slots = []
        for i, flag in enumerate(cu):
            if flag == 0:
                slots.extend(range(i * n, min((i + 1) * n, batch)))
    v = v.clone()
    for pos, w in weights:
        if w < 1.0 and pos < seq:
            for b in slots:
                v[b, :, pos] = v[b, :, pos] * w
    if any(w > 1.0 for _, w in weights):
        bias = q.new_zeros(batch, 1, 1, k.shape[2])
        for pos, w in weights:
            if w > 1.0 and pos < k.shape[2]:
                for b in slots:
                    bias[b, 0, 0, pos] = (w - 1.0) * 2.0
        attn_mask = bias
    return {"q": q, "k": k, "v": v, "pe": pe, "attn_mask": attn_mask}


def tokenizer_for_key(root, key):
    if hasattr(root, '_try_get_embedding'):
        return root
    names = [key, f"clip_{key}"]
    if key == "l":
        names += ["clip_l", "clip"]
    if key == "g":
        names += ["clip_g"]
    for name in names:
        obj = getattr(root, name, None)
        if hasattr(obj, '_try_get_embedding'):
            return obj
    if getattr(root, "clip_name", None) == key:
        obj = getattr(root, getattr(root, "clip", ""), None)
        if hasattr(obj, '_try_get_embedding'):
            return obj
    obj = getattr(root, "clip", None)
    if hasattr(obj, '_try_get_embedding'):
        return obj
    return None


def is_special_token(sd, tid):
    if not isinstance(tid, int):
        return False
    if sd.start_token is not None and tid == sd.start_token:
        return True
    if sd.end_token is not None and tid == sd.end_token:
        return True
    if tid == sd.pad_token:
        return True
    return False


def embed_token_items(embed, weight):
    if embed is None:
        return []
    if len(embed.shape) == 1:
        return [(embed, weight)]
    return [(embed[x], weight) for x in range(embed.shape[0])]


def flatten_content(sd, batches):
    items = []
    for batch in batches:
        for item in batch:
            if is_special_token(sd, item[0]):
                continue
            items.append((item[0], item[1] if len(item) > 1 else 1.0))
    return items


def pack_batches(sd, groups):
    batched = []
    batch = []
    if sd.start_token is not None:
        batch.append((sd.start_token, 1.0))
    batched.append(batch)
    has_end = 1 if sd.end_token is not None else 0
    for t_group in groups:
        t_group = list(t_group)
        is_large = len(t_group) >= sd.max_word_length
        while t_group:
            if len(t_group) + len(batch) > sd.max_length - has_end:
                remaining = sd.max_length - len(batch) - has_end
                if is_large:
                    batch.extend(t_group[:remaining])
                    t_group = t_group[remaining:]
                if sd.end_token is not None:
                    batch.append((sd.end_token, 1.0))
                if not is_large and sd.pad_to_max_length:
                    batch.extend([(sd.pad_token, 1.0)] * (sd.max_length - len(batch)))
                batch = []
                if sd.start_token is not None:
                    batch.append((sd.start_token, 1.0))
                batched.append(batch)
            else:
                batch.extend(t_group)
                t_group = []
    if sd.end_token is not None:
        batch.append((sd.end_token, 1.0))
    if sd.pad_to_max_length and len(batch) < sd.max_length:
        batch.extend([(sd.pad_token, 1.0)] * (sd.max_length - len(batch)))
    if sd.min_length is not None and len(batch) < sd.min_length:
        batch.extend([(sd.pad_token, 1.0)] * (sd.min_length - len(batch)))
    return batched


def calc_leaf(sd, leaf, apply_weights):
    if leaf.embed is not None:
        embed, _, _ = sd._try_get_embedding(leaf.embed)
        return embed_token_items(embed, leaf.weight)
    if not leaf.text:
        return []
    prompt = leaf.text
    extra = {}
    if apply_weights:
        if leaf.weight != 1.0:
            escaped = leaf.text.replace('(', '\\(').replace(')', '\\)')
            prompt = f"({escaped}:{leaf.weight})"
    else:
        extra["disable_weights"] = True
    items = flatten_content(sd, sd.tokenize_with_weights(prompt, **extra))
    if not apply_weights and leaf.weight != 1.0:
        return [(t, leaf.weight) for t, _ in items]
    return items


def wrap_in_shell(empty_batches, probe_batches, content):
    empty = empty_batches[0]
    probe = probe_batches[0]
    idx = 0
    n = min(len(empty), len(probe))
    while idx < n and empty[idx][0] == probe[idx][0]:
        idx += 1
    return [empty[:idx] + content + empty[idx:]]


def combine_leaves(clip, leaves, tokenize_fn, per_leaf=False):
    want_weight = any(leaf.weight != 1.0 for leaf in leaves)
    has_embed = any(leaf.embed is not None for leaf in leaves)
    if not has_embed and not per_leaf:
        tokens = tokenize_fn(join_text(leaves, False))
        applied = False
        if want_weight:
            tokens, applied = apply_comfy_token_weights(tokens, tokenize_fn(join_text(leaves, True)))
        return tokens, applied
    empty = tokenize_fn("")
    probe = tokenize_fn("x")
    weight_probe = tokenize_fn("(x:2)") if want_weight else None
    applied = False
    keys = probe if isinstance(probe, dict) else {None: probe}
    empty_map = empty if isinstance(empty, dict) else {None: empty}
    out = {}
    for key, probe_batches in keys.items():
        sd = tokenizer_for_key(clip.tokenizer, key)
        if sd is None:
            out[key] = probe_batches
            continue
        apply = False
        if want_weight and weight_probe is not None:
            wp = weight_probe[key] if isinstance(weight_probe, dict) else weight_probe
            apply = token_batches_have_weights(wp)
        if apply:
            applied = True
        elif per_leaf and want_weight:
            applied = True
        groups = [g for g in (calc_leaf(sd, leaf, apply) for leaf in leaves) if g]
        clip_empty = empty_map[key]
        if len(flatten_content(sd, clip_empty)) > len(flatten_content(sd, sd.tokenize_with_weights(""))) + 4:
            content = []
            for g in groups:
                content.extend(g)
            out[key] = wrap_in_shell(clip_empty, probe_batches, content)
        else:
            out[key] = pack_batches(sd, groups)
    if not isinstance(probe, dict):
        return out[None], applied
    return out, applied


def uniform_weight(leaves):
    weights = [leaf.weight for leaf in leaves if leaf.embed is not None or (leaf.text and leaf.text.strip())]
    if not weights:
        return None
    first = weights[0]
    for w in weights[1:]:
        if w != first:
            return None
    return first


class SwarmTextEncodeAdvanced:
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
                "images": ("IMAGE", {"default": None, "tooltip": "Optional images to use for a text-vision model, if applicable."}),
                "minimax_refs": ("MiniMaxReferences", {"default": None, "tooltip": "Optional MiniMax H3 references (images, videos, audio)."}),
            }
        }

    CATEGORY = "SwarmUI/clip"
    RETURN_TYPES = ("CONDITIONING",)
    FUNCTION = "encode"
    DESCRIPTION = "Acts like the regular CLIPTextEncode, but supports Swarm prompt tags such as '<break>', '<fromto[0.5]:a, b>', '<alternate:a, b>', '<weight[2]:text>', '<embed:name>'."

    def encode(self, clip, steps: int, prompt: str, width: int, height: int, target_width: int, target_height: int, guidance: float = -1, llama_template = None, clip_vision_output = None, images = None, minimax_refs = None):
        append_images = False
        prepend_images = False
        fix_images = True
        use_attn_token_weights = llama_template == "krea2"
        if llama_template == "hunyuan_image":
            llama_template = PROMPT_TEMPLATE_ENCODE_VIDEO_I2V
            fix_images = False
        elif llama_template == "krea2":
            llama_template = KREA2_TEMPLATE
            append_images = True
        elif llama_template == "qwen_image_edit_plus":
            llama_template = PROMPT_TEMPLATE_QWEN_IMAGE_EDIT_PLUS
            append_images = True
            prepend_images = True
        if images is not None and fix_images:
            if len(images.shape) == 3:
                images = [images]
            else:
                images = [i.unsqueeze(0) for i in images]

        def tokenize(text: str):
            nonlocal images
            extra = {}
            if minimax_refs is not None:
                extra["minimax_ref_items"] = minimax_refs["ref_items"]
            if clip_vision_output is not None:
                return clip.tokenize(text, llama_template=llama_template if llama_template else None, image_embeds=clip_vision_output.mm_projected, **extra)
            elif images is not None:
                if append_images:
                    image_prompt = ""
                    for i, image in enumerate(images):
                        if f"input_image_{i + 1}" in text:
                            text = text.replace(f"input_image_{i + 1}", f"<|vision_start|><|image_pad|><|vision_end|>", 1)
                        else:
                            image_prompt += f"Picture {i + 1}: <|vision_start|><|image_pad|><|vision_end|>"
                    if prepend_images:
                        text = image_prompt + text
                    else:
                        text = text + image_prompt
                return clip.tokenize(text, llama_template=llama_template if llama_template else None, images=images, **extra)
            else:
                return clip.tokenize(text, **extra)

        def encode_leaves(leaves):
            want_attn_weights = use_attn_token_weights and any(leaf.weight != 1.0 for leaf in leaves)
            tokens, weights_applied = combine_leaves(clip, leaves, tokenize, per_leaf=want_attn_weights)
            w = uniform_weight(leaves)
            if not want_attn_weights and not weights_applied and w is not None and w != 1.0:
                tokens = stamp_token_weight(tokens, w)
                weights_applied = True
            cond_arr = clip.encode_from_tokens_scheduled(tokens)
            if want_attn_weights:
                pairs = token_weights_from_tokens(tokens, cond_arr[0][0].shape[1])
                if pairs:
                    cond_arr[0][1]["attn_token_weights"] = pairs
                    weights_applied = True
            if not weights_applied and w is not None and w != 1.0:
                for entry in cond_arr:
                    entry[0] = entry[0] * w
            return cond_arr

        encoding_cache = {}

        def leaves_to_cond(leaves, start_percent: float, end_percent: float):
            key = tuple((leaf.text, leaf.embed, leaf.is_break, leaf.weight) for leaf in leaves)
            if key in encoding_cache:
                cond_arr = encoding_cache[key]
            else:
                chunks = chunks_from_leaves(leaves)
                cond_arr = encode_leaves(chunks[0])
                if len(chunks) > 1:
                    for chunk in chunks[1:]:
                        cond_arr_chunk = encode_leaves(chunk)
                        catted_cond = torch.cat([cond_arr[0][0], cond_arr_chunk[0][0]], dim=1)
                        cond_arr[0] = [catted_cond, cond_arr[0][1]]
                encoding_cache[key] = cond_arr
            result = {"pooled_output": cond_arr[0][1]["pooled_output"], "width": width, "height": height, "crop_w": 0, "crop_h": 0, "target_width": target_width, "target_height": target_height, "start_percent": start_percent, "end_percent": end_percent}
            for k, v in cond_arr[0][1].items():
                if k not in result:
                    result[k] = v
            if guidance >= 0:
                result["guidance"] = guidance
            out_cond_arr = [[cond_arr[0][0], result]]
            out_cond_arr.extend(cond_arr[1:])
            return out_cond_arr

        parsed = parse_prompt(prompt)
        if not parsed.has_steps():
            conds_out = leaves_to_cond(parsed.flatten(0, steps), 0, 1)
        else:
            conds_out = []
            last_key = None
            start_perc = 0
            last_leaves = []
            for i in range(steps):
                perc = i / steps
                leaves = parsed.flatten(i, steps)
                key = tuple((leaf.text, leaf.embed, leaf.is_break, leaf.weight) for leaf in leaves)
                if key != last_key or i == 0:
                    if i != 0:
                        conds_out.extend(leaves_to_cond(last_leaves, start_perc - 0.001, perc + 0.001))
                    last_leaves = leaves
                    last_key = key
                    start_perc = perc
            conds_out.extend(leaves_to_cond(last_leaves, start_perc - 0.001, 1))
        if minimax_refs is not None:
            ref_blocks = minimax_refs["ref_blocks"]
            if ref_blocks:
                conds_out = node_helpers.conditioning_set_values(conds_out, {"minimax_refs": ref_blocks})
        return (conds_out, )


class SwarmAttnTokenWeights:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "conditioning": ("CONDITIONING",),
            }
        }

    CATEGORY = "SwarmUI/clip"
    RETURN_TYPES = ("MODEL",)
    FUNCTION = "patch"
    DESCRIPTION = "Applies per-token prompt weights through Comfy's attn1_patch (value scale / attention bias) instead of replacing attention.forward."

    def patch(self, model, conditioning):
        pairs = None
        if conditioning and conditioning[0][1]:
            pairs = conditioning[0][1].get("attn_token_weights")
        if not pairs:
            return (model,)
        model_clone = model.clone()
        transformer_options = model_clone.model_options.get("transformer_options", {}).copy()
        transformer_options["attn_token_weights"] = pairs
        model_clone.model_options["transformer_options"] = transformer_options
        model_clone.set_model_attn1_patch(attn1_token_weight_patch)
        return (model_clone,)


NODE_CLASS_MAPPINGS = {
    "SwarmTextEncodeAdvanced": SwarmTextEncodeAdvanced,
    "SwarmAttnTokenWeights": SwarmAttnTokenWeights,
}
