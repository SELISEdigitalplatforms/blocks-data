using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

[Collection("Mongo")]
public class SchemaSnapshotStoreTests
{
    private const string Tenant = "tenant-1";
    private readonly IMongoDatabase _db;
    private readonly DbRepository _repository;

    public SchemaSnapshotStoreTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        _repository = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
    }

    private static SchemaSource Source(int schemaCount = 2) => new()
    {
        SchemaDefinitions = Enumerable.Range(0, schemaCount).Select(i => new SchemaDefinition
        {
            ItemId = $"schema-{i}",
            SchemaName = $"Thing{i}",
            CollectionName = $"Things{i}",
            SchemaType = SchemaType.Entity,
            ReadAccessLevel = SchemaAccessLevel.Custom,
            Fields = [new FieldDefinition { Name = "Name", Type = "String", EnumValues = ["A", "B"] }]
        }).ToList(),
        DataValidations = [new DataValidation { ItemId = "validation-1", SchemaId = "schema-0", FieldName = "Name" }],
        DataAccessPolicies = [new DataAccessPolicy { ItemId = "policy-1", SchemaId = "schema-0", PolicyName = "Owners only", PolicyType = PolicyType.RLS }]
    };

    [Fact]
    public async Task ASavedSnapshotLoadsBackUnchanged()
    {
        var store = new SchemaSnapshotStore(_repository);
        var source = Source();

        await store.SaveAsync(Tenant, 3, SchemaSnapshotStore.Pack(source), SchemaSnapshotKind.Publish, ["log-1"]);
        var loaded = await store.LoadAsync(Tenant, 3);

        loaded.Should().NotBeNull();
        loaded!.SchemaDefinitions.Should().BeEquivalentTo(source.SchemaDefinitions);
        loaded.DataValidations.Should().BeEquivalentTo(source.DataValidations);
        loaded.DataAccessPolicies.Should().BeEquivalentTo(source.DataAccessPolicies);
    }

    [Fact]
    public async Task TheManifestDescribesTheSnapshot()
    {
        var store = new SchemaSnapshotStore(_repository);
        var content = SchemaSnapshotStore.Pack(Source(schemaCount: 4));

        var manifest = await store.SaveAsync(Tenant, 5, content, SchemaSnapshotKind.Publish, ["log-1", "log-2"]);

        manifest.ItemId.Should().Be("5");
        manifest.Version.Should().Be(5);
        manifest.SchemaCount.Should().Be(4);
        manifest.ChangeLogIds.Should().Equal("log-1", "log-2");
        manifest.CompressedSizeBytes.Should().Be(content.CompressedBytes.Length);
        manifest.RawSizeBytes.Should().BeGreaterThan(0);
        manifest.ChunkCount.Should().Be(1);
    }

    [Fact]
    public async Task LargeContentIsSplitIntoChunksAndReassembled()
    {
        var store = new SchemaSnapshotStore(_repository, chunkSizeBytes: 64);
        var source = Source(schemaCount: 50);

        var manifest = await store.SaveAsync(Tenant, 1, SchemaSnapshotStore.Pack(source), SchemaSnapshotKind.Publish, []);
        var loaded = await store.LoadAsync(Tenant, 1);

        manifest.ChunkCount.Should().BeGreaterThan(1);
        loaded!.SchemaDefinitions.Select(d => d.SchemaName).Should().Equal(source.SchemaDefinitions.Select(d => d.SchemaName));
    }

    [Fact]
    public async Task AVersionWithoutASnapshotLoadsAsNull()
    {
        (await new SchemaSnapshotStore(_repository).LoadAsync(Tenant, 9)).Should().BeNull();
    }

    [Fact]
    public async Task APublishedVersionCannotBeOverwritten()
    {
        var store = new SchemaSnapshotStore(_repository);
        await store.SaveAsync(Tenant, 2, SchemaSnapshotStore.Pack(Source()), SchemaSnapshotKind.Publish, []);

        var overwrite = () => store.SaveAsync(Tenant, 2, SchemaSnapshotStore.Pack(Source(schemaCount: 1)), SchemaSnapshotKind.Publish, []);

        await overwrite.Should().ThrowAsync<MongoException>();
        (await store.LoadAsync(Tenant, 2))!.SchemaDefinitions.Should().HaveCount(2);
    }

    [Fact]
    public async Task AnIncompleteSnapshotFailsToLoadInsteadOfServingPartialSchemas()
    {
        var store = new SchemaSnapshotStore(_repository, chunkSizeBytes: 64);
        await store.SaveAsync(Tenant, 1, SchemaSnapshotStore.Pack(Source(schemaCount: 20)), SchemaSnapshotKind.Publish, []);
        await _db.GetCollection<PublishedSchemaSnapshotChunk>("PublishedSchemaSnapshotChunks")
            .DeleteOneAsync(c => c.Version == 1 && c.Index == 1);

        var load = () => store.LoadAsync(Tenant, 1);

        await load.Should().ThrowAsync<InvalidDataException>();
    }

    [Fact]
    public void Constructor_RejectsANullRepositoryAndAnEmptyChunkSize()
    {
        Assert.Throws<ArgumentNullException>(() => new SchemaSnapshotStore(null!));
        Assert.Throws<ArgumentOutOfRangeException>(() => new SchemaSnapshotStore(_repository, 0));
    }
}
