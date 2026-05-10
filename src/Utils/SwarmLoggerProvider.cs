using Microsoft.Extensions.Logging;

namespace SwarmUI.Utils;

/// <summary>Forwards ASP.NET host logs into Swarm's central log buffers.</summary>
public class SwarmLoggerProvider : ILoggerProvider
{
    /// <inheritdoc/>
    public ILogger CreateLogger(string categoryName)
    {
        return new SwarmLogger(categoryName);
    }

    /// <inheritdoc/>
    public void Dispose()
    {
    }

    /// <summary>Single ASP.NET category logger that writes to <see cref="Logs"/>.</summary>
    private class SwarmLogger(string categoryName) : ILogger
    {
        /// <inheritdoc/>
        public IDisposable BeginScope<TState>(TState state) where TState : notnull
        {
            return NullScope.Instance;
        }

        /// <inheritdoc/>
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel)
        {
            return logLevel != Microsoft.Extensions.Logging.LogLevel.None;
        }

        /// <inheritdoc/>
        public void Log<TState>(Microsoft.Extensions.Logging.LogLevel logLevel, EventId eventId, TState state, Exception exception, Func<TState, Exception, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }
            string message = formatter is null ? (state is null ? null : state.ToString()) : formatter(state, exception);
            if (string.IsNullOrWhiteSpace(message) && exception is null)
            {
                return;
            }
            if (exception is not null)
            {
                message = string.IsNullOrWhiteSpace(message) ? exception.ToString() : $"{message}\n{exception}";
            }
            string eventPart = eventId.Id == 0 ? "" : $" #{eventId.Id}";
            Logs.LogLevel level = ToSwarmLevel(logLevel);
            (ConsoleColor prefixColor, ConsoleColor messageColor, string prefix) = ToConsoleStyle(logLevel);
            Logs.LogWithColor(ConsoleColor.Black, prefixColor, prefix, ConsoleColor.Black, messageColor, $"{categoryName}{eventPart}: {message}", level);
        }

        /// <summary>Maps ASP.NET log levels into Swarm log levels.</summary>
        private static Logs.LogLevel ToSwarmLevel(Microsoft.Extensions.Logging.LogLevel level)
        {
            return level switch
            {
                Microsoft.Extensions.Logging.LogLevel.Trace => Logs.LogLevel.Verbose,
                Microsoft.Extensions.Logging.LogLevel.Debug => Logs.LogLevel.Debug,
                Microsoft.Extensions.Logging.LogLevel.Information => Logs.LogLevel.Info,
                Microsoft.Extensions.Logging.LogLevel.Warning => Logs.LogLevel.Warning,
                Microsoft.Extensions.Logging.LogLevel.Error => Logs.LogLevel.Error,
                Microsoft.Extensions.Logging.LogLevel.Critical => Logs.LogLevel.Error,
                _ => Logs.LogLevel.Debug
            };
        }

        /// <summary>Maps ASP.NET log levels into Swarm console styling.</summary>
        private static (ConsoleColor PrefixColor, ConsoleColor MessageColor, string Prefix) ToConsoleStyle(Microsoft.Extensions.Logging.LogLevel level)
        {
            return level switch
            {
                Microsoft.Extensions.Logging.LogLevel.Trace => (ConsoleColor.Gray, ConsoleColor.Gray, "ASP.NET"),
                Microsoft.Extensions.Logging.LogLevel.Debug => (ConsoleColor.Gray, ConsoleColor.Gray, "ASP.NET"),
                Microsoft.Extensions.Logging.LogLevel.Information => (ConsoleColor.Cyan, ConsoleColor.White, "ASP.NET"),
                Microsoft.Extensions.Logging.LogLevel.Warning => (ConsoleColor.Yellow, ConsoleColor.Yellow, "ASP.NET"),
                Microsoft.Extensions.Logging.LogLevel.Error => (ConsoleColor.Red, ConsoleColor.Red, "ASP.NET"),
                Microsoft.Extensions.Logging.LogLevel.Critical => (ConsoleColor.Red, ConsoleColor.Red, "ASP.NET"),
                _ => (ConsoleColor.Gray, ConsoleColor.Gray, "ASP.NET")
            };
        }
    }

    /// <summary>No-op disposable for unsupported logging scopes.</summary>
    private class NullScope : IDisposable
    {
        /// <summary>Shared singleton instance.</summary>
        public static NullScope Instance = new();

        /// <inheritdoc/>
        public void Dispose()
        {
        }
    }
}
