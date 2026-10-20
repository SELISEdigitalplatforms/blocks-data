using System.Collections.Immutable;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
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
using Moq;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

/// <summary>
/// A client may choose the id of a new row (ItemId is part of every insert input). GraphQL input reaches
/// the stamping step with it already renamed to _id, which used to be added a second time and fail the insert.
/// </summary>
[Collection("Mongo")]
public class InsertSuppliedItemIdTests
{
    private readonly InputObjectType _insertInput;

    public InsertSuppliedItemIdTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        SetBlocksCloud(false);
        var db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
        var repo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
        repo.InsertManyAsync(new List<SchemaDefinition>
        {
            new()
            {
                ItemId = Guid.NewGuid().ToString(), SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity,
                Fields = [new FieldDefinition { Name = "ItemId", Type = "String" }, new FieldDefinition { Name = "Name", Type = "String" }],
            },
        }).GetAwaiter().GetResult();

        var builder = new GraphqlSchemaBuilder(
            new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object), repo, NullLogger<GraphqlSchemaBuilder>.Instance);
        var schemaBuilder = SchemaBuilder.New();
        builder.BuildSchema("", schemaBuilder, CancellationToken.None).GetAwaiter().GetResult();
        _insertInput = schemaBuilder.Create().GetType<InputObjectType>("PersonInsertInput");
    }

    // ---- InjectDefaultValueOnInsert ------------------------------------------------------------

    [Fact]
    public void SuppliedId_AlreadyRenamedTo_id_IsKept()
    {
        var input = new Dictionary<string, object?> { ["_id"] = "p-1", ["Name"] = "Ann" };

        input.InjectDefaultValueOnInsert();

        input["_id"].Should().Be("p-1");
        input.Should().NotContainKey("ItemId");
        input.Should().ContainKeys("CreatedDate", "LastUpdatedDate");
    }

    [Fact]
    public void SuppliedId_AsItemId_IsMovedTo_id()
    {
        var input = new Dictionary<string, object?> { ["ItemId"] = "p-2" };

        input.InjectDefaultValueOnInsert();

        input["_id"].Should().Be("p-2");
        input.Should().NotContainKey("ItemId");
    }

    [Theory]
    [InlineData("_id", "")]
    [InlineData("_id", "  ")]
    [InlineData("ItemId", "")]
    [InlineData("ItemId", null)]
    public void BlankSuppliedId_GetsANewId(string key, string? value)
    {
        var input = new Dictionary<string, object?> { [key] = value };

        input.InjectDefaultValueOnInsert();

        Guid.TryParse(input["_id"]!.ToString(), out _).Should().BeTrue();
        input.Should().NotContainKey("ItemId");
    }

    [Fact]
    public void NoSuppliedId_GetsANewId()
    {
        var input = new Dictionary<string, object?> { ["Name"] = "Ann" };

        input.InjectDefaultValueOnInsert();

        Guid.TryParse(input["_id"]!.ToString(), out _).Should().BeTrue();
    }

    // ---- Through MutationService, from GraphQL input -------------------------------------------

    private static IResolverContext Ctx(string inputLiteral)
    {
        var doc = Utf8GraphQLParser.Parse($"{{ x(input: {inputLiteral}) {{ y }} }}");
        var literal = ((FieldNode)((OperationDefinitionNode)doc.Definitions[0]).SelectionSet.Selections[0]).Arguments[0].Value;
        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns("insertPerson");
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.Field).Returns(field.Object);
        var ctx = new Mock<IResolverContext>();
        ctx.Setup(c => c.Selection).Returns(selection.Object);
        ctx.Setup(c => c.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName)).Returns(literal);
        ctx.Setup(c => c.ScopedContextData).Returns(ImmutableDictionary<string, object?>.Empty);
        return ctx.Object;
    }

    private static (MutationService Service, List<BsonDocument> Written) Service()
    {
        var written = new List<BsonDocument>();
        var repo = new Mock<IGqlDbRepository>();
        repo.Setup(r => r.InsertAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
            .Callback((string _, BsonDocument d) => written.Add(d))
            .ReturnsAsync((string _, BsonDocument d) => d);
        repo.Setup(r => r.InsertManyAsync(It.IsAny<string>(), It.IsAny<List<BsonDocument>>()))
            .Callback((string _, List<BsonDocument> d) => written.AddRange(d))
            .ReturnsAsync(new BulkActionResponse { Acknowledged = true, TotalImpactedData = 2 });
        var service = new MutationService(repo.Object, Mock.Of<IDataChangeEventPublisher>(),
            Resolver(), Principals(), NullLogger<MutationService>.Instance);
        return (service, written);
    }

    private static SchemaDefinitionExtended Person() => Schema(fields: [Field("ItemId"), Field("Name")]);

    [Fact]
    public async Task Insert_WithSuppliedItemId_StoresItAsTheRowId()
    {
        var (service, written) = Service();

        var result = await service.InsertAsync(Person(), Ctx("{ ItemId: \"p-1\", Name: \"Ann\" }"), _insertInput);

        result.ItemId.Should().Be("p-1");
        written.Single()["_id"].AsString.Should().Be("p-1");
        written.Single().Contains("ItemId").Should().BeFalse();
    }

    [Fact]
    public async Task BulkInsert_EachRowKeepsItsSuppliedItemId_AndRowsWithoutOneGetANewId()
    {
        var (service, written) = Service();

        await service.BulkInsertAsync(Person(), Ctx("[{ ItemId: \"m1\", Name: \"Boss\" }, { Name: \"Hal\" }]"), _insertInput);

        written.Should().HaveCount(2);
        written[0]["_id"].AsString.Should().Be("m1");
        Guid.TryParse(written[1]["_id"].AsString, out _).Should().BeTrue();
    }
}
