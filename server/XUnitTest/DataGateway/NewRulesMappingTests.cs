using System.Text.Json;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Export;
using FluentAssertions;

namespace XUnitTest.DataGateway;

/// <summary>
/// Validation rule mapping for the rules added by the validation and access rules plan (phase 5): the "only when"
/// condition, the reference filter, list values and versions. Kept apart from <c>MapperTests</c>, which must stay
/// unmodified (G6, G7).
/// </summary>
public class NewRulesMappingTests
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private static PolicyRuleGroup Where(string field, object value) => new()
    {
        Rules = [new() { LeftOperand = field, Operator = PolicyOperator.EQUAL, RightSource = ConditionSource.STATIC_VALUE, StaticValue = value }],
    };

    private static T FromJson<T>(string json) => JsonSerializer.Deserialize<T>(json, Web)!;

    [Fact]
    public void Request_CarriesTheConditionAndTheFilter()
    {
        var when = Where("Country", "DE");
        var filter = Where("Status", "Active");
        var rule = new ValidationRuleRequest { Type = ValidationType.Reference, Value = "Customer", When = when, TargetFilter = filter }.MapToEntity();

        rule.When.Should().BeSameAs(when);
        rule.TargetFilter.Should().BeSameAs(filter);
    }

    [Fact]
    public void InValues_AreStoredAsAPlainList()
    {
        // A JSON array arrives as object[], which the BSON object serializer would write as { _t, _v } (R3).
        var request = new ValidationRuleRequest { Type = ValidationType.In, Value = FromJson<JsonElement>("""["a", "b"]""") };

        var rule = request.MapToEntity();

        rule.Value.Should().BeOfType<List<object?>>().Which.Should().Equal("a", "b");
    }

    [Theory]
    [InlineData(null, 1)]   // an API call without a version gets 1, as today
    [InlineData(0, 1)]
    [InlineData(1, 1)]
    [InlineData(2, 2)]      // a version the client sends is kept
    public void ReferenceRules_GetAtLeastVersion1(int? sent, int stored)
    {
        new ValidationRuleRequest { Type = ValidationType.Reference, Value = "Customer", EvaluationVersion = sent }.MapToEntity()
            .EvaluationVersion.Should().Be(stored);
    }

    [Fact]
    public void MustNotExistIn_StoresPlainNames_AndKeepsItsVersion()
    {
        var rule = new ValidationRuleRequest { Type = ValidationType.NotExistsIn, Value = " Blocklist ", EvaluationVersion = 0 }.MapToEntity();

        rule.Value.Should().Be("Blocklist");
        rule.SecondaryValue.Should().Be("ItemId");
        rule.EvaluationVersion.Should().Be(0);
    }

    [Fact]
    public void Response_ForAnOldRule_HasNoNewKeys()
    {
        // G6: an old rule's response is the same JSON as before.
        var json = JsonSerializer.Serialize(new ValidationRule { Type = ValidationType.NotEmpty }.MapToResponse(), Web);

        json.Should().NotContain("when").And.NotContain("targetFilter");
    }

    [Fact]
    public void Response_ForANewRule_CarriesTheConditionAndTheFilter()
    {
        var response = new ValidationRule { Type = ValidationType.Reference, When = Where("Country", "DE"), TargetFilter = Where("Status", "Active") }.MapToResponse();

        var json = JsonSerializer.Serialize(response, Web);

        json.Should().Contain("\"when\"").And.Contain("\"targetFilter\"");
    }

    [Fact]
    public void Export_ForAnOldRule_HasNoNewKeys()
    {
        // G7: an old rule exports to the same JSON as before.
        var json = JsonSerializer.Serialize(new ValidationRule { Type = ValidationType.NotEmpty }.MapToExportValidationRule());

        json.Should().NotContain("When").And.NotContain("TargetFilter");
    }

    [Fact]
    public void ExportThenImport_KeepsTheConditionTheFilterAndTheList()
    {
        var rule = new ValidationRule
        {
            Type = ValidationType.In, Value = new List<object?> { "a", "b" }, EvaluationVersion = 2,
            When = Where("Country", "DE"), TargetFilter = Where("Status", "Active"),
        };

        var json = JsonSerializer.Serialize(rule.MapToExportValidationRule());
        var imported = JsonSerializer.Deserialize<ExportValidationRule>(json)!.MapToValidationRule();

        imported.Value.Should().BeOfType<List<object?>>().Which.Should().Equal("a", "b");
        imported.When!.Rules.Single().LeftOperand.Should().Be("Country");
        imported.When.Rules.Single().StaticValue.Should().Be("DE");
        imported.TargetFilter!.Rules.Single().LeftOperand.Should().Be("Status");
        imported.EvaluationVersion.Should().Be(2);
    }

    [Fact]
    public void Import_KeepsAReferenceRulesVersion()
    {
        // No Reference normalisation on import: an old export file imports with no changes (G7).
        new ExportValidationRule { Type = ValidationType.Reference, Value = "Customer", EvaluationVersion = 0 }.MapToValidationRule()
            .EvaluationVersion.Should().Be(0);
    }
}
