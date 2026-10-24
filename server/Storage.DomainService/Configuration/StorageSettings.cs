using Blocks.Genesis.Entities.Data;
using MongoDB.Bson.Serialization.Attributes;

namespace DomainService.Configuration
{
    /// <summary>
    /// The non-secret part of one storage configuration, stored in the tenant's <c>KeyValueStores</c> under
    /// <c>storage-config:&lt;Name&gt;</c>. The five secrets live in SecretStore; this value keeps only their ids
    /// (null = not set). Never holds a secret value.
    /// </summary>
    [BsonIgnoreExtraElements]
    public sealed class StorageSettings
    {
        public string? ItemId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? StorageStrategy { get; set; }
        public string? CloudStorageRegionEndPoint { get; set; }
        public string? Host { get; set; }
        public string? Port { get; set; }
        public string? UserName { get; set; }
        public string? RemoteBasePath { get; set; }
        public int? UploadUrlExpirySeconds { get; set; }
        public int? DownloadUrlExpirySeconds { get; set; }
        public long? MaxFileSizeInBytes { get; set; }

        /// <summary>Access modifier names (strings, as the old document stored them).</summary>
        public List<string>? UploadCompletionRequiredFor { get; set; }

        public DateTime CreatedDate { get; set; }
        public DateTime LastUpdatedDate { get; set; }
        public string? CreatedBy { get; set; }
        public string? LastUpdatedBy { get; set; }
        public string? OrganizationId { get; set; }

        public string? ConnectionStringSecretId { get; set; }
        public string? SecretKeySecretId { get; set; }
        public string? AccessKeySecretId { get; set; }
        public string? PasswordSecretId { get; set; }
        public string? SftpSecretKeySecretId { get; set; }

        /// <summary>Set only by the migration job (when it wrote this row); null otherwise.</summary>
        public DateTime? MigratedAt { get; set; }

        /// <summary>Copy of the non-secret fields of an old <see cref="StorageConfiguration"/> document. No secret id is set.</summary>
        public static StorageSettings FromConfiguration(StorageConfiguration configuration)
        {
            ArgumentNullException.ThrowIfNull(configuration);
            return new StorageSettings
            {
                ItemId = string.IsNullOrEmpty(configuration.ItemId) ? null : configuration.ItemId,
                Name = (configuration.Name ?? string.Empty).Trim(),
                StorageStrategy = configuration.StorageStrategy,
                CloudStorageRegionEndPoint = configuration.CloudStorageRegionEndPoint,
                Host = configuration.Host,
                Port = configuration.Port,
                UserName = configuration.UserName,
                RemoteBasePath = configuration.RemoteBasePath,
                UploadUrlExpirySeconds = configuration.UploadUrlExpirySeconds,
                DownloadUrlExpirySeconds = configuration.DownloadUrlExpirySeconds,
                MaxFileSizeInBytes = configuration.MaxFileSizeInBytes,
                UploadCompletionRequiredFor = configuration.UploadCompletionRequiredFor?.Select(m => m.ToString()).ToList(),
                CreatedDate = configuration.CreatedDate,
                LastUpdatedDate = configuration.LastUpdatedDate,
                CreatedBy = configuration.CreatedBy,
                LastUpdatedBy = configuration.LastUpdatedBy,
                OrganizationId = configuration.OrganizationId
            };
        }

        /// <summary>
        /// A Genesis <see cref="StorageConfiguration"/> with these settings and no secret value. The reader fills the
        /// values in memory; the result must never be stored.
        /// </summary>
        public StorageConfiguration ToConfiguration() => new()
        {
            ItemId = ItemId ?? string.Empty,
            Name = Name,
            StorageStrategy = StorageStrategy!,
            CloudStorageRegionEndPoint = CloudStorageRegionEndPoint!,
            Host = Host!,
            Port = Port!,
            UserName = UserName!,
            RemoteBasePath = RemoteBasePath!,
            UploadUrlExpirySeconds = UploadUrlExpirySeconds,
            DownloadUrlExpirySeconds = DownloadUrlExpirySeconds,
            MaxFileSizeInBytes = MaxFileSizeInBytes,
            UploadCompletionRequiredFor = UploadCompletionRequiredFor?
                .Select(s => Enum.TryParse<AccessModifier>(s, ignoreCase: true, out var m) ? m : (AccessModifier?)null)
                .Where(m => m.HasValue)
                .Select(m => m!.Value)
                .ToList(),
            CreatedDate = CreatedDate,
            LastUpdatedDate = LastUpdatedDate,
            CreatedBy = CreatedBy,
            LastUpdatedBy = LastUpdatedBy,
            OrganizationId = OrganizationId ?? "default"
        };

        /// <summary>A copy of the non-secret fields only (every secret id and <see cref="MigratedAt"/> cleared).</summary>
        public StorageSettings WithoutSecretIds()
        {
            var copy = (StorageSettings)MemberwiseClone();
            copy.UploadCompletionRequiredFor = UploadCompletionRequiredFor?.ToList();
            foreach (var field in StorageSecretFields.All)
                field.SetSecretId(copy, null);
            copy.MigratedAt = null;
            return copy;
        }
    }

    /// <summary>
    /// The plain values of the five storage secrets, as given to a write. Kept in memory only, never stored or logged.
    /// Null or empty = "leave this secret as it is".
    /// </summary>
    public sealed class StorageSecretValues
    {
        public string? ConnectionString { get; set; }
        public string? SecretKey { get; set; }
        public string? AccessKey { get; set; }
        public string? Password { get; set; }
        public string? SftpSecretKey { get; set; }

        /// <summary>The secret values of an old <see cref="StorageConfiguration"/> document.</summary>
        public static StorageSecretValues FromConfiguration(StorageConfiguration configuration)
        {
            ArgumentNullException.ThrowIfNull(configuration);
            var values = new StorageSecretValues();
            foreach (var field in StorageSecretFields.All)
                field.SetValue(values, field.GetConfigurationValue(configuration));
            return values;
        }

        /// <summary>No value would be shown (values are secret).</summary>
        public override string ToString() => nameof(StorageSecretValues);
    }

    /// <summary>One of the five secret fields of a storage configuration.</summary>
    public sealed class StorageSecretField
    {
        private readonly Func<StorageSettings, string?> _getSecretId;
        private readonly Action<StorageSettings, string?> _setSecretId;
        private readonly Func<StorageSecretValues, string?> _getValue;
        private readonly Action<StorageSecretValues, string?> _setValue;
        private readonly Func<StorageConfiguration, string?> _getConfigurationValue;
        private readonly Action<StorageConfiguration, string> _setConfigurationValue;

        internal StorageSecretField(
            string name,
            (Func<StorageSettings, string?> Get, Action<StorageSettings, string?> Set) secretId,
            (Func<StorageSecretValues, string?> Get, Action<StorageSecretValues, string?> Set) value,
            (Func<StorageConfiguration, string?> Get, Action<StorageConfiguration, string> Set) configurationValue)
        {
            Name = name;
            (_getSecretId, _setSecretId) = secretId;
            (_getValue, _setValue) = value;
            (_getConfigurationValue, _setConfigurationValue) = configurationValue;
        }

        /// <summary>Field name, as in <see cref="StorageConfiguration"/> (e.g. <c>ConnectionString</c>).</summary>
        public string Name { get; }

        public string? GetSecretId(StorageSettings settings) => _getSecretId(settings);
        public void SetSecretId(StorageSettings settings, string? secretId) => _setSecretId(settings, secretId);
        public string? GetValue(StorageSecretValues values) => _getValue(values);
        public void SetValue(StorageSecretValues values, string? value) => _setValue(values, value);
        public string? GetConfigurationValue(StorageConfiguration configuration) => _getConfigurationValue(configuration);
        public void SetConfigurationValue(StorageConfiguration configuration, string value) => _setConfigurationValue(configuration, value);
    }

    /// <summary>The five secret fields: ConnectionString, SecretKey, AccessKey, Password, SftpSecretKey.</summary>
    public static class StorageSecretFields
    {
        public static readonly StorageSecretField ConnectionString = new(
            nameof(StorageConfiguration.ConnectionString),
            (s => s.ConnectionStringSecretId, (s, v) => s.ConnectionStringSecretId = v),
            (v => v.ConnectionString, (v, x) => v.ConnectionString = x),
            (c => c.ConnectionString, (c, x) => c.ConnectionString = x));

        public static readonly StorageSecretField SecretKey = new(
            nameof(StorageConfiguration.SecretKey),
            (s => s.SecretKeySecretId, (s, v) => s.SecretKeySecretId = v),
            (v => v.SecretKey, (v, x) => v.SecretKey = x),
            (c => c.SecretKey, (c, x) => c.SecretKey = x));

        public static readonly StorageSecretField AccessKey = new(
            nameof(StorageConfiguration.AccessKey),
            (s => s.AccessKeySecretId, (s, v) => s.AccessKeySecretId = v),
            (v => v.AccessKey, (v, x) => v.AccessKey = x),
            (c => c.AccessKey, (c, x) => c.AccessKey = x));

        public static readonly StorageSecretField Password = new(
            nameof(StorageConfiguration.Password),
            (s => s.PasswordSecretId, (s, v) => s.PasswordSecretId = v),
            (v => v.Password, (v, x) => v.Password = x),
            (c => c.Password, (c, x) => c.Password = x));

        public static readonly StorageSecretField SftpSecretKey = new(
            nameof(StorageConfiguration.SftpSecretKey),
            (s => s.SftpSecretKeySecretId, (s, v) => s.SftpSecretKeySecretId = v),
            (v => v.SftpSecretKey, (v, x) => v.SftpSecretKey = x),
            (c => c.SftpSecretKey, (c, x) => c.SftpSecretKey = x));

        public static IReadOnlyList<StorageSecretField> All { get; } = [ConnectionString, SecretKey, AccessKey, Password, SftpSecretKey];
    }
}
