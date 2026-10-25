using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using System.Security.Claims;
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

        (await _queue.EnqueueAsync(Capture(done))).Should().BeTrue();
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
        await _queue.EnqueueAsync(Capture(first));
        BlocksTestContext.Set(tenantId: "tenant-b");
        RequestContextAccessor.Current = new RequestContext { TenantId = "tenant-b" };
        await _queue.EnqueueAsync(Capture(second));

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
        await _queue.EnqueueAsync(Capture(first));
        await first.Task.WaitAsync(Wait);

        ClearContext();
        await _queue.EnqueueAsync(Capture(second));

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

        await _queue.EnqueueAsync(Capture(done));

        (await done.Task.WaitAsync(Wait)).Http.Should().BeNull();
        await _queue.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Enqueue_ThrowingItem_IsLoggedByTypeOnly_AndTheNextItemRuns()
    {
        var next = NewSource<bool>();
        await _queue.StartAsync(CancellationToken.None);

        await _queue.EnqueueAsync(() => throw new InvalidOperationException("secret-record-data"));
        await _queue.EnqueueAsync(() =>
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
            await _queue.EnqueueAsync(async () =>
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

        var accepted = await _queue.EnqueueAsync(() => Task.CompletedTask);

        accepted.Should().BeFalse();
        _logger.Entries.Should().Contain(e => e.Level == LogLevel.Warning);
    }

    [Fact]
    public async Task Stop_RunsTheItemsAlreadyQueued()
    {
        var ran = 0;
        // Not started: the items wait in the channel until StopAsync drains them.
        for (var i = 0; i < 5; i++)
            await _queue.EnqueueAsync(() =>
            {
                Interlocked.Increment(ref ran);
                return Task.CompletedTask;
            });

        await _queue.StopAsync(CancellationToken.None);

        ran.Should().Be(5);
    }

    // ---- delegation: a message sent from an item carries the caller's grant ----

    // DelegatedTokenContext only holds a well-formed id: "dg_" + 64 lowercase hex.
    private static readonly string HeldGrant = "dg_" + new string('a', 64);

    private static (AfterWriteQueue Queue, Mock<IDelegationGrantFactory> Factory, Mock<IDelegationGrantStore> Store) WithGrants(
        CapturingLogger logger)
    {
        var factory = new Mock<IDelegationGrantFactory>();
        factory.Setup(f => f.CreateForSendAsync(It.IsAny<TimeSpan?>())).ReturnsAsync(HeldGrant);
        var store = new Mock<IDelegationGrantStore>();
        return (new AfterWriteQueue(logger, factory.Object, store.Object), factory, store);
    }

    [Fact]
    public async Task EnqueueAsync_AuthenticatedCaller_ItemRunsHoldingTheGrantMadeAtEnqueue_ThenItIsRemoved()
    {
        var (queue, factory, store) = WithGrants(_logger);
        var held = NewSource<string?>();
        await queue.StartAsync(CancellationToken.None);
        BlocksTestContext.Set(tenantId: "tenant-a");

        (await queue.EnqueueAsync(() =>
        {
            held.SetResult(DelegatedTokenContext.Current);
            return Task.CompletedTask;
        })).Should().BeTrue();
        ClearContext();

        (await held.Task.WaitAsync(Wait)).Should().Be(HeldGrant);
        await queue.StopAsync(CancellationToken.None);
        factory.Verify(f => f.CreateForSendAsync(AfterWriteQueue.HeldGrantTtl), Times.Once);
        store.Verify(s => s.DeleteAsync(HeldGrant), Times.Once);
    }

    [Fact]
    public async Task EnqueueAsync_TheNextItem_DoesNotHoldThePreviousItemsGrant()
    {
        var (queue, factory, _) = WithGrants(_logger);
        var first = NewSource<string?>();
        var second = NewSource<string?>();
        await queue.StartAsync(CancellationToken.None);

        BlocksTestContext.Set(tenantId: "tenant-a");
        await queue.EnqueueAsync(() => { first.SetResult(DelegatedTokenContext.Current); return Task.CompletedTask; });
        await first.Task.WaitAsync(Wait);
        ClearContext();
        await queue.EnqueueAsync(() => { second.SetResult(DelegatedTokenContext.Current); return Task.CompletedTask; });

        (await second.Task.WaitAsync(Wait)).Should().BeNull();
        await queue.StopAsync(CancellationToken.None);
        factory.Verify(f => f.CreateForSendAsync(It.IsAny<TimeSpan?>()), Times.Once);
    }

    [Fact]
    public async Task EnqueueAsync_NoCaller_MakesNoGrant()
    {
        var (queue, factory, store) = WithGrants(_logger);
        var held = NewSource<string?>();
        await queue.StartAsync(CancellationToken.None);

        await queue.EnqueueAsync(() => { held.SetResult(DelegatedTokenContext.Current); return Task.CompletedTask; });

        (await held.Task.WaitAsync(Wait)).Should().BeNull();
        await queue.StopAsync(CancellationToken.None);
        factory.Verify(f => f.CreateForSendAsync(It.IsAny<TimeSpan?>()), Times.Never);
        store.Verify(s => s.DeleteAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task EnqueueAsync_GrantCannotBeMade_ItemStillRunsWithoutOne()
    {
        var (queue, factory, _) = WithGrants(_logger);
        factory.Setup(f => f.CreateForSendAsync(It.IsAny<TimeSpan?>())).ThrowsAsync(new InvalidOperationException("redis down"));
        var held = NewSource<string?>();
        await queue.StartAsync(CancellationToken.None);
        BlocksTestContext.Set(tenantId: "tenant-a");

        (await queue.EnqueueAsync(() => { held.SetResult(DelegatedTokenContext.Current); return Task.CompletedTask; }))
            .Should().BeTrue();
        ClearContext();

        (await held.Task.WaitAsync(Wait)).Should().BeNull();
        await queue.StopAsync(CancellationToken.None);
        _logger.Entries.Should().Contain(e => e.Level == LogLevel.Warning && e.Text.Contains(nameof(InvalidOperationException)));
    }

    [Fact]
    public async Task EnqueueAsync_AfterStop_RemovesTheGrantAtOnce()
    {
        var (queue, _, store) = WithGrants(_logger);
        await queue.StartAsync(CancellationToken.None);
        await queue.StopAsync(CancellationToken.None);
        BlocksTestContext.Set(tenantId: "tenant-a");

        (await queue.EnqueueAsync(() => Task.CompletedTask)).Should().BeFalse();

        store.Verify(s => s.DeleteAsync(HeldGrant), Times.Once);
    }

    [Fact]
    public async Task EnqueueAsync_WithTheRealGenesisFactory_TheItemsSendGetsAGrantChainedFromTheCaller()
    {
        // The request has the user's claims at enqueue; the item runs later with no HttpContext, where
        // Genesis builds the message's grant at send time. Without the held grant that send got none.
        var messageGrant = "dg_" + new string('b', 64);
        var store = new Mock<IDelegationGrantStore>();
        store.SetupSequence(s => s.CreateAsync(It.IsAny<BlocksContext>(), "tv-1", "ss-1", It.IsAny<TimeSpan?>()))
            .ReturnsAsync(HeldGrant)
            .ReturnsAsync(messageGrant);
        store.Setup(s => s.GetAsync(HeldGrant)).ReturnsAsync(new DelegationGrantRecord
        {
            TenantId = "tenant-a", UserId = "user-1", OrganizationId = "org-1", TokenVersion = "tv-1", SecurityStamp = "ss-1",
        });
        var factory = new DelegationGrantFactory(store.Object, NullLogger<DelegationGrantFactory>.Instance);
        var queue = new AfterWriteQueue(_logger, factory, store.Object);
        var sent = NewSource<(string? Grant, bool HasHttpContext)>();
        var previousAccessor = BlocksHttpContextAccessor.Instance;
        await queue.StartAsync(CancellationToken.None);
        try
        {
            var accessor = new HttpContextAccessor
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        [new Claim(DelegationGrantFactory.TokenVersionClaim, "tv-1"), new Claim(DelegationGrantFactory.SecurityStampClaim, "ss-1")],
                        "Bearer")),
                },
            };
            BlocksHttpContextAccessor.Instance = accessor;
            BlocksTestContext.Set(userId: "user-1", organizationId: "org-1", tenantId: "tenant-a");

            await queue.EnqueueAsync(async () =>
                sent.SetResult((await factory.CreateForSendAsync(), accessor.HttpContext is not null)));
            accessor.HttpContext = null;
            ClearContext();

            var (grant, hasHttpContext) = await sent.Task.WaitAsync(Wait);
            hasHttpContext.Should().BeFalse();
            grant.Should().Be(messageGrant);
            await queue.StopAsync(CancellationToken.None);
            store.Verify(s => s.DeleteAsync(HeldGrant), Times.Once);
        }
        finally
        {
            BlocksHttpContextAccessor.Instance = previousAccessor;
        }
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
