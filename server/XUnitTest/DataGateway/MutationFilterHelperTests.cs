using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class MutationFilterHelperTests
{
    private static SchemaDefinitionExtended PersonSchema() => Schema(fields: new()
    {
        Field("Name", "String"),
        Field("Age", "Int"),
        Field("ItemId", "ID")
    });

    [Fact]
    public void BuildBaseFilter_FromWhere()
    {
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["eq"] = "John" }
        };
        var filter = MutationFilterHelper.BuildBaseFilter(where, null, isOwnerCheckRequested: false, PersonSchema());
        filter.Contains("Name").Should().BeTrue();
    }

    [Fact]
    public void BuildBaseFilter_FromFilterJson_WhenNoWhere()
    {
        var filter = MutationFilterHelper.BuildBaseFilter(null, "{\"Age\": 30}", isOwnerCheckRequested: false, PersonSchema());
        filter.Contains("Age").Should().BeTrue();
        filter["Age"].AsInt32.Should().Be(30);
    }

    [Fact]
    public void BuildBaseFilter_EmptyFilter_WhenNothingProvided()
    {
        var filter = MutationFilterHelper.BuildBaseFilter(null, null, isOwnerCheckRequested: false, PersonSchema());
        filter.ElementCount.Should().Be(0);
    }

    [Fact]
    public void BuildBaseFilter_ReplacesItemIdSystemField()
    {
        var filter = MutationFilterHelper.BuildBaseFilter(null, "{\"ItemId\": \"abc\"}", isOwnerCheckRequested: false, PersonSchema());
        filter.Contains("_id").Should().BeTrue();
        filter.Contains("ItemId").Should().BeFalse();
    }

    [Fact]
    public void ApplyPolicyFilter_NoDataFilter_ReturnsBase()
    {
        var baseFilter = new BsonDocument("Name", "John");
        var rls = new PolicyEvaluationResult { RequiresDataFilter = false };
        var result = MutationFilterHelper.ApplyPolicyFilter(baseFilter, rls);
        result.Should().BeSameAs(baseFilter);
    }

    [Fact]
    public void ApplyPolicyFilter_WithDataFilter_CombinesWithAnd()
    {
        var baseFilter = new BsonDocument("Name", "John");
        var rls = new PolicyEvaluationResult
        {
            RequiresDataFilter = true,
            DataFilter = new BsonDocument("CreatedBy", "u-1")
        };
        var result = MutationFilterHelper.ApplyPolicyFilter(baseFilter, rls);
        result.Contains("$and").Should().BeTrue();
        result["$and"].AsBsonArray.Count.Should().Be(2);
    }

    [Fact]
    public void BuildFilterWithRls_NonCustomSchema_SkipsPolicyFilter()
    {
        var schema = PersonSchema(); // write access = Public (not custom)
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["eq"] = "John" }
        };
        var rlsCalled = false;
        PolicyEvaluationResult Evaluate(SchemaDefinitionExtended s, PolicyOperation op)
        {
            rlsCalled = true;
            return new PolicyEvaluationResult { RequiresDataFilter = true, DataFilter = new BsonDocument("X", 1) };
        }

        var filter = MutationFilterHelper.BuildFilterWithRls(where, null, false, schema, PolicyOperation.EDIT, Evaluate);

        // Non-custom edit access => the RLS data filter is NOT applied
        filter.Contains("$and").Should().BeFalse();
        filter.Contains("Name").Should().BeTrue();
        rlsCalled.Should().BeTrue(); // evaluator is still invoked
    }

    [Fact]
    public void BuildFilterWithRls_CustomSchema_AppliesPolicyFilter()
    {
        var schema = Schema(edit: SchemaAccessLevel.Custom, fields: new()
        {
            Field("Name", "String")
        });
        var where = new Dictionary<string, object?>
        {
            ["Name"] = new Dictionary<string, object?> { ["eq"] = "John" }
        };
        PolicyEvaluationResult Evaluate(SchemaDefinitionExtended s, PolicyOperation op) =>
            new PolicyEvaluationResult { RequiresDataFilter = true, DataFilter = new BsonDocument("CreatedBy", "u-1") };

        var filter = MutationFilterHelper.BuildFilterWithRls(where, null, false, schema, PolicyOperation.EDIT, Evaluate);
        filter.Contains("$and").Should().BeTrue();
    }
}

[Collection("ContextSerial")]
public class MutationFilterHelperOwnerCheckTests
{
    [Fact]
    public void BuildBaseFilter_OwnerCheck_AddsCreatedBy()
    {
        ClearContext();
        SetContext(userId: "owner-77");
        try
        {
            var schema = Schema(fields: new() { Field("Name", "String") });
            var filter = MutationFilterHelper.BuildBaseFilter(null, "{}", isOwnerCheckRequested: true, schema);
            filter.Contains(nameof(GraphQlBaseEntity.CreatedBy)).Should().BeTrue();
            filter[nameof(GraphQlBaseEntity.CreatedBy)].AsString.Should().Be("owner-77");
        }
        finally { ClearContext(); }
    }
}
