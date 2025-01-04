# SwarmUI API Documentation - AdminAPI

> This is a subset of the API docs, see [/docs/API.md](/docs/API.md) for general info.

Administrative APIs related to server management.

#### Table of Contents:

- HTTP Route [AdminAddRole](#http-route-apiadminaddrole)
- HTTP Route [AdminAddUser](#http-route-apiadminadduser)
- HTTP Route [AdminDeleteRole](#http-route-apiadmindeleterole)
- HTTP Route [AdminDeleteUser](#http-route-apiadmindeleteuser)
- HTTP Route [AdminListPermissions](#http-route-apiadminlistpermissions)
- HTTP Route [AdminListRoles](#http-route-apiadminlistroles)
- HTTP Route [AdminListUsers](#http-route-apiadminlistusers)
- HTTP Route [ChangeServerSettings](#http-route-apichangeserversettings)
- HTTP Route [DebugGenDocs](#http-route-apidebuggendocs)
- HTTP Route [DebugLanguageAdd](#http-route-apidebuglanguageadd)
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

## HTTP Route /API/AdminDeleteRole

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

## HTTP Route /API/AdminListPermissions

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

## HTTP Route /API/DebugGenDocs

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
| raw | JObject | Optionally input `"last_sequence_ids": { "info": 123 }` to set the start point. | **(REQUIRED)** |

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

