using NUnit.Framework;
using SwarmUI.Backends;

namespace SwarmUI.Tests;

/// <summary>Unit tests for the MiniMax LLM backend.</summary>
[TestFixture]
public class MiniMaxLLMBackendTests
{
    [Test]
    public void StripThinkingTags_NoTags_ReturnsUnchanged()
    {
        string input = "Hello, world!";
        string result = MiniMaxLLMBackend.StripThinkingTags(input);
        Assert.That(result, Is.EqualTo("Hello, world!"));
    }

    [Test]
    public void StripThinkingTags_WithThinkBlock_StripsIt()
    {
        string input = "<think>internal reasoning here</think>The actual answer is 42.";
        string result = MiniMaxLLMBackend.StripThinkingTags(input);
        Assert.That(result, Is.EqualTo("The actual answer is 42."));
    }

    [Test]
    public void StripThinkingTags_WithMultipleThinkBlocks_StripsAll()
    {
        string input = "<think>first thought</think>Part 1 <think>second thought</think>Part 2";
        string result = MiniMaxLLMBackend.StripThinkingTags(input);
        Assert.That(result, Is.EqualTo("Part 1 Part 2"));
    }

    [Test]
    public void StripThinkingTags_IncompleteThinkBlock_StripsFromTag()
    {
        string input = "The answer is 42.<think>still thinking...";
        string result = MiniMaxLLMBackend.StripThinkingTags(input);
        Assert.That(result, Is.EqualTo("The answer is 42."));
    }

    [Test]
    public void StripThinkingTags_EmptyString_ReturnsEmpty()
    {
        Assert.That(MiniMaxLLMBackend.StripThinkingTags(""), Is.EqualTo(""));
    }

    [Test]
    public void StripThinkingTags_NullString_ReturnsNull()
    {
        Assert.That(MiniMaxLLMBackend.StripThinkingTags(null), Is.Null);
    }

    [Test]
    public void StripThinkingTags_CaseInsensitive_Strips()
    {
        string input = "<THINK>reasoning</THINK>Result here";
        string result = MiniMaxLLMBackend.StripThinkingTags(input);
        Assert.That(result, Is.EqualTo("Result here"));
    }

    [Test]
    public void StripThinkingTags_MultilineThinkBlock_Strips()
    {
        string input = "<think>\nLine 1 of thought\nLine 2 of thought\n</think>Final answer.";
        string result = MiniMaxLLMBackend.StripThinkingTags(input);
        Assert.That(result, Is.EqualTo("Final answer."));
    }

    [Test]
    public void Settings_DefaultValues_AreCorrect()
    {
        var settings = new MiniMaxLLMBackend.MiniMaxLLMBackendSettings();
        Assert.Multiple(() =>
        {
            Assert.That(settings.ApiKey, Is.EqualTo(""));
            Assert.That(settings.BaseUrl, Is.EqualTo("https://api.minimax.io/v1"));
            Assert.That(settings.Model, Is.EqualTo("MiniMax-M2.7"));
            Assert.That(settings.Temperature, Is.EqualTo(0.7));
            Assert.That(settings.MaxTokens, Is.EqualTo(0));
            Assert.That(settings.AllowIdle, Is.False);
            Assert.That(settings.TimeoutSeconds, Is.EqualTo(120));
        });
    }

    [Test]
    public void SupportedFeatures_ContainsLlmAndRemoteLlm()
    {
        var backend = new MiniMaxLLMBackend();
        var features = backend.SupportedFeatures.ToList();
        Assert.Multiple(() =>
        {
            Assert.That(features, Contains.Item("llm"));
            Assert.That(features, Contains.Item("remote_llm"));
        });
    }

    [Test]
    public async Task FreeMemory_ReturnsFalse()
    {
        var backend = new MiniMaxLLMBackend();
        bool result = await backend.FreeMemory(true);
        Assert.That(result, Is.False);
    }

    [Test]
    public void Init_WithoutApiKey_ThrowsInvalidOperationException()
    {
        var backend = new MiniMaxLLMBackend();
        backend.SettingsRaw = new MiniMaxLLMBackend.MiniMaxLLMBackendSettings { ApiKey = "" };
        Assert.ThrowsAsync<InvalidOperationException>(async () => await backend.Init());
    }

    [Test]
    public void Init_WithWhitespaceApiKey_ThrowsInvalidOperationException()
    {
        var backend = new MiniMaxLLMBackend();
        backend.SettingsRaw = new MiniMaxLLMBackend.MiniMaxLLMBackendSettings { ApiKey = "   " };
        Assert.ThrowsAsync<InvalidOperationException>(async () => await backend.Init());
    }

    [Test]
    public void Generate_WithoutInit_ThrowsInvalidOperationException()
    {
        var backend = new MiniMaxLLMBackend();
        var input = new LLMs.LLMParamInput { UserMessage = "Hello" };
        Assert.ThrowsAsync<InvalidOperationException>(async () => await backend.Generate(input));
    }

    [Test]
    public void GenerateLive_WithoutInit_ThrowsInvalidOperationException()
    {
        var backend = new MiniMaxLLMBackend();
        var input = new LLMs.LLMParamInput { UserMessage = "Hello" };
        Assert.ThrowsAsync<InvalidOperationException>(async () =>
            await backend.GenerateLive(input, "batch-1", _ => { }));
    }
}
