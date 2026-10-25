using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution;
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
                new FieldDefinition { Name = "Home", Type = "Address" },
                new FieldDefinition
                {
                    Name = "Home.City", Type = "String", IsReferenceField = true,
                    ReferenceFieldType = "Address"
                }
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
        var personFilter = schema.GetType<HotChocolate.Types.InputObjectType>("PersonFilterInput");
        personFilter.Fields.Should().Contain(f => f.Name == "Home");
        var addressFilter = schema.GetType<HotChocolate.Types.InputObjectType>("AddressFilterInput");
        addressFilter.Fields.Should().Contain(f => f.Name == "City");
        addressFilter.Fields.Should().NotContain(f => f.Name == "and" || f.Name == "or");
    }

    // A tenant with no schemas used to get no Query type, so HotChocolate refused the schema and
    // every /gateway request (the playground's introspection included) failed with a 500.
    [Fact]
    public async Task BuildSchema_NoDefinitions_BuildsTheEmptySchema()
    {
        var builder = BuildBuilder();
        var schemaBuilder = SchemaBuilder.New();

        var hasDefinitions = await builder.BuildSchema("", schemaBuilder, CancellationToken.None);
        var schema = schemaBuilder.Create();

        hasDefinitions.Should().BeFalse();
        schema.QueryType.Fields.Where(f => !f.IsIntrospectionField).Select(f => f.Name)
            .Should().Equal(GraphqlSchemaBuilder.EmptyQueryFieldName);
        schema.MutationType.Should().BeNull();
    }

    [Fact]
    public async Task BuildSchema_NoDefinitions_AnswersIntrospectionAndTheEmptyField()
    {
        var schemaBuilder = SchemaBuilder.New();
        await BuildBuilder().BuildSchema("", schemaBuilder, CancellationToken.None);
        var executor = schemaBuilder.Create().MakeExecutable();

        var result = (IOperationResult)await executor.ExecuteAsync("{ __schema { queryType { name } mutationType { name } } _empty }");

        result.Errors.Should().BeNullOrEmpty();
        result.ToJson().Should().Contain("\"queryType\": {").And.Contain("\"mutationType\": null").And.Contain("\"_empty\": null");
    }

    // Only entities add Query and Mutation fields, so reusable objects alone hit the same failure.
    [Fact]
    public void BuildSchema_OnlyDtos_BuildsTheDtoTypesWithoutAMutationType()
    {
        var source = new SchemaSource
        {
            SchemaDefinitions =
            [
                new SchemaDefinition
                {
                    ItemId = Guid.NewGuid().ToString(),
                    SchemaName = "Address",
                    CollectionName = "Addresses",
                    SchemaType = SchemaType.Dto,
                    Fields = new() { new FieldDefinition { Name = "City", Type = "String" } }
                }
            ]
        };
        var schemaBuilder = SchemaBuilder.New();

        var hasDefinitions = BuildBuilder().BuildSchema("t", source, schemaBuilder, strictReferences: true);
        var schema = schemaBuilder.Create();

        hasDefinitions.Should().BeTrue();
        schema.Types.Should().Contain(t => t.Name == "Address");
        schema.Types.Should().Contain(t => t.Name == "AddressInput");
        schema.QueryType.Fields.Where(f => !f.IsIntrospectionField).Select(f => f.Name)
            .Should().Equal(GraphqlSchemaBuilder.EmptyQueryFieldName);
        schema.MutationType.Should().BeNull();
    }

    [Fact]
    public async Task BuildSchema_WithAnEntity_HasNoEmptyField()
    {
        await SeedAsync();
        var schemaBuilder = SchemaBuilder.New();

        await BuildBuilder().BuildSchema("", schemaBuilder, CancellationToken.None);
        var schema = schemaBuilder.Create();

        schema.QueryType.Fields.Should().NotContain(f => f.Name == GraphqlSchemaBuilder.EmptyQueryFieldName);
    }
}
