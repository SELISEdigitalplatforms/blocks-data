using Microsoft.Extensions.Logging;

namespace XUnitTest.Infrastructure;

/// <summary>One log line as written: level, rendered message, exception, its fields, and the scopes it was written in.</summary>
public sealed record RecordedLog(
    string Category,
    LogLevel Level,
    string Message,
    Exception? Exception,
    IReadOnlyDictionary<string, object?> Fields,
    IReadOnlyList<IReadOnlyDictionary<string, object?>> Scopes)
{
    /// <summary>A field of the line itself or, failing that, of the innermost scope that has it.</summary>
    public object? Field(string name) =>
        Fields.TryGetValue(name, out var value) ? value
        : Scopes.Reverse().FirstOrDefault(s => s.ContainsKey(name))?[name];

    /// <summary>Everything this line would write, for checking that a value never reaches the logs.</summary>
    public string AllText() => string.Join(" | ",
        new[] { Message, Exception?.ToString() ?? string.Empty }
            .Concat(Fields.Values.Select(v => v?.ToString() ?? string.Empty))
            .Concat(Scopes.SelectMany(s => s.Values).Select(v => v?.ToString() ?? string.Empty)));
}

/// <summary>Records every log line of every category, with its scopes, for tests that check what is logged.</summary>
public sealed class RecordingLoggerProvider : ILoggerProvider, ISupportExternalScope
{
    private readonly List<RecordedLog> _logs = new();
    private IExternalScopeProvider _scopes = new LoggerExternalScopeProvider();

    public IReadOnlyList<RecordedLog> Logs
    {
        get
        {
            lock (_logs)
            {
                return _logs.ToList();
            }
        }
    }

    public ILogger CreateLogger(string categoryName) => new RecordingLogger(this, categoryName);

    public ILogger<T> CreateLogger<T>() => new Logger<T>(new SingleProviderFactory(this));

    public void SetScopeProvider(IExternalScopeProvider scopeProvider) => _scopes = scopeProvider;

    public void Dispose()
    {
    }

    private void Add(RecordedLog log)
    {
        lock (_logs)
        {
            _logs.Add(log);
        }
    }

    private static IReadOnlyDictionary<string, object?> ToFields(object? state) =>
        state is IEnumerable<KeyValuePair<string, object?>> pairs
            ? pairs.Where(p => p.Key != "{OriginalFormat}").GroupBy(p => p.Key).ToDictionary(g => g.Key, g => g.Last().Value)
            : new Dictionary<string, object?>();

    private sealed class RecordingLogger(RecordingLoggerProvider provider, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => provider._scopes.Push(state);

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var scopes = new List<IReadOnlyDictionary<string, object?>>();
            provider._scopes.ForEachScope((scope, list) => list.Add(ToFields(scope)), scopes);
            provider.Add(new RecordedLog(category, logLevel, formatter(state, exception), exception, ToFields(state), scopes));
        }
    }

    private sealed class SingleProviderFactory(RecordingLoggerProvider provider) : ILoggerFactory
    {
        public ILogger CreateLogger(string categoryName) => provider.CreateLogger(categoryName);

        public void AddProvider(ILoggerProvider loggerProvider)
        {
        }

        public void Dispose()
        {
        }
    }
}
