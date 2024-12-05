using SwarmUI.Utils;
using SwarmUI.Core;
using System.Collections.Concurrent;
using LiteDB;
using SwarmUI.Text2Image;
using FreneticUtilities.FreneticToolkit;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticDataSyntax;

namespace SwarmUI.Accounts;

/// <summary>Core manager for sessions.</summary>
public class SessionHandler
{
    /// <summary>How long the random session ID tokens should be.</summary>
    public int SessionIDLength = 40; // TODO: Configurable

    /// <summary>How long to store sessions for before considering inactive and deleting.</summary>
    public TimeSpan MaxSessionAge = TimeSpan.FromDays(31); // TODO: Configurable

    /// <summary>Map of currently tracked sessions by ID.</summary>
    public ConcurrentDictionary<string, Session> Sessions = new();

    /// <summary>Temporary map of current users. Do not use this directly, use <see cref="GetUser(string)"/>.</summary>
    public ConcurrentDictionary<string, User> Users = new();

    /// <summary>Map of user roles by ID.</summary>
    public ConcurrentDictionary<string, Role> Roles = new();

    /// <summary>Set of permission nodes that this server is familiar with. May expand upon updates, extension loads, etc.</summary>
    public HashSet<string> TrackedPermissions = [];

    /// <summary>ID to use for the local user when in single-user mode.</summary>
    public static string LocalUserID = "local";

    /// <summary>Internal database.</summary>
    public ILiteDatabase Database;

    /// <summary>Internal database (users).</summary>
    public ILiteCollection<User.DatabaseEntry> UserDatabase;

    /// <summary>Internal database (sessions).</summary>
    public ILiteCollection<Session.DatabaseEntry> SessionDatabase;

    /// <summary>Internal database (presets).</summary>
    public ILiteCollection<T2IPreset> T2IPresets;

    /// <summary>Generic user data store.</summary>
    public ILiteCollection<GenericDataStore> GenericData;

    /// <summary>Internal database access locker.</summary>
    public LockObject DBLock = new();

    public User GenericSharedUser;

    /// <summary>Saves persistent data to file.</summary>
    public void Save()
    {
        lock (DBLock)
        {
            FDSSection roleSection = new();
            foreach (Role role in Roles.Values)
            {
                roleSection.SetRoot(role.ID, role.Data.Save(true));
            }
            roleSection.SetRoot("___$tracked", TrackedPermissions);
            roleSection.SaveToFile($"{Program.DataDir}/Roles.fds");
        }
    }

    /// <summary>Keeps the default permission list applied.</summary>
    public void ApplyDefaultPermissions()
    {
        bool any = false;
        foreach (PermInfo perm in Permissions.Registered.Values)
        {
            if (!TrackedPermissions.Contains(perm.ID))
            {
                any = true;
                TrackedPermissions.Add(perm.ID);
                if (perm.Default == PermissionDefault.NOBODY)
                {
                    Roles["owner"].Data.PermissionFlags.Add(perm.ID);
                }
                else if (perm.Default == PermissionDefault.ADMINS)
                {
                    Roles["owner"].Data.PermissionFlags.Add(perm.ID);
                    Roles["admin"].Data.PermissionFlags.Add(perm.ID);
                }
                else if (perm.Default == PermissionDefault.POWERUSERS)
                {
                    Roles["owner"].Data.PermissionFlags.Add(perm.ID);
                    Roles["admin"].Data.PermissionFlags.Add(perm.ID);
                    Roles["poweruser"].Data.PermissionFlags.Add(perm.ID);
                }
                else if (perm.Default == PermissionDefault.USER)
                {
                    Roles["owner"].Data.PermissionFlags.Add(perm.ID);
                    Roles["admin"].Data.PermissionFlags.Add(perm.ID);
                    Roles["poweruser"].Data.PermissionFlags.Add(perm.ID);
                    Roles["user"].Data.PermissionFlags.Add(perm.ID);
                }
                else if (perm.Default == PermissionDefault.GUEST)
                {
                    Roles["owner"].Data.PermissionFlags.Add(perm.ID);
                    Roles["admin"].Data.PermissionFlags.Add(perm.ID);
                    Roles["poweruser"].Data.PermissionFlags.Add(perm.ID);
                    Roles["user"].Data.PermissionFlags.Add(perm.ID);
                    Roles["guest"].Data.PermissionFlags.Add(perm.ID);
                }
            }
        }
        if (any)
        {
            Save();
        }
    }

    /// <summary>Helper for the database to store generic datablobs.</summary>
    public class GenericDataStore
    {
        [BsonId]
        public string ID { get; set; }

        public string Data { get; set; }
    }

    public static int PatchOwnerMaxT2I = 32, PatchOwnerMaxDepth = 5;
    public static bool PatchOwnerAllowUnsafe = false;

    public SessionHandler()
    {
        Database = new LiteDatabase($"{Program.DataDir}/Users.ldb");
        UserDatabase = Database.GetCollection<User.DatabaseEntry>("users");
        SessionDatabase = Database.GetCollection<Session.DatabaseEntry>("sessions");
        T2IPresets = Database.GetCollection<T2IPreset>("t2i_presets");
        GenericData = Database.GetCollection<GenericDataStore>("generic_data");
        FDSSection rolesData = new();
        try
        {
            rolesData = FDSUtility.ReadFile($"{Program.DataDir}/Roles.fds");
        }
        catch (Exception) { }
        foreach (string id in rolesData.GetRootKeys())
        {
            Roles[id] = new Role(id);
            Roles[id].Data.Load(rolesData.GetSection(id));
        }
        TrackedPermissions = [.. (rolesData.GetRootData("___$tracked") ?? new(new List<FDSData>())).AsStringList];
        if (!Roles.ContainsKey("owner"))
        {
            Role r = new("owner") { IsAutoGenerated = true, Data = new() };
            Roles["owner"] = r;
            r.Data.Name = "Owner";
            r.Data.Description = "(Auto Generated Role, cannot delete). The owner of the server, local user when account system is disabled. Generally should have all permissions ever always.";
            r.Data.MaxT2ISimultaneous = PatchOwnerMaxT2I;
            r.Data.MaxOutPathDepth = PatchOwnerMaxDepth;
            r.Data.AllowUnsafeOutpaths = PatchOwnerAllowUnsafe;
        }
        if (!Roles.ContainsKey("admin"))
        {
            Role r = new("admin") { IsAutoGenerated = true, Data = new() };
            Roles["admin"] = r;
            r.Data.Name = "Admin";
            r.Data.Description = "(Auto Generated Role, cannot delete). An administrator of the server, has near-total control.";
        }
        if (!Roles.ContainsKey("poweruser"))
        {
            Role r = new("poweruser") { IsAutoGenerated = true, Data = new() };
            Roles["poweruser"] = r;
            r.Data.Name = "PowerUser";
            r.Data.Description = "(Auto Generated Role, cannot delete). A very advanced, and trusted, user. Has access to things that could be dangerous or can be maliciously abused.";
        }
        if (!Roles.ContainsKey("user"))
        {
            Role r = new("user") { IsAutoGenerated = true, Data = new() };
            Roles["user"] = r;
            r.Data.Name = "User";
            r.Data.Description = "(Auto Generated Role, cannot delete). A general user. The default role for valid accounts.";
        }
        if (!Roles.ContainsKey("guest"))
        {
            Role r = new("guest") { IsAutoGenerated = true, Data = new() };
            Roles["guest"] = r;
            r.Data.Name = "Guest";
            r.Data.Description = "(Auto Generated Role, cannot delete). An unregistered or unverified guest account. Only when public unverified access is enabled.";
        }
        ApplyDefaultPermissions();
        GenericSharedUser = GetUser("__shared");
        Utilities.RunCheckedTask(async () =>
        {
            await Task.Delay(TimeSpan.FromSeconds(10), Program.GlobalProgramCancel);
            CleanOldSessions();
        });
    }

    public void CleanOldSessions()
    {
        long cutOffTimeUTC = DateTimeOffset.UtcNow.Subtract(MaxSessionAge).ToUnixTimeSeconds();
        lock (DBLock)
        {
            foreach (Session.DatabaseEntry sess in SessionDatabase.FindAll())
            {
                if (sess.LastActiveUnixTime < cutOffTimeUTC)
                {
                    SessionDatabase.Delete(sess.ID);
                }
            }
        }
    }

    public Session CreateAdminSession(string source, string userId = null)
    {
        if (HasShutdown)
        {
            throw new SwarmReadableErrorException("Session handler is shutting down.");
        }
        userId ??= LocalUserID;
        User user = GetUser(userId);
        Logs.Info($"Creating new admin session '{userId}' for {source}");
        for (int i = 0; i < 1000; i++)
        {
            Session sess = new()
            {
                ID = Utilities.SecureRandomHex(SessionIDLength),
                OriginAddress = source,
                User = user
            };
            if (Sessions.TryAdd(sess.ID, sess))
            {
                sess.User.CurrentSessions[sess.ID] = sess;
                lock (DBLock)
                {
                    SessionDatabase.Upsert(sess.MakeDBEntry());
                }
                return sess;
            }
        }
        throw new SwarmReadableErrorException("Something is critically wrong in the session handler, cannot generate unique IDs!");
    }

    /// <summary>Gets or creates the user for the given ID.</summary>
    public User GetUser(string userId)
    {
        userId = Utilities.StrictFilenameClean(userId).Replace("/", "");
        if (userId.Length == 0)
        {
            userId = "_";
        }
        if (Users.TryGetValue(userId, out User user))
        {
            return user;
        }
        lock (DBLock)
        {
            return Users.GetOrAdd(userId, _ => // Intentional GetOrAdd due to special locking requirements (DBLock)
            {
                User.DatabaseEntry userData = UserDatabase.FindById(userId);
                userData ??= new() { ID = userId, RawSettings = "\n" };
                return new(this, userData);
            });
        }
    }

    /// <summary>Tries to get the session for an id.</summary>
    /// <returns><see cref="true"/> if found, otherwise <see cref="false"/>.</returns>
    public bool TryGetSession(string id, out Session session)
    {
        if (Sessions.TryGetValue(id, out session))
        {
            return true;
        }
        lock (DBLock)
        {
            if (Sessions.TryGetValue(id, out session)) // double-check inside lock
            {
                return true;
            }
            Session.DatabaseEntry existing = SessionDatabase.FindById(id);
            if (existing is not null)
            {
                session = new()
                {
                    ID = existing.ID,
                    OriginAddress = existing.OriginAddress,
                    User = GetUser(existing.UserID)
                };
                if (Sessions.TryAdd(session.ID, session))
                {
                    session.User.CurrentSessions[session.ID] = session;
                    SessionDatabase.Upsert(session.MakeDBEntry());
                    return true;
                }
            }
        }
        session = null;
        return false;
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
        Logs.Info("Will shut down session handler...");
        lock (DBLock)
        {
            Save();
            Sessions.Clear();
            Logs.Info("Will save user data.");
            Database.Dispose();
        }
        Logs.Info("Session handler is shut down.");
    }
}
