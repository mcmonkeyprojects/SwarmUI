namespace SwarmUI.Accounts;

/// <summary>General handler for the available permissions list.</summary>
public static class Permissions
{
    /// <summary>Map of all known registered permissions from their IDs.</summary>
    public static ConcurrentDictionary<string, PermInfo> Registered = [];

    /// <summary>Registers the permission info to the global list, and returns a copy of it.</summary>
    public static PermInfo Register(PermInfo perm)
    {
        if (!Registered.TryAdd(perm.ID, perm))
        {
            throw new InvalidOperationException($"Permission key '{perm.ID}' is already registered.");
        }
        return perm;
    }

    public static PermInfoGroup GroupAdmin = new("Admin", "Permissions for server administration access.");

    public static PermInfo Admin = Register(new("*", "Full Control", "Allows full control over everything.\nA magic wildcard to allow all permissions.\nOnly the owner should have this.", PermissionDefault.NOBODY, GroupAdmin));
    public static PermInfo ConfigureRoles = Register(new("configure_roles", "Configure Roles", "Allows access to role configuration.\nThis is basically total control, as you can give yourself more permissions with this.", PermissionDefault.NOBODY, GroupAdmin));
    public static PermInfo Shutdown = Register(new("shutdown", "Shutdown Server", "Allows the user to fully shut down the server.", PermissionDefault.NOBODY, GroupAdmin));
    public static PermInfo Restart = Register(new("restart", "Restart Server", "Allows the user to fully restart the server.", PermissionDefault.ADMINS, GroupAdmin));
    public static PermInfo ReadServerSettings = Register(new("read_server_settings", "Read Server Settings", "Allows the user to read (but not necessarily edit) server settings.", PermissionDefault.ADMINS, GroupAdmin));
    public static PermInfo EditServerSettings = Register(new("edit_server_settings", "Edit Server Settings", "Allows the user to edit server settings.", PermissionDefault.ADMINS, GroupAdmin));
    public static PermInfo ViewLogs = Register(new("view_logs", "View Server Logs", "Allows the user to view server logs.", PermissionDefault.ADMINS, GroupAdmin));
    public static PermInfo ReadServerInfoPanels = Register(new("read_server_info_panels", "Read Server Info Panels", "Allows the user to read server info panels (resource usage, connected users, ...).", PermissionDefault.ADMINS, GroupAdmin));
    public static PermInfo AdminDebug = Register(new("admin_debug", "Admin Debug APIs", "Allows the user to access administrative debug APIs.", PermissionDefault.ADMINS, GroupAdmin));
    public static PermInfo ManageExtensions = Register(new("manage_extensions", "Manage Extensions", "Allows the user to manage (install, update, remove) extensions.", PermissionDefault.ADMINS, GroupAdmin));

    public static PermInfoGroup GroupBackendsAdmin = new("Backends Admin", "Permissions for managing backends.");

    public static PermInfo ViewBackendsList = Register(new("view_backends_list", "View Backends List", "Allows the user to view the list of available backends.", PermissionDefault.POWERUSERS, GroupBackendsAdmin));
    public static PermInfo AddRemoveBackends = Register(new("add_remove_backends", "Add/Remove Backends", "Allows the user to add or remove backends.", PermissionDefault.ADMINS, GroupBackendsAdmin));
    public static PermInfo EditBackends = Register(new("edit_backends", "Edit Backends", "Allows the user to edit backends.", PermissionDefault.ADMINS, GroupBackendsAdmin));
    public static PermInfo RestartBackends = Register(new("restart_backends", "Restart Backends", "Allows the user to restart backends.", PermissionDefault.POWERUSERS, GroupBackendsAdmin));
    public static PermInfo ToggleBackends = Register(new("toggle_backends", "Toggle Backends", "Allows the user to toggle backends on or off.", PermissionDefault.ADMINS, GroupBackendsAdmin));

    public static PermInfoGroup GroupParams = new("Parameters", "Permissions for basic parameter access.");

    public static PermInfo ModelParams = Register(new("model_params", "Model Params", "Allows the user to select models.", PermissionDefault.USER, GroupParams));
    public static PermInfo ParamBackendType = Register(new("param_backend_type", "Backend Type Parameter", "Allows the user to select a specific backend type.", PermissionDefault.POWERUSERS, GroupParams));
    public static PermInfo ParamBackendID = Register(new("param_backend_id", "Backend ID Parameter", "Allows the user to select a specific backend ID.", PermissionDefault.POWERUSERS, GroupParams));
    public static PermInfo ParamVideo = Register(new("param_video", "Video Params", "Allows the user to generate videos.", PermissionDefault.USER, GroupParams));
    public static PermInfo ParamControlNet = Register(new("param_controlnet", "ControlNet Params", "Allows the user to generate with controlnets.", PermissionDefault.USER, GroupParams));

    public static PermInfoGroup GroupControl = new("Control", "Control over common server functionality.");

    public static PermInfo ControlModelRefresh = Register(new("control_model_refresh", "Control Model Refresh", "Allows this user to refresh model lists.", PermissionDefault.POWERUSERS, GroupParams));
    public static PermInfo InstallFeatures = Register(new("install_features", "Install New Features", "Allows this user to install new features (from the list of safe pre-defined features).", PermissionDefault.POWERUSERS, GroupParams));
    public static PermInfo CreateTRT = Register(new("create_tensorrt", "Create TensorRT Models", "Allows this user to create new TensorRT models.", PermissionDefault.POWERUSERS, GroupParams));
    public static PermInfo ExtractLoRAs = Register(new("extra_loras", "Extract LoRAs", "Allows this user to extra LoRAs.", PermissionDefault.POWERUSERS, GroupParams));
    public static PermInfo ControlMemClean = Register(new("control_mem_clean", "Control Memory Cleaning", "Allows this user to control memory cleaning (eg cleanup VRAM or system RAM usage).", PermissionDefault.POWERUSERS, GroupParams));
    public static PermInfo LoadModelsNow = Register(new("load_models_now", "Load Models Now", "Allows this user to load models immediately across all backends.", PermissionDefault.POWERUSERS, GroupParams));
 
    public static PermInfoGroup GroupUser = new("User", "Permissions related to basic user access.");

    public static PermInfo UserDeleteImage = Register(new("user_delete_image", "User Delete Image", "Allows this user to delete images they generated.", PermissionDefault.USER, GroupParams));
}

/// <summary>Enumeration of default modes for permissions.</summary>
public enum PermissionDefault
{
    /// <summary>Nobody should have this by default (except the server owner).</summary>
    NOBODY = 0,
    /// <summary>Only admins should have this by default, not regular users.</summary>
    ADMINS = 1,
    /// <summary>Only advanced/trusted power users and admins should have this by default, not regular users.</summary>
    POWERUSERS = 2,
    /// <summary>Any registered user can have this by default, it's safe and only permission walled to allow the server owner to disable it.</summary>
    USER = 3,
    /// <summary>An unregistered guest user can use this (if unregistered access is enabled), it's extremely safe.</summary>
    GUEST = 4
}

/// <summary>A grouping of permission flags, purely for UI clarity.</summary>
/// <param name="DisplayName">The human-readable display name of the group.</param>
/// <param name="Description">Human-readable display text of what the group is for.</param>
public record class PermInfoGroup(string DisplayName, string Description)
{
}

/// <summary>Information about a single permission key.</summary>
/// <param name="ID">Short unique identifier of this permission key.</param>
/// <param name="DisplayName">Human-readable display name for the permission.</param>
/// <param name="Description">Simple human-readable description text of what this permission controls.</param>
/// <param name="Default">Who should have this permission by default.</param>
/// <param name="Group">What group this permission is in.</param>
public record class PermInfo(string ID, string DisplayName, string Description, PermissionDefault Default, PermInfoGroup Group)
{
}
