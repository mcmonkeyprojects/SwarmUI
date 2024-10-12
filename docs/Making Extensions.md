# Making Extensions for SwarmUI

So, you want to make a Swarm extension, eh? You've come to the right place!

Here's some general info:

- Extensions can basically do anything, in fact much of Swarm's native functionality comes from built-in extensions.
- An extension is a folder inside `src/Extensions/`, for example `src/Extensions/MyExtension/...`
- Every extension has a root `.cs` C# class file that extends `Extension`, in a file named the same as the class, eg `src/Extensions/MyExtension/MyCoolExtensionName.cs` contains `public class MyCoolExtensionName : Extension`
- There's a variety of initialization points, and you can choose the one that fits your needs, and then register any usage/callbacks/etc.
- When writing a Swarm extension, you need to meet Swarm's code requirements -- most notably, that means you need to write code that won't explode if it's called from multiple threads (in most cases this won't be an issue, it's just something to consider when you're getting very advanced).
- All of Swarm is open source, including a pile of built-in-extensions ([see here](https://github.com/mcmonkeyprojects/SwarmUI/tree/master/src/BuiltinExtensions)), so you can reference any existing code to get examples of things
    - `DynamicThresholding` in particular in there is a great example of a simple extension that adds support for an external comfy node with some parameters.
- Swarm uses C#, a compiled language, so it only recompiles if (A) you do so manually, (B) you run the `update` script in the swarm root, or (C) you launch using the `launch-dev` scripts (builds fresh every time). When working on extensions, you need to either use the dev scripts, or remember to run the update every time.
- You can add custom tabs by just making a folder inside your extension of `Tabs/Text2Image/` and inside of that put `Your Tab Name.html`
- See the [`Extension` class source here](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/src/Core/Extension.cs) for more things you can do.
    - This has several different launch points (eg `OnInit`, `OnPreInit`, etc.) and some registration points (eg `ScriptFiles` and `StyleSheetFiles` to register custom web assets to the main page).
- After making an extension, PR it to the [extension list file](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/launchtools/extension_list.fds)

# Extension Standards

The following standards will be enforced for official listing of Swarm extensions. You won't be physically prevented from making extensions that violate these standards, you will just not be included on official listings if you violate them.

Note that if you see an extension on the list has snuck a violation past, please report it on the SwarmUI Discord or GitHub Issues page.

These standards are newly written as of October 2024, and may change over time based on community feedback or what's seen in real extensions in the wild.

- **1: Legitimacy**: First and foremost, the extension must of course be a legitimate extension that does what it claims to do, does not include malware, etc.
- **2: Non-breakage of core**: An extension may not break any core functionality, nor include code so risky/dangerous it is likely to accidentally break core features.
    - Intentional core breakage is not welcome either. Eg "The error popups were annoying so I disabled them" = nope. (In that case you'd open a PR to SwarmUI core to add a setting to toggle those).
- **3: Self-containment**: An extension should, to the maximum extent reasonably possible, *just work* when installed.
    - Wholy unnecessary dependencies will result in an extension's refusal from listing.
    - Necessary dependencies (say for example an LLM extension, has a necessary dependency on some engine or API to run the LLM) is allowable though.
    - Any settings should have reasonable defaults aligned with what the average user is likely to want, and not require configuration except where necessary/personal (eg a required API key).
- **4: No core hacking**: Don't hack the core to add support for something you need. If the existing core is in the way, please open an PR to fix the issue.
    - I (mcmonkey) am very fast about reviewing PRs and getting them merged in, so don't be shy to get things patched.
    - Similarly feel free to make PRs just to make calls you need easier to handle from the extension side.
    - I know there are several awkward limitations for extensions right now. Let's work together to fix those limitations for everyone, rather than hacking them for your own extension's benefit and nobody else's.
- **5: No unneeded web connections**: Do not make external web connections unless necessary for some functionality. Any functionality that could be disabled to prevent web connections without breaking the extension as a whole should have a way to disable it.
    - Make sure it's clear when/why a connection will be happening. At the very least, a notice in the readme listing what connections are made and why.
    - Something like adding web advertisements would directly violate this rule.
- **6: No financial restrictions**: This is a free and open source project, maintained by and for the open source AI community. Nobody here wants ads or paywalls.
    - Restriction features behind promotional restrictions (eg "Join my Discord to get a code to activate (x) feature") is also forbidden.
        - Though of course, "Join my Discord to get help" is fine
    - Necessary financial limits, say for example you're integrated the OpenAI API, which costs money, are allowable as long as that's clear upfront. Extensions with upstream financial requirements must be clearly tagged as such.
- **6: Minimal advertisement or self-promotion**: Again, this is a free and open source project, nobody wants ads or paywalls. So don't put ads in people's faces.
    - I say "minimal" because if you want to put a "Sponsor me on GitHub (here)" link in your readme or something, that's okay. Just don't be in people's faces about it (no popups, no centerscreen messages, etc.)
    - Non-financial promotions (such as advertising your other Swarm extensions) falls under the same rule - minimal mention in a readme or something is fine, shoving it in people's faces is not.
    - Advertisement of any form for any entity that is not yourself (the creator of the extension) is strictly forbidden.

# Example: A Custom Comfy-Node-Backed Parameter

Save this file as `src/Extensions/MyExtension/MyCoolExtensionName.cs`:

```cs
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.Text2Image;
using SwarmUI.Builtin_ComfyUIBackend;
using Newtonsoft.Json.Linq;

// NOTE: Namespace must NOT contain "SwarmUI" (this is reserved for built-ins)
namespace MonkeysDocs.CoolExtensions.MyExtension;

// NOTE: Classname must match filename
public class MyCoolExtensionName : Extension // extend the "Extension" class in Swarm Core
{
    // Generally define parameters as "public static" to make them easy to access in other code, actual registration is done in OnInit
    public static T2IRegisteredParam<int> MyCoolParam;

    public static T2IParamGroup MyCoolParamGroup;

    // OnInit is called when the extension is loaded, and is the general place to register most things
    public override void OnInit()
    {
        Logs.Init("Wow my cool extension is doing a thing"); // Use "Logs" for any/all logging.
        MyCoolParamGroup = new("My Cool Param Group", Toggles: false, Open: false, IsAdvanced: true);
        // Note that parameter name in code and registration should generally match (for simple clarity).
        MyCoolParam = T2IParamTypes.Register<int>(new("My Cool Param", "Some description about my cool parameter here. This demo blurs the final image.",
            "10", Toggleable: true, Group: MyCoolParamGroup, FeatureFlag: "comfyui" // "comfyui" feature flag for parameters that require ComfyUI
            // Check your IDE's completions here, there's tons of additional options. Look inside the T2IParamTypes to see how other params are registered.
            ));
        // AddStep for custom Comfy steps. Can also use AddModelGenStep for custom model configuration steps.
        WorkflowGenerator.AddStep(g =>
        {
            // Generally always check that your parameter exists before doing anything (so you don't infect unrelated generations unless the user wants your feature running)
            if (g.UserInput.TryGet(MyCoolParam, out int myParamNumber))
            {
                // Create the node we want...
                string shiftNode = g.CreateNode("ImageBlur", new JObject()
                {
                    // And configure all the inputs to that node...
                    ["image"] = g.FinalImageOut, // Take in the prior final image value
                    ["blur_radius"] = myParamNumber,
                    ["sigma"] = 5
                });
                // And then make sure its result actually gets used. The final save image uses 'FinalImageOut' to identify what to save, so just update that.
                g.FinalImageOut = [shiftNode, 0]; // (Note the 0 is because some nodes have multiple outputs, so 0 means use the first output)
            }
            // The priority value determines where in the workflow this will process.
            // You can technically just use a late priority and then just modify the workflow at will, but it's best to run at the appropriate time.
            // Check the source of WorkflowGenerator to see what priorities are what.
            // In this case, the final save image step is at priority of "10", so we run at "9", ie just before that.
            // (You can use eg 9.5 or 9.999 if you think something else is running at 9 and you need to be after it).
        }, 9);
    }
}
```

Then:
- rebuild and launch Swarm (run the update file, or launch-dev file)
- Open the UI, enable `Display Advanced Options`, find `My Cool Param Group`, inside it enable `My Cool Param`
- Generate an image and observe that it's now generating blurred images!
- Then go back and modify the code to do whatever you actually need.
- Then maybe publish your extension on GitHub for other people to use :D
    - Just `git init` inside the `src/Extension/MyExtension` folder and publish that on GitHub, others can simply `git clone` your repo, then run the update script and enjoy it.
