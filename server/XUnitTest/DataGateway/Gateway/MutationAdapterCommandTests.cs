using System.Collections.Immutable;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.GraphTypes;
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
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>
/// The GraphQL mutation adapter (<see cref="MutationService"/>) turns a resolver context into the engine's
/// commands. The input stays unparsed until the engine reads it; everything else is read from the context.
/// </summary>
[Collection("ContextSerial")]
public class MutationAdapterCommandTests : IDisposable
{
    // Built once: rebuilding a HotChocolate schema per test registers global types again (see GraphQlTypeHelperMappingTests).
    private static readonly Lazy<ISchema> HcSchema = new(BuildHcSchema);

    private static InputObjectType InsertInput => HcSchema.Value.GetType<InputObjectType>("PersonInsertInput");
    private static InputObjectType DeleteInput => HcSchema.Value.GetType<InputObjectType>("PersonDeleteInput");

    public void Dispose()
    {
        ClearContext();
        GC.SuppressFinalize(this);
    }

    private static ISchema BuildHcSchema()
    {
        var source = new SchemaSource
        {
            SchemaDefinitions =
            [
                new SchemaDefinition
                {
                    ItemId = "person", SchemaName = "Person", CollectionName = "Persons", SchemaType = SchemaType.Entity,
                    Fields =
                    [
                        new FieldDefinition { Name = "Name", Type = "String" },
                        new FieldDefinition { Name = "Location", Type = "GeoJson" },
                    ],
                },
            ],
        };
        var builder = new GraphqlSchemaBuilder(
            new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object),
            new Mock<IDbRepository>().Object,
            NullLogger<GraphqlSchemaBuilder>.Instance);
        var schemaBuilder = SchemaBuilder.New();
        builder.BuildSchema("", source, schemaBuilder).Should().BeTrue();
        return schemaBuilder.Create();
    }

    private static IValueNode Literal(string body)
    {
        var doc = Utf8GraphQLParser.Parse($"{{ x(input: {body}) {{ y }} }}");
        return ((FieldNode)((OperationDefinitionNode)doc.Definitions[0]).SelectionSet.Selections[0]).Arguments[0].Value;
    }

    private static Mock<IResolverContext> Context(
        string fieldName,
        IValueNode? input,
        object? where = null,
        string? filter = null,
        IImmutableDictionary<string, object?>? scoped = null)
    {
        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns(fieldName);
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.Field).Returns(field.Object);
        var ctx = new Mock<IResolverContext>();
        ctx.Setup(c => c.Selection).Returns(selection.Object);
        ctx.Setup(c => c.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName)).Returns(input!);
        ctx.Setup(c => c.ArgumentValue<object?>(GraphQlConstant.WhereFieldName)).Returns(where);
        ctx.Setup(c => c.ArgumentValue<string?>(GraphQlConstant.FilterFieldName)).Returns(filter);
        ctx.Setup(c => c.ScopedContextData).Returns(scoped ?? ImmutableDictionary<string, object?>.Empty);
        return ctx;
    }

    [Fact]
    public void Insert_BuildsLazyRecordAndOperationName()
    {
        var ctx = Context("insertPerson", Literal("{ Name: \"Ann\" }"));

        var command = MutationService.BuildInsertCommand(ctx.Object, InsertInput);

        command.OperationName.Should().Be("insertPerson");
        command.Record.IsValueCreated.Should().BeFalse();
        ctx.Verify(c => c.ArgumentLiteral<IValueNode>(It.IsAny<string>()), Times.Never);
        command.Record.Value.Should().ContainKey("Name").WhoseValue.Should().Be("Ann");
    }

    [Fact]
    public void InsertMany_BuildsLazyRecords()
    {
        var ctx = Context("insertManyPerson", Literal("[{ Name: \"Ann\" }, { Name: \"Bob\" }]"));

        var command = MutationService.BuildInsertManyCommand(ctx.Object, InsertInput);

        command.OperationName.Should().Be("insertManyPerson");
        command.Records.IsValueCreated.Should().BeFalse();
        ctx.Verify(c => c.ArgumentLiteral<IValueNode>(It.IsAny<string>()), Times.Never);
        command.Records.Value.Select(r => r["Name"]).Should().Equal("Ann", "Bob");
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Delete_ReadsHardDelete(bool hardDelete)
    {
        var literal = Literal($"{{ isHardDelete: {(hardDelete ? "true" : "false")} }}");

        var delete = MutationService.BuildDeleteCommand(Context("deletePerson", literal).Object, DeleteInput);
        var deleteMany = MutationService.BuildDeleteManyCommand(Context("deleteManyPerson", literal).Object, DeleteInput);

        delete.HardDelete.Should().Be(hardDelete);
        delete.OperationName.Should().Be("deletePerson");
        deleteMany.HardDelete.Should().Be(hardDelete);
        deleteMany.OperationName.Should().Be("deleteManyPerson");
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(false, false)]
    [InlineData("yes", false)]
    [InlineData(null, false)]
    public void Update_ReadsCheckOwnerFromScopedContextData(object? flag, bool expected)
    {
        var scoped = flag is null
            ? ImmutableDictionary<string, object?>.Empty
            : ImmutableDictionary<string, object?>.Empty.Add(GraphQlConstant.CheckForOwnerContextKey, flag);
        var where = new Dictionary<string, object?> { ["Name"] = new Dictionary<string, object?> { ["eq"] = "Ann" } };
        var ctx = Context("updatePerson", Literal("{ Name: \"Bob\" }"), where, "{ \"Name\": \"Ann\" }", scoped);

        var update = MutationService.BuildUpdateCommand(ctx.Object, InsertInput);
        var updateMany = MutationService.BuildUpdateManyCommand(ctx.Object, InsertInput);
        var delete = MutationService.BuildDeleteCommand(ctx.Object, DeleteInput);

        update.CheckOwner.Should().Be(expected);
        updateMany.CheckOwner.Should().Be(expected);
        delete.CheckOwner.Should().Be(expected);
        update.OperationName.Should().Be("updatePerson");
        update.LegacyFilterJson.Should().Be("{ \"Name\": \"Ann\" }");
        update.Where!.Root.Should().ContainKey("Name");
        update.Changes.IsValueCreated.Should().BeFalse();
        update.Changes.Value.Should().ContainKey("Name").WhoseValue.Should().Be("Bob");
    }

    [Fact]
    public async Task Insert_InvalidGeoJson_ThrowsTheSameExceptionTypeAsToday()
    {
        SetContext();
        SetBlocksCloud(false);
        var location = Literal("{ type: \"Point\" }");
        // Today's parse of the same literal for the same field: GraphQlTypeHelper.ParseGeoJsonValue's InvalidCastException.
        var parse = () => location.ParseScalarValueByType(new GeoJsonType(), "Location");
        var expectedMessage = parse.Should().Throw<InvalidCastException>().Which.Message;
        expectedMessage.Should().StartWith("Invalid GeoJson value for field 'Location'");

        var repo = new Mock<IGqlDbRepository>();
        var service = new MutationService(
            repo.Object, Mock.Of<IDataChangeEventPublisher>(), Resolver(), Principals(), NullLogger<MutationService>.Instance);
        var schema = Schema(fields: new() { Field("Name"), Field("Location", "GeoJson") });
        var ctx = Context("insertPerson", Literal("{ Name: \"Ann\", Location: { type: \"Point\" } }"));

        var act = () => service.InsertAsync(schema, ctx.Object, InsertInput);

        var ex = (await act.Should().ThrowAsync<InvalidCastException>()).Which;
        ex.GetType().Should().Be<InvalidCastException>();
        ex.Message.Should().Be(expectedMessage);
        repo.Verify(r => r.InsertAsync(It.IsAny<string>(), It.IsAny<BsonDocument>()), Times.Never);
    }
}
