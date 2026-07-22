using Blocks.Genesis;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Services;
using DomainService.Storage;
using Storage.DomainService.Services;
using System.Text;
using System.Text.Json;

namespace Worker.Consumers;

public class SchemaImportEventConsumer : IConsumer<SchemaImportEvent>
{
    private readonly ISchemaImportService _schemaImportService;
    private readonly IFileManagementService _fileManagementService;
    private readonly ICryptoService _cryptoService;
    private readonly ITenants _tenants;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SchemaImportEventConsumer> _logger;

    public SchemaImportEventConsumer(
        ISchemaImportService schemaImportService,
        IFileManagementService fileManagementService,
        ICryptoService cryptoService,
        ITenants tenants,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ILogger<SchemaImportEventConsumer> logger)
    {
        _schemaImportService = schemaImportService;
        _fileManagementService = fileManagementService;
        _cryptoService = cryptoService;
        _tenants = tenants;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task Consume(SchemaImportEvent @event)
    {
        _logger.LogInformation("Consuming schema import event for fileId: {FileId}, projectKey: {ProjectKey}", @event.FileId, @event.ProjectKey);

        var isSuccess = false;
        var importedCount = 0;
        var errorMessage = string.Empty;

        try
        {
            var (jsonBytes, _) = await DownloadFromStorageAsync(@event.FileId, @event.ProjectKey);
            importedCount = await _schemaImportService.ProcessImportAsync(@event, jsonBytes);
            isSuccess = true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Schema import failed for fileId={FileId}, projectKey={ProjectKey}", @event.FileId, @event.ProjectKey);
            isSuccess = false;
        }
        finally
        {
            await SendNotificationAsync(isSuccess, @event, importedCount);
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

    private async Task SendNotificationAsync(bool isSuccess, SchemaImportEvent importEvent, int importedCount)
    {
        var url = _configuration["NotificationServiceUrl"];
        if (string.IsNullOrEmpty(url))
        {
            _logger.LogWarning("SendNotificationAsync: NotificationServiceUrl is not configured");
            return;
        }

        var callerTenantId = importEvent.CallerTenantId ?? string.Empty;
        var salt = _tenants.GetTenantByID(callerTenantId)?.TenantSalt;
        if (string.IsNullOrEmpty(callerTenantId) || string.IsNullOrEmpty(salt))
        {
            _logger.LogWarning("SendNotificationAsync: CallerTenantId or TenantSalt is not available — notification skipped for fileId={FileId}", importEvent.FileId);
            return;
        }

        var secret = _cryptoService.Hash(callerTenantId, salt);

        var payload = new
        {
            ConnectionId = importEvent.MessageCoRelationId,
            Roles = new List<string>(),
            UserIds = new List<string> { importEvent.CallerUserId ?? string.Empty },
            DenormalizedPayload = JsonSerializer.Serialize(new
            {
                IsSuccess = isSuccess,
                importEvent.FileId,
                ImportedSchemaCount = importedCount,
                title = "Schema Import Completed",
                description = isSuccess
                    ? $"Schema import completed successfully."
                    : $"Schema import failed"
            }),
            SaveDenormalizedPayloadAsAnObject = false,
            ConfigurationName = "schema-import",
            ContentAvailable = true,
            ResponseKey = importEvent.MessageCoRelationId,
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
                _logger.LogInformation("SendNotificationAsync: Notification sent for fileId={FileId}", importEvent.FileId);
            else
                _logger.LogError("SendNotificationAsync: Notification failed for fileId={FileId}, status={Status}", importEvent.FileId, response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SendNotificationAsync: Error sending notification for fileId={FileId}", importEvent.FileId);
        }
    }
}
