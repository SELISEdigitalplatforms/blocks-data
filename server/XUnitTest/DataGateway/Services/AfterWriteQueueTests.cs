using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// Exercises <see cref="AfterWriteQueue"/>: items run off the caller, with the context captured at
/// enqueue time, in order, and one failing item never stops the next. The hosted service is started
/// and stopped by hand.
/// </summary>
[Collection("ContextSerial")]
public sealed class AfterWriteQueueTests : IDisposable
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);
    private readonly CapturingLogger _logger = new();
    private readonly AfterWriteQueue _queue;

    public AfterWriteQueueTests()
    {
        ClearContext();
        _queue = new AfterWriteQueue(_logger);
    }

    public void Dispose() => ClearContext();

    private static Func<Task> Capture(TaskCompletionSource<(string? Tenant, string? RequestTenant, object? Http)> done) => () =>
    {
        done.SetResult((BlocksContext.GetContext()?.TenantId, RequestContextAccessor.Current.TenantId, RequestContextAccessor.Current.HttpContext));
        return Task.CompletedTask;
    };

    private static TaskCompletionSource<T> NewSource<T>() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    [Fact]
    public async Task Enqueue_ItemRunsWithTheContextCapturedAtEnqueue()
    {
        var done = NewSource<(string? Tenant, string? RequestTenant, object? Http)>();
        await _queue.StartAsync(CancellationToken.None);
        BlocksTestContext.Set(tenantId: "tenant-a");
        RequestContextAccessor.Current = new RequestContext { TenantId = "tenant-a" };

        _queue.Enqueue(Capture(done)).Should().BeTrue();
        ClearContext();

        var seen = await done.Task.WaitAsync(Wait);
        seen.Tenant.Should().Be("tenant-a");
        seen.RequestTenant.Should().Be("tenant-a");
        await _queue.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Enqueue_TwoTenants_EachItemSeesItsOwnTenant()
    {
        var first = NewSource<(string? Tenant, string? RequestTenant, object? Http)>();
        var second = NewSource<(string? Tenant, string? RequestTenant, object? Http)>();
        await _queue.StartAsync(CancellationToken.None);

        BlocksTestContext.Set(tenantId: "tenant-a");
        RequestContextAccessor.Current = new RequestContext { TenantId = "tenant-a" };
        _queue.Enqueue(Capture(first));
        BlocksTestContext.Set(tenantId: "tenant-b");
        RequestContextAccessor.Current = new RequestContext { TenantId = "tenant-b" };
        _queue.Enqueue(Capture(second));

        (await first.Task.WaitAsync(Wait)).Should().Be(("tenant-a", "tenant-a", null));
        (await second.Task.WaitAsync(Wait)).Should().Be(("tenant-b", "tenant-b", null));
        await _queue.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Enqueue_ItemWithNoContext_DoesNotSeeThePreviousItemsContext()
    {
        var first = NewSource<(string? Tenant, string? RequestTenant, object? Http)>();
        var second = NewSource<(string? Tenant, string? RequestTenant, object? Http)>();
        await _queue.StartAsync(CancellationToken.None);

        BlocksTestContext.Set(tenantId: "tenant-a");
        RequestContextAccessor.Current = new RequestContext { TenantId = "tenant-a" };
        _queue.Enqueue(Capture(first));
        await first.Task.WaitAsync(Wait);

        ClearContext();
        _queue.Enqueue(Capture(second));

        var seen = await second.Task.WaitAsync(Wait);
        seen.Tenant.Should().BeNull();
        seen.RequestTenant.Should().BeNullOrEmpty();
        await _queue.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Enqueue_CopiedRequestContext_HasNoHttpContext()
    {
        var done = NewSource<(string? Tenant, string? RequestTenant, object? Http)>();
        await _queue.StartAsync(CancellationToken.None);
        RequestContextAccessor.Current = new RequestContext
        {
            TenantId = "tenant-a",
            HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext()
        };

        _queue.Enqueue(Capture(done));

        (await done.Task.WaitAsync(Wait)).Http.Should().BeNull();
        await _queue.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Enqueue_ThrowingItem_IsLoggedByTypeOnly_AndTheNextItemRuns()
    {
        var next = NewSource<bool>();
        await _queue.StartAsync(CancellationToken.None);

        _queue.Enqueue(() => throw new InvalidOperationException("secret-record-data"));
        _queue.Enqueue(() =>
        {
            next.SetResult(true);
            return Task.CompletedTask;
        });

        (await next.Task.WaitAsync(Wait)).Should().BeTrue();
        await _queue.StopAsync(CancellationToken.None);
        _logger.Entries.Should().ContainSingle(e => e.Level == LogLevel.Error);
        var error = _logger.Entries.Single(e => e.Level == LogLevel.Error);
        error.Text.Should().Contain(nameof(InvalidOperationException));
        error.Text.Should().NotContain("secret-record-data");
        error.Exception.Should().BeNull();
    }

    [Fact]
    public async Task Enqueue_Items_RunInEnqueueOrder()
    {
        var order = new List<int>();
        var done = NewSource<bool>();
        await _queue.StartAsync(CancellationToken.None);

        for (var i = 0; i < 50; i++)
        {
            var n = i;
            _queue.Enqueue(async () =>
            {
                await Task.Yield();
                order.Add(n);
                if (n == 49) done.SetResult(true);
            });
        }

        await done.Task.WaitAsync(Wait);
        order.Should().Equal(Enumerable.Range(0, 50));
        await _queue.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Enqueue_AfterStop_ReturnsFalseAndLogsAWarning()
    {
        await _queue.StartAsync(CancellationToken.None);
        await _queue.StopAsync(CancellationToken.None);

        var accepted = _queue.Enqueue(() => Task.CompletedTask);

        accepted.Should().BeFalse();
        _logger.Entries.Should().Contain(e => e.Level == LogLevel.Warning);
    }

    [Fact]
    public async Task Stop_RunsTheItemsAlreadyQueued()
    {
        var ran = 0;
        // Not started: the items wait in the channel until StopAsync drains them.
        for (var i = 0; i < 5; i++)
            _queue.Enqueue(() =>
            {
                Interlocked.Increment(ref ran);
                return Task.CompletedTask;
            });

        await _queue.StopAsync(CancellationToken.None);

        ran.Should().Be(5);
    }

    private sealed record LogEntry(LogLevel Level, string Text, Exception? Exception);

    private sealed class CapturingLogger : ILogger<AfterWriteQueue>
    {
        private readonly List<LogEntry> _entries = new();

        public IReadOnlyList<LogEntry> Entries
        {
            get { lock (_entries) return _entries.ToList(); }
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            lock (_entries) _entries.Add(new LogEntry(logLevel, formatter(state, exception), exception));
        }
    }
}
