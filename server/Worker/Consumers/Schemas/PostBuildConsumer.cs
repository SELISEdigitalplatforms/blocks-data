using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Services;

namespace Worker.Consumers;

public class PostBuildConsumer : IConsumer<PostBuildQueue>
{
    private readonly ILogger<PostBuildConsumer> _logger;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly PipelineRunService _pipelineRunService;

    public PostBuildConsumer(
        ILogger<PostBuildConsumer> logger,
        IServiceScopeFactory scopeFactory,
        PipelineRunService pipelineRunService)
    {
        _logger = logger;
        _scopeFactory = scopeFactory;
        _pipelineRunService = pipelineRunService;
    }

    public async Task Consume(PostBuildQueue task)
    {
        try
        {
            _logger.LogInformation(
                "Received message from queue for project {ProjectKey}, pipeline {PipelineRunName}, event {PipelineEventType}, pipeline type {PipelineType}",
                task.ProjectKey, task.PipelineRunName, task.PipelineEventType, task.PipelineType);

            using var scope = _scopeFactory.CreateScope();
            var logRetrievalService = scope.ServiceProvider.GetRequiredService<ILogRetrievalService>();

            if (task.PipelineType == PipelineTypes.DataGatewayPipeline)
            {
                switch (task.PipelineEventType)
                {
                    case PipelineEventTypes.RetrieveLog:
                        await logRetrievalService.CheckDataGatewayLog(task.PipelineRunName, task.ProjectKey);
                        break;

                    case PipelineEventTypes.DeletePipeLine:
                        await _pipelineRunService.DeletePipelineRunAsync(task.PipelineRunName);
                        break;

                    default:
                        _logger.LogWarning("Unknown build event type {PipelineEventType} for project {ProjectKey}", task.PipelineEventType, task.ProjectKey);
                        break;
                }
            }
            else
            {
                _logger.LogWarning("Unknown pipeline type {PipelineType} for project {ProjectKey}", task.PipelineType, task.ProjectKey);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process message from queue for project {ProjectKey}, pipeline {PipelineRunName}", task?.ProjectKey, task?.PipelineRunName);
        }
    }
}