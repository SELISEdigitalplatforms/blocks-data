using HotChocolate;
using HotChocolate.Execution.Configuration;
using Microsoft.Extensions.Options;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// A request executor options monitor that allows an executor to be resolved for <b>any</b>
/// schema name (i.e. any project slug), not just names registered at startup.
///
/// HotChocolate's default monitor only knows about schema names registered through
/// <c>AddGraphQLServer(name)</c>. In a multi-project setup projects are created at runtime, so we
/// cannot pre-register a named server for each of them. Instead, every requested schema name is
/// served with the configuration registered for the default schema (the "template"), which already
/// contains the AspNetCore integration, the response formatter and the per-project schema builder
/// hook (<c>ConfigureSchemaAsync</c>). The hook differentiates the schema per project by reading the
/// current project slug from the request context at build time.
///
/// This mirrors <c>DefaultRequestExecutorOptionsMonitor</c> but maps every name to the template
/// configuration so that <c>IRequestExecutorResolver.GetRequestExecutorAsync(projectSlug)</c> works
/// for arbitrary, dynamically created projects without an application restart.
/// </summary>
public sealed class ProjectExecutorOptionsMonitor : IRequestExecutorOptionsMonitor, IDisposable
{
    private readonly IOptionsMonitor<RequestExecutorSetup> _optionsMonitor;
    private readonly IRequestExecutorOptionsProvider[] _optionsProviders;
    private readonly SemaphoreSlim _semaphore = new(1, 1);
    private readonly Dictionary<string, List<IConfigureRequestExecutorSetup>> _configs = new();
    private readonly List<IDisposable> _disposables = new();
    private readonly List<Action<string>> _listeners = new();
    private bool _initialized;
    private bool _disposed;

    public ProjectExecutorOptionsMonitor(
        IOptionsMonitor<RequestExecutorSetup> optionsMonitor,
        IEnumerable<IRequestExecutorOptionsProvider> optionsProviders)
    {
        _optionsMonitor = optionsMonitor;
        _optionsProviders = optionsProviders.ToArray();
    }

    public async ValueTask<RequestExecutorSetup> GetAsync(
        string schemaName,
        CancellationToken cancellationToken = default)
    {
        await TryInitializeAsync(cancellationToken).ConfigureAwait(false);

        // Every project slug is configured from the default ("template") schema configuration.
        var options = new RequestExecutorSetup();
        _optionsMonitor.Get(Schema.DefaultName).CopyTo(options);

        if (_configs.TryGetValue(Schema.DefaultName, out var configurations))
        {
            foreach (var configuration in configurations)
            {
                configuration.Configure(options);
            }
        }

        return options;
    }

    public IDisposable OnChange(Action<string> listener)
        => new Session(this, listener);

    private async ValueTask TryInitializeAsync(CancellationToken cancellationToken)
    {
        if (_initialized)
        {
            return;
        }

        await _semaphore.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            if (_initialized)
            {
                return;
            }

            _configs.Clear();

            foreach (var provider in _optionsProviders)
            {
                _disposables.Add(provider.OnChange(OnProviderChange));

                var allConfigurations =
                    await provider.GetOptionsAsync(cancellationToken).ConfigureAwait(false);

                foreach (var configuration in allConfigurations)
                {
                    if (!_configs.TryGetValue(configuration.SchemaName, out var configurations))
                    {
                        configurations = new List<IConfigureRequestExecutorSetup>();
                        _configs.Add(configuration.SchemaName, configurations);
                    }

                    configurations.Add(configuration);
                }
            }

            _initialized = true;
        }
        finally
        {
            _semaphore.Release();
        }
    }

    /// <summary>
    /// Notifies HC's executor resolver that the schema for <paramref name="schemaName"/> has
    /// changed, causing HC to evict it through its own internal eviction path. More reliable than
    /// calling <c>IRequestExecutorResolver.EvictRequestExecutor</c> directly.
    /// </summary>
    public void TriggerEviction(string schemaName)
    {
        lock (_listeners)
        {
            foreach (var listener in _listeners)
            {
                listener.Invoke(schemaName);
            }
        }
    }

    private void OnProviderChange(IConfigureRequestExecutorSetup changes)
    {
        _initialized = false;

        lock (_listeners)
        {
            // The template configuration backs every project, so notify listeners using the
            // default name; per-project executors are reloaded explicitly via eviction.
            foreach (var listener in _listeners)
            {
                listener.Invoke(Schema.DefaultName);
            }
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _semaphore.Dispose();
        foreach (var disposable in _disposables)
        {
            disposable.Dispose();
        }

        _disposed = true;
    }

    private sealed class Session : IDisposable
    {
        private readonly ProjectExecutorOptionsMonitor _monitor;
        private readonly Action<string> _listener;

        public Session(ProjectExecutorOptionsMonitor monitor, Action<string> listener)
        {
            _monitor = monitor;
            _listener = listener;
            lock (monitor._listeners)
            {
                monitor._listeners.Add(listener);
            }
        }

        public void Dispose()
        {
            lock (_monitor._listeners)
            {
                _monitor._listeners.Remove(_listener);
            }
        }
    }
}
