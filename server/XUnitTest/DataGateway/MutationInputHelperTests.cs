using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class MutationInputHelperTests
{
    private static SchemaDefinitionExtended NestedSchema() => Schema(fields: new()
    {
        Field("Name", "String"),
        Field("Contact", "Contact", children: new()
        {
            Field("Email", "String"),
            Field("Home", "Address", children: new() { Field("City", "String") })
        }),
        Field("Courses", "Course", isArray: true, children: new() { Field("Title", "String") })
    });

    [Fact]
    public void AddRequesterToAccessLists_AddsTheRequesterOnce_KeepingWhatWasSent()
    {
        XUnitTest.Infrastructure.BlocksTestContext.Set(userId: "user-1");
        try
        {
            var input = new Dictionary<string, object?>
            {
                ["Read"] = new Dictionary<string, object?> { ["UserIds"] = new List<object?> { "user-9" }, ["Roles"] = new List<object?> { "admin" } },
                ["Update"] = new Dictionary<string, object?> { ["UserIds"] = new List<object?> { "user-1" } },
            };

            MutationInputHelper.AddRequesterToAccessLists(input, SchemaWithAccessLists());

            var read = (Dictionary<string, object?>)input["Read"]!;
            read["UserIds"].Should().BeEquivalentTo(new object?[] { "user-9", "user-1" }, o => o.WithStrictOrdering());
            read["Roles"].Should().BeEquivalentTo(new object?[] { "admin" });
            ((Dictionary<string, object?>)input["Update"]!)["UserIds"].Should().BeEquivalentTo(new object?[] { "user-1" });
            ((Dictionary<string, object?>)input["Delete"]!)["UserIds"].Should().BeEquivalentTo(new object?[] { "user-1" });
            input.Should().NotContainKey("Create");
        }
        finally
        {
            XUnitTest.Infrastructure.BlocksTestContext.Clear();
        }
    }

    [Fact]
    public void AddRequesterToAccessLists_WithoutASignedInUser_AddsNothing()
    {
        XUnitTest.Infrastructure.BlocksTestContext.Clear();
        var input = new Dictionary<string, object?>();

        MutationInputHelper.AddRequesterToAccessLists(input, SchemaWithAccessLists());

        input.Should().BeEmpty();
    }

    /// <summary>A schema with the platform access lists, as schema saving adds them (type OperationAccess).</summary>
    private static SchemaDefinitionExtended SchemaWithAccessLists(params string[] names) => Schema(fields:
        (names.Length == 0 ? ["Create", "Read", "Update", "Delete"] : names)
            .Select(name => Field(name, "OperationAccess", children: new()
            {
                Field("Roles", "String", isArray: true),
                Field("UserIds", "String", isArray: true),
                Field("Permissions", "String", isArray: true),
            }))
            .Prepend(Field("Title", "String"))
            .ToList());

    [Fact]
    public void AddRequesterToAccessLists_SchemaWithoutTheProperties_AddsNothing()
    {
        XUnitTest.Infrastructure.BlocksTestContext.Set(userId: "user-1");
        try
        {
            var input = new Dictionary<string, object?> { ["Title"] = "Prepare contract" };

            MutationInputHelper.AddRequesterToAccessLists(input, Schema(fields: new() { Field("Title", "String") }));

            input.Keys.Should().Equal("Title");
        }
        finally
        {
            XUnitTest.Infrastructure.BlocksTestContext.Clear();
        }
    }

    [Fact]
    public void AddRequesterToAccessLists_APropertyOfThatNameWithAnotherType_IsARegularProperty()
    {
        XUnitTest.Infrastructure.BlocksTestContext.Set(userId: "user-1");
        try
        {
            var schema = Schema(fields: new()
            {
                Field("Title", "String"),
                Field("Update", "String"),
                Field("Delete", "Boolean"),
            });
            var input = new Dictionary<string, object?>
            {
                ["Title"] = "Prepare contract",
                ["Update"] = "Waiting for client documents",
                ["Delete"] = false,
            };

            MutationInputHelper.AddRequesterToAccessLists(input, schema);

            input["Update"].Should().Be("Waiting for client documents");
            input["Delete"].Should().Be(false);
            input.Should().NotContainKey("Read");
        }
        finally
        {
            XUnitTest.Infrastructure.BlocksTestContext.Clear();
        }
    }

    [Fact]
    public void AddRequesterToAccessLists_ALowercasePropertyOfAnotherType_GetsNoAccessListBesideIt()
    {
        // Almora's Notification has its own "read" (Boolean) and no platform Read list.
        XUnitTest.Infrastructure.BlocksTestContext.Set(userId: "user-1");
        try
        {
            var schema = Schema(fields: new() { Field("Message", "String"), Field("read", "Boolean") });
            var input = new Dictionary<string, object?> { ["Message"] = "Case approved", ["read"] = false };

            MutationInputHelper.AddRequesterToAccessLists(input, schema);

            input.Should().BeEquivalentTo(new Dictionary<string, object?> { ["Message"] = "Case approved", ["read"] = false });
        }
        finally
        {
            XUnitTest.Infrastructure.BlocksTestContext.Clear();
        }
    }

    [Fact]
    public void AddRequesterToAccessLists_DecidesPerProperty()
    {
        XUnitTest.Infrastructure.BlocksTestContext.Set(userId: "user-1");
        try
        {
            var schema = SchemaWithAccessLists("Create", "Read", "Update");
            schema.Fields.Add(Field("Delete", "Boolean"));
            var input = new Dictionary<string, object?> { ["Title"] = "Prepare contract", ["Delete"] = false };

            MutationInputHelper.AddRequesterToAccessLists(input, schema);

            ((Dictionary<string, object?>)input["Read"]!)["UserIds"].Should().BeEquivalentTo(new object?[] { "user-1" });
            ((Dictionary<string, object?>)input["Update"]!)["UserIds"].Should().BeEquivalentTo(new object?[] { "user-1" });
            input["Delete"].Should().Be(false);
            input.Should().NotContainKey("Create");
        }
        finally
        {
            XUnitTest.Infrastructure.BlocksTestContext.Clear();
        }
    }

    [Fact]
    public void GetAllPathsFromInput_FlatAndNested()
    {
        var input = new Dictionary<string, object?>
        {
            ["Name"] = "John",
            ["Contact"] = new Dictionary<string, object?> { ["Email"] = "a@b.com" }
        };
        var paths = MutationInputHelper.GetAllPathsFromInput(input, "");
        paths.Should().Contain(new[] { "Name", "Contact", "Contact.Email" });
    }

    [Fact]
    public void GetAllPathsFromInput_ListOfObjects()
    {
        var input = new Dictionary<string, object?>
        {
            ["Courses"] = new List<object?>
            {
                new Dictionary<string, object?> { ["Title"] = "Math" }
            }
        };
        var paths = MutationInputHelper.GetAllPathsFromInput(input, "");
        paths.Should().Contain("Courses");
        paths.Should().Contain("Courses.0");
        paths.Should().Contain("Courses.0.Title");
    }

    [Fact]
    public void RemovePathFromInput_TopLevel()
    {
        var input = new Dictionary<string, object?> { ["Name"] = "John", ["Age"] = 5 };
        MutationInputHelper.RemovePathFromInput(input, "Name").Should().BeTrue();
        input.ContainsKey("Name").Should().BeFalse();
        MutationInputHelper.RemovePathFromInput(input, "Missing").Should().BeFalse();
    }

    [Fact]
    public void RemovePathFromInput_Nested()
    {
        var input = new Dictionary<string, object?>
        {
            ["Contact"] = new Dictionary<string, object?> { ["Email"] = "a@b.com", ["Phone"] = "x" }
        };
        MutationInputHelper.RemovePathFromInput(input, "Contact.Email").Should().BeTrue();
        ((Dictionary<string, object?>)input["Contact"]!).ContainsKey("Email").Should().BeFalse();
    }

    [Fact]
    public void RemovePathFromInput_ListIndex_NullsElement()
    {
        var input = new Dictionary<string, object?>
        {
            ["Courses"] = new List<object?> { new Dictionary<string, object?> { ["Title"] = "Math" } }
        };
        MutationInputHelper.RemovePathFromInput(input, "Courses.0").Should().BeTrue();
        ((List<object?>)input["Courses"]!)[0].Should().BeNull();
    }

    [Fact]
    public void RemoveExcludedPathsFromInput_ReturnsRemoved()
    {
        var input = new Dictionary<string, object?> { ["A"] = 1, ["B"] = 2, ["C"] = 3 };
        var removed = MutationInputHelper.RemoveExcludedPathsFromInput(input, new List<string> { "A", "C", "Missing" });
        removed.Should().BeEquivalentTo(new[] { "A", "C" });
    }

    [Theory]
    [InlineData("Courses.0.Title", "Courses.Title")]
    [InlineData("Name", "Name")]
    [InlineData("Courses.0.Modules.2.Name", "Courses.Modules.Name")]
    [InlineData("", "")]
    public void ToSchemaPath_StripsIndices(string input, string expected)
    {
        MutationInputHelper.ToSchemaPath(input).Should().Be(expected);
    }

    [Fact]
    public void GetFieldDefForPath_RootField()
    {
        var schema = NestedSchema();
        MutationInputHelper.GetFieldDefForPath(schema, "Name")!.Name.Should().Be("Name");
    }

    [Fact]
    public void GetFieldDefForPath_NestedField()
    {
        var schema = NestedSchema();
        MutationInputHelper.GetFieldDefForPath(schema, "Contact.Email")!.Name.Should().Be("Email");
    }

    [Fact]
    public void GetFieldDefForPath_WithArrayIndex()
    {
        var schema = NestedSchema();
        MutationInputHelper.GetFieldDefForPath(schema, "Courses.0.Title")!.Name.Should().Be("Title");
    }

    [Fact]
    public void GetFieldDefForPath_SystemId_ReturnsNull()
    {
        MutationInputHelper.GetFieldDefForPath(NestedSchema(), "_id").Should().BeNull();
    }

    [Fact]
    public void GetFieldDefForPath_Unknown_ReturnsNull()
    {
        MutationInputHelper.GetFieldDefForPath(NestedSchema(), "Nope.Here").Should().BeNull();
    }

    [Theory]
    [InlineData(PolicyOperation.WRITE, SchemaAccessLevel.Custom)]
    [InlineData(PolicyOperation.EDIT, SchemaAccessLevel.User)]
    [InlineData(PolicyOperation.DELETE, SchemaAccessLevel.Public)]
    [InlineData(PolicyOperation.READ, SchemaAccessLevel.Inherited)]
    public void GetSchemaAccessLevelForOperation(PolicyOperation op, SchemaAccessLevel expected)
    {
        var schema = Schema(
            read: SchemaAccessLevel.Inherited,
            write: SchemaAccessLevel.Custom,
            edit: SchemaAccessLevel.User,
            delete: SchemaAccessLevel.Public);
        MutationInputHelper.GetSchemaAccessLevelForOperation(schema, op).Should().Be(expected);
    }

    [Fact]
    public void EnsureDefaultListsForInsert_AddsMissingDefaults()
    {
        var input = new Dictionary<string, object?>();
        MutationInputHelper.EnsureDefaultListsForInsert(input);
        input[nameof(GraphQlBaseEntity.OrganizationId)].Should().Be(string.Empty);
        input[nameof(GraphQlBaseEntity.Tags)].Should().BeOfType<List<string>>();
    }

    [Fact]
    public void EnsureDefaultListsForInsert_PreservesExisting()
    {
        var input = new Dictionary<string, object?>
        {
            [nameof(GraphQlBaseEntity.OrganizationId)] = "org-x",
            [nameof(GraphQlBaseEntity.Tags)] = new List<string> { "t1" }
        };
        MutationInputHelper.EnsureDefaultListsForInsert(input);
        input[nameof(GraphQlBaseEntity.OrganizationId)].Should().Be("org-x");
        ((List<string>)input[nameof(GraphQlBaseEntity.Tags)]!).Should().Contain("t1");
    }

    [Fact]
    public void ActionResponseNotFound_BuildsMessage()
    {
        var resp = MutationInputHelper.ActionResponseNotFound("UPDATE");
        resp.Acknowledged.Should().BeFalse();
        resp.Message.Should().Contain("UPDATE");
    }
}

[Collection("ContextSerial")]
public class MutationInputHelperClsTests
{
    private static SchemaDefinitionExtended CustomSchema()
    {
        var schema = Schema(write: SchemaAccessLevel.Custom, edit: SchemaAccessLevel.Custom, fields: new()
        {
            Field("Name", "String", write: SchemaAccessLevel.Public),
            Field("Salary", "Int", write: SchemaAccessLevel.Custom)
        });
        // CLS policy covering Salary that never grants (deny by empty rule group)
        var policy = Policy(PolicyType.CLS, PolicyOperation.WRITE, new[] { "Salary" },
            Group(PolicyLogicalOperator.AND)); // no rules => not granted
        schema.Policies.Add(policy);
        return schema;
    }

    [Fact]
    public void EvaluateClsPoliciesForInput_BlocksCloud_GrantsAll()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var result = MutationInputHelper.EvaluateClsPoliciesForInput(CurrentPrincipal(), 
                CustomSchema(), PolicyOperation.WRITE, new List<string> { "Salary" });
            result.IsAccessGranted.Should().BeTrue();
            result.ExcludedFields.Should().BeEmpty();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EvaluateClsPoliciesForInput_CustomFieldWithFailingCls_Excluded()
    {
        ClearContext();
        SetContext(isAuthenticated: true);
        try
        {
            var result = MutationInputHelper.EvaluateClsPoliciesForInput(CurrentPrincipal(), 
                CustomSchema(), PolicyOperation.WRITE, new List<string> { "Name", "Salary" });
            result.ExcludedFields.Should().Contain("Salary");
            result.ExcludedFields.Should().NotContain("Name"); // public field allowed
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EvaluateClsPoliciesForInput_UnknownRootField_Excluded()
    {
        ClearContext();
        SetContext();
        try
        {
            var result = MutationInputHelper.EvaluateClsPoliciesForInput(CurrentPrincipal(), 
                CustomSchema(), PolicyOperation.WRITE, new List<string> { "GhostField" });
            result.ExcludedFields.Should().Contain("GhostField");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void ShouldExcludeFieldByCls_NoPolicies_False()
    {
        var schema = Schema(fields: new() { Field("X", "String") });
        MutationInputHelper.ShouldExcludeFieldByCls(CurrentPrincipal(), schema, PolicyOperation.WRITE, "X", SchemaAccessLevel.Custom)
            .Should().BeFalse();
    }
}
