using FreneticUtilities.FreneticDataSyntax;
using SwarmUI.DataHolders;
using SwarmUI.Text2Image;
using SwarmUI.Utils;

namespace SwarmUI.Backends;

/// <summary>Represents a basic abstracted Text2Image backend provider.</summary>
public abstract class AbstractT2IBackend : AbstractBackend
{
    /// <summary>Shuts down this backend and clears any memory/resources/etc. Does not return until fully cleared.</summary>
    public async Task DoShutdownNow()
    {
        OnShutdown?.Invoke();
        OnShutdown = null;
        CurrentModelName = null;
        await Shutdown();
    }

    /// <summary>Generate an image.</summary>
    public abstract Task<Image[]> Generate(T2IParamInput user_input);

    /// <summary>Runs a generating with live feedback (progress updates, previews, etc.)</summary>
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

    /// <summary>Add a load status message.</summary>
    public void AddLoadStatus(string message)
    {
        Logs.Debug($"[Load {BackendData.BackType.Name} #{BackendData.ID}] {message}");
        if (LoadStatusReport is null)
        {
            return;
        }
        lock (LoadStatusReport)
        {
            LoadStatusReport.Add(new LoadStatus() { Message = message, Time = Environment.TickCount64 });
        }
    }

    /// <summary>Currently loaded model, or null if none.</summary>
    public volatile string CurrentModelName;

    /// <summary>Backend type data for the internal handler.</summary>
    public BackendHandler.BackendType HandlerTypeData => BackendData.BackType;

    /// <summary>Deprecated, use <see cref="LoadModel(T2IModel, T2IParamInput)"/>.</summary>
    [Obsolete("Use the T2IParamInput version")]
    public virtual Task<bool> LoadModel(T2IModel model)
    {
        return LoadModel(model, null);
    }

    /// <summary>Tell the backend to load a specific model. Return true if loaded, false if failed. Contains a copy of the first input seen, which may contain alternate side-models the user prefers. Input may be null.</summary>
    public virtual Task<bool> LoadModel(T2IModel model, T2IParamInput input)
    {
        Logs.Warning($"Backend {BackendData.BackType.Name} is outdated, please update it");
#pragma warning disable CS0618 // Type or member is obsolete
        return LoadModel(model);
#pragma warning restore CS0618 // Type or member is obsolete
    }

    /// <summary>Handler-internal data for this backend.</summary>
    public BackendHandler.T2IBackendData BackendData;

    /// <summary>The maximum number of simultaneous requests this backend should take.</summary>
    public int MaxUsages = 1;

    /// <summary>Whether this backend has the capability to load a model. Marking this false indicates a "not for generation usage" backend, such as an API handler that emits temporary (IsReal=false) backends to do the actual generations.</summary>
    public bool CanLoadModels = true;

    /// <summary>The list of all model names this server has (key=model subtype, value=list of filenames), or null if untracked.</summary>
    public ConcurrentDictionary<string, List<string>> Models = null;

    /// <summary>Return true if the input is (likely) valid to run on this backend, or false if it is known to not be compatible (eg missing models, etc).
    /// Update <see cref="T2IParamInput.RefusalReasons"/> if this method returns false.</summary>
    public virtual bool IsValidForThisBackend(T2IParamInput input)
    {
        return true;
    }
}
