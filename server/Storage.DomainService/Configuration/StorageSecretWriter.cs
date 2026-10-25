using Blocks.Secrets;
using Microsoft.Extensions.Logging;

namespace DomainService.Configuration
{
    /// <summary>The configuration a secret belongs to: tenant of the secrets, scope (seed or not) and name.</summary>
    internal sealed record SecretOwner(string TenantId, StorageConfigScope Scope, string Name);

    /// <summary>
    /// SecretStore steps of <see cref="StorageConfigurationStore"/>: create, rotate, reuse, status, read for a copy and
    /// soft-delete. Every call runs in the owner's tenant context. No value is kept or logged.
    /// </summary>
    internal sealed class StorageSecretWriter
    {
        private const int FindPageSize = 100;

        private readonly IStorageSecretAccessor _secrets;
        private readonly ILogger _logger;

        public StorageSecretWriter(IStorageSecretAccessor secrets, ILogger logger)
        {
            _secrets = secrets;
            _logger = logger;
        }

        /// <summary>The secret id the row keeps for <paramref name="field"/> after this save.</summary>
        public async Task<string?> WriteForSaveAsync(
            SecretOwner owner,
            StorageSecretField field,
            StorageSettings? existing,
            StorageSecretValues? secrets,
            List<string> created,
            CancellationToken cancellationToken)
        {
            var current = existing is null ? null : field.GetSecretId(existing);
            var value = secrets is null ? null : field.GetValue(secrets);
            if (string.IsNullOrEmpty(value))
                return current;

            if (!string.IsNullOrEmpty(current))
            {
                // Metadata only. A store failure throws here (never a duplicate secret because of an outage).
                var metadata = await _secrets.ExecuteAsync(owner.TenantId, s => s.GetAsync(current, cancellationToken)).ConfigureAwait(false);
                if (!StorageSecretStatus.IsBroken(StorageSecretStatus.FromMetadata(metadata)))
                {
                    // Rotate in place: readers keep the same id.
                    await _secrets.ExecuteAsync(owner.TenantId, async s =>
                    {
                        await s.RotateAsync(current, new RotateSecretRequest { Value = value }, cancellationToken).ConfigureAwait(false);
                        return true;
                    }).ConfigureAwait(false);
                    return current;
                }
            }

            var id = await CreateSecretAsync(owner, field, value, cancellationToken).ConfigureAwait(false);
            created.Add(id);
            return id;
        }

        public Task<string> CreateSecretAsync(SecretOwner owner, StorageSecretField field, string value, CancellationToken cancellationToken) =>
            _secrets.ExecuteAsync(owner.TenantId, s => s.SetAsync(new SetSecretRequest
            {
                Name = StorageConfigurationKeys.SecretNameFor(owner.Name, field),
                Description = StorageConfigurationKeys.DescriptionFor(owner.Name, field, owner.Scope.IsSeed),
                Type = SecretTypes.Service,
                Value = value
            }, cancellationToken));


        public async Task<string> ReuseOrCreateSecretAsync(
            SecretOwner owner,
            StorageSecretField field,
            string value,
            List<string> created,
            CancellationToken cancellationToken)
        {
            var reusable = await FindReusableSecretAsync(owner, field, cancellationToken).ConfigureAwait(false);
            if (reusable is not null)
            {
                await _secrets.ExecuteAsync(owner.TenantId, async s =>
                {
                    await s.RotateAsync(reusable, new RotateSecretRequest { Value = value }, cancellationToken).ConfigureAwait(false);
                    return true;
                }).ConfigureAwait(false);
                _logger.LogInformation("[storage-config] secret-reused tenant={TenantId} name={Name} field={Field} secret={SecretId}",
                    owner.TenantId, owner.Name, field.Name, reusable);
                return reusable;
            }

            var id = await CreateSecretAsync(owner, field, value, cancellationToken).ConfigureAwait(false);
            created.Add(id);
            return id;
        }

        /// <summary>An active Service secret with this configuration's exact secret name and description (a crashed run's).</summary>
        public async Task<string?> FindReusableSecretAsync(SecretOwner owner, StorageSecretField field, CancellationToken cancellationToken)
        {
            var secretName = StorageConfigurationKeys.SecretNameFor(owner.Name, field);
            var description = StorageConfigurationKeys.DescriptionFor(owner.Name, field, owner.Scope.IsSeed);
            var page = 0;
            while (true)
            {
                page++;
                var filter = new SecretFilter
                {
                    Search = secretName,
                    Type = SecretTypes.Service,
                    Status = SecretStatuses.Active,
                    PageNumber = page,
                    PageSize = FindPageSize
                };
                var result = await _secrets.ExecuteAsync(owner.TenantId, s => s.FindAsync(filter, cancellationToken)).ConfigureAwait(false);
                var match = result.Data.FirstOrDefault(s =>
                    string.Equals(s.Name, secretName, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(s.Description, description, StringComparison.Ordinal)
                    && s.Status == SecretStatuses.Active);
                if (match is not null)
                    return match.SecretId;
                if (result.Data.Count < FindPageSize || (long)page * FindPageSize >= result.TotalCount)
                    return null;
            }
        }


        public async Task<string> StatusAsync(string tenantId, string name, string fieldName, string secretId, CancellationToken cancellationToken)
        {
            try
            {
                var metadata = await _secrets.ExecuteAsync(tenantId, s => s.GetAsync(secretId, cancellationToken)).ConfigureAwait(false);
                return StorageSecretStatus.FromMetadata(metadata);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning( // NOSONAR S6667 — type only: the message of a store error is not logged
                    "[storage-config] secret-status-unavailable tenant={TenantId} name={Name} field={Field} error={ErrorType}",
                    tenantId, name, fieldName, ex.GetType().Name);
                return StorageSecretStatus.Unavailable;
            }
        }


        /// <summary>The source row's values (memory only), or null when one of its secrets is missing, archived or locked.</summary>
        public async Task<StorageSecretValues?> ReadSourceValuesAsync(string tenantId, StorageSettings row, CancellationToken cancellationToken)
        {
            var values = new StorageSecretValues();
            foreach (var field in StorageSecretFields.All)
            {
                var secretId = field.GetSecretId(row);
                if (string.IsNullOrEmpty(secretId))
                    continue;
                try
                {
                    field.SetValue(values, await _secrets.ExecuteAsync(tenantId, s => s.GetValueAsync(secretId, cancellationToken)).ConfigureAwait(false));
                }
                catch (Exception ex) when (ex is SecretNotFoundException or SecretStateException)
                {
                    _logger.LogWarning( // NOSONAR S6667 — type only: a secret exception message is not needed here
                        "[storage-config] copy-source-secret-unusable tenant={TenantId} name={Name} field={Field} secret={SecretId} error={ErrorType}",
                        tenantId, row.Name, field.Name, secretId, ex.GetType().Name);
                    return null;
                }
            }

            return values;
        }


        public async Task RetireCreatedAsync(string tenantId, string name, List<string> created)
        {
            foreach (var secretId in created)
                await RetireAsync(tenantId, name, "created", secretId).ConfigureAwait(false);
        }

        /// <summary>Soft-delete (pattern blocks-os <c>LinkedSecretRetirement</c>): already deleted or gone = fine; other failures are logged, never thrown.</summary>
        public async Task RetireAsync(string tenantId, string name, string fieldName, string secretId)
        {
            try
            {
                await _secrets.ExecuteAsync(tenantId, async s =>
                {
                    await s.DeleteAsync(secretId).ConfigureAwait(false);
                    return true;
                }).ConfigureAwait(false);
            }
            catch (SecretStateException ex) when (ex.CurrentStatus == SecretStatuses.Deleted)
            {
                // Already archived.
            }
            catch (SecretNotFoundException)
            {
                // Already purged.
            }
            catch (Exception ex)
            {
                _logger.LogWarning( // NOSONAR S6667 — type only: the message of a store error is not logged
                    "[storage-config] secret-retire-failed tenant={TenantId} name={Name} field={Field} secret={SecretId} error={ErrorType} (left active, delete it by hand)",
                    tenantId, name, fieldName, secretId, ex.GetType().Name);
            }
        }
    }
}
