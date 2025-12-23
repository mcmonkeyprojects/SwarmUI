# Why Use Swarm?

Why should you use Swarm, a series of 'sales'\* pitches:
\*(Swarm is and always will be 100% free and open source)

The answer to why you should use Swarm depends on who you are...

### I am a ComfyUI User

If you're a happy comfy user, you're probably a fan of the noodles. If you're not a fan of the noodles but just tolerating, switch to the "other local SD UI user" option below.

Swarm is a wrapper around Comfy - it contains Comfy, in full, node graph and all, and then adds more. So right away point one for a Comfy user considering Swarm: you lose literally nothing. You get the exact same Comfy you already have. Here's some things you get on top:
- **Integrated workflow browser:** Have a bunch of cool workflows? Save/load/browser is a super convenient integrated interface.
- **Sharing/Teamwork:** working as a team? The ability to share a common instance with a common workflow browser list is invaluable to keeping everyone on track together.
- **Easy Install:** no nonsense for the install, just download and run, it sets itself up. (If you want to customize you can just disable the autoinstaller features and do things manually.) Swarm can even autoinstall nodes, pip dependencies, etc. if you let it.
- **Grid Generator:** One of the best features of Swarm, just configure and save workflows you're happy with and pop over to the Generate tab to generate grids comparing different workflows or parameters within the workflows.
- **Workflow AutoGenerator:**
    - **Convenience:** don't want to fight the noodles *all* the time? The Generate tab is much easier and friendly to quickly change things around. Do you hate how SDv1 uses 512 and SDXL uses 1024 and you have to fiddle the emptylatent node whenever you change them? Me too, that's why the generate tab autodetects preferred resolution for a model and updates (you can of course set resolution to `Custom` and define it manually). It gives you recommended aspect ratios that fit the model too (don't memorize `1344x768`, just click it in a dropdown list labeled as the human-understandable `16:9`). Why add and configure five differents nodes to do a hires fix when you can just check 'refiner' and drag a slider for your preferred upscale value.
    - **Education:** newer to Comfy? the workflow autogenerator with it's super easy and learnable interface is perfect to set things up in, and then you can click the Comfy tab and click "Import from Generate Tab" to see how your generation works on the inside. This is perfect to learn how Comfy components work and slot together.
- **Simple Tab:**
    - **For you:** Have your workflow perfected? Add some `SwarmInput<..>` nodes for your primary inputs, save it, and checkmark `Enable In Simple Tab` - then click the Simple tab and use a simplified interface for your workflow. Focus on what matters without jumping back and forth across the canvas.
    - **For your friends:** Want to share your workflow with a friend that's afraid of noodles? Save it to the simple tab, then provide your friend with a direct link to your simple tab page. They can use the friendly interface without having to see what horrifying cthulu monster you made to power it.
- **Easy control:** Want to change the models path? Toggle some other setting? No more digging through files to edit configs - Swarm's configuration is entirely done in a friendly UI! Every setting even has a clickable `?` button to show documentation explaining what it does. (You can edit config files if you really prefer though still). Even pulling updates is just a UI button under the 'Server' tab!
- **More immediate control:** Why does Comfy have preview method as a command line arg, and not in a node? I don't know. With Swarm you have the option to control it on the fly dynamically, either on the generate tab or with the `SwarmKSampler` node that has extra power-user options.
- **Image history, model browser, etc:** the generate tab has friendly browsers and organizers for all your important fifty-terabyte-file-dumps. Why remember what your model is named and how it works, when you browse a view with thumbnails, descriptions, usage hints, etc?
- **Wildcards:** Tons of tack on features like savable wildcards you can use in your prompts when on the Generate tab. All integrated and clean. No need to figure out the correct custom node to use for every random little thing, Swarm integrates many common features clearly out of the box.
- **Var Seed and other special features:** Did you use auto webui in the past and now you wonder why Comfy doesn't have it? Wonder no longer, Swarm adds comfy features for all the user favorite features found on other UIs and missing from Comfy. All easy to use and available by default.
- **Fancy prompt syntax:** You bet that 'favorite features from other UIs' includes the ability to do timestep prompt alternating/fromto and all those funky things that are really hard to do in comfy normally! Just type a `<` in the generate tab prompt box to see what fancy prompt syntax is available. And don't forget, you can always just import to the Comfy tab to see how it works on the inside and connect it elsewhere.
- **Smarter model generations:** Did you know that SVD prefers a Sigma Max of 1000 (non-default)? Did you know that SDXL generates better if you slightly boost the Positive Prompt rescond, and slightly lower the Negative Prompt rescond? You don't need to know this, Swarm knows it and will generate by default with model-specific-enhancements (you can of course turn this off).
- **API:** Want a powerful developer API? Swarm's got your back, it has a very very clear HTTP API and websocket API. Where comfy might want you to just through a few hoops to use as API, Swarm's API is handcrafted to be super convenient - and just to be sure it's perfect, Swarm uses its own API at all times (so just check network traffic in your browser for live examples), and has full documentation [(here)](/docs/API.md)
- **Multi-GPU:** Oh, yeah, did I mention the reason it's named "Swarm"?! You can connect multiple GPUs, multiple machines, even remote machines over network! Generations will be automatically queued between them, and you can even split a single custom comfy workflow across multiple backend GPUs if you want! (*With some limitations, see [Using More GPUs](/docs/Using%20More%20GPUs.md) for specifics)
- **assorted other features:** Want to convert your old `.ckpt` files to `.safetensors`? Want to extract a LoRA from your fat checkpoint models? Want to check how the CLIP tokenization of your prompt works out? Swarm has a bunch of tack-on handy dandy utilities like those.
- **And more!** Frankly at this point this section is getting too long and I'm probably forgetting things anyway. Just give Swarm a try, you have nothing to lose, and I'm pretty sure once you see it in action, you'll stick with it forever!

### I am an Auto WebUI, Forge, or other local SD UI user

- Swarm is a very powerful AI media generation UI, it covers just about everything the others do, and likely has an interface that's not too dissimilar to your personal favorite.
- Swarm has a lot of power features that other UIs don't. From the infinite-dimensional grid generator, to the ability to customize internal workflows, to Text2Image2Video chain generation, to the properly featured image editor, ...
- Swarm's engine is a very strong well-written C# backing. Whereas most other UIs are slapped together with simple python scripts and gradio, Swarm takes pride in doing things cleanly, efficiently, and properly.
    - We have users with tens of thousands of models, and Swarm's model browser sorts and renders this cleanly and near-instantly. Swarm's image history lets you scroll throusands of images or videos fluidly. It took real work to make the experience so smooth, quick simple scripts just can't keep up.
- Swarm has a lot of UI intelligent behavior. You have a model that uses 1024x1024, and you swap to one that targets 640x640? Swarm knows this and updates parameters accordingly. There are tons of little features like this to max the experience as best it can be.
- Swarm is backed by the ComfyUI Core Backend, which is the modern best in AI media generation. It uses the most of your system resources, and adapts automatically to what you have available. Meaning for example that Swarm can run AI models larger than your GPU can fit, and near-full speeds. And you don't even need to configure anything to get this, it works out of the box.
- This is just a short-list. There's so much more to it. Swarm is free, open souce, and self-contained to its own folder - so just give it a try, you have nothing to lose, and I'm pretty sure once you see it in action, you'll stick with it forever!

### I use online AI generation services

So you're using one of those big well-known name brand AI image/video/whatever generation sites. Cool! I won't lie, they're pretty powerful. It varies as the tech advances, but often the best AI model is locked behind an online service, not one you can run at home. So why use local free AI options like Swarm?
- Well, first, it's free! As long as you have a decently capable computer.
- When you generate locally, you control every parameter. A very common activity when generating locally is to lock everything, even the random seed, and tweak the tiniest bit piece by piece under a generation goes perfectly. Different webservices give you different degrees of control, but none give you *everything*. Local really does give you everything *(don't worry, things still default to convenient easy options, you only have to worry about the fine grained parameters if you really want to)*.
- Do you want to generate pictures based on yourself, your friends, your family, etc? It's hard to trust the privacy policies of big tech companies. Swarm runs entirely only your own computer, it doesn't upload anything to anyone. So if privacy is a major concern, running locally is an obligation.
    - Do you work at a company or otherwise on content under an NDA? Private home usage might even be *legally obligated* in that case.
- Do you want to generate something... not conventionally permitted in public? Maybe you want something NSFW, maybe you want to want to generate in a copyrighted style or using characters from a copyrighted brand that has lots of lawyers. These types of generations often end up having to be forbidden and blocked on the major online services. But if you're running at home? No problem! I have no way to know what you're generating and no reason to care, you may your own choices.
    - You are responsible for your own creations. If you make something problematic and post it online, all the trouble is on your head alone.
- Do you want to generate something... perfectly fine and normal? Chances are, that's forbidden by online services too. Not because they intend to, but just because they're using AI to automate blocking, and AI is nowhere near perfect yet. One of the most common reasons people switch from online to local, is webservices telling them "no" to very simple inoffensive requests - I've heard stories ranging from ChatGPT saying that a picture of a kid in a rocket ship was too dangerous because they could get hurt, to a muslim being told they're not allowed to create images of their own culture because it's too offensive.
- Do you want to generate something... less commonly known or hard to get right? Maybe a favorite character from a niche show, maybe a musical instrument but your favorite online generator keeps messing the strings up, or a thousand other things. AI is not magic, it's not perfect, it makes mistakes. With an online generator, often if it messes up, then it just can't do it. With local generation, you have options! You can pick from thousands of other models to find one that's right, or you can train your own. Swarm doesn't include its own model trainer yet, but other model training UIs such as OneTrainer are easy to use and output files compatible with Swarm.
- Do you want to generate something... just like what you've generated a year ago? Often, major web services will shut down, or update to a new model, or increase prices, or etc. Whatever they do, you just gotta deal with it. Running at home, whatever you ran a year ago, you can definitely still do today, or 10 years from now.

### I am running a large professional AI service

(TODO) basically Swarm has a great API and very reliable systems, plus ability to dynamically adjust to multiple backends or clusters, which is perfect for large scale usage.

### I am new to AI Image Gen

(TODO) basically Swarm is super duper beginner friendly, you can install and get going with zero confusion or install troubles, also Swarm is designed to make it easy to learn more advanced features at your own pace, by way of good in-UI docs and the ability to convert from the basic interface to the advanced comfy graph

### I'm Lost, Where Am I? What's AI?

You should use Swarm cause it's really cool. AI is really cool, and Swarm is a great way to try it out!

<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>
