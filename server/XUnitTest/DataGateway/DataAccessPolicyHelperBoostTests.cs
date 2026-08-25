using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class DataAccessPolicyHelperFilterBoostTests
{
    [Fact]
    public void BuildConditionFilter_Contain_NotContain_EndWith_Regex()
    {
        DataAccessPolicyHelper.BuildConditionFilter("Name", PolicyOperator.CONTAIN, "jo")["Name"]
            .AsBsonDocument.Contains("$regex").Should().BeTrue();
        DataAccessPolicyHelper.BuildConditionFilter("Name", PolicyOperator.NOT_CONTAIN, "jo")["Name"]
            .AsBsonDocument.Contains("$not").Should().BeTrue();
        DataAccessPolicyHelper.BuildConditionFilter("Name", PolicyOperator.END_WITH, "hn")["Name"]
            .AsBsonDocument["$regex"].AsString.Should().EndWith("$");
        DataAccessPolicyHelper.BuildConditionFilter("Name", PolicyOperator.REGEX, "^x")["Name"]
            .AsBsonDocument.Contains("$regex").Should().BeTrue();
    }

    [Fact]
    public void BuildConditionFilter_ConvertsClrTypes()
    {
        DataAccessPolicyHelper.BuildConditionFilter("A", PolicyOperator.EQUAL, 5)["A"].AsInt32.Should().Be(5);
        DataAccessPolicyHelper.BuildConditionFilter("A", PolicyOperator.EQUAL, 5L)["A"].AsInt64.Should().Be(5L);
        DataAccessPolicyHelper.BuildConditionFilter("A", PolicyOperator.EQUAL, 1.5)["A"].AsDouble.Should().Be(1.5);
        DataAccessPolicyHelper.BuildConditionFilter("A", PolicyOperator.EQUAL, true)["A"].AsBoolean.Should().BeTrue();
        var dt = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        DataAccessPolicyHelper.BuildConditionFilter("A", PolicyOperator.EQUAL, dt)["A"].BsonType.Should().Be(BsonType.DateTime);
    }

    [Fact]
    public void EvaluatePolicies_SchemaFieldVsSchemaField_BuildsExprFilter()
    {
        var rule = Rule(ConditionSource.SCHEMA_FIELD, "Start", PolicyOperator.LESS_THAN,
            ConditionSource.SCHEMA_FIELD, rightOperand: "End");
        var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
            Group(PolicyLogicalOperator.AND, rule));

        var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

        result.IsAccessGranted.Should().BeTrue();
        result.RequiresDataFilter.Should().BeTrue();
        result.DataFilter.Contains("$expr").Should().BeTrue();
    }

    [Theory]
    [InlineData(PolicyOperator.CONTAIN, "$setIsSubset")]
    [InlineData(PolicyOperator.NOT_CONTAIN, "$setIntersection")]
    [InlineData(PolicyOperator.IN, "$setIntersection")]
    [InlineData(PolicyOperator.NOT_IN, "$setIntersection")]
    public void EvaluatePolicies_ArrayFieldVsArrayField_BuildsCollectionExpr(
        PolicyOperator op,
        string expectedExpression)
    {
        var rule = Rule(ConditionSource.SCHEMA_FIELD, "RequiredRoles", op,
            ConditionSource.SCHEMA_FIELD, rightOperand: "AllowedRoles");
        var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
            Group(PolicyLogicalOperator.AND, rule));

        var result = new List<DataAccessPolicy> { policy }
            .EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

        result.DataFilter.Contains("$expr").Should().BeTrue();
        result.DataFilter["$expr"].ToString().Should().Contain(expectedExpression);
    }

    [Fact]
    public void EvaluatePolicies_StaticVsSchemaField_Normalized()
    {
        var rule = Rule(ConditionSource.STATIC_VALUE, "", PolicyOperator.GREATER_THAN,
            ConditionSource.SCHEMA_FIELD, rightOperand: "Age", staticValue: 18);
        var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
            Group(PolicyLogicalOperator.AND, rule));

        var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

        result.IsAccessGranted.Should().BeTrue();
        result.DataFilter.Contains("Age").Should().BeTrue();
    }

    [Fact]
    public void EvaluatePolicies_Or_TwoSchemaFieldRules_CombinesWithOr()
    {
        var group = Group(PolicyLogicalOperator.OR,
            Rule(ConditionSource.SCHEMA_FIELD, "A", PolicyOperator.EQUAL, staticValue: "x"),
            Rule(ConditionSource.SCHEMA_FIELD, "B", PolicyOperator.EQUAL, staticValue: "y"));
        var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(), group);

        var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

        result.IsAccessGranted.Should().BeTrue();
        result.DataFilter.Contains("$or").Should().BeTrue();
    }

    [Fact]
    public void EvaluatePolicies_And_TwoSchemaFieldRules_CombinesWithAnd()
    {
        var group = Group(PolicyLogicalOperator.AND,
            Rule(ConditionSource.SCHEMA_FIELD, "A", PolicyOperator.EQUAL, staticValue: "x"),
            Rule(ConditionSource.SCHEMA_FIELD, "B", PolicyOperator.EQUAL, staticValue: "y"));
        var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(), group);

        var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

        result.DataFilter.Contains("$and").Should().BeTrue();
    }

    [Fact]
    public void EvaluatePolicies_MultipleAllowPolicies_CombinedWithOr()
    {
        var p1 = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
            Group(PolicyLogicalOperator.AND, Rule(ConditionSource.SCHEMA_FIELD, "A", PolicyOperator.EQUAL, staticValue: "x")), priority: 2);
        var p2 = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
            Group(PolicyLogicalOperator.AND, Rule(ConditionSource.SCHEMA_FIELD, "B", PolicyOperator.EQUAL, staticValue: "y")), priority: 1);

        var result = new List<DataAccessPolicy> { p1, p2 }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

        result.IsAccessGranted.Should().BeTrue();
        result.DataFilter.Contains("$or").Should().BeTrue();
    }
}

[Collection("ContextSerial")]
public class DataAccessPolicyHelperTokenExprBoostTests
{
    [Fact]
    public void BuildConditionFilter_TokenExpression_ResolvesFromContext()
    {
        ClearContext();
        SetContext(userId: "u-token-1");
        try
        {
            var filter = DataAccessPolicyHelper.BuildConditionFilter("CreatedBy", PolicyOperator.EQUAL, "{{token.userid}}");
            filter["CreatedBy"].AsString.Should().Be("u-token-1");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void BuildConditionFilter_In_TokenExpression_ResolvesRolesArray()
    {
        ClearContext();
        SetContext(roles: new[] { "admin", "user" });
        try
        {
            var filter = DataAccessPolicyHelper.BuildConditionFilter("Role", PolicyOperator.IN, "{{token.roles}}");
            filter["Role"].AsBsonDocument["$in"].AsBsonArray.Count.Should().Be(2);
        }
        finally { ClearContext(); }
    }

    [Theory]
    [InlineData(PolicyOperator.CONTAIN, "$setIsSubset")]
    [InlineData(PolicyOperator.NOT_CONTAIN, "$setIntersection")]
    [InlineData(PolicyOperator.IN, "$setIntersection")]
    [InlineData(PolicyOperator.NOT_IN, "$setIntersection")]
    public void EvaluatePolicies_RolesVsArraySchemaField_BuildsCollectionExpr(
        PolicyOperator op,
        string expectedExpression)
    {
        ClearContext();
        SetContext(roles: new[] { "admin", "user" });
        try
        {
            var rule = Rule(ConditionSource.AUTH, "roles", op,
                ConditionSource.SCHEMA_FIELD, rightOperand: "AllowedRoles");
            var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
                Group(PolicyLogicalOperator.AND, rule));

            var result = new List<DataAccessPolicy> { policy }
                .EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

            result.DataFilter.Contains("$expr").Should().BeTrue();
            result.DataFilter["$expr"].ToString().Should().Contain(expectedExpression);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EvaluatePolicies_RolesInMultipleSchemaFields_CombinesWithOr()
    {
        ClearContext();
        SetContext(roles: new[] { "admin", "user" });
        try
        {
            var rule = Rule(ConditionSource.AUTH, "roles", PolicyOperator.IN,
                ConditionSource.SCHEMA_FIELD, rightOperand: "PrimaryRole");
            rule.RightOperands = ["PrimaryRole", "AllowedRoles"];
            var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
                Group(PolicyLogicalOperator.AND, rule));

            var result = new List<DataAccessPolicy> { policy }
                .EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

            result.DataFilter.Contains("$or").Should().BeTrue();
            result.DataFilter["$or"].AsBsonArray.Should().HaveCount(2);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void EvaluatePolicies_And_TokenFails_DeniesWithMessage()
    {
        ClearContext();
        SetContext(userId: "u-1", roles: new[] { "guest" });
        try
        {
            // AND of: token roles CONTAIN "admin" (fails) + schema field rule
            var group = Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.AUTH, "roles", PolicyOperator.CONTAIN, staticValue: "admin"),
                Rule(ConditionSource.SCHEMA_FIELD, "Dept", PolicyOperator.EQUAL, staticValue: "HR"));
            var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(), group);

            var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);
            result.IsAccessGranted.Should().BeFalse();
        }
        finally { ClearContext(); }
    }
}
