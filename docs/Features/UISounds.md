# UI Sounds in SwarmUI

If you want to to have the UI play sounds in specific situations, you just need to add a sound file and select it for the relevant context.

### Add a sound file

- Pick any `.wav`, `.mp3`, `.ogg`, ... sound file.
    - Here's an online collection of ding sounds if you want https://bigsoundbank.com/search?q=notification
- Store the file in `SwarmUI/Data/Audio`
- Refresh your Swarm page or restart Swarm (file listing does not currently auto-update, TBD)
- Go to `User` -> `User Settings`
- Find the `Audio` category, pick your saved file for whichever sound event you want
    - `Completion Sound` plays when all current queued generations complete
    - Optionally set the volume too
    - hit Save
- Go trigger the event to see it (eg generate things to hear the completion sound)
- You can change the audio event back to the blank entry at the top of the dropdown list to disable sound playback
