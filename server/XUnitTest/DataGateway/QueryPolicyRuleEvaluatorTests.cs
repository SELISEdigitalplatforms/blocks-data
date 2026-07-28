using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class QueryPolicyRuleEvaluatorTests
{
    [Fact]
    public void RowSatisfiesPolicy_NullRuleGroup_ReturnsFalse()
    {
        var policy = new DataAccessPolicy { RuleGroup = null! };
        QueryPolicyRuleEvaluator.RowSatisfiesPolicy(policy, new Dictionary<string, object>()).Should().BeFalse();
    }

    [Fact]
    public void EvaluateSingleRuleForRow_SchemaFieldVsStatic_Match()
    {
        var rule = Rule(ConditionSource.SCHEMA_FIELD, "Status", PolicyOperator.EQUAL, staticValue: "active");
        var row = new Dictionary<string, object> { ["Status"] = "active" };
        QueryPolicyRuleEvaluator.EvaluateSingleRuleForRow(rule, row).Should().BeTrue();
    }

    [Fact]
    public void EvaluateSingleRuleForRow_SchemaFieldVsStatic_NoMatch()
    {
        var rule = Rule(ConditionSource.SCHEMA_FIELD, "Status", PolicyOperator.EQUAL, staticValue: "active");
        var row = new Dictionary<string, object> { ["Status"] = "inactive" };
        QueryPolicyRuleEvaluator.EvaluateSingleRuleForRow(rule, row).Should().BeFalse();
    }

    [Fact]
    public void EvaluateRuleGroupForRow_And_AllMustPass()
    {
        var group = Group(PolicyLogicalOperator.AND,
            Rule(ConditionSource.SCHEMA_FIELD, "A", PolicyOperator.EQUAL, staticValue: "1"),
            Rule(ConditionSource.SCHEMA_FIELD, "B", PolicyOperator.EQUAL, staticValue: "2"));

        QueryPolicyRuleEvaluator.EvaluateRuleGroupForRow(group,
            new Dictionary<string, object> { ["A"] = "1", ["B"] = "2" }).Should().BeTrue();
        QueryPolicyRuleEvaluator.EvaluateRuleGroupForRow(group,
            new Dictionary<string, object> { ["A"] = "1", ["B"] = "9" }).Should().BeFalse();
    }

    [Fact]
    public void EvaluateRuleGroupForRow_Or_AnyPasses()
    {
        var group = Group(PolicyLogicalOperator.OR,
            Rule(ConditionSource.SCHEMA_FIELD, "A", PolicyOperator.EQUAL, staticValue: "1"),
            Rule(ConditionSource.SCHEMA_FIELD, "B", PolicyOperator.EQUAL, staticValue: "2"));

        QueryPolicyRuleEvaluator.EvaluateRuleGroupForRow(group,
            new Dictionary<string, object> { ["A"] = "9", ["B"] = "2" }).Should().BeTrue();
        QueryPolicyRuleEvaluator.EvaluateRuleGroupForRow(group,
            new Dictionary<string, object> { ["A"] = "9", ["B"] = "9" }).Should().BeFalse();
    }

    [Fact]
    public void EvaluateRuleGroupForRow_EmptyGroup_ReturnsFalse()
    {
        var group = Group(PolicyLogicalOperator.AND);
        QueryPolicyRuleEvaluator.EvaluateRuleGroupForRow(group, new Dictionary<string, object>()).Should().BeFalse();
    }

    [Fact]
    public void EvaluateRuleGroupForRow_NestedGroups()
    {
        var nested = Group(PolicyLogicalOperator.OR,
            Rule(ConditionSource.SCHEMA_FIELD, "Role", PolicyOperator.EQUAL, staticValue: "admin"));
        var group = new PolicyRuleGroup
        {
            LogicalOperator = PolicyLogicalOperator.AND,
            Rules = new List<PolicyRule> { Rule(ConditionSource.SCHEMA_FIELD, "Active", PolicyOperator.EQUAL, staticValue: "yes") },
            NestedGroups = new List<PolicyRuleGroup> { nested }
        };

        QueryPolicyRuleEvaluator.EvaluateRuleGroupForRow(group,
            new Dictionary<string, object> { ["Active"] = "yes", ["Role"] = "admin" }).Should().BeTrue();
        QueryPolicyRuleEvaluator.EvaluateRuleGroupForRow(group,
            new Dictionary<string, object> { ["Active"] = "yes", ["Role"] = "guest" }).Should().BeFalse();
    }

    [Fact]
    public void GetNestedValueByPath_FlatKey()
    {
        var row = new Dictionary<string, object> { ["Name"] = "John" };
        QueryPolicyRuleEvaluator.GetNestedValueByPath(row, "Name").Should().Be("John");
        QueryPolicyRuleEvaluator.GetNestedValueByPath(row, "Missing").Should().BeNull();
        QueryPolicyRuleEvaluator.GetNestedValueByPath(row, "").Should().BeNull();
    }

    [Fact]
    public void GetNestedValueByPath_NestedDictionary()
    {
        var row = new Dictionary<string, object>
        {
            ["Contact"] = new Dictionary<string, object> { ["Email"] = "a@b.com" }
        };
        QueryPolicyRuleEvaluator.GetNestedValueByPath(row, "Contact.Email").Should().Be("a@b.com");
    }

    [Fact]
    public void GetNestedValueByPath_NestedBsonDocument()
    {
        var row = new Dictionary<string, object>
        {
            ["Contact"] = new BsonDocument("Email", "a@b.com")
        };
        // Values sourced from a BsonDocument come back as BsonValue (implicit-conversion unification).
        var result = QueryPolicyRuleEvaluator.GetNestedValueByPath(row, "Contact.Email");
        ((BsonValue)result!).AsString.Should().Be("a@b.com");
    }

    [Fact]
    public void GetNestedValueByPath_NullSegment_ReturnsNull()
    {
        var row = new Dictionary<string, object> { ["Contact"] = null! };
        QueryPolicyRuleEvaluator.GetNestedValueByPath(row, "Contact.Email").Should().BeNull();
    }

    [Fact]
    public void GetNestedValueFromBson_VariousTypes()
    {
        var doc = new BsonDocument
        {
            { "Str", "s" },
            { "Num", 42 },
            { "Bool", true },
            { "Nested", new BsonDocument("Inner", "v") }
        };
        ((BsonValue)QueryPolicyRuleEvaluator.GetNestedValueFromBson(doc, "Str")!).AsString.Should().Be("s");
        ((BsonValue)QueryPolicyRuleEvaluator.GetNestedValueFromBson(doc, "Num")!).AsInt32.Should().Be(42);
        ((BsonValue)QueryPolicyRuleEvaluator.GetNestedValueFromBson(doc, "Bool")!).AsBoolean.Should().BeTrue();
        ((BsonValue)QueryPolicyRuleEvaluator.GetNestedValueFromBson(doc, "Nested.Inner")!).AsString.Should().Be("v");
        QueryPolicyRuleEvaluator.GetNestedValueFromBson(doc, "Missing").Should().BeNull();
    }

    [Fact]
    public void ResolveRuleOperandValue_StaticValue()
    {
        QueryPolicyRuleEvaluator.ResolveRuleOperandValue(
            ConditionSource.STATIC_VALUE, "x", "static-val", new Dictionary<string, object>())
            .Should().Be("static-val");
    }

    [Collection("ContextSerial")]
    public class WithContext
    {
        [Fact]
        public void ResolveRuleOperandValue_Auth_ReadsToken()
        {
            SetContext(userId: "u-99");
            try
            {
                QueryPolicyRuleEvaluator.ResolveRuleOperandValue(
                    ConditionSource.AUTH, "userid", null, new Dictionary<string, object>())
                    .Should().Be("u-99");
            }
            finally { ClearContext(); }
        }

        [Fact]
        public void EvaluateSingleRuleForRow_AuthVsSchemaField_OwnerMatch()
        {
            SetContext(userId: "owner-1");
            try
            {
                var rule = Rule(ConditionSource.AUTH, "userid", PolicyOperator.EQUAL,
                    ConditionSource.SCHEMA_FIELD, rightOperand: "CreatedBy");
                QueryPolicyRuleEvaluator.EvaluateSingleRuleForRow(rule,
                    new Dictionary<string, object> { ["CreatedBy"] = "owner-1" }).Should().BeTrue();
                QueryPolicyRuleEvaluator.EvaluateSingleRuleForRow(rule,
                    new Dictionary<string, object> { ["CreatedBy"] = "someone-else" }).Should().BeFalse();
            }
            finally { ClearContext(); }
        }
    }
}
