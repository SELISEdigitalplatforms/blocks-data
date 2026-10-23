using System.Text.Json;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;

namespace XUnitTest.DataGateway.Validators;

/// <summary>
/// A saved policy may only use Auth value names the runtime resolves
/// (Blocks.Genesis DataAccessPolicyHelper.GetTokenValue).
/// </summary>
public class PolicyRuleAuthNameValidatorTests
{
    private const string UnknownPrefix = "Unknown Auth value '";

    public static TheoryData<string> AcceptedNames => new()
    {
        "UserId", "userid", "USERID", "Id", "id", "Sub", "SUB",
        "Email", "email", "EMAIL",
        "TenantId", "tenantid", "Tenant", "TENANT",
        "Roles", "roles", "Role", "ROLE",
        "Permissions", "permissions", "Permission", "PERMISSION",
        "OrganizationId", "organizationid", "Organization", "ORGANIZATION",
    };

    public static TheoryData<string> UnknownNames => new()
    {
        "orgId", "OrgId", "UserName", "Department", "user_id", "Claims", "Name",
    };

    private static ValidationResult Validate(PolicyRule rule) => new PolicyRuleValidator().Validate(rule);

    private static void ShouldRefuse(ValidationResult result, string property, string name)
    {
        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e => e.PropertyName == property)
            .Which.ErrorMessage.Should().Be(
                $"Unknown Auth value '{name}'. Use: UserId, Email, Roles, Permissions, OrganizationId, TenantId.");
    }

    [Theory]
    [MemberData(nameof(AcceptedNames))]
    public void LeftAuth_AcceptedName_Passes(string name)
    {
        Validate(new PolicyRule { LeftSource = ConditionSource.AUTH, LeftOperand = name, RightSource = ConditionSource.STATIC_VALUE, StaticValue = "x" })
            .IsValid.Should().BeTrue();
    }

    [Theory]
    [MemberData(nameof(UnknownNames))]
    public void LeftAuth_UnknownName_Refused(string name)
    {
        var result = Validate(new PolicyRule { LeftSource = ConditionSource.AUTH, LeftOperand = name, RightSource = ConditionSource.STATIC_VALUE, StaticValue = "x" });
        ShouldRefuse(result, nameof(PolicyRule.LeftOperand), name);
    }

    [Theory]
    [MemberData(nameof(AcceptedNames))]
    public void RightAuth_AcceptedName_Passes(string name)
    {
        Validate(new PolicyRule { LeftSource = ConditionSource.SCHEMA_FIELD, LeftOperand = "OwnerId", RightSource = ConditionSource.AUTH, RightOperand = name })
            .IsValid.Should().BeTrue();
    }

    [Theory]
    [MemberData(nameof(UnknownNames))]
    public void RightAuth_UnknownName_Refused(string name)
    {
        var result = Validate(new PolicyRule { LeftSource = ConditionSource.SCHEMA_FIELD, LeftOperand = "OwnerId", RightSource = ConditionSource.AUTH, RightOperand = name });
        ShouldRefuse(result, nameof(PolicyRule.RightOperand), name);
    }

    [Fact]
    public void SchemaFieldOperands_AreNotCheckedAgainstAuthNames()
    {
        Validate(new PolicyRule
        {
            LeftSource = ConditionSource.SCHEMA_FIELD, LeftOperand = "Department",
            RightSource = ConditionSource.SCHEMA_FIELD, RightOperand = "orgId", RightOperands = ["OwnerId", "CreatedBy"]
        }).IsValid.Should().BeTrue();

        Validate(new PolicyRule
        {
            LeftSource = ConditionSource.AUTH, LeftOperand = "UserId",
            RightSource = ConditionSource.SCHEMA_FIELD, RightOperands = ["OwnerId", "CreatedBy"]
        }).IsValid.Should().BeTrue();
    }

    [Theory]
    [MemberData(nameof(AcceptedNames))]
    public void StaticTokenExpression_AcceptedName_Passes(string name)
    {
        foreach (var context in new[] { "token", "Token", "auth", "AUTH" })
        {
            Validate(new PolicyRule { LeftOperand = "OwnerId", StaticValue = $"{{{{{context}.{name}}}}}" })
                .IsValid.Should().BeTrue($"{{{{{context}.{name}}}}} resolves at runtime");
        }
    }

    [Theory]
    [MemberData(nameof(UnknownNames))]
    public void StaticTokenExpression_UnknownName_Refused(string name)
    {
        var result = Validate(new PolicyRule { LeftOperand = "OwnerId", StaticValue = $"{{{{token.{name}}}}}" });
        ShouldRefuse(result, nameof(PolicyRule.StaticValue), name);

        var authResult = Validate(new PolicyRule { LeftOperand = "OwnerId", StaticValue = $"{{{{auth.{name}}}}}" });
        ShouldRefuse(authResult, nameof(PolicyRule.StaticValue), name);
    }

    [Fact]
    public void StaticTokenExpression_OrgId_Refused()
    {
        var result = Validate(new PolicyRule { LeftOperand = "OrganizationId", StaticValue = "{{token.orgId}}" });
        ShouldRefuse(result, nameof(PolicyRule.StaticValue), "orgId");
    }

    [Theory]
    [InlineData("{{Schema.Anything}}")]
    [InlineData("{{record.orgId}}")]
    [InlineData("plain text")]
    [InlineData("{{token.orgId")]
    [InlineData("")]
    public void StaticValue_WithoutAuthExpression_NotChecked(string value)
    {
        Validate(new PolicyRule { LeftOperand = "OwnerId", StaticValue = value }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void StaticValue_OnlyFirstExpressionIsChecked_LikeTheRuntime()
    {
        Validate(new PolicyRule { LeftOperand = "OwnerId", StaticValue = "{{token.UserId}} {{token.orgId}}" })
            .IsValid.Should().BeTrue();
        Validate(new PolicyRule { LeftOperand = "OwnerId", StaticValue = "{{Schema.X}} {{token.orgId}}" })
            .IsValid.Should().BeTrue();

        var result = Validate(new PolicyRule { LeftOperand = "OwnerId", StaticValue = "{{token.orgId}} {{token.UserId}}" });
        ShouldRefuse(result, nameof(PolicyRule.StaticValue), "orgId");
    }

    [Fact]
    public void StaticValue_NonString_NotChecked()
    {
        Validate(new PolicyRule { LeftOperand = "Roles", StaticValue = new object?[] { "{{token.orgId}}", "admin" } }).IsValid.Should().BeTrue();
        Validate(new PolicyRule { LeftOperand = "Count", StaticValue = 5L }).IsValid.Should().BeTrue();
        Validate(new PolicyRule { LeftOperand = "Active", StaticValue = true }).IsValid.Should().BeTrue();
        Validate(new PolicyRule { LeftOperand = "Field", StaticValue = null }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void StaticValue_FromJsonRequest_IsChecked()
    {
        var refused = JsonSerializer.Deserialize<PolicyRule>("""{"LeftOperand":"OwnerId","StaticValue":"{{token.orgId}}"}""")!;
        ShouldRefuse(Validate(refused), nameof(PolicyRule.StaticValue), "orgId");

        var accepted = JsonSerializer.Deserialize<PolicyRule>("""{"LeftOperand":"OwnerId","StaticValue":"{{token.UserId}}"}""")!;
        Validate(accepted).IsValid.Should().BeTrue();

        var array = JsonSerializer.Deserialize<PolicyRule>("""{"LeftOperand":"Roles","StaticValue":["{{token.orgId}}"]}""")!;
        Validate(array).IsValid.Should().BeTrue();
    }

    [Fact]
    public void StaticValue_StringJsonElement_IsChecked()
    {
        PolicyAuthNames.StaticValueAuthName(JsonDocument.Parse("\"{{token.orgId}}\"").RootElement).Should().Be("orgId");
        PolicyAuthNames.StaticValueAuthName(JsonDocument.Parse("[\"{{token.orgId}}\"]").RootElement).Should().BeNull();
    }

    [Fact]
    public void NestedGroup_UnknownName_Refused()
    {
        var group = new PolicyRuleGroup
        {
            Rules = [new() { LeftSource = ConditionSource.AUTH, LeftOperand = "UserId", StaticValue = "x" }],
            NestedGroups =
            [
                new()
                {
                    NestedGroups =
                    [
                        new() { Rules = [new() { LeftSource = ConditionSource.SCHEMA_FIELD, LeftOperand = "OwnerId", RightSource = ConditionSource.AUTH, RightOperand = "orgId" }] }
                    ]
                }
            ]
        };

        var result = new PolicyRuleGroupValidator().Validate(group);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e => e.ErrorMessage.StartsWith(UnknownPrefix));
    }

    [Fact]
    public void CreatePolicy_UnknownName_Refused()
    {
        var request = new CreateDataAccessPolicyRequest
        {
            PolicyName = "P1",
            SchemaName = "Person",
            SchemaId = "id-1",
            RuleGroup = new PolicyRuleGroup
            {
                Rules = [new() { LeftSource = ConditionSource.SCHEMA_FIELD, LeftOperand = "OrganizationId", StaticValue = "{{token.orgId}}" }]
            }
        };
        var validator = new CreateDataAccessPolicyRequestValidator();
        validator.Validate(request).Errors.Should().ContainSingle(e => e.ErrorMessage.StartsWith(UnknownPrefix));

        request.RuleGroup.Rules[0].StaticValue = "{{token.OrganizationId}}";
        validator.Validate(request).IsValid.Should().BeTrue();
    }

    [Fact]
    public void UpdatePolicy_UnknownName_Refused()
    {
        var request = new UpdateDataAccessPolicyRequest
        {
            ItemId = "1",
            RuleGroup = new PolicyRuleGroup
            {
                Rules = [new() { LeftSource = ConditionSource.AUTH, LeftOperand = "orgId", StaticValue = "x" }]
            }
        };
        var validator = new UpdateDataAccessPolicyRequestValidator();
        validator.Validate(request).Errors.Should().ContainSingle(e => e.ErrorMessage.StartsWith(UnknownPrefix));

        request.RuleGroup.Rules[0].LeftOperand = "Organization";
        validator.Validate(request).IsValid.Should().BeTrue();
    }
}
