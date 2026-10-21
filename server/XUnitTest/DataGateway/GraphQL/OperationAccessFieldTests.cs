using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution;
using HotChocolate.Types;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.GraphQL;

/// <summary>
/// Every record carries the base entity's access lists (Create, Read, Update, Delete), but their type is a
/// platform type rather than a project schema, so the entity types used to leave them out and they could not be
/// queried. They are now readable through a shared <c>OperationAccess</c> type, and only readable: they stay out
/// of the insert/update inputs and the filters. Proven through a real executor with the real QueryService.
/// </summary>
[Collection("Mongo")]
public class OperationAccessFieldTests
{
    private readonly DbRepository _repo;
    private readonly Mock<IGqlDbRepository> _gql = new();
    private BsonDocument? _projection;

    public OperationAccessFieldTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        var db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
        _repo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
        RequestContextAccessor.Current = new RequestContext { IsRequestFromBlocksCloud = true };

        _gql.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .Callback((string _, FilterDefinition<BsonDocument> _, BsonDocument _, BsonDocument projection, int _, int _) => _projection = projection)
            .ReturnsAsync(new List<BsonDocument>
            {
                new()
                {
                    { "_id", "p1" },
                    { "Title", "Chair" },
                    { "Read", new BsonDocument { { "Roles", new BsonArray { "admin" } }, { "UserIds", new BsonArray { "u-1", "u-2" } }, { "Permissions", new BsonArray() } } },
                    { "Update", new BsonDocument { { "UserIds", new BsonArray { "u-1" } } } },
                },
            });
    }

    [Fact]
    public async Task EntityTypes_ExposeTheAccessListsAsOperationAccess()
    {
        var executor = await BuildExecutorAsync(ProductWithAccessLists());
        var sdl = executor.Schema.ToString();

        sdl.Should().Contain("type OperationAccess");
        var product = executor.Schema.GetType<HotChocolate.Types.ObjectType>("Product");
        foreach (var name in new[] { "Create", "Read", "Update", "Delete" })
            product.Fields[name].Type.NamedType().Name.Should().Be("OperationAccess");

        var access = executor.Schema.GetType<HotChocolate.Types.ObjectType>("OperationAccess");
        access.Fields.Where(f => !f.IsIntrospectionField).Select(f => (f.Name, f.Type.Print()))
            .Should().BeEquivalentTo(new[] { ("Roles", "[String]"), ("UserIds", "[String]"), ("Permissions", "[String]") });
    }

    [Fact]
    public async Task AccessLists_AreReadOnly_NotInInputsOrFilters()
    {
        var executor = await BuildExecutorAsync(ProductWithAccessLists());

        foreach (var typeName in executor.Schema.Types.OfType<HotChocolate.Types.InputObjectType>().Select(t => t.Name))
        {
            var input = executor.Schema.GetType<HotChocolate.Types.InputObjectType>(typeName);
            input.Fields.Select(f => f.Name).Should().NotContain(["Create", "Read", "Update", "Delete"], $"{typeName} must not take the access lists");
        }
    }

    [Fact]
    public async Task AQuery_ReturnsTheStoredLists_AndReadsOnlyWhatWasSelected()
    {
        var executor = await BuildExecutorAsync(ProductWithAccessLists());

        var result = (IOperationResult)await executor.ExecuteAsync(
            "{ getProducts { items { Title Read { Roles UserIds Permissions } Update { UserIds } Delete { Roles } } } }");

        result.Errors.Should().BeNullOrEmpty();
        var item = Item(result);
        item["Title"].Should().Be("Chair");
        var read = (IReadOnlyDictionary<string, object?>)item["Read"]!;
        ((IEnumerable<object?>)read["Roles"]!).Should().Equal("admin");
        ((IEnumerable<object?>)read["UserIds"]!).Should().Equal("u-1", "u-2");
        ((IEnumerable<object?>)read["Permissions"]!).Should().BeEmpty();
        ((IEnumerable<object?>)((IReadOnlyDictionary<string, object?>)item["Update"]!)["UserIds"]!).Should().Equal("u-1");
        item["Delete"].Should().BeNull("a list never set on the record comes back empty");

        _projection.Should().NotBeNull();
        _projection!.Names.Should().Contain(["Read.Roles", "Read.UserIds", "Read.Permissions", "Update.UserIds"]);
        _projection.Names.Should().NotContain("Create.Roles");
    }

    [Fact]
    public async Task AccessLists_FollowTheirFieldAccess()
    {
        // A field readable by signed-in users only is masked for an anonymous caller, like any other field.
        var executor = await BuildExecutorAsync(ProductWithAccessLists(readAccess: SchemaAccessLevel.User));
        ClearContext();
        RequestContextAccessor.Current = new RequestContext { TenantId = "tenant", BlocksKey = "tenant", IsRequestFromBlocksCloud = false };

        var result = (IOperationResult)await executor.ExecuteAsync("{ getProducts { items { Title Read { UserIds } } } }");

        result.Errors.Should().BeNullOrEmpty();
        var item = Item(result);
        item["Title"].Should().Be("Chair");
        item["Read"].Should().BeNull();
    }

    [Fact]
    public async Task AProjectSchemaNamedOperationAccess_IsServedAsTheProjectDefinesIt()
    {
        var own = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "OperationAccess",
            CollectionName = "OperationAccesses",
            SchemaType = SchemaType.Dto,
            ReadAccessLevel = SchemaAccessLevel.Public,
            Fields = [new FieldDefinition { Name = "Note", Type = "String" }],
        };
        var executor = await BuildExecutorAsync(ProductWithAccessLists(), own);

        var access = executor.Schema.GetType<HotChocolate.Types.ObjectType>("OperationAccess");
        access.Fields.Where(f => !f.IsIntrospectionField).Select(f => f.Name).Should().Contain("Note").And.NotContain("Roles");
    }

    private static IReadOnlyDictionary<string, object?> Item(IOperationResult result)
    {
        var data = (IReadOnlyDictionary<string, object?>)result.Data!["getProducts"]!;
        return (IReadOnlyDictionary<string, object?>)((IReadOnlyList<object?>)data["items"]!)[0]!;
    }

    /// <summary>The Product schema as a stored one looks: the access lists and their flattened inner fields.</summary>
    private static SchemaDefinition ProductWithAccessLists(SchemaAccessLevel readAccess = SchemaAccessLevel.Inherited)
    {
        var fields = new List<FieldDefinition> { new() { Name = "Title", Type = "String" } };
        foreach (var list in new[] { "Create", "Read", "Update", "Delete" })
        {
            fields.Add(new FieldDefinition { Name = list, Type = "OperationAccess", ReadAccessLevel = list == "Read" ? readAccess : SchemaAccessLevel.Inherited });
            foreach (var inner in new[] { "Roles", "UserIds", "Permissions" })
                fields.Add(new FieldDefinition { Name = $"{list}.{inner}", Type = "String", IsArray = true, IsReferenceField = true, ReferenceFieldType = "OperationAccess" });
        }

        return new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Product",
            CollectionName = "Products",
            SchemaType = SchemaType.Entity,
            ReadAccessLevel = SchemaAccessLevel.Public,
            Fields = fields,
        };
    }

    private async Task<IRequestExecutor> BuildExecutorAsync(params SchemaDefinition[] schemas)
    {
        await _repo.InsertManyAsync(schemas.ToList());

        var queryService = new QueryService(_gql.Object, Resolver(), Principals(), NullLogger<QueryService>.Instance);
        var schemaBuilder = new GraphqlSchemaBuilder(
            new SchemaResolver(new Mock<IMutationService>().Object, queryService), _repo, NullLogger<GraphqlSchemaBuilder>.Instance);

        var http = new DefaultHttpContext();
        http.Request.Headers["x-blocks-key"] = "tenant";
        var accessor = new Mock<IHttpContextAccessor>();
        accessor.Setup(a => a.HttpContext).Returns(http);

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(accessor.Object);
        services.AddGraphQLServer()
            .ConfigureSchemaAsync((builder, ct) => new ValueTask(schemaBuilder.BuildSchema("", builder, ct)));
        var provider = services.BuildServiceProvider();
        return await provider.GetRequiredService<IRequestExecutorResolver>().GetRequestExecutorAsync();
    }
}
