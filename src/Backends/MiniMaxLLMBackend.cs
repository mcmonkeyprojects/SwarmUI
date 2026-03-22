using FreneticUtilities.FreneticDataSyntax;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.LLMs;
using SwarmUI.Utils;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;

namespace SwarmUI.Backends;

/// <summary>An LLM Backend powered by MiniMax Cloud API (OpenAI-compatible).</summary>
public class MiniMaxLLMBackend : AbstractLLMBackend
{
    public class MiniMaxLLMBackendSettings : AutoConfiguration
    {
        [ConfigComment("Your MiniMax API key.\nGet one at https://platform.minimaxi.com")]
        [ValueIsSecret]
        public string ApiKey = "";

        [ConfigComment("The MiniMax API base URL.\nDefault is 'https://api.minimax.io/v1'.")]
        public string BaseUrl = "https://api.minimax.io/v1";

        [ConfigComment("The model to use for generation.\nAvailable models: MiniMax-M2.7, MiniMax-M2.5, MiniMax-M2.5-highspeed")]
        public string Model = "MiniMax-M2.7";

        [ConfigComment("Sampling temperature for generation.\nValid range: 0.0 to 1.0. Lower values are more deterministic.")]
        public double Temperature = 0.7;

        [ConfigComment("Maximum number of tokens to generate.\nSet to 0 to use the model's default.")]
        public int MaxTokens = 0;

        [ConfigComment("Whether the backend is allowed to revert to an 'idle' state if the API is unresponsive.\nAn idle state is not an error, but cannot generate.")]
        public bool AllowIdle = false;

        [ConfigComment("Connection timeout in seconds when making API requests.")]
        public int TimeoutSeconds = 120;
    }

    /// <summary>The settings for this backend.</summary>
    public MiniMaxLLMBackendSettings Settings => SettingsRaw as MiniMaxLLMBackendSettings;

    /// <summary>Shared HTTP client for API requests.</summary>
    public HttpClient Client;

    /// <inheritdoc/>
    public override async Task Init()
    {
        if (string.IsNullOrWhiteSpace(Settings.ApiKey))
        {
            throw new InvalidOperationException("MiniMax API key is not configured. Please set your API key in the backend settings.");
        }
        Client = NetworkBackendUtils.MakeHttpClient(Settings.TimeoutSeconds / 60 + 1);
        Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Settings.ApiKey);
        // Validate connection by listing models
        try
        {
            HttpResponseMessage response = await Client.GetAsync($"{Settings.BaseUrl.TrimEnd('/')}/models");
            if (!response.IsSuccessStatusCode)
            {
                string body = await response.Content.ReadAsStringAsync();
                if (Settings.AllowIdle)
                {
                    Status = BackendStatus.IDLE;
                    Logs.Warning($"MiniMax API returned {response.StatusCode} during init, entering idle state: {body}");
                    return;
                }
                throw new InvalidOperationException($"MiniMax API returned {response.StatusCode}: {body}");
            }
            Logs.Info($"MiniMax LLM backend initialized successfully with model {Settings.Model}");
            Status = BackendStatus.RUNNING;
        }
        catch (HttpRequestException ex)
        {
            if (Settings.AllowIdle)
            {
                Status = BackendStatus.IDLE;
                Logs.Warning($"MiniMax API unreachable during init, entering idle state: {ex.Message}");
                return;
            }
            throw;
        }
    }

    /// <inheritdoc/>
    public override async Task Shutdown()
    {
        NetworkBackendUtils.ClearOldHttpClient(Client);
        Client = null;
    }

    /// <summary>Builds the messages array from the LLM input parameters.</summary>
    private JArray BuildMessages(LLMParamInput userInput)
    {
        JArray messages = [];
        if (userInput.ChatHistory is not null)
        {
            foreach (var message in userInput.ChatHistory.Messages)
            {
                string role = message.AuthorRole.ToString().ToLowerInvariant();
                // Map LLamaSharp roles to OpenAI roles
                if (role == "unknown")
                {
                    role = "user";
                }
                messages.Add(new JObject { ["role"] = role, ["content"] = message.Content });
            }
        }
        if (!string.IsNullOrEmpty(userInput.UserMessage))
        {
            messages.Add(new JObject { ["role"] = "user", ["content"] = userInput.UserMessage });
        }
        return messages;
    }

    /// <summary>Builds the request body for a chat completion call.</summary>
    private JObject BuildRequestBody(LLMParamInput userInput, bool stream)
    {
        string model = string.IsNullOrWhiteSpace(userInput.Model) ? Settings.Model : userInput.Model;
        double temperature = Math.Clamp(Settings.Temperature, 0.0, 1.0);
        JObject body = new()
        {
            ["model"] = model,
            ["messages"] = BuildMessages(userInput),
            ["temperature"] = temperature,
            ["stream"] = stream
        };
        if (Settings.MaxTokens > 0)
        {
            body["max_tokens"] = Settings.MaxTokens;
        }
        return body;
    }

    /// <inheritdoc/>
    public override async Task<string> Generate(LLMParamInput userInput)
    {
        if (Client is null)
        {
            throw new InvalidOperationException("MiniMax backend is not initialized.");
        }
        JObject requestBody = BuildRequestBody(userInput, false);
        StringContent content = new(requestBody.ToString(Formatting.None), Encoding.UTF8, "application/json");
        HttpResponseMessage response = await Client.PostAsync($"{Settings.BaseUrl.TrimEnd('/')}/chat/completions", content);
        string responseText = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"MiniMax API error ({response.StatusCode}): {responseText}");
        }
        JObject result = JObject.Parse(responseText);
        string text = result["choices"]?[0]?["message"]?["content"]?.ToString() ?? "";
        // Strip thinking tags if present (MiniMax M2.5+ may include <think>...</think> blocks)
        text = StripThinkingTags(text);
        return text;
    }

    /// <inheritdoc/>
    public override async Task GenerateLive(LLMParamInput userInput, string batchId, Action<JObject> takeOutput)
    {
        if (Client is null)
        {
            throw new InvalidOperationException("MiniMax backend is not initialized.");
        }
        JObject requestBody = BuildRequestBody(userInput, true);
        HttpRequestMessage request = new(HttpMethod.Post, $"{Settings.BaseUrl.TrimEnd('/')}/chat/completions")
        {
            Content = new StringContent(requestBody.ToString(Formatting.None), Encoding.UTF8, "application/json")
        };
        HttpResponseMessage response = await Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        if (!response.IsSuccessStatusCode)
        {
            string errorText = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException($"MiniMax API error ({response.StatusCode}): {errorText}");
        }
        using Stream stream = await response.Content.ReadAsStreamAsync();
        using StreamReader reader = new(stream, Encoding.UTF8);
        StringBuilder fullContent = new();
        while (!reader.EndOfStream)
        {
            string line = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }
            if (!line.StartsWith("data: "))
            {
                continue;
            }
            string data = line["data: ".Length..];
            if (data == "[DONE]")
            {
                break;
            }
            try
            {
                JObject chunk = JObject.Parse(data);
                string delta = chunk["choices"]?[0]?["delta"]?["content"]?.ToString();
                if (!string.IsNullOrEmpty(delta))
                {
                    fullContent.Append(delta);
                    takeOutput(new JObject { ["chunk"] = delta });
                }
            }
            catch (JsonReaderException)
            {
                // Skip malformed SSE chunks
            }
        }
        string fullText = StripThinkingTags(fullContent.ToString());
        // If thinking tags were stripped, re-emit the cleaned result
        if (fullText != fullContent.ToString())
        {
            takeOutput(new JObject { ["result"] = fullText });
        }
    }

    /// <summary>Strips <![CDATA[<think>...</think>]]> blocks from MiniMax model responses.</summary>
    internal static string StripThinkingTags(string text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return text;
        }
        while (true)
        {
            int startIdx = text.IndexOf("<think>", StringComparison.OrdinalIgnoreCase);
            if (startIdx < 0)
            {
                break;
            }
            int endIdx = text.IndexOf("</think>", startIdx, StringComparison.OrdinalIgnoreCase);
            if (endIdx < 0)
            {
                // Incomplete think block, remove from start tag onwards
                text = text[..startIdx];
                break;
            }
            text = text[..startIdx] + text[(endIdx + "</think>".Length)..];
        }
        return text.TrimStart();
    }

    /// <inheritdoc/>
    public override IEnumerable<string> SupportedFeatures => ["llm", "remote_llm"];

    /// <inheritdoc/>
    public override async Task<bool> FreeMemory(bool systemRam)
    {
        return false;
    }
}
