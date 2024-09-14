# Webhooks

SwarmUI can automatically trigger Webhooks in a few different conditions.

Webhooks are a simple common standard way for unrelated processes to trigger interactions with each other, useful for user customization and automation. They work through automatically sending HTTP POST requests with simple JSON content bodies to user-defined URLs, corresponding to some webserver which listens for matching requests and performs an action when received.

Some examples of common webhook handlers are: Discord-Integration webhooks (and other message platforms eg Slack), CI server webhooks, IFTTT (if-this-then-that) automation platforms, ...

### Configuration

Swarm webhooks are configured under the tab `Server` -> `Server Configuration` (considered to be administrative / server management, not for regular users) -> `Webhooks` section.

Webhook configuration comes in two parts: the URL, and the JSON data. For the URL, simply copy in whatever server URL you received externally. For the JSON data, you can either leave it blank (and it will send an empty JSON, ie `{}`), or fill it in with JSON data (eg `{ "somekey": "someval", ... }`).

### Image Metadata In The JSON

For some webhooks, eg the `Every Gen` Webhook, you can include image metadata in the JSON body. This uses `%tag%` syntax, and mostly follows the same rules as the `Output Path` setting for what you can fill in (refer to [User Settings - Path Format](/docs/User%20Settings.md#path-format)). For example, `%prompt%` can be used to fill the prompt. Unlike `Output Path`, this text won't be trimmed or formatted, other than escaped to fit within a JSON string.

You may also use `%image%` to include the URL to an image. Be warned if `DoNotSave` is used this URL maybe a very large Base64 blob. This will use the `External URL` setting under `Server Configuration` to format the URL. Note that unless your server is externally accessible, this URL cannot be opened by anyone but you. This means for example you cannot embed the image onto a Discord message via the webhook, because Discord's servers cannot read the URL.

For example, if you wanted to send a message on Discord after every generation, you would set the Every Gen Webhook URL to `https://discord.com/api/webhooks/(whatever your generated url is here)`, and set the JSON data to something like:
```json
{
  "username": "SwarmUI",
  "content": "Generated your image! Prompt was `%prompt%`, link is [here!](%image%)"
}
```

## Available Hooks

### Queue Start Webhook

This webhook is fired whenever the server was idle, and now is starting to queue new jobs. This webhook, if configured, will block generation until the webhook's HTTP request is completed.

This is useful, for example, to trigger another process to unload separate memory usage before Swarm begins generating. Simply block the HTTP request until memory usage is cleared, then proceed. Be sure that the external memory usage cannot resume until the Queue End webhook is sent.

### Queue End Webhook

This webhook is fired whenever the server was generating images, and has emptied its queue, and thus is now idle. This webhook, if configured, will block and force the server to remain in an idle state until the webhook's HTTP request is completed.

This is useful, for example, to signal to another process that it is now clear to use server memory again.

### Every Gen Webhook

This webhook is fired after each and every image generation. This is non-blocking async, ie the server process will not wait for any result processing on the remote server.

Users may suppress this webhook by setting the `Swarm Internal` advanced parameter `Webhooks` to `None`. All other options of this parameter will include the this webhook.

### Manual Gen Webhook

This webhook is fired when manually requested by a user, via the `Swarm Internal` advanced parameter `Webhooks`. Users may set this to `Manual` to fire this webook for every gen, or to `Manual At End` to fire this webhook at the end of a batch of generations.

Note that `Manual At End` does not include any `%image%` value, but does still include the core parameter set the batch was generated with. Values that are dynamically added to metadata later in generation will also be missing from the available JSON settings for this webhook.
