using LLama.Common;

namespace SwarmUI.LLMs;

/// <summary>Inputs for a request to an LLM.</summary>
public class LLMParamInput
{
    // TODO: This is entirely and aggressively a placeholder proof-of-concept and nothing more!

    public ChatHistory ChatHistory;

    public string UserMessage;

    public string Model;
}
