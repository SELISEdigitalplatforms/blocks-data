using System.Net;
using k8s.Autorest;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Utilities;

public static class KubernetesApiErrorHandler
{
    public static string HandleKubernetesError(HttpOperationException httpEx, ILogger logger)
    {
        var statusCode = httpEx.Response?.StatusCode;
        var content = httpEx.Response?.Content;

        string message = statusCode switch
        {
            HttpStatusCode.BadRequest => $"Bad Request (400): Invalid specification. Details: {content}",
            HttpStatusCode.Unauthorized => "Unauthorized (401): Invalid or missing credentials.",
            HttpStatusCode.Forbidden => "Forbidden (403): Insufficient permissions to create resource.",
            HttpStatusCode.NotFound => "Not Found (404): Resource or CRDs not found.",
            HttpStatusCode.Conflict => "Conflict (409): Resource with the same name already exists.",
            HttpStatusCode.UnprocessableEntity => "Unprocessable Entity (422): Validation error in specification.",
            HttpStatusCode.InternalServerError => "Internal Server Error (500): Kubernetes API failure.",
            HttpStatusCode.ServiceUnavailable => "Service Unavailable (503): API temporarily unavailable.",
            _ => $"Unexpected Kubernetes error ({statusCode}): {content}"
        };

        logger.LogError(httpEx, "Kubernetes API error: {Message}", message);
        return message;
    }

    public static string HandleGeneralError(Exception ex, ILogger logger)
    {
        string message = ex switch
        {
            TaskCanceledException => "Request timeout: operation took too long.",
            HttpRequestException => $"Network error: {ex.Message}",
            _ => $"Unexpected error: {ex.Message}"
        };

        logger.LogError(ex, "Unhandled exception: {Message}", message);
        return message;
    }
}
