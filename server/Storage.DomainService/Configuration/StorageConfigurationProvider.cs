using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using Blocks.Secrets;
using Microsoft.Extensions.Logging;

namespace DomainService.Configuration
{
    /// <summary>
    /// Reads the storage configurations of the caller's tenant: the <c>storage-config:*</c> row first, the old
    /// <c>StorageConfigurations</c> document only when no row exists (until the migration cleanup). Secret values are
    /// read from SecretStore on every call and never cached.
    /// </summary>
    public interface IStorageConfigurationProvider
    {
        /// <summary>
        /// The configuration named <paramref name="name"/> with its secret values, or null when there is none — or when
        /// its row points at a secret that is missing, archived or locked (logged by name and secret id).
        /// </summary>
        /// <exception cref="StorageConfigurationUnavailableException">A secret could not be read (store down, access denied).</exception>
        Task<StorageConfiguration?> GetByNameAsync(string name, CancellationToken cancellationToken = default);

        /// <summary>The first configuration with <paramref name="storageStrategy"/> (same rules as <see cref="GetByNameAsync"/>).</summary>
        Task<StorageConfiguration?> GetByStrategyAsync(string storageStrategy, CancellationToken cancellationToken = default);

        /// <summary>Every usable configuration of the tenant (rows, then old documents without a row).</summary>
        Task<IReadOnlyList<StorageConfiguration>> GetAllAsync(CancellationToken cancellationToken = default);
    }

    public sealed class StorageConfigurationProvider : IStorageConfigurationProvider
    {
        private readonly IKeyValueStore _keyValueStore;
        private readonly IConfigurationRepository _legacy;
        private readonly IStorageSecretAccessor _secrets;
        private readonly ILogger<StorageConfigurationProvider> _logger;

        public StorageConfigurationProvider(
            IKeyValueStore keyValueStore,
            IConfigurationRepository legacy,
            IStorageSecretAccessor secrets,
            ILogger<StorageConfigurationProvider> logger)
        {
            _keyValueStore = keyValueStore;
            _legacy = legacy;
            _secrets = secrets;
            _logger = logger;
        }

        private IStorageSettingsRows Rows => StorageSettingsRows.For(StorageConfigScope.Current, _keyValueStore);

        public async Task<StorageConfiguration?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
        {
            var trimmed = StorageConfigurationKeys.NormalizeName(name);
            if (trimmed.Length == 0)
                return null;

            var row = await Rows.GetAsync(trimmed, cancellationToken).ConfigureAwait(false);
            if (row is not null)
                return await ResolveAsync(row, cancellationToken).ConfigureAwait(false);

            return await _legacy.GetConfigurationByNameAsync(trimmed).ConfigureAwait(false);
        }

        public async Task<StorageConfiguration?> GetByStrategyAsync(string storageStrategy, CancellationToken cancellationToken = default)
        {
            var rows = await Rows.GetAllAsync(cancellationToken).ConfigureAwait(false);
            var row = Ordered(rows).FirstOrDefault(r => string.Equals(r.StorageStrategy, storageStrategy, StringComparison.Ordinal));
            if (row is not null)
                return await ResolveAsync(row, cancellationToken).ConfigureAwait(false);

            // A row is the truth for its name: an old document with the same name is never used.
            var names = RowNames(rows);
            var legacy = await _legacy.GetAllConfigurationsAsync().ConfigureAwait(false);
            return legacy.FirstOrDefault(d =>
                string.Equals(d.StorageStrategy, storageStrategy, StringComparison.Ordinal)
                && !names.Contains(StorageConfigurationKeys.NormalizeName(d.Name)));
        }

        public async Task<IReadOnlyList<StorageConfiguration>> GetAllAsync(CancellationToken cancellationToken = default)
        {
            var rows = await Rows.GetAllAsync(cancellationToken).ConfigureAwait(false);
            var result = new List<StorageConfiguration>();
            foreach (var row in Ordered(rows))
            {
                var resolved = await ResolveAsync(row, cancellationToken).ConfigureAwait(false);
                if (resolved is not null)
                    result.Add(resolved);
            }

            var names = RowNames(rows);
            var legacy = await _legacy.GetAllConfigurationsAsync().ConfigureAwait(false);
            result.AddRange(legacy.Where(d => !names.Contains(StorageConfigurationKeys.NormalizeName(d.Name))));
            return result;
        }

        private static IEnumerable<StorageSettings> Ordered(IEnumerable<StorageSettings> rows) =>
            rows.OrderBy(r => r.CreatedDate).ThenBy(r => r.Name, StringComparer.Ordinal);

        private static HashSet<string> RowNames(IEnumerable<StorageSettings> rows) =>
            rows.Select(r => StorageConfigurationKeys.NormalizeName(r.Name)).ToHashSet(StringComparer.Ordinal);

        /// <summary>
        /// The row as a Genesis configuration with its secret values read now (one SecretStore read per secret, in the
        /// tenant's own context). Missing, archived or locked secret = null; any other failure = exception.
        /// </summary>
        private async Task<StorageConfiguration?> ResolveAsync(StorageSettings row, CancellationToken cancellationToken)
        {
            var tenantId = StorageConfigScope.Current.ResolveTenantId();
            var configuration = row.ToConfiguration();
            foreach (var field in StorageSecretFields.All)
            {
                var secretId = field.GetSecretId(row);
                if (string.IsNullOrEmpty(secretId))
                    continue;

                try
                {
                    var value = await _secrets.ExecuteAsync(tenantId, s => s.GetValueAsync(secretId, cancellationToken)).ConfigureAwait(false);
                    field.SetConfigurationValue(configuration, value);
                }
                catch (Exception ex) when (ex is SecretNotFoundException or SecretStateException)
                {
                    _logger.LogWarning( // NOSONAR S6667 — type only: a secret exception message is not needed here
                        "[storage-config] secret-unusable tenant={TenantId} name={Name} field={Field} secret={SecretId} error={ErrorType}",
                        tenantId, row.Name, field.Name, secretId, ex.GetType().Name);
                    return null;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // Names and ids only: never a value. Logged once by whoever handles it.
                    throw new StorageConfigurationUnavailableException(
                        $"The storage configuration '{row.Name}' is not available: its {field.Name} secret {secretId} could not be read ({ex.GetType().Name}).",
                        ex);
                }
            }

            return configuration;
        }
    }
}
