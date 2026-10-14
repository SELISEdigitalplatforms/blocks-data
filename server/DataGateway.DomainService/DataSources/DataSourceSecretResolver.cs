using Blocks.Genesis;
using Blocks.Secrets;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.DataSources;

/// <summary>
/// The data source of a project could not be reached: its secret could not be read, or its client
/// could not be built. The request fails closed (never the Blocks tenant DB). The message is the inner
/// exception's own message (as today's raw errors), except for a client build error, which carries
/// <see cref="ClientBuildMessage"/> because the driver's parse text holds the whole connection string.
/// </summary>
public sealed class DataSourceUnavailableException : Exception
{
    public const string ClientBuildMessage = "The data source of this project is not available.";

    public DataSourceUnavailableException(string message, Exception? innerException = null)
        : base(message, innerException)
    {
    }

    /// <summary>The secret exception behind this failure, when there is one.</summary>
    public SecretException? SecretError => InnerException as SecretException;
}

/// <summary>Reads data-source secrets through Blocks Secrets (data SPEC1 §3.5.3).</summary>
public interface IDataSourceSecretResolver
{
    /// <summary>
    /// Returns the value of <paramref name="secretId"/> in <paramref name="tenantId"/>. A null, empty or
    /// <c>"default"</c> id is returned as is (no secret call). The caller must not store the result.
    /// </summary>
    /// <exception cref="DataSourceUnavailableException">Any failure (fail closed).</exception>
    Task<string?> ResolveAsync(string tenantId, string? secretId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Runs one secret operation (metadata read, set, rotate, delete, find) in a new scope and in the
    /// service context of <paramref name="tenantId"/>. Exceptions pass through unchanged.
    /// </summary>
    Task<T> ExecuteAsync<T>(string tenantId, Func<ISecretService, Task<T>> operation, string? serviceUserId = null);
}

/// <summary>
/// Singleton. Per call: a new DI scope (<see cref="ISecretService"/> is scoped) and
/// <c>BlocksContext.ExecuteInContext(serviceContext)</c> with <c>isAuthenticated: true</c> and the tenant
/// (Blocks.Secrets refuses any other context). On an authenticated HTTP request Genesis prefers the real
/// caller (same tenant). Holds NO value cache: no Redis client, no field keeps a value.
/// </summary>
public sealed class DataSourceSecretResolver : IDataSourceSecretResolver
{
    public const string ServiceUserId = "blocks-data-datasource";
    public const string DefaultSentinel = "default";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DataSourceSecretResolver> _logger;

    public DataSourceSecretResolver(IServiceScopeFactory scopeFactory, ILogger<DataSourceSecretResolver> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    /// <summary>"default" in any case (as today's <c>StringHelper.IsNullOrWhiteSpaceOrDefault</c>): the Blocks DB.</summary>
    public static bool IsDefault(string? value) =>
        string.Equals(value, DefaultSentinel, StringComparison.OrdinalIgnoreCase);

    public static bool IsSentinel(string? secretId) =>
        string.IsNullOrEmpty(secretId) || IsDefault(secretId);

    public async Task<string?> ResolveAsync(string tenantId, string? secretId, CancellationToken cancellationToken = default)
    {
        if (IsSentinel(secretId))
            return secretId;

        try
        {
            return await ExecuteAsync(tenantId, s => s.GetValueAsync(secretId!, cancellationToken)).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("[dsc] secret-read-failed tenant={TenantId} secret={SecretId} error={ErrorType}",
                tenantId, secretId, ex.GetType().Name);
            throw new DataSourceUnavailableException(ex.Message, ex);
        }
    }

    public async Task<T> ExecuteAsync<T>(string tenantId, Func<ISecretService, Task<T>> operation, string? serviceUserId = null)
    {
        ArgumentNullException.ThrowIfNull(operation);
        using var scope = _scopeFactory.CreateScope();
        var secretService = scope.ServiceProvider.GetRequiredService<ISecretService>();
        return await BlocksContext.ExecuteInContext(
            BuildServiceContext(tenantId, serviceUserId ?? ServiceUserId),
            () => operation(secretService)).ConfigureAwait(false);
    }

    public static BlocksContext BuildServiceContext(string tenantId, string serviceUserId) =>
        BlocksContext.Create(
            tenantId: tenantId,
            roles: [],
            userId: serviceUserId,
            isAuthenticated: true,
            requestUri: string.Empty,
            organizationId: "default",
            expireOn: DateTime.UtcNow.AddMinutes(5),
            email: string.Empty,
            permissions: [],
            userName: serviceUserId,
            phoneNumber: string.Empty,
            displayName: serviceUserId,
            oauthToken: string.Empty,
            originalTenantId: tenantId);
}
