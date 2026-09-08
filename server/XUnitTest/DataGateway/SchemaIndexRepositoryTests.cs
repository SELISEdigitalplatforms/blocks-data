using Blocks.Genesis;
using DataGateway.DomainService.Repositories;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway;

/// <summary>
/// Exercises DbRepository's CreateIndexAsync/DropIndexAsync against a real (ephemeral) MongoDB
/// instance. A mocked IDbRepository can assert the shape of a call, but only a real server can
/// prove an index actually gets built, enforces uniqueness, preserves compound field order, and
/// rejects a unique build over pre-existing duplicate data.
/// </summary>
[Collection("Mongo")]
public class SchemaIndexRepositoryTests
{
    private const string CollectionName = "Customers";
    private readonly IMongoDatabase _db;
    private readonly DbRepository _repository;

    public SchemaIndexRepositoryTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var contextProvider = new Mock<IDbContextProvider>();
        contextProvider.Setup(p => p.GetDatabase()).Returns(_db);

        _repository = new DbRepository(contextProvider.Object, new Mock<IBlocksSecret>().Object);
    }

    private async Task<List<BsonDocument>> ListIndexesAsync() =>
        await (await _db.GetCollection<BsonDocument>(CollectionName).Indexes.ListAsync()).ToListAsync();

    [Fact]
    public async Task CreateIndexAsync_SingleField_CreatesAscendingIndex()
    {
        var result = await _repository.CreateIndexAsync(CollectionName, new() { ("email", 1) }, isUnique: false, indexName: "email_1");

        result.Acknowledged.Should().BeTrue();
        var indexes = await ListIndexesAsync();
        indexes.Should().Contain(i => i["name"] == "email_1" && i["key"]["email"] == 1);
    }

    [Fact]
    public async Task CreateIndexAsync_Compound_PreservesFieldOrderAndDirection()
    {
        await _repository.CreateIndexAsync(CollectionName, new() { ("lastName", 1), ("age", -1) }, isUnique: false, indexName: "lastName_1_age_-1");

        var indexes = await ListIndexesAsync();
        var index = indexes.Single(i => i["name"] == "lastName_1_age_-1");
        var keyNames = index["key"].AsBsonDocument.Names.ToList();
        keyNames.Should().Equal("lastName", "age");
        index["key"]["lastName"].Should().Be(1);
        index["key"]["age"].Should().Be(-1);
    }

    [Fact]
    public async Task CreateIndexAsync_Unique_EnforcesUniquenessOnFutureInserts()
    {
        await _repository.CreateIndexAsync(CollectionName, new() { ("email", 1) }, isUnique: true, indexName: "email_1");
        var collection = _db.GetCollection<BsonDocument>(CollectionName);
        await collection.InsertOneAsync(new BsonDocument { { "email", "a@x.com" } });

        var act = async () => await collection.InsertOneAsync(new BsonDocument { { "email", "a@x.com" } });

        await act.Should().ThrowAsync<MongoWriteException>();
    }

    [Fact]
    public async Task CreateIndexAsync_UniqueOverExistingDuplicates_ThrowsAndBuildsNoIndex()
    {
        var collection = _db.GetCollection<BsonDocument>(CollectionName);
        await collection.InsertOneAsync(new BsonDocument { { "email", "dup@x.com" } });
        await collection.InsertOneAsync(new BsonDocument { { "email", "dup@x.com" } });

        var act = async () => await _repository.CreateIndexAsync(CollectionName, new() { ("email", 1) }, isUnique: true, indexName: "email_1");

        await act.Should().ThrowAsync<MongoCommandException>();
        var indexes = await ListIndexesAsync();
        indexes.Should().NotContain(i => i["name"] == "email_1");
    }

    [Fact]
    public async Task DropIndexAsync_RemovesThePreviouslyCreatedIndex()
    {
        await _repository.CreateIndexAsync(CollectionName, new() { ("email", 1) }, isUnique: false, indexName: "email_1");

        var result = await _repository.DropIndexAsync(CollectionName, "email_1");

        result.Acknowledged.Should().BeTrue();
        var indexes = await ListIndexesAsync();
        indexes.Should().NotContain(i => i["name"] == "email_1");
    }
}
