# SwarmUI API Documentation - AdminAPI

> This is a subset of the API docs, see [/docs/API.md](/docs/API.md) for general info.

Administrative APIs related to server management.

#### Table of Contents:

- HTTP Route [AdminAddRole](#http-route-apiadminaddrole)
- HTTP Route [AdminAddUser](#http-route-apiadminadduser)
- HTTP Route [AdminChangeUserSettings](#http-route-apiadminchangeusersettings)
- HTTP Route [AdminDeleteRole](#http-route-apiadmindeleterole)
- HTTP Route [AdminDeleteUser](#http-route-apiadmindeleteuser)
- HTTP Route [AdminEditRole](#http-route-apiadmineditrole)
- HTTP Route [AdminGetUserInfo](#http-route-apiadmingetuserinfo)
- HTTP Route [AdminListPermissions](#http-route-apiadminlistpermissions)
- HTTP Route [AdminListRoles](#http-route-apiadminlistroles)
- HTTP Route [AdminListUsers](#http-route-apiadminlistusers)
- HTTP Route [AdminSetUserPassword](#http-route-apiadminsetuserpassword)
- HTTP Route [ChangeServerSettings](#http-route-apichangeserversettings)
- HTTP Route [CheckForUpdates](#http-route-apicheckforupdates)
- HTTP Route [DebugGenDocs](#http-route-apidebuggendocs)
- HTTP Route [DebugLanguageAdd](#http-route-apidebuglanguageadd)
- HTTP Route [GetGlobalStatus](#http-route-apigetglobalstatus)
- HTTP Route [GetServerResourceInfo](#http-route-apigetserverresourceinfo)
- HTTP Route [InstallExtension](#http-route-apiinstallextension)
- HTTP Route [ListConnectedUsers](#http-route-apilistconnectedusers)
- HTTP Route [ListLogTypes](#http-route-apilistlogtypes)
- HTTP Route [ListRecentLogMessages](#http-route-apilistrecentlogmessages)
- HTTP Route [ListServerSettings](#http-route-apilistserversettings)
- HTTP Route [LogSubmitToPastebin](#http-route-apilogsubmittopastebin)
- HTTP Route [ShutdownServer](#http-route-apishutdownserver)
- HTTP Route [UninstallExtension](#http-route-apiuninstallextension)
- HTTP Route [UpdateAndRestart](#http-route-apiupdateandrestart)
- HTTP Route [UpdateExtension](#http-route-apiupdateextension)

## HTTP Route /API/AdminAddRole

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to create a new user permission role.

#### Permission Flag

`configure_roles` - `Configure Roles` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| name | String | The name of the new role. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/AdminAddUser

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to create a new user account.

#### Permission Flag

`manage_users` - `Manage Users` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| name | String | The name of the new user. | **(REQUIRED)** |
| password | String | Initial password for the new user. | **(REQUIRED)** |
| role | String | Initial role for the new user. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/AdminChangeUserSettings

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to forcibly change user settings data for a user.

#### Permission Flag

`manage_users` - `Manage Users` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| name | String | The name of the user. | **(REQUIRED)** |
| rawData | JObject | Simple object map of key as setting ID to new setting value to apply, under 'settings'. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/AdminDeleteRole

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to delete an existing user permission role.

#### Permission Flag

`configure_roles` - `Configure Roles` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| name | String | The name of the new role. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/AdminDeleteUser

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to delete an existing user account.

#### Permission Flag

`manage_users` - `Manage Users` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| name | String | The name of the user to delete. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/AdminEditRole

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to edit a permission role.

#### Permission Flag

`configure_roles` - `Configure Roles` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| name | String | The name of the role. | **(REQUIRED)** |
| description | String | The description text for the role. | **(REQUIRED)** |
| max_outpath_depth | Int32 | The maximum outpath depth allowed for the role. | **(REQUIRED)** |
| max_t2i_simultaneous | Int32 | The maximum number of simultaneous T2I allowed for the role. | **(REQUIRED)** |
| allow_unsafe_outpaths | Boolean | Whether to allow unsafe outpaths for the role. | **(REQUIRED)** |
| model_whitelist | String | Comma-separated list of model names to whitelist for the role. | **(REQUIRED)** |
| model_blacklist | String | Comma-separated list of model names to blacklist for the role. | **(REQUIRED)** |
| permissions | String | Comma-separated list of enabled permission nodes. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/AdminGetUserInfo

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to get info about a user.

#### Permission Flag

`manage_users` - `Manage Users` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| name | String | The name of the user to get info for. | **(REQUIRED)** |

#### Return Format

```js
    "user_id": "useridhere",
    "password_set_by_admin": true, // false if set by user
    "settings": { ... }, // User settings, same format as GetUserSettings
    "max_t2i": 32 // actual value of max t2i simultaneous, calculated from current roles and available backends
```

## HTTP Route /API/AdminListPermissions

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to get a list of all available permissions.

#### Permission Flag

`configure_roles` - `Configure Roles` in group `Admin`

#### Parameters

**None.**

#### Return Format

```js
    "permissions": [
        "perm_name": {
            "name": "Perm Name",
            "description": "Description text for the perm",
            "default": "USER",
            "group": {
                "name": "My Group",
                "description": "Some group description"
            },
            "safety_level": "UNTESTED",
            "alt_safety_text": "some text here or null"
        }
    ]
```

## HTTP Route /API/AdminListRoles

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to get a list of all available roles.

#### Permission Flag

`configure_roles` - `Configure Roles` in group `Admin`

#### Parameters

**None.**

#### Return Format

```js
    "roles": [
        "user": {
            "name": "User",
            "description": "Text here...",
            "max_out_depth_path": 5,
            "is_auto_generated": true,
            "model_whitelist": [],
            "model_blacklist": [],
            "permissions": ["first", "second"],
            "max_t2i_simultaneous": 32,
            "allow_unsafe_outpaths": false
        }
    ]
```

## HTTP Route /API/AdminListUsers

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to get a list of all known users by ID.

#### Permission Flag

`manage_users` - `Manage Users` in group `Admin`

#### Parameters

**None.**

#### Return Format

```js
    "users": [
        "user1",
        "user2"
    ]
```

## HTTP Route /API/AdminSetUserPassword

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Admin route to force-set a user's password.

#### Permission Flag

`manage_users` - `Manage Users` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| name | String | The name of the user. | **(REQUIRED)** |
| password | String | New password for the user. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/ChangeServerSettings

#### Description

Changes server settings.

#### Permission Flag

`edit_server_settings` - `Edit Server Settings` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| rawData | JObject | Dynamic input of `"settingname": valuehere`. | **(REQUIRED)** |

#### Return Format

```js
"success": true
```

## HTTP Route /API/CheckForUpdates

#### Description

Do a scan for any available updates to SwarmUI, extensions, or backends.

#### Permission Flag

`restart` - `Restart Server` in group `Admin`

#### Parameters

**None.**

#### Return Format

```js
    "server_updates_count": 0,
    "server_updates_preview": ["name1", ..., "name6"], // capped to just a few
    "extension_updates": ["name1", ...],
    "backend_updates": ["name1", ...]
```

## HTTP Route /API/DebugGenDocs

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

(Internal/Debug route), generates API docs.

#### Permission Flag

`admin_debug` - `Admin Debug APIs` in group `Admin`

#### Parameters

**None.**

#### Return Format

```js
"success": true
```

## HTTP Route /API/DebugLanguageAdd

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

(Internal/Debug route), adds language data to the language file builder.

#### Permission Flag

`admin_debug` - `Admin Debug APIs` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| raw | JObject | "set": [ "word", ... ] | **(REQUIRED)** |

#### Return Format

```js
"success": true
```

## HTTP Route /API/GetGlobalStatus

> [!WARNING]
> This API is marked non-final.
> This means it is experimental, non-functional, or subject to change.
> Use at your own risk.

#### Description

Get global server-wide generation status across all sessions.

#### Permission Flag

`read_server_info_panels` - `Read Server Info Panels` in group `Admin`

#### Parameters

**None.**

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

## HTTP Route /API/GetServerResourceInfo

#### Description

Returns information about the server's resource usage.

#### Permission Flag

`read_server_info_panels` - `Read Server Info Panels` in group `Admin`

#### Parameters

**None.**

#### Return Format

```js
    "cpu": {
        "usage": 0.0,
        "cores": 0
    },
    "system_ram": {
        "total": 0,
        "used": 0,
        "free": 0
    },
    "gpus": {
        "0": {
            "id": 0,
            "name": "namehere",
            "temperature": 0,
            "utilization_gpu": 0,
            "utilization_memory": 0,
            "total_memory": 0,
            "free_memory": 0,
            "used_memory": 0
        }
    }
```

## HTTP Route /API/InstallExtension

#### Description

Installs an extension from the known extensions list. Does not trigger a restart. Does signal required rebuild.

#### Permission Flag

`manage_extensions` - `Manage Extensions` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| extensionName | String | The name of the extension to install, from the known extensions list. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/ListConnectedUsers

#### Description

Returns a list of currently connected users.

#### Permission Flag

`read_server_info_panels` - `Read Server Info Panels` in group `Admin`

#### Parameters

**None.**

#### Return Format

```js
    "users":
    [
        {
            "id": "useridhere",
            "last_active_seconds": 0,
            "active_sessions": [ "addresshere", "..." ],
            "last_active": "10 seconds ago"
        }
    ]
```

## HTTP Route /API/ListLogTypes

#### Description

Returns a list of the available log types.

#### Permission Flag

`view_logs` - `View Server Logs` in group `Admin`

#### Parameters

**None.**

#### Return Format

```js
    "types_available": [
        {
            "name": "namehere",
            "color": "#RRGGBB",
            "identifier": "identifierhere"
        }
    ]
```

## HTTP Route /API/ListRecentLogMessages

#### Description

Returns a list of recent server log messages.

#### Permission Flag

`view_logs` - `View Server Logs` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| raw | JObject | Use eg `"types": ["info"]` to specify what log types to include.
Optionally input `"last_sequence_ids": { "info": 123 }` to set the start point. | **(REQUIRED)** |

#### Return Format

```js
  "last_sequence_id": 123,
  "data": {
        "info": [
            {
                "sequence_id": 123,
                "timestamp": "yyyy-MM-dd HH:mm:ss.fff",
                "message": "messagehere"
            }, ...
        ]
    }
```

## HTTP Route /API/ListServerSettings

#### Description

Returns a list of the server settings, will full metadata.

#### Permission Flag

`read_server_settings` - `Read Server Settings` in group `Admin`

#### Parameters

**None.**

#### Return Format

```js
    "settings": {
        "settingname": {
            "type": "typehere",
            "name": "namehere",
            "value": somevaluehere,
            "description": "sometext",
            "values": [...] or null,
            "value_names": [...] or null
        }
    }
```

## HTTP Route /API/LogSubmitToPastebin

#### Description

Submits current server log info to a pastebin service automatically.

#### Permission Flag

`view_logs` - `View Server Logs` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| type | String | The minimum log level (verbose, debug, info) to include. | **(REQUIRED)** |

#### Return Format

```js
  "url": "a url to the paste here"
```

## HTTP Route /API/ShutdownServer

#### Description

Shuts the server down. Returns success before the server is gone.

#### Permission Flag

`shutdown` - `Shutdown Server` in group `Admin`

#### Parameters

**None.**

#### Return Format

```js
"success": true
```

## HTTP Route /API/UninstallExtension

#### Description

Triggers an extension uninstallation for an installed extension. Does not trigger a restart. Does signal required rebuild.

#### Permission Flag

`manage_extensions` - `Manage Extensions` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| extensionName | String | The name of the extension to uninstall. | **(REQUIRED)** |

#### Return Format

```js
    "success": true
```

## HTTP Route /API/UpdateAndRestart

#### Description

Causes swarm to update, then close and restart itself. If there's no update to apply, won't restart.

#### Permission Flag

`restart` - `Restart Server` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| updateExtensions | Boolean | True to also update any extensions. | `False` |
| updateBackends | Boolean | True to also update any backends. | `False` |
| force | Boolean | True to always rebuild and restart even if there's no visible update. | `False` |

#### Return Format

```js
    "success": true, // or false if not updated
    "result": "No changes found." // or any other applicable human-readable English message
```

## HTTP Route /API/UpdateExtension

#### Description

Triggers an extension update for an installed extension. Does not trigger a restart. Does signal required rebuild.

#### Permission Flag

`manage_extensions` - `Manage Extensions` in group `Admin`

#### Parameters

| Name | Type | Description | Default |
| --- | --- | --- | --- |
| extensionName | String | The name of the extension to update. | **(REQUIRED)** |

#### Return Format

```js
    "success": true // or false if no update available
```

