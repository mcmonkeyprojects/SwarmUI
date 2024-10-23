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
