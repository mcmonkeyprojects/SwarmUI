using Newtonsoft.Json.Linq;
using SwarmUI.LLMs;

namespace SwarmUI.Backends;

/// <summary>Represents a basic abstracted LLM backend provider.</summary>
public abstract class AbstractLLMBackend : AbstractBackend
{
    /// <summary>Generate an LLM response.</summary>
    public abstract Task<string> Generate(LLMParamInput user_input);

    /// <summary>Runs a generation with live feedback (eg text chunks as they come).</summary>
    /// <param name="user_input">The user input data to generate.</param>
    /// <param name="batchId">Local batch-ID for this generation.</param>
    /// <param name="takeOutput">Takes an output object: contains chunks or other data.</param>
    public virtual async Task GenerateLive(LLMParamInput user_input, string batchId, Action<JObject> takeOutput)
    {
        string result = await Generate(user_input);
        takeOutput(new() { ["result"] = result });
    }
}
