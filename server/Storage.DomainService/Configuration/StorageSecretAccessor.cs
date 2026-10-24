using Blocks.Genesis;
using Blocks.Secrets;
using Microsoft.Extensions.DependencyInjection;

namespace DomainService.Configuration
{
    /// <summary>Runs SecretStore calls for storage configurations in the service context of one tenant.</summary>
    public interface IStorageSecretAccessor
    {
        /// <summary>
        /// Runs <paramref name="operation"/> in a new DI scope (<see cref="ISecretService"/> is scoped) and in the service
        /// context of <paramref name="tenantId"/>. Exceptions pass through unchanged. Holds no value.
        /// </summary>
        Task<T> ExecuteAsync<T>(string tenantId, Func<ISecretService, Task<T>> operation);
    }

    /// <summary>
    /// Singleton. Same approach as blocks-data <c>DataSourceSecretResolver</c>: per call a new scope and
    /// <c>BlocksContext.ExecuteInContext</c> with an authenticated service context of the tenant (on an authenticated
    /// HTTP request Genesis prefers the real caller, same tenant). No cache of any kind: no field keeps a value.
    /// </summary>
    public sealed class StorageSecretAccessor : IStorageSecretAccessor
    {
        public const string ServiceUserId = "blocks-storage-config";

        private readonly IServiceScopeFactory _scopeFactory;

        public StorageSecretAccessor(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
        }

        public async Task<T> ExecuteAsync<T>(string tenantId, Func<ISecretService, Task<T>> operation)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
            ArgumentNullException.ThrowIfNull(operation);
            using var scope = _scopeFactory.CreateScope();
            var secretService = scope.ServiceProvider.GetRequiredService<ISecretService>();
            return await BlocksContext.ExecuteInContext(BuildServiceContext(tenantId), () => operation(secretService)).ConfigureAwait(false);
        }

        public static BlocksContext BuildServiceContext(string tenantId) =>
            BlocksContext.Create(
                tenantId: tenantId,
                roles: [],
                userId: ServiceUserId,
                isAuthenticated: true,
                requestUri: string.Empty,
                organizationId: "default",
                expireOn: DateTime.UtcNow.AddMinutes(5),
                email: string.Empty,
                permissions: [],
                userName: ServiceUserId,
                phoneNumber: string.Empty,
                displayName: ServiceUserId,
                oauthToken: string.Empty,
                originalTenantId: tenantId);
    }

    /// <summary>
    /// State of the secret a storage configuration points at (same values as blocks-os <c>LinkedSecretStatus</c>).
    /// Read from metadata only, never a value.
    /// </summary>
    public static class StorageSecretStatus
    {
        public const string None = "none";
        public const string Active = "active";
        public const string Locked = "locked";
        public const string Archived = "archived";
        public const string Missing = "missing";
        public const string Unavailable = "unavailable";

        /// <summary>Known dead: a save creates a new secret instead of rotating.</summary>
        public static bool IsBroken(string? status) => status is Archived or Missing;

        public static string FromMetadata(SecretResult? metadata) =>
            metadata is null
                ? Missing
                : metadata.Status switch
                {
                    SecretStatuses.Deleted => Archived,
                    SecretStatuses.Locked => Locked,
                    _ => Active
                };
    }

    /// <summary>
    /// A storage configuration row exists but cannot be used: its secrets could not be read (store down, access
    /// denied). The message never holds a value.
    /// </summary>
    public sealed class StorageConfigurationUnavailableException : Exception
    {
        public StorageConfigurationUnavailableException(string message, Exception? innerException = null)
            : base(message, innerException)
        {
        }
    }
}
