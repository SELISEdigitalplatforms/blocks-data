using Blocks.Genesis;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataAccess;

/// <summary>
/// The gateway and the Genesis data-access engine read the same tenant rows. System entities stay out of
/// GraphQL, and for every other schema the engine's loader assembles exactly what the GraphQL build assembles.
/// </summary>
[Collection("Mongo")]
public class GenesisDataAccessTests
{
    private const string Tenant = "tenant-1";
    private readonly IMongoDatabase _db;
    private readonly GraphqlSchemaBuilder _builder;
    private readonly DataAccessResolver _resolver;
    private readonly AccessPrincipal _principal = new("user-1", "user@x.com", Tenant, "org-1", [], [], true, false) { HasContext = true };

    public GenesisDataAccessTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var contextProvider = new Mock<IDbContextProvider>();
        contextProvider.Setup(p => p.GetDatabase(Tenant)).Returns(_db);
        var repository = new DbRepository(contextProvider.Object, Mock.Of<IBlocksSecret>());
        _builder = new GraphqlSchemaBuilder(
            new SchemaResolver(Mock.Of<IMutationService>(), Mock.Of<IQueryService>()), repository, NullLogger<GraphqlSchemaBuilder>.Instance);
        var principals = new Mock<IAccessPrincipalAccessor>();
        principals.Setup(p => p.Current).Returns(_principal);
        _resolver = new DataAccessResolver(contextProvider.Object, new DataAccessPolicyResolutionService(new SchemaPolicySource()), principals.Object);
    }

    private async Task SeedAsync()
    {
        var order = new SchemaDefinition
        {
            ItemId = "sch-order",
            SchemaName = "Order",
            ReadAccessLevel = SchemaAccessLevel.Custom,
            EditAccessLevel = SchemaAccessLevel.Custom,
            Fields = [new FieldDefinition { Name = "Status", Type = "String" }, new FieldDefinition { Name = "CreatedBy", Type = "String" }]
        };
        var systemUser = new SchemaDefinition
        {
            ItemId = "sch-system-user",
            SchemaName = "User",
            CollectionName = "Users",
            IsSystemEntity = true,
            ReadAccessLevel = SchemaAccessLevel.Custom,
            Fields = [new FieldDefinition { Name = "Email", Type = "String" }, new FieldDefinition { Name = "Roles", Type = "Json" }]
        };
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertManyAsync([order, systemUser]);

        var owner = Policy(PolicyType.RLS, PolicyOperation.READ, [],
            Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, ConditionSource.AUTH, "userId")));
        owner.ItemId = "pol-owner";
        owner.SchemaId = order.ItemId;
        await _db.GetCollection<DataAccessPolicy>("DataAccessPolicys").InsertOneAsync(owner);
        await _db.GetCollection<DataValidation>("DataValidations").InsertOneAsync(
            new DataValidation { ItemId = "val-1", SchemaId = order.ItemId, FieldName = "Status" });
    }

    [Fact]
    public async Task ReadDraftSourceAsync_LeavesSystemEntitiesOutOfGraphQl()
    {
        await SeedAsync();

        var source = await _builder.ReadDraftSourceAsync(Tenant);

        source.SchemaDefinitions.Select(s => s.SchemaName).Should().Equal("Order");
    }

    [Fact]
    public async Task SystemEntity_IsStillResolvableByTheEngine()
    {
        await SeedAsync();

        var schema = await _resolver.LoadSchemaAsync("User", _principal);

        schema.Should().NotBeNull();
        schema!.IsSystemEntity.Should().BeTrue();
        (await _resolver.ResolveReadFilterAsync("User", new MongoDB.Bson.BsonDocument())).IsAccessGranted
            .Should().BeFalse("Custom read with no policy denies, so a seeded system entity is closed until policies exist");
    }

    [Fact]
    public async Task LoadSchemaAsync_MatchesGatewayAssemble_ForTheSameRows()
    {
        await SeedAsync();
        var expected = GraphqlSchemaBuilder.Assemble(await _builder.ReadDraftSourceAsync(Tenant)).Single(s => s.SchemaName == "Order");

        var actual = await _resolver.LoadSchemaAsync("Order", _principal);

        // Column clones get a fresh ItemId, timestamps and an audit stamp on every assembly (the gateway stamps
        // from the ambient context, the loader from the principal); none of that is evaluated. Everything else must match.
        actual.Should().BeEquivalentTo(expected, o => o
            .Excluding(ctx => ctx.Path.StartsWith("Policies") && (
                ctx.Path.EndsWith("ItemId") || ctx.Path.EndsWith("CreatedBy") || ctx.Path.EndsWith("LastUpdatedBy") || ctx.Path.EndsWith("OrganizationId")))
            .Excluding(ctx => ctx.Path.EndsWith("CreatedDate"))
            .Excluding(ctx => ctx.Path.EndsWith("LastUpdatedDate")));
    }
}
