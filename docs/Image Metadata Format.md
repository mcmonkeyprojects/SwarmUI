# SwarmUI Image Metadata Format

This page is to document the metadata format SwarmUI applies to generated images.

By default, when generating an image through SwarmUI, it applies metadata to the image file that identifies the image generation parameters. You can view the SwarmUI parameters for an image with this metadata by simply dragging the image into the center area of Swarm's generate tab.

## Availability

SwarmUI metadata on an image is available when:

- You have not disabled `SaveMetadata` in your Swarm user settings
- It is saved in a metadata-compatible file format
    - `.png`: a textdata chunk named `parameters` with empty string as the language id is used
    - `.jpg`: a `UserComment` Exif tag is used
    - other exif formats: same as jpg where applicable
    - most other image/video formats: not available
- It has been transmitted only through metadata-preserving channels
    - That is to say, many things will strip metadata
    - Most social media sites and chat apps strip metadata
        - Discord strips from jpg, but not from png, so use png to send images with metadata on Discord
        - Slack strips from everything
    - You can often zip an image and send it that way to preserve metadata
    - Image editing software will often lose metadata or replace it with its own
- Or, if server setting `StealthMetadata` is enabled on a pixel-perfect format (primarily just png for now), the metadata is encoded in the low-value bits of color or alpha data. See <https://github.com/mcmonkeyprojects/SwarmUI/pull/871> for specifics.

## Format Explanation

SwarmUI metadata is a text string of a JSON object, ie in the format `{ "key": "value" }`.

The JSON is generally exported in human-readable format, ie with spaces and newlines, however this is not guaranteed (ie reader apps should not expect this to always be true. Use a standard JSON parser).

It contains the following root keys:

### sui_image_params

`sui_image_params` key holds an object full of all standard parameters used to generate the image. Each key is a parameter ID, and the value is the parameter's value.

Parameter IDs in SwarmUI are a simplified form of the parameter name, so for example the `Prompt` parameter has id `prompt`, `Negative Prompt` is `negativeprompt`, etc. All lowercase, spaces and numbers removed.

Values can be numbers, strings, etc. Often non-string values will be presented as strings regardless, eg `"1.0"` instead of `1.0`. Consumers that need to read these values should use data type forcing, eg `parseInt(params.seed)` (JavaScript).

List-values will either be JSON lists, or comma separated list strings, eg `"value1,value2"`.

Models will be identified by their simple model name format, eg `"OfficialStableDiffusion/sd_xl_base_1.0"`. Path is relative to the Swarm configured folder path, always uses forward slashes for subfolders, excludes a `.safetensors` extension if present.

No specific parameters are ever guaranteed. Even `model` and `prompt` can be missing from some images.

The key `swarm_version` is also present in the params block.

### sui_extra_data

`sui_extra_data` key is optional, but when present holds extra data generated while processing the image, such as generation time, an `original_prompt` for dynamic prompting, etc.

### sui_models

`sui_models` key is optional, but when present holds an Array of objects identifying all used models.

This is only active when the `ImageMetadataIncludeModelHash` server setting is enabled.

Each model-object contains keys `name`, `param`, and `hash`.
- `name` is the model's full filename (including the `.safetensors` suffix, only the path after the configured model folder, always forward slashes for subfolders)
- `param` is what parameter ID the model is attached to, eg `model`, or an ExtraData key like `used_loras`.
- `hash` is either a SHA256 model tensorhash string, or null.
    - A tensorhash is a hash of the data of the model processing only its tensor sections and not its header (ie to allow metadata to change without affecting the hash).
    - A valid hash is `0x` followed by 64 hexadecimal characters.
    - This may be null if the include hashes setting is enabled but a given model doesn't or can't have a proper hash (eg remote models might not record a hash)

## Full Example

Here's a full example of the metadata that you might find on an image:

```json
{
  "sui_image_params": {
    "prompt": "a photo of a cat",
    "model": "OfficialStableDiffusion/sd_xl_base_1.0",
    "seed": 1,
    "steps": 20,
    "cfgscale": 7.0,
    "aspectratio": "1:1",
    "width": 1024,
    "height": 1024,
    "automaticvae": true,
    "negativeprompt": "",
    "swarm_version": "0.9.3.1"
  },
  "sui_extra_data": {
    "date": "2025-01-25",
    "prep_time": "6.11 sec",
    "generation_time": "4.84 sec"
  },
  "sui_models": [
    {
      "name": "OfficialStableDiffusion/sd_xl_base_1.0.safetensors",
      "param": "model",
      "hash": "0xd7a9105a900fd52748f20725fe52fe52b507fd36bee4fc107b1550a26e6ee1d7"
    }
  ]
}
```
