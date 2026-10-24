using Blocks.Genesis;
using Blocks.Secrets;
using Microsoft.Extensions.Logging;

namespace DomainService.Configuration
{
    /// <summary>Result of <see cref="IStorageConfigurationStore.CreateIfAbsentAsync"/>.</summary>
    /// <param name="Created">True when this call wrote the row; false when a row already existed (it was not changed).</param>
    /// <param name="Settings">The row now stored (null only if it disappeared right after a lost race).</param>
    public sealed record StorageCreateResult(bool Created, StorageSettings? Settings);

    /// <summary>Result of <see cref="IStorageConfigurationStore.CopyAllAsync"/>, by configuration name.</summary>
    public sealed class StorageCopyResult
    {
        public List<string> Copied { get; } = [];

        /// <summary>The target already had a row with that name (left as it is).</summary>
        public List<string> Skipped { get; } = [];

        /// <summary>A secret of the source row is missing, archived or locked: nothing was written for it.</summary>
        public List<string> Failed { get; } = [];
    }

    /// <summary>
    /// Writes storage configurations: settings to the <c>storage-config:&lt;Name&gt;</c> row, the five secrets to
    /// SecretStore (type Service, tenant-scoped). Used by the blocks-os storage API, the blocks-os project provisioner
    /// and the blocks-data migration job. No method returns or logs a secret value. Every method takes an optional
    /// <see cref="StorageConfigScope"/>; null = the caller's tenant.
    /// </summary>
    public interface IStorageConfigurationStore
    {
        /// <summary>
        /// Creates or updates the row named <c>settings.Name</c> (trimmed). Per non-empty value in
        /// <paramref name="secrets"/>: a new secret when the row has no id for it or its secret is archived/missing,
        /// otherwise the same secret is rotated in place. Empty values leave the secret as it is. Secret ids in
        /// <paramref name="settings"/> are ignored: they always come from the stored row. Then the row is written (last
        /// write wins). When the row write fails, secrets created by this call are soft-deleted again.
        /// </summary>
        Task<StorageSettings> SaveAsync(StorageSettings settings, StorageSecretValues? secrets, StorageConfigScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>
        /// Writes the row only when none exists (never overwrites). Safe to repeat after a crash: an active secret with
        /// the same name and description (left by an earlier run) is reused and rotated to the given value, so no
        /// duplicate is made. Used by the migration job and the seed copy.
        /// </summary>
        Task<StorageCreateResult> CreateIfAbsentAsync(StorageSettings settings, StorageSecretValues? secrets, StorageConfigScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Deletes the row, then soft-deletes its secrets (already gone = fine). False when there was no row.</summary>
        Task<bool> DeleteAsync(string name, StorageConfigScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>The stored row (settings and secret ids, no value), or null.</summary>
        Task<StorageSettings?> GetSettingsAsync(string name, StorageConfigScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>Every stored row (settings and secret ids, no value).</summary>
        Task<IReadOnlyList<StorageSettings>> GetAllSettingsAsync(StorageConfigScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>
        /// Field name (e.g. <c>ConnectionString</c>) → <see cref="StorageSecretStatus"/> value, from secret metadata only
        /// (no value read, no value audit row). A store failure gives <see cref="StorageSecretStatus.Unavailable"/>.
        /// </summary>
        Task<IReadOnlyDictionary<string, string>> GetSecretStatusAsync(StorageSettings settings, StorageConfigScope? scope = null, CancellationToken cancellationToken = default);

        /// <summary>
        /// Copies every row of <paramref name="source"/> that <paramref name="target"/> does not have yet, with new
        /// secrets of the target tenant holding the source values (new projects: seed → tenant). Idempotent.
        /// </summary>
        Task<StorageCopyResult> CopyAllAsync(StorageConfigScope source, StorageConfigScope target, CancellationToken cancellationToken = default);
    }

    public sealed class StorageConfigurationStore : IStorageConfigurationStore
    {
        private readonly IKeyValueStore _keyValueStore;
        private readonly StorageSecretWriter _secretWriter;

        public StorageConfigurationStore(IKeyValueStore keyValueStore, IStorageSecretAccessor secrets, ILogger<StorageConfigurationStore> logger)
        {
            _keyValueStore = keyValueStore;
            _secretWriter = new StorageSecretWriter(secrets, logger);
        }

        private IStorageSettingsRows Rows(StorageConfigScope scope) => StorageSettingsRows.For(scope, _keyValueStore);

        private static string CurrentUser() =>
            BlocksContext.GetContext()?.UserId is { Length: > 0 } userId ? userId : StorageSecretAccessor.ServiceUserId;

        private static string RequireName(string? name)
        {
            var trimmed = StorageConfigurationKeys.NormalizeName(name);
            if (trimmed.Length == 0)
                throw new ArgumentException("A storage configuration name is required.", nameof(name));
            return trimmed;
        }

        #region Save

        public Task<StorageSettings> SaveAsync(StorageSettings settings, StorageSecretValues? secrets, StorageConfigScope? scope = null, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(settings);
            var name = RequireName(settings.Name);
            return SaveCoreAsync(name, settings, secrets, scope ?? StorageConfigScope.Current, cancellationToken);
        }

        private async Task<StorageSettings> SaveCoreAsync(string name, StorageSettings settings, StorageSecretValues? secrets, StorageConfigScope scope, CancellationToken cancellationToken)
        {
            var tenantId = scope.ResolveTenantId();
            var rows = Rows(scope);
            var existing = await rows.GetAsync(name, cancellationToken).ConfigureAwait(false);
            var row = BuildSavedRow(name, settings, existing);

            var owner = new SecretOwner(tenantId, scope, name);
            var created = new List<string>();
            try
            {
                foreach (var field in StorageSecretFields.All)
                {
                    var secretId = await _secretWriter.WriteForSaveAsync(owner, field, existing, secrets, created, cancellationToken).ConfigureAwait(false);
                    field.SetSecretId(row, secretId);
                }

                await rows.SetAsync(row, cancellationToken).ConfigureAwait(false);
            }
            catch
            {
                await _secretWriter.RetireCreatedAsync(tenantId, name, created).ConfigureAwait(false);
                throw;
            }

            return row;
        }

        /// <summary>The row to store: the caller's settings, identity and creation fields kept from the existing row.</summary>
        private static StorageSettings BuildSavedRow(string name, StorageSettings settings, StorageSettings? existing)
        {
            var now = DateTime.UtcNow;
            var user = CurrentUser();
            var row = settings.WithoutSecretIds();
            row.Name = name;
            row.ItemId = existing?.ItemId ?? (string.IsNullOrEmpty(settings.ItemId) ? Guid.NewGuid().ToString() : settings.ItemId);
            row.CreatedDate = existing?.CreatedDate ?? (settings.CreatedDate == default ? now : settings.CreatedDate);
            row.CreatedBy = existing?.CreatedBy ?? settings.CreatedBy ?? user;
            row.LastUpdatedDate = now;
            row.LastUpdatedBy = user;
            row.MigratedAt = existing?.MigratedAt;
            return row;
        }

        #endregion

        #region Create if absent

        public Task<StorageCreateResult> CreateIfAbsentAsync(StorageSettings settings, StorageSecretValues? secrets, StorageConfigScope? scope = null, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(settings);
            var name = RequireName(settings.Name);
            return CreateIfAbsentCoreAsync(name, settings, secrets, scope ?? StorageConfigScope.Current, cancellationToken);
        }

        private async Task<StorageCreateResult> CreateIfAbsentCoreAsync(string name, StorageSettings settings, StorageSecretValues? secrets, StorageConfigScope scope, CancellationToken cancellationToken)
        {
            var tenantId = scope.ResolveTenantId();
            var rows = Rows(scope);
            var existing = await rows.GetAsync(name, cancellationToken).ConfigureAwait(false);
            if (existing is not null)
                return new StorageCreateResult(false, existing);

            var row = BuildNewRow(name, settings);
            var owner = new SecretOwner(tenantId, scope, name);
            var created = new List<string>();
            bool inserted;
            try
            {
                foreach (var field in StorageSecretFields.All)
                {
                    var value = secrets is null ? null : field.GetValue(secrets);
                    if (string.IsNullOrEmpty(value))
                        continue;
                    field.SetSecretId(row, await _secretWriter.ReuseOrCreateSecretAsync(owner, field, value, created, cancellationToken).ConfigureAwait(false));
                }

                inserted = await rows.TryInsertAsync(row, cancellationToken).ConfigureAwait(false);
            }
            catch
            {
                await _secretWriter.RetireCreatedAsync(tenantId, name, created).ConfigureAwait(false);
                throw;
            }

            if (inserted)
                return new StorageCreateResult(true, row);

            // Another writer was first: its row stays, the secrets this call made are retired.
            await _secretWriter.RetireCreatedAsync(tenantId, name, created).ConfigureAwait(false);
            return new StorageCreateResult(false, await rows.GetAsync(name, cancellationToken).ConfigureAwait(false));
        }

        #endregion

        #region Delete, read, status

        public async Task<bool> DeleteAsync(string name, StorageConfigScope? scope = null, CancellationToken cancellationToken = default)
        {
            var trimmed = RequireName(name);
            scope ??= StorageConfigScope.Current;
            var tenantId = scope.ResolveTenantId();
            var rows = Rows(scope);
            var existing = await rows.GetAsync(trimmed, cancellationToken).ConfigureAwait(false);
            if (existing is null)
                return false;

            await rows.DeleteAsync(trimmed, cancellationToken).ConfigureAwait(false);
            foreach (var field in StorageSecretFields.All)
            {
                var secretId = field.GetSecretId(existing);
                if (!string.IsNullOrEmpty(secretId))
                    await _secretWriter.RetireAsync(tenantId, trimmed, field.Name, secretId).ConfigureAwait(false);
            }

            return true;
        }

        public Task<StorageSettings?> GetSettingsAsync(string name, StorageConfigScope? scope = null, CancellationToken cancellationToken = default) =>
            Rows(scope ?? StorageConfigScope.Current).GetAsync(RequireName(name), cancellationToken);

        public Task<IReadOnlyList<StorageSettings>> GetAllSettingsAsync(StorageConfigScope? scope = null, CancellationToken cancellationToken = default) =>
            Rows(scope ?? StorageConfigScope.Current).GetAllAsync(cancellationToken);

        public async Task<IReadOnlyDictionary<string, string>> GetSecretStatusAsync(StorageSettings settings, StorageConfigScope? scope = null, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(settings);
            var tenantId = (scope ?? StorageConfigScope.Current).ResolveTenantId();
            var result = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var field in StorageSecretFields.All)
            {
                var secretId = field.GetSecretId(settings);
                result[field.Name] = string.IsNullOrEmpty(secretId)
                    ? StorageSecretStatus.None
                    : await _secretWriter.StatusAsync(tenantId, settings.Name, field.Name, secretId, cancellationToken).ConfigureAwait(false);
            }

            return result;
        }

        #endregion

        #region Copy

        /// <summary>The row to insert: the given settings (dates and users kept when set) and <c>MigratedAt</c>.</summary>
        private static StorageSettings BuildNewRow(string name, StorageSettings settings)
        {
            var now = DateTime.UtcNow;
            var user = CurrentUser();
            var row = settings.WithoutSecretIds();
            row.Name = name;
            row.MigratedAt = settings.MigratedAt;
            row.ItemId = string.IsNullOrEmpty(settings.ItemId) ? Guid.NewGuid().ToString() : settings.ItemId;
            row.CreatedDate = settings.CreatedDate == default ? now : settings.CreatedDate;
            row.LastUpdatedDate = settings.LastUpdatedDate == default ? now : settings.LastUpdatedDate;
            row.CreatedBy ??= user;
            row.LastUpdatedBy ??= user;
            return row;
        }

        public async Task<StorageCopyResult> CopyAllAsync(StorageConfigScope source, StorageConfigScope target, CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(source);
            ArgumentNullException.ThrowIfNull(target);
            var sourceTenantId = source.ResolveTenantId();
            var targetRows = Rows(target);
            var result = new StorageCopyResult();
            var rows = await Rows(source).GetAllAsync(cancellationToken).ConfigureAwait(false);
            foreach (var row in rows.OrderBy(r => r.Name, StringComparer.Ordinal))
            {
                var name = StorageConfigurationKeys.NormalizeName(row.Name);
                if (name.Length == 0)
                    continue;
                if (await targetRows.GetAsync(name, cancellationToken).ConfigureAwait(false) is not null)
                {
                    result.Skipped.Add(name);
                    continue;
                }

                var copied = await CopyOneAsync(sourceTenantId, row, target, cancellationToken).ConfigureAwait(false);
                (copied switch { null => result.Failed, true => result.Copied, false => result.Skipped }).Add(name);
            }

            return result;
        }

        /// <summary>True = copied, false = the target got a row meanwhile, null = a source secret is unusable.</summary>
        private async Task<bool?> CopyOneAsync(string sourceTenantId, StorageSettings row, StorageConfigScope target, CancellationToken cancellationToken)
        {
            var values = await _secretWriter.ReadSourceValuesAsync(sourceTenantId, row, cancellationToken).ConfigureAwait(false);
            if (values is null)
                return null;

            var now = DateTime.UtcNow;
            var settings = row.WithoutSecretIds();
            settings.ItemId = Guid.NewGuid().ToString();
            settings.CreatedDate = now;
            settings.LastUpdatedDate = now;
            settings.CreatedBy = CurrentUser();
            settings.LastUpdatedBy = settings.CreatedBy;
            var created = await CreateIfAbsentAsync(settings, values, target, cancellationToken).ConfigureAwait(false);
            return created.Created;
        }

        #endregion

    }
}
