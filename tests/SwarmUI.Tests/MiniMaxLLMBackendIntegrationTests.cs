using NUnit.Framework;
using SwarmUI.Backends;
using SwarmUI.LLMs;

namespace SwarmUI.Tests;

/// <summary>Integration tests for MiniMax LLM backend. Requires MINIMAX_API_KEY environment variable.</summary>
[TestFixture]
[Category("Integration")]
public class MiniMaxLLMBackendIntegrationTests
{
    private MiniMaxLLMBackend _backend;
    private string _apiKey;

    [SetUp]
    public void SetUp()
    {
        _apiKey = Environment.GetEnvironmentVariable("MINIMAX_API_KEY") ?? "";
        if (string.IsNullOrEmpty(_apiKey))
        {
            Assert.Ignore("MINIMAX_API_KEY environment variable not set, skipping integration tests.");
        }
        _backend = new MiniMaxLLMBackend();
        _backend.SettingsRaw = new MiniMaxLLMBackend.MiniMaxLLMBackendSettings
        {
            ApiKey = _apiKey,
            BaseUrl = "https://api.minimax.io/v1",
            Model = "MiniMax-M2.5-highspeed",
            Temperature = 0.1,
            MaxTokens = 100
        };
    }

    [TearDown]
    public async Task TearDown()
    {
        if (_backend is not null)
        {
            await _backend.Shutdown();
        }
    }

    [Test]
    public async Task Init_WithValidApiKey_Succeeds()
    {
        await _backend.Init();
        Assert.That(_backend.Status, Is.EqualTo(BackendStatus.RUNNING));
    }

    [Test]
    public async Task Generate_SimplePrompt_ReturnsNonEmptyResponse()
    {
        await _backend.Init();
        var input = new LLMParamInput
        {
            UserMessage = "Reply with exactly: Hello MiniMax",
            Model = "MiniMax-M2.5-highspeed"
        };
        string result = await _backend.Generate(input);
        Assert.That(result, Is.Not.Empty);
        Assert.That(result.ToLowerInvariant(), Does.Contain("hello"));
    }

    [Test]
    public async Task GenerateLive_SimplePrompt_StreamsChunks()
    {
        await _backend.Init();
        var input = new LLMParamInput
        {
            UserMessage = "Count from 1 to 5, separated by commas.",
            Model = "MiniMax-M2.5-highspeed"
        };
        var chunks = new List<string>();
        await _backend.GenerateLive(input, "test-batch", output =>
        {
            if (output.TryGetValue("chunk", out var chunk))
            {
                chunks.Add(chunk.ToString());
            }
        });
        Assert.That(chunks, Has.Count.GreaterThan(0), "Expected at least one streamed chunk");
        string combined = string.Join("", chunks);
        Assert.That(combined, Is.Not.Empty);
    }
}
