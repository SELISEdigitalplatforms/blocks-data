using Blocks.Genesis;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.PipelinerunBuilders;
using DataGateway.DomainService.Utilities;
using k8s;
using k8s.Autorest;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using System.Text.Json;
using static System.Net.WebRequestMethods;

namespace DataGateway.DomainService.Services;

public class PipelineRunService
{
    private readonly ILogger<PipelineRunService> _logger;
    private readonly IKubernetes _k8sClient;
    private readonly IConfiguration _configuration;
    private readonly ICloudBuildSecret _cloudBuildSecret;

    public PipelineRunService(
        ILogger<PipelineRunService> logger,
        IKubernetes k8sClient,
        IConfiguration configuration,
        ICloudBuildSecret cloudBuildSecret)
    {
        _logger = logger;
        _k8sClient = k8sClient;
        _configuration = configuration;
        _cloudBuildSecret = cloudBuildSecret;
    }

    private async Task<object?> SubmitKubernetesAsync(object resourceObject, string group, string version, string namespaceName, string plural)
    {
        try
        {
            var result = await _k8sClient.CustomObjects.CreateNamespacedCustomObjectAsync(
                resourceObject,
                group: group,
                version: version,
                namespaceParameter: namespaceName,
                plural: plural);

            Console.WriteLine(
                $"Kubernetes resource created successfully [Group={group}, Version={version}, Namespace={namespaceName}, Kind={plural}]");

            return result;
        }
        catch (HttpOperationException httpEx)
        {
            var message = KubernetesApiErrorHandler.HandleKubernetesError(httpEx, _logger);
            Console.WriteLine($"Kubernetes API operation failed: {message}. Exception: {httpEx}");
            return null;
        }
        catch (Exception ex)
        {
            var message = KubernetesApiErrorHandler.HandleGeneralError(ex, _logger);
            Console.WriteLine($"{ex} General error submitting to Kubernetes: {message}");
            return null;
        }
    }

    public virtual async Task<string?> CreateDataGetwayInstance(string version, string projectKey, string clusterNames, string projectName, string tenantId)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_cloudBuildSecret?.SeliseGithubPat))
            {
                Console.WriteLine($"ERROR: SeliseGithubPat secret is not configured or is empty. Cannot proceed with DataGateway instance creation for project: {projectKey}");
                return null;
            }

            var accessToken = _cloudBuildSecret.SeliseGithubPat;
            var yamlPath = UdsConstants.DATAGETWAY_YAML_PATH;
            var metadataName = StringFormatterService.Truncate($"uds-config-run-{projectKey}-{version}-{Guid.NewGuid().ToString("N")}", 63);
            var revision = _configuration["DatagatewayClusterRevision"] ?? "dev";

            Console.WriteLine($"Creating pipeline run with metadataName: {metadataName}, version: {version}, projectKey: {projectKey}, clusterNames: {clusterNames}, tenantId: {tenantId}");

            var pipelineRunData = DataGatewayPipelineBuilder
                .FromYamlFile(yamlPath)
                .SetMetadataName(metadataName)
                .SetVersion(version)
                .SetProjectKey(projectKey)
                .SetClusterNames(clusterNames)
                .SetRepoUrl(accessToken)
                .SetRevision(revision)
                .SetTenantId(tenantId)
                .Build();

            var result = await SubmitKubernetesAsync(
                pipelineRunData,
                group: "tekton.dev",
                version: "v1beta1",
                namespaceName: UdsConstants.NAMESPACE_NAME,
                plural: "pipelineruns");

            return result is not null ? metadataName : null;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Unexpected error during DataGateway instance creation: {ex.Message}");
            return null;
        }
    }

    public virtual async Task<PipelineRunStatus?> GetPipelineRunStatusAsync(string pipelineRunName, string namespaceName)
    {
        Console.WriteLine($"Retrieving PipelineRun status for: {pipelineRunName} in namespace: {namespaceName}");
        try
        {
            var pipelineRun = await _k8sClient.CustomObjects.GetNamespacedCustomObjectAsync(
                group: "tekton.dev",
                version: "v1",
                namespaceParameter: namespaceName,
                plural: "pipelineruns",
                name: pipelineRunName);

            var jsonString = JsonSerializer.Serialize(pipelineRun);
            var pipelineRunJObject = JObject.Parse(jsonString);
            return ParsePipelineRunStatus(pipelineRunJObject);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to get PipelineRun status: {ex.Message}");
            await Task.Delay(5000);
            return null;
        }
    }

    private PipelineRunStatus ParsePipelineRunStatus(JObject pipelineRun)
    {
        if (pipelineRun["status"] is not JObject status)
        {
            Console.WriteLine("'status' field not found in PipelineRun.");
            return null;
        }

        var result = new PipelineRunStatus { TaskRuns = new List<TaskRunInfo>() };

        if (status.ContainsKey("taskRuns"))
        {
            var taskRuns = (JObject)status["taskRuns"];
            foreach (var taskRun in taskRuns)
            {
                var taskRunData = taskRun.Value as JObject;
                result.TaskRuns.Add(new TaskRunInfo
                {
                    Name = taskRun.Key,
                    TaskName = taskRunData?["pipelineTaskName"]?.ToString() ?? "unknown",
                    Status = taskRunData?["status"]?.ToString() ?? "unknown"
                });
            }
        }
        else if (status.ContainsKey("childReferences"))
        {
            var childReferences = (JArray)status["childReferences"];
            foreach (var childRef in childReferences.OfType<JObject>())
            {
                if (childRef["kind"]?.ToString() == "TaskRun")
                {
                    result.TaskRuns.Add(new TaskRunInfo
                    {
                        Name = childRef["name"]?.ToString(),
                        TaskName = childRef["pipelineTaskName"]?.ToString() ?? "unknown"
                    });
                }
            }

            var condition = (status["conditions"] as JArray)?.FirstOrDefault() as JObject;
            if (condition != null)
            {
                var conditionStatus = condition["status"]?.ToString();
                var reason = condition["reason"]?.ToString();
                result.Status = conditionStatus switch
                {
                    "True" => "Succeeded",
                    "False" => "Failed",
                    _ => reason ?? "Running"
                };
                result.Reason = reason;
            }
        }

        return result;
    }

    public virtual async Task DeletePipelineRunAsync(string pipelineRunName)
    {
        Console.WriteLine($"Deleting Pipeline {pipelineRunName}.");
        try
        {
            await _k8sClient.CustomObjects.DeleteNamespacedCustomObjectAsync(
                group: "tekton.dev",
                version: "v1beta1",
                namespaceParameter: UdsConstants.NAMESPACE_NAME,
                plural: "pipelineruns",
                name: pipelineRunName);

            Console.WriteLine($"PipelineRun '{pipelineRunName}' deleted successfully");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error deleting PipelineRun: {ex.Message}");
        }
    }
}