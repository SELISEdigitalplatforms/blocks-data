using Blocks.Genesis;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Services;
using DomainService.Storage;
using Storage.DomainService.Services;
using System.Text;
using System.Text.Json;

namespace Worker.Consumers;

public class SchemaExportEventConsumer : IConsumer<SchemaExportEvent>
{
    private readonly ISchemaExportService _schemaExportService;
    private readonly IFileManagementService _fileManagementService;
    private readonly ICryptoService _cryptoService;
    private readonly ITenants _tenants;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SchemaExportEventConsumer> _logger;

    public SchemaExportEventConsumer(
        ISchemaExportService schemaExportService,
        IFileManagementService fileManagementService,
        ICryptoService cryptoService,
        ITenants tenants,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ILogger<SchemaExportEventConsumer> logger)
    {
        _schemaExportService = schemaExportService;
        _fileManagementService = fileManagementService;
        _cryptoService = cryptoService;
        _tenants = tenants;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task Consume(SchemaExportEvent @event)
    {
        _logger.LogInformation("Consuming schema export event for fileId: {FileId}, projectKey: {ProjectKey}", @event.FileId, @event.ProjectKey);

        var isSuccess = false;
        var fileName = string.Empty;
        try
        {
            var (jsonBytes, exportFileName) = await _schemaExportService.BuildExportBytesAsync(@event);
            fileName = exportFileName;

            isSuccess = await UploadToStorageAsync(@event.FileId, jsonBytes, fileName, @event.ProjectKey);

            if (isSuccess)
                await _schemaExportService.InsertExportRecordAsync(@event, fileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Schema export failed for fileId={FileId}, projectKey={ProjectKey}", @event.FileId, @event.ProjectKey);
            isSuccess = false;
        }
        finally
        {
            await SendNotificationAsync(isSuccess, @event);
        }

        _logger.LogInformation("Schema export event consumed for fileId: {FileId}, success: {IsSuccess}", @event.FileId, isSuccess);
    }

    private async Task<bool> UploadToStorageAsync(string fileId, byte[] jsonBytes, string fileName, string projectKey)
    {
        using Stream stream = new MemoryStream(jsonBytes);

        var metaData = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["FileName"] = new { Type = "String", Value = fileName },
            ["Report"] = new { Type = "String", Value = "Schema Export Data" }
        });

        var payload = new GetPreSignedUrlForUploadRequest
        {
            ItemId = fileId,
            MetaData = metaData,
            Name = fileName,
            ParentDirectoryId = "Blocks-Schema-Export",
            Tags = "[\"File\"]",
        };

        var fileInfo = await _fileManagementService.GetPerSignedUrlForUploadAsync(payload);
        if (string.IsNullOrEmpty(fileInfo?.UploadUrl))
        {
            _logger.LogError("UploadToStorageAsync: Failed to get pre-signed URL for fileId={FileId}", fileId);
            return false;
        }

        using var request = new HttpRequestMessage(HttpMethod.Put, fileInfo.UploadUrl)
        {
            Content = new StreamContent(stream)
        };
        request.Headers.Add("x-ms-blob-type", "BlockBlob");

        var httpClient = _httpClientFactory.CreateClient();
        var response = await httpClient.SendAsync(request);

        if (response.IsSuccessStatusCode)
            _logger.LogInformation("UploadToStorageAsync: Uploaded successfully fileId={FileId}", fileId);
        else
            _logger.LogError("UploadToStorageAsync: Upload failed for fileId={FileId}, status={Status}", fileId, response.StatusCode);

        return response.IsSuccessStatusCode;
    }

    private async Task SendNotificationAsync(bool isSuccess, SchemaExportEvent exportEvent)
    {
        var url = _configuration["NotificationServiceUrl"];
        if (string.IsNullOrEmpty(url))
        {
            _logger.LogWarning("SendNotificationAsync: NotificationServiceUrl is not configured");
            return;
        }

        var callerTenantId = exportEvent.CallerTenantId ?? string.Empty;
        var salt = _tenants.GetTenantByID(callerTenantId)?.TenantSalt;
        if (string.IsNullOrEmpty(callerTenantId) || string.IsNullOrEmpty(salt))
        {
            _logger.LogWarning("SendNotificationAsync: CallerTenantId or TenantSalt is not available — notification skipped for fileId={FileId}", exportEvent.FileId);
            return;
        }
        var secret = _cryptoService.Hash(callerTenantId, salt);

        var payload = new
        {
            ConnectionId = exportEvent.MessageCoRelationId,
            Roles = new List<string>(),
            UserIds = new List<string> { exportEvent.CallerUserId ?? string.Empty },
            DenormalizedPayload = JsonSerializer.Serialize(new
            {
                IsSuccess = isSuccess,
                exportEvent.FileId,
                title = "Schema Export Completed",
                description = isSuccess ? "Schema export completed successfully." : "Schema export failed."
            }),
            SaveDenormalizedPayloadAsAnObject = false,
            ConfigurationName = "schema-export",
            ContentAvailable = true,
            ResponseKey = exportEvent.MessageCoRelationId,
            ResponseValue = isSuccess.ToString()
        };

        try
        {
            var httpClient = _httpClientFactory.CreateClient();
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(payload),
                    Encoding.UTF8,
                    "application/json")
            };
            request.Headers.TryAddWithoutValidation("x-blocks-key", callerTenantId);
            request.Headers.TryAddWithoutValidation("Secret", secret ?? string.Empty);

            var response = await httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
                _logger.LogInformation("SendNotificationAsync: Notification sent for fileId={FileId}", exportEvent.FileId);
            else
                _logger.LogError("SendNotificationAsync: Notification failed for fileId={FileId}, status={Status}", exportEvent.FileId, response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SendNotificationAsync: Error sending notification for fileId={FileId}", exportEvent.FileId);
        }
    }
}
