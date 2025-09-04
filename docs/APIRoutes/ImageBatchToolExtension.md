# SwarmUI API Documentation - ImageBatchToolExtension

> This is a subset of the API docs, see [/docs/API.md](/docs/API.md) for general info.

(CLASS DESCRIPTION NOT SET)

#### Table of Contents:

- WebSocket Route [ImageBatchRun](#websocket-route-apiimagebatchrun)

## WebSocket Route /API/ImageBatchRun

#### Description

(ROUTE DESCRIPTION NOT SET)

#### Permission Flag

`imagebatcher_use_image_batcher` - `[Image Batch Tool] Use Image Batcher` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| rawInput | JObject | (PARAMETER DESCRIPTION NOT SET) | **(REQUIRED)** |
| input_folder | String | (PARAMETER DESCRIPTION NOT SET) | **(REQUIRED)** |
| output_folder | String | (PARAMETER DESCRIPTION NOT SET) | **(REQUIRED)** |
| init_image | Boolean | (PARAMETER DESCRIPTION NOT SET) | **(REQUIRED)** |
| revision | Boolean | (PARAMETER DESCRIPTION NOT SET) | **(REQUIRED)** |
| controlnet | Boolean | (PARAMETER DESCRIPTION NOT SET) | **(REQUIRED)** |
| resMode | String | (PARAMETER DESCRIPTION NOT SET) | **(REQUIRED)** |
| append_filename_to_prompt | Boolean | (PARAMETER DESCRIPTION NOT SET) | **(REQUIRED)** |

#### Return Format

```js
(RETURN INFO NOT SET)
```

