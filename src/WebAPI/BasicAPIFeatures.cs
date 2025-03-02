using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.Accounts;
using SwarmUI.Text2Image;
using FreneticUtilities.FreneticExtensions;
using Microsoft.AspNetCore.Http;
using FreneticUtilities.FreneticDataSyntax;
using System.Net.WebSockets;
using SwarmUI.Backends;
using Newtonsoft.Json;
using Microsoft.Extensions.Primitives;
using System.Reflection;

namespace SwarmUI.WebAPI;

[API.APIClass("Basic general API routes, primarily for users and session handling.")]
public static class BasicAPIFeatures
{
    /// <summary>Called by <see cref="Program"/> to register the core API calls.</summary>
    public static void Register()
    {
        API.RegisterAPICall(GetNewSession); // GetNewSession is special
        API.RegisterAPICall(InstallConfirmWS, true, Permissions.Install);
        API.RegisterAPICall(GetMyUserData, false, Permissions.FundamentalGenerateTabAccess);
        API.RegisterAPICall(SetStarredModels, true, Permissions.FundamentalModelAccess);
        API.RegisterAPICall(AddNewPreset, true, Permissions.ManagePresets);
        API.RegisterAPICall(DuplicatePreset, true, Permissions.ManagePresets);
        API.RegisterAPICall(DeletePreset, true, Permissions.ManagePresets);
        API.RegisterAPICall(GetCurrentStatus, false, Permissions.FundamentalGenerateTabAccess);
        API.RegisterAPICall(InterruptAll, true, Permissions.BasicImageGeneration);
        API.RegisterAPICall(GetUserSettings, false, Permissions.ReadUserSettings);
        API.RegisterAPICall(ChangeUserSettings, true, Permissions.EditUserSettings);
        API.RegisterAPICall(SetParamEdits, true, Permissions.EditParams);
        API.RegisterAPICall(GetLanguage, false, Permissions.FundamentalGenerateTabAccess);
        API.RegisterAPICall(ServerDebugMessage, false, Permissions.ServerDebugMessage);
        API.RegisterAPICall(SetAPIKey, true, Permissions.EditUserSettings);
        API.RegisterAPICall(GetAPIKeyStatus, false, Permissions.ReadUserSettings);
        T2IAPI.Register();
        ModelsAPI.Register();
        BackendAPI.Register();
        AdminAPI.Register();
        UtilAPI.Register();
    }

    [API.APIDescription("Special route to create a new session ID. Must be called before any other API route. Also returns other fundamental user and server data.",
        """
            "session_id": "session_id",
            "user_id": "username",
            "output_append_user": true,
            "version": "1.2.3",
            "server_id": "abc123",
            "permissions": ["permission1", "permission2"]
        """)]
    public static async Task<JObject> GetNewSession(HttpContext context)
    {
        string userId = WebServer.GetUserIdFor(context);
        if (userId is null)
        {
            return new JObject() { ["error"] = "Invalid or unauthorized." };
        }
        string source = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        if (context.Request.Headers.TryGetValue("X-Forwarded-For", out StringValues forwardedFor) && forwardedFor.Count > 0)
        {
            foreach (string forward in forwardedFor)
            {
                source += $" (forwarded-for: {Utilities.ControlCodesMatcher.TrimToNonMatches(forward)})";
            }
        }
        if (source.Length > 100)
        {
            source = source[..100] + "...";
        }
        Session session = Program.Sessions.CreateAdminSession(source, userId);
        return new JObject()
        {
            ["session_id"] = session.ID,
            ["user_id"] = session.User.UserID,
            ["output_append_user"] = Program.ServerSettings.Paths.AppendUserNameToOutputPath,
            ["version"] = Utilities.VaryID,
            ["server_id"] = Utilities.LoopPreventionID.ToString(),
            ["permissions"] = JArray.FromObject(session.User.GetPermissions())
        };
    }

    [API.APIDescription("Websocket route for the initial installation from the UI.",
        """
            // ... (do not automate calls to this)
        """)]
    public static async Task<JObject> InstallConfirmWS(Session session, WebSocket socket,
        [API.APIParameter("Selected user theme.")] string theme,
        [API.APIParameter("Selected install_for (network mode choice) value.")] string installed_for,
        [API.APIParameter("Selected backend (comfy/none).")] string backend,
        [API.APIParameter("Selected models to predownload.")] string models,
        [API.APIParameter("If true, install with AMD GPU compatibility.")] bool install_amd,
        [API.APIParameter("Selected user language.")] string language,
        [API.APIParameter("If true, make a Desktop shortcut.")] bool make_shortcut = false)
    {
        if (Program.ServerSettings.IsInstalled)
        {
            await socket.SendJson(new JObject() { ["error"] = $"Server is already installed!" }, API.WebsocketTimeout);
            return null;
        }
        try
        {
            await Installation.Install(socket, theme, installed_for, backend, models, install_amd, language, make_shortcut);
        }
        catch (SwarmReadableErrorException ex)
        {
            Logs.Init($"[Installer] Error: {ex.Message}");
            await socket.SendJson(new JObject() { ["info"] = $"Error: {ex.Message}" }, API.WebsocketTimeout);
            await socket.SendJson(new JObject() { ["error"] = ex.Message }, API.WebsocketTimeout);
        }
        return null;
    }

    [API.APIDescription("User route to get the user's own base data.",
        """
            "user_name": "username",
            "presets": [
                {
                    "author": "username",
                    "title": "Preset Title",
                    "description": "Preset Description",
                    "param_map": {
                        "key": "value"
                    },
                    "preview_image": "data:base64 img"
                }
            ],
            "language": "en",
            "permissions": ["permission1", "permission2"],
            "starred_models": {
                "LoRA": ["one", "two"]
            },
            "autocompletions": ["Word\nword\ntag\n3"]
        """)]
    public static async Task<JObject> GetMyUserData(Session session)
    {
        Settings.User.AutoCompleteData settings = session.User.Settings.AutoComplete;
        return new JObject()
        {
            ["user_name"] = session.User.UserID,
            ["presets"] = new JArray(session.User.GetAllPresets().Select(p => p.NetData()).ToArray()),
            ["language"] = session.User.Settings.Language,
            ["permissions"] = JArray.FromObject(session.User.GetPermissions()),
            ["starred_models"] = JObject.Parse(session.User.GetGenericData("starred_models", "full") ?? "{}"),
            ["autocompletions"] = string.IsNullOrWhiteSpace(settings.Source) ? null : new JArray(AutoCompleteListHelper.GetData(settings.Source, settings.EscapeParens, settings.Suffix, settings.SpacingMode))
        };
    }

    [API.APIDescription("User route to update the user's starred models lists.",
        """
            "success": true
        """)]
    public static async Task<JObject> SetStarredModels(Session session,
        [API.APIParameter("Send the raw data as eg 'LoRA': ['one', 'two'], 'Stable-Diffusion': [ ... ]")] JObject raw)
    {
        raw.Remove("session_id");
        session.User.SaveGenericData("starred_models", "full", raw.ToString(Formatting.None));
        session.User.Save();
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("User route to add a new parameter preset.",
        """
            "success": true
            // or:
            "preset_fail": "Some friendly error text here"
        """)]
    public static async Task<JObject> AddNewPreset(Session session,
        [API.APIParameter("Name of the new preset.")] string title,
        [API.APIParameter("User-facing description text.")] string description,
        [API.APIParameter("Use 'param_map' key to send the raw parameter mapping, equivalent to GenerateText2Image.")] JObject raw,
        [API.APIParameter("Optional preview image data base64 string.")] string preview_image = null,
        [API.APIParameter("If true, edit an existing preset. If false, do not override pre-existing presets of the same name.")] bool is_edit = false,
        [API.APIParameter("If is_edit is set, include the original preset name here.")] string editing = null)
    {
        title = Utilities.StrictFilenameClean(title);
        if (string.IsNullOrWhiteSpace(title))
        {
            return new JObject() { ["preset_fail"] = "Invalid or empty title." };
        }
        JObject paramData = (JObject)raw["param_map"];
        T2IPreset existingPreset = session.User.GetPreset(is_edit ? editing : title);
        if (existingPreset is not null && !is_edit)
        {
            return new JObject() { ["preset_fail"] = "A preset with that title already exists." };
        }
        T2IPreset preset = new()
        {
            Author = session.User.UserID,
            Title = title,
            Description = description,
            ParamMap = paramData.Properties().Select(p => (p.Name, p.Value.ToString())).PairsToDictionary(),
            PreviewImage = string.IsNullOrWhiteSpace(preview_image) ? "imgs/model_placeholder.jpg" : preview_image
        };
        if ((preset.PreviewImage != "imgs/model_placeholder.jpg" && !preset.PreviewImage.StartsWith("data:image/jpeg;base64,") && !preset.PreviewImage.StartsWith("/Output")) || preset.PreviewImage.Contains('?'))
        {
            Logs.Info($"User {session.User.UserID} tried to set a preset preview image to forbidden path: {preset.PreviewImage}");
            return new JObject() { ["preset_fail"] = "Forbidden preview-image path." };
        }
        if (is_edit && existingPreset is not null && editing != title)
        {
            session.User.DeletePreset(editing);
        }
        session.User.SavePreset(preset);
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("User route to duplicate an existing preset.",
        """
            "success": true
        """)]
    public static async Task<JObject> DuplicatePreset(Session session,
        [API.APIParameter("Name of the preset to duplicate.")] string preset)
    {
        T2IPreset existingPreset = session.User.GetPreset(preset);
        if (existingPreset is null)
        {
            return new JObject() { ["preset_fail"] = "No such preset." };
        }
        int id = 2;
        while (session.User.GetPreset($"{preset} ({id})") is not null)
        {
            id++;
        }
        T2IPreset newPreset = new()
        {
            Author = session.User.UserID,
            Title = $"{preset} ({id})",
            Description = existingPreset.Description,
            ParamMap = new(existingPreset.ParamMap),
            PreviewImage = existingPreset.PreviewImage
        };
        session.User.SavePreset(newPreset);
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("User route to delete a preset.",
        """
            "success": true
        """)]
    public static async Task<JObject> DeletePreset(Session session,
        [API.APIParameter("Name of the preset to delete.")] string preset)
    {
        return new JObject() { ["success"] = session.User.DeletePreset(preset) };
    }

    /// <summary>Gets current session status. Not an API call.</summary>
    public static JObject GetCurrentStatusRaw(Session session, bool do_debug = false)
    {
        if (do_debug) { Logs.Verbose($"Getting current status for session {session.User.UserID}..."); }
        JObject backendStatus = Program.Backends.CurrentBackendStatus.GetValue();
        if (do_debug) { Logs.Verbose("Got backend status, will get feature set..."); }
        string[] features = [.. Program.Backends.GetAllSupportedFeatures()];
        if (do_debug) { Logs.Verbose("Got backend stats, will get session data...."); }
        Interlocked.MemoryBarrier();
        JObject stats = new()
        {
            ["waiting_gens"] = session.WaitingGenerations,
            ["loading_models"] = session.LoadingModels,
            ["waiting_backends"] = session.WaitingBackends,
            ["live_gens"] = session.LiveGens
        };
        if (do_debug) { Logs.Verbose("Exited session lock. Done."); }
        return new JObject
        {
            ["status"] = stats,
            ["backend_status"] = backendStatus,
            ["supported_features"] = new JArray(features)
        };
    }

    [API.APIDescription("Get current waiting generation count, model loading count, etc.",
        """
            "status": {
                "waiting_gens": 0,
                "loading_models": 0,
                "waiting_backends": 0,
                "live_gens": 0
            },
            "backend_status": {
                "status": "running", // "idle", "unknown", "disabled", "loading", "running", "some_loading", "errored", "all_disabled", "empty"
                "class": "", // "error", "warn", "soft", ""
                "message": "", // User-facing English text
                "any_loading": false
            },
            "supported_features": ["feature_id1", "feature_id2"]
        """)]
    public static async Task<JObject> GetCurrentStatus(Session session,
        [API.APIParameter("If true, verbose log data about the status report gathering (internal usage).")] bool do_debug = false)
    {
        return GetCurrentStatusRaw(session, do_debug);
    }

    [API.APIDescription("Tell all waiting generations in this session or all sessions to interrupt.",
        """
            "success": true
        """)]
    public static async Task<JObject> InterruptAll(Session session,
        [API.APIParameter("If true, generations from all this user's sessions will be closed (ie even from other web page tabs or API usages). If false, only the current session is interrupted.")] bool other_sessions = false)
    {
        session.Interrupt();
        if (other_sessions)
        {
            foreach (Session sess in session.User.CurrentSessions.Values.ToArray())
            {
                sess.Interrupt();
            }
        }
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Gets the user's current settings.",
        """
            "themes": {
                "theme_id": {
                    "name": "Theme Name",
                    "is_dark": true,
                    "css_paths": ["path1", "path2"]
                }
            },
            "settings": {
                "setting_id": "value"
            }
        """)]
    public static async Task<JObject> GetUserSettings(Session session)
    {
        JObject themes = [];
        foreach (WebServer.ThemeData theme in Program.Web.RegisteredThemes.Values)
        {
            themes[theme.ID] = new JObject()
            {
                ["name"] = theme.Name,
                ["is_dark"] = theme.IsDark,
                ["css_paths"] = JArray.FromObject(theme.CSSPaths)
            };
        }
        return new JObject() { ["themes"] = themes, ["settings"] = AdminAPI.AutoConfigToParamData(session.User.Settings, true) };
    }

    [API.APIDescription("User route to change user settings data.",
        """
            "success": true
        """)]
    public static async Task<JObject> ChangeUserSettings(Session session,
        [API.APIParameter("Simple object map of key as setting ID to new setting value to apply.")] JObject rawData)
    {
        JObject settings = (JObject)rawData["settings"];
        foreach ((string key, JToken val) in settings)
        {
            AutoConfiguration.Internal.SingleFieldData field = session.User.Settings.TryGetFieldInternalData(key, out _);
            if (field is null)
            {
                Logs.Error($"User '{session.User.UserID}' tried to set unknown setting '{key}' to '{val}'.");
                continue;
            }
            if (field.Field.GetCustomAttribute<ValueIsRestrictedAttribute>() is not null)
            {
                Logs.Error($"User '{session.User.UserID}' tried to set restricted setting '{key}' to '{val}'.");
                continue;
            }
            object obj = AdminAPI.DataToType(val, field.Field.FieldType);
            if (obj is null)
            {
                Logs.Error($"User '{session.User.UserID}' tried to set setting '{key}' of type '{field.Field.FieldType.Name}' to '{val}', but type-conversion failed.");
                continue;
            }
            if (key.ToLowerFast() == "password")
            {
                if ($"{val}".Length < 8)
                {
                    return new JObject() { ["error"] = "Password must be at least 8 characters long." };
                }
                obj = Utilities.HashPassword(session.User.UserID, $"{val}");
            }
            session.User.Settings.TrySetFieldValue(key, obj);
        }
        session.User.Save();
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("UI internal helper for user customization of parameters.",
        """
            "success": true
        """)]
    public static async Task<JObject> SetParamEdits(Session session,
        [API.APIParameter("Blob of parameter edit data.")] JObject rawData)
    {
        JObject edits = (JObject)rawData["edits"];
        session.User.Data.RawParamEdits = edits.ToString(Formatting.None);
        session.User.Save();
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("Get the details of a given language file.",
        """
            "language": {
                "code": "en",
                "name": "English",
                "local_name": "English",
                "keys": {
                    "key": "value"
                }
            }
        """)]
    public static async Task<JObject> GetLanguage(Session session,
        [API.APIParameter("The language ID, eg 'en'.")] string language)
    {
        if (!LanguagesHelper.Languages.TryGetValue(language, out LanguagesHelper.Language lang))
        {
            return new JObject() { ["error"] = "No such language." };
        }
        return new JObject() { ["language"] = lang.ToJSON() };
    }

    [API.APIDescription("Send a debug message to server logs.",
        """
            "success": true
        """)]
    public static async Task<JObject> ServerDebugMessage(Session session,
        [API.APIParameter("The message to log.")] string message)
    {
        Logs.Info($"User '{session.User.UserID}' sent a debug message: {message}");
        return new JObject() { ["success"] = true };
    }

    public static HashSet<string> AcceptedAPIKeyTypes = ["stability_api", "civitai_api"];

    [API.APIDescription("User route to set an API key.",
        """
            "success": true
        """)]
    public static async Task<JObject> SetAPIKey(Session session,
        [API.APIParameter("The key type ID, eg 'stability_api'.")] string keyType,
        [API.APIParameter("The new value of the key, or 'none' to unset.")] string key)
    {
        if (!AcceptedAPIKeyTypes.Contains(keyType))
        {
            return new JObject() { ["error"] = $"Invalid key type '{AcceptedAPIKeyTypes}'." };
        }
        if (key == "none")
        {
            session.User.DeleteGenericData(keyType, "key");
            session.User.DeleteGenericData(keyType, "key_last_updated");
        }
        else
        {
            session.User.SaveGenericData(keyType, "key", key);
            session.User.SaveGenericData(keyType, "key_last_updated", $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm}");
        }
        session.User.Save();
        return new JObject() { ["success"] = true };
    }

    [API.APIDescription("User route to get the current status of a given API key.",
        """
            "status": "last updated 2025-01-01 01:01" // or "not set"
        """)]
    public static async Task<JObject> GetAPIKeyStatus(Session session,
        [API.APIParameter("The key type ID, eg 'stability_api'.")] string keyType)
    {
        string updated = session.User.GetGenericData(keyType, "key_last_updated");
        if (string.IsNullOrWhiteSpace(updated))
        {
            return new JObject() { ["status"] = "not set" };
        }
        return new JObject() { ["status"] = $"last updated {updated}" };
    }
}
