using System.Collections.Immutable;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution.Processing;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using HotChocolate.Types;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using StackExchange.Redis;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// The base entity's Create/Read/Update/Delete (OperationAccess) on a tenant entity: their Roles, UserIds and
/// Permissions get flattened entries like a child schema's, so they take access, validation rules and defaults,
/// while GraphQL still builds (OperationAccess is no GraphQL type).
/// </summary>
[Collection("Mongo")]
public class BaseEntityAccessListTests
{
    private const string Tenant = "access-lists-tenant";
    private static readonly string[] Lists = ["Create", "Read", "Update", "Delete"];
    private static readonly string[] Inner = ["Roles", "UserIds", "Permissions"];
    private readonly IMongoDatabase _db;
    private readonly DbRepository _schemaRepo;
    private readonly GqlDbRepository _repo;

    public BaseEntityAccessListTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        _schemaRepo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
        var cache = new Mock<ICacheClient>();
        cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());
        var store = new Mock<IDataSourceConfigStore>();
        store.Setup(x => x.LoadAsync(It.IsAny<string>())).ReturnsAsync(new DataSourceRoute(false, "seed-secret", "default", "1"));
        _repo = new GqlDbRepository(provider.Object, cache.Object, Mock.Of<IDataSourceClientCache>(), store.Object);
    }

    /// <summary>An Employee as the gateway stores it after a save: its own field, the default fields, and the flattened inner fields.</summary>
    private async Task<SchemaDefinition> SavedEmployeeAsync()
    {
        var employee = new SchemaDefinition
        {
            ItemId = "employee-id", SchemaName = "Employee", CollectionName = "Employees", SchemaType = SchemaType.Entity,
            Fields = [new FieldDefinition { Name = "Name", Type = "String" }],
        };
        employee.AddDefaultFields();
        await new SchemaDefinitionReferenceHelper(_schemaRepo, Mock.Of<ISchemaChangeLogService>()).AddReferenceInnerFieldsToSchemaAsync(employee);
        return employee;
    }

    [Fact]
    public async Task Saving_GivesEachAccessListItsRolesUserIdsAndPermissions_AndKeepsTheirDefaults()
    {
        var employee = await SavedEmployeeAsync();

        foreach (var list in Lists)
        foreach (var inner in Inner)
        {
            var field = employee.Fields.Should().ContainSingle(f => f.Name == $"{list}.{inner}").Subject;
            (field.Type, field.IsArray, field.IsReferenceField, field.ReferenceFieldType).Should().Be(("String", true, true, "OperationAccess"));
        }

        // A default set on Read.Roles survives the next save, which rebuilds the flattened entries.
        var mine = new FieldDefaultValue { Kind = DefaultValueKind.Static, Value = new List<object> { "admin" } };
        employee.Fields.Single(f => f.Name == "Read.Roles").DefaultValue = mine;
        await new SchemaDefinitionReferenceHelper(_schemaRepo, Mock.Of<ISchemaChangeLogService>()).AddReferenceInnerFieldsToSchemaAsync(employee);

        employee.Fields.Count(f => f.Name == "Read.Roles").Should().Be(1);
        employee.Fields.Single(f => f.Name == "Read.Roles").DefaultValue.Should().BeSameAs(mine);
    }

    [Fact]
    public async Task TheSchemaResponseNestsThem()
    {
        var employee = await SavedEmployeeAsync();

        var read = FieldDefinitionMapper.GetFieldDefinitionResponses(employee.Fields, [], []).Single(f => f.Name == "Read");

        read.Type.Should().Be("OperationAccess");
        read.Fields.Select(f => (f.Name, f.Type, f.IsArray)).Should().Equal(("Roles", "String", true), ("UserIds", "String", true), ("Permissions", "String", true));
    }

    [Fact]
    public async Task GraphQlStillBuilds_AndAnInsertStoresTheReadRolesDefault()
    {
        var employee = await SavedEmployeeAsync();
        employee.Fields.Single(f => f.Name == "Read.Roles").DefaultValue =
            new FieldDefaultValue { Kind = DefaultValueKind.Static, Value = new List<object> { "admin", "app-user" } };
        await _schemaRepo.InsertManyAsync(new List<SchemaDefinition> { employee });

        // Publishing: no filter, input or output type for OperationAccess is needed.
        var builder = new GraphqlSchemaBuilder(new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object), _schemaRepo, NullLogger<GraphqlSchemaBuilder>.Instance);
        var schemaBuilder = SchemaBuilder.New();
        await builder.BuildSchema("", schemaBuilder, CancellationToken.None);
        var graphQl = schemaBuilder.Create();
        graphQl.GetType<InputObjectType>("EmployeeFilterInput").Fields.Select(f => f.Name.ToString()).Should().NotContain(Lists);
        var insertInput = graphQl.GetType<InputObjectType>("EmployeeInsertInput");

        // Runtime: the published field tree carries Read.Roles' default; an insert without Read gets it.
        var runtime = Schema(schemaName: "Employee", collectionName: "Employees", fields: FieldDefinitionMapper.GetFieldDefinitionResponses(employee.Fields, [], []));
        runtime.ItemId = employee.ItemId;
        BlocksTestContext.Set(userId: "u1", tenantId: Tenant);
        RequestContextAccessor.Current = new RequestContext { TenantId = Tenant };
        var service = new MutationService(_repo, Mock.Of<IDataChangeEventPublisher>(), Resolver(), Principals(), NullLogger<MutationService>.Instance);

        await service.InsertAsync(runtime, Ctx("{ ItemId: \"e1\", Name: \"Ann\" }"), insertInput);

        var row = _db.GetCollection<BsonDocument>("Employees").Find(new BsonDocument("_id", "e1")).Single();
        row["Read"]["Roles"].AsBsonArray.Select(v => v.AsString).Should().Equal("admin", "app-user");
        // The requester can read, edit and delete what they insert.
        foreach (var list in new[] { "Read", "Update", "Delete" })
            row[list]["UserIds"].AsBsonArray.Select(v => v.AsString).Should().Equal("u1");
        row.Contains("Create").Should().BeFalse();   // no default and no requester there: nothing is written
    }

    private static IResolverContext Ctx(string inputLiteral)
    {
        var doc = Utf8GraphQLParser.Parse($"{{ x(input: {inputLiteral}) {{ y }} }}");
        var literal = ((FieldNode)((OperationDefinitionNode)doc.Definitions[0]).SelectionSet.Selections[0]).Arguments[0].Value;
        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns("mutationField");
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.Field).Returns(field.Object);
        var ctx = new Mock<IResolverContext>();
        ctx.Setup(c => c.Selection).Returns(selection.Object);
        ctx.Setup(c => c.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName)).Returns(literal);
        ctx.Setup(c => c.ArgumentValue<object?>(GraphQlConstant.WhereFieldName)).Returns((object?)null);
        ctx.Setup(c => c.ArgumentValue<string?>(GraphQlConstant.FilterFieldName)).Returns((string?)null);
        ctx.Setup(c => c.ScopedContextData).Returns(ImmutableDictionary<string, object?>.Empty);
        return ctx.Object;
    }
}
