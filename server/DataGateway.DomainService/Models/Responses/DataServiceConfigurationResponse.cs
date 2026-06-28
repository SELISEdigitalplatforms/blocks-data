using System;

namespace DataGateway.DomainService.Models;

public class DataServiceConfigurationResponse
{
    public string DbConnectionString { get; set; } = string.Empty;
    public bool IsCollectionNameEditable { get; set; }
    public string CollectionNamePattern { get; set; } = "sb_{SchemaName}s";
    public string DatabaseName { get; set; } = string.Empty;
    public string ProjectKey { get; set; } = string.Empty;
    public string ProjectShortKey { get; set; } = string.Empty;
    public string? ItemId { get; set; } = default!;

}
