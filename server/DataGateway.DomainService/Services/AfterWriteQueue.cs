using System.Threading.Channels;
using Blocks.Genesis;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

/// <summary>Work that runs after a write, off the request: the change event and the bulk notification.</summary>
public interface IAfterWriteQueue
{
    /// <summary>
    /// Queues <paramref name="work"/> with a copy of the caller's context and a delegation grant for the
    /// caller. Waits only for the grant, never for the work; false (and a warning) when the queue is full
    /// or stopped, and the work is dropped.
    /// </summary>
    Task<bool> EnqueueAsync(Func<Task> work);
}

/// <summary>
/// In-process queue for after-write work, so the response does not wait for the message bus or the
/// notifier. Each item carries a copy of the request context (BlocksContext and the request tenant) taken
/// at enqueue time; the worker sets it before the item and clears it after, so an item always runs with
/// the tenant and user of the write that queued it and never with the previous item's. One reader keeps
/// the items in write order. Best effort: items still queued when the process dies are lost.
/// <para>
/// A message sent from an item must still carry the caller's delegation grant, so a workflow it triggers
/// can act as that caller (Blocks Authentication). Genesis creates that grant at send time from
/// <c>HttpContext.User</c>, which no longer exists when the item runs. So a grant is created at enqueue,
/// while the request is in scope, and held for the item: Genesis then chains the message's own grant from
/// it. The held grant is removed once the item has run.
/// </para>
/// </summary>
public sealed class AfterWriteQueue : BackgroundService, IAfterWriteQueue
{
    // Items hold record data (a bulk chunk is up to 192 KB): 1,000 caps the queue near 190 MB.
    public const int Capacity = 1_000;
    private static readonly TimeSpan DrainTimeout = TimeSpan.FromSeconds(10);

    /// <summary>Lifetime of the held grant: covers the queue's wait; it is removed as soon as the item has run.</summary>
    public static readonly TimeSpan HeldGrantTtl = TimeSpan.FromHours(1);

    private readonly Channel<AfterWriteItem> _channel = Channel.CreateBounded<AfterWriteItem>(
        new BoundedChannelOptions(Capacity) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
    private readonly ILogger<AfterWriteQueue> _logger;
    private readonly IDelegationGrantFactory? _grantFactory;
    private readonly IDelegationGrantStore? _grantStore;

    public AfterWriteQueue(
        ILogger<AfterWriteQueue> logger,
        IDelegationGrantFactory? grantFactory = null,
        IDelegationGrantStore? grantStore = null)
    {
        _logger = logger;
        _grantFactory = grantFactory;
        _grantStore = grantStore;
    }

    public async Task<bool> EnqueueAsync(Func<Task> work)
    {
        var context = BlocksContext.GetContext();
        var request = CopyRequest(RequestContextAccessor.Current);
        var grant = context is { IsAuthenticated: true } ? await CreateHeldGrantAsync() : null;

        if (_channel.Writer.TryWrite(new AfterWriteItem(work, context, request, grant)))
            return true;

        _logger.LogWarning("After-write queue is full or stopped; a change event or notification was dropped");
        await ReleaseHeldGrantAsync(grant);
        return false;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var item in _channel.Reader.ReadAllAsync(stoppingToken))
                await RunAsync(item);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down: StopAsync runs what is left.
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _channel.Writer.TryComplete();
        await base.StopAsync(cancellationToken);

        using var drain = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        drain.CancelAfter(DrainTimeout);
        while (!drain.IsCancellationRequested && _channel.Reader.TryRead(out var item))
            await RunAsync(item);
    }

    private async Task RunAsync(AfterWriteItem item)
    {
        try
        {
            BlocksContext.SetContext(item.Context);
            RequestContextAccessor.Current = item.Request;
            DelegatedTokenContext.Set(item.Grant);
            await item.Work();
        }
        catch (Exception ex)
        {
            // Only the type: a message could hold record data.
            _logger.LogError("After-write work failed: {ErrorType}", ex.GetType().Name); // NOSONAR S6667 — type only
        }
        finally
        {
            DelegatedTokenContext.Clear();
            BlocksContext.ClearContext();
            RequestContextAccessor.Clear();
            await ReleaseHeldGrantAsync(item.Grant);
        }
    }

    /// <summary>A grant for the caller of this request, or null (no caller, or it could not be created).</summary>
    private async Task<string?> CreateHeldGrantAsync()
    {
        if (_grantFactory is null) return null;
        try
        {
            return await _grantFactory.CreateForSendAsync(HeldGrantTtl);
        }
        catch (Exception ex)
        {
            // The write must not fail over delegation: the item still runs, its message without a grant.
            _logger.LogWarning("Could not create the delegation grant for after-write work: {ErrorType}", ex.GetType().Name);
            return null;
        }
    }

    private async Task ReleaseHeldGrantAsync(string? grant)
    {
        if (grant is null || _grantStore is null) return;
        try
        {
            await _grantStore.DeleteAsync(grant);
        }
        catch (Exception ex)
        {
            // Not fatal: the grant expires on its own after HeldGrantTtl.
            _logger.LogWarning("Could not remove the held delegation grant: {ErrorType}", ex.GetType().Name);
        }
    }

    // A copy without the HttpContext: the request is over when the item runs.
    private static RequestContext CopyRequest(RequestContext current) => new()
    {
        BlocksKey = current.BlocksKey,
        TenantId = current.TenantId,
        RequestUri = current.RequestUri,
        RequestPath = current.RequestPath,
        UserId = current.UserId,
        IsRequestFromBlocksCloud = current.IsRequestFromBlocksCloud,
    };

    private sealed record AfterWriteItem(Func<Task> Work, BlocksContext? Context, RequestContext Request, string? Grant);
}
