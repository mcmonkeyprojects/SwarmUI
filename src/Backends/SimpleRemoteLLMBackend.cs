using FreneticUtilities.FreneticDataSyntax;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.LLMs;
using System.Net.Http;
using System.Text;
using System.IO;

namespace SwarmUI.Backends;

public class SimpleRemoteLLMBackend : AbstractLLMBackend
{
    public class SimpleRemoteLLMBackendSettings : AutoConfiguration
    {
        [ConfigComment("The network address of the OpenAI API compatible LLM provider.\nUsually starts with 'https://'.")]
        public string Address = "";

        [ConfigComment("Whether the backend is allowed to revert to an 'idle' state if the API address is unresponsive.\nAn idle state is not considered an error, but cannot generate.\nIt will automatically return to 'running' if the API becomes available.")]
        public bool AllowIdle = false;

        [ConfigComment("If the remote instance has an 'Authorization:' header required, specify it here.\nFor example, 'Bearer abc123'.\nIf you don't know what this is, you don't need it.")]
        [ValueIsSecret]
        public string AuthorizationHeader = "";

        [ConfigComment("Any other headers here, newline separated, for example:\nMyHeader: MyVal\nSecondHeader: secondVal")]
        public string OtherHeaders = "";

        [ConfigComment("When attempting to connect to the backend, this is the maximum time Swarm will wait before considering the connection to be failed.\nNote that depending on other configurations, it may fail faster than this.\nFor local network machines, set this to a low value (eg 5) to avoid 'Loading...' delays.")]
        public int ConnectionAttemptTimeoutSeconds = 30;
    }

    /// <summary>The settings for this backend.</summary>
    public SimpleRemoteLLMBackendSettings Settings => SettingsRaw as SimpleRemoteLLMBackendSettings;

    /// <inheritdoc/>
    public override async Task Init()
    {
        // TODO: Connect
    }

    /// <inheritdoc/>
    public override async Task Shutdown()
    {
        // TODO: Disconnect
    }

    /// <inheritdoc/>
    public override async Task<string> Generate(LLMParamInput user_input)
    {
        StringBuilder output = new();
        await GenerateLive(user_input, "0", j =>
        {
            if (j.TryGetValue("chunk", out JToken chunk))
            {
                output.Append($"{chunk}");
            }
        });
        return output.ToString();
    }

    /// <inheritdoc/>
    public override async Task GenerateLive(LLMParamInput user_input, string batchId, Action<JObject> takeOutput)
    {
        Logs.Info($"[SimpleRemoteLLMBackend] Generating for model: {user_input.Model ?? "(default)"}");
        Logs.Info($"[SimpleRemoteLLMBackend] Backend address: {Settings.Address}");
        Logs.Info($"[SimpleRemoteLLMBackend] User message: {user_input.UserMessage.Substring(0, Math.Min(100, user_input.UserMessage.Length))}...");

        try
        {
            if (string.IsNullOrWhiteSpace(Settings.Address))
            {
                throw new Exception("Backend address not configured. Please set the LM Studio address in backend settings.");
            }

            // Prepare the OpenAI-compatible request with full conversation history
            JObject request = new()
            {
                ["model"] = user_input.Model ?? "default",
                ["messages"] = user_input.BuildMessagesForAPI(),
                ["stream"] = true  // Request streaming
            };

            // Add optional parameters if specified
            if (user_input.MaxTokens.HasValue)
            {
                request["max_tokens"] = user_input.MaxTokens.Value;
                Logs.Debug($"[SimpleRemoteLLMBackend] Max tokens: {user_input.MaxTokens}");
            }

            if (user_input.Temperature.HasValue)
            {
                request["temperature"] = user_input.Temperature.Value;
                Logs.Debug($"[SimpleRemoteLLMBackend] Temperature: {user_input.Temperature}");
            }

            string requestJson = request.ToString();
            Logs.Info($"[SimpleRemoteLLMBackend] ========== REQUEST DETAILS ==========");
            Logs.Info($"[SimpleRemoteLLMBackend] Full request JSON:");
            Logs.Info(requestJson);
            Logs.Info($"[SimpleRemoteLLMBackend] Request size: {requestJson.Length} bytes");
            Logs.Info($"[SimpleRemoteLLMBackend] Request keys: {string.Join(", ", request.Keys)}");
            Logs.Info($"[SimpleRemoteLLMBackend] ====================================");

            // Build the URL
            string url = Settings.Address.TrimEnd('/') + "/v1/chat/completions";
            Logs.Info($"[SimpleRemoteLLMBackend] Target URL: {url}");
            Logs.Info($"[SimpleRemoteLLMBackend] Backend address: {Settings.Address}");
            Logs.Info($"[SimpleRemoteLLMBackend] Backend status: {Status}");

            using HttpClient client = new();
            client.Timeout = TimeSpan.FromMinutes(5);

            // Add headers
            if (!string.IsNullOrWhiteSpace(Settings.AuthorizationHeader))
            {
                client.DefaultRequestHeaders.Add("Authorization", Settings.AuthorizationHeader);
                Logs.Debug("[SimpleRemoteLLMBackend] Added authorization header");
            }

            // Parse other headers
            if (!string.IsNullOrWhiteSpace(Settings.OtherHeaders))
            {
                foreach (string line in Settings.OtherHeaders.Split('\n'))
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    int colonIdx = line.IndexOf(':');
                    if (colonIdx <= 0) continue;
                    string headerName = line.Substring(0, colonIdx).Trim();
                    string headerValue = line.Substring(colonIdx + 1).Trim();
                    client.DefaultRequestHeaders.Add(headerName, headerValue);
                    Logs.Debug($"[SimpleRemoteLLMBackend] Added header: {headerName}");
                }
            }

            // Send request
            StringContent content = new(request.ToString(), Encoding.UTF8, "application/json");
            Logs.Info("[SimpleRemoteLLMBackend] Sending POST request...");
            HttpResponseMessage response = await client.PostAsync(url, content);

            Logs.Info($"[SimpleRemoteLLMBackend] Response status: {response.StatusCode}");

            if (!response.IsSuccessStatusCode)
            {
                string errorContent = await response.Content.ReadAsStringAsync();
                Logs.Error($"[SimpleRemoteLLMBackend] Error response: {errorContent}");
                throw new Exception($"Backend returned status {response.StatusCode}: {errorContent}");
            }

            // Read streaming response
            using Stream stream = await response.Content.ReadAsStreamAsync();
            using StreamReader reader = new(stream);
            StringBuilder fullResponse = new();
            string line;

            Logs.Info("[SimpleRemoteLLMBackend] Reading streamed response...");

            while ((line = await reader.ReadLineAsync()) != null)
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                if (line.StartsWith("data: "))
                {
                    string data = line.Substring("data: ".Length);

                    if (data == "[DONE]")
                    {
                        Logs.Info("[SimpleRemoteLLMBackend] Stream completed");
                        break;
                    }

                    try
                    {
                        JObject chunk = JObject.Parse(data);
                        if (chunk.TryGetValue("choices", out JToken choicesToken) && choicesToken is JArray choices && choices.Count > 0)
                        {
                            JObject choice = (JObject)choices[0];
                            if (choice.TryGetValue("delta", out JToken deltaToken) && deltaToken is JObject delta)
                            {
                                if (delta.TryGetValue("content", out JToken contentToken) && contentToken.ToString() is string content_text)
                                {
                                    if (!string.IsNullOrEmpty(content_text))
                                    {
                                        fullResponse.Append(content_text);
                                        Logs.Debug($"[SimpleRemoteLLMBackend] Chunk: {content_text}");
                                        takeOutput(new JObject() { ["chunk"] = content_text });
                                    }
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Logs.Warn($"[SimpleRemoteLLMBackend] Error parsing chunk: {ex.Message}. Line: {data}");
                    }
                }
            }

            // Send final result
            string finalResponse = fullResponse.ToString();
            Logs.Info($"[SimpleRemoteLLMBackend] Final response length: {finalResponse.Length}");
            takeOutput(new JObject() { ["result"] = finalResponse });
        }
        catch (HttpRequestException ex)
        {
            Logs.Error($"[SimpleRemoteLLMBackend] Connection error: {ex.Message}");
            throw new Exception($"Cannot connect to LM Studio at {Settings.Address}. Make sure it's running and the address is correct.", ex);
        }
        catch (Exception ex)
        {
            Logs.Error($"[SimpleRemoteLLMBackend] Error: {ex.ReadableString()}");
            throw;
        }
    }

    /// <inheritdoc/>
    public override IEnumerable<string> SupportedFeatures => ["llm", "remote_llm"];

    /// <inheritdoc/>
    public override async Task<bool> FreeMemory(bool systemRam)
    {
        return false;
    }
}
