using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution;
using HotChocolate.Execution.Configuration;
using HotChocolate.Types;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.GraphQL;

/// <summary>
/// End-to-end proof, against HotChocolate's real executor resolver and a real MongoDB, that a
/// schema reload reaches every pod: each "pod" is its own service provider, and the pods share only
/// the tenant database, as gateway replicas do in production.
/// </summary>
[Collection("Mongo")]
public class MultiPodSchemaReloadTests
{
    private const string Tenant = "tenant_1"; // schema names must be valid GraphQL names
    private readonly IMongoDatabase _db;
    private readonly DbRepository _repository;

    // Replicas share one Redis as well as the database.
    private readonly InMemoryCacheClient _cache = new();

    public MultiPodSchemaReloadTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        _repository = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
    }

    private sealed class Pod : IAsyncDisposable
    {
        public required ServiceProvider Services { get; init; }
        public IRequestExecutorResolver Resolver => Services.GetRequiredService<IRequestExecutorResolver>();
        public SchemaVersionTracker Tracker => Services.GetRequiredService<SchemaVersionTracker>();
        public SchemaConfigurationService Configuration => Services.GetRequiredService<SchemaConfigurationService>();
        public BuiltSchemaVersions BuiltVersions => Services.GetRequiredService<BuiltSchemaVersions>();
        public SchemaPublishSubscriber Subscriber => Services.GetRequiredService<SchemaPublishSubscriber>();

        public ValueTask DisposeAsync() => Services.DisposeAsync();
    }

    /// <summary>The same wiring as <c>ServiceRegistry</c>, minus HTTP and the data services.</summary>
    private Pod StartPod(RecordingLoggerProvider? logs = null)
    {
        var services = new ServiceCollection();
        services.AddLogging(builder =>
        {
            builder.SetMinimumLevel(LogLevel.Debug);
            if (logs is not null)
            {
                builder.AddProvider(logs);
            }
        });
        services.AddGraphQLServer().ModifyRequestOptions(o => o.IncludeExceptionDetails = true); // readable failures
        services.RemoveAll<IRequestExecutorOptionsMonitor>();
        services.AddSingleton<DataGatewayPipelineDispatcher>();

        services.AddSingleton<IDbRepository>(_repository);
        services.AddSingleton<ICacheClient>(_cache);
        services.AddSingleton(new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object));
        services.AddSingleton<GraphqlSchemaBuilder>();
        services.AddSingleton<ISchemaVersionStore, SchemaVersionStore>();
        services.AddSingleton<ISchemaSnapshotStore>(new SchemaSnapshotStore(_repository));
        services.AddSingleton<ISchemaPublishService, SchemaPublishService>();
        services.AddSingleton<BuiltSchemaVersions>();
        services.AddSingleton<ITenantSchemaConfigurator, TenantSchemaConfigurator>();
        services.AddSingleton<ProjectExecutorOptionsMonitor>();
        services.AddSingleton<IRequestExecutorOptionsMonitor>(sp => sp.GetRequiredService<ProjectExecutorOptionsMonitor>());
        services.AddSingleton(sp => new SchemaVersionTracker(
            sp.GetRequiredService<ISchemaVersionStore>(),
            sp.GetRequiredService<BuiltSchemaVersions>(),
            () => sp.GetRequiredService<IRequestExecutorResolver>(),
            TimeProvider.System,
            SchemaVersionTracker.DefaultPollInterval,
            NullLogger<SchemaVersionTracker>.Instance));
        services.AddSingleton<SchemaConfigurationService>();
        services.AddSingleton(sp => new SchemaPublishSubscriber(
            _cache, sp.GetRequiredService<SchemaVersionTracker>(), NullLogger<SchemaPublishSubscriber>.Instance));

        return new Pod { Services = services.BuildServiceProvider() };
    }

    private readonly string _personId = Guid.NewGuid().ToString();

    private Task SeedPersonAsync(params string[] fields) =>
        _repository.UpsertAsync(new SchemaDefinition
        {
            ItemId = _personId,
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = fields.Select(name => new FieldDefinition { Name = name, Type = "String" }).ToList()
        });

    private static bool HasPersonField(IRequestExecutor executor, string field) =>
        executor.Schema.GetType<ObjectType>("Person").Fields.Any(f => f.Name == field);

    private static async Task<IRequestExecutor> WaitForRebuildAsync(Pod pod, IRequestExecutor previous)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            var current = await pod.Resolver.GetRequestExecutorAsync(Tenant);
            if (!ReferenceEquals(current, previous))
            {
                return current;
            }
            await Task.Delay(50);
        }
        throw new TimeoutException("HotChocolate did not rebuild the evicted executor");
    }

    /// <summary>Sends a GraphQL request through the tenant's real HTTP pipeline, as the gateway endpoint does.</summary>
    private static async Task<string> PostAsync(Pod pod, string query)
    {
        // Each request gets its own service scope, as ASP.NET Core gives it.
        await using var scope = pod.Services.CreateAsyncScope();
        var context = new DefaultHttpContext { RequestServices = scope.ServiceProvider };
        context.Request.Method = HttpMethods.Post;
        context.Request.Path = "/";
        context.Request.ContentType = "application/json";
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { query })));
        context.Response.Body = new MemoryStream();

        var pipeline = pod.Services.GetRequiredService<DataGatewayPipelineDispatcher>().GetPipeline(Tenant);
        await pipeline(context);

        context.Response.Body.Position = 0;
        return await new StreamReader(context.Response.Body).ReadToEndAsync();
    }

    private const string PersonFieldsQuery = "{ __type(name: \"Person\") { fields { name } } }";

    private Task SeedChangeLogAsync(string id) =>
        _repository.InsertAsync(new SchemaChangeLog { ItemId = id, SchemaId = _personId, ChangeType = SchemaChangeType.SchemaFieldUpdate });

    [Fact]
    public async Task ARequestRightAfterAPublishGetsTheNewSchema()
    {
        await SeedPersonAsync("Name");
        await using var pod = StartPod();
        (await PostAsync(pod, PersonFieldsQuery)).Should().Contain("\"Name\"").And.NotContain("\"Age\"");

        await SeedPersonAsync("Name", "Age");
        await pod.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        // This is what the Publish button does next: it re-reads the schema through the gateway.
        (await PostAsync(pod, PersonFieldsQuery)).Should().Contain("\"Age\"");
    }

    [Fact]
    public async Task ASchemaThatDoesNotBuildIsNotPublished()
    {
        await SeedPersonAsync("Name");
        await using var pod = StartPod();
        var before = await pod.Resolver.GetRequestExecutorAsync(Tenant);
        await SeedChangeLogAsync("pending-1");

        // A type name with a space is not a valid GraphQL name, so the schema cannot be created.
        await _repository.InsertAsync(new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Bad Name",
            CollectionName = "BadNames",
            SchemaType = SchemaType.Entity,
            Fields = [new FieldDefinition { Name = "Title", Type = "String" }]
        });

        var publish = () => pod.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        await publish.Should().ThrowAsync<SchemaPublishException>();
        (await pod.Services.GetRequiredService<ISchemaVersionStore>().GetAsync(Tenant)).Should().Be(1, "the first published version stays live; no pod is told about a schema that does not build");
        (await _db.GetCollection<PublishedSchemaSnapshot>("PublishedSchemaSnapshots").CountDocumentsAsync(FilterDefinition<PublishedSchemaSnapshot>.Empty))
            .Should().Be(1, "nothing is stored for a schema that does not build");
        var log = await _db.GetCollection<SchemaChangeLog>("SchemaChangeLogs").Find(l => l.ItemId == "pending-1").SingleAsync();
        log.DoesServerAdaptChanges.Should().BeFalse("the change was not published");
        (await pod.Resolver.GetRequestExecutorAsync(Tenant)).Should().BeSameAs(before);
    }

    // ---------------- publish gate ----------------

    [Fact]
    public async Task AnExistingTenantGetsItsFirstPublishedVersionFromItsDrafts()
    {
        await SeedPersonAsync("Name");
        await SeedChangeLogAsync("pending-1");
        await using var pod = StartPod();

        var executor = await pod.Resolver.GetRequestExecutorAsync(Tenant);

        HasPersonField(executor, "Name").Should().BeTrue("the tenant keeps serving what it served before snapshots");
        (await pod.Services.GetRequiredService<ISchemaVersionStore>().GetAsync(Tenant)).Should().Be(1);
        var snapshot = await _db.GetCollection<PublishedSchemaSnapshot>("PublishedSchemaSnapshots").Find(_ => true).SingleAsync();
        snapshot.Kind.Should().Be(SchemaSnapshotKind.Bootstrap);
        var log = await _db.GetCollection<SchemaChangeLog>("SchemaChangeLogs").Find(l => l.ItemId == "pending-1").SingleAsync();
        log.DoesServerAdaptChanges.Should().BeFalse("nothing was published by an admin");
    }

    [Fact]
    public async Task DraftEditsAreNotServedUntilPublished()
    {
        await SeedPersonAsync("Name");
        await using var pod = StartPod();
        var before = await pod.Resolver.GetRequestExecutorAsync(Tenant);

        await SeedPersonAsync("Name", "Age");
        // Anything that rebuilds the executor (here an eviction) still builds the published version.
        pod.Resolver.EvictRequestExecutor(Tenant);
        var rebuilt = await WaitForRebuildAsync(pod, before);

        HasPersonField(rebuilt, "Age").Should().BeFalse("the edit is still a draft");

        await pod.Configuration.ReloadAsync(Tenant, CancellationToken.None);
        HasPersonField(await pod.Resolver.GetRequestExecutorAsync(Tenant), "Age").Should().BeTrue();
    }

    [Fact]
    public async Task ARestartedPodServesThePublishedVersionNotTheDrafts()
    {
        await SeedPersonAsync("Name");
        await using (var first = StartPod())
        {
            await first.Configuration.ReloadAsync(Tenant, CancellationToken.None);
        }

        await SeedPersonAsync("Name", "Age"); // edited, not published
        await using var restarted = StartPod();

        HasPersonField(await restarted.Resolver.GetRequestExecutorAsync(Tenant), "Age").Should().BeFalse();
    }

    [Fact]
    public async Task APublishStoresExactlyWhatItValidated()
    {
        await SeedPersonAsync("Name", "Age");
        await SeedChangeLogAsync("pending-1");
        await using var pod = StartPod();

        var result = await pod.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        result!.Version.Should().Be(1);
        result.PublishedChangeCount.Should().Be(1);
        var snapshot = await _db.GetCollection<PublishedSchemaSnapshot>("PublishedSchemaSnapshots").Find(_ => true).SingleAsync();
        snapshot.Kind.Should().Be(SchemaSnapshotKind.Publish);
        snapshot.ChangeLogIds.Should().Equal("pending-1");
        var stored = await pod.Services.GetRequiredService<ISchemaSnapshotStore>().LoadAsync(Tenant, 1);
        stored!.SchemaDefinitions.Should().ContainSingle(d => d.SchemaName == "Person")
            .Which.Fields.Select(f => f.Name).Should().Equal("Name", "Age");
    }

    // ---------------- rollback and history ----------------

    [Fact]
    public async Task ARollbackServesTheOlderVersionEverywhereAndLeavesTheDraftsAlone()
    {
        await SeedPersonAsync("Name");
        await using var podA = StartPod();
        await using var podB = StartPod();
        await podB.Subscriber.StartAsync(CancellationToken.None);
        await podA.Configuration.ReloadAsync(Tenant, CancellationToken.None);              // v1: Name
        await SeedPersonAsync("Name", "Age");
        await podA.Configuration.ReloadAsync(Tenant, CancellationToken.None);              // v2: Name, Age
        var beforeB = await podB.Resolver.GetRequestExecutorAsync(Tenant);
        HasPersonField(beforeB, "Age").Should().BeTrue();

        var result = await podA.Configuration.RollbackAsync(Tenant, 1, CancellationToken.None);

        result.Should().Be(new SchemaRollbackResult(1, 2));
        // The pod that handled the rollback serves version 1 as soon as the call returns.
        HasPersonField(await podA.Resolver.GetRequestExecutorAsync(Tenant), "Age").Should().BeFalse();
        // The other pod follows the announcement.
        HasPersonField(await WaitForRebuildAsync(podB, beforeB), "Age").Should().BeFalse();
        podB.BuiltVersions.TryGetBuilt(Tenant, out var builtB).Should().BeTrue();
        builtB.Should().Be(1);
        await podB.Subscriber.StopAsync(CancellationToken.None);

        // The drafts still have the field, and publishing again makes a new version with it.
        var republished = await podA.Configuration.ReloadAsync(Tenant, CancellationToken.None);
        republished!.Version.Should().Be(3, "versions 1 and 2 already exist");
        HasPersonField(await podA.Resolver.GetRequestExecutorAsync(Tenant), "Age").Should().BeTrue();
    }

    [Fact]
    public async Task RollingBackToAVersionThatIsNotKeptFails()
    {
        await SeedPersonAsync("Name");
        await using var pod = StartPod();
        await pod.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        var rollback = () => pod.Configuration.RollbackAsync(Tenant, 7, CancellationToken.None);

        await rollback.Should().ThrowAsync<SchemaVersionNotFoundException>();
        (await pod.Services.GetRequiredService<ISchemaVersionStore>().GetAsync(Tenant)).Should().Be(1);
    }

    [Fact]
    public async Task TheHistoryKeepsTheNewestTenVersionsAndMarksTheLiveOne()
    {
        await SeedPersonAsync("Name");
        await SeedChangeLogAsync("pending-1");
        await using var pod = StartPod();
        for (var i = 0; i < 12; i++)
        {
            await pod.Configuration.ReloadAsync(Tenant, CancellationToken.None);
        }
        await pod.Configuration.RollbackAsync(Tenant, 5, CancellationToken.None);

        var history = await pod.Configuration.GetVersionHistoryAsync(Tenant, CancellationToken.None);

        history.CurrentVersion.Should().Be(5);
        history.Versions.Select(v => v.Version).Should().Equal(12, 11, 10, 9, 8, 7, 6, 5, 4, 3);
        history.Versions.Single(v => v.IsCurrent).Version.Should().Be(5);
        history.Versions.Single(v => v.Version == 3).ChangeCount.Should().Be(0);
        (await _db.GetCollection<PublishedSchemaSnapshot>("PublishedSchemaSnapshots").CountDocumentsAsync(FilterDefinition<PublishedSchemaSnapshot>.Empty))
            .Should().Be(10, "versions 1 and 2 were deleted");
    }

    [Fact]
    public async Task AnEvictedExecutorIsRebuiltInTheBackgroundWithoutARequestContext()
    {
        await SeedPersonAsync("Name");
        await using var pod = StartPod();
        var before = await pod.Resolver.GetRequestExecutorAsync(Tenant);
        HasPersonField(before, "Age").Should().BeFalse();

        await SeedPersonAsync("Name", "Age");
        await pod.Services.GetRequiredService<ISchemaPublishService>().PublishAsync(Tenant);
        pod.Resolver.EvictRequestExecutor(Tenant);
        var after = await WaitForRebuildAsync(pod, before);

        HasPersonField(after, "Age").Should().BeTrue();

        // A request that started on the old executor still completes on it.
        var result = await before.ExecuteAsync("{ __typename }");
        result.ExpectOperationResult().Errors.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task AReloadOnOnePodReachesAnotherPodThroughTheRedisMessage()
    {
        await SeedPersonAsync("Name");
        await using var podA = StartPod();
        await using var podB = StartPod();
        await podB.Subscriber.StartAsync(CancellationToken.None);
        var beforeB = await podB.Resolver.GetRequestExecutorAsync(Tenant);
        _ = await podA.Resolver.GetRequestExecutorAsync(Tenant);

        await SeedPersonAsync("Name", "Age");
        await podA.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        // Pod B gets no request and runs no check: the announcement alone brings it up to date.
        HasPersonField(await WaitForRebuildAsync(podB, beforeB), "Age").Should().BeTrue();
        await podB.Subscriber.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task AReloadOnOnePodReachesAnotherPodOnItsNextCheck()
    {
        await SeedPersonAsync("Name");
        await using var podA = StartPod();
        await using var podB = StartPod();
        var beforeA = await podA.Resolver.GetRequestExecutorAsync(Tenant);
        var beforeB = await podB.Resolver.GetRequestExecutorAsync(Tenant);

        await SeedPersonAsync("Name", "Age");
        await podA.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        // Pod A handled the reload and rebuilds straight away.
        HasPersonField(await WaitForRebuildAsync(podA, beforeA), "Age").Should().BeTrue();

        // Pod B is not subscribed (as if the message were lost); its next request finds it is behind.
        await podB.Tracker.EnsureCurrentAsync(Tenant);
        var afterB = await WaitForRebuildAsync(podB, beforeB);

        HasPersonField(afterB, "Age").Should().BeTrue();
        podB.BuiltVersions.TryGetBuilt(Tenant, out var builtB).Should().BeTrue();
        builtB.Should().Be(2, "version 1 is the first snapshot taken from the drafts; the reload published version 2");
    }

    [Fact]
    public async Task APodThatIsUpToDateKeepsItsExecutor()
    {
        await SeedPersonAsync("Name");
        await using var pod = StartPod();
        var before = await pod.Resolver.GetRequestExecutorAsync(Tenant);

        await pod.Tracker.EnsureCurrentAsync(Tenant);
        await Task.Delay(200);

        (await pod.Resolver.GetRequestExecutorAsync(Tenant)).Should().BeSameAs(before);
    }

    private static async Task<RecordedLog> WaitForLogAsync(RecordingLoggerProvider logs, Func<RecordedLog, bool> match)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            var found = logs.Logs.FirstOrDefault(match);
            if (found is not null)
            {
                return found;
            }
            await Task.Delay(50);
        }
        throw new TimeoutException("The expected log line was not written");
    }

    [Fact]
    public async Task APublishIsLoggedWithWhoPublishedItButNeverTheirFullEmail()
    {
        BlocksTestContext.Set(userId: "user-42", email: "johne.doe@gmail.com");
        await SeedPersonAsync("Name");
        var logs = new RecordingLoggerProvider();
        await using var pod = StartPod(logs);
        await pod.Resolver.GetRequestExecutorAsync(Tenant);

        await SeedPersonAsync("Name", "Age");
        var result = await pod.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        var started = logs.Logs.Single(l => l.Message.StartsWith("Publishing the schema for tenant"));
        started.Field("UserId").Should().Be("user-42");
        started.Field("UserEmail").Should().Be("joh*******@gmail.com");
        started.Field("SchemaOperation").Should().Be("Publish");
        started.Field("TenantId").Should().Be(Tenant);
        started.Field("Pod").Should().Be(Environment.MachineName);

        var published = logs.Logs.Single(l => l.Message.StartsWith("Published schema version"));
        published.Field("Version").Should().Be(result!.Version);
        published.Field("SchemaCount").Should().Be(1);

        var switched = logs.Logs.Single(l => l.Message.Contains("switched from published version"));
        switched.Field("PreviousVersion").Should().Be(result.Version - 1);
        switched.Field("Version").Should().Be(result.Version);

        logs.Logs.Should().NotContain(l => l.AllText().Contains("johne.doe", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task APodThatCannotLoadAPublishedVersionLogsWhyAndKeepsServing()
    {
        await SeedPersonAsync("Name");
        var logs = new RecordingLoggerProvider();
        await using var pod = StartPod(logs);
        var before = await pod.Resolver.GetRequestExecutorAsync(Tenant);
        pod.BuiltVersions.TryGetBuilt(Tenant, out var serving).Should().BeTrue();

        // Version 2 is made live, but part of its stored content is missing.
        var versionStore = pod.Services.GetRequiredService<ISchemaVersionStore>();
        var version = await versionStore.AllocateAsync(Tenant);
        var smallChunks = new SchemaSnapshotStore(_repository, chunkSizeBytes: 64);
        await smallChunks.SaveAsync(Tenant, version, SchemaSnapshotStore.Pack(await pod.Services.GetRequiredService<GraphqlSchemaBuilder>().ReadDraftSourceAsync(Tenant)),
            SchemaSnapshotKind.Publish, []);
        await _db.GetCollection<PublishedSchemaSnapshotChunk>("PublishedSchemaSnapshotChunks")
            .DeleteOneAsync(c => c.Version == version && c.Index == 1);
        await versionStore.MakeCurrentAsync(Tenant, version);

        // HotChocolate rebuilds in the background and discards the error; the pod logs it.
        await pod.Tracker.OnVersionPublishedAsync(Tenant, version);
        var failure = await WaitForLogAsync(logs, l => l.Level == LogLevel.Error);

        failure.Exception.Should().BeOfType<InvalidDataException>();
        failure.Field("Version").Should().Be(version);
        failure.Field("ServingVersion").Should().Be(serving);
        failure.Field("SchemaOperation").Should().Be("Rebuild");
        (await pod.Resolver.GetRequestExecutorAsync(Tenant)).Should().BeSameAs(before);
    }

    [Fact]
    public async Task AnErrorRaisedByHotChocolateWhileCreatingTheSchemaIsLogged()
    {
        var logs = new RecordingLoggerProvider();
        await using var pod = StartPod(logs);
        var configurator = pod.Services.GetRequiredService<ITenantSchemaConfigurator>();

        // The tenant's own types build; HotChocolate then rejects the schema as a whole.
        var builder = SchemaBuilder.New();
        await configurator.ConfigureAsync(Tenant, builder, CancellationToken.None);
        builder.AddDocumentFromString("type Query { broken: MissingType }");

        var create = () => builder.Create();

        create.Should().Throw<SchemaException>();
        var failure = logs.Logs.Single(l => l.Level == LogLevel.Error);
        failure.Exception.Should().BeOfType<SchemaException>();
        failure.Field("TenantId").Should().Be(Tenant);
        failure.Field("Version").Should().Be(1L);
    }

    [Fact]
    public async Task APublishThatFailsPartWayLogsTheStepAndWhatItLeftBehind()
    {
        await SeedPersonAsync("Name");
        var logs = new RecordingLoggerProvider();
        await using var pod = StartPod(logs);

        // Version 1 is already taken by a stray snapshot, so storing the publish fails.
        await _repository.InsertAsync(new PublishedSchemaSnapshot { ItemId = PublishedSchemaSnapshot.IdFor(1), Version = 1 });

        var publish = () => pod.Configuration.ReloadAsync(Tenant, CancellationToken.None);

        await publish.Should().ThrowAsync<MongoException>();
        var failure = logs.Logs.Single(l => l.Level == LogLevel.Error);
        failure.Field("Step").Should().Be("storing the snapshot");
        failure.Field("Version").Should().Be(1L);
        failure.Message.Should().Contain("the live version is unchanged");
    }
}
