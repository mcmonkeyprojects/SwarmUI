using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Media;
using SwarmUI.Text2Image;
using System.Net.Http;
using System.Text.Json.Serialization;

namespace SwarmUI.Utils;

/// <summary>Central class for processing webhooks.</summary>
public static class WebhookManager
{
    /// <summary>All server settings related to webhooks.</summary>
    public static Settings.WebHooksData HookSettings => Program.ServerSettings.WebHooks;

    /// <summary>If true, the server is believed to currently be generating images. If false, it is idle.</summary>
    public static volatile bool IsServerGenerating = false;

    /// <summary>Web client for the hook manager to use.</summary>
    public static HttpClient Client = NetworkBackendUtils.MakeHttpClient();

    /// <summary>Lock to prevent overlapping updates to <see cref="IsServerGenerating"/> state.</summary>
    public static SemaphoreSlim Lock = new(1, 1);

    /// <summary>The timestamp of when the server initially stopped generating anything.</summary>
    public static long TimeStoppedGenerating = 0;

    /// <summary>Marks the server as currently trying to generate and completes when the state is updated and the webhook is done processing, if relevant.</summary>
    public static async Task WaitUntilCanStartGenerating()
    {
        if (IsServerGenerating)
        {
            return;
        }
        if (string.IsNullOrWhiteSpace(HookSettings.QueueStartWebhook))
        {
            Logs.Verbose("[Webhooks] Marking server as starting generations silently.");
            TimeStoppedGenerating = 0;
            IsServerGenerating = true;
            return;
        }
        await Lock.WaitAsync();
        try
        {
            if (IsServerGenerating)
            {
                return;
            }
            TimeStoppedGenerating = 0;
            Logs.Verbose("[Webhooks] Marking server as starting generations, sending Queue Start webhook.");
            await SendWebhook("Queue Start", HookSettings.QueueStartWebhook, HookSettings.QueueStartWebhookData);
            IsServerGenerating = true;
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to send queue start webhook: {ex.ReadableString()}");
        }
        finally
        {
            Lock.Release();
        }
    }

    /// <summary>Marks the server as currently done generating (ie, idle) and completes when the state is updated and the webhook is done processing, if relevant.</summary>
    public static async Task TryMarkDoneGenerating()
    {
        if (!IsServerGenerating)
        {
            return;
        }
        if (string.IsNullOrWhiteSpace(HookSettings.QueueEndWebhook))
        {
            Logs.Verbose("[Webhooks] Marking server as done generating silently.");
            TimeStoppedGenerating = 0;
            IsServerGenerating = false;
            return;
        }
        await Lock.WaitAsync();
        try
        {
            if (!IsServerGenerating)
            {
                return;
            }
            TimeStoppedGenerating = 0;
            IsServerGenerating = false;
            Logs.Verbose("[Webhooks] Marking server as done generating, sending Queue End webhook.");
            await SendWebhook("Queue End", HookSettings.QueueEndWebhook, HookSettings.QueueEndWebhookData);
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to send queue end webhook: {ex.ReadableString()}");
        }
        finally
        {
            Lock.Release();
        }
    }

    /// <summary>Does an idle tick for the server having no current generations running.</summary>
    public static async Task TickNoGenerations()
    {
        if (!IsServerGenerating)
        {
            return;
        }
        if (TimeStoppedGenerating == 0)
        {
            TimeStoppedGenerating = Environment.TickCount64;
        }
        if (Environment.TickCount64 - TimeStoppedGenerating >= HookSettings.QueueEndDelay * 1000)
        {
            TimeStoppedGenerating = 0;
            await TryMarkDoneGenerating();
        }
    }

    /// <summary>Helper to parse user-custom json data associated with an image gen.</summary>
    public static JObject ParseJsonForHook(string json, T2IParamInput input, string imageData)
    {
        if (!json.Contains('%') || input is null)
        {
            return json.ParseToJson();
        }
        User.OutpathFillHelper fillHelper = new(input, input.SourceSession?.User, "");
        int start = json.IndexOf('%');
        int last = 0;
        StringBuilder output = new();
        while (start != -1)
        {
            int end = json.IndexOf('%', start + 1);
            if (end == -1)
            {
                break;
            }
            string tag = json[(start + 1)..end];
            if (tag.Length > 256 || tag.Contains('\\') || tag.Contains('\n') || tag.Contains('"'))
            {
                output.Append(json[last..(end + 1)]);
                last = end + 1;
                start = json.IndexOf('%', end + 1);
                continue;
            }
            string data;
            if (tag == "image" && imageData is not null)
            {
                data = imageData;
                if (imageData.StartsWith("View/") || imageData.StartsWith("Output/"))
                {
                    imageData = $"/{imageData}";
                }
                if (imageData.StartsWith('/'))
                {
                    data = $"{Program.ServerSettings.Network.GetExternalUrl()}{imageData.Replace(" ", "%20")}";
                }
            }
            else
            {
                data = fillHelper.FillPartUnformatted(tag);
            }
            if (data is not null)
            {
                output.Append(json[last..start]).Append(Utilities.EscapeJsonString(data));
            }
            else
            {
                output.Append(json[last..(end + 1)]);
            }
            last = end + 1;
            start = json.IndexOf('%', end + 1);
        }
        output.Append(json[last..]);
        return output.ToString().ParseToJson();
    }

    /// <summary>Sends the every-gen webhook and manual gen webhook.</summary>
    public static void SendEveryGenWebhook(T2IParamInput input, string imageData, MediaFile rawFile)
    {
        string webhookPreference = input.Get(T2IParamTypes.Webhooks, "Normal");
        if (webhookPreference == "None")
        {
            return;
        }
        SendWebhook("Every Gen", HookSettings.EveryGenWebhook, HookSettings.EveryGenWebhookData, input, imageData, rawFile);
        if (webhookPreference == "Manual")
        {
            SendWebhook("Manual Gen", HookSettings.ManualGenWebhook, HookSettings.ManualGenWebhookData, input, imageData, rawFile);
        }
    }

    /// <summary>Sends the manual-at-end every-gen webhook.</summary>
    public static void SendManualAtEndWebhook(T2IParamInput input)
    {
        string webhookPreference = input.Get(T2IParamTypes.Webhooks, "Normal");
        if (webhookPreference != "Manual At End")
        {
            return;
        }
        SendWebhook("Manual (at end)", HookSettings.ManualGenWebhook, HookSettings.ManualGenWebhookData, input, null);
    }

    /// <summary>Run a generic webhook directly.</summary>
    public static Task SendWebhook(string id, string path, string dataStr, T2IParamInput input = null, string imageData = null, MediaFile rawFile = null)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return Task.CompletedTask;
            }
            HttpContent content;
            if (!string.IsNullOrWhiteSpace(dataStr))
            {
                dataStr = dataStr.Trim();
                bool doDiscordImage = dataStr.StartsWith("[discord_image]");
                if (doDiscordImage)
                {
                    dataStr = dataStr["[discord_image]".Length..];
                }
                JObject data = ParseJsonForHook(dataStr, input, imageData);
                if (doDiscordImage && rawFile is not null)
                {
                    content = Utilities.MultiPartFormContentDiscordFile(rawFile, data);
                }
                else
                {
                    content = Utilities.JSONContent(data);
                }
            }
            else
            {
                content = Utilities.JSONContent([]);
            }
            return Utilities.RunCheckedTask(async () =>
            {
                HttpResponseMessage msg = await Client.PostAsync(path, content);
                string response = await msg.Content.ReadAsStringAsync();
                Logs.Verbose($"[Webhooks] {id} webhook response: {msg.StatusCode}: {response}");
            });
        }
        catch (Exception ex)
        {
            Logs.Error($"Error sending webhook: {ex}");
            return Task.CompletedTask;
        }
    }
}
