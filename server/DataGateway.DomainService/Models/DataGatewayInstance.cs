namespace DataGateway.DomainService.Models;

public class DataGatewayInstance
{
    public string TenantId { get; set; } = string.Empty;
    public string ProjectName { get; set; } = string.Empty;
    public string ProjectGuidId { get; set; } = string.Empty;
    public string PipelineRunName { get; set; } = string.Empty;
    public string Environment { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}