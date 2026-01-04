using FreneticUtilities.FreneticDataSyntax;
using SwarmUI.DataHolders;
using SwarmUI.Text2Image;
using SwarmUI.Utils;

namespace SwarmUI.Backends;

/// <summary>Represents a basic abstracted Text2Image backend provider.</summary>
public abstract class AbstractT2IBackend : AbstractBackend
{
    /// <summary>Shuts down this backend and clears any memory/resources/etc. Does not return until fully cleared.</summary>
    public override async Task DoShutdownNow()
    {
        CurrentModelName = null;
        await base.DoShutdownNow();
    }

    /// <summary>Generate an image.</summary>
    public abstract Task<Image[]> Generate(T2IParamInput user_input);

    /// <summary>Runs a generation with live feedback (progress updates, previews, etc.)</summary>
    /// <param name="user_input">The user input data to generate.</param>
    /// <param name="batchId">Local batch-ID for this generation.</param>
    /// <param name="takeOutput">Takes an output object: Image for final images, JObject for anything else.</param>
    public virtual async Task GenerateLive(T2IParamInput user_input, string batchId, Action<object> takeOutput)
    {
        foreach (Image img in await Generate(user_input))
        {
            takeOutput(img);
        }
    }

    /// <summary>Currently loaded model, or null if none.</summary>
    public volatile string CurrentModelName;

    /// <summary>Tell the backend to load a specific model. Return true if loaded, false if failed. Contains a copy of the first input seen, which may contain alternate side-models the user prefers. Input may be null.</summary>
    public abstract Task<bool> LoadModel(T2IModel model, T2IParamInput input);

    /// <summary>Handler-internal data for this backend.</summary>
    public BackendHandler.T2IBackendData BackendData
    {
        get => AbstractBackendData as BackendHandler.T2IBackendData;
        set => AbstractBackendData = value;
    }

    /// <summary>The list of all model names this server has (key=model subtype, value=list of filenames), or null if untracked.</summary>
    public ConcurrentDictionary<string, List<string>> Models = null;

    /// <summary>Return true if the input is (likely) valid to run on this backend, or false if it is known to not be compatible (eg missing models, etc).
    /// Update <see cref="T2IParamInput.RefusalReasons"/> if this method returns false.</summary>
    public virtual bool IsValidForThisBackend(T2IParamInput input)
    {
        return true;
    }
}
