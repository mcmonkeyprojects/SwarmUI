using System.Net.WebSockets;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;

namespace SwarmUI.WebAPI;

[API.APIClass("API routes for LLM Text Generation and directly related features.")]
public abstract class LLMAPI
{
    public static void Register()
    {
        API.RegisterAPICall(GenerateLLMText, true, Permissions.BasicTextGeneration);
        API.RegisterAPICall(GenerateLLMTextWS, true, Permissions.BasicTextGeneration);
    }

    [API.APIDescription("Generate text from an LLM.",
        """
            "result": "Wow an LLM wrote this wee"
        """)]
    public static async Task<JObject> GenerateLLMText(Session session,
        [API.APIParameter("TODO")] JObject rawInput)
    {
        throw new NotImplementedException();
    }

    [API.APIDescription("Generate text from an LLM.",
        """
            // A direct response
            "result": "Wow an LLM wrote this wee"
            // Chunks at a time (direct concat the text from each chunk)
            "chunk": "Wow"
        """)]
    public static async Task<JObject> GenerateLLMTextWS(WebSocket socket, Session session,
        [API.APIParameter("TODO")] JObject rawInput)
    {
        throw new NotImplementedException();
    }
}
