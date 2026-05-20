namespace DataGateway.DomainService.Services;

public interface ILogRetrievalService
{
    Task CheckDataGatewayLog(string pipelineRunName, string tenantId, int? pollingIntervalMs = null, int? maxPollingDurationMs = null);
}