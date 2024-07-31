namespace SwarmUI.Utils;

/// <summary>Represents an error inside swarm with a plaintext English message to display.</summary>
public class SwarmReadableErrorException(string message) : InvalidOperationException(message)
{
}

/// <summary>Represents an error caused by the user, with a plaintext English message to display.</summary>
public class SwarmUserErrorException(string message) : SwarmReadableErrorException(message)
{
}
