# Webhooks

SwarmUI can automatically trigger Webhooks in a few different conditions.

Webhooks are a simple common standard way for unrelated processes to trigger interactions with each other, useful for user customization and automation. They work through automatically sending HTTP POST requests with simple JSON content bodies to user-defined URLs, corresponding to some webserver which listens for matching requests and performs an action when received.

Some examples of common webhook handlers are: Discord-Integration webhooks (and other message platforms eg Slack), CI server webhooks, IFTTT (if-this-then-that) automation platforms, ...

### Configuration

Swarm webhooks are configured under the tab `Server` -> `Server Configuration` (considered to be administrative / server management, not for regular users) -> `Webhooks` section.

Webhook configuration comes in two parts: the URL, and the JSON data. For the URL, simply copy in whatever server URL you received externally. For the JSON data, you can either leave it blank (and it will send an empty JSON, ie `{}`), or fill it in with JSON data (eg `{ "somekey": "someval", ... }`).

## Available Hooks

### Queue Start Webhook

This webhook is fired whenever the server was idle, and now is starting to queue new jobs. This webhook, if configured, will block generation until the webhook's HTTP request is completed.

This is useful, for example, to trigger another process to unload separate memory usage before Swarm begins generating. Simply block the HTTP request until memory usage is cleared, then proceed. Be sure that the external memory usage cannot resume until the Queue End webhook is sent.

### Queue End Webhook

This webhook is fired whenever the server was generating images, and has emptied its queue, and thus is now idle. This webhook, if configured, will block and force the server to remain in an idle state until the webhook's HTTP request is completed.

This is useful, for example, to signal to another process that it is now clear to use server memory again.
