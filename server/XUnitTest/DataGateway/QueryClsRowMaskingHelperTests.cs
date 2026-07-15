using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class QueryClsRowMaskingHelperPureTests
{
    [Fact]
    public void GetEffectiveReadAccessLevel_InheritedResolvesToSchema()
    {
        var schema = Schema(read: SchemaAccessLevel.User, fields: new()
        {
            Field("A", read: SchemaAccessLevel.Inherited),
            Field("B", read: SchemaAccessLevel.Custom)
        });
        QueryClsRowMaskingHelper.GetEffectiveReadAccessLevel(schema, "A").Should().Be(SchemaAccessLevel.User);
        QueryClsRowMaskingHelper.GetEffectiveReadAccessLevel(schema, "B").Should().Be(SchemaAccessLevel.Custom);
    }

    [Fact]
    public void GetEffectiveReadAccessLevel_UnknownPath_UsesSchemaLevel()
    {
        var schema = Schema(read: SchemaAccessLevel.Public, fields: new() { Field("A") });
        QueryClsRowMaskingHelper.GetEffectiveReadAccessLevel(schema, "Unknown").Should().Be(SchemaAccessLevel.Public);
    }

    [Fact]
    public void GetPathsWithEffectiveReadAccessLevel_IncludesNested()
    {
        var schema = Schema(read: SchemaAccessLevel.User, fields: new()
        {
            Field("Name", read: SchemaAccessLevel.Public),
            Field("Contact", "Contact", children: new()
            {
                Field("Email", read: SchemaAccessLevel.Custom)
            })
        });
        var paths = QueryClsRowMaskingHelper.GetPathsWithEffectiveReadAccessLevel(schema);
        paths.Should().Contain(p => p.Path == "Name" && p.EffectiveReadLevel == SchemaAccessLevel.Public);
        paths.Should().Contain(p => p.Path == "Contact" && p.EffectiveReadLevel == SchemaAccessLevel.User);
        paths.Should().Contain(p => p.Path == "Contact.Email" && p.EffectiveReadLevel == SchemaAccessLevel.Custom);
    }

    [Fact]
    public void GetPathsFromSchemaFieldsByCondition_RespectsMaxDepth()
    {
        var fields = new List<FieldDefinitionResponse>
        {
            Field("Top", "T", children: new() { Field("Child", "C", children: new() { Field("GrandChild") }) })
        };
        var depth1 = QueryClsRowMaskingHelper.GetPathsFromSchemaFieldsByCondition(fields, _ => true, 1, "");
        depth1.Should().Contain("Top");
        depth1.Should().NotContain("Top.Child");

        var depth2 = QueryClsRowMaskingHelper.GetPathsFromSchemaFieldsByCondition(fields, _ => true, 2, "");
        depth2.Should().Contain("Top.Child");
        depth2.Should().NotContain("Top.Child.GrandChild");
    }

    [Fact]
    public void NullPathsInRow_NullsMatchingNestedPath()
    {
        var row = new Dictionary<string, object>
        {
            ["Name"] = "John",
            ["Contact"] = new Dictionary<string, object> { ["Email"] = "a@b.com", ["Phone"] = "1" }
        };
        QueryClsRowMaskingHelper.NullPathsInRow(row, new HashSet<string> { "Contact.Email" }, "");
        ((Dictionary<string, object>)row["Contact"])["Email"].Should().BeNull();
        ((Dictionary<string, object>)row["Contact"])["Phone"].Should().Be("1");
        row["Name"].Should().Be("John");
    }

    [Fact]
    public void RemoveFieldByPath_TopAndNested()
    {
        var row = new Dictionary<string, object>
        {
            ["A"] = 1,
            ["Nested"] = new Dictionary<string, object> { ["X"] = 1, ["Y"] = 2 }
        };
        QueryClsRowMaskingHelper.RemoveFieldByPath(row, "A");
        row.ContainsKey("A").Should().BeFalse();
        QueryClsRowMaskingHelper.RemoveFieldByPath(row, "Nested.X");
        ((Dictionary<string, object>)row["Nested"]).ContainsKey("X").Should().BeFalse();
    }

    [Fact]
    public void RemoveFieldsByPaths_RemovesAll()
    {
        var row = new Dictionary<string, object> { ["A"] = 1, ["B"] = 2, ["C"] = 3 };
        QueryClsRowMaskingHelper.RemoveFieldsByPaths(row, new HashSet<string> { "A", "C" });
        row.Keys.Should().BeEquivalentTo(new[] { "B" });
    }

    [Fact]
    public void ComputeAllowedFieldNamesForRow_GrantsWhenPolicySatisfied()
    {
        var schema = Schema(read: SchemaAccessLevel.Custom, fields: new()
        {
            Field("Name", read: SchemaAccessLevel.Public),
            Field("Salary", "Int", read: SchemaAccessLevel.Custom)
        });
        var clsPolicy = Policy(PolicyType.CLS, PolicyOperation.READ, new[] { "Salary" },
            Group(PolicyLogicalOperator.AND, Rule(ConditionSource.SCHEMA_FIELD, "Role", PolicyOperator.EQUAL, staticValue: "mgr")));
        var row = new Dictionary<string, object> { ["Name"] = "n", ["Salary"] = 100, ["Role"] = "mgr" };
        var protectedByCls = new HashSet<string> { "Salary" };

        var allowed = QueryClsRowMaskingHelper.ComputeAllowedFieldNamesForRow(
            row, schema, new List<DataAccessPolicy> { clsPolicy }, protectedByCls,
            QueryPolicyRuleEvaluator.RowSatisfiesPolicy);

        allowed.Should().Contain("Salary"); // policy satisfied
        allowed.Should().Contain("Name");   // not protected
    }

    [Fact]
    public void ComputeAllowedFieldNamesForRow_DeniesWhenPolicyNotSatisfied()
    {
        var schema = Schema(read: SchemaAccessLevel.Custom, fields: new()
        {
            Field("Salary", "Int", read: SchemaAccessLevel.Custom)
        });
        var clsPolicy = Policy(PolicyType.CLS, PolicyOperation.READ, new[] { "Salary" },
            Group(PolicyLogicalOperator.AND, Rule(ConditionSource.SCHEMA_FIELD, "Role", PolicyOperator.EQUAL, staticValue: "mgr")));
        var row = new Dictionary<string, object> { ["Salary"] = 100, ["Role"] = "peon" };
        var protectedByCls = new HashSet<string> { "Salary" };

        var allowed = QueryClsRowMaskingHelper.ComputeAllowedFieldNamesForRow(
            row, schema, new List<DataAccessPolicy> { clsPolicy }, protectedByCls,
            QueryPolicyRuleEvaluator.RowSatisfiesPolicy);

        allowed.Should().NotContain("Salary");
    }

    [Fact]
    public void NullDeniedFieldsByPath_NullsProtectedNotAllowed()
    {
        var row = new Dictionary<string, object> { ["Name"] = "n", ["Salary"] = 100 };
        var allowed = new HashSet<string> { "Name" };
        var protectedByCls = new HashSet<string> { "Salary" };
        QueryClsRowMaskingHelper.NullDeniedFieldsByPath(row, allowed, protectedByCls, "");
        row["Salary"].Should().BeNull();
        row["Name"].Should().Be("n");
    }
}

[Collection("ContextSerial")]
public class QueryClsRowMaskingHelperContextTests
{
    [Fact]
    public void IsRequestAuthenticated_ReflectsContext()
    {
        ClearContext();
        QueryClsRowMaskingHelper.IsRequestAuthenticated().Should().BeFalse();
        SetContext(isAuthenticated: true);
        try
        {
            QueryClsRowMaskingHelper.IsRequestAuthenticated().Should().BeTrue();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void ApplyCustomSchemaMaskWhenNoCls_CustomSchema_RemovesNonSystemKeys()
    {
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Custom, fields: new() { Field("Secret") });
            var row = new Dictionary<string, object> { ["_id"] = "1", ["Secret"] = "x", ["ItemId"] = "1" };
            QueryClsRowMaskingHelper.ApplyCustomSchemaMaskWhenNoCls(row, schema);
            row.ContainsKey("Secret").Should().BeFalse();
            row.ContainsKey("_id").Should().BeTrue();  // system field kept
            row.ContainsKey("ItemId").Should().BeTrue();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void ApplyCustomSchemaMaskWhenNoCls_BlocksCloud_KeepsEverything()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Custom, fields: new() { Field("Secret") });
            var row = new Dictionary<string, object> { ["Secret"] = "x" };
            QueryClsRowMaskingHelper.ApplyCustomSchemaMaskWhenNoCls(row, schema);
            row.ContainsKey("Secret").Should().BeTrue();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void ApplyCustomSchemaMaskWhenNoCls_NonCustomSchema_Unchanged()
    {
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Public, fields: new() { Field("Secret") });
            var row = new Dictionary<string, object> { ["Secret"] = "x" };
            QueryClsRowMaskingHelper.ApplyCustomSchemaMaskWhenNoCls(row, schema);
            row.ContainsKey("Secret").Should().BeTrue();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void MaskUserOnlyFieldsWhenUnauthenticated_NullsUserFields()
    {
        ClearContext(); // unauthenticated
        var schema = Schema(read: SchemaAccessLevel.Public, fields: new()
        {
            Field("PublicField", read: SchemaAccessLevel.Public),
            Field("UserField", read: SchemaAccessLevel.User)
        });
        var row = new Dictionary<string, object> { ["PublicField"] = "p", ["UserField"] = "u" };
        QueryClsRowMaskingHelper.MaskUserOnlyFieldsWhenUnauthenticated(row, schema);
        row["UserField"].Should().BeNull();
        row["PublicField"].Should().Be("p");
    }

    [Fact]
    public void MaskUserOnlyFieldsWhenUnauthenticated_Authenticated_NoMasking()
    {
        ClearContext();
        SetContext(isAuthenticated: true);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Public, fields: new()
            {
                Field("UserField", read: SchemaAccessLevel.User)
            });
            var row = new Dictionary<string, object> { ["UserField"] = "u" };
            QueryClsRowMaskingHelper.MaskUserOnlyFieldsWhenUnauthenticated(row, schema);
            row["UserField"].Should().Be("u");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void MaskRowByClsPolicies_NoPolicies_AppliesCustomSchemaMask()
    {
        ClearContext();
        SetBlocksCloud(false);
        SetContext(isAuthenticated: true);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Custom, fields: new() { Field("Secret") });
            var row = new Dictionary<string, object> { ["_id"] = "1", ["Secret"] = "x" };
            var masked = QueryClsRowMaskingHelper.MaskRowByClsPolicies(
                row, schema, new List<DataAccessPolicy>(), new HashSet<string>(),
                QueryPolicyRuleEvaluator.RowSatisfiesPolicy);
            masked.ContainsKey("Secret").Should().BeFalse();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void MaskRowByClsPolicies_WithPolicy_NullsDeniedField()
    {
        ClearContext();
        SetBlocksCloud(false);
        SetContext(isAuthenticated: true);
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Custom, fields: new()
            {
                Field("Name", read: SchemaAccessLevel.Public),
                Field("Salary", "Int", read: SchemaAccessLevel.Custom)
            });
            var clsPolicy = Policy(PolicyType.CLS, PolicyOperation.READ, new[] { "Salary" },
                Group(PolicyLogicalOperator.AND, Rule(ConditionSource.SCHEMA_FIELD, "Role", PolicyOperator.EQUAL, staticValue: "mgr")));
            var row = new Dictionary<string, object> { ["Name"] = "n", ["Salary"] = 100, ["Role"] = "peon" };

            var masked = QueryClsRowMaskingHelper.MaskRowByClsPolicies(
                row, schema, new List<DataAccessPolicy> { clsPolicy }, new HashSet<string>(),
                QueryPolicyRuleEvaluator.RowSatisfiesPolicy);

            masked["Salary"].Should().BeNull();  // policy not satisfied (Role != mgr)
            masked["Name"].Should().Be("n");
        }
        finally { ClearContext(); }
    }
}
