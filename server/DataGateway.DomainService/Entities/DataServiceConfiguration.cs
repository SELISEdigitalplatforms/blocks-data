using MongoDB.Bson.Serialization.Attributes;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Entities;


/// <summary>
/// Root data-source configuration of a tenant: one doc per tenant in <c>BlocksRootDb.DataServiceConfigurations</c>, <c>_id = TenantId</c>.
/// </summary>
[BsonIgnoreExtraElements]
public class DataServiceConfiguration : GraphQlBaseEntity
{
    /// <summary>
    /// Id of the Blocks <c>Service</c> secret that holds the data-source value: <c>default</c> (Blocks DB) or the
    /// plain connection string. Always set on a root doc (<c>BlocksRootDb.DataServiceConfigurations</c>,
    /// <c>_id = TenantId</c>). The value itself is never stored in this document.
    /// </summary>
    public string DbConnectionSecretId { get; set; } = string.Empty;

    /// <summary>The owning tenant; equals <c>_id</c> on a root doc.</summary>
    public string TenantId { get; set; } = string.Empty;
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
