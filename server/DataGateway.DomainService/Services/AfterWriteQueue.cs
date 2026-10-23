using System.Threading.Channels;
using Blocks.Genesis;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

/// <summary>Work that runs after a write, off the request: the change event and the bulk notification.</summary>
public interface IAfterWriteQueue
{
    /// <summary>
    /// Queues <paramref name="work"/> with a copy of the caller's context. Never waits; false (and a
    /// warning) when the queue is full or stopped, and the work is dropped.
    /// </summary>
    bool Enqueue(Func<Task> work);
}

/// <summary>
/// In-process queue for after-write work, so the response does not wait for the message bus or the
/// notifier. Each item carries a copy of the request context (BlocksContext and the request tenant) taken
/// at enqueue time; the worker sets it before the item and clears it after, so an item always runs with
/// the tenant and user of the write that queued it and never with the previous item's. One reader keeps
/// the items in write order. Best effort: items still queued when the process dies are lost.
/// </summary>
public sealed class AfterWriteQueue : BackgroundService, IAfterWriteQueue
{
    // Items hold record data (a bulk chunk is up to 192 KB): 1,000 caps the queue near 190 MB.
    public const int Capacity = 1_000;
    private static readonly TimeSpan DrainTimeout = TimeSpan.FromSeconds(10);

    private readonly Channel<AfterWriteItem> _channel = Channel.CreateBounded<AfterWriteItem>(
        new BoundedChannelOptions(Capacity) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
    private readonly ILogger<AfterWriteQueue> _logger;

    public AfterWriteQueue(ILogger<AfterWriteQueue> logger)
    {
        _logger = logger;
    }

    public bool Enqueue(Func<Task> work)
    {
        var item = new AfterWriteItem(work, BlocksContext.GetContext(), CopyRequest(RequestContextAccessor.Current));
        if (_channel.Writer.TryWrite(item))
            return true;

        _logger.LogWarning("After-write queue is full or stopped; a change event or notification was dropped");
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
            await item.Work();
        }
        catch (Exception ex)
        {
            // Only the type: a message could hold record data.
            _logger.LogError("After-write work failed: {ErrorType}", ex.GetType().Name); // NOSONAR S6667 — type only
        }
        finally
        {
            BlocksContext.ClearContext();
            RequestContextAccessor.Clear();
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

    private sealed record AfterWriteItem(Func<Task> Work, BlocksContext? Context, RequestContext Request);
}
