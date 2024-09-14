using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using System.Net.Http;

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
            JObject toSend = [];
            if (!string.IsNullOrWhiteSpace(HookSettings.QueueStartWebhookData))
            {
                toSend = HookSettings.QueueStartWebhookData.ParseToJson();
            }
            HttpResponseMessage msg = await Client.PostAsync(HookSettings.QueueStartWebhook, Utilities.JSONContent(toSend));
            string response = await msg.Content.ReadAsStringAsync();
            Logs.Verbose($"[Webhooks] Queue Start webhook response: {msg.StatusCode}: {response}");
            IsServerGenerating = true;
            return;
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
            JObject toSend = [];
            if (!string.IsNullOrWhiteSpace(HookSettings.QueueStartWebhookData))
            {
                toSend = HookSettings.QueueStartWebhookData.ParseToJson();
            }
            HttpResponseMessage msg = await Client.PostAsync(HookSettings.QueueEndWebhook, Utilities.JSONContent(toSend));
            string response = await msg.Content.ReadAsStringAsync();
            Logs.Verbose($"[Webhooks] Queue End webhook response: {msg.StatusCode}: {response}");
            return;
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
        if (!json.Contains('%'))
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
                output.Append(json[last..start]).Append(data);
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

    /// <summary>Sends the every-gen webhook.</summary>
    public static void SendEveryGenWebhook(T2IParamInput input, string imageData)
    {
        if (string.IsNullOrWhiteSpace(HookSettings.EveryGenWebhook))
        {
            return;
        }
        string webhookPreference = input.Get(T2IParamTypes.Webhooks, "Normal");
        if (webhookPreference == "None")
        {
            return;
        }
        JObject data = [];
        if (!string.IsNullOrWhiteSpace(HookSettings.EveryGenWebhookData))
        {
            data = ParseJsonForHook(HookSettings.EveryGenWebhookData, input, imageData);
        }
        Utilities.RunCheckedTask(async () =>
        {
            HttpResponseMessage msg = await Client.PostAsync(HookSettings.EveryGenWebhook, Utilities.JSONContent(data));
            string response = await msg.Content.ReadAsStringAsync();
            Logs.Verbose($"[Webhooks] Every Gen webhook response: {msg.StatusCode}: {response}");
        });
        if (webhookPreference == "Manual" && !string.IsNullOrWhiteSpace(HookSettings.ManualGenWebhook))
        {
            JObject manualData = [];
            if (!string.IsNullOrWhiteSpace(HookSettings.ManualGenWebhookData))
            {
                manualData = ParseJsonForHook(HookSettings.ManualGenWebhookData, input, imageData);
            }
            Utilities.RunCheckedTask(async () =>
            {
                HttpResponseMessage msg = await Client.PostAsync(HookSettings.ManualGenWebhook, Utilities.JSONContent(manualData));
                string response = await msg.Content.ReadAsStringAsync();
                Logs.Verbose($"[Webhooks] Manual Gen webhook response: {msg.StatusCode}: {response}");
            });
        }
    }

    /// <summary>Sends the every-gen webhook.</summary>
    public static void SendManualAtEndWebhook(T2IParamInput input)
    {
        if (string.IsNullOrWhiteSpace(HookSettings.ManualGenWebhook))
        {
            return;
        }
        string webhookPreference = input.Get(T2IParamTypes.Webhooks, "Normal");
        if (webhookPreference != "Manual At End")
        {
            return;
        }
        JObject data = [];
        if (!string.IsNullOrWhiteSpace(HookSettings.ManualGenWebhookData))
        {
            data = ParseJsonForHook(HookSettings.ManualGenWebhookData, input, null);
        }
        Utilities.RunCheckedTask(async () =>
        {
            HttpResponseMessage msg = await Client.PostAsync(HookSettings.ManualGenWebhook, Utilities.JSONContent(data));
            string response = await msg.Content.ReadAsStringAsync();
            Logs.Verbose($"[Webhooks] Manual (at end) Gen webhook response: {msg.StatusCode}: {response}");
        });
    }
}
