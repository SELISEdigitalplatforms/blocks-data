using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Schemas;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

[Collection("Mongo")]
public class EntityViewStoreTests
{
    private const string Tenant = "tenant-1";
    private readonly IMongoDatabase _db;
    private readonly EntityViewStore _store;

    public EntityViewStoreTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        _store = new EntityViewStore(new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object));
    }

    private IMongoCollection<BsonDocument> Views => _db.GetCollection<BsonDocument>("PublishedEntityViews");

    private static SchemaSource Source() => new()
    {
        SchemaDefinitions =
        [
            new SchemaDefinition
            {
                ItemId = "id-Order", SchemaName = "Order", CollectionName = "Orders", SchemaType = SchemaType.Entity,
                Fields = [new FieldDefinition { Name = "Name", Type = "String" }, new FieldDefinition { Name = "Ship", Type = "Address" }]
            },
            new SchemaDefinition
            {
                ItemId = "id-Address", SchemaName = "Address", CollectionName = "Addresss", SchemaType = SchemaType.Dto,
                Fields = [new FieldDefinition { Name = "Street", Type = "String" }]
            },
            new SchemaDefinition
            {
                ItemId = "id-Person", SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity,
                Fields = [new FieldDefinition { Name = "Name", Type = "String" }]
            }
        ],
        DataValidations = [new DataValidation { ItemId = "val-1", SchemaId = "id-Order", FieldName = "Name" }],
        DataAccessPolicies = [new DataAccessPolicy { ItemId = "pol-1", SchemaId = "id-Order", PolicyName = "Owners", PolicyType = PolicyType.RLS }]
    };

    [Fact]
    public async Task Store_WriteThenLoad_RoundTripsSource()
    {
        await _store.WriteAsync(Tenant, 3, Source());

        var loaded = await _store.LoadAsync(Tenant, 3, "Order");

        loaded.Should().NotBeNull();
        loaded!.SchemaDefinitions.Select(s => s.SchemaName).Should().BeEquivalentTo(["Order", "Address"]);
        loaded.DataValidations.Should().ContainSingle(v => v.ItemId == "val-1");
        loaded.DataAccessPolicies.Should().ContainSingle(p => p.ItemId == "pol-1");
        (await _store.LoadAsync(Tenant, 3, "Person"))!.SchemaDefinitions.Should().ContainSingle();
        (await _store.LoadAsync(Tenant, 3, "Address")).Should().BeNull("a DTO has no view");
        (await _store.LoadAsync(Tenant, 4, "Order")).Should().BeNull();
        (await Views.Find(new BsonDocument("_id", "3:Order")).AnyAsync()).Should().BeTrue();
    }

    [Fact]
    public async Task Store_WriteTwice_IgnoresDuplicate()
    {
        await _store.WriteAsync(Tenant, 3, Source());

        var again = () => _store.WriteAsync(Tenant, 3, Source());

        await again.Should().NotThrowAsync();
        (await Views.CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty)).Should().Be(3, "two views and the completion marker");
    }

    [Fact]
    public async Task HasVersion_TrueAfterCompleteWrite()
    {
        await _store.WriteAsync(Tenant, 3, Source());

        (await _store.HasVersionAsync(Tenant, 3)).Should().BeTrue();
        (await _store.HasVersionAsync(Tenant, 4)).Should().BeFalse();
        (await _store.LoadAsync(Tenant, 3, EntityViewStore.CompleteMarkerName)).Should().BeNull("the marker is not a view");
    }

    [Fact]
    public async Task HasVersion_FalseWithoutMarker()
    {
        await Views.InsertOneAsync(new BsonDocument { { "_id", "3:Order" }, { "Version", 3L }, { "SchemaName", "Order" }, { "Content", new byte[0] } });

        (await _store.HasVersionAsync(Tenant, 3)).Should().BeFalse();
    }

    [Fact]
    public async Task Write_OneEntityFails_NoMarkerAndThrows()
    {
        var inserted = new List<string>();
        var repository = new Mock<IDbRepository>();
        repository
            .Setup(r => r.InsertAsync(It.IsAny<PublishedEntityView>(), Tenant))
            .Returns((PublishedEntityView view, string _) =>
            {
                if (view.SchemaName == "Order")
                    throw new InvalidOperationException("disk full");
                inserted.Add(view.ItemId);
                return Task.FromResult(view);
            });
        var store = new EntityViewStore(repository.Object);

        var act = () => store.WriteAsync(Tenant, 3, Source());

        var thrown = await act.Should().ThrowAsync<AggregateException>();
        thrown.Which.InnerExceptions.Should().ContainSingle().Which.InnerException!.Message.Should().Be("disk full");
        inserted.Should().Equal("3:Person");
    }

    [Fact]
    public async Task Store_DeleteExcept_KeepsListedVersions()
    {
        foreach (var version in new long[] { 1, 2, 3 })
            await _store.WriteAsync(Tenant, version, Source());

        await _store.DeleteExceptAsync(Tenant, [2, 3]);

        (await _store.HasVersionAsync(Tenant, 1)).Should().BeFalse();
        (await _store.HasVersionAsync(Tenant, 2)).Should().BeTrue();
        (await _store.HasVersionAsync(Tenant, 3)).Should().BeTrue();
        (await Views.CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty)).Should().Be(6);
    }

    [Fact]
    public async Task DeleteExcept_EmptyKept_DeletesNothing()
    {
        await _store.WriteAsync(Tenant, 3, Source());

        await _store.DeleteExceptAsync(Tenant, []);

        (await _store.HasVersionAsync(Tenant, 3)).Should().BeTrue();
        (await Views.CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty)).Should().Be(3);
    }

    [Fact]
    public async Task DeleteExcept_NewerVersionThanKept_Survives()
    {
        foreach (var version in new long[] { 1, 2, 5 })
            await _store.WriteAsync(Tenant, version, Source());

        // 5 is a publish under way: its snapshot is not listed yet.
        await _store.DeleteExceptAsync(Tenant, [2]);

        (await _store.HasVersionAsync(Tenant, 1)).Should().BeFalse();
        (await _store.HasVersionAsync(Tenant, 2)).Should().BeTrue();
        (await _store.HasVersionAsync(Tenant, 5)).Should().BeTrue();
        (await Views.CountDocumentsAsync(new BsonDocument("Version", 1L))).Should().Be(0, "markers go with their version");
    }
}
