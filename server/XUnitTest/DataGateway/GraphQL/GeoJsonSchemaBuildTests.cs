using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Types;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.GraphQL;

/// <summary>
/// Builds a real schema containing GeoJson fields (SPEC #345 H1, H4, H5, H6).
///
/// The unit tests cover the pieces; this is the one that would catch the
/// scalar failing to register — <c>GetTypeNode</c> emits a bare
/// <c>NamedTypeNode("GeoJson")</c>, so if the type is not in the schema the
/// build throws rather than producing anything wrong-but-plausible.
/// </summary>
[Collection("Mongo")]
public class GeoJsonSchemaBuildTests
{
    private readonly DbRepository _repo;

    public GeoJsonSchemaBuildTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        var db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
        _repo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
    }

    /// <summary>
    /// A Store entity with a single geometry and an array of them, plus a Dto
    /// carrying one — H5's "GeoJson inside a child schema" case.
    /// </summary>
    private async Task SeedAsync()
    {
        var tripStop = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "TripStop",
            CollectionName = "TripStops",
            SchemaType = SchemaType.Dto,
            Fields = new()
            {
                new FieldDefinition { Name = "Label", Type = "String" },
                new FieldDefinition { Name = "location", Type = "GeoJson" },
            },
        };
        var store = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Store",
            CollectionName = "Stores",
            SchemaType = SchemaType.Entity,
            Fields = new()
            {
                new FieldDefinition { Name = "Name", Type = "String", RequiredOn = RequiredOn.Both },
                new FieldDefinition { Name = "location", Type = "GeoJson" },
                new FieldDefinition { Name = "waypoints", Type = "GeoJson", IsArray = true },
                new FieldDefinition { Name = "Stop", Type = "TripStop" },
            },
        };
        await _repo.InsertManyAsync(new List<SchemaDefinition> { tripStop, store });
    }

    private async Task<ISchema> BuildSchemaAsync()
    {
        await SeedAsync();
        var resolver = new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object);
        var builder = new GraphqlSchemaBuilder(resolver, _repo, NullLogger<GraphqlSchemaBuilder>.Instance);
        var schemaBuilder = SchemaBuilder.New();

        await builder.BuildSchema("", schemaBuilder, CancellationToken.None);
        return schemaBuilder.Create();
    }

    // H1: the scalar exists and the field is typed with it.
    [Fact]
    public async Task Schema_RegistersTheGeoJsonScalar()
    {
        var schema = await BuildSchemaAsync();

        schema.Types.Should().Contain(t => t.Name == "GeoJson");

        var store = schema.GetType<ObjectType>("Store");
        store.Fields["location"].Type.NamedType().Name.Should().Be("GeoJson");
    }

    // H4: an array field is a list of the scalar, not a list of something else.
    [Fact]
    public async Task Schema_TypesAnArrayGeoJsonFieldAsAList()
    {
        var schema = await BuildSchemaAsync();

        var waypoints = schema.GetType<ObjectType>("Store").Fields["waypoints"];

        waypoints.Type.IsListType().Should().BeTrue();
        waypoints.Type.NamedType().Name.Should().Be("GeoJson");
    }

    // H5: the same type resolves inside a Dto, on both the read and write side.
    [Fact]
    public async Task Schema_SupportsGeoJsonInsideADtoSchema()
    {
        var schema = await BuildSchemaAsync();

        schema.GetType<ObjectType>("TripStop").Fields["location"]
            .Type.NamedType().Name.Should().Be("GeoJson");
        schema.GetType<InputObjectType>("TripStopInput").Fields["location"]
            .Type.NamedType().Name.Should().Be("GeoJson");
    }

    // H2: the mutation input accepts the same scalar it returns.
    [Fact]
    public async Task Schema_AcceptsGeoJsonOnMutationInput()
    {
        var schema = await BuildSchemaAsync();

        var insertInput = schema.GetType<InputObjectType>("StoreInsertInput");

        insertInput.Fields["location"].Type.NamedType().Name.Should().Be("GeoJson");
        insertInput.Fields["waypoints"].Type.IsListType().Should().BeTrue();
    }

    // H6: the filter input offers equality and nothing that would not work.
    [Fact]
    public async Task Schema_GivesGeoJsonFieldsAnEqualityOnlyFilter()
    {
        var schema = await BuildSchemaAsync();

        var storeFilter = schema.GetType<InputObjectType>("StoreFilterInput");
        storeFilter.Fields["location"].Type.NamedType().Name.Should().Be("GeoJsonOperationFilterInput");

        var geoFilter = schema.GetType<InputObjectType>("GeoJsonOperationFilterInput");
        geoFilter.Fields.Select(f => f.Name).Should().BeEquivalentTo(["eq", "neq"]);
        geoFilter.Fields["eq"].Type.NamedType().Name.Should().Be("GeoJson");
    }
}
