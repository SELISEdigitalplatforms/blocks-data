using System.Net;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using MongoDB.Driver.Core.Clusters;
using MongoDB.Driver.Core.Connections;
using MongoDB.Driver.Core.Servers;
using Moq;
using StackExchange.Redis;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>
/// The operations the REST transport adds to the engine: get by id, upsert, and the typed "not found" response.
/// Run against a real repository over a throwaway Mongo database; the insert race, which cannot be provoked
/// deterministically there, uses a mocked repository.
/// </summary>
[Collection("Mongo")]
public class EngineRestOperationsTests
{
    private const string Collection = "Persons";

    private readonly IMongoDatabase _db;
    private readonly GqlDbRepository _repository;
    private readonly Mock<IDataChangeEventPublisher> _publisher = new();

    public EngineRestOperationsTests(MongoFixture fixture)
    {
        BlocksTestContext.Set(tenantId: "rest-ops");
        SetContext(userId: "u1", tenantId: "rest-ops");
        SetBlocksCloud(false);
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        var cache = new Mock<ICacheClient>();
        cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());
        var store = new Mock<IDataSourceConfigStore>();
        store.Setup(x => x.LoadAsync(It.IsAny<string>())).ReturnsAsync(new DataSourceRoute(false, "seed-secret", "default", "1"));
        _repository = new GqlDbRepository(provider.Object, cache.Object, Mock.Of<IDataSourceClientCache>(), store.Object);
    }

    private MongoGatewayDataEngine Engine(IGqlDbRepository? repository = null) =>
        new(repository ?? _repository, Resolver(), Principals(), NullLogger.Instance, eventPublisher: _publisher.Object);

    private static SchemaDefinitionExtended PersonSchema() =>
        Schema(fields: new() { Field("ItemId"), Field("Name"), Field("City"), Field("Owner") });

    /// <summary>Rows are visible and editable only to the caller who owns them.</summary>
    private static SchemaDefinitionExtended OwnedPersonSchema() =>
        Schema(
            read: SchemaAccessLevel.Custom,
            edit: SchemaAccessLevel.Custom,
            fields: new() { Field("ItemId"), Field("Name"), Field("City"), Field("Owner") },
            policies:
            [
                OwnerRule(PolicyOperation.READ, "read-owner"),
                OwnerRule(PolicyOperation.EDIT, "edit-owner"),
            ]);

    private static DataAccessPolicy OwnerRule(PolicyOperation operation, string name) =>
        Policy(
            PolicyType.RLS, operation, [],
            Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.AUTH, "userid", PolicyOperator.EQUAL, ConditionSource.SCHEMA_FIELD, rightOperand: "Owner")),
            priority: 1, name: name);

    private Task SeedAsync(string id, string name, string city, string owner = "u1") =>
        _db.GetCollection<BsonDocument>(Collection).InsertOneAsync(new BsonDocument
        {
            { "_id", id }, { "Name", name }, { "City", city }, { "Owner", owner },
        });

    private Task<long> CountAsync() => _db.GetCollection<BsonDocument>(Collection).CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty);

    private async Task<BsonDocument> StoredAsync(string id) =>
        await _db.GetCollection<BsonDocument>(Collection).Find(new BsonDocument("_id", id)).FirstAsync();

    private static UpsertCommand Upsert(string id, Dictionary<string, object?> record) =>
        new("upsertPerson", id, new Lazy<Dictionary<string, object?>>(() => record));

    private static WhereNode ById(string id) =>
        new(new Dictionary<string, object?> { ["ItemId"] = new Dictionary<string, object?> { ["eq"] = id } });

    [Fact]
    public async Task GetById_Found_ReturnsRow()
    {
        await SeedAsync("p1", "Ann", "Zurich");
        await SeedAsync("p2", "Bob", "Bern");

        var row = await Engine().GetByIdAsync(new EntityModel(PersonSchema(), null), "p2", ["Name"], "getPerson");

        row.Should().NotBeNull();
        row!["Name"].Should().Be("Bob");
    }

    [Fact]
    public async Task GetById_Missing_ReturnsNull()
    {
        await SeedAsync("p1", "Ann", "Zurich");

        var row = await Engine().GetByIdAsync(new EntityModel(PersonSchema(), null), "nope", ["Name"], "getPerson");

        row.Should().BeNull();
    }

    [Fact]
    public async Task GetById_HiddenByRls_ReturnsNull()
    {
        await SeedAsync("p1", "Ann", "Zurich", owner: "u2");

        var row = await Engine().GetByIdAsync(new EntityModel(OwnedPersonSchema(), null), "p1", ["Name"], "getPerson");

        row.Should().BeNull();
    }

    [Fact]
    public async Task Upsert_New_InsertsAndCreatedTrue()
    {
        var result = await Engine().UpsertAsync(
            new EntityModel(PersonSchema(), null),
            Upsert("p1", new() { ["Name"] = "Ann", ["City"] = "Zurich" }));

        result.Created.Should().BeTrue();
        result.Response.Acknowledged.Should().BeTrue();
        result.Response.ItemId.Should().Be("p1");
        var stored = await StoredAsync("p1");
        stored["Name"].AsString.Should().Be("Ann");
        stored["City"].AsString.Should().Be("Zurich");
        (await CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Upsert_New_OverwritesABodyIdWithTheRouteId()
    {
        var result = await Engine().UpsertAsync(
            new EntityModel(PersonSchema(), null),
            Upsert("p1", new() { ["_id"] = "other", ["Name"] = "Ann" }));

        result.Created.Should().BeTrue();
        (await StoredAsync("p1"))["Name"].AsString.Should().Be("Ann");
        (await CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Upsert_Existing_MergesOnlySentFields()
    {
        await SeedAsync("p1", "Ann", "Zurich");

        var result = await Engine().UpsertAsync(
            new EntityModel(PersonSchema(), null),
            Upsert("p1", new() { ["_id"] = "p1", ["Name"] = "Anna" }));

        result.Created.Should().BeFalse();
        result.Response.Acknowledged.Should().BeTrue();
        result.Response.ItemId.Should().Be("p1");
        var stored = await StoredAsync("p1");
        stored["Name"].AsString.Should().Be("Anna");
        stored["City"].AsString.Should().Be("Zurich");
        (await CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Upsert_ExistingButRlsHidden_ReturnsNotFoundAndDoesNotInsert()
    {
        await SeedAsync("p1", "Ann", "Zurich", owner: "u2");

        var result = await Engine().UpsertAsync(
            new EntityModel(OwnedPersonSchema(), null),
            Upsert("p1", new() { ["Name"] = "Hijacked", ["Owner"] = "u1" }));

        result.Created.Should().BeFalse();
        result.Response.Should().BeOfType<NotFoundActionResponse>();
        result.Response.Acknowledged.Should().BeFalse();
        (await CountAsync()).Should().Be(1);
        var stored = await StoredAsync("p1");
        stored["Name"].AsString.Should().Be("Ann");
        stored["Owner"].AsString.Should().Be("u2");
    }

    [Fact]
    public async Task Upsert_InsertRace_RetriesAsUpdate()
    {
        var existing = new BsonDocument { { "_id", "p1" }, { "Name", "Ann" }, { "City", "Zurich" }, { "Owner", "u1" } };
        var repo = new Mock<IGqlDbRepository>();
        // The row is missing at the existence check, and by the time the insert runs another request has created it.
        repo.SetupSequence(r => r.GetItemAsync(Collection, "p1"))
            .ReturnsAsync((BsonDocument?)null)
            .ReturnsAsync(existing);
        repo.Setup(r => r.InsertAsync(Collection, It.IsAny<BsonDocument>())).ThrowsAsync(DuplicateIdException());
        repo.Setup(r => r.GetItemAsync(Collection, It.IsAny<FilterDefinition<BsonDocument>>())).ReturnsAsync(existing);
        BsonDocument? updated = null;
        repo.Setup(r => r.UpdateAsync(Collection, It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()))
            .Callback((string _, BsonDocument _, BsonDocument data) => updated = data)
            .ReturnsAsync(new ActionResponse { Acknowledged = true, TotalImpactedData = 1 });

        var result = await Engine(repo.Object).UpsertAsync(
            new EntityModel(PersonSchema(), null),
            Upsert("p1", new() { ["Name"] = "Anna" }));

        result.Created.Should().BeFalse();
        result.Response.Acknowledged.Should().BeTrue();
        result.Response.ItemId.Should().Be("p1");
        repo.Verify(r => r.InsertAsync(Collection, It.IsAny<BsonDocument>()), Times.Once);
        repo.Verify(r => r.UpdateAsync(Collection, It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()), Times.Once);
        // The retry is a plain update of the sent field: nothing the failed insert stamped, and never the id.
        updated.Should().NotBeNull();
        updated!.Names.Should().NotContain("_id");
        updated.Names.Should().NotContain("CreatedDate");
        updated["Name"].AsString.Should().Be("Anna");
    }

    [Fact]
    public async Task Upsert_InsertFailsForAnotherReason_Propagates()
    {
        var repo = new Mock<IGqlDbRepository>();
        repo.Setup(r => r.GetItemAsync(Collection, "p1")).ReturnsAsync((BsonDocument?)null);
        repo.Setup(r => r.InsertAsync(Collection, It.IsAny<BsonDocument>())).ThrowsAsync(new TimeoutException("db down"));

        var act = () => Engine(repo.Object).UpsertAsync(
            new EntityModel(PersonSchema(), null),
            Upsert("p1", new() { ["Name"] = "Ann" }));

        await act.Should().ThrowAsync<TimeoutException>();
        repo.Verify(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()), Times.Never);
    }

    [Fact]
    public async Task Upsert_DuplicateOnAnotherField_DoesNotRetry()
    {
        var repo = new Mock<IGqlDbRepository>();
        repo.Setup(r => r.GetItemAsync(Collection, "p1")).ReturnsAsync((BsonDocument?)null);
        repo.Setup(r => r.InsertAsync(Collection, It.IsAny<BsonDocument>())).ThrowsAsync(DuplicateKeyException("Email"));

        var act = () => Engine(repo.Object).UpsertAsync(
            new EntityModel(PersonSchema(), null),
            Upsert("p1", new() { ["Name"] = "Ann" }));

        var ex = (await act.Should().ThrowAsync<GatewayException>()).Which;
        ex.FieldErrors.Should().ContainSingle(e => e.Field == "Email" && e.ValidationType == "Unique");
        repo.Verify(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()), Times.Never);
    }

    [Fact]
    public async Task Update_NoMatch_ReturnsNotFoundActionResponse()
    {
        var result = await Engine().UpdateAsync(
            new EntityModel(PersonSchema(), null),
            new UpdateCommand("updatePerson", ById("missing"), new Lazy<Dictionary<string, object?>>(() => new() { ["Name"] = "X" })));

        result.Should().BeOfType<NotFoundActionResponse>();
        result.Acknowledged.Should().BeFalse();
        result.Message.Should().Be("No data found to UPDATE or you don't have permission to UPDATE this record.");
    }

    [Fact]
    public void EntityModel_DtosDefaultsToNull_AndCanBeSet()
    {
        var schema = PersonSchema();

        new EntityModel(schema, null).Dtos.Should().BeNull();
        var dtos = new Dictionary<string, SchemaDefinitionExtended> { ["Address"] = Schema("Address") };
        new EntityModel(schema, null, dtos).Dtos.Should().BeSameAs(dtos);
    }

    /// <summary>The write error the Mongo driver reports for a duplicate <c>_id</c>.</summary>
    private static Exception DuplicateIdException() => DuplicateKeyException("_id");

    private static Exception DuplicateKeyException(string field)
    {
        var connection = new ConnectionId(new ServerId(new ClusterId(1), new DnsEndPoint("localhost", 27017)));
        var message = $"Command insert failed: E11000 duplicate key error collection: db.{Collection} index: {field}_ dup key: {{ {field}: \"p1\" }}";
        return new MongoCommandException(connection, message, new BsonDocument("insert", Collection), new BsonDocument { { "ok", 0 }, { "code", 11000 } });
    }

    // ---- bulk writes bounded by the read row rules (REST) ----

    /// <summary>Rows are readable only by their owner; anybody signed in may edit and delete them.</summary>
    private static SchemaDefinitionExtended ReadOwnRowsWriteAnySchema() =>
        Schema(
            read: SchemaAccessLevel.Custom,
            edit: SchemaAccessLevel.User,
            delete: SchemaAccessLevel.User,
            fields: new() { Field("ItemId"), Field("Name"), Field("City"), Field("Owner") },
            policies: [OwnerRule(PolicyOperation.READ, "read-owner")]);

    private static WhereNode CityIs(string city) =>
        new(new Dictionary<string, object?> { ["City"] = new Dictionary<string, object?> { ["eq"] = city } });

    [Fact]
    public async Task DeleteMany_BoundByReadRules_SkipsUnreadableRows()
    {
        await SeedAsync("p1", "Ann", "Zurich", owner: "u1");
        await SeedAsync("p2", "Bob", "Zurich", owner: "u2");

        var response = await Engine().DeleteManyAsync(
            new EntityModel(ReadOwnRowsWriteAnySchema(), null),
            new DeleteManyCommand("deleteManyPerson", CityIs("Zurich"), HardDelete: true, BoundByReadRules: true));

        response.TotalImpactedData.Should().Be(1);
        (await _db.GetCollection<BsonDocument>(Collection).Find(FilterDefinition<BsonDocument>.Empty).ToListAsync())
            .Select(d => d["_id"].AsString).Should().Equal("p2");
    }

    [Fact]
    public async Task DeleteMany_NotBoundByReadRules_ReachesEveryDeletableRow()
    {
        // GraphQL never sets the flag: its behaviour is unchanged.
        await SeedAsync("p1", "Ann", "Zurich", owner: "u1");
        await SeedAsync("p2", "Bob", "Zurich", owner: "u2");

        var response = await Engine().DeleteManyAsync(
            new EntityModel(ReadOwnRowsWriteAnySchema(), null),
            new DeleteManyCommand("deleteManyPerson", CityIs("Zurich"), HardDelete: true));

        response.TotalImpactedData.Should().Be(2);
        (await CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task UpdateMany_BoundByReadRules_SkipsUnreadableRows()
    {
        await SeedAsync("p1", "Ann", "Zurich", owner: "u1");
        await SeedAsync("p2", "Bob", "Zurich", owner: "u2");

        var response = await Engine().UpdateManyAsync(
            new EntityModel(ReadOwnRowsWriteAnySchema(), null),
            new UpdateManyCommand("updateManyPerson", CityIs("Zurich"),
                new Lazy<Dictionary<string, object?>>(() => new() { ["Name"] = "Changed" }), BoundByReadRules: true));

        response.TotalImpactedData.Should().Be(1);
        (await StoredAsync("p1"))["Name"].AsString.Should().Be("Changed");
        (await StoredAsync("p2"))["Name"].AsString.Should().Be("Bob");
    }

    [Fact]
    public async Task UpdateMany_BoundByReadRules_NothingReadable_NotFound()
    {
        await SeedAsync("p2", "Bob", "Zurich", owner: "u2");

        var response = await Engine().UpdateManyAsync(
            new EntityModel(ReadOwnRowsWriteAnySchema(), null),
            new UpdateManyCommand("updateManyPerson", CityIs("Zurich"),
                new Lazy<Dictionary<string, object?>>(() => new() { ["Name"] = "Changed" }), BoundByReadRules: true));

        response.Should().BeOfType<NotFoundActionResponse>();
        (await StoredAsync("p2"))["Name"].AsString.Should().Be("Bob");
    }
}
