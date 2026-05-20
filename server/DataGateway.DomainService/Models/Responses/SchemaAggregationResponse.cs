namespace DataGateway.DomainService.Models.Responses;

public class SchemaAccessLevelCounts
{
    public long Public { get; set; }
    public long User { get; set; }
    public long Custom { get; set; }
}

public class SchemaAggregationResponse
{
    public SchemaAccessLevelCounts Read { get; set; } = new();
    public SchemaAccessLevelCounts Write { get; set; } = new();
    public SchemaAccessLevelCounts Edit { get; set; } = new();
    public SchemaAccessLevelCounts Delete { get; set; } = new();
    public long TotalPublicPermission { get; set; }
    public long TotalUserPermission { get; set; }
    public long TotalCustomPermission { get; set; }
}
