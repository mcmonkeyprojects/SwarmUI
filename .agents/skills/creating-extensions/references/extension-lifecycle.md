# Extension Setup and Maintenance

## Source References

- `src/Core/Extension.cs`: metadata, lifecycle hooks, and asset lists.
- `src/Core/ExtensionsManager.cs`: project discovery and extension loading.
- `src/Core/Program.cs`: initialization order.
- `src/SwarmUI.extension.props`: extension project defaults and host references.
- `docs/Making Extensions.md`: extension standards.
- `launchtools/extension_list.fds`: official listing format and current listing requirements.

## Create the Project

Create one folder directly under `src/Extensions/`. Put the main `.cs` file and `.csproj` at that folder's root. A typical extension has:

```text
src/Extensions/MyExtension/
    MyExtension.cs
    MyExtension.csproj
    README.md
    LICENSE
    .gitignore
```

Add `Assets/`, `Tabs/Text2Image/`, or other source files only when needed.

Use the extension properties import instead of copying the host project's configuration:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
    <PropertyGroup>
        <AssemblyName>MyExtension</AssemblyName>
    </PropertyGroup>
    <Import Project="../../SwarmUI.extension.props" />
</Project>
```

The relative import assumes this exact installation depth. It supplies the framework, library configuration, host reference, shared usings, and standard dependencies. Add an extra dependency only when the feature needs it; do not add a project reference back to the host or duplicate its package list. Prefer a single project at the extension root. If several are necessary, discovery prioritizes a filename containing `Extension`.

The entry class must be concrete, derive from `SwarmUI.Core.Extension`, have a parameterless constructor, and match its root filename exactly. Its namespace must be nonempty and must not start with `SwarmUI.`; that prefix is reserved for built-ins. Choose a globally distinctive class name because it becomes the `ExtensionName` and identifies registered web assets.

For `MyExtension.cs`:

```cs
using SwarmUI.Core;

namespace ExampleAuthor.Extensions;

/// <summary>Implements the requested extension feature.</summary>
public class MyExtension : Extension
{
    public override void OnInit()
    {
        // Register a parameter or whatever.
    }
}
```

Do not manually assign extension fields such as License, FilePath, Description, etc - these are autofilled by the engine.

## Choose the Initialization Hook

| Hook | Appropriate work |
| --- | --- |
| `OnFirstInit` | Very early setup, before settings and normal services are ready. Rarely needed. |
| `OnPreInit` | Setup after settings but before core parameter registration and model scanning; specialized model-class registration belongs here. |
| `OnInit` | Normal registration of parameters, workflow steps, installable features, API routes, permissions, and assets. Core parameter definitions and main service objects exist. |
| `OnPreLaunch` | Work requiring the prepared application just before launch. Asset gathering has already happened, so register assets earlier. |
| `OnShutdown` | Cleanup of extension-owned resources. It is not guaranteed on crashes. |

Register `ScriptFiles`, `StyleSheetFiles`, and `OtherAssets` in `OnInit` or earlier. Register workflow hooks once during startup, never from a request handler or once per generation. Do not rely on ordering between unrelated external extensions.

## README and Repository Ownership

The extension is a standalone repository whose root is the extension folder, not the SwarmUI root. SwarmUI ignores `src/Extensions`; the extension's own Git status/diff is the relevant review. Before Git setup, check whether the target already has its own repository. If Git initialization or remote setup is requested, perform it inside that folder and preserve existing history and remotes. Use an HTTPS `origin` URL for compatibility with Swarm's metadata handling. Do not commit, push, create a hosted repository, or publish a listing without the user's authorization.

Keep source, assets, README, and license in the extension repository. Ignore generated files such as `bin/`, `obj/`, IDE state, and `__pycache__/` when applicable. Keep secrets and local configuration out of the repository. Do not change Swarm's `.gitignore` to expose the extension to the parent repository.

Write the README for someone installing the extension:

- What it does, which models/media/backends it supports, and any known limits.
- Installation into `SwarmUI/src/Extensions/<ExtensionFolder>/`, followed by restarting Swarm; listed extensions can be installed from `Server` -> `Extensions`.
- Where the controls/tab appear, whether Advanced Options is needed, how to enable the parameter group, and a small usage example.
- Required Comfy node packs, the install-button location, and manual setup for externally managed Comfy instances. Distinguish required model downloads from Python dependencies.
- Necessary settings, credentials, external connections, paid upstream services, and why they are needed. Optional network-dependent functionality should be disableable.
- How to update, disable, or uninstall the extension, and that the Server extension-management actions require a restart to apply.
- License, authorship, and where to report problems.

Swarm's extension updater uses the extension's Git repository. Do not replace it with an updater that rewrites core files. Keep dependencies necessary and the default experience self-contained. Match the host's themes and avoid breaking core behavior; the complete official-listing standards are in `docs/Making Extensions.md`.

If the user requests official listing, prepare the separate change to `launchtools/extension_list.fds` with a root HTTPS repository URL without a trailing slash, author, description, license, and appropriate tags. Do not add `ci-test`; that is a maintainer decision. Preparing an extension does not itself authorize modifying the core listing or opening a PR.

## Development and Verification

Extension C# changes require a server restart with recompilation; refreshing the browser alone is insufficient. For local development, use `launch-windows-dev.ps1` on Windows or `./launch-linux-dev.sh` on Linux. Do not run launchers or builds when the applicable instructions reserve them for the user.

Ask the user to confirm startup discovers the extension without errors, its controls appear, and its enabled behavior works. Check the final diff from the extension's own repository, including newly created files, and ensure no core or downloaded files changed.
