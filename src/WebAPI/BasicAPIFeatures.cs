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

    /// <summary>API Route to create a new session automatically.</summary>
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
            ["count_running"] = Program.Backends.T2IBackends.Values.Count(b => b.Backend.Status == BackendStatus.RUNNING || b.Backend.Status == BackendStatus.LOADING),
            ["permissions"] = JArray.FromObject(session.User.GetPermissions())
        };
    }

    public static async Task<JObject> InstallConfirmWS(Session session, WebSocket socket, string theme, string installed_for, string backend, string models, bool install_amd, string language)
    {
        if (Program.ServerSettings.IsInstalled)
        {
            await socket.SendJson(new JObject() { ["error"] = $"Server is already installed!" }, API.WebsocketTimeout);
            return null;
        }
        try
        {
            await Installation.Install(socket, theme, installed_for, backend, models, install_amd, language);
        }
        catch (SwarmReadableErrorException ex)
        {
            Logs.Init($"[Installer] Error: {ex.Message}");
            await socket.SendJson(new JObject() { ["info"] = $"Error: {ex.Message}" }, API.WebsocketTimeout);
            await socket.SendJson(new JObject() { ["error"] = ex.Message }, API.WebsocketTimeout);
        }
        return null;
    }

    /// <summary>API Route to get the user's own base data.</summary>
    public static async Task<JObject> GetMyUserData(Session session)
    {
        Settings.User.AutoCompleteData settings = session.User.Settings.AutoComplete;
        return new JObject()
        {
            ["user_name"] = session.User.UserID,
            ["presets"] = new JArray(session.User.GetAllPresets().Select(p => p.NetData()).ToArray()),
            ["language"] = session.User.Settings.Language,
            ["permissions"] = JArray.FromObject(session.User.GetPermissions()),
            ["autocompletions"] = string.IsNullOrWhiteSpace(settings.Source) ? null : new JArray(AutoCompleteListHelper.GetData(settings.Source, settings.EscapeParens, settings.Suffix, settings.SpacingMode))
        };
    }

    /// <summary>API Route to add a new user parameters preset.</summary>
    public static async Task<JObject> AddNewPreset(Session session, string title, string description, JObject raw, string preview_image = null, bool is_edit = false, string editing = null)
    {
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

    /// <summary>API Route to duplicate a user preset.</summary>
    public static async Task<JObject> DuplicatePreset(Session session, string preset)
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

    /// <summary>API Route to delete a user preset.</summary>
    public static async Task<JObject> DeletePreset(Session session, string preset)
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

    /// <summary>API Route to get current waiting generation count, model loading count, etc.</summary>
    public static async Task<JObject> GetCurrentStatus(Session session, bool do_debug = false)
    {
        return GetCurrentStatusRaw(session, do_debug);
    }

    /// <summary>API Route to tell all waiting generations in this session to interrupt.</summary>
    public static async Task<JObject> InterruptAll(Session session, bool other_sessions = false)
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

    public static async Task<JObject> ChangeUserSettings(Session session, JObject rawData)
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

    public static async Task<JObject> SetParamEdits(Session session, JObject rawData)
    {
        JObject edits = (JObject)rawData["edits"];
        session.User.Data.RawParamEdits = edits.ToString(Formatting.None);
        session.User.Save();
        return new JObject() { ["success"] = true };
    }

    public static async Task<JObject> GetLanguage(Session session, string language)
    {
        if (!LanguagesHelper.Languages.TryGetValue(language, out LanguagesHelper.Language lang))
        {
            return new JObject() { ["error"] = "No such language." };
        }
        return new JObject() { ["language"] = lang.ToJSON() };
    }

    public static async Task<JObject> ServerDebugMessage(Session session, string message)
    {
        Logs.Info($"User '{session.User.UserID}' sent a debug message: {message}");
        return new JObject() { ["success"] = true };
    }

    public static HashSet<string> AcceptedAPIKeyTypes = ["stability_api", "civitai_api"];

    public static async Task<JObject> SetAPIKey(Session session, string keyType, string key)
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

    public static async Task<JObject> GetAPIKeyStatus(Session session, string keyType)
    {
        string updated = session.User.GetGenericData(keyType, "key_last_updated");
        if (string.IsNullOrWhiteSpace(updated))
        {
            return new JObject() { ["status"] = "not set" };
        }
        return new JObject() { ["status"] = $"last updated {updated}" };
    }
}
