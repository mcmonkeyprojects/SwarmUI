# Custom Frontend Features

Read `src/Core/Extension.cs`, `WebServer.GatherExtensionPageAdditions`, `src/Pages/Text2Image.cshtml`, and the closest existing extension before choosing a UI hook. The generated parameter UI should handle ordinary generation controls.

## Assets and Tabs

- Keep browser files inside the extension. Register relative paths such as `ScriptFiles.Add("Assets/my_extension.js")` and `StyleSheetFiles.Add("Assets/my_extension.css")` in `OnInit()` or earlier. Register images and other separately served files in `OtherAssets`.
- Assets are addressed through `ExtensionFile/<ExtensionName>/<relative-file>`, where `ExtensionName` is the entry class name, not necessarily its folder name. Do not edit core Razor pages or copy files into `wwwroot`.
- Add `Tabs/Text2Image/My Extension.html` for a top-level generation-page tab. The file is an HTML fragment; its filename supplies the title and cleaned tab ID. Choose a distinctive name. Swarm registers a tab-view permission automatically; server operations still need their own API authorization.
- Extension scripts load on the generation page after the core generation scripts and before `finalscript.js`. Dependencies inside the extension must appear earlier in `ScriptFiles`. Use classic scripts and existing globals, with no ES module imports or bundler requirement.

## Browser Behavior

Use a class and one owned instance for cohesive behavior. Use the existing lifecycle matching the dependency: `sessionReadyCallbacks` for session-dependent initialization and `postParamBuildSteps` for work after generation controls are built. Controls can be rebuilt, so avoid duplicate handlers and stale element references. Do not use speculative `typeof` checks to conceal an unverified dependency.

Reuse helpers from `src/wwwroot/js/util.js` and `site.js`: `createDiv`, `createSpan`, `getRequiredElementById`, `escapeHtml`, `triggerChangeFor`, `showError`, and the session-aware `genericRequest`/`makeWSRequest` wrappers. The `html` argument of DOM helpers is HTML, so escape dynamic content or use `textContent` for plain text. Give extension element IDs, CSS classes, and globals distinctive names and keep CSS compatible with Swarm themes and mobile layouts.

Match Swarm JavaScript style: `let`, full braced blocks, documented functions/methods, standard `for` loops, and `else` on its own line. Use the appropriate existing hook instead of overriding core global functions. Read [API routes](api-routes.md) only when the requested UI needs a server capability that existing endpoints do not supply.

Verify script order, tab/element availability, repeated initialization, user-visible errors, and relevant desktop/mobile layouts. Asset registration changes require a server restart; reload the browser to verify the resulting frontend.
