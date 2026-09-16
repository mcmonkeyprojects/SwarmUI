---
name: frontend-javascript
description: Add or edit SwarmUI browser frontend JavaScript, including shared utilities, class-based helpers and singletons, DOM behavior, API calls, initialization, and script loading.
---

# Frontend JavaScript

## When to Use

- Use this skill for any work under `src/wwwroot/js`, normally alongside related markup in `src/Pages` and styles in `src/wwwroot/css`.

## Architecture

Swarm's frontend uses classic ordered scripts in a shared global scope, not ES modules or a bundler. Do not introduce `import` or `export` into this system. `src/Pages/Shared/_Layout.cshtml` loads libraries, `util.js`, and `translator.js` in the document head, then `permissions.js` and `site.js` near the end of the body. Page-specific scripts load afterward through the page's `Scripts` section. Most often `Text2Image.cshtml` is the file that imports more scripts, as most content is on that page.

New cohesive features should use classes. Keep related state, cached elements, and behavior on `this`; use inheritance when there is a real shared lifecycle or interface. A page-wide helper commonly ends with one documented global instance:

```js
/** Collection of state and behavior for the feature. */
class FeatureHelpers {
    constructor() {
        this.targetElem = getRequiredElementById('feature_target');
    }

    /** Updates the feature. */
    update() {
        // ...
    }
}

/** Shared feature helper. */
let featureHelpers = new FeatureHelpers();
```

Use arrow functions or `.bind(this)` when passing a method as a callback if it needs its instance context. Constructors may initialize state, cache required DOM elements, and wire events when the script is loaded after that markup. Use an existing deferred lifecycle hook when initialization depends on later state: for example, `sessionReadyCallbacks` for a ready user session or a feature-specific hook such as `postParamBuildSteps` when working with generated parameter controls.

Many older files instead contain loose functions and root variables. When editing one, preserve its local structure and naming unless the user specifically requests a refactor. Do not mix an architectural conversion into a focused fix. Likewise, do not move existing legacy helpers merely to make them conform to the modern class pattern.

## Reuse Shared Functions

Search `util.js`, `site.js`, and nearby feature classes before writing a helper. If behavior is reasonably reusable, place it at the narrowest shared layer instead of duplicating or embedding it in one caller.

Use `util.js` for page-independent primitives, including:

- DOM and text: `createDiv`, `createSpan`, `getRequiredElementById`, `findParentOfClass`, `getTextContent`, `setTextContent`, `getTextSelRange`, and `setTextSelRange`.
- Safe string handling: `escapeHtml`, `escapeHtmlNoBr`, `safeHtmlOnly`, `stripHtmlToText`, `escapeJsString`, and `regexEscape`.
- Generic inputs, files, and data: `getInputVal`, `setInputVal`, `readFileText`, `imageToData`, `forceSetDropdownValue`, cookies, parsers, formatting, media-type helpers, and general math/string/array utilities.
- Low-level transport: `sendJsonToServer`, `getJsonDirect`, and `getWSAddress`. Feature code normally uses the session-aware wrappers in `site.js` instead.
- And more, this file is frequently updated.

Use `site.js` for Swarm-wide application behavior, including:

- Server calls: `genericRequest(routeName, data, callback, depth, errorHandler)` and `makeWSRequest(routeName, data, callback, depth, errorHandler, onOpenHandler)`. Pass the registered route name without an `API/` prefix; these wrappers add the session ID, handle normal API errors, and retry invalid sessions.
- Shared feedback and events: `showError`, `genericServerError`, and `triggerChangeFor`.
- Generated controls: the `make*Input` functions, toggle/popover helpers, `enableSliderForBox`, and related sizing/styling helpers.
- Media inputs and browser integration: `clearMediaFileInput`, `setMediaFileInput`, `setMediaFileDirect`, `load_media_file`, and `inputBrowserHelper`.
- General site UI such as modal fragments, quick buttons, completion audio, and session-dependent state.

Do not call the low-level transport directly when `genericRequest` or `makeWSRequest` provides the required behavior. Preserve the existing callback style around these APIs unless the surrounding subsystem already exposes an async abstraction.

## DOM and Events

- Prefer `getRequiredElementById` when an element is required for the feature; use `document.getElementById` when absence is an expected state that the code handles.
- Prefer `createDiv` and `createSpan` for ordinary dynamic elements. Their `html` argument assigns `innerHTML`, so only pass trusted templates or correctly escaped content.
- Put untrusted plain text in `innerText`/`textContent`. When HTML formatting is required, use the appropriate escaping or sanitizing helper and preserve the distinction between `escapeHtml`, `escapeHtmlNoBr`, and `safeHtmlOnly`.
- Use `addEventListener` for new wiring. Use `triggerChangeFor` when programmatically changing a control must notify the same input/change paths as user interaction.
- Cache stable elements on the owning class. Re-query elements that are dynamically replaced, and update cached references after replacement.
- Keep behavior usable in current Chrome, Firefox, and Safari, including Android Chrome and iOS Safari. Do not rely on hover, mouse-only input, or desktop sizing when the feature also needs to work on touch/mobile.

## Loading and Integration

For a new Text2Image/genpage script, add it to the `@section Scripts` block in `src/Pages/Text2Image.cshtml`. Place dependencies before dependents; the order is the dependency mechanism. For another page, add it to that page's script section. Keep `?vary=@Utilities.VaryID` on local script references.

Before constructing a singleton at file scope, confirm its required markup and global dependencies already exist at that point in the load order. Avoid adding a `DOMContentLoaded` wrapper merely by habit: body-end page scripts can initialize immediately, while session- or feature-dependent work belongs in the relevant existing hook.

When changing generated markup or element IDs, search the JavaScript, Razor, and CSS together. Preserve public global names that are referenced by inline handlers, other script files, extensions, or dynamically generated HTML.

## Style

Follow the repository JavaScript rules in `AGENTS.md`. In new code, use `let`, full braced blocks, the repository's newline style for `else`, and `/** ... */` documentation for classes and functions/methods. Use `==`/`!=` by default and strict equality only when the type distinction is logically required. Match the surrounding code's quote, naming, object-key, and callback conventions rather than performing unrelated cleanup.

## Verify

- Search all callers, global references, element IDs, CSS classes, and script dependencies affected by the change.
- Check that required elements exist when constructors run and that callbacks retain the intended `this` value.
- Check success, server-error, absent/optional-element, repeated-event, and dynamically replaced-DOM paths as applicable.
- Check that interpolated content is escaped for its actual context and that programmatic control updates fire the required events.
- Review the final `git diff`, remove stray or unnecessary edits, and follow the repository's build/test policy in `AGENTS.md`.
