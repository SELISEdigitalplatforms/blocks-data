using System.Text.Json;
using System.Text.RegularExpressions;
using FluentValidation;
using DataGateway.DomainService.Entities;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Validators;

public class PolicyRuleValidator : AbstractValidator<PolicyRule>
{
    public PolicyRuleValidator()
    {
        RuleFor(x => x.LeftSource).IsInEnum();
        RuleFor(x => x.LeftOperand)
            .NotEmpty()
            .MaximumLength(512);
        RuleFor(x => x.LeftOperand)
            .Must(PolicyAuthNames.IsAccepted)
            .When(x => x.LeftSource == ConditionSource.AUTH && !string.IsNullOrEmpty(x.LeftOperand))
            .WithMessage(x => PolicyAuthNames.UnknownMessage(x.LeftOperand));
        RuleFor(x => x.Operator).IsInEnum();
        RuleFor(x => x.RightSource).IsInEnum();
        RuleFor(x => x.RightOperand)
            .MaximumLength(512);
        // With an Auth right side the runtime reads only RightOperand; RightOperands is used
        // only for schema-field right sides, so it is not checked against the Auth names.
        RuleFor(x => x.RightOperand)
            .Must(PolicyAuthNames.IsAccepted)
            .When(x => x.RightSource == ConditionSource.AUTH && !string.IsNullOrEmpty(x.RightOperand))
            .WithMessage(x => PolicyAuthNames.UnknownMessage(x.RightOperand));
        RuleForEach(x => x.RightOperands)
            .NotEmpty()
            .MaximumLength(512);
        RuleFor(x => x.StaticValue)
            .Must(value => PolicyAuthNames.StaticValueAuthName(value) is not { } name || PolicyAuthNames.IsAccepted(name))
            .WithMessage(x => PolicyAuthNames.UnknownMessage(PolicyAuthNames.StaticValueAuthName(x.StaticValue)!));
        RuleFor(x => x.Description)
            .MaximumLength(2000)
            .When(x => x.Description is not null);
    }
}

/// <summary>
/// The Auth value names a data-access policy may use. A policy is evaluated by
/// Blocks.Genesis <c>DataAccessPolicyHelper.GetTokenValue</c>; any other name resolves to
/// nothing at runtime. Keep this list and <see cref="StaticValuePattern"/> in sync with
/// <c>DataAccessPolicyHelper.GetTokenValue</c> and <c>DataAccessPolicyHelper.ExpressionPattern</c>.
/// </summary>
public static class PolicyAuthNames
{
    // Lower-case forms, matched after ToLowerInvariant() exactly as the runtime does.
    private static readonly HashSet<string> Accepted = new(StringComparer.Ordinal)
    {
        "userid", "id", "sub",
        "email",
        "tenantid", "tenant",
        "roles", "role",
        "permissions", "permission",
        "organizationid", "organization",
    };

    /// <summary>Same pattern as the runtime's static-value expression (first match only).</summary>
    private static readonly Regex StaticValuePattern =
        new(@"\{\{(\w+)\.(\w+)\}\}", RegexOptions.Compiled, TimeSpan.FromSeconds(1));

    public static bool IsAccepted(string? name) => name is not null && Accepted.Contains(name.ToLowerInvariant());

    public static string UnknownMessage(string? name) =>
        $"Unknown Auth value '{name}'. Use: UserId, Email, Roles, Permissions, OrganizationId, TenantId.";

    /// <summary>
    /// The Auth name a static value refers to (<c>{{token.X}}</c> or <c>{{auth.X}}</c>),
    /// read the same way the runtime reads it; null when the value is not a string or
    /// its first expression is not an Auth one.
    /// </summary>
    public static string? StaticValueAuthName(object? value)
    {
        var text = value switch
        {
            string s => s,
            JsonElement { ValueKind: JsonValueKind.String } element => element.GetString(),
            _ => null
        };
        if (text is null)
            return null;

        var match = StaticValuePattern.Match(text);
        if (!match.Success)
            return null;

        var context = match.Groups[1].Value.ToLowerInvariant();
        return context is "token" or "auth" ? match.Groups[2].Value : null;
    }
}
