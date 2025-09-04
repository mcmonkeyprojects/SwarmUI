# SwarmUI API Documentation - UtilAPI

> This is a subset of the API docs, see [/docs/API.md](/docs/API.md) for general info.

General utility API routes.

#### Table of Contents:

- HTTP Route [CountTokens](#http-route-apicounttokens)
- HTTP Route [Pickle2SafeTensor](#http-route-apipickle2safetensor)
- HTTP Route [TokenizeInDetail](#http-route-apitokenizeindetail)
- HTTP Route [WipeMetadata](#http-route-apiwipemetadata)

## HTTP Route /API/CountTokens

#### Description

Count the CLIP-like tokens in a given text prompt.

#### Permission Flag

`use_tokenizer` - `Use Tokenizer` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| text | String | The text to tokenize. | **(REQUIRED)** |
| skipPromptSyntax | Boolean | If false, process prompt syntax (things like `<random:`) as if its regular text. If true, clean it up first. | `False` |
| tokenset | String | What tokenization set to use. | `clip` |
| weighting | Boolean | If true, process weighting (like `(word:1.5)`). If false, don't process that. | `True` |

#### Return Format

```js
"count": 0
```

## HTTP Route /API/Pickle2SafeTensor

#### Description

Trigger bulk conversion of models from pickle format to safetensors.

#### Permission Flag

`pickle2safetensors` - `Pickle2SafeTensors` in group `Control`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| type | String | What type of model to convert, eg `Stable-Diffusion`, `LoRA`, etc. | **(REQUIRED)** |
| fp16 | Boolean | If true, convert to fp16 while processing. If false, use original model's weight type. | **(REQUIRED)** |

#### Return Format

```js
"success": true
```

## HTTP Route /API/TokenizeInDetail

#### Description

Tokenize some prompt text and get thorough detail about it.

#### Permission Flag

`use_tokenizer` - `Use Tokenizer` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| text | String | The text to tokenize. | **(REQUIRED)** |
| skipPromptSyntax | Boolean | If false, process prompt syntax (things like `<random:`) as if its regular text. If true, clean it up first. | `False` |
| tokenset | String | What tokenization set to use. | `clip` |
| weighting | Boolean | If true, process weighting (like `(word:1.5)`). If false, don't process that. | `True` |

#### Return Format

```js
    "tokens":
    [
        {
            "id": 123,
            "weight": 1.0,
            "text": "tok"
        }
    ]
```

## HTTP Route /API/WipeMetadata

#### Description

Trigger a mass metadata reset.

#### Permission Flag

`reset_metadata` - `Reset Metadata` in group `Control`

#### Parameters

**None.**

#### Return Format

```js
"success": true
```

