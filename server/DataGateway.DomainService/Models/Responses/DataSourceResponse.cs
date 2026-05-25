using System;

namespace DataGateway.DomainService.Models;

public class DataSourceResponse
{
    public string DbConnectionString { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = string.Empty;
    public string ProjectKey { get; set; } = string.Empty;
    public string ProjectShortKey { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public string? ItemId { get; set; } = default!;

}
