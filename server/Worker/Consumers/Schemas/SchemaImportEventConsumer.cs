using Blocks.Genesis;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Notifications;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using DomainService.Storage;
using Storage.DomainService.Services;
using System.Text;
using System.Text.Json;

namespace Worker.Consumers;

public class SchemaImportEventConsumer : IConsumer<SchemaImportEvent>
{
    private readonly ISchemaImportService _schemaImportService;
    private readonly IFileManagementService _fileManagementService;
    private readonly IBuiltInNotificationSender _notificationSender;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SchemaImportEventConsumer> _logger;

    public SchemaImportEventConsumer(
        ISchemaImportService schemaImportService,
        IFileManagementService fileManagementService,
        IBuiltInNotificationSender notificationSender,
        IHttpClientFactory httpClientFactory,
        ILogger<SchemaImportEventConsumer> logger)
    {
        _schemaImportService = schemaImportService;
        _fileManagementService = fileManagementService;
        _notificationSender = notificationSender;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task Consume(SchemaImportEvent @event)
    {
        _logger.LogInformation("Consuming schema import event for fileId: {FileId}, projectKey: {ProjectKey}", @event.FileId, @event.ProjectKey);

        var isSuccess = false;
        var importedCount = 0;
        // Only validation messages reach the user; any other failure sends none, never exception text.
        IReadOnlyList<string> errors = [];

        try
        {
            var (jsonBytes, _) = await DownloadFromStorageAsync(@event.FileId, @event.ProjectKey);
            importedCount = await _schemaImportService.ProcessImportAsync(@event, jsonBytes);
            isSuccess = true;
        }
        catch (SchemaImportValidationException ex)
        {
            _logger.LogWarning(ex, "Schema import rejected by validation for fileId={FileId}, projectKey={ProjectKey}: {ErrorCount} errors", @event.FileId, @event.ProjectKey, ex.Errors.Count);
            errors = ex.Errors;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Schema import failed for fileId={FileId}, projectKey={ProjectKey}", @event.FileId, @event.ProjectKey);
            isSuccess = false;
        }
        finally
        {
            await SendNotificationAsync(isSuccess, @event, importedCount, errors);
        }

        _logger.LogInformation("Schema import event consumed for fileId: {FileId}, success: {IsSuccess}", @event.FileId, isSuccess);
    }

    private async Task<(byte[] JsonBytes, string FileName)> DownloadFromStorageAsync(string fileId, string projectKey)
    {
        var fileResponse = await _fileManagementService.GetUrlForDownloadFileAsync(new GetFileRequest
        {
            FileId = fileId,
        });

        if (fileResponse == null || string.IsNullOrEmpty(fileResponse.Url))
        {
            _logger.LogError("DownloadFromStorageAsync: File not found in storage for fileId={FileId}", fileId);
            throw new InvalidOperationException($"File not found in storage for fileId={fileId}");
        }

        var httpClient = _httpClientFactory.CreateClient();
        var jsonBytes = await httpClient.GetByteArrayAsync(fileResponse.Url);

        _logger.LogInformation("DownloadFromStorageAsync: Downloaded {Bytes} bytes for fileId={FileId}", jsonBytes.Length, fileId);
        return (jsonBytes, fileResponse.Name ?? fileId);
    }

    private Task SendNotificationAsync(bool isSuccess, SchemaImportEvent importEvent, int importedCount, IReadOnlyList<string> errors) =>
        _notificationSender.SendAsync(new BuiltInNotification(
            importEvent.CallerTenantId ?? string.Empty,
            "schema-import",
            new List<string> { importEvent.CallerUserId ?? string.Empty },
            new
            {
                IsSuccess = isSuccess,
                importEvent.FileId,
                ImportedSchemaCount = importedCount,
                Errors = errors.ToArray(),
                CorrelationId = importEvent.MessageCoRelationId,
                title = "Schema Import Completed",
                description = isSuccess
                    ? $"Schema import completed successfully."
                    : $"Schema import failed"
            },
            ResponseKey: importEvent.MessageCoRelationId,
            ResponseValue: isSuccess.ToString(),
            OrganizationId: importEvent.CallerOrganizationId));
}
