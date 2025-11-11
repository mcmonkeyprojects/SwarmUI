# Contributing to SwarmUI

Please open an Issue or Discussion, or ask on [Discord](https://discord.gg/q2y38cqjNw) before opening a pull request, to make sure your work doesn't overlap with others, and to ensure you don't spend time working on an idea that doesn't make sense or can't be pulled.

(TODO: More general contributing info)

## Extensions

Want to make something out of scope for Swarm's core systems? Make an extension! See the [Making Extensions Doc](/docs/Making%20Extensions.md)

If your extension is ready to go, post it in the `#extensions` channel on Discord, and open a pull request adding it to the file `launchtools/extension_list.fds`

## Pull Requests

Pull Requests (PRs) on GitHub are how you submit changes to the core codebase.

When writing a pull request, you are expected:
- To follow language-specific format guidelines (see below sections)
- To fit the style and design of the project
- To have discussed your PR in advance (GitHub issue, or Discord) before making it
- To explain your PR when submitting it in the OP (doesn't have to be long, just has to be reasonably clear enough to figure out what's going on)
- To be able and willing to answer questions regarding your code, or make changes if/when needed.
    - ie, you must actually understand your own work. If an LLM wrote it for you and you don't understand it, do not try to PR it.
- To have tested your own work prior to submitting.

Pull Requests from newer contributors that are not directly addressing an issue with the `Easy PR` label may be closed without warning or reason. Frequent contributors may take issues that do not have that label. Only trusted maintainers should make code changes not related to a listed issue.

## C#

Contributing to the C# server code, or writing an extension? I recommend Visual Studio 2022 as the optimal IDE for this. Follow standard C# formatting rules. Look at existing code if in doubt. We use a modern C# Syntax.

All functions, fields, properties, should have `///` XML doc comments.

## JavaScript

Contributing to the JS webcode, or writing an extension that uses it? Use any editor of your choice, VS Code is sufficient. Follow mostly the standard JS formatting rules, but look at the existing code. Notable deviations from norm include:
- always `let` never `const`
- when all else is equal, stick to simpler syntax. For example use `==` unless `===` is logically required. Stick to standard `for (...)` instead of `arr.forEach`, etc.
- `async` block usage is WIP, I want to transition Swarm to use those but there's a lot of callback-based code (sorry I just hadn't realized `async` was well-supported in browsers now when I started work on Swarm, this one's my fault - mcmonkey)

A lot of JS code was written as a quick in-file dump (I focused a lot more on C# quality than JS quality when the project was young). Work is progressing on moving it over to class-based systems. After it's all class based, I'd like to enable `'use strict'` and `import`. Possibly an upgrade to typescript after that.

All code under the class-based systems should have `/**` doc comments atop classes and functions.

For the most part, when contributing, simply match the style of the area you're in.

## Python

Contributing to the Python code? Use any editor of your choice, VS Code is sufficient. Follow standard python rules, and for any deviations generally follow comfy rules.

Writing an extension with custom python? If it's comfy nodes, consider writing it in a way that allows it to be imported to regular comfy installs too, and write according to comfy standards.

## Languages

Want to help translate Swarm into another language?

- Translations are likely going to be reworked from the ground up soon, maybe hold off on language updates.
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

## LLM-Written Code

This is an AI project, so obviously we don't hate AI here. However, we also understand its limitations well, so we ask that you are reasonable about using of AI language models:
- "Intelligent autocomplete" tools (Copilot, Cursor, etc.) are completely fine.
- Asking a chatbot for tips or methods to use is fine. Double-check the accuracy of anything it claims before doing it.
- "Hey ChatGPT write this code for me" or similar, is not okay.
- Broadly, make your own decisions about what to write and how to write it. The LLM can replace the keyboard clacking, and it can help you recall specific functions, but they tend to be quite bad at larger scale planning.
- You are expected to understand every line of your own code submission. You may even be asked during PR review.
- Especially double check that any LLM written code both (1) followed the usual formatting rules and (2) used relevant functions.
    - LLMs will often write to much older standards of the language, and will be unaware that there are 'proper' functions in the local context, eg an LLM writing JS might try to use `fetch` (JS API) instead of the proper `genericRequest` (Swarm site.js)
- You are expected to have tested your own contribution, obviously. If you submit non-functional LLM-written code you may be barred permanently from further contributions, as a spammer.

# Legal

By submitting a contribution to this repo, you agree to grant a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to Alex "mcmonkey" Goodwin to use, copy, modify, and distribute your contribution under the terms of the MIT License, view [LICENSE.txt](/LICENSE.txt) for details, and under any future license we may change to.
