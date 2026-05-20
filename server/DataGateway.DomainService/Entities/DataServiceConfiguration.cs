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
    public string ProjectKey { get; set; } = string.Empty;
    public string ProjectShortKey { get; set; } = string.Empty;

}