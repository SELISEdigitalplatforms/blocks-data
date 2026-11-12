using Blocks.Genesis.DataAccess.Rules;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Schemas;
using DataGateway.DomainService.Services;
using DataGateway.Rest.Entities;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Rest;

public class EntityModelProviderTests
{
    private const string Tenant = "tenant-1";

    private static SchemaDefinition Entity(string name, params FieldDefinition[] fields) => new()
    {
        ItemId = $"id-{name}",
        SchemaName = name,
        CollectionName = $"{name}s",
        SchemaType = SchemaType.Entity,
        Fields = [.. fields]
    };

    private static SchemaDefinition Dto(string name, params FieldDefinition[] fields) => new()
    {
        ItemId = $"id-{name}",
        SchemaName = name,
        CollectionName = $"{name}s",
        SchemaType = SchemaType.Dto,
        Fields = [.. fields]
    };

    private static FieldDefinition Field(string name, string type = "String") => new() { Name = name, Type = type };

    /// <summary>Order nests the Address DTO and looks up Customer; Customer is a second entity.</summary>
    private static SchemaSource Source() => new()
    {
        SchemaDefinitions =
        [
            Entity("Order", Field("Name"), Field("CustomerId"), Field("Ship", "Address")),
            Dto("Address", Field("Street"), Field("City")),
            Entity("Customer", Field("Status"))
        ],
        DataValidations =
        [
            new DataValidation
            {
                ItemId = "val-order-customer",
                SchemaId = "id-Order",
                FieldName = "CustomerId",
                Validations = [new ValidationRule { Type = ValidationType.Reference, Value = "Customer", SecondaryValue = "ItemId", IsActive = true }]
            }
        ]
    };

    private sealed class Fixture
    {
        public Mock<ISchemaVersionStore> Versions { get; } = new();
        public Mock<IEntityViewStore> Views { get; } = new();
        public Mock<ISchemaSnapshotStore> Snapshots { get; } = new();
        public long LiveVersion { get; set; } = 5;
        public bool MarkerWritten { get; set; }

        public Fixture(bool viewsPresent = true, SchemaSource? source = null)
        {
            BlocksTestContext.Set();
            var full = source ?? Source();
            MarkerWritten = viewsPresent;
            Versions.Setup(v => v.GetCachedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(() => LiveVersion);
            Views.Setup(v => v.HasVersionAsync(It.IsAny<string>(), It.IsAny<long>())).ReturnsAsync(() => MarkerWritten);
            Views.Setup(v => v.LoadAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<string>()))
                .ReturnsAsync((string _, long _, string name) =>
                    MarkerWritten ? EntityViewBuilder.Build(full).Where(v => v.SchemaName == name).Select(v => v.Source).FirstOrDefault() : null);
            Views.Setup(v => v.WriteAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<SchemaSource>()))
                .Returns(() => { MarkerWritten = true; return Task.CompletedTask; });
            Snapshots.Setup(s => s.LoadAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>())).ReturnsAsync(full);
        }

        public EntityModelProvider Provider(int maxEntries = 2000, TimeProvider? time = null) => new(
            Versions.Object,
            Views.Object,
            Snapshots.Object,
            Options.Create(new EntityViewCacheOptions { MaxEntries = maxEntries }),
            NullLogger<EntityModelProvider>.Instance,
            time);
    }

    [Fact]
    public async Task Resolve_LiveEntity_ReturnsModelWithDtosAndReferences()
    {
        var fx = new Fixture();
        using var provider = fx.Provider();

        var model = await provider.GetAsync(Tenant, "Order");

        model.Should().NotBeNull();
        model!.Schema.SchemaName.Should().Be("Order");
        model.Schema.SchemaType.Should().Be(SchemaType.Entity);
        model.Dtos.Should().NotBeNull();
        model.Dtos!.Keys.Should().Contain("Address");
        model.Dtos.Should().NotContainKey("Order");
        model.Dtos["Address"].Fields.Select(f => f.Name).Should().Contain(["Street", "City"]);
        model.References.Should().NotBeNull();
        model.References!.HasReferences(model.Schema).Should().BeTrue();
    }

    [Fact]
    public async Task Resolve_LookupTargetEntity_IsInDtos()
    {
        var fx = new Fixture();
        using var provider = fx.Provider();

        var model = await provider.GetAsync(Tenant, "Order");

        // Every assembled schema but the entity itself is there, entities too: GraphQL resolves types from all of them.
        model!.Dtos.Should().ContainKey("Customer");
        model.Dtos!["Customer"].SchemaType.Should().Be(SchemaType.Entity);
    }

    [Fact]
    public async Task Resolve_EntityNotInLiveVersion_NotFound()
    {
        var fx = new Fixture();
        using var provider = fx.Provider();

        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();
        // A DTO is not an entity, and the name is case-sensitive.
        (await provider.GetAsync(Tenant, "Address")).Should().BeNull();
        (await provider.GetAsync(Tenant, "order")).Should().BeNull();
        // Not-found results are never cached, so a publish or a repair is seen at once.
        provider.CachedCount.Should().Be(0);
    }

    [Fact]
    public async Task Resolve_Version0_NotFound()
    {
        var fx = new Fixture { LiveVersion = 0 };
        using var provider = fx.Provider();

        (await provider.GetAsync(Tenant, "Order")).Should().BeNull();

        fx.Views.Verify(v => v.LoadAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<string>()), Times.Never);
        fx.Views.Verify(v => v.HasVersionAsync(It.IsAny<string>(), It.IsAny<long>()), Times.Never);
    }

    [Fact]
    public async Task Resolve_SecondCall_UsesCache()
    {
        var fx = new Fixture();
        using var provider = fx.Provider();

        var first = await provider.GetAsync(Tenant, "Order");
        var second = await provider.GetAsync(Tenant, "Order");

        second.Should().BeSameAs(first);
        fx.Views.Verify(v => v.LoadAsync(Tenant, 5, "Order"), Times.Once);
    }

    [Fact]
    public async Task Resolve_AfterPublish_UsesNewVersion()
    {
        var fx = new Fixture();
        using var provider = fx.Provider();

        var before = await provider.GetAsync(Tenant, "Order");
        fx.LiveVersion = 6;
        var after = await provider.GetAsync(Tenant, "Order");

        after.Should().NotBeSameAs(before);
        fx.Views.Verify(v => v.LoadAsync(Tenant, 5, "Order"), Times.Once);
        fx.Views.Verify(v => v.LoadAsync(Tenant, 6, "Order"), Times.Once);
    }

    [Fact]
    public async Task Resolve_MissingViews_BuiltOnceUnderConcurrency()
    {
        var fx = new Fixture(viewsPresent: false);
        // Slow write, so the other callers pile up on the lock while it runs.
        fx.Views.Setup(v => v.WriteAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<SchemaSource>()))
            .Returns(async () => { await Task.Delay(100); fx.MarkerWritten = true; });
        using var provider = fx.Provider();

        var models = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(() => provider.GetAsync(Tenant, "Order"))));

        models.Should().OnlyContain(m => m != null && m.Schema.SchemaName == "Order");
        fx.Views.Verify(v => v.WriteAsync(Tenant, 5, It.IsAny<SchemaSource>()), Times.Once);
        fx.Snapshots.Verify(s => s.LoadAsync(Tenant, 5, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Resolve_MissingViewsAndSnapshot_NotFound()
    {
        var fx = new Fixture(viewsPresent: false);
        fx.Snapshots.Setup(s => s.LoadAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>())).ReturnsAsync((SchemaSource?)null);
        using var provider = fx.Provider();

        (await provider.GetAsync(Tenant, "Order")).Should().BeNull();

        fx.Views.Verify(v => v.WriteAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<SchemaSource>()), Times.Never);
        provider.CachedCount.Should().Be(0);
    }

    [Fact]
    public async Task Resolve_PartialWrite_StillReturnsEntityFromSnapshot()
    {
        var fx = new Fixture(viewsPresent: false);
        // The write fails for every view and leaves no marker: the entity must still come from the snapshot.
        fx.Views.Setup(v => v.WriteAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<SchemaSource>()))
            .ThrowsAsync(new AggregateException("2 entity views of version 5 could not be stored.", new InvalidOperationException("boom")));
        using var provider = fx.Provider();

        var model = await provider.GetAsync(Tenant, "Order");

        model.Should().NotBeNull();
        model!.Schema.SchemaName.Should().Be("Order");
        model.Dtos!.Keys.Should().Contain("Address");
        // An entity the snapshot lacks is still not found, and not cached.
        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();
        provider.CachedCount.Should().Be(1);
    }

    [Fact]
    public async Task Cache_OverMaxEntries_Evicts()
    {
        var fx = new Fixture();
        using var provider = fx.Provider(maxEntries: 2);

        // Each version is its own key, so five versions fill a cache of two.
        foreach (var version in new long[] { 1, 2, 3, 4, 5 })
        {
            fx.LiveVersion = version;
            (await provider.GetAsync(Tenant, "Order")).Should().NotBeNull();
        }

        provider.CachedCount.Should().BeLessThanOrEqualTo(2);
    }

    [Fact]
    public async Task Cache_KeysIsolateTenants()
    {
        var fx = new Fixture();
        using var provider = fx.Provider();

        var a = await provider.GetAsync("tenant-a", "Order");
        var b = await provider.GetAsync("tenant-b", "Order");

        b.Should().NotBeSameAs(a);
        fx.Views.Verify(v => v.LoadAsync("tenant-a", 5, "Order"), Times.Once);
        fx.Views.Verify(v => v.LoadAsync("tenant-b", 5, "Order"), Times.Once);
        provider.CachedCount.Should().Be(2);
    }

    private static Task Throwing() => Task.FromException(new AggregateException("views could not be stored", new InvalidOperationException("boom")));

    [Fact]
    public async Task Resolve_PersistentWriteFailure_SnapshotLoadedOncePerWindow()
    {
        var fx = new Fixture(viewsPresent: false);
        fx.Views.Setup(v => v.WriteAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<SchemaSource>())).Returns(() => Throwing());
        using var provider = fx.Provider();

        (await provider.GetAsync(Tenant, "Order")).Should().NotBeNull();
        (await provider.GetAsync(Tenant, "Customer")).Should().NotBeNull();
        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();
        (await provider.GetAsync(Tenant, "Address")).Should().BeNull();
        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();
        (await provider.GetAsync(Tenant, "Order")).Should().NotBeNull();

        fx.Snapshots.Verify(s => s.LoadAsync(Tenant, 5, It.IsAny<CancellationToken>()), Times.Once);
        fx.Views.Verify(v => v.WriteAsync(Tenant, 5, It.IsAny<SchemaSource>()), Times.Once);
    }

    [Fact]
    public async Task Resolve_BuiltSlotExpired_RetriesWrite()
    {
        var fx = new Fixture(viewsPresent: false);
        fx.Views.Setup(v => v.WriteAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<SchemaSource>())).Returns(() => Throwing());
        var clock = new ManualTimeProvider();
        using var provider = fx.Provider(time: clock);

        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();
        clock.Advance(TimeSpan.FromSeconds(119));
        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();
        fx.Views.Verify(v => v.WriteAsync(Tenant, 5, It.IsAny<SchemaSource>()), Times.Once);

        clock.Advance(TimeSpan.FromSeconds(2));
        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();

        fx.Views.Verify(v => v.WriteAsync(Tenant, 5, It.IsAny<SchemaSource>()), Times.Exactly(2));
        fx.Snapshots.Verify(s => s.LoadAsync(Tenant, 5, It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task Resolve_BuiltSlots_KeepAtMostSixteen()
    {
        var fx = new Fixture(viewsPresent: false);
        fx.Views.Setup(v => v.WriteAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<SchemaSource>())).Returns(() => Throwing());
        using var provider = fx.Provider();

        // 17 tenants each get a slot; the oldest (tenant-0) was dropped, so it builds again.
        for (var i = 0; i < 17; i++)
            await provider.GetAsync($"tenant-{i}", "Nope");
        fx.Views.Verify(v => v.WriteAsync("tenant-0", 5, It.IsAny<SchemaSource>()), Times.Once);

        await provider.GetAsync("tenant-16", "Nope");
        fx.Views.Verify(v => v.WriteAsync("tenant-16", 5, It.IsAny<SchemaSource>()), Times.Once);

        await provider.GetAsync("tenant-0", "Nope");
        fx.Views.Verify(v => v.WriteAsync("tenant-0", 5, It.IsAny<SchemaSource>()), Times.Exactly(2));
    }

    [Fact]
    public async Task Resolve_WriteAlwaysFails_SnapshotLoadsNeverOverlap()
    {
        var fx = new Fixture(viewsPresent: false);
        fx.Views.Setup(v => v.WriteAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<SchemaSource>())).Returns(() => Throwing());
        var tracker = TrackSnapshotLoads(fx, SourceOrNull: Source());
        using var provider = fx.Provider();

        var models = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(() => provider.GetAsync(Tenant, "Order"))));

        models.Should().OnlyContain(m => m != null);
        tracker.MaxInFlight.Should().Be(1);
    }

    [Fact]
    public async Task Resolve_NoSnapshot_SnapshotLoadsNeverOverlap()
    {
        // Nothing is kept when there is no snapshot, so every call loads again, but one at a time.
        var fx = new Fixture(viewsPresent: false);
        var tracker = TrackSnapshotLoads(fx, SourceOrNull: null);
        using var provider = fx.Provider();

        var models = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(() => provider.GetAsync(Tenant, "Order"))));

        models.Should().OnlyContain(m => m == null);
        tracker.Loads.Should().Be(20);
        tracker.MaxInFlight.Should().Be(1);
    }

    // ---- negative cache (R24) ----

    [Fact]
    public async Task Resolve_UnknownName_SecondCallHitsNegativeCache()
    {
        var fx = new Fixture();
        using var provider = fx.Provider();

        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();
        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();

        fx.Views.Verify(v => v.HasVersionAsync(Tenant, 5), Times.Once);
        fx.Views.Verify(v => v.LoadAsync(Tenant, 5, "Nope"), Times.Once);
        fx.Snapshots.Verify(s => s.LoadAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()), Times.Never);
        provider.NegativeCount.Should().Be(1);
        provider.CachedCount.Should().Be(0);
    }

    [Fact]
    public async Task Resolve_UnknownNameAfterPublish_LooksUpAgain()
    {
        var fx = new Fixture();
        using var provider = fx.Provider();

        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();
        fx.LiveVersion = 6;
        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();

        fx.Views.Verify(v => v.LoadAsync(Tenant, 5, "Nope"), Times.Once);
        fx.Views.Verify(v => v.LoadAsync(Tenant, 6, "Nope"), Times.Once);
    }

    [Fact]
    public async Task NegativeCache_StaysBounded()
    {
        var fx = new Fixture();
        using var provider = fx.Provider();

        for (var i = 0; i < 5000; i++)
            await provider.GetAsync(Tenant, $"name-{i}");

        provider.NegativeCount.Should().Be(4096);
        // The least recently used went first: the oldest name is looked up again, the newest is still remembered.
        await provider.GetAsync(Tenant, "name-0");
        await provider.GetAsync(Tenant, "name-4999");
        fx.Views.Verify(v => v.LoadAsync(Tenant, 5, "name-0"), Times.Exactly(2));
        fx.Views.Verify(v => v.LoadAsync(Tenant, 5, "name-4999"), Times.Once);
    }

    [Fact]
    public async Task NegativeCache_ExpiresAMinuteAfterLastUse()
    {
        var fx = new Fixture();
        var clock = new ManualTimeProvider();
        using var provider = fx.Provider(time: clock);

        await provider.GetAsync(Tenant, "Nope");
        clock.Advance(TimeSpan.FromSeconds(50));
        await provider.GetAsync(Tenant, "Nope");
        clock.Advance(TimeSpan.FromSeconds(50));
        await provider.GetAsync(Tenant, "Nope");
        fx.Views.Verify(v => v.LoadAsync(Tenant, 5, "Nope"), Times.Once);

        clock.Advance(TimeSpan.FromSeconds(61));
        await provider.GetAsync(Tenant, "Nope");
        fx.Views.Verify(v => v.LoadAsync(Tenant, 5, "Nope"), Times.Exactly(2));
    }

    [Fact]
    public async Task NegativeCache_MissingSnapshot_NotRemembered()
    {
        var fx = new Fixture(viewsPresent: false);
        fx.Snapshots.Setup(s => s.LoadAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>())).ReturnsAsync((SchemaSource?)null);
        using var provider = fx.Provider();

        (await provider.GetAsync(Tenant, "Order")).Should().BeNull();
        (await provider.GetAsync(Tenant, "Order")).Should().BeNull();

        provider.NegativeCount.Should().Be(0);
        fx.Snapshots.Verify(s => s.LoadAsync(Tenant, 5, It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task NegativeCache_FromBuiltSlot_HoldsWhileTheSlotLives()
    {
        var fx = new Fixture(viewsPresent: false);
        fx.Views.Setup(v => v.WriteAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<SchemaSource>())).Returns(() => Throwing());
        using var provider = fx.Provider();

        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();
        (await provider.GetAsync(Tenant, "Nope")).Should().BeNull();

        provider.NegativeCount.Should().Be(1);
        // The second call was answered from the negative entry: not even the marker was asked again.
        fx.Views.Verify(v => v.HasVersionAsync(Tenant, 5), Times.Exactly(2));
    }

    private sealed class LoadTracker
    {
        private int _inFlight;
        private int _max;
        private int _loads;
        public int MaxInFlight => _max;
        public int Loads => _loads;

        public async Task<SchemaSource?> RunAsync(SchemaSource? result)
        {
            var now = Interlocked.Increment(ref _inFlight);
            int seen;
            while (now > (seen = _max) && Interlocked.CompareExchange(ref _max, now, seen) != seen) { }
            Interlocked.Increment(ref _loads);
            await Task.Delay(20);
            Interlocked.Decrement(ref _inFlight);
            return result;
        }
    }

    private static LoadTracker TrackSnapshotLoads(Fixture fx, SchemaSource? SourceOrNull)
    {
        var tracker = new LoadTracker();
        fx.Snapshots.Setup(s => s.LoadAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()))
            .Returns(() => tracker.RunAsync(SourceOrNull));
        return tracker;
    }
}
