using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.GraphQL;

[Collection("Mongo")]
public class SchemaBuildIntegrationTests
{
    private readonly IMongoDatabase _db;
    private readonly DbRepository _repo;

    public SchemaBuildIntegrationTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        _db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(_db);
        var secret = new Mock<IBlocksSecret>();
        _repo = new DbRepository(provider.Object, secret.Object);
    }

    private async Task SeedAsync()
    {
        var address = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Address",
            CollectionName = "Addresses",
            SchemaType = SchemaType.Dto,
            Fields = new() { new FieldDefinition { Name = "City", Type = "String" } }
        };
        var person = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            ReadAccessLevel = SchemaAccessLevel.Custom,
            Fields = new()
            {
                new FieldDefinition { Name = "Name", Type = "String" },
                new FieldDefinition { Name = "Age", Type = "Int" },
                new FieldDefinition { Name = "Active", Type = "Boolean" },
                new FieldDefinition { Name = "Score", Type = "Float" },
                new FieldDefinition { Name = "Birth", Type = "DateTime" },
                new FieldDefinition { Name = "Home", Type = "Address" }
            }
        };
        var product = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Product",
            CollectionName = "Products",
            SchemaType = SchemaType.Entity,
            Fields = new() { new FieldDefinition { Name = "Title", Type = "String" } }
        };
        await _repo.InsertManyAsync(new List<SchemaDefinition> { address, person, product });

        // RLS + CLS policies to exercise the policy-processing branches during schema load.
        var rls = new DataAccessPolicy
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaId = person.ItemId,
            SchemaName = "Person",
            PolicyType = PolicyType.RLS,
            Operation = PolicyOperation.READ,
            RuleGroup = new PolicyRuleGroup
            {
                Rules = new() { new PolicyRule { LeftSource = ConditionSource.AUTH, LeftOperand = "UserId", Operator = PolicyOperator.EQUAL, RightSource = ConditionSource.SCHEMA_FIELD, RightOperand = "Name" } }
            }
        };
        var cls = new DataAccessPolicy
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaId = person.ItemId,
            SchemaName = "Person",
            PolicyType = PolicyType.CLS,
            Operation = PolicyOperation.READ,
            FieldNames = new[] { "Age" },
            RuleGroup = new PolicyRuleGroup()
        };
        await _repo.InsertManyAsync(new List<DataAccessPolicy> { rls, cls });
    }

    private GraphqlSchemaBuilder BuildBuilder()
    {
        var query = new Mock<IQueryService>();
        var mutation = new Mock<IMutationService>();
        var resolver = new SchemaResolver(mutation.Object, query.Object);
        return new GraphqlSchemaBuilder(resolver, _repo, NullLogger<GraphqlSchemaBuilder>.Instance);
    }

    [Fact]
    public async Task BuildSchema_WithDefinitions_ProducesQueryAndMutationTypes()
    {
        await SeedAsync();
        var builder = BuildBuilder();
        var schemaBuilder = SchemaBuilder.New();

        await builder.BuildSchema("", schemaBuilder, CancellationToken.None);
        var schema = schemaBuilder.Create();

        schema.QueryType.Fields.Should().Contain(f => f.Name == "getPersons");
        schema.QueryType.Fields.Should().Contain(f => f.Name == "getProducts");
        schema.MutationType!.Fields.Should().Contain(f => f.Name == "insertPerson");
        schema.MutationType.Fields.Should().Contain(f => f.Name == "updatePerson");
        schema.MutationType.Fields.Should().Contain(f => f.Name == "deletePerson");

        // Custom Dto object type and its input variant were registered.
        schema.Types.Should().Contain(t => t.Name == "Address");
        schema.Types.Should().Contain(t => t.Name == "AddressInput");
    }

    [Fact]
    public async Task BuildSchema_NoDefinitions_DoesNotThrow()
    {
        var builder = BuildBuilder();
        var schemaBuilder = SchemaBuilder.New();

        await builder.BuildSchema("", schemaBuilder, CancellationToken.None);

        // With no query type registered, Create() throws; assert the builder path completed without exception.
        var act = () => schemaBuilder.Create();
        act.Should().Throw<Exception>();
    }
}
