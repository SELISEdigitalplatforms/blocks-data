using System.Collections.Concurrent;
using System.Diagnostics;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Records which published schema version this pod's executor for each tenant was built from.
///
/// A build is recorded in two steps because HotChocolate builds in two: the schema hook reads the
/// version and loads the definitions (<see cref="BeginBuild"/>), and only once the executor has
/// actually been created is that version current (<see cref="CompleteBuild"/>). A failed build
/// never completes, so the pod keeps reporting the version it is really serving. HotChocolate
/// serialises builds per schema name, so a tenant has at most one build in flight.
/// </summary>
public sealed class BuiltSchemaVersions
{
    private readonly ConcurrentDictionary<string, PendingBuild> _pending = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, long> _built = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, TaskCompletionSource> _buildCompleted = new(StringComparer.Ordinal);

    public void BeginBuild(string tenantId, long version) =>
        _pending[tenantId] = new PendingBuild(version, Stopwatch.GetTimestamp());

    /// <summary>
    /// Records the pending build as the version now served. Returns what changed (for the log),
    /// or null when no build was pending.
    /// </summary>
    public CompletedBuild? CompleteBuild(string tenantId)
    {
        if (!_pending.TryRemove(tenantId, out var pending))
        {
            return null;
        }

        long? previousVersion = _built.TryGetValue(tenantId, out var previous) ? previous : null;
        _built[tenantId] = pending.Version;
        if (_buildCompleted.TryRemove(tenantId, out var completed))
        {
            completed.TrySetResult();
        }

        return new CompletedBuild(pending.Version, previousVersion, Stopwatch.GetElapsedTime(pending.StartedTimestamp));
    }

    /// <summary>The version this pod is serving for the tenant; false when it has not built it yet.</summary>
    public bool TryGetBuilt(string tenantId, out long version) => _built.TryGetValue(tenantId, out version);

    /// <summary>
    /// Waits until this pod serves <paramref name="version"/> (or, unless
    /// <paramref name="exactVersion"/>, a newer one) for the tenant. Returns false if that has not
    /// happened within <paramref name="timeout"/>, e.g. because the rebuild failed and the previous
    /// executor is still serving.
    /// </summary>
    public async Task<bool> WaitForBuildAsync(string tenantId, long version, TimeSpan timeout, CancellationToken cancellationToken = default, bool exactVersion = false)
    {
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);

        while (true)
        {
            // Take the signal before checking, so a build that completes in between still wakes us.
            var completed = _buildCompleted.GetOrAdd(tenantId,
                _ => new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously)).Task;

            if (TryGetBuilt(tenantId, out var built) && (built == version || (!exactVersion && built > version)))
            {
                return true;
            }

            try
            {
                await completed.WaitAsync(timeoutSource.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return false;
            }
        }
    }

    private readonly record struct PendingBuild(long Version, long StartedTimestamp);
}

/// <summary>A finished build: the version now served, the one it replaced (null for the first build), and how long the build took.</summary>
public readonly record struct CompletedBuild(long Version, long? PreviousVersion, TimeSpan Elapsed);
