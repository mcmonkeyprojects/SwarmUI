using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.DataHolders;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.IO;
using System.Net.Http;
using System.Reflection;

namespace SwarmUI.Backends;

/// <summary>Central manager for available backends.</summary>
public class BackendHandler
{
    public ConcurrentDictionary<int, BackendData> AllBackends = new();

    /// <summary>Currently loaded backends. Might not all be valid.</summary>
    [Obsolete("Use AllBackends or EnumerateT2IBackends")]
    public Dictionary<int, T2IBackendData> T2IBackends => AllBackends.Select(pair => new KeyValuePair<int, T2IBackendData>(pair.Key, pair.Value as T2IBackendData)).Where(p => p.Value is not null).PairsToDictionary();

    /// <summary>Returns a simple enumeration of current t2i backends.</summary>
    public IEnumerable<T2IBackendData> EnumerateT2IBackends => AllBackends.Values.Select(b => b as T2IBackendData).Where(b => b is not null);

    /// <summary>Signal when any backends are available, or other reason to check backends (eg new requests came in).</summary>
    public AsyncAutoResetEvent CheckBackendsSignal = new(false);

    /// <summary>Central locker to prevent issues with backend validating.</summary>
    public LockObject CentralLock = new();

    /// <summary>Map of backend type IDs to metadata about them.</summary>
    public Dictionary<string, BackendType> BackendTypes = [];

    /// <summary>Value to ensure unique IDs are given to new backends.</summary>
    public int LastBackendID = 0;

    /// <summary>Value to ensure unique IDs are given to new non-real backends.</summary>
    public int LastNonrealBackendID = -1;

    /// <summary>If true, then at some point backends were edited, and re-saving is needed.</summary>
    public bool BackendsEdited = false;

    /// <summary>The path to where the backend list is saved.</summary>
    public string SaveFilePath = "Data/Backends.fds";

    /// <summary>Queue of backends to initialize.</summary>
    public ConcurrentQueue<BackendData> BackendsToInit = new();

    /// <summary>Signal for when a new backend is added to <see cref="BackendsToInit"/>.</summary>
    public AsyncAutoResetEvent NewBackendInitSignal = new(false);

    /// <summary>Lock to guarantee no overlapping backends list saves.</summary>
    public LockObject SaveLock = new();

    /// <summary>The number of currently loaded backends.</summary>
    public int Count => AllBackends.Count;

    /// <summary>Possible outcomes of requesting a backend scale.</summary>
    public enum ScaleResult
    {
        /// <summary>Something brand new has been launched.</summary>
        FreshLaunch,
        /// <summary>Something not-so-new has been launched (other instances of same work present).</summary>
        AddedLaunch,
        /// <summary>Nothing was launched.</summary>
        NoLaunch
    }

    /// <summary>Events fired when generations are being attempted, but no space is available - a new backend is needed, if any scalers are configured and able to provide one. Key is recommended to be a backend ID, but any unique int will do.</summary>
    public ConcurrentDictionary<int, Func<Task<ScaleResult>>> NewBackendNeededEvent = [];

    /// <summary>Try to cause a new backend to be created. Only does anything if a scaling provider is available.</summary>
    /// <param name="needFresh">If true, only return if a *fresh* new backend has returned, return true only if a fresh launch was caused.</param>
    public async Task<bool> TryToScaleANewBackend(bool needFresh)
    {
        foreach (Func<Task<ScaleResult>> func in NewBackendNeededEvent.Values)
        {
            try
            {
                ScaleResult result = await func();
                if (result == ScaleResult.FreshLaunch)
                {
                    return true;
                }
                else if (result == ScaleResult.AddedLaunch && !needFresh)
                {
                    return true;
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Error while trying to scale a new backend: {ex.ReadableString()}");
            }
        }
        return false;
    }

    /// <summary>Getter for the current overall backend status report.</summary>
    public SingleValueExpiringCacheAsync<JObject> CurrentBackendStatus;

    /// <summary>Gets a hashset of all supported features across all backends.</summary>
    public HashSet<string> GetAllSupportedFeatures()
    {
        return [.. AllBackends.Values.Where(b => b is not null && b.AbstractBackend.IsEnabled && b.AbstractBackend.Status != BackendStatus.IDLE).SelectMany(b => b.AbstractBackend.SupportedFeatures)];
    }

    /// <summary>Registered core backend types.</summary>
    public BackendType SwarmBackendType, AutoScalingBackendType, LlamaSharpBackendType, SimpleRemoteLLMBackendType;

    public BackendHandler()
    {
        SwarmBackendType = RegisterBackendType<SwarmSwarmBackend>("swarmswarmbackend", "Swarm-API-Backend", "Connect SwarmUI to another instance of SwarmUI as a backend.", true, true);
        AutoScalingBackendType = RegisterBackendType<AutoScalingBackend>("autoscalingbackend", "Auto Scaling Backend", "(Advanced users only) Automatically launch other instances of SwarmUI to serve as dynamic additional backends.", true, false);
        LlamaSharpBackendType = RegisterBackendType<LlamaSharpLLMBackend>("localllama", "Local LLaMA.cpp GGUF Backend", "(EXPERIMENTAL) Same-process local LLaMA GGUF LLM support.", true, false);
        SimpleRemoteLLMBackendType = RegisterBackendType<SimpleRemoteLLMBackend>("simpleremotellm", "Remote LLM (OpenAI API)", "(EXPERIMENTAL) Support for any OpenAI API compatible LLM provider.", true, false);
        Program.ModelRefreshEvent += () =>
        {
            List<Task> waitFor = [];
            foreach (SwarmSwarmBackend backend in RunningBackendsOfType<SwarmSwarmBackend>())
            {
                waitFor.Add(backend.TriggerRefresh());
            }
            Task.WaitAll([.. waitFor]);
        };
        CurrentBackendStatus = new(() =>
        {
            T2IBackendData[] backends = [.. EnumerateT2IBackends];
            if (backends.Length == 0)
            {
                return new()
                {
                    ["status"] = "empty",
                    ["class"] = "error",
                    ["message"] = "No backends present. You must configure backends in the Backends section of the Server tab before you can continue.",
                    ["any_loading"] = false
                };
            }
            if (backends.All(b => !b.Backend.IsEnabled))
            {
                return new()
                {
                    ["status"] = "all_disabled",
                    ["class"] = "error",
                    ["message"] = "All backends are disabled. You must enable backends in the Backends section of the Server tab before you can continue.",
                    ["any_loading"] = false
                };
            }
            BackendStatus[] statuses = [.. backends.Select(b => b.Backend.Status)];
            int loading = statuses.Count(s => s == BackendStatus.LOADING || s == BackendStatus.WAITING);
            if (statuses.Any(s => s == BackendStatus.ERRORED))
            {
                return new()
                {
                    ["status"] = "errored",
                    ["class"] = "error",
                    ["message"] = "Some backends have errored on the server. Check the server logs for details.",
                    ["any_loading"] = loading > 0
                };
            }
            if (statuses.Any(s => s == BackendStatus.RUNNING))
            {
                if (loading > 0)
                {
                    return new()
                    {
                        ["status"] = "some_loading",
                        ["class"] = "warn",
                        ["message"] = "Some backends are ready, but others are still loading...",
                        ["any_loading"] = true
                    };
                }
                return new()
                {
                    ["status"] = "running",
                    ["class"] = "",
                    ["message"] = "",
                    ["any_loading"] = false
                };
            }
            if (loading > 0)
            {
                return new()
                {
                    ["status"] = "loading",
                    ["class"] = "soft",
                    ["message"] = "Backends are still loading on the server...",
                    ["any_loading"] = true
                };
            }
            if (statuses.Any(s => s == BackendStatus.DISABLED))
            {
                return new()
                {
                    ["status"] = "disabled",
                    ["class"] = "warn",
                    ["message"] = "Some backends are disabled. Please enable or configure them to continue.",
                    ["any_loading"] = false
                };
            }
            if (statuses.Any(s => s == BackendStatus.IDLE))
            {
                return new()
                {
                    ["status"] = "idle",
                    ["class"] = "warn",
                    ["message"] = "All backends are idle. Cannot generate until at least one backend is running.",
                    ["any_loading"] = false
                };
            }
            return new()
            {
                ["status"] = "unknown",
                ["class"] = "error",
                ["message"] = "Something is wrong with your backends. Please check the Backends section of the Server tab, or the server logs.",
                ["any_loading"] = false
            };
        }, TimeSpan.FromSeconds(1));
    }

    /// <summary>Metadata about backend types.</summary>
    public record class BackendType(string ID, string Name, string Description, Type SettingsClass, AutoConfiguration.Internal.AutoConfigData SettingsInternal, Type BackendClass, JObject NetDescription, bool CanLoadFast = false);

    /// <summary>Mapping of C# types to network type labels.</summary>
    public static Dictionary<Type, string> NetTypeLabels = new()
    {
        [typeof(string)] = "text",
        [typeof(int)] = "integer",
        [typeof(long)] = "integer",
        [typeof(float)] = "decimal",
        [typeof(double)] = "decimal",
        [typeof(bool)] = "bool"
    };

    /// <summary>Register a new backend-type by type ref.</summary>
    public BackendType RegisterBackendType(Type type, string id, string name, string description, bool CanLoadFast = false, bool isStandard = false)
    {
        Type settingsType = type.GetNestedTypes().First(t => t.IsSubclassOf(typeof(AutoConfiguration)));
        AutoConfiguration.Internal.AutoConfigData settingsInternal = (Activator.CreateInstance(settingsType) as AutoConfiguration).InternalData.SharedData;
        List<JObject> fields = [.. settingsInternal.Fields.Values.Select(f =>
        {
            string typeName = f.IsSection ? "group" : T2IParamTypes.SharpTypeToDataType(f.Field.FieldType, false).ToString();
            string[] vals = f.Field.GetCustomAttribute<SettingsOptionsAttribute>()?.Options ?? null;
            string[] val_names = null;
            if (vals is not null)
            {
                typeName = typeName == "LIST" ? "LIST" : "DROPDOWN";
                val_names = f.Field.GetCustomAttribute<SettingsOptionsAttribute>()?.Names ?? null;
            }
            return new JObject()
            {
                ["name"] = f.Name,
                ["type"] = typeName.ToLowerFast(),
                ["description"] = f.Field.GetCustomAttribute<AutoConfiguration.ConfigComment>()?.Comments?.ToString() ?? "",
                ["placeholder"] = f.Field.GetCustomAttribute<SuggestionPlaceholder>()?.Text ?? "",
                ["is_secret"] = f.Field.GetCustomAttribute<ValueIsSecretAttribute>() is not null,
                ["values"] = vals is null ? null : JArray.FromObject(vals),
                ["value_names"] = val_names is null ? null : JArray.FromObject(val_names)
            };
        })];
        JObject netDesc = new()
        {
            ["id"] = id,
            ["name"] = name,
            ["description"] = description,
            ["settings"] = JToken.FromObject(fields),
            ["is_standard"] = isStandard
        };
        BackendType typeObj = new(id, name, description, settingsType, settingsInternal, type, netDesc, CanLoadFast: CanLoadFast);
        BackendTypes.Add(id, typeObj);
        return typeObj;
    }

    /// <summary>Register a new backend-type by type ref.</summary>
    public BackendType RegisterBackendType<T>(string id, string name, string description, bool CanLoadFast = false, bool isStandard = false) where T : AbstractBackend
    {
        return RegisterBackendType(typeof(T), id, name, description, CanLoadFast, isStandard);
    }

    /// <summary>Special live data about a registered backend.</summary>
    public class BackendData
    {
        public AbstractBackend AbstractBackend;

        /// <summary>If the backend is non-real, this is the parent backend.</summary>
        public BackendData AbstractParent;

        public volatile bool ReserveModelLoad = false;

        public volatile int Usages = 0;

        public bool CheckIsInUseAtAll => (ReserveModelLoad || Usages > 0) && AbstractBackend.Status == BackendStatus.RUNNING;

        public bool CheckIsInUse => (ReserveModelLoad || Usages >= AbstractBackend.MaxUsages) && AbstractBackend.Status == BackendStatus.RUNNING;

        public bool CheckIsInUseNoModelReserve => Usages >= AbstractBackend.MaxUsages && AbstractBackend.Status == BackendStatus.RUNNING;

        public LockObject AccessLock = new();

        public int ID;

        public int InitAttempts = 0;

        public int ModCount = 0;

        public long TimeLastRelease;

        public BackendType BackType;

        public void UpdateLastReleaseTime()
        {
            TimeLastRelease = Environment.TickCount64;
            AbstractParent?.UpdateLastReleaseTime();
        }

        public void Claim()
        {
            Interlocked.Increment(ref Usages);
            UpdateLastReleaseTime();
        }
    }

    /// <summary>Special live data about a registered text-to-image backend.</summary>
    public class T2IBackendData : BackendData
    {
        public AbstractT2IBackend Backend
        {
            get => AbstractBackend as AbstractT2IBackend;
            set => AbstractBackend = value;
        }

        /// <summary>If the backend is non-real, this is the parent backend.</summary>
        public T2IBackendData Parent
        {
            get => AbstractParent as T2IBackendData;
            set => AbstractParent = value;
        }
    }

    public BackendData RawInstantiate(BackendType type)
    {
        object inst = Activator.CreateInstance(type.BackendClass);
        if (inst is AbstractT2IBackend t2i)
        {
            return new T2IBackendData()
            {
                Backend = t2i,
                BackType = type
            };
        }
        else if (inst is AbstractBackend abst)
        {
            return new BackendData()
            {
                AbstractBackend = abst,
                BackType = type
            };
        }
        else
        {
            throw new Exception($"Backend type {type.Name} is not any known backend subclass type!");
        }
    }

    /// <summary>Adds a new backend of the given type, and returns its data. Note that the backend will not be initialized at first.</summary>
    public BackendData AddNewOfType(BackendType type, AutoConfiguration config = null)
    {
        BackendsEdited = true;
        BackendData data = RawInstantiate(type);
        data.AbstractBackend.AbstractBackendData = data;
        data.AbstractBackend.SettingsRaw = config ?? (Activator.CreateInstance(type.SettingsClass) as AutoConfiguration);
        data.AbstractBackend.Handler = this;
        lock (CentralLock)
        {
            data.ID = LastBackendID++;
            AllBackends.TryAdd(data.ID, data);
        }
        DoInitBackend(data);
        NewBackendInitSignal.Set();
        return data;
    }

    /// <summary>Adds a new backend that is not a 'real' backend (it will not save nor show in the UI, but is available for generation calls).</summary>
    public BackendData AddNewNonrealBackend(BackendType type, BackendData parent, AutoConfiguration config = null, Action<BackendData> preModify = null)
    {
        BackendData data = RawInstantiate(type);
        data.AbstractBackend.AbstractBackendData = data;
        data.AbstractBackend.SettingsRaw = config ?? (Activator.CreateInstance(type.SettingsClass) as AutoConfiguration);
        data.AbstractBackend.Handler = this;
        data.AbstractBackend.IsReal = false;
        lock (CentralLock)
        {
            data.ID = LastNonrealBackendID--;
            AllBackends.TryAdd(data.ID, data);
        }
        preModify?.Invoke(data);
        DoInitBackend(data);
        NewBackendInitSignal.Set();
        return data;
    }

    /// <summary>Shuts down the given backend properly and cleanly, in a way that avoids interrupting usage of the backend.</summary>
    public async Task ShutdownBackendCleanly(BackendData data)
    {
        data.AbstractBackend.ShutDownReserve = true;
        try
        {
            while (data.CheckIsInUse && data.AbstractBackend.MaxUsages > 0)
            {
                if (Program.GlobalProgramCancel.IsCancellationRequested)
                {
                    return;
                }
                await Task.Delay(TimeSpan.FromSeconds(0.5));
            }
            await data.AbstractBackend.DoShutdownNow();
        }
        finally
        {
            data.AbstractBackend.ShutDownReserve = false;
        }
    }

    /// <summary>Shutdown and delete a given backend.</summary>
    public async Task<bool> DeleteById(int id)
    {
        BackendsEdited = true;
        if (!AllBackends.TryRemove(id, out BackendData data))
        {
            return false;
        }
        await ShutdownBackendCleanly(data);
        ReassignLoadedModelsList();
        return true;
    }

    /// <summary>Replace the settings of a given backend. Shuts it down immediately and queues a reload.</summary>
    public async Task<BackendData> EditById(int id, FDSSection newSettings, string title, int new_id = -1)
    {
        if (!AllBackends.TryGetValue(id, out BackendData data))
        {
            return null;
        }
        await ShutdownBackendCleanly(data);
        if (new_id >= 0)
        {
            if (!AllBackends.TryAdd(new_id, data))
            {
                throw new SwarmReadableErrorException($"Backend new ID {new_id} is already in use!");
            }
            data.ID = new_id;
            AllBackends.TryRemove(id, out _);
        }
        newSettings = data.AbstractBackend.SettingsRaw.ExcludeSecretValuesThatMatch(newSettings, "\t<secret>");
        data.AbstractBackend.SettingsRaw.Load(newSettings);
        Logs.Verbose($"Settings applied, now: {data.AbstractBackend.SettingsRaw.Save(true)}");
        if (title is not null)
        {
            data.AbstractBackend.Title = title;
        }
        BackendsEdited = true;
        data.ModCount++;
        DoInitBackend(data);
        return data;
    }

    /// <summary>Gets a set of all currently running backends of the given type.</summary>
    public IEnumerable<T> RunningBackendsOfType<T>() where T : AbstractBackend
    {
        return AllBackends.Values.Select(b => b.AbstractBackend as T).Where(b => b is not null && !b.ShutDownReserve && b.Status == BackendStatus.RUNNING);
    }

    /// <summary>Causes all backends to restart.</summary>
    public async Task ReloadAllBackends()
    {
        foreach (BackendData data in AllBackends.Values.ToArray())
        {
            await ReloadBackend(data);
        }
    }

    /// <summary>Causes a single backend to restart.</summary>
    public async Task ReloadBackend(BackendData data)
    {
        await ShutdownBackendCleanly(data);
        DoInitBackend(data);
    }

    /// <summary>Loads the backends list from a file.</summary>
    public void Load()
    {
        if (AllBackends.Any()) // Backup to prevent duplicate calls
        {
            return;
        }
        LoadInternal();
        NewBackendInitSignal.Set();
        ReassignLoadedModelsList();
        new Thread(new ThreadStart(RequestHandlingLoop)).Start();
    }

    /// <summary>If true, backends handler is still loading.</summary>
    public static bool IsLoading = true;

    /// <summary>Internal route for loading backends. Do not call directly.</summary>
    public void LoadInternal()
    {
        Logs.Init("Loading backends from file...");
        new Thread(InternalInitMonitor) { Name = "BackendHandler_Init_Monitor" }.Start();
        FDSSection file;
        try
        {
            file = FDSUtility.ReadFile(SaveFilePath);
        }
        catch (Exception ex)
        {
            if (ex is FileNotFoundException || ex is DirectoryNotFoundException)
            {
                return;
            }
            Logs.Error($"Could not read Backends save file: {ex.ReadableString()}");
            return;
        }
        if (file is null)
        {
            return;
        }
        foreach (string idstr in file.GetRootKeys())
        {
            FDSSection section = file.GetSection(idstr);
            if (!BackendTypes.TryGetValue(section.GetString("type"), out BackendType type))
            {
                Logs.Error($"Unknown backend type '{section.GetString("type")}' in save file, skipping backend #{idstr}.");
                continue;
            }
            BackendData data = RawInstantiate(type);
            data.ID = int.Parse(idstr);
            data.AbstractBackend.AbstractBackendData = data;
            LastBackendID = Math.Max(LastBackendID, data.ID + 1);
            data.AbstractBackend.SettingsRaw = Activator.CreateInstance(type.SettingsClass) as AutoConfiguration;
            data.AbstractBackend.SettingsRaw.Load(section.GetSection("settings"));
            data.AbstractBackend.IsEnabled = section.GetBool("enabled", true).Value;
            data.AbstractBackend.Title = section.GetString("title", "");
            data.AbstractBackend.Handler = this;
            DoInitBackend(data);
            lock (CentralLock)
            {
                AllBackends.TryAdd(data.ID, data);
            }
        }
        IsLoading = false;
    }

    /// <summary>How many backends have fast-loaded thus far.</summary>
    public static long CountBackendsFastLoaded = 0;

    /// <summary>Cause a backend to run its initializer, either immediately or in the next available slot.</summary>
    public void DoInitBackend(BackendData data)
    {
        data.AbstractBackend.LoadStatusReport ??= [];
        data.AbstractBackend.Status = BackendStatus.WAITING;
        data.AbstractBackend.AddLoadStatus("Waiting to load...");
        if (data.BackType.CanLoadFast || Program.ServerSettings.Backends.AllBackendsLoadFast)
        {
            long count = Interlocked.Increment(ref CountBackendsFastLoaded);
            bool shouldWait = count > 1 && IsLoading;
            Task.Run(async () =>
            {
                if (shouldWait)
                {
                    // Tiny delay on fast-loads at first boot just to prevent hyperthrash of first-time loadup, since there's a lot of prep stuff that happens
                    await Task.Delay(TimeSpan.FromSeconds(1 + Math.Min(5, count / 10.0)));
                }
                await LoadBackendDirect(data);
            });
        }
        else
        {
            BackendsToInit.Enqueue(data);
        }
    }

    /// <summary>Internal direct immediate backend load call.</summary>
    public async Task<bool> LoadBackendDirect(BackendData data)
    {
        if (!data.AbstractBackend.IsEnabled)
        {
            data.AbstractBackend.Status = BackendStatus.DISABLED;
            data.AbstractBackend.LoadStatusReport = null;
            return false;
        }
        try
        {
            data.AbstractBackend.AddLoadStatus("Will now load...");
            if (data.AbstractBackend.IsReal)
            {
                Logs.Init($"Initializing backend #{data.ID} - {data.AbstractBackend.HandlerTypeData.Name}...");
            }
            else
            {
                Logs.Verbose($"Initializing non-real backend #{data.ID} - {data.AbstractBackend.HandlerTypeData.Name}...");
            }
            data.InitAttempts++;
            await data.AbstractBackend.Init().WaitAsync(Program.GlobalProgramCancel);
            return true;
        }
        catch (Exception ex)
        {
            if (data.InitAttempts <= Program.ServerSettings.Backends.MaxBackendInitAttempts)
            {
                data.AbstractBackend.AddLoadStatus("Load failed, will retry...");
                data.AbstractBackend.Status = BackendStatus.WAITING;
                Logs.Error($"Error #{data.InitAttempts} while initializing backend #{data.ID} - {data.AbstractBackend.HandlerTypeData.Name} - will retry");
                await Task.Delay(TimeSpan.FromSeconds(1)); // Intentionally pause a second to give a chance for external issue to self-resolve.
                BackendsToInit.Enqueue(data);
            }
            else
            {
                data.AbstractBackend.Status = BackendStatus.ERRORED;
                data.AbstractBackend.LoadStatusReport = null;
                if (ex is AggregateException aex)
                {
                    ex = aex.InnerException;
                }
                string errorMessage = ex.ReadableString();
                if (ex is HttpRequestException hrex && hrex.Message.StartsWith("No connection could be made because the target machine actively refused it"))
                {
                    errorMessage = $"Connection refused - is the backend running, or is the address correct? (HttpRequestException: {ex.Message})";
                }
                Logs.Error($"Final error ({data.InitAttempts}) while initializing backend #{data.ID} - {data.AbstractBackend.HandlerTypeData.Name}, giving up: {errorMessage}");
            }
            return false;
        }
    }

    /// <summary>Internal thread path for processing new backend initializations.</summary>
    public void InternalInitMonitor()
    {
        while (!HasShutdown)
        {
            try
            {
                bool any = false;
                while (BackendsToInit.TryDequeue(out BackendData data) && !HasShutdown)
                {
                    bool loaded = LoadBackendDirect(data).Result;
                    any = any || loaded;
                }
                if (any)
                {
                    try
                    {
                        ReassignLoadedModelsList();
                    }
                    catch (Exception ex)
                    {
                        Logs.Error($"Error while reassigning loaded models list: {ex.ReadableString()}");
                    }
                }
                BackendData[] loading = [.. AllBackends.Values.Where(b => b.AbstractBackend.LoadStatusReport is not null && b.AbstractBackend.LoadStatusReport.Count > 1)];
                if (loading.Any())
                {
                    long now = Environment.TickCount64;
                    foreach (BackendData backend in loading)
                    {
                        AbstractBackend.LoadStatus firstStatus = backend.AbstractBackend.LoadStatusReport[0];
                        AbstractBackend.LoadStatus lastStatus = backend.AbstractBackend.LoadStatusReport[^1];
                        TimeSpan loadingFor = TimeSpan.FromMilliseconds(now - firstStatus.Time);
                        if (loadingFor > TimeSpan.FromMinutes(1 + firstStatus.TrackerIndex * 2))
                        {
                            firstStatus.TrackerIndex++;
                            if (backend.AbstractBackend.Status != BackendStatus.LOADING && backend.AbstractBackend.Status != BackendStatus.WAITING)
                            {
                                backend.AbstractBackend.LoadStatusReport = null;
                                continue;
                            }
                            TimeSpan lastWaiting = TimeSpan.FromMilliseconds(now - lastStatus.Time);
                            if (lastWaiting > TimeSpan.FromMinutes(1))
                            {
                                Logs.Init($"Backend #{backend.ID} - {backend.AbstractBackend.HandlerTypeData.Name} has been stuck on load-status='{lastStatus.Message}' for {lastWaiting.TotalMinutes:0.0} minutes...");
                                if (lastWaiting > TimeSpan.FromMinutes(10))
                                {
                                    Logs.Error($"Something has most likely wrong while loading backend #{backend.ID} - {backend.AbstractBackend.HandlerTypeData.Name} - check logs for details. You may need to restart the backend, or Swarm itself.");
                                }
                                else if (lastWaiting > TimeSpan.FromMinutes(5))
                                {
                                    Logs.Warning($"Something may have gone wrong while loading backend #{backend.ID} - {backend.AbstractBackend.HandlerTypeData.Name} - check logs for details.");
                                }
                            }
                            else if (loadingFor > TimeSpan.FromMinutes(15))
                            {
                                Logs.Init($"Backend #{backend.ID} - {backend.AbstractBackend.HandlerTypeData.Name} is still loading after {loadingFor.TotalMinutes:0.00} minutes. It may be fine, or it may have gotten stuck. Check logs for details.");
                            }
                            else
                            {
                                Logs.Init($"Backend #{backend.ID} - {backend.AbstractBackend.HandlerTypeData.Name} is still loading, and is probably fine...");
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Error in backend init monitor: {ex.ReadableString()}");
            }
            NewBackendInitSignal.WaitAsync(TimeSpan.FromSeconds(2), Program.GlobalProgramCancel).Wait();
        }
    }

    /// <summary>Updates what model(s) are currently loaded.</summary>
    public void ReassignLoadedModelsList()
    {
        foreach (T2IModel model in Program.MainSDModels.Models.Values)
        {
            model.AnyBackendsHaveLoaded = false;
        }
        foreach (T2IBackendData backend in EnumerateT2IBackends)
        {
            if (backend.Backend is not null && backend.Backend.CurrentModelName is not null && Program.MainSDModels.Models.TryGetValue(backend.Backend.CurrentModelName, out T2IModel model))
            {
                model.AnyBackendsHaveLoaded = true;
            }
        }
    }

    /// <summary>Save the backends list to a file.</summary>
    public void Save()
    {
        lock (SaveLock)
        {
            Logs.Info("Saving backends...");
            FDSSection saveFile = new();
            foreach (BackendData data in AllBackends.Values)
            {
                if (!data.AbstractBackend.IsReal)
                {
                    continue;
                }
                FDSSection data_section = new();
                data_section.Set("type", data.AbstractBackend.HandlerTypeData.ID);
                data_section.Set("title", data.AbstractBackend.Title);
                data_section.Set("enabled", data.AbstractBackend.IsEnabled);
                data_section.Set("settings", data.AbstractBackend.SettingsRaw.Save(true));
                saveFile.Set(data.ID.ToString(), data_section);
            }
            FDSUtility.SaveToFile(saveFile, SaveFilePath);
        }
    }

    /// <summary>Tells all backends to load a given T2I model. Returns true if any backends have loaded it, or false if not.</summary>
    public async Task<bool> LoadModelOnAll(T2IModel model, Func<T2IBackendData, bool> filter = null)
    {
        if (model.Name.ToLowerFast() == "(none)")
        {
            return true;
        }
        Logs.Verbose($"Got request to load model on all: {model.Name}");
        bool any = false;
        T2IBackendData[] filtered = [.. EnumerateT2IBackends.Where(b => b.Backend.Status == BackendStatus.RUNNING && b.Backend.MaxUsages > 0 && b.Backend.CanLoadModels)];
        if (!filtered.Any())
        {
            Logs.Warning($"Cannot load model as no backends are available.");
            return false;
        }
        if (filter is not null)
        {
            filtered = [.. filtered.Where(filter)];
            if (!filtered.Any())
            {
                Logs.Warning($"Cannot load model as no backends match the requested filter.");
                return false;
            }
        }
        foreach (T2IBackendData backend in filtered)
        {
            backend.ReserveModelLoad = true;
            while (backend.CheckIsInUseNoModelReserve && backend.Backend.MaxUsages > 0)
            {
                if (Program.GlobalProgramCancel.IsCancellationRequested)
                {
                    Logs.Warning($"Cannot load model as the program is shutting down.");
                    return false;
                }
                await Task.Delay(TimeSpan.FromSeconds(0.1));
            }
            try
            {
                any = (await backend.Backend.LoadModel(model, null)) || any;
            }
            catch (Exception ex)
            {
                Logs.Error($"Error loading model '{model.RawFilePath}' (arch={model.Metadata?.ModelClassType}) on backend {backend.ID} ({backend.Backend.HandlerTypeData.Name}): {ex.ReadableString()}");
            }
            backend.ReserveModelLoad = false;
        }
        if (!any)
        {
            Logs.Warning($"Tried {filtered.Length} backends but none were able to load model '{model.Name}'");
        }
        ReassignLoadedModelsList();
        return any;
    }

    private volatile bool HasShutdown;

    /// <summary>Main shutdown handler, triggered by <see cref="Program.Shutdown"/>.</summary>
    public void Shutdown()
    {
        if (HasShutdown)
        {
            return;
        }
        HasShutdown = true;
        NewBackendInitSignal.Set();
        CheckBackendsSignal.Set();
        List<(BackendData, Task)> tasks = [];
        foreach (BackendData backend in AllBackends.Values)
        {
            tasks.Add((backend, Task.Run(async () =>
            {
                int backTicks = 0;
                while (backend.CheckIsInUse && backend.AbstractBackend.MaxUsages > 0)
                {
                    if (backTicks++ > 50)
                    {
                        Logs.Info($"Backend {backend.ID} ({backend.AbstractBackend.HandlerTypeData.Name}) has been locked in use for at least 5 seconds after shutdown, giving up and killing anyway.");
                        break;
                    }
                    Thread.Sleep(100);
                }
                tasks.Add((backend, backend.AbstractBackend.DoShutdownNow()));
            })));
        }
        int ticks = 0;
        while (tasks.Any())
        {
            if (ticks++ > 20)
            {
                ticks = 0;
                Logs.Info($"Still waiting for {tasks.Count} backends to shut down ({string.Join(", ", tasks.Select(p => p.Item1).Select(b => $"{b.ID}: {b.AbstractBackend.HandlerTypeData.Name}"))})...");
            }
            Task.Delay(TimeSpan.FromMilliseconds(100)).Wait();
            tasks = [.. tasks.Where(t => !t.Item2.IsCompleted)];
        }
        WebhookManager.TryMarkDoneGenerating().Wait();
        if (BackendsEdited)
        {
            Logs.Info("All backends shut down, saving file...");
            Save();
            Logs.Info("Backend handler shutdown complete.");
        }
        else
        {
            Logs.Info("Backend handler shutdown complete without saving.");
        }
    }

    /// <summary>Helper data for a model being requested, used to inform backend model switching choices.</summary>
    public class ModelRequestPressure
    {
        /// <summary>The requested modeld.</summary>
        public T2IModel Model;

        /// <summary>The time (TickCount64) of the first current request for this model.</summary>
        public long TimeFirstRequest = Environment.TickCount64;

        /// <summary>How many requests are waiting.</summary>
        public int Count;

        /// <summary>Whether something is currently loading for this request.</summary>
        public volatile bool IsLoading;

        /// <summary>Sessions that want the model.</summary>
        public HashSet<Session> Sessions = [];

        /// <summary>Requests that want the model.</summary>
        public List<T2IBackendRequest> Requests = [];

        /// <summary>Set of backends that tried to satisfy this request but failed.</summary>
        public HashSet<int> BadBackends = [];

        /// <summary>Async issue prevention lock.</summary>
        public LockObject Locker = new();

        /// <summary>Set of reasons backends failed to load.</summary>
        public HashSet<string> BackendFailReasons = [];

        /// <summary>Gets a loose heuristic for model order preference - sort by earliest requester, but higher count of requests is worth 10 seconds.</summary>
        public long Heuristic(long timeRel) => Count * 10 + ((timeRel - TimeFirstRequest) / 1000); // TODO: 10 -> ?
    }

    /// <summary>Used by <see cref="GetNextT2IBackend(TimeSpan, T2IModel)"/> to determine which model to load onto a backend, heuristically.</summary>
    public ConcurrentDictionary<string, ModelRequestPressure> ModelRequests = new();

    /// <summary>Helper just for debug IDs for backend requests coming in.</summary>
    public static long BackendRequestsCounter = 0;

    /// <summary>List of functions that check a backend request, return true if TryFind may run, or false if this request must wait.</summary>
    public static List<Func<T2IBackendRequest, bool>> CanTryFindNow = [];

    /// <summary>Internal tracker of data related to a pending T2I Backend request.</summary>
    public class T2IBackendRequest
    {
        public BackendHandler Handler;

        public T2IModel Model;

        public Session Session;

        public long ID = Interlocked.Increment(ref BackendRequestsCounter);

        public Func<T2IBackendData, bool> Filter;

        public Action NotifyWillLoad;

        public long StartTime = Environment.TickCount64;

        public TimeSpan Waited => TimeSpan.FromMilliseconds(Environment.TickCount64 - StartTime);

        public ModelRequestPressure Pressure = null;

        public CancellationToken Cancel;

        public AsyncAutoResetEvent CompletedEvent = new(false);

        public T2IBackendAccess Result;

        public T2IParamInput UserInput;

        public Exception Failure;

        public Task<bool> WaitingOnScalingAttempt = null;

        public void ReleasePressure(bool failed)
        {
            if (Pressure is null)
            {
                return;
            }
            Pressure.Count--;
            if (Pressure.Count == 0)
            {
                Handler.ModelRequests.TryRemove(Pressure.Model.Name, out _);
            }
            Pressure = null;
            if (failed && UserInput is not null)
            {
                UserInput.RefusalReasons.Add("All backends failed to load model.");
            }
        }

        public void Complete()
        {
            Logs.Debug($"[BackendHandler] Backend request #{ID} finished.");
            Handler.T2IBackendRequests.TryRemove(ID, out _);
            ReleasePressure(false);
        }

        public void TryFind()
        {
            if (WaitingOnScalingAttempt is not null && !WaitingOnScalingAttempt.IsCompleted)
            {
                return;
            }
            foreach (Func<T2IBackendRequest, bool> func in CanTryFindNow)
            {
                if (!func(this))
                {
                    return;
                }
            }
            List<T2IBackendData> currentBackends = [.. Handler.EnumerateT2IBackends];
            List<T2IBackendData> possible = [.. currentBackends.Where(b => b.Backend.IsEnabled && !b.Backend.ShutDownReserve && b.Backend.Reservations == 0 && b.Backend.MaxUsages > 0 && b.Backend.Status == BackendStatus.RUNNING)];
            Logs.Verbose($"[BackendHandler] Backend request #{ID} searching for backend... have {possible.Count}/{currentBackends.Count} possible");
            if (!possible.Any())
            {
                if (!currentBackends.Any(b => b.Backend.Status == BackendStatus.LOADING || b.Backend.Status == BackendStatus.WAITING))
                {
                    if (WaitingOnScalingAttempt is null)
                    {
                        WaitingOnScalingAttempt = Handler.TryToScaleANewBackend(false);
                    }
                    else
                    {
                        Logs.Verbose($"[BackendHandler] count notEnabled = {currentBackends.Count(b => !b.Backend.IsEnabled)}, shutDownReserve = {currentBackends.Count(b => b.Backend.ShutDownReserve)}, directReserved = {currentBackends.Count(b => b.Backend.Reservations > 0)}, statusNotRunning = {currentBackends.Count(b => b.Backend.Status != BackendStatus.RUNNING)}");
                        Logs.Warning("[BackendHandler] No backends are available! Cannot generate anything.");
                        Failure = new SwarmUserErrorException("No backends available!");
                    }
                }
                return;
            }
            possible = Filter is null ? possible : [.. possible.Where(Filter)];
            if (!possible.Any())
            {
                string reason = "";
                if (UserInput is not null && UserInput.RefusalReasons.Any())
                {
                    reason = $" Backends refused for the following reason(s):\n{UserInput.RefusalReasons.Select(r => $"- {r}").JoinString("\n")}";
                }
                if (WaitingOnScalingAttempt is null)
                {
                    WaitingOnScalingAttempt = Handler.TryToScaleANewBackend(true);
                }
                else
                {
                    Logs.Warning($"[BackendHandler] No backends match the request! Cannot generate anything.{reason}");
                    Failure = new SwarmUserErrorException($"No backends match the settings of the request given!{reason}");
                }
                return;
            }
            List<T2IBackendData> available = [.. possible.Where(b => !b.CheckIsInUse).OrderBy(b => b.Usages)];
            if (Logs.MinimumLevel <= Logs.LogLevel.Verbose)
            {
                Logs.Verbose($"Possible: {possible.Select(b => $"{b.ID}/{b.BackType.Name}").JoinString(", ")}, available {available.Select(b => $"{b.ID}/{b.BackType.Name}").JoinString(", ")}");
            }
            T2IBackendData firstAvail = available.FirstOrDefault();
            if (Model is null && firstAvail is not null)
            {
                Logs.Debug($"[BackendHandler] Backend request #{ID} will claim #{firstAvail.ID}");
                Result = new T2IBackendAccess(firstAvail);
                return;
            }
            if (Model is not null)
            {
                List<T2IBackendData> correctModel = [.. available.Where(b => b.Backend.CurrentModelName == Model.Name)];
                if (correctModel.Any())
                {
                    T2IBackendData backend = correctModel.FirstOrDefault();
                    Logs.Debug($"[BackendHandler] Backend request #{ID} found correct model on #{backend.ID}");
                    Result = new T2IBackendAccess(backend);
                    return;
                }
            }
            if (Pressure is null && Model is not null)
            {
                Logs.Verbose($"[BackendHandler] Backend request #{ID} is creating pressure for model {Model.Name}...");
                Pressure = Handler.ModelRequests.GetOrCreate(Model.Name, () => new() { Model = Model });
                lock (Pressure.Locker)
                {
                    Pressure.Count++;
                    if (Session is not null)
                    {
                        Pressure.Sessions.Add(Session);
                    }
                    Pressure.Requests.Add(this);
                }
            }
            Handler.LoadHighestPressureNow(possible, available, () => ReleasePressure(true), Pressure, Cancel);
            if (Pressure is not null && Pressure.IsLoading && NotifyWillLoad is not null)
            {
                NotifyWillLoad();
                NotifyWillLoad = null;
            }
        }
    }

    /// <summary>All currently tracked T2I backend requests.</summary>
    public ConcurrentDictionary<long, T2IBackendRequest> T2IBackendRequests = new();

    /// <summary>Number of currently waiting backend requests.</summary>
    public int QueuedRequests => T2IBackendRequests.Count + RunningBackendsOfType<AbstractT2IBackend>().Sum(b => b.BackendData.Usages);

    /// <summary>(Blocking) gets the next available Text2Image backend.</summary>
    /// <returns>A 'using'-compatible wrapper for a backend.</returns>
    /// <param name="maxWait">Maximum duration to wait for. If time runs out, throws <see cref="TimeoutException"/>.</param>
    /// <param name="model">The model to use, or null for any. Specifying a model directly will prefer a backend with that model loaded, or cause a backend to load it if not available.</param>
    /// <param name="input">User input, if any.</param>
    /// <param name="filter">Optional genericfilter for backend acceptance.</param>
    /// <param name="session">The session responsible for this request, if any.</param>
    /// <param name="notifyWillLoad">Optional callback for when this request will trigger a model load.</param>
    /// <param name="cancel">Optional request cancellation.</param>
    /// <exception cref="TimeoutException">Thrown if <paramref name="maxWait"/> is reached.</exception>
    /// <exception cref="SwarmReadableErrorException">Thrown if no backends are available.</exception>
    public async Task<T2IBackendAccess> GetNextT2IBackend(TimeSpan maxWait, T2IModel model = null, T2IParamInput input = null, Func<T2IBackendData, bool> filter = null, Session session = null, Action notifyWillLoad = null, CancellationToken cancel = default)
    {
        if (HasShutdown)
        {
            throw new SwarmReadableErrorException("Backend handler is shutting down.");
        }
        T2IBackendRequest request = new()
        {
            Handler = this,
            Model = model,
            UserInput = input,
            Filter = filter,
            Session = session,
            NotifyWillLoad = notifyWillLoad,
            Cancel = cancel
        };
        T2IBackendRequests[request.ID] = request;
        CheckBackendsSignal.Set();
        try
        {
            Logs.Debug($"[BackendHandler] Backend request #{request.ID} for model {model?.Name ?? "any"}, maxWait={maxWait}.");
            if (!request.Cancel.CanBeCanceled)
            {
                request.Cancel = Program.GlobalProgramCancel;
            }
            await request.CompletedEvent.WaitAsync(maxWait, request.Cancel);
            if (request.Result is not null)
            {
                return request.Result;
            }
            else if (request.Failure is not null)
            {
                while (request.Failure is AggregateException ae && ae.InnerException is not null)
                {
                    request.Failure = ae.InnerException;
                }
                Logs.Error($"[BackendHandler] Backend request #{request.ID} failed: {request.Failure.ReadableString()}");
                throw request.Failure;
            }
            if (request.Cancel.IsCancellationRequested || Program.GlobalProgramCancel.IsCancellationRequested)
            {
                return null;
            }
            string modelData = model is null ? "No model requested." : $"Requested model {model.Name}, which is loaded on {EnumerateT2IBackends.Count(b => b.Backend.CurrentModelName == model.Name)} backends.";
            Logs.Info($"[BackendHandler] Backend usage timeout, all backends occupied, giving up after {request.Waited.TotalSeconds} seconds ({modelData}).");
            throw new TimeoutException();
        }
        finally
        {
            request.Complete();
        }
    }

    public static bool MonitorTimes = false;

    public static Utilities.ChunkedTimer BackendQueueTimer = new();

    /// <summary>Primary internal loop thread to handles tracking of backend requests.</summary>
    public void RequestHandlingLoop()
    {
        Logs.Init("Backend request handler loop ready...");
        long lastUpdate = Environment.TickCount64;
        static void mark(string part)
        {
            if (MonitorTimes)
            {
                BackendQueueTimer.Mark(part);
            }
        }
        bool wasNone = true;
        while (true)
        {
            if (MonitorTimes)
            {
                BackendQueueTimer.Reset();
            }
            if (HasShutdown || Program.GlobalProgramCancel.IsCancellationRequested)
            {
                Logs.Info("Backend request handler loop closing...");
                foreach (T2IBackendRequest request in T2IBackendRequests.Values.ToArray())
                {
                    request.CompletedEvent.Set();
                }
                return;
            }
            try
            {
                bool anyMoved = false;
                mark("Start");
                foreach (T2IBackendRequest request in T2IBackendRequests.Values.ToArray())
                {
                    if (request.Cancel.IsCancellationRequested)
                    {
                        T2IBackendRequests.TryRemove(request.ID, out _);
                        anyMoved = true;
                        request.CompletedEvent.Set();
                        continue;
                    }
                    if (wasNone)
                    {
                        wasNone = false;
                        Program.TickIsGeneratingEvent?.Invoke();
                    }
                    try
                    {
                        request.TryFind();
                    }
                    catch (Exception ex)
                    {
                        while (ex is AggregateException ae && ae.InnerException is not null)
                        {
                            ex = ae.InnerException;
                        }
                        request.Failure = ex;
                        Logs.Error($"[BackendHandler] Backend request #{request.ID} failed: {ex.ReadableString()}");
                    }
                    if (request.Result is not null || request.Failure is not null)
                    {
                        T2IBackendRequests.TryRemove(request.ID, out _);
                        anyMoved = true;
                        request.CompletedEvent.Set();
                        lastUpdate = Environment.TickCount64;
                    }
                }
                mark("PostLoop");
                bool empty = T2IBackendRequests.IsEmpty();
                if (empty)
                {
                    lastUpdate = Environment.TickCount64;
                }
                else if (Environment.TickCount64 - lastUpdate > Program.ServerSettings.Backends.MaxTimeoutMinutes * 60 * 1000)
                {
                    Logs.Error($"[BackendHandler] {T2IBackendRequests.Count} requests stuck waiting due to backend timeout failure. Server backends are failing to respond. Will aggressively force restart.");
                    lastUpdate = Environment.TickCount64;
                    if (Program.ServerSettings.Backends.ForceRestartOnTimeout)
                    {
                        List<T2IBackendData> backends = [.. EnumerateT2IBackends];
                        List<Task> tasks = [];
                        foreach (T2IBackendData backend in backends)
                        {
                            tasks.Add(backend.Backend.DoShutdownNow());
                        }
                        Task.WhenAll(tasks).Wait(Program.GlobalProgramCancel);
                        foreach (T2IBackendData backend in backends)
                        {
                            DoInitBackend(backend);
                        }
                    }
                    else
                    {
                        Logs.Error($"[BackendHandler] {T2IBackendRequests.Count} requests denied due to backend timeout failure. Server backends are failing to respond.");
                        foreach (T2IBackendRequest request in T2IBackendRequests.Values.ToArray())
                        {
                            request.Failure = new TimeoutException($"No backend has responded in {Program.ServerSettings.Backends.MaxTimeoutMinutes} minutes.");
                            anyMoved = true;
                            request.CompletedEvent.Set();
                        }
                    }
                }
                mark("PostComplete");
                if (empty && !AllBackends.Any(b => b.Value.CheckIsInUseAtAll))
                {
                    wasNone = true;
                    Program.TickNoGenerationsEvent?.Invoke();
                }
                if (empty || !anyMoved)
                {
                    CheckBackendsSignal.WaitAsync(TimeSpan.FromSeconds(1), Program.GlobalProgramCancel).Wait();
                }
                if (MonitorTimes)
                {
                    mark("PostSignal");
                    BackendQueueTimer.Debug($"anyMoved={anyMoved}, empty={empty}");
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"Backend handler loop error: {ex.ReadableString()}");
                if (Program.GlobalProgramCancel.IsCancellationRequested)
                {
                    Task.Delay(500).Wait();
                }
                else
                {
                    Task.Delay(2000, Program.GlobalProgramCancel).Wait(); // Delay a bit to be safe in case of repeating errors.
                }
            }
        }
    }

    /// <summary>Internal helper route for <see cref="GetNextT2IBackend"/> to trigger a backend model load.</summary>
    public void LoadHighestPressureNow(List<T2IBackendData> possible, List<T2IBackendData> available, Action releasePressure, ModelRequestPressure pressure, CancellationToken cancel)
    {
        List<T2IBackendData> availableLoaders = [.. available.Where(b => b.Backend.CanLoadModels && b.Backend.MaxUsages > 0)];
        if (availableLoaders.IsEmpty())
        {
            if (pressure?.IsLoading ?? false)
            {
                Logs.Verbose($"[BackendHandler] A backend is currently loading the model.");
            }
            else
            {
                Logs.Verbose($"[BackendHandler] No current backends are able to load models.");
                Utilities.RunCheckedTask(() => TryToScaleANewBackend(false));
            }
            return;
        }
        Logs.Verbose($"[BackendHandler] Will load highest pressure model...");
        long timeRel = Environment.TickCount64;
        List<ModelRequestPressure> pressures = [.. ModelRequests.Values.Where(p => !p.IsLoading).OrderByDescending(p => p.Heuristic(timeRel))];
        if (pressures.IsEmpty())
        {
            Logs.Verbose($"[BackendHandler] No model requests, skipping load.");
            return;
        }
        pressures = [.. pressures.Where(p => p.Requests.Any(r => r.Filter is null || availableLoaders.Any(b => r.Filter(b))))];
        if (pressures.IsEmpty())
        {
            Logs.Verbose($"[BackendHandler] Unable to find valid model requests that are matched to the current backend list.");
            return;
        }
        List<ModelRequestPressure> perfect = [.. pressures.Where(p => p.Requests.All(r => r.Filter is null || availableLoaders.Any(b => r.Filter(b))))];
        if (!perfect.IsEmpty())
        {
            pressures = perfect;
        }
        ModelRequestPressure highestPressure = pressures.FirstOrDefault();
        if (highestPressure is not null)
        {
            lock (highestPressure.Locker)
            {
                if (highestPressure.IsLoading) // Another thread already got here, let it take control.
                {
                    Logs.Verbose($"[BackendHandler] Cancelling highest-pressure load, another thread is handling it.");
                    return;
                }
                long timeWait = timeRel - highestPressure.TimeFirstRequest;
                if (availableLoaders.Count == 1 || timeWait > 1500)
                {
                    Logs.Verbose($"Selecting backends outside of refusal set: {highestPressure.BadBackends.JoinString(", ")}");
                    List<T2IBackendData> valid = [.. availableLoaders.Where(b => !highestPressure.BadBackends.Contains(b.ID))];
                    if (valid.IsEmpty())
                    {
                        Logs.Warning($"[BackendHandler] All backends failed to load the model '{highestPressure.Model.RawFilePath}'! Cannot generate anything.");
                        releasePressure();
                        string fixReason(string reason)
                        {
                            if (reason.Contains("ERROR: Could not detect model type of:"))
                            {
                                if (highestPressure.Model.IsDiffusionModelsFormat)
                                {
                                    reason += "\n\nThis may mean that the model is in the diffusion_models folder, but needs to be in the Stable-Diffusion folder";
                                }
                                else
                                {
                                    reason += "\n\nThis may mean that the model is in the Stable-Diffusion folder, but needs to be in the diffusion_models folder";
                                }
                            }
                            return $"Possible reason: {reason}";
                        }
                        throw new SwarmReadableErrorException($"All available backends failed to load the model '{highestPressure.Model.RawFilePath}'.\n\n{highestPressure.BackendFailReasons.Select(fixReason).JoinString("\n\n").Trim()}");
                    }
                    valid = [.. valid.Where(b => b.Backend.CurrentModelName != highestPressure.Model.Name)];
                    if (valid.IsEmpty())
                    {
                        Logs.Verbose("$[BackendHandler] Cancelling highest-pressure load, model is already loaded on all available backends.");
                        return;
                    }
                    List<T2IBackendData> unused = [.. valid.Where(a => a.Usages == 0)];
                    valid = unused.Any() ? unused : valid;
                    string orderMode = Program.ServerSettings.Backends.ModelLoadOrderPreference;
                    T2IBackendData availableBackend;
                    if (orderMode == "last_used")
                    {
                        availableBackend = valid.MinBy(a => a.TimeLastRelease);
                    }
                    else if (orderMode == "first_free")
                    {
                        availableBackend = valid.First();
                    }
                    else
                    {
                        throw new SwarmReadableErrorException($"Invalid server setting for ModelLoadOrderPreference: '{orderMode}' unrecognized");
                    }
                    Logs.Debug($"[BackendHandler] backend #{availableBackend.ID} will load a model: {highestPressure.Model.RawFilePath}, with {highestPressure.Count} requests waiting for {timeWait / 1000f:0.#} seconds");
                    highestPressure.IsLoading = true;
                    List<Session.GenClaim> claims = [];
                    foreach (Session sess in highestPressure.Sessions)
                    {
                        claims.Add(sess.Claim(0, 1, 0, 0));
                    }
                    Task.Factory.StartNew(() =>
                    {
                        try
                        {
                            availableBackend.ReserveModelLoad = true;
                            int ticks = 0;
                            while (availableBackend.CheckIsInUseNoModelReserve && availableBackend.Backend.MaxUsages > 0)
                            {
                                if (Program.GlobalProgramCancel.IsCancellationRequested)
                                {
                                    return;
                                }
                                if (ticks++ % 5 == 0)
                                {
                                    Logs.Debug($"[BackendHandler] model loader is waiting for backend #{availableBackend.ID} to be released from use ({availableBackend.Usages}/{availableBackend.Backend.MaxUsages})...");
                                }
                                Thread.Sleep(100);
                            }
                            Utilities.CleanRAM();
                            if (highestPressure.Model.Name.ToLowerFast() == "(none)")
                            {
                                availableBackend.Backend.CurrentModelName = highestPressure.Model.Name;
                            }
                            else
                            {
                                availableBackend.Backend.LoadModel(highestPressure.Model, highestPressure.Requests.FirstOrDefault()?.UserInput).Wait(cancel);
                            }
                            Logs.Debug($"[BackendHandler] backend #{availableBackend.ID} loaded model, returning to pool");
                        }
                        catch (Exception ex)
                        {
                            while (ex is AggregateException ae && ae.InnerException is not null)
                            {
                                ex = ae.InnerException;
                            }
                            Logs.Error($"[BackendHandler] backend #{availableBackend.ID} failed to load model with error: {ex.ReadableString()}");
                            lock (highestPressure.Locker)
                            {
                                highestPressure.BackendFailReasons.Add(ex.ReadableString());
                            }
                        }
                        finally
                        {
                            availableBackend.ReserveModelLoad = false;
                            if (availableBackend.Backend.CurrentModelName != highestPressure.Model.Name)
                            {
                                Logs.Warning($"[BackendHandler] backend #{availableBackend.ID} failed to load model {highestPressure.Model.Name}");
                                lock (highestPressure.Locker)
                                {
                                    highestPressure.BadBackends.Add(availableBackend.ID);
                                    Logs.Debug($"Will deny backends: {highestPressure.BadBackends.JoinString(", ")}");
                                }
                            }
                            highestPressure.IsLoading = false;
                            foreach (Session.GenClaim claim in claims)
                            {
                                claim.Dispose();
                            }
                        }
                        ReassignLoadedModelsList();
                    }, cancel);
                }
                else
                {
                    Logs.Verbose($"[BackendHandler] Nothing to load onto right now, pressure is too new.");
                }
            }
        }
    }
}

/// <summary>Mini-helper to track a backend accessor's status and release the access claim when done.</summary>
public class T2IBackendAccess : IDisposable
{
    /// <summary>The data for the backend that's claimed.</summary>
    public BackendHandler.T2IBackendData Data;

    public T2IBackendAccess(BackendHandler.T2IBackendData _data)
    {
        Data = _data;
        Data.Claim();
    }

    /// <summary>The backend that's claimed.</summary>
    public AbstractT2IBackend Backend => Data.Backend;

    private bool IsDisposed = false;

    public void Dispose()
    {
        if (!IsDisposed)
        {
            IsDisposed = true;
            Data.UpdateLastReleaseTime();
            Interlocked.Decrement(ref Data.Usages);
            Backend.Handler.CheckBackendsSignal.Set();
            GC.SuppressFinalize(this);
        }
    }
}
