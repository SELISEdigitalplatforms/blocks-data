using System.Text;
using Blocks.Genesis;
using MongoDB.Driver;

namespace DomainService.Configuration
{
    /// <summary>Keys and secret names of storage configurations.</summary>
    public static class StorageConfigurationKeys
    {
        /// <summary>Single-value key prefix in <c>KeyValueStores</c> (tenant DB).</summary>
        public const string KeyPrefix = "storage-config:";

        /// <summary>The old collection, read only as a fallback until the migration cleanup drops it.</summary>
        public const string LegacyCollectionName = "StorageConfigurations";

        private const int MaxSecretNameLength = 100;
        private const int MaxDescriptionNameLength = 200;

        /// <summary><c>storage-config:&lt;Name&gt;</c>, name trimmed, case kept.</summary>
        public static string KeyFor(string name) => KeyPrefix + NormalizeName(name);

        public static string NormalizeName(string? name) => (name ?? string.Empty).Trim();

        /// <summary>
        /// <c>storage-&lt;Name&gt;-&lt;Field&gt;</c>. SecretStore allows only letters, digits, dot, underscore and hyphen,
        /// at most 100 characters: any other character becomes <c>-</c> and the name part is shortened. The name is a
        /// label only; a configuration finds its secrets by id.
        /// </summary>
        public static string SecretNameFor(string name, StorageSecretField field)
        {
            ArgumentNullException.ThrowIfNull(field);
            var suffix = "-" + field.Name;
            var builder = new StringBuilder();
            foreach (var c in NormalizeName(name))
                builder.Append(char.IsAsciiLetterOrDigit(c) || c is '.' or '_' or '-' ? c : '-');
            var maxNameLength = MaxSecretNameLength - "storage-".Length - suffix.Length;
            var safeName = builder.Length > maxNameLength ? builder.ToString(0, maxNameLength) : builder.ToString();
            return "storage-" + safeName + suffix;
        }

        /// <summary>Names the configuration and the field only.</summary>
        public static string DescriptionFor(string name, StorageSecretField field, bool seed = false)
        {
            ArgumentNullException.ThrowIfNull(field);
            var trimmed = NormalizeName(name);
            if (trimmed.Length > MaxDescriptionNameLength)
                trimmed = trimmed[..MaxDescriptionNameLength];
            return $"{(seed ? "Seed storage" : "Storage")} configuration \"{trimmed}\" {field.Name}";
        }
    }

    /// <summary>
    /// Where a storage configuration lives: the tenant whose SecretStore holds its secrets, and the database whose
    /// <c>KeyValueStores</c> holds its row. <see cref="Current"/> (or a null scope) = the caller's tenant, through the
    /// Genesis <see cref="IKeyValueStore"/>.
    /// </summary>
    public sealed class StorageConfigScope
    {
        private StorageConfigScope(string? secretTenantId, IMongoDatabase? database, bool isSeed)
        {
            SecretTenantId = secretTenantId;
            Database = database;
            IsSeed = isSeed;
        }

        /// <summary>Null = the tenant of the current <see cref="BlocksContext"/>.</summary>
        public string? SecretTenantId { get; }

        /// <summary>Null = the tenant DB of the current context (Genesis <see cref="IKeyValueStore"/>, impersonated).</summary>
        public IMongoDatabase? Database { get; }

        /// <summary>The seed DB (<c>BlocksConfiguration</c>): its secrets are named as seed secrets.</summary>
        public bool IsSeed { get; }

        public static StorageConfigScope Current { get; } = new(null, null, false);

        /// <summary>An explicit database (another tenant, a new project, the migration job).</summary>
        public static StorageConfigScope ForDatabase(string secretTenantId, IMongoDatabase database)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(secretTenantId);
            ArgumentNullException.ThrowIfNull(database);
            return new StorageConfigScope(secretTenantId, database, false);
        }

        /// <summary>The seed DB; its secrets live in <paramref name="secretTenantId"/> (the root tenant).</summary>
        public static StorageConfigScope ForSeed(string secretTenantId, IMongoDatabase seedDatabase)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(secretTenantId);
            ArgumentNullException.ThrowIfNull(seedDatabase);
            return new StorageConfigScope(secretTenantId, seedDatabase, true);
        }

        /// <summary>The tenant whose secrets are used; the current context's tenant when none was given.</summary>
        public string ResolveTenantId()
        {
            if (!string.IsNullOrWhiteSpace(SecretTenantId))
                return SecretTenantId;
            var tenantId = BlocksContext.GetContext()?.TenantId;
            if (string.IsNullOrWhiteSpace(tenantId))
                throw new InvalidOperationException("Storage configuration needs a tenant context.");
            return tenantId;
        }
    }
}
