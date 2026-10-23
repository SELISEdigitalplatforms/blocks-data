using System.Text;
using System.Text.Json;
using Blocks.Genesis;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Notifications;

/// <summary>One notification for the Notifier: the config to use, who gets it and the short payload.</summary>
/// <param name="TenantId">The tenant where the action happened; it signs the call.</param>
/// <param name="ConfigurationName">Name of the built-in notification config.</param>
/// <param name="UserIds">Recipients. Empty means nothing is sent.</param>
/// <param name="Payload">Ids and short text only. Serialized as it is.</param>
/// <param name="ConnectionId">Optional live connection to answer (export and import use it).</param>
/// <param name="ResponseKey">Optional response key.</param>
/// <param name="ResponseValue">Optional response value.</param>
public sealed record BuiltInNotification(
    string TenantId,
    string ConfigurationName,
    IReadOnlyList<string> UserIds,
    object Payload,
    string? ConnectionId = null,
    string? ResponseKey = null,
    string? ResponseValue = null);

/// <summary>Sends a built-in notification to the Notifier. Best effort: never throws.</summary>
public interface IBuiltInNotificationSender
{
    /// <returns>True when the Notifier accepted the call.</returns>
    Task<bool> SendAsync(BuiltInNotification notification);
}

/// <inheritdoc />
public sealed class BuiltInNotificationSender : IBuiltInNotificationSender
{
    /// <summary>Config key that holds the Notifier URL.</summary>
    public const string UrlConfigKey = "NotificationServiceUrl";

    /// <summary>Longest wait for the Notifier.</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ITenants _tenants;
    private readonly ICryptoService _cryptoService;
    private readonly ILogger<BuiltInNotificationSender> _logger;

    public BuiltInNotificationSender(
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ITenants tenants,
        ICryptoService cryptoService,
        ILogger<BuiltInNotificationSender> logger)
    {
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _tenants = tenants;
        _cryptoService = cryptoService;
        _logger = logger;
    }

    /// <summary>The non-empty user ids, without duplicates.</summary>
    public static List<string> Recipients(params string?[] userIds) =>
        userIds.Where(u => !string.IsNullOrWhiteSpace(u)).Select(u => u!).Distinct(StringComparer.Ordinal).ToList();

    public async Task<bool> SendAsync(BuiltInNotification notification)
    {
        var name = notification.ConfigurationName;
        var tenantId = notification.TenantId ?? string.Empty;
        try
        {
            if (notification.UserIds.Count == 0)
            {
                _logger.LogDebug("Notification {ConfigurationName} skipped for tenant {TenantId}: no recipient", name, tenantId);
                return false;
            }

            var url = _configuration[UrlConfigKey];
            if (string.IsNullOrEmpty(url))
            {
                _logger.LogWarning("Notification {ConfigurationName} skipped for tenant {TenantId}: {Key} is not configured", name, tenantId, UrlConfigKey);
                return false;
            }

            var salt = string.IsNullOrEmpty(tenantId) ? null : _tenants.GetTenantByID(tenantId)?.TenantSalt;
            if (string.IsNullOrEmpty(salt))
            {
                _logger.LogWarning("Notification {ConfigurationName} skipped for tenant {TenantId}: tenant or salt not available", name, tenantId);
                return false;
            }

            var body = new
            {
                ConnectionId = notification.ConnectionId,
                Roles = new List<string>(),
                UserIds = notification.UserIds,
                DenormalizedPayload = JsonSerializer.Serialize(notification.Payload),
                SaveDenormalizedPayloadAsAnObject = false,
                ConfigurationName = name,
                ContentAvailable = true,
                ResponseKey = notification.ResponseKey,
                ResponseValue = notification.ResponseValue
            };

            using var cts = new CancellationTokenSource(Timeout);
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
            };
            request.Headers.TryAddWithoutValidation("x-blocks-key", tenantId);
            request.Headers.TryAddWithoutValidation("Secret", _cryptoService.Hash(tenantId, salt) ?? string.Empty);

            var response = await _httpClientFactory.CreateClient().SendAsync(request, cts.Token);
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Notification {ConfigurationName} sent for tenant {TenantId}", name, tenantId);
                return true;
            }

            _logger.LogWarning("Notification {ConfigurationName} failed for tenant {TenantId}, status={Status}", name, tenantId, (int)response.StatusCode);
            return false;
        }
        catch (Exception ex)
        {
            // Only the type is logged: a message could hold request details.
            _logger.LogWarning("Notification {ConfigurationName} failed for tenant {TenantId}, error={ErrorType}", name, tenantId, ex.GetType().Name);
            return false;
        }
    }
}
