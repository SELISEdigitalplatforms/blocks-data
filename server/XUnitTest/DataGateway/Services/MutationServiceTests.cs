using System.Collections.Immutable;
using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
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
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Services;

/// <summary>
/// Exercises <see cref="MutationService"/> end to end. A real HotChocolate schema is built
/// from seeded schema definitions to obtain genuine InputObjectTypes; the repository and
/// event publisher are mocked so no live broker is required.
/// </summary>
[Collection("Mongo")]
public class MutationServiceTests
{
    private readonly InputObjectType _insertInput;
    private readonly InputObjectType _deleteInput;

    public MutationServiceTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        SetBlocksCloud(false);
        var db = fixture.CreateDatabase();
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase()).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
        var repo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
        SeedAsync(repo).GetAwaiter().GetResult();

        var hcSchema = BuildHcSchema(repo);
        _insertInput = hcSchema.GetType<InputObjectType>("PersonInsertInput");
        _deleteInput = hcSchema.GetType<InputObjectType>("PersonDeleteInput");
    }

    private static async Task SeedAsync(DbRepository repo)
    {
        var person = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(),
            SchemaName = "Person",
            CollectionName = "Persons",
            SchemaType = SchemaType.Entity,
            Fields = new()
            {
                new FieldDefinition { Name = "Name", Type = "String" },
                new FieldDefinition { Name = "Age", Type = "Int" },
                new FieldDefinition { Name = "Email", Type = "String" }
            }
        };
        await repo.InsertManyAsync(new List<SchemaDefinition> { person });
    }

    private static ISchema BuildHcSchema(DbRepository repo)
    {
        var resolver = new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object);
        var builder = new GraphqlSchemaBuilder(resolver, repo, NullLogger<GraphqlSchemaBuilder>.Instance);
        var schemaBuilder = SchemaBuilder.New();
        builder.BuildSchema("", schemaBuilder, CancellationToken.None).GetAwaiter().GetResult();
        return schemaBuilder.Create();
    }

    private static MutationService NewService(Mock<IGqlDbRepository> repo, Mock<IDataChangeEventPublisher> pub) =>
        new(repo.Object, pub.Object, NullLogger<MutationService>.Instance);

    private static ObjectValueNode ObjectLiteral(string body)
    {
        var doc = Utf8GraphQLParser.Parse($"{{ x(input: {body}) {{ y }} }}");
        var op = (OperationDefinitionNode)doc.Definitions[0];
        var field = (FieldNode)op.SelectionSet.Selections[0];
        return (ObjectValueNode)field.Arguments[0].Value;
    }

    private static ListValueNode ListLiteral(string body)
    {
        var doc = Utf8GraphQLParser.Parse($"{{ x(input: {body}) {{ y }} }}");
        var op = (OperationDefinitionNode)doc.Definitions[0];
        var field = (FieldNode)op.SelectionSet.Selections[0];
        return (ListValueNode)field.Arguments[0].Value;
    }

    private static Mock<IResolverContext> ContextWith(IValueNode inputLiteral)
    {
        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns("mutationField");
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.Field).Returns(field.Object);

        var ctx = new Mock<IResolverContext>();
        ctx.Setup(c => c.Selection).Returns(selection.Object);
        ctx.Setup(c => c.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName)).Returns(inputLiteral);
        ctx.Setup(c => c.ArgumentValue<object?>(GraphQlConstant.WhereFieldName)).Returns((object?)null);
        ctx.Setup(c => c.ArgumentValue<string?>(GraphQlConstant.FilterFieldName)).Returns((string?)null);
        ctx.Setup(c => c.ScopedContextData).Returns(ImmutableDictionary<string, object?>.Empty);
        return ctx;
    }

    private static Mock<IGqlDbRepository> Repo() => new();

    private static BsonDocument PersonDoc(string id, string name, int age) =>
        new() { { GraphQlConstant.DbEntityIdFieldName, id }, { "Name", name }, { "Age", age } };

    [Fact]
    public async Task InsertAsync_Valid_InsertsAndPublishes()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.InsertAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync((string _, BsonDocument d) => d);
        var schema = Schema(fields: new() { Field("Name"), Field("Age", "Int") });
        var ctx = ContextWith(ObjectLiteral("{ Name: \"John\", Age: 30 }"));

        var result = await NewService(repo, pub).InsertAsync(schema, ctx.Object, _insertInput);

        result.Acknowledged.Should().BeTrue();
        result.ItemId.Should().NotBeNullOrEmpty();
        repo.Verify(r => r.InsertAsync("Persons", It.IsAny<BsonDocument>()), Times.Once);
        pub.Verify(p => p.PublishAsync(schema, DataChangeOperation.Inserted,
            It.IsAny<List<BsonDocument>>(), null), Times.Once);
    }

    [Fact]
    public async Task InsertAsync_UniqueConflict_Throws()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        // A record already holds the email being inserted.
        repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument> { new() { { "Email", "a@b.com" } } });
        var schema = Schema(fields: new() { Field("Name"), Field("Email", isUnique: true) });
        var ctx = ContextWith(ObjectLiteral("{ Name: \"John\", Email: \"a@b.com\" }"));

        var act = () => NewService(repo, pub).InsertAsync(schema, ctx.Object, _insertInput);

        await act.Should().ThrowAsync<GraphQLException>();
        repo.Verify(r => r.InsertAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()), Times.Never);
    }

    [Fact]
    public async Task InsertAsync_AccessDenied_ThrowsUnauthorized()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        var schema = Schema(write: SchemaAccessLevel.Custom, fields: new() { Field("Name") });
        var ctx = ContextWith(ObjectLiteral("{ Name: \"John\" }"));

        var act = () => NewService(repo, pub).InsertAsync(schema, ctx.Object, _insertInput);

        var ex = await act.Should().ThrowAsync<GraphQLException>();
        ex.Which.Errors[0].Code.Should().Be(GraphQlConstant.UnauthorizedErrorCode);
    }

    [Fact]
    public async Task UpdateAsync_Found_UpdatesAndPublishes()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.GetItemAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()))
            .ReturnsAsync(PersonDoc("id-1", "Old", 20));
        repo.Setup(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true });
        var schema = Schema(fields: new() { Field("Name"), Field("Age", "Int") });
        var ctx = ContextWith(ObjectLiteral("{ Name: \"New\", Age: 25 }"));

        var result = await NewService(repo, pub).UpdateAsync(schema, ctx.Object, _insertInput);

        result.Acknowledged.Should().BeTrue();
        result.ItemId.Should().Be("id-1");
        pub.Verify(p => p.PublishAsync(schema, DataChangeOperation.Updated, null,
            It.IsAny<List<UpdatedDocument>>()), Times.Once);
    }

    [Fact]
    public async Task UpdateAsync_NotFound_ReturnsNotFound()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.GetItemAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()))
            .ReturnsAsync((BsonDocument?)null);
        var schema = Schema(fields: new() { Field("Name") });
        var ctx = ContextWith(ObjectLiteral("{ Name: \"New\" }"));

        var result = await NewService(repo, pub).UpdateAsync(schema, ctx.Object, _insertInput);

        result.Acknowledged.Should().BeFalse();
        repo.Verify(r => r.UpdateAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()), Times.Never);
    }

    [Fact]
    public async Task DeleteAsync_Found_SoftDeletesArchivesAndPublishes()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument> { PersonDoc("id-9", "Del", 40) });
        repo.Setup(r => r.InsertAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync((string _, BsonDocument d) => d);
        repo.Setup(r => r.DeleteAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true });
        var schema = Schema(fields: new() { Field("Name") });
        var ctx = ContextWith(ObjectLiteral("{ isHardDelete: false }"));

        var result = await NewService(repo, pub).DeleteAsync(schema, ctx.Object, _deleteInput);

        result.Acknowledged.Should().BeTrue();
        result.ItemId.Should().Be("id-9");
        // soft delete archives to DataMutationRecords
        repo.Verify(r => r.InsertAsync($"{nameof(DataMutationRecord)}s", It.IsAny<BsonDocument>()), Times.Once);
        pub.Verify(p => p.PublishAsync(schema, DataChangeOperation.Deleted,
            It.IsAny<List<BsonDocument>>(), null), Times.Once);
    }

    [Fact]
    public async Task DeleteAsync_HardDelete_SkipsArchive()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument> { PersonDoc("id-9", "Del", 40) });
        repo.Setup(r => r.DeleteAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true });
        var schema = Schema(fields: new() { Field("Name") });
        var ctx = ContextWith(ObjectLiteral("{ isHardDelete: true }"));

        var result = await NewService(repo, pub).DeleteAsync(schema, ctx.Object, _deleteInput);

        result.Acknowledged.Should().BeTrue();
        repo.Verify(r => r.InsertAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()), Times.Never);
    }

    [Fact]
    public async Task DeleteAsync_NotFound_ReturnsNotFound()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument>());
        var schema = Schema(fields: new() { Field("Name") });
        var ctx = ContextWith(ObjectLiteral("{ isHardDelete: false }"));

        var result = await NewService(repo, pub).DeleteAsync(schema, ctx.Object, _deleteInput);

        result.Acknowledged.Should().BeFalse();
    }

    [Fact]
    public async Task BulkInsertAsync_Valid_InsertsMany()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.InsertManyAsync(It.IsAny<string>(), It.IsAny<List<BsonDocument>>()))
            .ReturnsAsync(new BulkActionResponse { Acknowledged = true, TotalImpactedData = 2 });
        var schema = Schema(fields: new() { Field("Name"), Field("Age", "Int") });
        var ctx = ContextWith(ListLiteral("[ { Name: \"A\", Age: 1 }, { Name: \"B\", Age: 2 } ]"));

        var result = await NewService(repo, pub).BulkInsertAsync(schema, ctx.Object, _insertInput);

        result.Acknowledged.Should().BeTrue();
        result.TotalImpactedData.Should().Be(2);
        pub.Verify(p => p.PublishAsync(schema, DataChangeOperation.Inserted,
            It.IsAny<List<BsonDocument>>(), null), Times.Once);
    }

    [Fact]
    public async Task BulkInsertAsync_EmptyList_ReturnsZeroImpact()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        var schema = Schema(fields: new() { Field("Name") });
        var ctx = ContextWith(ListLiteral("[ ]"));

        var result = await NewService(repo, pub).BulkInsertAsync(schema, ctx.Object, _insertInput);

        result.Acknowledged.Should().BeTrue();
        result.TotalImpactedData.Should().Be(0);
        repo.Verify(r => r.InsertManyAsync(It.IsAny<string>(), It.IsAny<List<BsonDocument>>()), Times.Never);
    }

    [Fact]
    public async Task BulkUpdateAsync_Found_UpdatesMany()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument> { PersonDoc("id-1", "A", 1), PersonDoc("id-2", "B", 2) });
        repo.Setup(r => r.UpdateManyAsync(It.IsAny<string>(), It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true });
        var schema = Schema(fields: new() { Field("Name"), Field("Age", "Int") });
        var ctx = ContextWith(ObjectLiteral("{ Name: \"Z\" }"));

        var result = await NewService(repo, pub).BulkUpdateAsync(schema, ctx.Object, _insertInput);

        result.Acknowledged.Should().BeTrue();
        pub.Verify(p => p.PublishAsync(schema, DataChangeOperation.Updated, null,
            It.IsAny<List<UpdatedDocument>>()), Times.Once);
    }

    [Fact]
    public async Task BulkUpdateAsync_NotFound_ReturnsNotFound()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument>());
        var schema = Schema(fields: new() { Field("Name") });
        var ctx = ContextWith(ObjectLiteral("{ Name: \"Z\" }"));

        var result = await NewService(repo, pub).BulkUpdateAsync(schema, ctx.Object, _insertInput);

        result.Acknowledged.Should().BeFalse();
    }

    [Fact]
    public async Task BulkDeleteAsync_Found_SoftDeletesMany()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument> { PersonDoc("id-1", "A", 1), PersonDoc("id-2", "B", 2) });
        repo.Setup(r => r.InsertManyAsync(It.IsAny<string>(), It.IsAny<List<BsonDocument>>()))
            .ReturnsAsync(new BulkActionResponse { Acknowledged = true, TotalImpactedData = 2 });
        repo.Setup(r => r.DeleteManyAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true });
        var schema = Schema(fields: new() { Field("Name") });
        var ctx = ContextWith(ObjectLiteral("{ isHardDelete: false }"));

        var result = await NewService(repo, pub).BulkDeleteAsync(schema, ctx.Object, _deleteInput);

        result.Acknowledged.Should().BeTrue();
        repo.Verify(r => r.InsertManyAsync($"{nameof(DataMutationRecord)}s", It.IsAny<List<BsonDocument>>()), Times.Once);
        pub.Verify(p => p.PublishAsync(schema, DataChangeOperation.Deleted,
            It.IsAny<List<BsonDocument>>(), null), Times.Once);
    }

    [Fact]
    public async Task BulkDeleteAsync_NotFound_ReturnsNotFound()
    {
        var repo = Repo();
        var pub = new Mock<IDataChangeEventPublisher>();
        repo.Setup(r => r.GetItemsAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new List<BsonDocument>());
        var schema = Schema(fields: new() { Field("Name") });
        var ctx = ContextWith(ObjectLiteral("{ isHardDelete: false }"));

        var result = await NewService(repo, pub).BulkDeleteAsync(schema, ctx.Object, _deleteInput);

        result.Acknowledged.Should().BeFalse();
    }
}
