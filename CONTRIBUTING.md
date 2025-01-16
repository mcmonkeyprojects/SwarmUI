# Contributing to SwarmUI

Please open an Issue or Discussion, or ask on Discord before opening a pull request, to make sure your work doesn't overlap with others.

(TODO: More general contributing info)

## Languages

Want to help translate Swarm into another language?

- First: you're going to have to speak English. The English text is the "one true root" language that all other languages are derived from, it would be problematic to translate a translation.
- Are you just helping improve an existing language?
    - Great! Just edit the file in `languages/(language-code).json` and improve the translations included
- Do you want to add a new language?
    - See example commit here: https://github.com/mcmonkeyprojects/SwarmUI/commit/20fd27a20127b6529a2837eb838a0cfae80c20b8
    - In short: copy/paste `languages/en.json` to `languages/(your-code).json`, fill out the info at the top, and start translating keys.
    - Also add `src/wwwroot/imgs/flags/(your-code).jpg` as a small icon image of a flag that represents the language.
    - You can use https://github.com/mcmonkeyprojects/translate-tool to fill out any keys you can't be bothered filling in yourself with automatic AI-powered translation
- Are you adding new translatable keys?
    - I use the hidden webconsole call `debugSubmitTranslatables()` to generate `languages/en.debug` which contains a raw key list, and then use `--add-json` to add it in with the translate tool.

## Themes

Want to add a new theme or change an existing one?

- First: make sure it's reasonable and relevant to add to the core. If you're doing crazy experimental stuff, maybe it should be an extension.
    - For extensions, see [Making Extensions Doc](/docs/Making%20Extensions.md)
- Theme files are in `src/wwwroot/css/themes`
- You can add any new theme to the registered theme list in `WebServer.cs`, `PreInit()` block.
- Most core themes should only edit colors, other CSS edits should only be with good well considered reasons.
    - If you must modify non-color CSS, make the minimum possible changes.
    - Non-color CSS should be in a separate file from the color changes, similar to how `modern.css` is a separate file for major edits.
- All new themes should use `modern.css` as the first stylesheet entry. Themes not built atop `modern.css` will not be accepted to the core.
- Themes should ideally be added to Install page, but not strictly required.

# Legal

By submitting a contribution to this repo, you agree to grant a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to Alex "mcmonkey" Goodwin to use, copy, modify, and distribute your contribution under the terms of the MIT License, view [LICENSE.txt](/LICENSE.txt) for details, and under any future license we may change to.
