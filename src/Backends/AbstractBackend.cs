using FreneticUtilities.FreneticDataSyntax;
using SwarmUI.Utils;

namespace SwarmUI.Backends;

public abstract class AbstractBackend
{
    /// <summary>Load this backend and get it ready for usage. Do not return until ready. Throw an exception if not possible.</summary>
    public abstract Task Init();

    /// <summary>Shut down this backend and clear any memory/resources/etc. Do not return until fully cleared. Call <see cref="DoShutdownNow"/> to trigger this correctly.</summary>
    public abstract Task Shutdown();

    /// <summary>Event fired when this backend is about to shutdown.</summary>
    public Action OnShutdown;

    /// <summary>Whether this backend has been configured validly.</summary>
    public volatile BackendStatus Status = BackendStatus.WAITING;

    /// <summary>Whether this backend is alive and ready.</summary>
    public bool IsAlive()
    {
        return Status == BackendStatus.RUNNING;
    }

    /// <summary>Holder for a status message during backend loading.</summary>
    public class LoadStatus
    {
        /// <summary>A message about the current status.</summary>
        public string Message;

        /// <summary>The <see cref="Environment.TickCount64"/> time the message was tracked.</summary>
        public long Time;

        /// <summary>Index used by <see cref="BackendHandler"/> for tracking load status changes.</summary>
        public int TrackerIndex = 0;
    }

    /// <summary>Any/all current load-status messages.</summary>
    public List<LoadStatus> LoadStatusReport = [];

    /// <summary>The backing <see cref="BackendHandler"/> instance.</summary>
    public BackendHandler Handler;

    /// <summary>A set of feature-IDs this backend supports.</summary>
    public abstract IEnumerable<string> SupportedFeatures { get; }

    /// <summary>The backend's settings.</summary>
    public AutoConfiguration SettingsRaw;

    /// <summary>Real backends are user-managed and save to file. Non-real backends are invisible to the user and file.</summary>
    public bool IsReal = true;

    /// <summary>If true, the backend should be live. If false, the server admin wants the backend turned off.</summary>
    public volatile bool IsEnabled = true;

    /// <summary>If non-empty, is a user-facing title-override for the given backend.</summary>
    public string Title = "";

    /// <summary>If true, this backend is intending to shutdown, and should be excluded from generation.</summary>
    public volatile bool ShutDownReserve = false;

    /// <summary>If above 0, something wants preferential ownership of this backend, and so general generations should not be sent to it.</summary>
    public volatile int Reservations = 0;

    /// <summary>Tells the backend to free its memory usage. Returns true if it happened, false if memory is still in use.
    /// Note that some backends may take extra time between when this call returns and when memory is actually freed, such as if they have jobs to wrap up or slow polling rates.
    /// Generally give at least one full second before assuming memory is properly cleared.</summary>
    /// <param name="systemRam">If true, system RAM should be cleaned. If false, only VRAM needs to be freed.</param>
    public virtual async Task<bool> FreeMemory(bool systemRam)
    {
        return false;
    }

    /// <summary>Exception can be thrown to indicate the backend cannot fulfill the request, but for temporary reasons, and another backend should be used instead.</summary>
    public class PleaseRedirectException : Exception
    {
    }
}

public enum BackendStatus
{
    DISABLED,
    ERRORED,
    WAITING,
    LOADING,
    IDLE,
    RUNNING
}
