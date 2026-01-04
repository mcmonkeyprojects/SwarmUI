using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Utils;

namespace SwarmUI.WebAPI;

[API.APIClass("API routes to manage the server's backends.")]
public class BackendAPI
{
    public static void Register()
    {
        API.RegisterAPICall(ListBackendTypes, false, Permissions.ViewBackendsList);
        API.RegisterAPICall(ListBackends, false, Permissions.ViewBackendsList);
        API.RegisterAPICall(DeleteBackend, true, Permissions.AddRemoveBackends);
        API.RegisterAPICall(ToggleBackend, true, Permissions.ToggleBackends);
        API.RegisterAPICall(EditBackend, true, Permissions.EditBackends);
        API.RegisterAPICall(AddNewBackend, true, Permissions.AddRemoveBackends);
        API.RegisterAPICall(RestartBackends, true, Permissions.RestartBackends);
        API.RegisterAPICall(FreeBackendMemory, true, Permissions.ControlMemClean);
    }

    [API.APIDescription("Returns of a list of all available backend types.",
        """
            "list":
            [
                "id": "idhere",
                "name": "namehere",
                "description": "descriptionhere",
                "settings":
                [
                    {
                        "name": "namehere",
                        "type": "typehere",
                        "description": "descriptionhere",
                        "placeholder": "placeholderhere",
                        "values": ["a", "b"], // For dropdowns only
                        "value_names": ["Alpha", "Beta"] // For dropdowns only, optional even then
                    }
                ],
                "is_standard": false
            ]
        """)]
    public static async Task<JObject> ListBackendTypes(Session session)
    {
        return new() { ["list"] = JToken.FromObject(Program.Backends.BackendTypes.Values.Select(b => b.NetDescription).ToList()) };
    }

    /// <summary>Create a network object to represent a backend cleanly.</summary>
    public static JObject BackendToNet(BackendHandler.BackendData backend, bool full = false)
    {
        long timeLastRelease = backend.TimeLastRelease;
        long timeSinceUsed = timeLastRelease == 0 ? 0 : (Environment.TickCount64 - timeLastRelease) / 1000;
        JObject data = new()
        {
            ["type"] = backend.AbstractBackend.HandlerTypeData.ID,
            ["status"] = backend.AbstractBackend.Status.ToString().ToLowerFast(),
            ["id"] = backend.ID,
            ["settings"] = JToken.FromObject(backend.AbstractBackend.SettingsRaw.SaveAllWithoutSecretValues("\t<secret>", "").ToSimple()),
            ["modcount"] = backend.ModCount,
            ["features"] = new JArray(backend.AbstractBackend.SupportedFeatures.ToArray()),
            ["enabled"] = backend.AbstractBackend.IsEnabled,
            ["title"] = backend.AbstractBackend.Title,
            ["max_usages"] = backend.AbstractBackend.MaxUsages,
            ["seconds_since_used"] = timeSinceUsed,
            ["time_since_used"] = timeLastRelease == 0 ? "Never" : TimeSpan.FromSeconds(-timeSinceUsed).SimpleFormat(true, false)
        };
        if (backend is BackendHandler.T2IBackendData t2i)
        {
            data["can_load_models"] = t2i.Backend.CanLoadModels;
            if (full)
            {
                data["current_model"] = t2i.Backend.CurrentModelName;
            }
        }
        return data;
    }

    [API.APIDescription("Shuts down and deletes a registered backend by ID.",
        """
            "result": "Deleted."
            // OR
            "result": "Already didn't exist."
        """)]
    public static async Task<JObject> DeleteBackend(Session session,
        [API.APIParameter("ID of the backend to delete.")] int backend_id)
    {
        Logs.Warning($"User {session.User.UserID} requested delete of backend {backend_id}.");
        if (Program.LockSettings)
        {
            return new() { ["error"] = "Settings are locked." };
        }
        if (await Program.Backends.DeleteById(backend_id))
        {
            return new JObject() { ["result"] = "Deleted." };
        }
        return new JObject() { ["result"] = "Already didn't exist." };
    }

    [API.APIDescription("Disables or re-enables a backend by ID.",
        """
            "result": "Success."
            // OR
            "result": "No change."
        """)]
    public static async Task<JObject> ToggleBackend(Session session,
        [API.APIParameter("ID of the backend to toggle.")] int backend_id,
        [API.APIParameter("If true, backend should be enabled. If false, backend should be disabled.")] bool enabled)
    {
        Logs.Warning($"User {session.User.UserID} requested toggle of backend {backend_id}, enabled={enabled}.");
        if (Program.LockSettings)
        {
            return new() { ["error"] = "Settings are locked." };
        }
        if (!Program.Backends.AllBackends.TryGetValue(backend_id, out BackendHandler.BackendData backend))
        {
            return new() { ["error"] = $"Invalid backend ID {backend_id}" };
        }
        if (backend.AbstractBackend.IsEnabled == enabled)
        {
            return new JObject() { ["result"] = "No change." };
        }
        backend.AbstractBackend.IsEnabled = enabled;
        backend.AbstractBackend.ShutDownReserve = true;
        Program.Backends.BackendsEdited = true;
        while (backend.CheckIsInUse && backend.AbstractBackend.MaxUsages > 0)
        {
            if (Program.GlobalProgramCancel.IsCancellationRequested)
            {
                return null;
            }
            await Task.Delay(TimeSpan.FromSeconds(0.5));
        }
        if (backend.AbstractBackend.Status != BackendStatus.DISABLED && backend.AbstractBackend.Status != BackendStatus.ERRORED)
        {
            await backend.AbstractBackend.DoShutdownNow();
        }
        if (enabled)
        {
            backend.AbstractBackend.Status = BackendStatus.WAITING;
            Program.Backends.BackendsToInit.Enqueue(backend);
        }
        backend.AbstractBackend.ShutDownReserve = false;
        return new JObject() { ["result"] = "Success." };
    }

    [API.APIDescription("Modify and re-init an already registered backend.",
        """
            "id": "idhere",
            "type": "typehere",
            "status": "statushere",
            "settings":
            {
                "namehere": valuehere
            },
            "modcount": 0,
            "features": [ "featureidhere", ... ],
            "enabled": true,
            "title": "titlehere",
            "can_load_models": true,
            "max_usages": 0
        """)]
    public static async Task<JObject> EditBackend(Session session,
        [API.APIParameter("ID of the backend to edit.")] int backend_id,
        [API.APIParameter("New title of the backend.")] string title,
        [API.APIParameter(" Input should contain a map of `\"settingname\": value`.")] JObject raw_inp,
        [API.APIParameter("Optional new ID to change the backend to.")] int new_id = -1)
    {
        Logs.Warning($"User {session.User.UserID} requested edit of backend {backend_id}.");
        if (Program.LockSettings)
        {
            return new() { ["error"] = "Settings are locked." };
        }
        if (!raw_inp.TryGetValue("settings", out JToken jval) || jval is not JObject settings)
        {
            return new() { ["error"] = "Missing settings." };
        }
        if (new_id == backend_id)
        {
            new_id = -1;
        }
        if (new_id >= 0 && Program.Backends.AllBackends.ContainsKey(new_id))
        {
            return new() { ["error"] = $"Backend ID {new_id} is already in use." };
        }
        FDSSection parsed = FDSSection.FromSimple(settings.ToBasicObject());
        Logs.Verbose($"New settings to apply: {parsed}");
        BackendHandler.BackendData result = await Program.Backends.EditById(backend_id, parsed, title, new_id);
        if (result is null)
        {
            return new() { ["error"] = $"Invalid backend ID {backend_id}" };
        }
        return BackendToNet(result);
    }

    [API.APIDescription("Returns a list of currently registered backends.",
        """
            "idhere":
            {
                "id": "idhere",
                "type": "typehere",
                "status": "statushere",
                "settings":
                {
                    "namehere": valuehere
                },
                "modcount": 0,
                "features": [ "featureidhere", ... ],
                "enabled": true,
                "title": "titlehere",
                "can_load_models": true,
                "max_usages": 0,
                "current_model": "modelnamehere" // Only if `full_data` is true
            }
        """)]
    public static async Task<JObject> ListBackends(Session session,
        [API.APIParameter("If true, include 'nonreal' backends (ones that were spawned temporarily/internally).")] bool nonreal = false,
        [API.APIParameter("If true, include nonessential data about backends (eg what model is currently loaded).")] bool full_data = false)
    {
        JObject toRet = [];
        foreach (BackendHandler.BackendData data in Program.Backends.AllBackends.Values.OrderBy(d => d.ID))
        {
            if (!data.AbstractBackend.IsReal && !nonreal)
            {
                continue;
            }
            toRet[data.ID.ToString()] = BackendToNet(data, full_data);
        }
        return toRet;
    }

    [API.APIDescription("Add a new backend of the specified type.",
        """
            "id": "idhere",
            "type": "typehere",
            "status": "statushere",
            "settings":
            {
                "namehere": valuehere
            },
            "modcount": 0,
            "features": [ "featureidhere", ... ],
            "enabled": true,
            "title": "titlehere",
            "can_load_models": true,
            "max_usages": 0
        """)]
    public static async Task<JObject> AddNewBackend(Session session,
        [API.APIParameter("ID of what type of backend to add (see `ListBackendTypes`).")] string type_id)
    {
        Logs.Warning($"User {session.User.UserID} requested add-new-backend of type {type_id}.");
        if (Program.LockSettings)
        {
            return new() { ["error"] = "Settings are locked." };
        }
        if (!Program.Backends.BackendTypes.TryGetValue(type_id, out BackendHandler.BackendType type))
        {
            return new() { ["error"] = $"Invalid backend type: {type_id}" };
        }
        BackendHandler.BackendData data = Program.Backends.AddNewOfType(type);
        return BackendToNet(data);
    }

    [API.APIDescription("Restart all backends or a specific one.",
        """
            "result": "Success.",
            "count": 1 // Number of backends restarted
        """)]
    public static async Task<JObject> RestartBackends(Session session,
        [API.APIParameter("What backend ID to restart, or `all` for all.")] string backend = "all")
    {
        Logs.Warning($"User {session.User.UserID} requested restart of backend {backend}.");
        if (Program.LockSettings)
        {
            return new() { ["error"] = "Settings are locked." };
        }
        int count = 0;
        foreach (BackendHandler.BackendData data in Program.Backends.AllBackends.Values)
        {
            if (backend != "all" && backend != $"{data.ID}")
            {
                continue;
            }
            if (data.AbstractBackend.Status == BackendStatus.RUNNING || data.AbstractBackend.Status == BackendStatus.ERRORED)
            {
                await Program.Backends.ShutdownBackendCleanly(data);
                Program.Backends.DoInitBackend(data);
                count++;
            }
        }
        return new JObject() { ["result"] = "Success.", ["count"] = count };
    }

    [API.APIDescription("Free memory from all backends or a specific one.",
        """
            "result": true,
            "count": 1 // Number of backends memory was freed from
        """)]
    public static async Task<JObject> FreeBackendMemory(Session session,
        [API.APIParameter("If true, system RAM should be cleared too. If false, only VRAM should be cleared.")] bool system_ram = false,
        [API.APIParameter("What backend ID to restart, or `all` for all.")] string backend = "all")
    {
        if (system_ram)
        {
            Session.RecentlyBlockedFilenames.Clear();
        }
        List<Task<bool>> tasks = [];
        foreach (AbstractBackend target in Program.Backends.RunningBackendsOfType<AbstractBackend>())
        {
            if (backend != "all" && backend != $"{target.AbstractBackendData.ID}")
            {
                continue;
            }
            tasks.Add(target.FreeMemory(system_ram));
        }
        if (tasks.IsEmpty())
        {
            return new JObject() { ["result"] = false, ["count"] = 0 };
        }
        await Task.WhenAll(tasks);
        Utilities.CleanRAM();
        return new JObject() { ["result"] = true, ["count"] = tasks.Where(t => t.Result).Count() };
    }
}
