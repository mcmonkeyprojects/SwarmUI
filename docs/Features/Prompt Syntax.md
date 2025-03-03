# Advanced Prompt Syntax

## Weighting

![img](/docs/images/prompt-weight.jpg)

- Prompt weighting, eg `an (orange) cat` or `an (orange:1.5) cat`. Anything in `(parens)` has its weighting modified - meaning, the model will pay more attention to that part of the prompt. Values above `1` are more important, values below `1` (eg `0.5`) are less important.
    - You can also hold Control and press the up/down arrow keys to change the weight of selected text.
    - Note: this presumes a default Comfy backend.
    - This varies based on models - CLIP-based models (eg Stable Diffusion) work well with this, but T5 based models (eg Flux) do not.

## Alternating

![img](/docs/images/alternate-cat-dog.jpg)

- You can use `<alternate:cat, dog>` to alternate every step between `cat` and `dog`, creating a merge/mixture of the two concepts.
    - Similar to `random` you can instead use `|` or `||` to separate entries, eg `<alternate:cat || dog>`. You can have as many unique words as you want, eg `<alternate:cat, dog, horse, wolf, taco>` has 5 words so it will cycle through them every 5 steps.
    - You can shorthand this as `<alt:cat,dog>`

## From-To

![img](/docs/images/fromto-cat-dog.jpg)

- You can use `<fromto[#]:before, after>` to swap between two phrases after a certain timestep.
    - The timestep can be like `10` for step 10, or like `0.5` for halfway-through.
    - Similar to `random` you can instead use `|` or `||` to separate entries. Must have exactly two entries.
    - For example, `<fromto[0.5]:cat, dog>` swaps from `cat` to `dog` halfway through a generation.

## Random

![img](/docs/images/random-cats.jpg)

- You can use the syntax `<random:red, blue, purple>` to randomly select from a list for each gen
    - This random is seeded by the main seed - so if you have a static seed, this won't change.
        - You can override this with the `Wildcard Seed` parameter
        - If your randoms won't change but your seed is changing, check if you've accidentally enabled the `Wildcard Seed` parameter. Some users have done this by accident.
    - You can use `,` to separate the entries, or `|`, or `||`. Whichever is most unique gets used - so if you want random options with `,` in them, just use `|` as a separator, and `,` will be ignored (eg `<random:red|blue|purple>`).
    - An entry can contain the syntax of eg `1-5` to automatically select a number from 1 to 5. For example, `<random:1-3, blue>` will give back any of: `1`, `2`, `3`, or `blue`.
    - You can repeat random choices via `<random[1-3]:red, blue, purple>` which might return for example `red blue` or `red blue purple` or `blue`.
        - You can use a comma at the end like `random[1-3,]` to specify the output should have a comma eg `red, blue`.
        - This will avoid repetition, unless you have a large count than number of options.

## Wildcards

![img](/docs/images/wildcards-cats.jpg)

- You can use the syntax `<wildcard:my/wildcard/name>` to randomly select from a wildcard file, which is basically a pre-saved text file of random options, 1 per line.
    - Edit these in the UI at the bottom in the "Wildcards" tab.
    - You can also import wildcard files from other UIs (ie text file collections) by just adding them into `Data/Wildcards` folder.
    - This supports the same syntax as `random` to get multiple, for example `<wildcard[1-3]:animals>` might return `cat dog` or `elephant leopard dog`.
    - You can shorthand this as `<wc:my/wildcard/name>`
    - This random is seeded by the main seed - so if you have a static seed, this won't change.
        - You can override this with the `Wildcard Seed` parameter
        - If your wildcards won't change but your seed is changing, check if you've accidentally enabled the `Wildcard Seed` parameter. Some users have done this by accident.

## Variables

![img](/docs/images/setvar-cat.jpg)

- You can store and reuse variables within a prompt. This is primarily intended for repeating randoms & wildcards.
    - Store with the syntax: `<setvar[var_name]:data>`
        - For example: `<setvar[color]:<random:red, blue, purple>>`
    - Call back with the syntax: `<var:var_name>`
        - For example: `<var:color>`
    - Here's a practical full example: `a photo of a woman with <setvar[color]:<random:blonde, black, red, blue, green, rainbow>> hair standing in the middle of a wide open street. She is smiling and waving at the camera, with beautiful sunlight glinting through her <var:color> hair. <segment:face and hair> extremely detailed close up shot of a woman with shiny <var:color> hair`
        - Notice how the var is called back, even in the segment, to allow for selecting a random hair color but keeping it consistent within the generation

## Trigger Phrase

![img](/docs/images/trigger-arcane-cat.jpg)

- If your model or current LoRA's have a trigger phrase in their metadata, you can use `<trigger>` to automatically apply those within a prompt.
    - If you have multiple models with trigger phrases, they will be combined into a comma-separated list. For example `cat` and `dog` will be inserted as `cat, dog`.
    - Note this is just a simple autofill, especially for usage in grids or other bulk generations, and not meant to robustly handle all cases. If you require specific formatting, you'll want to just copy the trigger phrase in directly yourself.
    - Fills empty when there's no data to fill.

## Repeat

![img](/docs/images/repeat-random.jpg)

- You can use the syntax `<repeat[3]:cat>` to get the word "cat" 3 times in a row (`cat cat cat`).
    - You can use for example like `<repeat[1-3]: <random:cat, dog>>` to get between 1 and 3 copies of either `cat` or `dog`, for example it might return `cat dog cat`.

## Textual Inversion Embeddings

- You can use `<embed:filename>` to use a Textual Inversion embedding in the prompt or negative prompt.
    - Store embedding files in `(SwarmUI)/Models/Embeddings`.
    - Embedding files were popular in the SDv1 era, but are less common for newer models.

## LoRAs

![img](/docs/images/lora-arcane-cat.jpg)

- You may use `<lora:filename>` to enable a LoRA, or `<lora:filename:weight>` to enable it and set a weight
    - Note that it's generally preferred to use the GUI at the bottom of the page to select loras
    - Note that usually position within the prompt doesn't matter, loras are not actually a prompt feature, this is just a convenience option for users used to Auto WebUI.
    - The one time it does matter, is when you use `<segment:...>` or `<object:...>`: a LoRA inside one of these will apply *only* to that segment or object.
    - `weight` is a multiplier, where `1` is the default, `0.5` is weakened halfway, or `2` is twice as strong. Generally numbers larger than 2 will destroy image quality.
    - You may also use `<lora:filename:backbone_weight:textenc_weight>` to enable a lora and set its backbone (unet/dit) weight separately from its text encoder weight.

## Presets

![img](/docs/images/style-preset-cats.jpg)

- You can use `<preset:presetname>` to inject a preset.
    - GUI is generally preferred for LoRAs, this is available to allow dynamically messing with presets (eg `<preset:<random:a, b>>`)
    - You can shorthand this as `<p:presetname>`

## Automatic Segmentation and Refining

![img](/docs/images/segment-ref.jpg)

- You can use `<segment:texthere>` to automatically refine part of the image using CLIP Segmentation.
    - This is like a "restore faces" feature but much more versatile, you can refine anything and control what it does.
    - Or `<segment:texthere,creativity,threshold>` - where creativity is inpaint strength, and threshold is segmentation minimum threshold - for example, `<segment:face,0.6,0.5>` - defaults to 0.6 creativity, 0.5 threshold.
    - See [the feature announcement](https://github.com/Stability-AI/StableSwarmUI/discussions/11#discussioncomment-7236821) for details.
    - Note the first time you run with CLIPSeg, Swarm will automatically download [an fp16 safetensors version of the clipseg-rd64-refined model](https://huggingface.co/mcmonkey/clipseg-rd64-refined-fp16)
    - You can insert a `<lora:...>` inside the prompt area of the segment to have a lora model apply onto that segment
    - You can also replace the `texthere` with `yolo-modelnamehere` to use YOLOv8 segmentation models (this is what "ADetailer" uses)
        - store your models in `(Swarm)/Models/yolov8`
        - Examples of valid YOLOv8 Segmentation models here: https://github.com/hben35096/assets/releases/
        - You can also do `yolo-modelnamehere-1` to grab exactly match #1, and `-2` for match #2, and etc.
            - You can do this all in one prompt to individual refine specific faces separately
            - Without this, if there are multiple people, it will do a bulk segmented refine on all faces combined
            - Note the index order is sorted from leftmost detection to right
        - To control the creativity with a yolo model just append `,<creativity>,1`, for example `<segment:yolo-face_yolov8m-seg_60.pt-1,0.8,1>` sets a `0.8` creativity.
            - Note that threshold does nothing with yolo models, and should always just be `1`.
        - If you have a yolo model with multiple supported classes, you can filter specific classes by appending `:<classes>:` to the model name where `<classes>` is a comma-separated list of class IDs or names, e.g., `<segment:yolo-modelnamehere:0,apple,2:,0.8,1>`
    - There's an advanced parameter under `Regional Prompting` named `Segment Model` to customize the base model used for segment processing
    - There's also a parameter named `Save Segment Mask` to save a preview copy of the generated mask

## Clear (Transparency)

![img](/docs/images/clear-cat.png)

- You can use `<clear:texthere>` to automatically clear parts of an image to transparent. This uses the same input format as `segment` (above) (for obvious reasons, this requires PNG not JPG).
    - For example, `<clear:background>` to clear the background.
    - The `Remove Background` dedicated parameter is generally better than autosegment clearing.

## Break Keyword

- You can use `<break>` to specify a manual CLIP section break (eg in Auto WebUI this is `BREAK`).
    - If this is confusing, you this a bit of an internal hacky thing, so don't worry about. But if you want to know, here's the explanation:
        - CLIP (the model that processes text input to pass to SD), has a length of 75 _tokens_ (words basically).
        - By default, if you write a prompt that's longer than 75 tokens, what it will do is split 75/75, the first 75 tokens go in and become one CLIP result chunk, and then the next tokens get passed for a second CLIP chunk, and then the multiple CLIP results are parsed by SD in a batch and mixed as it goes.
        - The problem with this, is it's basically random - you might have eg `a photo of a big fluffy dog`, and it gets split into `a photo of a big fluffy` and then `dog` (in practice 75 tokens is a much longer prompt but just an example of how the split might go wrong)
        - Using `<break>` lets you manually specify where it splits, so you might do eg `a photo <break> big fluffy dog` (to intentionally put the style in one chunk and the subject in the next)

## Regional Prompting

![img](/docs/images/sdxl_catdog.jpg)

*(The above is `a photo of a cat/dog mix <region:0,0,1,0.5,1> a photo of a cat <region:0,0.5,1,0.5,1> a photo of a dog` on SDXL)*

- You can use `<region:x,y,width,height,strength> prompt here` to use an alternate prompt for a given region.
    - The X,Y,Width,Height values are all given as fractions of image area. For example `0.5` is half the width or height of the image.
    - For example, `<region:0,0,0.5,1> a cat` specifies to include a cat in the full-height left half of the image.
    - Strength is how strongly to apply the regional prompt vs the global prompt.
    - You can do `<region:background>` to build a special region for only background areas (those that don't have their own region).
    - Note that small regions are likely to be ignored. The regional logic is applied fairly weakly to the model.
    - Note that different models behave very differently around this functionality.
        - Notably MM-DiT models (SD3/Flux) are likely to only process regions in early steps then entirely ignore them in latter steps (as they process the input image and try to retain it, ie devaluing your actual prompt text, so unusual combinations will make the model unhappy).
        - SDXL and models like it responds very strongly to regional prompts.
    - Regional prompts cannot currently use loras or other global feature changes. This is likely to change in the future.

## Regional Object Prompting

![img](/docs/images/sdxl_object_catdog.jpg)

*(The above is `a photo of a cat/dog mix <object:0,0,1,0.5,0.1,0.5> a photo of a cat <object:0,0.5,1,0.5,0.1,0.5> a photo of a dog` on SDXL)*

- You can use `<object:x,y,width,height,strength,strength2> prompt here` to use an alternate prompt for a given region, and also inpaint back over it.
    - Strength (1) is regional prompt strength (see [Regional Prompting](#regional-prompting))
    - Strength2 is Creativity of the automatic inpaint.
    - The automatic inpaint can be helpful for improving quality of objects, especially for small regions, but also might produce unexpected results.
    - Objects may use global feature changes, such as `<lora:` syntax input to apply a lora to the object in the inpaint phase.

## Video Extend

- You can use `<extend:frames>` to extend a video by a given number of frames using an Image-To-Video model.
    - For example, `<extend:33>` will extend the video by 33 frames.
    - Use the `Video Extend` parameter group to configure values for this. At least `Video Extend Model` must be set.
    - Must set Overlap less than 1/3rd of the extend frame count.
    - Use the `Advanced Video` parameters as well.
    - Under `Other Fixes` -> `Trim Video End Frames` may be useful on some models. Do not use `Trim Start`
    - 

## Comment

- You can use `<comment:stuff here>` to add a personal comment in the prompt box. It will be discarded from the real prompt.
