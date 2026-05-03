using DataGateway.DomainService.Entities;
using MongoDB.Bson.Serialization.Attributes;

namespace DataGateway.DomainService.Models.Responses;


[BsonIgnoreExtraElements]
public class DataAccessPolicyResponse
{
    [BsonId]
    public string ItemId { get; set; } = string.Empty;
    public string PolicyName { get; set; } = string.Empty;
    public string PolicyDescription { get; set; } = string.Empty;
    public PolicyType PolicyType { get; set; }
    public PolicyOperation Operation { get; set; }
    public string EntityName { get; set; } = string.Empty;
    public string[] FieldNames { get; set; } = [];
    public string SchemaId { get; set; } = string.Empty;
    public PolicyRuleGroup RuleGroup { get; set; } = new();
    public int Priority { get; set; }
    public bool IsAllowPolicy { get; set; } = true;
}
