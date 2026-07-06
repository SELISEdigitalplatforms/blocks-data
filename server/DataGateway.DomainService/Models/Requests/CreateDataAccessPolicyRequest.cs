using Blocks.Genesis;
using DataGateway.DomainService.Entities;

namespace DataGateway.DomainService.Models;

public class CreateDataAccessPolicyRequest
{
    public string PolicyName { get; set; } = string.Empty;
    public string PolicyDescription { get; set; } = string.Empty;
    public PolicyType PolicyType { get; set; } = PolicyType.RLS;
    public PolicyOperation Operation { get; set; } = PolicyOperation.READ;

    public string SchemaName { get; set; } = string.Empty;
    public string SchemaId { get; set; } = string.Empty;
    public string[] FieldNames { get; set; } = [];

    /// <summary>
    /// The rule group containing policy conditions.
    /// </summary>
    public PolicyRuleGroup RuleGroup { get; set; } = new();

    /// <summary>
    /// Priority for policy evaluation. Higher priority policies are evaluated first.
    /// </summary>
    public int Priority { get; set; } = 0;

    /// <summary>
    /// If true, this policy grants access when conditions are met.
    /// If false, this policy denies access when conditions are met.
    /// </summary>
    public bool IsAllowPolicy { get; set; } = true;
}