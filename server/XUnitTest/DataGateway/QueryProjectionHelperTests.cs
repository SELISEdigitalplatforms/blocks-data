using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class QueryProjectionHelperPureTests
{
    [Fact]
    public void PolicyCoversAnyRequestedField_ExactAndNested()
    {
        var policy = Policy(PolicyType.CLS, PolicyOperation.READ, new[] { "Salary", "Contact" },
            Group(PolicyLogicalOperator.AND));
        QueryProjectionHelper.PolicyCoversAnyRequestedField(policy, new HashSet<string> { "Salary" }).Should().BeTrue();
        QueryProjectionHelper.PolicyCoversAnyRequestedField(policy, new HashSet<string> { "Contact.Email" }).Should().BeTrue();
        QueryProjectionHelper.PolicyCoversAnyRequestedField(policy, new HashSet<string> { "Name" }).Should().BeFalse();
    }

    [Fact]
    public void EnsureProtectedFieldsInProjection_AddsMissing_SkipsChildCollision()
    {
        var projection = new BsonDocument { { "Name", 1 }, { "Contact.Email", 1 } };
        QueryProjectionHelper.EnsureProtectedFieldsInProjection(projection, new[] { "Salary", "Contact" });
        projection.Contains("Salary").Should().BeTrue();
        // "Contact" not added because a child path "Contact.Email" already present
        projection.Contains("Contact").Should().BeFalse();
    }

    [Fact]
    public void TryAddSchemaFieldToProjection_AddsAndMarksEvaluationOnly()
    {
        var projection = new BsonDocument { { "Name", 1 } };
        var requested = new HashSet<string> { "Name" };
        var evalOnly = new HashSet<string>();
        QueryProjectionHelper.TryAddSchemaFieldToProjection(projection, requested, evalOnly,
            ConditionSource.SCHEMA_FIELD, "Department");
        projection.Contains("Department").Should().BeTrue();
        evalOnly.Should().Contain("Department"); // not requested => evaluation-only
    }

    [Fact]
    public void TryAddSchemaFieldToProjection_NonSchemaSource_Ignored()
    {
        var projection = new BsonDocument();
        QueryProjectionHelper.TryAddSchemaFieldToProjection(projection, new HashSet<string>(), new HashSet<string>(),
            ConditionSource.STATIC_VALUE, "Whatever");
        projection.ElementCount.Should().Be(0);
    }

    [Fact]
    public void AddRuleOperandFieldsToProjection_WalksRulesAndNestedGroups()
    {
        var projection = new BsonDocument();
        var requested = new HashSet<string>();
        var evalOnly = new HashSet<string>();
        var group = new PolicyRuleGroup
        {
            Rules = new List<PolicyRule>
            {
                Rule(ConditionSource.SCHEMA_FIELD, "A", PolicyOperator.EQUAL, staticValue: "x")
            },
            NestedGroups = new List<PolicyRuleGroup>
            {
                Group(PolicyLogicalOperator.AND, Rule(ConditionSource.SCHEMA_FIELD, "B", PolicyOperator.EQUAL, staticValue: "y"))
            }
        };
        QueryProjectionHelper.AddRuleOperandFieldsToProjection(group, projection, requested, evalOnly);
        projection.Contains("A").Should().BeTrue();
        projection.Contains("B").Should().BeTrue();
    }
}

[Collection("ContextSerial")]
public class QueryProjectionHelperRestOverloadTests
{
    [Fact]
    public void BuildMongoProjectionWithCls_NoRequestedFields_ProjectsAllPlusId()
    {
        ClearContext();
        SetBlocksCloud(true); // skip CLS logic
        try
        {
            var schema = Schema(fields: new() { Field("Name"), Field("Age", "Int") });
            var projection = QueryProjectionHelper.BuildMongoProjectionWithCls(
                (IReadOnlyList<string>?)null, schema, out var evalOnly);
            projection.Contains("Name").Should().BeTrue();
            projection.Contains("Age").Should().BeTrue();
            projection.Contains("_id").Should().BeTrue();
            evalOnly.Should().BeEmpty();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void BuildMongoProjectionWithCls_RequestedFields_MapsItemId()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            var schema = Schema(fields: new() { Field("Name"), Field("ItemId", "ID") });
            var projection = QueryProjectionHelper.BuildMongoProjectionWithCls(
                new List<string> { "Name", "ItemId" }, schema, out _);
            projection.Contains("Name").Should().BeTrue();
            projection.Contains("_id").Should().BeTrue();
            projection.Contains("ItemId").Should().BeFalse();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void BuildMongoProjectionWithCls_WithReadClsPolicy_AddsProtectedAndOperandFields()
    {
        ClearContext();
        SetBlocksCloud(false); // run CLS logic
        try
        {
            var schema = Schema(read: SchemaAccessLevel.Custom, fields: new()
            {
                Field("Name"),
                Field("Salary", "Int", read: SchemaAccessLevel.Custom),
                Field("Department")
            });
            schema.Policies.Add(Policy(PolicyType.CLS, PolicyOperation.READ, new[] { "Salary" },
                Group(PolicyLogicalOperator.AND, Rule(ConditionSource.SCHEMA_FIELD, "Department", PolicyOperator.EQUAL, staticValue: "HR"))));

            var projection = QueryProjectionHelper.BuildMongoProjectionWithCls(
                new List<string> { "Salary" }, schema, out var evalOnly);

            projection.Contains("Salary").Should().BeTrue();
            projection.Contains("Department").Should().BeTrue();  // operand field added
            evalOnly.Should().Contain("Department");              // operand not requested
        }
        finally { ClearContext(); }
    }
}
