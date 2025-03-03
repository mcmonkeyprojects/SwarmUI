using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.Diagnostics;
using System.IO;

namespace SwarmUI.WebAPI;

[API.APIClass("General utility API routes.")]
public static class UtilAPI
{
    public static void Register()
    {
        API.RegisterAPICall(CountTokens, false, Permissions.UseTokenizer);
        API.RegisterAPICall(TokenizeInDetail, false, Permissions.UseTokenizer);
        API.RegisterAPICall(Pickle2SafeTensor, true, Permissions.Pickle2Safetensors);
        API.RegisterAPICall(WipeMetadata, true, Permissions.ResetMetadata);
    }

    public static ConcurrentDictionary<string, CliplikeTokenizer> Tokenizers = new();

    private static (JObject, CliplikeTokenizer) GetTokenizerForAPI(string text, string tokenset)
    {
        if (text.Length > 100 * 1024)
        {
            return (new JObject() { ["error"] = "Text too long, refused." }, null);
        }
        tokenset = Utilities.FilePathForbidden.TrimToNonMatches(tokenset);
        if (tokenset.Contains('/') || tokenset.Contains('.') || tokenset.Trim() == "" || tokenset.Length > 128)
        {
            return (new JObject() { ["error"] = "Invalid tokenset (refused characters or format), refused." }, null);
        }
        try
        {
            CliplikeTokenizer tokenizer = Tokenizers.GetOrCreate(tokenset, () =>
            {
                string fullPath = $"src/srcdata/Tokensets/{tokenset}.txt.gz";
                if (!File.Exists(fullPath))
                {
                    throw new SwarmUserErrorException($"Tokenset '{tokenset}' does not exist.");
                }
                CliplikeTokenizer tokenizer = new();
                tokenizer.Load(fullPath);
                return tokenizer;
            });
            return (null, tokenizer);
        }
        catch (SwarmReadableErrorException ex)
        {
            return (new JObject() { ["error"] = ex.Message },  null);
        }
    }

    private static readonly string[] SkippablePromptSyntax = ["segment", "object", "region", "clear", "extend"];

    [API.APIDescription("Count the CLIP-like tokens in a given text prompt.", "\"count\": 0")]
    public static async Task<JObject> CountTokens(
        [API.APIParameter("The text to tokenize.")] string text,
        [API.APIParameter("If false, processing prompt syntax (things like `<random:`). If true, don't process that.")] bool skipPromptSyntax = false,
        [API.APIParameter("What tokenization set to use.")] string tokenset = "clip",
        [API.APIParameter("If true, process weighting (like `(word:1.5)`). If false, don't process that.")] bool weighting = true)
    {
        if (skipPromptSyntax)
        {
            foreach (string str in SkippablePromptSyntax)
            {
                int skippable = text.IndexOf($"<{str}:");
                if (skippable != -1)
                {
                    text = text[..skippable];
                }
            }
            text = T2IParamInput.ProcessPromptLikeForLength(text);
        }
        (JObject error, CliplikeTokenizer tokenizer) = GetTokenizerForAPI(text, tokenset);
        if (error is not null)
        {
            return error;
        }
        if (!weighting)
        {
            CliplikeTokenizer.Token[] rawTokens = tokenizer.Encode(text);
            return new JObject() { ["count"] = rawTokens.Length };
        }
        string[] sections = text.Split("<break>");
        int biggest = sections.Select(text => tokenizer.EncodeWithWeighting(text).Length).Max();
        return new JObject() { ["count"] = biggest };
    }

    [API.APIDescription("Tokenize some prompt text and get thorough detail about it.",
        """
            "tokens":
            [
                {
                    "id": 123,
                    "weight": 1.0,
                    "text": "tok"
                }
            ]
        """)]
    public static async Task<JObject> TokenizeInDetail(
        [API.APIParameter("The text to tokenize.")] string text,
        [API.APIParameter("What tokenization set to use.")] string tokenset = "clip",
        [API.APIParameter("If true, process weighting (like `(word:1.5)`). If false, don't process that.")] bool weighting = true)
    {
        (JObject error, CliplikeTokenizer tokenizer) = GetTokenizerForAPI(text, tokenset);
        if (error is not null)
        {
            return error;
        }
        CliplikeTokenizer.Token[] tokens = weighting ? tokenizer.EncodeWithWeighting(text) : tokenizer.Encode(text);
        return new JObject()
        {
            ["tokens"] = new JArray(tokens.Select(t => new JObject() { ["id"] = t.ID, ["weight"] = t.Weight, ["text"] = tokenizer.Tokens[t.ID] }).ToArray())
        };
    }

    [API.APIDescription("Trigger bulk conversion of models from pickle format to safetensors.", "\"success\": true")]
    public static async Task<JObject> Pickle2SafeTensor(
        [API.APIParameter("What type of model to convert, eg `Stable-Diffusion`, `LoRA`, etc.")] string type,
        [API.APIParameter("If true, convert to fp16 while processing. If false, use original model's weight type.")] bool fp16)
    {
        if (!Program.T2IModelSets.TryGetValue(type, out T2IModelHandler models))
        {
            return new JObject() { ["error"] = $"Invalid type '{type}'." };
        }
        foreach (string path in models.FolderPaths)
        {
            Process p = PythonLaunchHelper.LaunchGeneric("launchtools/pickle-to-safetensors.py", true, [path, fp16 ? "true" : "false"]);
            await p.WaitForExitAsync(Program.GlobalProgramCancel);
        }
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Trigger a mass metadata reset.", "\"success\": true")]
    public static async Task<JObject> WipeMetadata()
    {
        BackendHandler.T2IBackendData[] backends = [.. Program.Backends.T2IBackends.Values];
        foreach (BackendHandler.T2IBackendData backend in backends)
        {
            Interlocked.Add(ref backend.Usages, backend.Backend.MaxUsages);
        }
        try
        {
            int ticks = 0;
            while (Program.Backends.T2IBackends.Values.Any(b => b.Usages > b.Backend.MaxUsages))
            {
                if (Program.GlobalProgramCancel.IsCancellationRequested)
                {
                    return null;
                }
                await Task.Delay(TimeSpan.FromSeconds(0.5));
                if (ticks > 240)
                {
                    Logs.Info($"Reset All Metadata: stuck waiting for backends to be clear too long, will just do it anyway.");
                    break;
                }
            }
            foreach (T2IModelHandler handler in Program.T2IModelSets.Values)
            {
                handler.MassRemoveMetadata();
            }
        }
        finally
        {
            foreach (BackendHandler.T2IBackendData backend in backends)
            {
                Interlocked.Add(ref backend.Usages, -backend.Backend.MaxUsages);
            }
        }
        ImageMetadataTracker.MassRemoveMetadata();
        return new JObject() { ["success"] = true };
    }
}
