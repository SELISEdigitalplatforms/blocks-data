using MongoDB.Bson.Serialization.Attributes;

namespace DataGateway.DomainService.Entities;


/// <summary>
/// Represents the configuration for a data service.
/// </summary>
[BsonIgnoreExtraElements]
public class DataServiceConfiguration : GraphQlBaseEntity
{
    public string DbConnectionString { get; set; } = string.Empty;
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
