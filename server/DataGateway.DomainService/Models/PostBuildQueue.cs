namespace DataGateway.DomainService.Models;

public class PostBuildQueue
{
    public string ProjectKey { get; set; } = string.Empty;
    public string PipelineRunName { get; set; } = string.Empty;
    public PipelineTypes PipelineType { get; set; }
    public PipelineEventTypes PipelineEventType { get; set; }
}