# SwarmUI API Documentation - BackendAPI

> This is a subset of the API docs, see [/docs/API.md](/docs/API.md) for general info.

API routes to manage the server's backends.

#### Table of Contents:

- HTTP Route [AddNewBackend](#http-route-apiaddnewbackend)
- HTTP Route [DeleteBackend](#http-route-apideletebackend)
- HTTP Route [EditBackend](#http-route-apieditbackend)
- HTTP Route [FreeBackendMemory](#http-route-apifreebackendmemory)
- HTTP Route [ListBackendTypes](#http-route-apilistbackendtypes)
- HTTP Route [ListBackends](#http-route-apilistbackends)
- HTTP Route [RestartBackends](#http-route-apirestartbackends)
- HTTP Route [ToggleBackend](#http-route-apitogglebackend)

## HTTP Route /API/AddNewBackend

#### Description

Add a new backend of the specified type.

#### Permission Flag

`add_remove_backends` - `Add/Remove Backends` in group `Backends Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| type_id | String | ID of what type of backend to add (see `ListBackendTypes`). | **(REQUIRED)** |

#### Return Format

```js
    "id": "idhere",
    "type": "typehere",
    "status": "statushere",
    "settings":
    {
        "namehere": valuehere
    },
    "modcount": 0,
    "features": [ "featureidhere", ... ],
    "enabled": true,
    "title": "titlehere",
    "can_load_models": true,
    "max_usages": 0
```

## HTTP Route /API/DeleteBackend

#### Description

Shuts down and deletes a registered backend by ID.

#### Permission Flag

`add_remove_backends` - `Add/Remove Backends` in group `Backends Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| backend_id | Int32 | ID of the backend to delete. | **(REQUIRED)** |

#### Return Format

```js
    "result": "Deleted."
    // OR
    "result": "Already didn't exist."
```

## HTTP Route /API/EditBackend

#### Description

Modify and re-init an already registered backend.

#### Permission Flag

`edit_backends` - `Edit Backends` in group `Backends Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| backend_id | Int32 | ID of the backend to edit. | **(REQUIRED)** |
| title | String | New title of the backend. | **(REQUIRED)** |
| raw_inp | JObject |  Input should contain a map of `"settingname": value`. | **(REQUIRED)** |
| new_id | Int32 | Optional new ID to change the backend to. | `-1` |

#### Return Format

```js
    "id": "idhere",
    "type": "typehere",
    "status": "statushere",
    "settings":
    {
        "namehere": valuehere
    },
    "modcount": 0,
    "features": [ "featureidhere", ... ],
    "enabled": true,
    "title": "titlehere",
    "can_load_models": true,
    "max_usages": 0
```

## HTTP Route /API/FreeBackendMemory

#### Description

Free memory from all backends or a specific one.

#### Permission Flag

`control_mem_clean` - `Control Memory Cleaning` in group `Control`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| system_ram | Boolean | If true, system RAM should be cleared too. If false, only VRAM should be cleared. | `False` |
| backend | String | What backend ID to restart, or `all` for all. | `all` |

#### Return Format

```js
    "result": true,
    "count": 1 // Number of backends memory was freed from
```

## HTTP Route /API/ListBackendTypes

#### Description

Returns of a list of all available backend types.

#### Permission Flag

`view_backends_list` - `View Backends List` in group `Backends Admin`

#### Parameters

**None.**

#### Return Format

```js
    "list":
    [
        "id": "idhere",
        "name": "namehere",
        "description": "descriptionhere",
        "settings":
        [
            {
                "name": "namehere",
                "type": "typehere",
                "description": "descriptionhere",
                "placeholder": "placeholderhere",
                "values": ["a", "b"], // For dropdowns only
                "value_names": ["Alpha", "Beta"] // For dropdowns only, optional even then
            }
        ],
        "is_standard": false
    ]
```

## HTTP Route /API/ListBackends

#### Description

Returns a list of currently registered backends.

#### Permission Flag

`view_backends_list` - `View Backends List` in group `Backends Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| nonreal | Boolean | If true, include 'nonreal' backends (ones that were spawned temporarily/internally). | `False` |
| full_data | Boolean | If true, include nonessential data about backends (eg what model is currently loaded). | `False` |

#### Return Format

```js
    "idhere":
    {
        "id": "idhere",
        "type": "typehere",
        "status": "statushere",
        "settings":
        {
            "namehere": valuehere
        },
        "modcount": 0,
        "features": [ "featureidhere", ... ],
        "enabled": true,
        "title": "titlehere",
        "can_load_models": true,
        "max_usages": 0,
        "current_model": "modelnamehere" // Only if `full_data` is true
    }
```

## HTTP Route /API/RestartBackends

#### Description

Restart all backends or a specific one.

#### Permission Flag

`restart_backends` - `Restart Backends` in group `Backends Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| backend | String | What backend ID to restart, or `all` for all. | `all` |

#### Return Format

```js
    "result": "Success.",
    "count": 1 // Number of backends restarted
```

## HTTP Route /API/ToggleBackend

#### Description

Disables or re-enables a backend by ID.

#### Permission Flag

`toggle_backends` - `Toggle Backends` in group `Backends Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| backend_id | Int32 | ID of the backend to toggle. | **(REQUIRED)** |
| enabled | Boolean | If true, backend should be enabled. If false, backend should be disabled. | **(REQUIRED)** |

#### Return Format

```js
    "result": "Success."
    // OR
    "result": "No change."
```

