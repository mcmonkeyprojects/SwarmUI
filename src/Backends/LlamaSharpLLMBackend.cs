using FreneticUtilities.FreneticDataSyntax;
using LLama;
using LLama.Common;
using Newtonsoft.Json.Linq;
using SwarmUI.LLMs;

namespace SwarmUI.Backends;

/// <summary>An LLM Backend powered by local LlamaSharp (Llama.Cpp).</summary>
public class LlamaSharpLLMBackend : AbstractLLMBackend
{
    public class LlamaSharpLLMBackendSettings : AutoConfiguration
    {
        [ConfigComment("(PLACEHOLDER, BAD USER CONTROL APPROACH)\nHow many LLM layers to load to the GPU.")]
        public int GPULoadLayers = 0;

        [ConfigComment("If enabled, the LLM is only loaded while generation requests are going, and unloaded immediately when empty.\nIf false, the model stays loaded in the background even when not in use.")]
        public bool AlwaysFreeMemory = false;
    }

    public LLamaWeights LoadedModel = null;

    public LLamaContext LoadedContext = null;

    public InteractiveExecutor LoadedExecutor = null;

    public string LoadedModelName = null;

    /// <summary>The settings for this backend.</summary>
    public LlamaSharpLLMBackendSettings Settings => SettingsRaw as LlamaSharpLLMBackendSettings;

    /// <inheritdoc/>
    public override async Task Init()
    {
        // Nothing to do until a request comes, we're operating directly in local C#!
    }

    /// <inheritdoc/>
    public override async Task Shutdown()
    {
        Unload();
    }

    public void Unload()
    {
        LoadedExecutor = null;
        LoadedContext?.Dispose();
        LoadedContext = null;
        LoadedModel?.Dispose();
        LoadedModel = null;
        LoadedModelName = null;
    }

    public async Task Load(LLMParamInput user_input)
    {
        if (LoadedModel is not null && LoadedModelName == user_input.Model)
        {
            return;
        }
        if (LoadedModel is not null)
        {
            Unload();
        }
        ModelParams mParam = new(user_input.Model)
        {
            ContextSize = 4096, // TODO: Configurable
            GpuLayerCount = Settings.GPULoadLayers // TODO: Per-model
            // TODO: other config?
        };
        LoadedModel = await LLamaWeights.LoadFromFileAsync(mParam);
        LoadedContext = LoadedModel.CreateContext(mParam);
        LoadedExecutor = new(LoadedContext);
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
        await Load(user_input);
        ChatSession session = await ChatSession.InitializeSessionFromHistoryAsync(LoadedExecutor, user_input.ChatHistory);
        await foreach (string chunk in session.ChatAsync(new ChatHistory.Message(AuthorRole.User, user_input.UserMessage)))
        {
            takeOutput(new() { ["chunk"] = chunk });
        }
        if (Settings.AlwaysFreeMemory)
        {
            Unload();
        }
    }

    /// <inheritdoc/>
    public override IEnumerable<string> SupportedFeatures => ["llm", "local_llm"];

    /// <inheritdoc/>
    public override async Task<bool> FreeMemory(bool systemRam)
    {
        if (systemRam || Settings.GPULoadLayers > 0)
        {
            Unload();
            return true;
        }
        return false;
    }
}
