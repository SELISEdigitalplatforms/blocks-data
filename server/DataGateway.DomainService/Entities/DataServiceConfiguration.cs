using MongoDB.Bson.Serialization.Attributes;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Entities;


/// <summary>
/// Represents the configuration for a data service.
/// </summary>
[BsonIgnoreExtraElements]
public class DataServiceConfiguration : GraphQlBaseEntity
{
    /// <summary>
    /// Legacy base64 connection string. Kept on tenant copies (old pods decode it); NEVER set on a root doc
    /// (<c>BlocksRootDb</c>, <c>_id = TenantId</c>) and never written by the new code (owner "Stop writing").
    /// </summary>
    [BsonIgnoreIfNull]
    public string? DbConnectionString { get; set; }

    /// <summary>Root doc: id of the Blocks <c>service</c> secret, <c>"default"</c> (Blocks DB), or null (blank).</summary>
    [BsonIgnoreIfNull]
    public string? DbConnectionSecretId { get; set; }

    /// <summary>Root doc: the <c>_id</c> of the tenant copy (the API's <c>ItemId</c>). Tells root docs apart from legacy docs.</summary>
    [BsonIgnoreIfNull]
    public string? ConfigItemId { get; set; }

    /// <summary>Root doc: true once the new code changed or chose the value. Never cleared (no value, a flag).</summary>
    [BsonIgnoreIfNull]
    public bool? ValueChangedAfterDeploy { get; set; }
    public string DatabaseName { get; set; } = string.Empty;
    public bool IsCollectionNameEditable { get; set; }
    public string CollectionNamePattern { get; set; } = "sb_{SchemaName}s";
    public string ProjectKey { get; set; } = string.Empty;
    public string ProjectShortKey { get; set; } = string.Empty;
    public AnalyticsConfiguration? AnalyticsConfiguration { get; set; }

}

public class AnalyticsConfiguration
{
    public bool EnableAnalytics { get; set; }
    public DateTime? EnableDate { get; set; }
    public DateTime? ValidTill { get; set; }

    public bool IsAccessibleAt(DateTime utcNow)
    {
        return EnableAnalytics
               && (!EnableDate.HasValue || utcNow >= EnableDate.Value)
               && ValidTill.HasValue
               && utcNow <= ValidTill.Value;
    }

}
