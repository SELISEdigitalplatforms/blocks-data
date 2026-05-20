using Blocks.Genesis;
using DataGateway.DomainService.Entities;

namespace DataGateway.DomainService.Models;

public class UpdateDataAccessPolicyRequest : IProjectKey
{
    public string ItemId { get; set; } = string.Empty;
    public string? PolicyName { get; set; }
    public string? PolicyDescription { get; set; }
    public string[]? FieldNames { get; set; }
    public string ProjectKey { get; set; } = string.Empty;

    /// <summary>
    /// The rule group containing policy conditions.
    /// </summary>
    public PolicyRuleGroup? RuleGroup { get; set; }

    /// <summary>
    /// Priority for policy evaluation.
    /// </summary>
    public int? Priority { get; set; }

    /// <summary>
    /// If true, this policy grants access when conditions are met.
    /// </summary>
    public bool? IsAllowPolicy { get; set; }
}