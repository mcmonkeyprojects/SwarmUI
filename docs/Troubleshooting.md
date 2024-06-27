# Troubleshooting Issues in SwarmUI

First of all: when in doubt, restart. The tried and true classic of solving IT problems is as true in SwarmUI as anywhere else - when you restart, a lot of problems solve themselves.

Second, feel free to open [issues here on GitHub](https://github.com/mcmonkeyprojects/SwarmUI/issues) or ask on [the SwarmUI Discord](https://discord.gg/q2y38cqjNw) where we have a `#help-forum` available for questions. These are also both great places to search for if anyone else has had the same problem before and already gotten an answer.

### I Have An Error Message And Don't Know What To Do

Step 1 is read the error message. A lot of error messages in Swarm are intentionally written in clear plain English to tell you exactly what went wrong and how to fix it. Sometimes it's not clear enough or you'll get an internal error without good info, so:

Step 2 is copy/paste the error message and search [GitHub](https://github.com/mcmonkeyprojects/SwarmUI/issues) and [Discord](https://discord.gg/q2y38cqjNw). Chances are you'll find somebody else has posted the same error message before and gotten an answer explaining what to do.

If both of those don't get you an instant easy answer, time for a bit more effort: Step 3 is go to `Server` -> `Logs` -> probably set `ViewType` to `Debug`, and look over the error details. Sometimes the full details of an error can give you the info you need to solve it yourself.

If you can't solve it yourself from there, Step 4 is either post on [GitHub](https://github.com/mcmonkeyprojects/SwarmUI/issues) or [Discord](https://discord.gg/q2y38cqjNw) (in `#help-forum`). Make sure you copy the full Debug log and include it (not just the bottom part, copy the whole log! The info at the top of the log when Swarm is booting up is often important), also include details about what you're trying (what paramaters are you using? What are you clicking on? Does a problem happen right away or only halfway through generating an image, or...?). It also helps to add a screenshot of your UI when the error happens.

### I Need To Install Something With Pip

So you have a pip dependency issue, eh? These usually happen from playing around with custom nodes too much, but sometimes can happen from updates. For the most part, when you stay on the "beaten path" of Swarm, this shouldn't come up. If you haven't been specifically told you need to install a pip package, you probably shouldn't do this.

When you need to install a pip dependency, you're gonna have to use the command line. The precise method depends on your OS (Windows vs Linux/Mac).

#### Windows:

- Open a command line in `(Your Swarm Install)\dlbackend\comfy`
- type the command `python_embeded\python.exe -s -m pip install (your package)`
    - For example `python_embeded\python.exe -s -m pip install transformers -U` (if you got a message saying you need to reinstall `transformers`, such as the "`ImportError: huggingface-hub ...`" error message)

#### Linux/Mac:

- Open a command line in `(Your Swarm Install)/dlbackend/ComfyUI/`
- activate the venv with `source venv/bin/activate`
- type the command `python -s -m pip install (your package)`
    - For example `python -s -m pip install transformers -U`

#### Note

If you're an advanced user familiar with command line usage and/or with a custom python env, you can adapt the specifics as needed, just make note of the `python -s -m pip` syntax: that `-s` tells python to store the installed package in your current env. Without this (if you eg use just `pip install ...`) it may link to packages that are in your OS global install, which tends to cause a lot of issues. So, avoid that with `-s`.

### Other

If you have some other troubleshooting issue you think should be listed here, let me know on [the SwarmUI Discord](https://discord.gg/q2y38cqjNw).
