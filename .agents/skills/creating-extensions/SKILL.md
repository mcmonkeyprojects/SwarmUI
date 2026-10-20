---
name: creating-extensions
description: Create or maintain external SwarmUI extensions under src/Extensions, including project and Git setup, toggleable parameter groups, Comfy workflows and node packs, frontend assets, and extension-owned API routes.
---

# Creating SwarmUI Extensions

Use this skill to develop an external extension for a user's SwarmUI installation. Keep the implementation in `src/Extensions/<ExtensionFolder>/`, with its own repository.

Paths in these references are relative to the SwarmUI root, even when the working directory is the extension's repository. Read the current source at those paths before using an integration point.

## Workflow

1. Identify the requested behavior and inspect similar built-in extensions as read-only examples. Reuse public registration hooks and utilities. If a required hook is missing, explain the limitation and propose a core change separately; do not patch core files as part of the extension.
2. Read [extension setup and maintenance](references/extension-lifecycle.md) when creating the folder, project, README, or Git setup, or changing initialization behavior.
3. For generation behavior, read [parameters and groups](references/parameters.md) and [Comfy workflow integration](references/workflows.md). Extension parameters must have their own group with `Toggles: true`; disabling the group must leave ordinary generations unaffected.
4. If a third-party Comfy pack is needed, read [custom-node packs](references/node-packs.md) for source inspection, feature discovery, and the existing download-button integration.
5. Read [frontend features](references/frontend.md) only for custom assets, tabs, or browser behavior. Generic generation parameters already have a frontend.
6. Read [API routes](references/api-routes.md) only for requested server operations requiring a new endpoint. A new generation parameter or install button does not require its own route.
7. Trace the complete path from input to behavior, inspect the final diff in the extension's repository, and remove unnecessary changes. Report what was checked and any live verification the user still needs to perform.

## Scope and Conventions

- Do not modify `src/BuiltinExtensions`, `src/wwwroot`, core project files, downloaded Python repositories, or the parent repository's rules to implement an extension. Register extension-owned code and assets through the existing hooks.
- Add parameters and routes only when requested. If an additional control or endpoint seems useful, explain it and obtain agreement before expanding the feature.
- Follow the user's execution permissions. Creating extension files does not authorize installing dependencies, restarting a running server, publishing a repository, or creating/pushing commits.
- Match Swarm conventions in extension code: explicit C# types, full braced blocks, XML documentation for fields, and `Logs` for logging. Register shared definitions at startup; keep request/generation state local and safe for concurrent calls.
- Use static inspection first. Follow the applicable build/test instructions. Give the user focused verification steps for behavior requiring a running UI or backend.
