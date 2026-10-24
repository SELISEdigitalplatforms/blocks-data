using Blocks.Genesis.Entities.Data;
using Blocks.Secrets;
using DomainService.Configuration;

namespace Worker.Jobs;

/// <summary>
/// Verify rule of <see cref="StorageConfigMigrationJob"/>: does one <c>storage-config:</c> row match the old doc it came
/// from? Returns a reason (names, field names, secret ids; never a value) or null when it matches.
/// </summary>
public sealed class StorageConfigMigrationVerifier
{
    private readonly IStorageSecretAccessor _secrets;

    public StorageConfigMigrationVerifier(IStorageSecretAccessor secrets)
    {
        _secrets = secrets;
    }

    /// <summary>Null when <paramref name="row"/> matches <paramref name="doc"/>; a store failure is a reason, not an exception.</summary>
    public async Task<string?> VerifyAsync(string tenantId, StorageConfiguration doc, StorageSettings? row, CancellationToken ct)
    {
        if (row is null)
            return "no-row";
        try
        {
            return await VerifyOneAsync(tenantId, doc, row, ct);
        }
        catch (SecretException ex)
        {
            return $"secret-unusable={ex.GetType().Name}";
        }
    }

    /// <summary>
    /// Null when the row matches. A row written by the app (no <c>MigratedAt</c>) or saved after the migration is the
    /// truth: only its secrets must be usable. A row the job wrote and nobody changed must equal the old doc.
    /// </summary>
    private async Task<string?> VerifyOneAsync(string tenantId, StorageConfiguration doc, StorageSettings row, CancellationToken ct)
    {
        if (row.MigratedAt is { } migratedAt && doc.LastUpdatedDate.ToUniversalTime() > migratedAt.ToUniversalTime())
            return "old-doc-changed-after-migration";

        var compare = row.MigratedAt is { } m && row.LastUpdatedDate.ToUniversalTime() <= m.ToUniversalTime();
        if (compare && FirstDifferingField(doc, row) is { } differing)
            return $"field-differs={differing}";

        foreach (var field in StorageSecretFields.All)
        {
            var reason = await VerifySecretAsync(tenantId, field, field.GetConfigurationValue(doc), field.GetSecretId(row), compare, ct);
            if (reason is not null)
                return reason;
        }

        return null;
    }

    private async Task<string?> VerifySecretAsync(string tenantId, StorageSecretField field, string? oldValue, string? secretId, bool compare, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(secretId))
            return string.IsNullOrEmpty(oldValue) ? null : $"missing-secret-id={field.Name}";

        var metadata = await _secrets.ExecuteAsync(tenantId, s => s.GetAsync(secretId, ct));
        if (metadata is null)
            return $"secret-missing={field.Name} secret={secretId}";
        if (metadata.Status != SecretStatuses.Active)
            return $"secret-status={metadata.Status} field={field.Name} secret={secretId}";
        if (!compare)
            return null;
        if (string.IsNullOrEmpty(oldValue))
            return $"unexpected-secret={field.Name} secret={secretId}";

        var value = await _secrets.ExecuteAsync(tenantId, s => s.GetValueAsync(secretId, ct));
        return string.Equals(value, oldValue, StringComparison.Ordinal) ? null : $"value-differs={field.Name} secret={secretId}";
    }

    private static string? FirstDifferingField(StorageConfiguration doc, StorageSettings row)
    {
        var expected = StorageSettings.FromConfiguration(doc);
        (string Name, object? Old, object? New)[] fields =
        [
            (nameof(row.StorageStrategy), expected.StorageStrategy, row.StorageStrategy),
            (nameof(row.CloudStorageRegionEndPoint), expected.CloudStorageRegionEndPoint, row.CloudStorageRegionEndPoint),
            (nameof(row.Host), expected.Host, row.Host),
            (nameof(row.Port), expected.Port, row.Port),
            (nameof(row.UserName), expected.UserName, row.UserName),
            (nameof(row.RemoteBasePath), expected.RemoteBasePath, row.RemoteBasePath),
            (nameof(row.UploadUrlExpirySeconds), expected.UploadUrlExpirySeconds, row.UploadUrlExpirySeconds),
            (nameof(row.DownloadUrlExpirySeconds), expected.DownloadUrlExpirySeconds, row.DownloadUrlExpirySeconds),
            (nameof(row.MaxFileSizeInBytes), expected.MaxFileSizeInBytes, row.MaxFileSizeInBytes),
            (nameof(row.UploadCompletionRequiredFor), Join(expected.UploadCompletionRequiredFor), Join(row.UploadCompletionRequiredFor))
        ];
        return fields.FirstOrDefault(f => !Equals(f.Old, f.New)).Name;
    }

    private static string? Join(List<string>? values) => values is null ? null : string.Join(",", values);
}
