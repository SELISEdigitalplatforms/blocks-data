using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Repositories;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Repositories;

[Collection("Mongo")]
public class DbRepositoryTests
{
    private readonly IMongoDatabase _db;
    private readonly DbRepository _repo;

    public DbRepositoryTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        var secret = new Mock<IBlocksSecret>();
        secret.SetupGet(s => s.DatabaseConnectionString).Returns("mongodb://localhost");
        _repo = new DbRepository(provider.Object, secret.Object);
    }

    private static SchemaDefinition NewSchema(string name) => new()
    {
        ItemId = Guid.NewGuid().ToString(),
        SchemaName = name,
        CollectionName = name + "s",
        CreatedDate = DateTime.UtcNow,
        LastUpdatedDate = DateTime.UtcNow
    };

    [Fact]
    public async Task Insert_And_GetById_Typed()
    {
        var schema = NewSchema("Alpha");
        await _repo.InsertAsync(schema);

        var fetched = await _repo.GetItemAsync<SchemaDefinition>(schema.ItemId);

        fetched.Should().NotBeNull();
        fetched!.SchemaName.Should().Be("Alpha");
    }

    [Fact]
    public async Task GetItem_ByFilter_Typed()
    {
        var schema = NewSchema("Beta");
        await _repo.InsertAsync(schema);

        var filter = Builders<SchemaDefinition>.Filter.Eq(x => x.SchemaName, "Beta");
        var fetched = await _repo.GetItemAsync(filter);

        fetched!.ItemId.Should().Be(schema.ItemId);
    }

    [Fact]
    public async Task Update_Typed_ModifiesDocument()
    {
        var schema = NewSchema("Gamma");
        await _repo.InsertAsync(schema);

        schema.SchemaName = "GammaUpdated";
        var result = await _repo.UpdateAsync(schema);

        result.Acknowledged.Should().BeTrue();
        var fetched = await _repo.GetItemAsync<SchemaDefinition>(schema.ItemId);
        fetched!.SchemaName.Should().Be("GammaUpdated");
    }

    [Fact]
    public async Task Update_ByFilter_Typed()
    {
        var schema = NewSchema("Delta");
        await _repo.InsertAsync(schema);
        var filter = Builders<SchemaDefinition>.Filter.Eq(x => x.ItemId, schema.ItemId);

        schema.SchemaName = "DeltaX";
        var result = await _repo.UpdateAsync(filter, schema);

        result.Acknowledged.Should().BeTrue();
    }

    [Fact]
    public async Task Delete_Typed_RemovesDocument()
    {
        var schema = NewSchema("Epsilon");
        await _repo.InsertAsync(schema);
        var filter = Builders<SchemaDefinition>.Filter.Eq(x => x.ItemId, schema.ItemId);

        var result = await _repo.DeleteAsync(filter);

        result.TotalImpactedData.Should().Be(1);
        (await _repo.GetItemAsync<SchemaDefinition>(schema.ItemId)).Should().BeNull();
    }

    [Fact]
    public async Task InsertMany_And_GetItemsWithCount_Typed()
    {
        var list = new List<SchemaDefinition> { NewSchema("M1"), NewSchema("M2"), NewSchema("M3") };
        foreach (var s in list) s.Tags.Add("bulk");
        await _repo.InsertManyAsync(list);

        var filter = Builders<BsonDocument>.Filter.Eq("Tags", "bulk");
        var (items, count) = await _repo.GetItemsWithCountAsync<SchemaDefinition>(filter, skip: 0, limit: 2);

        count.Should().BeGreaterThanOrEqualTo(3);
        items.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetItems_Typed_WithSortAndProjection()
    {
        await _repo.InsertManyAsync(new List<SchemaDefinition> { NewSchema("S1"), NewSchema("S2") });

        var filter = Builders<BsonDocument>.Filter.In("SchemaName", new[] { "S1", "S2" });
        var sort = Builders<BsonDocument>.Sort.Ascending("SchemaName");
        var items = await _repo.GetItemsAsync<SchemaDefinition>(filter, sort, null, 0, 10);

        items.Should().HaveCountGreaterThanOrEqualTo(2);
    }

    [Fact]
    public async Task GetItems_TwoTypeParam_Response()
    {
        var schema = NewSchema("Resp");
        await _repo.InsertAsync(schema);

        var filter = Builders<SchemaDefinition>.Filter.Eq(x => x.SchemaName, "Resp");
        var items = await _repo.GetItemsAsync<SchemaDefinition, SchemaDefinition>(filter);

        items.Should().ContainSingle(s => s.ItemId == schema.ItemId);
    }

    [Fact]
    public async Task Upsert_Typed_InsertsThenUpdates()
    {
        var schema = NewSchema("Ups");
        var r1 = await _repo.UpsertAsync(schema);
        r1.Acknowledged.Should().BeTrue();

        schema.SchemaName = "UpsChanged";
        await _repo.UpsertAsync(schema);

        (await _repo.GetItemAsync<SchemaDefinition>(schema.ItemId))!.SchemaName.Should().Be("UpsChanged");
    }

    [Fact]
    public async Task UpsertMany_Typed()
    {
        var list = new List<SchemaDefinition> { NewSchema("UM1"), NewSchema("UM2") };
        var result = await _repo.UpsertManyAsync(list);
        result.Acknowledged.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateMany_Typed()
    {
        var list = new List<SchemaDefinition> { NewSchema("UpdM1"), NewSchema("UpdM2") };
        await _repo.InsertManyAsync(list);
        list[0].SchemaName = "UpdM1x";
        var result = await _repo.UpdateManyAsync(list);
        result.Acknowledged.Should().BeTrue();
    }

    [Fact]
    public async Task DeleteMany_Typed()
    {
        var list = new List<SchemaDefinition> { NewSchema("D1"), NewSchema("D2") };
        foreach (var s in list) s.Tags.Add("delgroup");
        await _repo.InsertManyAsync(list);

        var filter = Builders<SchemaDefinition>.Filter.Eq("Tags", "delgroup");
        var result = await _repo.DeleteManyAsync(filter);

        result.TotalImpactedData.Should().Be(2);
    }

    [Fact]
    public async Task Aggregate_ReturnsFirstDocument()
    {
        await _repo.InsertManyAsync(new List<SchemaDefinition> { NewSchema("Agg1"), NewSchema("Agg2") });
        var pipeline = new[] { new BsonDocument("$count", "total") };

        var doc = await _repo.AggregateOneAsync<SchemaDefinition>(pipeline);

        doc.Should().NotBeNull();
        doc!["total"].ToInt64().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task BsonDocument_Crud_Roundtrip()
    {
        var id = Guid.NewGuid().ToString();
        var doc = new BsonDocument { { "_id", id }, { "Name", "Widget" }, { "Qty", 5 } };
        await _repo.InsertAsync("Widgets", doc);

        var byId = await _repo.GetItemAsync("Widgets", id);
        byId.Should().NotBeNull();
        byId!["Name"].AsString.Should().Be("Widget");

        var byFilter = await _repo.GetItemAsync("Widgets", new BsonDocument("Name", "Widget"));
        byFilter.Should().NotBeNull();

        var upd = await _repo.UpdateAsync("Widgets", new BsonDocument("_id", id), new BsonDocument("Qty", 10));
        upd.TotalImpactedData.Should().Be(1);

        var items = await _repo.GetItemsAsync("Widgets", new BsonDocument(), new BsonDocument("Name", 1), null, 0, 10);
        items.Should().NotBeEmpty();

        var (withCount, count) = await _repo.GetItemsWithCountAsync("Widgets", new BsonDocument());
        count.Should().BeGreaterThan(0);
        withCount.Should().NotBeEmpty();

        var del = await _repo.DeleteAsync("Widgets", new BsonDocument("_id", id));
        del.TotalImpactedData.Should().Be(1);
    }

    [Fact]
    public async Task BsonDocument_InsertMany_UpdateMany_DeleteMany()
    {
        var docs = new List<BsonDocument>
        {
            new() { { "_id", Guid.NewGuid().ToString() }, { "Group", "g" }, { "N", 1 } },
            new() { { "_id", Guid.NewGuid().ToString() }, { "Group", "g" }, { "N", 2 } }
        };
        await _repo.InsertManyAsync("Gadgets", docs);

        var updMany = await _repo.UpdateManyAsync("Gadgets", new BsonDocument("Group", "g"), new BsonDocument("N", 9));
        updMany.TotalImpactedData.Should().Be(2);

        var delMany = await _repo.DeleteManyAsync("Gadgets", new BsonDocument("Group", "g"));
        delMany.TotalImpactedData.Should().Be(2);
    }

    [Fact]
    public async Task BsonDocument_Upsert()
    {
        var id = Guid.NewGuid().ToString();
        var doc = new BsonDocument { { "_id", id }, { "V", 1 } };
        var result = await _repo.UpsertAsync("Things", doc);
        result.Acknowledged.Should().BeTrue();
    }

    [Fact]
    public async Task GetById_NotFound_ReturnsNull()
    {
        (await _repo.GetItemAsync<SchemaDefinition>(Guid.NewGuid().ToString())).Should().BeNull();
        (await _repo.GetItemAsync("Widgets", Guid.NewGuid().ToString())).Should().BeNull();
    }
}
