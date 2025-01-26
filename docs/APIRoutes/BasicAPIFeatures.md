# SwarmUI API Documentation - BasicAPIFeatures

> This is a subset of the API docs, see [/docs/API.md](/docs/API.md) for general info.

Basic general API routes, primarily for users and session handling.

#### Table of Contents:

- HTTP Route [AddNewPreset](#http-route-apiaddnewpreset)
- HTTP Route [ChangeUserSettings](#http-route-apichangeusersettings)
- HTTP Route [DeletePreset](#http-route-apideletepreset)
- HTTP Route [DuplicatePreset](#http-route-apiduplicatepreset)
- HTTP Route [GetAPIKeyStatus](#http-route-apigetapikeystatus)
- HTTP Route [GetCurrentStatus](#http-route-apigetcurrentstatus)
- HTTP Route [GetLanguage](#http-route-apigetlanguage)
- HTTP Route [GetMyUserData](#http-route-apigetmyuserdata)
- HTTP Route [GetNewSession](#http-route-apigetnewsession)
- HTTP Route [GetUserSettings](#http-route-apigetusersettings)
- WebSocket Route [InstallConfirmWS](#websocket-route-apiinstallconfirmws)
- HTTP Route [InterruptAll](#http-route-apiinterruptall)
- HTTP Route [ServerDebugMessage](#http-route-apiserverdebugmessage)
- HTTP Route [SetAPIKey](#http-route-apisetapikey)
- HTTP Route [SetParamEdits](#http-route-apisetparamedits)
- HTTP Route [SetStarredModels](#http-route-apisetstarredmodels)

## HTTP Route /API/AddNewPreset

#### Description

User route to add a new parameter preset.

#### Permission Flag

`manage_presets` - `Manage Presets` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| title | String | Name of the new preset. | **(REQUIRED)** |
| description | String | User-facing description text. | **(REQUIRED)** |
| raw | JObject | Use 'param_map' key to send the raw parameter mapping, equivalent to GenerateText2Image. | **(REQUIRED)** |
| preview_image | String | Optional preview image data base64 string. | (null) |
| is_edit | Boolean | If true, edit an existing preset. If false, do not override pre-existing presets of the same name. | `False` |
| editing | String | If is_edit is set, include the original preset name here. | (null) |

#### Return Format

```js
    "success": true
    // or:
    "preset_fail": "Some friendly error text here"
```

## HTTP Route /API/ChangeUserSettings

#### Description

User route to change user settings data.

#### Permission Flag

`edit_user_settings` - `Edit User Settings` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| rawData | JObject | Simple object map of key as setting ID to new setting value to apply. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/DeletePreset

#### Description

User route to delete a preset.

#### Permission Flag

`manage_presets` - `Manage Presets` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| preset | String | Name of the preset to delete. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/DuplicatePreset

#### Description

User route to duplicate an existing preset.

#### Permission Flag

`manage_presets` - `Manage Presets` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| preset | String | Name of the preset to duplicate. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/GetAPIKeyStatus

#### Description

User route to get the current status of a given API key.

#### Permission Flag

`read_user_settings` - `Read User Settings` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| keyType | String | The key type ID, eg 'stability_api'. | **(REQUIRED)** |

#### Return Format

```js
    "status": "last updated 2025-01-01 01:01" // or "not set"
```

## HTTP Route /API/GetCurrentStatus

#### Description

Get current waiting generation count, model loading count, etc.

#### Permission Flag

`fundamental_generate_tab_access` - `Fundamental Generate Tab Access` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| do_debug | Boolean | If true, verbose log data about the status report gathering (internal usage). | `False` |

#### Return Format

```js
    "status": {
        "waiting_gens": 0,
        "loading_models": 0,
        "waiting_backends": 0,
        "live_gens": 0
    },
    "backend_status": {
        "status": "running", // "idle", "unknown", "disabled", "loading", "running", "some_loading", "errored", "all_disabled", "empty"
        "class": "", // "error", "warn", "soft", ""
        "message": "", // User-facing English text
        "any_loading": false
    },
    "supported_features": ["feature_id1", "feature_id2"]
```

## HTTP Route /API/GetLanguage

#### Description

Get the details of a given language file.

#### Permission Flag

`fundamental_generate_tab_access` - `Fundamental Generate Tab Access` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| language | String | The language ID, eg 'en'. | **(REQUIRED)** |

#### Return Format

```js
    "language": {
        "code": "en",
        "name": "English",
        "local_name": "English",
        "keys": {
            "key": "value"
        }
    }
```

## HTTP Route /API/GetMyUserData

#### Description

User route to get the user's own base data.

#### Permission Flag

`fundamental_generate_tab_access` - `Fundamental Generate Tab Access` in group `User`

#### Parameters

**None.**

#### Return Format

```js
    "user_name": "username",
    "presets": [
        {
            "author": "username",
            "title": "Preset Title",
            "description": "Preset Description",
            "param_map": {
                "key": "value"
            },
            "preview_image": "data:base64 img"
        }
    ],
    "language": "en",
    "permissions": ["permission1", "permission2"],
    "starred_models": {
        "LoRA": ["one", "two"]
    },
    "autocompletions": ["Word\nword\ntag\n3"]
```

## HTTP Route /API/GetNewSession

#### Description

Special route to create a new session ID. Must be called before any other API route. Also returns other fundamental user and server data.

#### Permission Flag

(MISSING)

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| context | HttpContext | (PARAMETER DESCRIPTION NOT SET) | **(REQUIRED)** |

#### Return Format

```js
    "session_id": "session_id",
    "user_id": "username",
    "output_append_user": true,
    "version": "1.2.3",
    "server_id": "abc123",
    "permissions": ["permission1", "permission2"]
```

## HTTP Route /API/GetUserSettings

#### Description

Gets the user's current settings.

#### Permission Flag

`read_user_settings` - `Read User Settings` in group `User`

#### Parameters

**None.**

#### Return Format

```js
    "themes": {
        "theme_id": {
            "name": "Theme Name",
            "is_dark": true,
            "css_paths": ["path1", "path2"]
        }
    },
    "settings": {
        "setting_id": "value"
    }
```

## WebSocket Route /API/InstallConfirmWS

#### Description

Websocket route for the initial installation from the UI.

#### Permission Flag

`install` - `Install` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| theme | String | Selected user theme. | **(REQUIRED)** |
| installed_for | String | Selected install_for (network mode choice) value. | **(REQUIRED)** |
| backend | String | Selected backend (comfy/none). | **(REQUIRED)** |
| models | String | Selected models to predownload. | **(REQUIRED)** |
| install_amd | Boolean | If true, install with AMD GPU compatibility. | **(REQUIRED)** |
| language | String | Selected user language. | **(REQUIRED)** |

#### Return Format

```js
    // ... (do not automate calls to this)
```

## HTTP Route /API/InterruptAll

#### Description

Tell all waiting generations in this session or all sessions to interrupt.

#### Permission Flag

`basic_image_generation` - `Basic Image Generation` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| other_sessions | Boolean | If true, generations from all this user's sessions will be closed (ie even from other web page tabs or API usages). If false, only the current session is interrupted. | `False` |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/ServerDebugMessage

#### Description

Send a debug message to server logs.

#### Permission Flag

`server_debug_message` - `Server Debug Message` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| message | String | The message to log. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/SetAPIKey

#### Description

User route to set an API key.

#### Permission Flag

`edit_user_settings` - `Edit User Settings` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| keyType | String | The key type ID, eg 'stability_api'. | **(REQUIRED)** |
| key | String | The new value of the key, or 'none' to unset. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/SetParamEdits

#### Description

UI internal helper for user customization of parameters.

#### Permission Flag

`edit_params` - `Edit Params` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| rawData | JObject | Blob of parameter edit data. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/SetStarredModels

#### Description

User route to update the user's starred models lists.

#### Permission Flag

`fundamental_model_access` - `Fundamental Model Access` in group `User`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| raw | JObject | Send the raw data as eg 'LoRA': ['one', 'two'], 'Stable-Diffusion': [ ... ] | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

