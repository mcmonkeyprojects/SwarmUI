# Extension API Routes

## Decide Whether a Route Is Needed

Use a new route for a requested extension-owned server operation that existing APIs cannot express: for example, querying server-side extension state or running an extension tool with progress updates. Browser-only UI, new generation controls, workflow hooks, and registered node-pack installers already have integration paths and ordinarily need no new endpoint.

Only add a route when the user directly requests it. If implementing a requested feature appears to need an additional endpoint, explain that requirement and obtain agreement before adding it. Do not add a route merely to call a helper from JavaScript when an existing API already supports the action.

## Source References

- `src/WebAPI/API.cs`: registration, session/permission checks, HTTP/WebSocket dispatch, and documentation attributes.
- `src/WebAPI/APICallReflectBuilder.cs`: exact supported method signatures and input binding.
- `src/Accounts/Permissions.cs`: permissions, `PermInfo`, defaults, groups, and safety levels.
- `src/BuiltinExtensions/GridGenerator/GridGeneratorExtension.cs` and `ImageBatchTool/ImageBatchToolExtension.cs`: extension route registration and long-running tools. Read their patterns without copying unrelated legacy limitations.
- `docs/API.md`: client protocol. `docs/APIRoutes/` is generated; never edit it by hand.

## Register and Implement in the Extension

1. Keep the handler in the extension class or a cohesive extension-owned API class. A method's name becomes `/API/<MethodName>` and is unique case-insensitively across all extensions and core. Use a distinctive extension prefix.
2. Return exactly `Task<JObject>`. Static methods and instance methods are supported. Use `[API.APIClass("...")]` on the declaring class and `[API.APIDescription(description, returnShape)]` on the handler; add `[API.APIParameter("...")]` to each client-supplied input. These attributes describe the contract; they do not register the route.
3. In the extension's `OnInit()`, call `API.RegisterAPICall(Handler, isUserUpdate, permission)` once. Do not modify `BasicAPIFeatures.Register()` for an extension. Use `true` for deliberate user actions that should refresh user activity, `false` for reads/polling.
4. Reuse the narrowest suitable permission or register an extension-specific `PermInfo` before registering the route. Give new permissions a distinctive lowercase snake-case ID, accurate scope, appropriate group, and the least access needed. Do not register an ordinary route without a permission or add it to `SessionlessRoutes`.
5. Validate the actual operation inside the handler: authorized resources, ownership, allowed paths, model access, bounds, and relevant state. A valid session and route permission do not themselves validate a supplied filename or object ID. Keep per-call state local and handle concurrent calls deliberately.

For example, this is a complete pattern for an explicitly requested read-only endpoint, placed in its own `MyExtensionAPI.cs`:

```cs
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.WebAPI;

namespace ExampleAuthor.Extensions;

[API.APIClass("Read-only information about My Extension.")]
public static class MyExtensionAPI
{
    /// <summary>Permission to inspect this extension's information.</summary>
    public static PermInfo ReadInfo = Permissions.Register(new("myextension_read_info", "[My Extension] Read Info", "Allows reading My Extension information.", PermissionDefault.USER, Permissions.GroupUser));

    [API.APIDescription("Reports whether My Extension is loaded.", "\"loaded\": true")]
    public static Task<JObject> MyExtensionGetInfo()
    {
        return Task.FromResult(new JObject() { ["loaded"] = true });
    }
}
```

In the extension's `OnInit()`:

```cs
API.RegisterAPICall(MyExtensionAPI.MyExtensionGetInfo, false, MyExtensionAPI.ReadInfo);
```

Use the feature's actual permission defaults. Leave the safety level at its default `UNTESTED` unless a different classification is justified; do not claim `SAFE` without the required review. Operations that install code, alter the server, or expose filesystem data need appropriately restricted permissions.

## Binding and Transport

| Handler input | Binding |
| --- | --- |
| `Session`, `HttpContext` | Injected by Swarm. Add `Session` when the operation needs user context. |
| `WebSocket` | Injected and makes the endpoint WebSocket-only. Send progress on the socket and return final JSON, or return `null` after handling output yourself. |
| Supported scalar or `string[]` | JSON key must match the C# parameter name exactly. A C# default makes it optional. |
| `JObject` | Receives the whole request body with `session_id` removed, not a nested object under the parameter name. |
| `IDataHolder` | Structured public fields with supported scalar types and `NetData` annotations; inspect the reflector before using this form. |

Supported scalar types are `string`, `int`, `long`, `float`, `double`, `bool`, `byte`, and `char`. Do not assume arbitrary data types, arrays, nullable types, or a `CancellationToken` are injected/bound. Use `JObject` for genuinely free-form input; stable inputs should have explicit typed contracts and descriptions covering units, valid values, defaults, and sentinel meanings.

The normal HTTP transport is POST with JSON, not GET. From extension JavaScript call `genericRequest('MyExtensionGetInfo', {}, callback)`. Use `makeWSRequest` for a handler that accepts `WebSocket`; route naming alone does not select the transport. Pass the route name without `/API/`; wrappers supply session handling and normal error behavior.

Return meaningful JSON objects. Successful mutations commonly return `{ "success": true }`; expected failures return an `error` string with a stable `error_id` when clients need to branch. Document the returned fields inside the object's return-shape description. Keep endpoint documentation in attributes and, when useful to external consumers, the extension README.

## Verify

Confirm unique naming and one-time registration, the permission's default access, input binding, HTTP/WebSocket agreement, and the frontend caller. Check unauthorized, missing, malformed, domain-invalid, and successful requests. For mutations, inspect resource validation and side effects. Review the extension's diff and give the user any live verification steps you cannot perform.
