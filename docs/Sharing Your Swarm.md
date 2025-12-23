# Sharing Your SwarmUI Instance

SwarmUI is designed to be sharable - that is, you can give other people access to your AI Generation capabilities!

There's two "groups of people" you might want to share to:
- **1: Friends and Family.** These are people you trust, who you want to be able to play with your fun ai toys too.
- **2: The Public.** These are anyone else - maybe it's an open server, maybe it's for a Discord community, maybe it's friends that you just don't trust as much.

Currently, SwarmUI is only validated to be safely usable by **Friends and Family**. Giving access to **The Public** is not recommended unless you do your own security validations first. See also the [Public Call For Security Researchers announced here](https://github.com/mcmonkeyprojects/SwarmUI/discussions/679).

## General Notes

- You can white/black list model folders, to limit what users see. You can do give different limits to different roles, and different roles to different users.
- Every user has a different image output folder, different presets list, different user settings list, etc.
- There are preconfigured base roles that set things up appropriately for the most common use cases. You can also make your own roles if you want.
- You (the owner or any admin) can freely add or delete users at any time, or modify their settings, or even 'break into' their accounts and access their data.
- Default user accounts have a lot fewer tabs, and notably can't play with custom comfy workflows. This is because it is difficult to perform security validation on the comfy backend.
    - Use the 'poweruser' role for trusted friends who need access to the raw comfy workflows.
- Your default account is named `local`, so named on the idea of it being the user directly accessing the instance on the same local machine

## Things Not Yet Available But Planned

- Two-Factor Authentication
- Easy account-quick-swapper for admins
- Account registration
- automatic/forced "you must change your password" popup
- Simple tab stable access for non-power-users
- Preset serverwide sharing
- User-local model organization/notes for non-admin users
- User-local wildcards
- Many convenience features for remote users, eg a way to download history as a batch zip
- Convenient user auth session management and bot token interface

## Basic Setup Guide

- First, go to `Server` -> `Users`
    - Select the User named `local` (this is the default user any time you login locally)
    - Click `Change User Password` and set it to a password you will remember, and save
    - Under `Roles`, click `User`
    - Adjust any permissions or settings here for regular users.
        - Note for example the Model White/Black List settings - you might want to for example blacklist some model folders that you don't want to share
        - Be careful with granting permissions - many of the ones disabled by default are disabled for a reason. For example, comfy permissions can lead to security risks.
    - Save the role when you're done.
    - Repeat to edit any other roles you want to configure.
- Then, go to the `Server` -> `Server Configuration` tab
    - Find the `User Authorization` grouping
    - Enable `AuthorizationRequired`
    - Optionally disable `AllowLocalhostBypass` if you're happy logging in to your own instance with an account
    - Set your `InstanceTitle` to a short simple name for your instance (if your name is `Bob`, maybe your instance is `Bob's Swarm`)
    - Set your `LoginNotice` to any message to display on the login page (maybe `Bob's Swarm, for Bob's friends only! Contact @bob on Discord if you forget your login`)
    - Scroll through the server settings list and consider if there's anything else you want to set up while you're at it
    - Save the settings
- If you disabled `AllowLocalhostBypass`, you can now login to the `local` account
    - If you're stuck (can't log in), close SwarmUI, edit the file `Data/Settings.fds` in a text editor, and turn `AuthorizationRequired` back to `false`, then relaunch Swarm
- Now, figure out your network address
    - See [Advanced Usage: Accessing SwarmUI From Other Devices](/docs/Advanced%20Usage.md#accessing-swarmui-from-other-devices)
        - If you're sharing with family in the same home, the LAN address will do
        - Hosting on the open web info is on the doc as well, but be aware that this is not currently recommended.
    - Whatever your external accessible URL is, note it down - you'll need to give that address to the others you're sharing with
- Go to `Server` -> `Users` again
    - Click `Add User`
        - Set a username as simple plaintext for a user that you want. Keep it simple - no spaces/symbols/etc., and all lowercase
        - Set an initial password for the user. Consider using a [random text generator](https://www.random.org/strings/?num=10&len=20&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new) to generate a placeholder password. Make sure to keep a copy of the password for the moment.
        - Select the Role you want.
            - If it's a new account for yourself, use `Owner`
            - If it's someone you want to have server controls, use `Admin`
            - If it's someone you trust to play with eg the Comfy tab and more, use `PowerUser`
            - If it's somebody you don't trust as much or just doesn't need too much access, use `User`
        - Hit `Add`
        - Optionally, go to `User` and logout, then login as the account you created, and check things over to make sure it all makes sense.
            - If it's a new user, maybe configure user settings or presets or etc. in a way you think might be helpful to them.
        - Message the user - tell them the username and password you gave them, and give them the link to the server
            - Remind them to change their password immediately after logging in
            - If they've never used Swarm before, give them some tips for how to get started! Show them your favorite models and prompting techniques.
            - Or, have your friend watch while you operate the UI and do some generations, so they can see how you do it and ask questions.

## Using Shared Swarms As A Backend

You can hook up someone else's shared SwarmUI instance as a backend in your own Swarm!

(TODO: Explain how to. Need easy way to gen and apply account auth stuff.)

<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>
