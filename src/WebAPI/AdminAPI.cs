using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Hardware.Info;
using Microsoft.VisualBasic.FileIO;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.IO;
using System.Net.Http;
using System.Reflection;

namespace SwarmUI.WebAPI;

[API.APIClass("Administrative APIs related to server management.")]
public static class AdminAPI
{
    public static void Register()
    {
        API.RegisterAPICall(ListServerSettings, false, Permissions.ReadServerSettings);
        API.RegisterAPICall(ChangeServerSettings, true, Permissions.EditServerSettings);
        API.RegisterAPICall(ListLogTypes, false, Permissions.ViewLogs);
        API.RegisterAPICall(ListRecentLogMessages, false, Permissions.ViewLogs);
        API.RegisterAPICall(LogSubmitToPastebin, true, Permissions.ViewLogs);
        API.RegisterAPICall(ShutdownServer, true, Permissions.Shutdown);
        API.RegisterAPICall(GetServerResourceInfo, false, Permissions.ReadServerInfoPanels);
        API.RegisterAPICall(DebugLanguageAdd, true, Permissions.AdminDebug);
        API.RegisterAPICall(DebugGenDocs, true, Permissions.AdminDebug);
        API.RegisterAPICall(ListConnectedUsers, false, Permissions.ReadServerInfoPanels);
        API.RegisterAPICall(CheckForUpdates, false, Permissions.Restart);
        API.RegisterAPICall(UpdateAndRestart, true, Permissions.Restart);
        API.RegisterAPICall(InstallExtension, true, Permissions.ManageExtensions);
        API.RegisterAPICall(UpdateExtension, true, Permissions.ManageExtensions);
        API.RegisterAPICall(UninstallExtension, true, Permissions.ManageExtensions);
        API.RegisterAPICall(AdminListUsers, false, Permissions.ManageUsers);
        API.RegisterAPICall(AdminAddUser, true, Permissions.ManageUsers);
        API.RegisterAPICall(AdminSetUserPassword, true, Permissions.ManageUsers);
        API.RegisterAPICall(AdminChangeUserSettings, true, Permissions.ManageUsers);
        API.RegisterAPICall(AdminDeleteUser, true, Permissions.ManageUsers);
        API.RegisterAPICall(AdminGetUserInfo, false, Permissions.ManageUsers);
        API.RegisterAPICall(AdminListRoles, false, Permissions.ConfigureRoles);
        API.RegisterAPICall(AdminAddRole, true, Permissions.ConfigureRoles);
        API.RegisterAPICall(AdminEditRole, true, Permissions.ConfigureRoles);
        API.RegisterAPICall(AdminDeleteRole, true, Permissions.ConfigureRoles);
        API.RegisterAPICall(AdminListPermissions, false, Permissions.ConfigureRoles);
    }

    public static JObject AutoConfigToParamData(AutoConfiguration config, bool hideRestricted = false)
    {
        JObject output = [];
        foreach ((string key, AutoConfiguration.Internal.SingleFieldData data) in config.InternalData.SharedData.Fields)
        {
            bool isSecret = data.Field.GetCustomAttribute<ValueIsSecretAttribute>() is not null;
            string typeName = data.IsSection ? "group" : T2IParamTypes.SharpTypeToDataType(data.Field.FieldType, false).ToString();
            if (typeName is null || typeName == T2IParamDataType.UNSET.ToString())
            {
                throw new Exception($"[ServerSettings] Unknown type '{data.Field.FieldType}' for field '{data.Field.Name}'!");
            }
            object val = config.GetFieldValueOrDefault<object>(key);
            if (val is AutoConfiguration subConf)
            {
                val = AutoConfigToParamData(subConf);
            }
            if (data.Field.GetCustomAttribute<SettingHiddenAttribute>() is not null)
            {
                continue;
            }
            if (hideRestricted && data.Field.GetCustomAttribute<ValueIsRestrictedAttribute>() is not null)
            {
                continue;
            }
            string[] vals = data.Field.GetCustomAttribute<SettingsOptionsAttribute>()?.Options ?? null;
            string[] val_names = null;
            if (vals is not null)
            {
                typeName = typeName == "LIST" ? "LIST" : "DROPDOWN";
                val_names = data.Field.GetCustomAttribute<SettingsOptionsAttribute>()?.Names ?? null;
            }
            output[key] = new JObject()
            {
                ["type"] = typeName.ToLowerFast(),
                ["name"] = data.Name,
                ["value"] = isSecret ? "\t<secret>" : JToken.FromObject(val is List<string> list ? list.JoinString(" || ") : val),
                ["description"] = data.Field.GetCustomAttribute<AutoConfiguration.ConfigComment>()?.Comments ?? "",
                ["values"] = vals == null ? null : new JArray(vals),
                ["value_names"] = val_names == null ? null : new JArray(val_names),
                ["is_secret"] = isSecret
            };
        }
        return output;
    }

    public static object DataToType(JToken val, Type t)
    {
        if (t == typeof(int)) { return (int)val; }
        if (t == typeof(long)) { return (long)val; }
        if (t == typeof(double)) { return (double)val; }
        if (t == typeof(float)) { return (float)val; }
        if (t == typeof(bool)) { return (bool)val; }
        if (t == typeof(string)) { return (string)val; }
        if (t == typeof(List<string>))
        {
            if (val is JArray jarr)
            {
                return jarr.Select(v => (string)v).ToList();
            }
            return ((string)val).Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToList();
        }
        return null;
    }
    [API.APIDescription("Returns a list of the server settings, will full metadata.",
        """
            "settings": {
                "settingname": {
                    "type": "typehere",
                    "name": "namehere",
                    "value": somevaluehere,
                    "description": "sometext",
                    "values": [...] or null,
                    "value_names": [...] or null
                }
            }
        """)]
    public static async Task<JObject> ListServerSettings(Session session)
    {
        return new JObject() { ["settings"] = AutoConfigToParamData(Program.ServerSettings) };
    }

    [API.APIDescription("Changes server settings.", "\"success\": true")]
    public static async Task<JObject> ChangeServerSettings(Session session,
        [API.APIParameter("Dynamic input of `\"settingname\": valuehere`.")] JObject rawData)
    {
        FDSSection origPaths = Program.ServerSettings.Paths.Save(true);
        JObject settings = (JObject)rawData["settings"];
        List<string> changed = [];
        foreach ((string key, JToken val) in settings)
        {
            AutoConfiguration.Internal.SingleFieldData field = Program.ServerSettings.TryGetFieldInternalData(key, out _);
            if (field is null)
            {
                Logs.Error($"User '{session.User.UserID}' tried to set unknown server setting '{key}' to '{val}'.");
                continue;
            }
            if (field.Field.GetCustomAttribute<SettingHiddenAttribute>() is not null)
            {
                Logs.Error($"User '{session.User.UserID}' tried to set server setting '{key}' of type '{field.Field.FieldType.Name}' to '{val}', but that setting is marked as hidden from the normal interface.");
                continue;
            }
            bool isSecret = field.Field.GetCustomAttribute<ValueIsSecretAttribute>() is not null;
            object obj = DataToType(val, field.Field.FieldType);
            if (obj is null)
            {
                Logs.Error($"User '{session.User.UserID}' tried to set server setting '{key}' of type '{field.Field.FieldType.Name}' to '{val}', but type-conversion failed.");
                continue;
            }
            if (isSecret && obj is string str && str == "\t<secret>")
            {
                continue;
            }
            if (key.ToLowerFast() == "authorization.authorizationrequired" && $"{obj}".ToLowerFast() == "true" && session.User.Data.PasswordHashed == "")
            {
                return new JObject() { ["error"] = "Tried to enable authorization mode, but your account does not have a password. Configure your account login information before enabling authorization, so you don't get locked out." };
            }
            Program.ServerSettings.TrySetFieldValue(key, obj);
            changed.Add(key);
        }
        Logs.Warning($"User {session.User.UserID} changed server settings: {changed.JoinString(", ")}");
        Program.SaveSettingsFile();
        if (settings.Properties().Any(p => p.Name.StartsWith("paths.") || p.Name.StartsWith("performance.allowgpuspecific")))
        {
            string[] paths =
            [
                Program.ServerSettings.Paths.SDModelFolder, Program.ServerSettings.Paths.SDVAEFolder,
                Program.ServerSettings.Paths.SDLoraFolder, Program.ServerSettings.Paths.SDControlNetsFolder,
                Program.ServerSettings.Paths.SDClipVisionFolder
            ];
            try
            {
                foreach (string path in paths)
                {
                    foreach (string subpath in path.Split(';').Where(p => !string.IsNullOrWhiteSpace(p)))
                    {
                        Directory.CreateDirectory(Utilities.CombinePathWithAbsolute(Program.ServerSettings.Paths.ActualModelRoot, subpath));
                    }
                }
            }
            catch (Exception e)
            {
                Logs.Error($"Failed to create one or more directories: {e.Message}");
                Program.ServerSettings.Paths.Load(origPaths);
                Program.SaveSettingsFile();
                return new JObject() { ["error"] = "Model paths settings are invalid, rejected change." };
            }
            Program.BuildModelLists();
            Program.RefreshAllModelSets();
            Program.ModelPathsChangedEvent?.Invoke();
        }
        Program.ReapplySettings();
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Returns a list of the available log types.",
        """
            "types_available": [
                {
                    "name": "namehere",
                    "color": "#RRGGBB",
                    "identifier": "identifierhere"
                }
            ]
        """)]
    public static async Task<JObject> ListLogTypes(Session session)
    {
        JArray types = [];
        lock (Logs.OtherTrackers)
        {
            foreach ((string name, Logs.LogTracker tracker) in Logs.OtherTrackers)
            {
                types.Add(new JObject()
                {
                    ["name"] = name,
                    ["color"] = tracker.Color,
                    ["identifier"] = tracker.Identifier
                });
            }
        }
        return new JObject() { ["types_available"] = types };
    }

    [API.APIDescription("Returns a list of recent server log messages.",
        """
          "last_sequence_id": 123,
          "data": {
                "info": [
                    {
                        "sequence_id": 123,
                        "timestamp": "yyyy-MM-dd HH:mm:ss.fff",
                        "message": "messagehere"
                    }, ...
                ]
            }
        """)]
    public static async Task<JObject> ListRecentLogMessages(Session session,
        [API.APIParameter("Use eg `\"types\": [\"info\"]` to specify what log types to include.\nOptionally input `\"last_sequence_ids\": { \"info\": 123 }` to set the start point.")] JObject raw)
    {
        JObject result = await ListLogTypes(session);
        long lastSeq = Interlocked.Read(ref Logs.LogTracker.LastSequenceID);
        result["last_sequence_id"] = lastSeq;
        JObject messageData = [];
        List<string> types = [.. raw["types"].Select(v => $"{v}")];
        foreach (string type in types)
        {
            Logs.LogTracker tracker;
            lock (Logs.OtherTrackers)
            {
                if (!Logs.OtherTrackers.TryGetValue(type, out tracker))
                {
                    continue;
                }
            }
            JArray messages = [];
            messageData[type] = messages;
            long lastSeqId = -1;
            if ((raw["last_sequence_ids"] as JObject).TryGetValue(type, out JToken lastSeqIdToken))
            {
                lastSeqId = lastSeqIdToken.Value<long>();
            }
            if (tracker.LastSeq < lastSeqId)
            {
                continue;
            }
            lock (tracker.Lock)
            {
                foreach (Logs.LogMessage message in tracker.Messages)
                {
                    if (message.Sequence <= lastSeqId)
                    {
                        continue;
                    }
                    messages.Add(new JObject()
                    {
                        ["sequence_id"] = message.Sequence,
                        ["time"] = $"{message.Time:yyyy-MM-dd HH:mm:ss.fff}",
                        ["message"] = message.Message
                    });
                }
            }
        }
        result["data"] = messageData;
        return result;
    }

    [API.APIDescription("Submits current server log info to a pastebin service automatically.",
        """
          "url": "a url to the paste here"
        """)]
    public static async Task<JObject> LogSubmitToPastebin(Session session,
        [API.APIParameter("The minimum log level (verbose, debug, info) to include.")] string type)
    {
        if (!Enum.TryParse(type, true, out Logs.LogLevel level))
        {
            return new JObject() { ["error"] = "Invalid log level type specified." };
        }
        Logs.Info($"User {session.User.UserID} is submitted logs above level {level} to pastebin...");
        List<(Logs.LogLevel, Logs.LogMessage)> messages = [];
        for (int i = (int)level; i < Logs.Trackers.Length; i++)
        {
            messages.AddRange(Logs.Trackers[i].Messages.Select(m => ((Logs.LogLevel)i, m)));
        }
        messages.Sort((m1, m2) => m1.Item2.Sequence.CompareTo(m2.Item2.Sequence));
        StringBuilder rawLogText = new();
        foreach ((Logs.LogLevel mLevel, Logs.LogMessage message) in messages)
        {
            rawLogText.Append($"{message.Time:yyyy-MM-dd HH:mm:ss.fff} [{mLevel}] {message.Message}\n");
        }
        string logText = rawLogText.ToString().Replace('\0', ' ');
        if (logText.Length > 3 * 1024 * 1024)
        {
            logText = logText[0..(100 * 1024)] + "\n\n\n... (log too long, truncated) ..." + logText[^(2500 * 1024)..];
        }
        if (logText.Length < 200)
        {
            throw new SwarmReadableErrorException($"Something went wrong - logs contain no content! Cannot pastebin: {logText.Length}: {logText}");
        }
        FormUrlEncodedContent content = new(new Dictionary<string, string>()
        {
            ["pastetype"] = "swarm",
            ["pastetitle"] = $"SwarmUI v{Utilities.Version} Server Log - {DateTime.Now:yyyy-MM-dd HH:mm:ss}",
            ["response"] = "micro",
            ["v"] = "300",
            ["pastecontents"] = logText
        });
        HttpResponseMessage response = await Utilities.UtilWebClient.PostAsync("https://paste.denizenscript.com/New/Swarm", content, Program.GlobalProgramCancel);
        string responseString = await response.Content.ReadAsStringAsync();
        responseString = responseString.Trim();
        if (responseString.StartsWith("<!DOCTYPE html") || responseString.StartsWith("System."))
        {
            responseString = responseString.Before('\n');
            if (responseString.Length > 100)
            {
                responseString = responseString[0..100] + "...";
            }
            Logs.Error($"Failed to submit log to pastebin - server error: {responseString}");
            return new JObject() { ["error"] = "Failed to submit log to pastebin - server error?" };
        }
        Logs.Info($"Log submitted to pastebin, URL: {responseString}");
        return new JObject() { ["url"] = responseString };
    }

    [API.APIDescription("Shuts the server down. Returns success before the server is gone.", "\"success\": true")]
    public static async Task<JObject> ShutdownServer(Session session)
    {
        Logs.Warning($"User {session.User.UserID} requested server shutdown.");
        _ = Task.Run(() => Program.Shutdown());
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Returns information about the server's resource usage.",
        """
            "cpu": {
                "usage": 0.0,
                "cores": 0
            },
            "system_ram": {
                "total": 0,
                "used": 0,
                "free": 0
            },
            "gpus": {
                "0": {
                    "id": 0,
                    "name": "namehere",
                    "temperature": 0,
                    "utilization_gpu": 0,
                    "utilization_memory": 0,
                    "total_memory": 0,
                    "free_memory": 0,
                    "used_memory": 0
                }
            }
        """
               )]
    public static async Task<JObject> GetServerResourceInfo(Session session)
    {
        NvidiaUtil.NvidiaInfo[] gpuInfo = NvidiaUtil.QueryNvidia();
        MemoryStatus memStatus = SystemStatusMonitor.HardwareInfo.MemoryStatus;
        JObject result = new()
        {
            ["cpu"] = new JObject()
            {
                ["usage"] = SystemStatusMonitor.ProcessCPUUsage,
                ["cores"] = Environment.ProcessorCount,
            },
            ["system_ram"] = new JObject()
            {
                ["total"] = memStatus.TotalPhysical,
                ["used"] = memStatus.TotalPhysical - memStatus.AvailablePhysical,
                ["free"] = memStatus.AvailablePhysical
            }
        };
        if (gpuInfo is not null)
        {
            JObject gpus = [];
            foreach (NvidiaUtil.NvidiaInfo gpu in gpuInfo)
            {
                gpus[$"{gpu.ID}"] = new JObject()
                {
                    ["id"] = gpu.ID,
                    ["name"] = gpu.GPUName,
                    ["temperature"] = gpu.Temperature,
                    ["utilization_gpu"] = gpu.UtilizationGPU,
                    ["utilization_memory"] = gpu.UtilizationMemory,
                    ["total_memory"] = gpu.TotalMemory.InBytes,
                    ["free_memory"] = gpu.FreeMemory.InBytes,
                    ["used_memory"] = gpu.UsedMemory.InBytes
                };
            }
            result["gpus"] = gpus;
        }
        return result;
    }

    [API.APIDescription("(Internal/Debug route), adds language data to the language file builder.", "\"success\": true")]
    public static async Task<JObject> DebugLanguageAdd(Session session,
        [API.APIParameter("\"set\": [ \"word\", ... ]")] JObject raw)
    {
        LanguagesHelper.TrackSet([.. raw["set"].ToArray().Select(v => $"{v}")]);
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("(Internal/Debug route), generates API docs.", "\"success\": true")]
    public static async Task<JObject> DebugGenDocs(Session session)
    {
        await API.GenerateAPIDocs();
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Returns a list of currently connected users.",
        """
            "users":
            [
                {
                    "id": "useridhere",
                    "last_active_seconds": 0,
                    "active_sessions": [ "addresshere", "..." ],
                    "last_active": "10 seconds ago"
                }
            ]
        """)]
    public static async Task<JObject> ListConnectedUsers(Session session)
    {
        static JArray sessWrangle(IEnumerable<string> addresses)
        {
            Dictionary<string, int> counts = [];
            foreach (string addr in addresses)
            {
                counts[addr] = counts.GetValueOrDefault(addr, 0) + 1;
            }
            JArray result = [];
            foreach ((string addr, int count) in counts)
            {
                result.Add(new JObject() { ["address"] = addr, ["count"] = count });
            }
            return result;
        }
        JArray list = [.. Program.Sessions.Users.Values.Where(u => u.TimeSinceLastPresent.TotalMinutes < 3 && !u.UserID.StartsWith("__")).OrderBy(u => u.UserID).Select(u => new JObject()
        {
            ["id"] = u.UserID,
            ["last_active_seconds"] = u.TimeSinceLastUsed.TotalSeconds,
            ["active_sessions"] = sessWrangle(u.CurrentSessions.Values.Where(s => s.TimeSinceLastUsed.TotalMinutes < 3).Select(s => s.OriginAddress)),
            ["last_active"] = $"{u.TimeSinceLastUsed.SimpleFormat(false, false)} ago"
        }).ToArray()];
        return new JObject() { ["users"] = list };
    }

    [API.APIDescription("Do a scan for any available updates to SwarmUI, extensions, or backends.",
        """
            "server_updates_count": 0,
            "server_updates_preview": ["name1", ..., "name6"], // capped to just a few
            "extension_updates": ["name1", ...],
            "backend_updates": ["name1", ...]
        """)]
    public static async Task<JObject> CheckForUpdates(Session session)
    {
        Logs.Debug($"User {session.User.UserID} requested check for updates.");
        List<Task> fetchTasks = [];
        LockObject locker = new();
        List<string> extensions = [];
        int serverUpdates = 0;
        List<string> updatesPreview = [];
        List<string> backendUpdates = [];
        fetchTasks.Add(Utilities.RunCheckedTask(async () =>
        {
            await Utilities.RunGitProcess("fetch");
            string[] commits = (await Utilities.RunGitProcess("rev-list HEAD..origin")).Trim().Replace("\r", "").Split('\n', StringSplitOptions.RemoveEmptyEntries);
            serverUpdates = commits.Length;
            if (commits.Length > 6)
            {
                commits = [.. commits[0..2], "...", .. commits[^3..]];
            }
            for (int i = 0; i < commits.Length; i++)
            {
                if (commits[i].Length > 5)
                {
                    string showOutput = await Utilities.RunGitProcess($"show --no-patch --format=%h^%ci^%s {commits[i]}");
                    string[] parts = showOutput.SplitFast('^', 2);
                    DateTimeOffset date = DateTimeOffset.Parse(parts[1].Trim()).ToUniversalTime();
                    string dateFormat = $"{date:yyyy-MM-dd HH:mm:ss}";
                    commits[i] = $"{dateFormat}: {parts[2]}";
                }
            }
            updatesPreview = [.. commits];
        }, "check for core update"));
        foreach (Extension extension in Program.Extensions.Extensions.Where(e => !e.IsCore))
        {
            Extension ext = extension; // lambda capture
            fetchTasks.Add(Utilities.RunCheckedTask(async () =>
            {
                string path = Path.GetFullPath(Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, ext.FilePath));
                await Utilities.RunGitProcess("fetch", path);
                string priorHash = (await Utilities.RunGitProcess("rev-parse HEAD", path)).Trim();
                string remoteHash = (await Utilities.RunGitProcess("rev-parse origin", path)).Trim();
                Logs.Debug($"Update checker: current hash for {ext.ExtensionName} is {priorHash}, origin hash is {remoteHash}");
                if (priorHash != remoteHash)
                {
                    lock (locker)
                    {
                        extensions.Add(ext.ExtensionName);
                    }
                }
            }, "check for extension update"));
        }
        await Task.WhenAll(fetchTasks);
        Logs.Debug($"Update check complete - {serverUpdates} Swarm commits, {extensions.Count} extensions, {backendUpdates.Count} backends.");
        // TODO: Backends
        return new()
        {
            ["server_updates_count"] = serverUpdates,
            ["server_updates_preview"] = JArray.FromObject(updatesPreview),
            ["extension_updates"] = JArray.FromObject(extensions),
            ["backend_updates"] = JArray.FromObject(backendUpdates)
        };
    }

    [API.APIDescription("Causes swarm to update, then close and restart itself. If there's no update to apply, won't restart.",
        """
            "success": true, // or false if not updated
            "result": "No changes found." // or any other applicable human-readable English message
        """)]
    public static async Task<JObject> UpdateAndRestart(Session session,
        [API.APIParameter("True to also update any extensions.")] bool updateExtensions = false,
        [API.APIParameter("True to also update any backends.")] bool updateBackends = false, // TODO: Impl
        [API.APIParameter("True to always rebuild and restart even if there's no visible update.")] bool force = false)
    {
        Logs.Warning($"User {session.User.UserID} requested update-and-restart.");
        string priorHash = (await Utilities.RunGitProcess("rev-parse HEAD")).Trim();
        string pullResult = await Utilities.RunGitProcess("pull");
        if (pullResult.Contains("error: Your local changes to the following files would be overwritten by merge:"))
        {
            return new JObject() { ["error"] = "Git pull failed because you have local changes to source files.\nPlease remove them, or manually run 'git pull --autostash', or 'git fetch origin && git checkout -f master' in the SwarmUI folder." };
        }
        string localHash = (await Utilities.RunGitProcess("rev-parse HEAD")).Trim();
        Logs.Debug($"Updater: prior hash was {priorHash}, new hash is {localHash}");
        long updates = localHash != priorHash ? 1 : 0;
        List<Task> pullTasks = [];
        if (updateExtensions)
        {
            foreach (Extension extension in Program.Extensions.Extensions.Where(e => !e.IsCore))
            {
                Extension ext = extension; // lambda capture
                pullTasks.Add(Utilities.RunCheckedTask(async () =>
                {
                    string path = Path.GetFullPath(Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, ext.FilePath));
                    string priorExtHash = (await Utilities.RunGitProcess("rev-parse HEAD", path)).Trim();
                    await Utilities.RunGitProcess("pull", path);
                    string localExtHash = (await Utilities.RunGitProcess("rev-parse HEAD", path)).Trim();
                    Logs.Debug($"Updater: prior hash for {ext.ExtensionName} was {priorHash}, new hash is {localHash}");
                    if (priorExtHash != localExtHash)
                    {
                        Interlocked.Increment(ref updates);
                    }
                }));
            }
        }
        await Task.WhenAll(pullTasks);
        if (Interlocked.Read(ref updates) == 0 && !force)
        {
            return new JObject() { ["success"] = false, ["result"] = "No changes found." };
        }
        File.WriteAllText("src/bin/must_rebuild", "yes");
        Program.RequestRestart();
        return new JObject() { ["success"] = true, ["result"] = "Update successful. Restarting... (please wait a moment, then refresh the page)" };
    }

    [API.APIDescription("Installs an extension from the known extensions list. Does not trigger a restart. Does signal required rebuild.",
        """
            "success": true
        """)]
    public static async Task<JObject> InstallExtension(Session session,
        [API.APIParameter("The name of the extension to install, from the known extensions list.")] string extensionName)
    {
        ExtensionsManager.ExtensionInfo ext = Program.Extensions.KnownExtensions.FirstOrDefault(e => e.Name == extensionName);
        if (ext is null)
        {
            return new JObject() { ["error"] = "Unknown extension." };
        }
        string extensionsFolder = Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, "src/Extensions");
        string folder = Utilities.CombinePathWithAbsolute(extensionsFolder, ext.FolderName);
        if (Directory.Exists(folder))
        {
            return new JObject() { ["error"] = "Extension already installed." };
        }
        await Utilities.RunGitProcess($"clone {ext.URL}", extensionsFolder);
        File.WriteAllText("src/bin/must_rebuild", "yes");
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Triggers an extension update for an installed extension. Does not trigger a restart. Does signal required rebuild.",
        """
            "success": true // or false if no update available
        """)]
    public static async Task<JObject> UpdateExtension(Session session,
        [API.APIParameter("The name of the extension to update.")] string extensionName)
    {
        Extension ext = Program.Extensions.Extensions.FirstOrDefault(e => e.ExtensionName == extensionName);
        if (ext is null)
        {
            return new JObject() { ["error"] = "Unknown extension." };
        }
        string path = Path.GetFullPath(Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, ext.FilePath));
        string priorHash = (await Utilities.RunGitProcess("rev-parse HEAD", path)).Trim();
        await Utilities.RunGitProcess("pull", path);
        string localHash = (await Utilities.RunGitProcess("rev-parse HEAD", path)).Trim();
        Logs.Debug($"Extension updater: prior hash was {priorHash}, new hash is {localHash}");
        if (priorHash == localHash)
        {
            return new JObject() { ["success"] = false };
        }
        File.WriteAllText("src/bin/must_rebuild", "yes");
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Triggers an extension uninstallation for an installed extension. Does not trigger a restart. Does signal required rebuild.",
        """
            "success": true
        """)]
    public static async Task<JObject> UninstallExtension(Session session,
        [API.APIParameter("The name of the extension to uninstall.")] string extensionName)
    {
        Extension ext = Program.Extensions.Extensions.FirstOrDefault(e => e.ExtensionName == extensionName);
        if (ext is null)
        {
            return new JObject() { ["error"] = "Unknown extension." };
        }
        string path = Path.GetFullPath(Utilities.CombinePathWithAbsolute(Environment.CurrentDirectory, ext.FilePath));
        Logs.Debug($"Will clear out Extension path: {path}");
        if (!Directory.Exists(path))
        {
            return new JObject() { ["error"] = "Extension has invalid path, cannot delete." };
        }
        File.WriteAllText("src/bin/must_rebuild", "yes");
        try
        {
            FileSystem.DeleteDirectory(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin, UICancelOption.ThrowException);
            return new JObject() { ["success"] = true };
        }
        catch (Exception ex)
        {
            Logs.Debug($"Failed to send extension folder to recycle, will try to delete permanently -- error was {ex.ReadableString()}");
        }
        try
        {
            Directory.Move(path, path + ".delete");
        }
        catch (Exception ex)
        {
            Logs.Error($"Failed to move extension folder to delete folder: {ex.ReadableString()}");
            return new JObject() { ["error"] = "Extension deletion failed, you will need to manually delete the extension folder from inside SwarmUI/src/Extensions" };
        }
        path = $"{path}.delete";
        try
        {
            Directory.Delete(path, true);
        }
        catch (Exception)
        {
            Logs.Debug($"Delete failed, will wait a minute then try again...");
            await Task.Delay(TimeSpan.FromMinutes(1));
            try
            {
                Directory.Delete(path, true);
            }
            catch (Exception ex)
            {
                Logs.Error($"Failed to delete extension folder: {ex.ReadableString()}");
                return new JObject() { ["error"] = "Extension deletion failed, will retry deleting it after SwarmUI restarts" };
            }
        }
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Admin route to get a list of all known users by ID.",
        """
            "users": [
                "user1",
                "user2"
            ]
        """)]
    public static async Task<JObject> AdminListUsers(Session session)
    {
        List<string> users = [.. Program.Sessions.UserDatabase.FindAll().Select(u => u.ID)];
        return new JObject() { ["users"] = JArray.FromObject(users) };
    }

    public static AsciiMatcher UsernameValidator = new(AsciiMatcher.BothCaseLetters + AsciiMatcher.Digits + "_");

    [API.APIDescription("Admin route to create a new user account.",
        """
            "success": true
        """)]
    public static async Task<JObject> AdminAddUser(Session session,
        [API.APIParameter("The name of the new user.")] string name,
        [API.APIParameter("Initial password for the new user.")] string password,
        [API.APIParameter("Initial role for the new user.")] string role)
    {
        string cleaned = UsernameValidator.TrimToMatches(name).ToLowerFast();
        if (cleaned.Length < 3)
        {
            return new JObject() { ["error"] = "Username must be at least 3 characters long, A-Z 0-9 only." };
        }
        if (password.Length < 8)
        {
            return new JObject() { ["error"] = "Password must be at least 8 characters long." };
        }
        if (cleaned.Length > 70 || password.Length > 500)
        {
            return new JObject() { ["error"] = "Username or password too long." };
        }
        lock (Program.Sessions.DBLock)
        {
            User existing = Program.Sessions.GetUser(cleaned, false);
            if (existing is not null)
            {
                return new JObject() { ["error"] = "A user by that name already exists." };
            }
            User.DatabaseEntry userData = new() { ID = cleaned, RawSettings = "\n" };
            User user = new(Program.Sessions, userData);
            user.Settings.Roles = [role];
            user.Settings.TrySetFieldModified(nameof(User.Settings.Roles), true);
            user.Data.PasswordHashed = Utilities.HashPassword(cleaned, password);
            user.Data.IsPasswordSetByAdmin = true;
            user.BuildRoles();
            user.Save();
            Program.Sessions.Users.TryAdd(cleaned, user);
        }
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Admin route to force-set a user's password.",
        """
            "success": true
        """)]
    public static async Task<JObject> AdminSetUserPassword(Session session,
        [API.APIParameter("The name of the user.")] string name,
        [API.APIParameter("New password for the user.")] string password)
    {
        User user = Program.Sessions.GetUser(name, false);
        if (user is null)
        {
            return new JObject() { ["error"] = "No user by that name exists." };
        }
        if (string.IsNullOrWhiteSpace(password))
        {
            user.Data.PasswordHashed = "";
        }
        else
        {
            if (password.Length < 8)
            {
                return new JObject() { ["error"] = "Password must be at least 8 characters long." };
            }
            if (password.Length > 500)
            {
                return new JObject() { ["error"] = "Password too long." };
            }
            user.Data.PasswordHashed = Utilities.HashPassword(user.UserID, password);
        }
        user.Data.IsPasswordSetByAdmin = true;
        user.Save();
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Admin route to forcibly change user settings data for a user.",
        """
            "success": true
        """)]
    public static async Task<JObject> AdminChangeUserSettings(Session session,
        [API.APIParameter("The name of the user.")] string name,
        [API.APIParameter("Simple object map of key as setting ID to new setting value to apply, under 'settings'.")] JObject rawData)
    {
        User user = Program.Sessions.GetUser(name, false);
        if (user is null)
        {
            return new JObject() { ["error"] = "No user by that name exists." };
        }
        JObject settings = (JObject)rawData["settings"];
        foreach ((string key, JToken val) in settings)
        {
            AutoConfiguration.Internal.SingleFieldData field = user.Settings.TryGetFieldInternalData(key, out _);
            if (field is null)
            {
                Logs.Error($"User '{session.User.UserID}' tried to admin-set unknown setting '{key}' to '{val}'.");
                continue;
            }
            object obj = DataToType(val, field.Field.FieldType);
            if (obj is null)
            {
                Logs.Error($"User '{session.User.UserID}' tried to admin-set setting '{key}' of type '{field.Field.FieldType.Name}' to '{val}', but type-conversion failed.");
                continue;
            }
            user.Settings.TrySetFieldValue(key, obj);
        }
        user.Save();
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Admin route to delete an existing user account.",
        """
            "success": true
        """)]
    public static async Task<JObject> AdminDeleteUser(Session session,
        [API.APIParameter("The name of the user to delete.")] string name)
    {
        lock (Program.Sessions.DBLock)
        {
            User user = Program.Sessions.GetUser(name, false);
            if (user is null)
            {
                return new JObject() { ["error"] = "No user by that name exists." };
            }
            if (session.User.UserID == user.UserID)
            {
                return new JObject() { ["error"] = "You may not delete yourself." };
            }
            Program.Sessions.RemoveUser(user);
        }
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Admin route to get info about a user.",
        """
            "user_id": "useridhere",
            "password_set_by_admin": true, // false if set by user
            "settings": { ... }, // User settings, same format as GetUserSettings
            "max_t2i": 32 // actual value of max t2i simultaneous, calculated from current roles and available backends
        """)]
    public static async Task<JObject> AdminGetUserInfo(Session session,
        [API.APIParameter("The name of the user to get info for.")] string name)
    {
        User user = Program.Sessions.GetUser(name, false);
        if (user is null)
        {
            return new JObject() { ["error"] = "No user by that name exists." };
        }
        return new JObject()
        {
            ["user_id"] = user.UserID,
            ["password_set_by_admin"] = user.Data.IsPasswordSetByAdmin,
            ["settings"] = AutoConfigToParamData(user.Settings, false),
            ["max_t2i"] = user.CalcMaxT2ISimultaneous
        };
    }

    [API.APIDescription("Admin route to get a list of all available roles.",
        """
            "roles": [
                "user": {
                    "name": "User",
                    "description": "Text here...",
                    "max_out_depth_path": 5,
                    "is_auto_generated": true,
                    "model_whitelist": [],
                    "model_blacklist": [],
                    "permissions": ["first", "second"],
                    "max_t2i_simultaneous": 32,
                    "allow_unsafe_outpaths": false
                }
            ]
        """)]
    public static async Task<JObject> AdminListRoles(Session session)
    {
        JObject roles = [];
        foreach (Role role in Program.Sessions.Roles.Values)
        {
            roles[role.ID] = new JObject()
            {
                ["name"] = role.Data.Name,
                ["description"] = role.Data.Description,
                ["max_outpath_depth"] = role.Data.MaxOutPathDepth,
                ["is_auto_generated"] = role.IsAutoGenerated,
                ["model_whitelist"] = JArray.FromObject(role.Data.ModelWhitelist.ToList()),
                ["model_blacklist"] = JArray.FromObject(role.Data.ModelBlacklist.ToList()),
                ["permissions"] = JArray.FromObject(role.Data.PermissionFlags.ToList()),
                ["max_t2i_simultaneous"] = role.Data.MaxT2ISimultaneous,
                ["allow_unsafe_outpaths"] = role.Data.AllowUnsafeOutpaths
            };
        }
        return new JObject() { ["roles"] = roles };
    }

    [API.APIDescription("Admin route to create a new user permission role.",
        """
            "success": true
        """)]
    public static async Task<JObject> AdminAddRole(Session session,
        [API.APIParameter("The name of the new role.")] string name)
    {
        string cleaned = UsernameValidator.TrimToMatches(name).ToLowerFast();
        if (cleaned.Length < 3)
        {
            return new JObject() { ["error"] = "Role name must be at least 3 characters long, A-Z 0-9 only." };
        }
        lock (Program.Sessions.DBLock)
        {
            Role newRole = new(name);
            newRole.Data.Name = name;
            if (!Program.Sessions.Roles.TryAdd(cleaned, newRole))
            {
                return new JObject() { ["error"] = "A role by that name already exists." };
            }
            Program.Sessions.Save();
        }
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Admin route to edit a permission role.",
        """
            "success": true
        """)]
    public static async Task<JObject> AdminEditRole(Session session,
        [API.APIParameter("The name of the role.")] string name,
        [API.APIParameter("The description text for the role.")] string description,
        [API.APIParameter("The maximum outpath depth allowed for the role.")] int max_outpath_depth,
        [API.APIParameter("The maximum number of simultaneous T2I allowed for the role.")] int max_t2i_simultaneous,
        [API.APIParameter("Whether to allow unsafe outpaths for the role.")] bool allow_unsafe_outpaths,
        [API.APIParameter("Comma-separated list of model names to whitelist for the role.")] string model_whitelist,
        [API.APIParameter("Comma-separated list of model names to blacklist for the role.")] string model_blacklist,
        [API.APIParameter("Comma-separated list of enabled permission nodes.")] string permissions)
    {
        lock (Program.Sessions.DBLock)
        {
            if (!Program.Sessions.Roles.TryGetValue(name, out Role role))
            {
                return new JObject() { ["error"] = "No role by that name exists." };
            }
            role.Data.Description = description;
            role.Data.MaxOutPathDepth = max_outpath_depth;
            role.Data.MaxT2ISimultaneous = max_t2i_simultaneous;
            role.Data.AllowUnsafeOutpaths = allow_unsafe_outpaths;
            role.Data.ModelWhitelist = [.. model_whitelist.Split(',').Select(s => s.Trim()).Where(s => !string.IsNullOrWhiteSpace(s))];
            role.Data.ModelBlacklist = [.. model_blacklist.Split(',').Select(s => s.Trim()).Where(s => !string.IsNullOrWhiteSpace(s))];
            role.Data.PermissionFlags = [.. permissions.Split(',').Select(s => s.Trim()).Where(s => !string.IsNullOrWhiteSpace(s))];
            Program.Sessions.Save();
        }
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Admin route to delete an existing user permission role.",
        """
            "success": true
        """)]
    public static async Task<JObject> AdminDeleteRole(Session session,
        [API.APIParameter("The name of the new role.")] string name)
    {
        lock (Program.Sessions.DBLock)
        {
            if (!Program.Sessions.Roles.TryGetValue(name, out Role existing))
            {
                return new JObject() { ["error"] = "No role by that name exists." };
            }
            if (existing.IsAutoGenerated)
            {
                return new JObject() { ["error"] = "That role is an auto-generated core role and cannot be deleted." };
            }
            if (!Program.Sessions.Roles.TryRemove(new(name, existing)))
            {
                return new JObject() { ["error"] = "Role removal failed." };
            }
            Program.Sessions.Save();
        }
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Admin route to get a list of all available permissions.",
        """
            "permissions": [
                "perm_name": {
                    "name": "Perm Name",
                    "description": "Description text for the perm",
                    "default": "USER",
                    "group": {
                        "name": "My Group",
                        "description": "Some group description"
                    },
                    "safety_level": "UNTESTED",
                    "alt_safety_text": "some text here or null"
                }
            ]
        """)]
    public static async Task<JObject> AdminListPermissions(Session session)
    {
        JObject permissions = [];
        foreach (PermInfo perm in Permissions.Registered.Values)
        {
            permissions[perm.ID] = new JObject()
            {
                ["name"] = perm.DisplayName,
                ["description"] = perm.Description,
                ["default"] = $"{perm.Default}",
                ["group"] = new JObject()
                {
                    ["name"] = perm.Group.DisplayName,
                    ["description"] = perm.Group.Description
                },
                ["safety_level"] = $"{perm.SafetyLevel}",
                ["alt_safety_text"] = perm.AltSafetyText
            };
        }
        return new JObject() { ["permissions"] = permissions, ["ordered"] = JArray.FromObject(Permissions.OrderedKeys) };
    }
}
