using System.Collections.Concurrent;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Services;
using HotChocolate.Execution;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Keeps this pod's GraphQL executors on the tenant's latest published schema version.
///
/// Publishing raises a version number stored in the tenant database. A pod learns about it in two
/// ways: a Redis message sent on publish (<see cref="OnVersionPublishedAsync"/>, about a second),
/// and, in case that message is lost, a check on gateway requests at most once per poll interval
/// per tenant (<see cref="EnsureCurrentAsync"/>). When the pod is behind it evicts the tenant's
/// executor; HotChocolate rebuilds it in the background and swaps it in, while requests keep being
/// served by the old executor. The request that runs the check is never failed by it.
/// </summary>
public sealed class SchemaVersionTracker
{
    public const string PollSecondsKey = "DataGateway:SchemaVersionPollSeconds";
    public static readonly TimeSpan DefaultPollInterval = TimeSpan.FromSeconds(5);
    public static readonly TimeSpan RetryBackoff = TimeSpan.FromSeconds(30);

    private readonly ConcurrentDictionary<string, TenantCheck> _checks = new(StringComparer.Ordinal);
    private readonly ISchemaVersionStore _versionStore;
    private readonly BuiltSchemaVersions _builtVersions;
    private readonly Lazy<IRequestExecutorResolver> _executorResolver;
    private readonly TimeProvider _timeProvider;
    private readonly TimeSpan _pollInterval;
    private readonly ILogger<SchemaVersionTracker> _logger;

    // The resolver is resolved lazily: it depends on the options monitor, which depends (through
    // the schema configurator) on the same build bookkeeping this tracker reads.
    public SchemaVersionTracker(
        ISchemaVersionStore versionStore,
        BuiltSchemaVersions builtVersions,
        IServiceProvider serviceProvider,
        IConfiguration configuration,
        ILogger<SchemaVersionTracker> logger)
        : this(
            versionStore,
            builtVersions,
            () => serviceProvider.GetRequiredService<IRequestExecutorResolver>(),
            TimeProvider.System,
            ReadPollInterval(configuration),
            logger)
    {
    }

    public SchemaVersionTracker(
        ISchemaVersionStore versionStore,
        BuiltSchemaVersions builtVersions,
        Func<IRequestExecutorResolver> executorResolver,
        TimeProvider timeProvider,
        TimeSpan pollInterval,
        ILogger<SchemaVersionTracker> logger)
    {
        _versionStore = versionStore ?? throw new ArgumentNullException(nameof(versionStore));
        _builtVersions = builtVersions ?? throw new ArgumentNullException(nameof(builtVersions));
        ArgumentNullException.ThrowIfNull(executorResolver);
        _executorResolver = new Lazy<IRequestExecutorResolver>(executorResolver);
        _timeProvider = timeProvider ?? throw new ArgumentNullException(nameof(timeProvider));
        _pollInterval = pollInterval;
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Checks the tenant's published version if the last check is older than the poll interval,
    /// and starts a background rebuild when this pod is behind.
    /// </summary>
    public async ValueTask EnsureCurrentAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        // A tenant this pod has not built yet is built on demand at the latest version.
        if (!_builtVersions.TryGetBuilt(tenantId, out var builtVersion))
        {
            return;
        }

        var check = _checks.GetOrAdd(tenantId, _ => new TenantCheck());
        var now = _timeProvider.GetUtcNow();
        if (now - check.CheckedAt < _pollInterval || !check.TryEnter())
        {
            return;
        }

        try
        {
            check.CheckedAt = now;

            // The Redis copy answers the common case ("nothing changed") cheaply. It can be wrong,
            // so a difference is confirmed against MongoDB before rebuilding.
            var cachedVersion = await _versionStore.GetCachedAsync(tenantId, cancellationToken);
            if (cachedVersion == builtVersion)
            {
                return;
            }

            var currentVersion = await _versionStore.GetAsync(tenantId, cancellationToken);
            _logger.LogDebug("Schema version check for tenant {TenantId}: this pod serves {ServingVersion}, Redis has {CachedVersion}, MongoDB has {Version}",
                tenantId, builtVersion, cachedVersion, currentVersion);
            if (currentVersion != builtVersion)
            {
                RequestRebuild(tenantId, currentVersion, builtVersion, check, now, "version check");
            }
        }
        catch (Exception ex)
        {
            // The pod keeps serving what it has and checks again after the poll interval.
            _logger.LogWarning(ex, "Could not check the published schema version for tenant {TenantId}; this pod keeps serving version {ServingVersion}",
                tenantId, builtVersion);
        }
        finally
        {
            check.Exit();
        }
    }

    /// <summary>
    /// Handles a publish announced by another pod: checks MongoDB for the tenant straight away
    /// instead of waiting for the next poll. The message only triggers the check, so a stale or
    /// unexpected message can at worst cost one read.
    /// </summary>
    public async Task OnVersionPublishedAsync(string tenantId, long version, CancellationToken cancellationToken = default)
    {
        // A message for the version this pod already serves (or a tenant it has not built) needs
        // nothing. An older version is not ignored: a rollback announces one. Late or out-of-order
        // messages are harmless because MongoDB is checked before rebuilding.
        if (!_builtVersions.TryGetBuilt(tenantId, out var builtVersion) || builtVersion == version)
        {
            _logger.LogDebug("Schema publish message for tenant {TenantId}, version {Version}: nothing to do on this pod", tenantId, version);
            return;
        }

        try
        {
            var currentVersion = await _versionStore.GetAsync(tenantId, cancellationToken);
            _logger.LogDebug("Schema publish message for tenant {TenantId}, version {AnnouncedVersion}: this pod serves {ServingVersion}, MongoDB has {Version}",
                tenantId, version, builtVersion, currentVersion);
            if (currentVersion != builtVersion)
            {
                var check = _checks.GetOrAdd(tenantId, _ => new TenantCheck());
                var now = _timeProvider.GetUtcNow();
                check.CheckedAt = now;
                RequestRebuild(tenantId, currentVersion, builtVersion, check, now, "publish message");
            }
        }
        catch (Exception ex)
        {
            // The next version check (on the tenant's next request) catches up instead.
            _logger.LogWarning(ex, "Could not check the published schema version for tenant {TenantId} after a publish message for version {Version}; this pod keeps serving version {ServingVersion} until its next check",
                tenantId, version, builtVersion);
        }
    }

    /// <summary>
    /// Rebuilds the tenant's executor right away, without waiting for the next check, and waits
    /// (up to <paramref name="timeout"/>) until the new executor is serving. Used on the pod that
    /// handled the publish, so a request sent right after the publish sees the new schema. A
    /// tenant this pod has not built yet needs nothing: it is built at the latest version on its
    /// first request. Returns false only if the rebuild did not finish in time.
    /// </summary>
    /// <param name="exactVersion">
    /// Wait for exactly <paramref name="version"/> (a rollback, which moves to an older version)
    /// rather than for that version or a newer one (a publish, which a later publish may overtake).
    /// </param>
    public async Task<bool> RebuildNowAsync(string tenantId, long version, TimeSpan timeout, CancellationToken cancellationToken = default, bool exactVersion = false)
    {
        if (!_builtVersions.TryGetBuilt(tenantId, out var builtVersion)
            || builtVersion == version
            || (!exactVersion && builtVersion > version))
        {
            return true;
        }

        var check = _checks.GetOrAdd(tenantId, _ => new TenantCheck());
        var now = _timeProvider.GetUtcNow();
        check.CheckedAt = now;

        // The publish announcement may already have started this rebuild; then only wait for it.
        RequestRebuild(tenantId, version, builtVersion, check, now, exactVersion ? "rollback on this pod" : "publish on this pod");

        return await _builtVersions.WaitForBuildAsync(tenantId, version, timeout, cancellationToken, exactVersion);
    }

    private void RequestRebuild(string tenantId, long version, long servingVersion, TenantCheck check, DateTimeOffset now, string trigger)
    {
        using var scope = SchemaLog.BeginScope(_logger, SchemaLog.Rebuild, tenantId, version);
        if (check.RequestedVersion == version)
        {
            // A rebuild that failed leaves the old version in place; retry it, but not on every check.
            if (now - check.RequestedAt < RetryBackoff)
            {
                return;
            }

            // Asked for this version before and still not serving it: the earlier build failed.
            check.Attempts++;
            _logger.LogWarning("Tenant {TenantId} is still on published version {ServingVersion} on this pod; retrying the rebuild to version {Version} (attempt {Attempt}). The build error is logged before this line",
                tenantId, servingVersion, version, check.Attempts);
        }
        else
        {
            check.Attempts = 1;
            _logger.LogInformation("Rebuilding GraphQL schema for tenant {TenantId} from published version {ServingVersion} to {Version} (trigger: {Trigger})",
                tenantId, servingVersion, version, trigger);
        }

        check.RequestedVersion = version;
        check.RequestedAt = now;
        _executorResolver.Value.EvictRequestExecutor(tenantId);
    }

    private static TimeSpan ReadPollInterval(IConfiguration configuration)
    {
        var seconds = configuration?.GetValue<double?>(PollSecondsKey);
        return seconds is > 0 ? TimeSpan.FromSeconds(seconds.Value) : DefaultPollInterval;
    }

    private sealed class TenantCheck
    {
        private int _busy;

        public DateTimeOffset CheckedAt { get; set; } = DateTimeOffset.MinValue;
        public long? RequestedVersion { get; set; }
        public DateTimeOffset RequestedAt { get; set; } = DateTimeOffset.MinValue;
        public int Attempts { get; set; }

        // Only one request per tenant runs the check; the others carry on immediately.
        public bool TryEnter() => Interlocked.CompareExchange(ref _busy, 1, 0) == 0;

        public void Exit() => Volatile.Write(ref _busy, 0);
    }
}
