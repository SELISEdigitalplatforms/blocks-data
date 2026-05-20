using System.Diagnostics;
using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Utilities;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

public class LogRetrievalService : ILogRetrievalService
{
    private readonly PipelineRunService _pipelineRunService;
    private readonly IMessageClient _messageClient;
    private readonly IDataGatewayDeploymentRepository _dataGatewayDeploymentRepository;

    public LogRetrievalService(
        PipelineRunService pipelineRunService,
        IMessageClient messageClient,
        IDataGatewayDeploymentRepository dataGatewayDeploymentRepository)
    {
        _pipelineRunService = pipelineRunService;
        _messageClient = messageClient;
        _dataGatewayDeploymentRepository = dataGatewayDeploymentRepository;
    }

    public async Task CheckDataGatewayLog(string pipelineRunName, string tenantId, int? pollingIntervalMs = null, int? maxPollingDurationMs = null)
    {
        var namespaceName = UdsConstants.NAMESPACE_NAME;
        int pollingInterval = pollingIntervalMs ?? 5000;
        int maxPollingDuration = maxPollingDurationMs ?? 1800000;
        var stopwatch = Stopwatch.StartNew();
        int eventFinishedCount = 0;
        int iteration = 0;
        await Task.Delay(pollingInterval);

        while (stopwatch.ElapsedMilliseconds < maxPollingDuration)
        {
            iteration++;
            Console.WriteLine("Iteration {0} for pipeline {1} | Elapsed: {2:F2} minutes",
                iteration, pipelineRunName, stopwatch.Elapsed.TotalMinutes);
            try
            {
                var pipeLineStatus = await _pipelineRunService.GetPipelineRunStatusAsync(pipelineRunName, namespaceName);

                if (pipeLineStatus is null && iteration > 20)
                    break;

                if (pipeLineStatus is null)
                {
                    await Task.Delay(pollingInterval);
                    continue;
                }

                if (PipeLineTaskConstants.TermialStatus.Contains(pipeLineStatus.Status))
                {
                    Console.WriteLine("All tasks reached a terminal state for pipeline {0}. Count {1}.", pipelineRunName, eventFinishedCount);
                    eventFinishedCount++;
                    if (eventFinishedCount > 10)
                    {
                        await _dataGatewayDeploymentRepository.UpdatePipelineStatusAsync(tenantId, pipelineRunName, pipeLineStatus.Status);
                        Console.WriteLine("Stopping polling for pipeline {0}.", pipelineRunName);
                        break;
                    }
                }

                await Task.Delay(pollingInterval);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error polling logs for pipeline {0}: {1}", pipelineRunName, ex.Message);
                await Task.Delay(pollingInterval);
            }
        }

        stopwatch.Stop();

        try
        {
            var postBuildQueue = new PostBuildQueue
            {
                ProjectKey = tenantId,
                PipelineRunName = pipelineRunName,
                PipelineType = PipelineTypes.DataGatewayPipeline,
                PipelineEventType = PipelineEventTypes.DeletePipeLine
            };

            await _messageClient.SendToConsumerAsync(new ConsumerMessage<PostBuildQueue>
            {
                ConsumerName = GraphQlConstant.DataGatewayInitiateQueueName,
                Payload = postBuildQueue,
                SccheduledEnqueueTimeUtc = DateTimeOffset.UtcNow.AddMinutes(60)
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine("Failed to push DeletePipeLine event to queue for pipeline {0}: {1}", pipelineRunName, ex.Message);
        }
    }
}