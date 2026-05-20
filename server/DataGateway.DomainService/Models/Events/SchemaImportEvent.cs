namespace DataGateway.DomainService.Models.Events;

public class SchemaImportEvent
{
    public required string FileId { get; set; }
    public required string ProjectKey { get; set; }
    public string? MessageCoRelationId { get; set; }
    public string? CallerUserId { get; set; }
    public string? CallerTenantId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
