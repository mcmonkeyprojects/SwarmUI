using FreneticUtilities.FreneticToolkit;
using FreneticUtilities.FreneticDataSyntax;
using LiteDB;
using SwarmUI.Core;
using SwarmUI.DataHolders;
using SwarmUI.Utils;
using SwarmUI.Text2Image;
using FreneticUtilities.FreneticExtensions;
using System.Security.Cryptography;

namespace SwarmUI.Accounts;

/// <summary>Represents a single user account.</summary>
public class User
{
    /// <summary>Data for the user that goes directly to the database.</summary>
    public class DatabaseEntry
    {
        [BsonId]
        public string ID { get; set; }

        /// <summary>What presets this user has saved, matched to the preset database.</summary>
        public List<string> Presets { get; set; } = [];

        /// <summary>This users stored settings data.</summary>
        public string RawSettings { get; set; } = "";

        /// <summary>JSON blob of user customized parameter edits (if any).</summary>
        public string RawParamEdits { get; set; } = "";
    }

    public User(SessionHandler sessions, DatabaseEntry data)
    {
        SessionHandlerSource = sessions;
        Data = data;
        Settings.Load(Program.ServerSettings.DefaultUser.Save(false));
        foreach (string field in Settings.InternalData.SharedData.Fields.Keys)
        {
            Settings.TrySetFieldModified(field, false);
        }
        Restrictions.Load(Program.ServerSettings.DefaultUserRestriction.Save(false));
        foreach (string field in Restrictions.InternalData.SharedData.Fields.Keys)
        {
            Restrictions.TrySetFieldModified(field, false);
        }
        FDSSection settingsRaw = new(data.RawSettings);
        // TODO: Legacy format patch from beta 0.9.2!
        bool? autoCompleteEscapeParens = settingsRaw.GetBool("AutoCompleteEscapeParens", null);
        if (autoCompleteEscapeParens.HasValue)
        {
            settingsRaw.Set("AutoComplete.EscapeParens", autoCompleteEscapeParens.Value);
        }
        string autoCompleteSource = settingsRaw.GetString("AutoCompletionsSource", null);
        if (autoCompleteSource is not null)
        {
            settingsRaw.Set("AutoComplete.Source", autoCompleteSource);
        }
        string autoCompleteSuffix = settingsRaw.GetString("AutoCompleteSuffix", null);
        if (autoCompleteSuffix is not null)
        {
            settingsRaw.Set("AutoComplete.Suffix", autoCompleteSuffix);
        }
        Settings.Load(settingsRaw);
    }

    /// <summary>Save this user's data to the internal user database.</summary>
    public void Save()
    {
        Data.RawSettings = Settings.Save(false).ToString();
        lock (SessionHandlerSource.DBLock)
        {
            SessionHandlerSource.UserDatabase.Upsert(Data);
        }
    }

    /// <summary>Returns the user generic-data for the given name, or null if not found.</summary>
    public string GetGenericData(string dataname, string name)
    {
        lock (SessionHandlerSource.DBLock)
        {
            return SessionHandlerSource.GenericData.FindById($"{UserID}///${dataname}///{name.ToLowerFast()}")?.Data;
        }
    }

    /// <summary>Returns a list of all generic-data IDs this user has saved.</summary>
    public List<string> ListAllGenericData(string dataname)
    {
        return GetAllGenericData(dataname).Select(d => d.ID.After("///").After("///")).ToList();
    }

    /// <summary>Returns a list of all generic-data this user has saved.</summary>
    public List<SessionHandler.GenericDataStore> GetAllGenericData(string dataname)
    {
        lock (SessionHandlerSource.DBLock)
        {
            string id = $"{UserID}///${dataname}///";
            try
            {
                return SessionHandlerSource.GenericData.Find(b => b.ID.StartsWith(id)).ToList();
            }
            catch (Exception ex)
            {
                Logs.Error($"Error loading generic-data for user {UserID}: {ex.ReadableString()}");
                return [];
            }
        }
    }

    /// <summary>Saves a new generic-data on the user's account.</summary>
    public void SaveGenericData(string dataname, string name, string data)
    {
        lock (SessionHandlerSource.DBLock)
        {
            SessionHandler.GenericDataStore dataStore = new() { ID = $"{UserID}///${dataname}///{name.ToLowerFast()}", Data = data };
            SessionHandlerSource.GenericData.Upsert(dataStore.ID, dataStore);
        }
    }

    /// <summary>Deletes a user generic-data, returns true if anything was deleted.</summary>
    public bool DeleteGenericData(string dataname, string name)
    {
        lock (SessionHandlerSource.DBLock)
        {
            return SessionHandlerSource.GenericData.Delete($"{UserID}///${dataname}///{name.ToLowerFast()}");
        }
    }

    /// <summary>Returns the user preset for the given name, or null if not found.</summary>
    public T2IPreset GetPreset(string name)
    {
        lock (SessionHandlerSource.DBLock)
        {
            return SessionHandlerSource.T2IPresets.FindById($"{UserID}///{name.ToLowerFast()}");
        }
    }

    /// <summary>Returns a list of all presets this user has saved.</summary>
    public List<T2IPreset> GetAllPresets()
    {
        lock (SessionHandlerSource.DBLock)
        {
            try
            {
                List<T2IPreset> presets = Data.Presets.Select(p => SessionHandlerSource.T2IPresets.FindById(p)).ToList();
                if (presets.Any(p => p is null))
                {
                    List<string> bad = Data.Presets.Where(p => SessionHandlerSource.T2IPresets.FindById(p) is null).ToList();
                    Logs.Error($"User {UserID} has presets that don't exist (database error?): {string.Join(", ", bad)}");
                    presets.RemoveAll(p => p is null);
                    Data.Presets.RemoveAll(bad.Contains);
                    Save();
                }
                return presets;
            }
            catch (Exception ex)
            {
                Logs.Error($"Error loading presets for user {UserID}: {ex.ReadableString()}");
                return [];
            }
        }
    }

    /// <summary>Saves a new preset on the user's account.</summary>
    public void SavePreset(T2IPreset preset)
    {
        lock (SessionHandlerSource.DBLock)
        {
            preset.ID = $"{UserID}///{preset.Title.ToLowerFast()}";
            SessionHandlerSource.T2IPresets.Upsert(preset.ID, preset);
            if (!Data.Presets.Contains(preset.ID))
            {
                Data.Presets.Add(preset.ID);
            }
            Save();
        }
    }

    /// <summary>Deletes a user preset, returns true if anything was deleted.</summary>
    public bool DeletePreset(string name)
    {
        lock (SessionHandlerSource.DBLock)
        {
            string id = $"{UserID}///{name.ToLowerFast()}";
            if (Data.Presets.Remove(id))
            {
                SessionHandlerSource.T2IPresets.Delete(id);
                Save();
                return true;
            }
            return false;
        }
    }

    /// <summary>The relevant sessions handler backend.</summary>
    public SessionHandler SessionHandlerSource;

    /// <summary>Any/all current sessions for this user account.</summary>
    public ConcurrentDictionary<string, Session> CurrentSessions = new();

    /// <summary>Core data for this user in the backend database.</summary>
    public DatabaseEntry Data;

    /// <summary>The short static User-ID for this user.</summary>
    public string UserID => Data.ID;

    /// <summary>What restrictions apply to this user.</summary>
    public Settings.UserRestriction Restrictions = new();

    /// <summary>This user's settings.</summary>
    public Settings.User Settings = new();

    /// <summary>Path to the output directory appropriate to this session.</summary>
    public string OutputDirectory => Program.ServerSettings.Paths.AppendUserNameToOutputPath ? $"{Program.ServerSettings.Paths.OutputPath}/{UserID}" : Program.ServerSettings.Paths.OutputPath;

    /// <summary>Lock object for this user's data.</summary>
    public LockObject UserLock = new();

    /// <summary><see cref="Environment.TickCount64"/> value for the last time this user was seen as currently connected.</summary>
    public long LastTickedPresent = Environment.TickCount64;

    /// <summary><see cref="Environment.TickCount64"/> value for the last time this user triggered a generation, updated a setting, or other 'core action'.</summary>
    public long LastUsedTime = Environment.TickCount64;

    /// <summary>Updates the <see cref="LastTickedPresent"/> to the current time.</summary>
    public void TickIsPresent()
    {
        Volatile.Write(ref LastTickedPresent, Environment.TickCount64);
    }

    /// <summary>Updates the <see cref="LastUsedTime"/> to the current time.</summary>
    public void UpdateLastUsedTime()
    {
        Volatile.Write(ref LastUsedTime, Environment.TickCount64);
    }

    /// <summary>Time since the last action was performed by this user.</summary>
    public TimeSpan TimeSinceLastUsed => TimeSpan.FromMilliseconds(Environment.TickCount64 - Volatile.Read(ref LastUsedTime));

    /// <summary>Time since the last time this user was seen as currently connected.</summary>
    public TimeSpan TimeSinceLastPresent => TimeSpan.FromMilliseconds(Environment.TickCount64 - Volatile.Read(ref LastTickedPresent));

    /// <summary>Returns whether this user has the given generic permission flag.</summary>
    public bool HasGenericPermission(string permName)
    {
        return Restrictions.PermissionFlags.Contains(permName) || Restrictions.PermissionFlags.Contains("*");
    }

    /// <summary>Simplified keynames for things commonly used in ExtraMeta, to allow for OutputPath builder to treat these cases as empty and not errors.</summary>
    public static HashSet<string> KnownExtraMetaVals = ["debugbackend", "scoring", "usedembeddings", "generationtime", "intermediate", "usedwildcards", "swarmversion", "date", "originalprompt", "originalnegativeprompt", "presetsused"];

    /// <summary>Helper for filling output path data.</summary>
    public class OutpathFillHelper
    {
        public DateTimeOffset Time = DateTimeOffset.Now;

        public T2IParamInput UserInput;

        public Dictionary<string, object> ExtraMetaSimplified;

        public User LinkedUser;

        public bool SkipFolders;

        public string BatchID;

        public OutpathFillHelper(T2IParamInput user_input, User user, string batchId)
        {
            UserInput = user_input;
            ExtraMetaSimplified = user_input.ExtraMeta.ToDictionary(p => T2IParamTypes.CleanTypeName(p.Key), p => p.Value);
            LinkedUser = user;
            BatchID = batchId;
            SkipFolders = LinkedUser?.Settings?.OutPathBuilder?.ModelPathsSkipFolders ?? false;
        }

        /// <summary>Simplify a model filename appropriately in accordance with settings. Strips file extensions.</summary>
        public string SimplifyModel(string model)
        {
            model = model.Replace('\\', '/').Trim();
            if (model.EndsWith(".ckpt") || T2IModel.NativelySupportedModelExtensions.Contains(model.AfterLast('.')))
            {
                model = model.BeforeLast('.');
            }
            if (SkipFolders)
            {
                model = model.AfterLast('/');
            }
            return model;
        }

        /// <summary>Quick 8 character hash of some text.</summary>
        public string QuickHash(string val)
        {
            return Utilities.BytesToHex(SHA256.HashData(val.EncodeUTF8())[0..4]);
        }

        public string FillPartUnformatted(string part)
        {
            string data = part switch
            {
                "year" => $"{Time.Year:0000}",
                "month" => $"{Time.Month:00}",
                "month_name" => $"{Time:MMMM}",
                "day" => $"{Time.Day:00}",
                "day_name" => $"{Time:dddd}",
                "hour" => $"{Time.Hour:00}",
                "minute" => $"{Time.Minute:00}",
                "second" => $"{Time.Second:00}",
                "prompt" => UserInput.Get(T2IParamTypes.Prompt),
                "prompthash" => QuickHash(UserInput.Get(T2IParamTypes.Prompt)),
                "negative_prompt" => UserInput.Get(T2IParamTypes.NegativePrompt),
                "negativeprompthash" => QuickHash(UserInput.Get(T2IParamTypes.NegativePrompt)),
                "seed" => $"{UserInput.Get(T2IParamTypes.Seed)}",
                "cfg_scale" => $"{UserInput.Get(T2IParamTypes.CFGScale)}",
                "width" => $"{UserInput.GetImageWidth()}",
                "height" => $"{UserInput.GetImageHeight()}",
                "steps" => $"{UserInput.Get(T2IParamTypes.Steps)}",
                "model" => SimplifyModel(UserInput.Get(T2IParamTypes.Model)?.Name ?? "unknown"),
                "model_title" => UserInput.Get(T2IParamTypes.Model)?.Metadata?.Title ?? "unknown",
                "loras" => UserInput.TryGet(T2IParamTypes.Loras, out List<string> loras) ? loras.Select(SimplifyModel).JoinString("-") : "",
                "batch_id" => BatchID,
                "user_name" => LinkedUser?.UserID ?? "None",
                "number" => "[number]",
                _ => null
            };
            if (data is null)
            {
                string clean = T2IParamTypes.CleanTypeName(part);
                if (T2IParamTypes.TryGetType(clean, out T2IParamType type, UserInput))
                {
                    data = "";
                    if (UserInput.TryGetRaw(type, out object val))
                    {
                        data = $"{T2IParamInput.SimplifyParamVal(val)}";
                        if (val is T2IModel model)
                        {
                            data = SimplifyModel(data);
                        }
                    }
                }
                else if (ExtraMetaSimplified.TryGetValue(clean, out object extraVal))
                {
                    data = $"{T2IParamInput.SimplifyParamVal(extraVal)}";
                }
                else if (KnownExtraMetaVals.Contains(clean))
                {
                    data = "";
                }
            }
            return data;
        }
    }

    /// <summary>Converts the user's output path setting to a real path for the given parameters. Note that the path is partially cleaned, but not completely.</summary>
    public string BuildImageOutputPath(T2IParamInput user_input, int batchIndex)
    {
        int maxLen = Settings.OutPathBuilder.MaxLenPerPart;
        DateTimeOffset time = DateTimeOffset.Now;
        OutpathFillHelper helper = new(user_input, this, $"{batchIndex}");
        string buildPathPart(string part)
        {
            string data = helper.FillPartUnformatted(part) ?? $"[{part}]";
            if (data.Length > maxLen)
            {
                data = data[..maxLen];
            }
            data = Utilities.StrictFilenameClean(data.Replace('\\', '/').Replace("/", ""));
            return data;
        }
        string path = Settings.OutPathBuilder.Format;
        path = StringConversionHelper.QuickSimpleTagFiller(path, "[", "]", buildPathPart, false);
        if (Restrictions.AllowUnsafeOutpaths)
        {
            return path;
        }
        return Utilities.StrictFilenameClean(path);
    }
}
