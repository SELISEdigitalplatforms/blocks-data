using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Resolvers;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Language;
using HotChocolate.Types;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway;

/// <summary>
/// Covers the IType-dependent parts of <see cref="GraphQlTypeHelper"/> (scalar parsing, nested and
/// list mapping) using genuine HotChocolate types obtained from a built schema with scalar, array
/// and nested-object fields. Building the schema also exercises the descriptor helpers.
/// </summary>
[Collection("Mongo")]
public class GraphQlTypeHelperMappingTests
{
    private static readonly object BuildLock = new();
    private static InputObjectType? _cachedRich;
    private readonly InputObjectType _rich;

    public GraphQlTypeHelperMappingTests(MongoFixture fixture)
    {
        // Build the schema exactly once for the whole test class. Rebuilding a HotChocolate
        // schema in every test constructor triggers repeated global type/serializer registration
        // that can deadlock against other collections running in parallel.
        lock (BuildLock)
        {
            if (_cachedRich is null)
            {
                BlocksTestContext.Set();
                var db = fixture.CreateDatabase();
                var provider = new Mock<IDbContextProvider>();
                provider.Setup(p => p.GetDatabase()).Returns(db);
                provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
                provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
                var repo = new DbRepository(provider.Object, new Mock<IBlocksSecret>().Object);
                SeedAsync(repo).GetAwaiter().GetResult();

                var resolver = new SchemaResolver(new Mock<IMutationService>().Object, new Mock<IQueryService>().Object);
                var builder = new GraphqlSchemaBuilder(resolver, repo, NullLogger<GraphqlSchemaBuilder>.Instance);
                var schemaBuilder = SchemaBuilder.New();
                builder.BuildSchema("", schemaBuilder, CancellationToken.None).GetAwaiter().GetResult();
                _cachedRich = schemaBuilder.Create().GetType<InputObjectType>("RichInsertInput");
            }
            _rich = _cachedRich;
        }
    }

    private static async Task SeedAsync(DbRepository repo)
    {
        var address = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(), SchemaName = "Address", CollectionName = "Addresses",
            SchemaType = SchemaType.Dto, Fields = new() { new FieldDefinition { Name = "City", Type = "String" } }
        };
        var course = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(), SchemaName = "Course", CollectionName = "Courses",
            SchemaType = SchemaType.Dto, Fields = new() { new FieldDefinition { Name = "Title", Type = "String" } }
        };
        var rich = new SchemaDefinition
        {
            ItemId = Guid.NewGuid().ToString(), SchemaName = "Rich", CollectionName = "Riches",
            SchemaType = SchemaType.Entity,
            Fields = new()
            {
                new FieldDefinition { Name = "ItemId", Type = "String" },
                new FieldDefinition { Name = "Code", Type = "ID" },
                new FieldDefinition { Name = "Name", Type = "String" },
                new FieldDefinition { Name = "Age", Type = "Int" },
                new FieldDefinition { Name = "Score", Type = "Float" },
                new FieldDefinition { Name = "Active", Type = "Boolean" },
                new FieldDefinition { Name = "Birth", Type = "DateTime" },
                new FieldDefinition { Name = "Nicknames", Type = "String", IsArray = true },
                new FieldDefinition { Name = "Home", Type = "Address" },
                new FieldDefinition { Name = "Courses", Type = "Course", IsArray = true }
            }
        };
        await repo.InsertManyAsync(new List<SchemaDefinition> { address, course, rich });
    }

    private IType ScalarType(string field) => _rich.Fields[field].Type;

    private static ObjectValueNode ObjectLiteral(string body)
    {
        var doc = Utf8GraphQLParser.Parse($"{{ x(input: {body}) {{ y }} }}");
        var op = (OperationDefinitionNode)doc.Definitions[0];
        var field = (FieldNode)op.SelectionSet.Selections[0];
        return (ObjectValueNode)field.Arguments[0].Value;
    }

    [Fact]
    public void MapMutationInput_Scalars_Nested_And_Lists()
    {
        var literal = ObjectLiteral(
            "{ ItemId: \"abc\", Code: \"xyz\", Name: \"John\", Age: 30, Score: 4.5, Active: true, " +
            "Birth: \"2020-01-15T10:30:00Z\", Nicknames: [\"a\", \"b\"], " +
            "Home: { City: \"NYC\" }, Courses: [ { Title: \"Math\" }, { Title: \"Sci\" } ] }");

        var result = new Dictionary<string, object?>().MapMutationInput(literal, _rich);

        result["_id"].Should().Be("abc"); // ItemId renamed
        result["Code"].Should().Be("xyz");
        result["Name"].Should().Be("John");
        result["Age"].Should().Be(30);
        result["Score"].Should().Be(4.5);
        result["Active"].Should().Be(true);
        result["Birth"].Should().BeOfType<DateTime>();
        result["Nicknames"].Should().BeAssignableTo<System.Collections.IEnumerable>();
        ((System.Collections.IEnumerable)result["Nicknames"]!).Cast<object?>().Should().BeEquivalentTo(new object?[] { "a", "b" });
        ((Dictionary<string, object?>)result["Home"]!)["City"].Should().Be("NYC");
        var courses = ((System.Collections.IEnumerable)result["Courses"]!).Cast<object?>().ToList();
        courses.Should().HaveCount(2);
        ((Dictionary<string, object?>)courses[0]!)["Title"].Should().Be("Math");
    }

    [Fact]
    public void MapMutationInput_NullInputs_ReturnUnchanged()
    {
        new Dictionary<string, object?>().MapMutationInput(null, _rich).Should().BeEmpty();
        new Dictionary<string, object?>().MapMutationInput(ObjectLiteral("{ Name: \"x\" }"), null).Should().BeEmpty();
    }

    [Fact]
    public void MapBulkMutationInput_NullOrEmpty_ReturnsEmpty()
    {
        GraphQlTypeHelper.MapBulkMutationInput(null, _rich).Should().BeEmpty();
    }

    [Theory]
    [InlineData("Age", "42", 42)]
    public void ParseScalarValueByType_StringToInt(string field, string raw, int expected) =>
        new StringValueNode(raw).ParseScalarValueByType(ScalarType(field)).Should().Be(expected);

    [Fact]
    public void ParseScalarValueByType_Null_ReturnsNull() =>
        NullValueNode.Default.ParseScalarValueByType(ScalarType("Age")).Should().BeNull();

    [Fact]
    public void ParseScalarValueByType_IntToFloat() =>
        new IntValueNode(5).ParseScalarValueByType(ScalarType("Score")).Should().Be(5.0);

    [Fact]
    public void ParseScalarValueByType_StringToFloat() =>
        new StringValueNode("3.5").ParseScalarValueByType(ScalarType("Score")).Should().Be(3.5);

    [Fact]
    public void ParseScalarValueByType_StringToBool() =>
        new StringValueNode("true").ParseScalarValueByType(ScalarType("Active")).Should().Be(true);

    [Fact]
    public void ParseScalarValueByType_IntToBool_NonZeroTrue()
    {
        new IntValueNode(1).ParseScalarValueByType(ScalarType("Active")).Should().Be(true);
        new IntValueNode(0).ParseScalarValueByType(ScalarType("Active")).Should().Be(false);
    }

    [Fact]
    public void ParseScalarValueByType_ToString_FromIntFloatBool()
    {
        new IntValueNode(7).ParseScalarValueByType(ScalarType("Name")).Should().Be("7");
        new FloatValueNode(1.2).ParseScalarValueByType(ScalarType("Name")).Should().Be("1.2");
        new BooleanValueNode(true).ParseScalarValueByType(ScalarType("Name")).Should().Be("True");
    }

    [Fact]
    public void ParseScalarValueByType_DateTime_OffsetAndPlain()
    {
        new StringValueNode("2020-01-15T10:30:00Z").ParseScalarValueByType(ScalarType("Birth")).Should().BeOfType<DateTime>();
        new StringValueNode("2020-01-15").ParseScalarValueByType(ScalarType("Birth")).Should().BeOfType<DateTime>();
    }

    [Fact]
    public void ParseScalarValueByType_IdField_UsesGenericParsing()
    {
        var idType = ScalarType("Code");
        new IntValueNode(9).ParseScalarValueByType(idType).Should().Be(9);
        // date string via generic path is converted to DateTime
        new StringValueNode("2020-01-15T10:30:00Z").ParseScalarValueByType(idType).Should().BeOfType<DateTime>();
    }

    [Fact]
    public void ParseScalarValueByType_InvalidCasts_Throw()
    {
        var act1 = () => new BooleanValueNode(true).ParseScalarValueByType(ScalarType("Age"));
        act1.Should().Throw<InvalidCastException>();

        var act2 = () => new BooleanValueNode(true).ParseScalarValueByType(ScalarType("Score"));
        act2.Should().Throw<InvalidCastException>();

        var act3 = () => new StringValueNode("notbool").ParseScalarValueByType(ScalarType("Active"));
        act3.Should().Throw<InvalidCastException>();

        var act4 = () => new StringValueNode("notdate").ParseScalarValueByType(ScalarType("Birth"));
        act4.Should().Throw<InvalidCastException>();

        var act5 = () => new StringValueNode("abc").ParseScalarValueByType(ScalarType("Age"));
        act5.Should().Throw<InvalidCastException>();
    }

    [Fact]
    public void ParseValueNode_UnsupportedNode_Throws()
    {
        var act = () => new EnumValueNode("X").ParseValueNode();
        act.Should().Throw<NotSupportedException>();
    }

    [Fact]
    public void GetTypeNode_Id_ReturnsNamedNode()
    {
        GraphQlTypeHelper.GetTypeNode("ID").Should().BeOfType<NamedTypeNode>()
            .Which.Name.Value.Should().Be("ID");
    }
}
