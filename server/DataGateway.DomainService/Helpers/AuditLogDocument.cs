using System.Text.Json;
using MongoDB.Bson;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Builds one <c>ObjectAuditLogs</c> row as a plain BsonDocument (data SPEC1 §3.2, §3.3, §4).
/// DataGateway does not reference Storage, so the field names of the Storage <c>ObjectAuditLog</c>
/// entity (Genesis <c>BaseEntity</c> fields + TenantId, ResourceId, ResourceType, UserId, Action,
/// Granted, Detail, Record) are kept here as an own copy.
/// </summary>
public static class AuditLogDocument
{
    public const string CollectionName = "ObjectAuditLogs";

    public const string ActionSchemaExport = "schema-export";
    public const string ActionDataDelete = "data-delete";

    /// <summary>Stored as the enum NAME (the entity uses <c>BsonRepresentation(String)</c>).</summary>
    public const string ResourceTypeSchemaExport = "SchemaExport";
    public const string ResourceTypeDataRecord = "DataRecord";

    /// <summary>
    /// One audit row. <paramref name="detail"/> is serialized to JSON TEXT (the entity field is a string).
    /// <paramref name="record"/> is added only when not null.
    /// </summary>
    public static BsonDocument Build(
        string action,
        string resourceType,
        string resourceId,
        string userId,
        string tenantId,
        IReadOnlyDictionary<string, string> detail,
        BsonDocument? record = null,
        string? organizationId = null,
        DateTime? nowUtc = null)
    {
        var now = nowUtc ?? DateTime.UtcNow;
        var doc = new BsonDocument
        {
            { "_id", Guid.NewGuid().ToString() },
            { "CreatedDate", now },
            { "LastUpdatedDate", now },
            { "CreatedBy", userId },
            { "Language", BsonNull.Value },
            { "LastUpdatedBy", userId },
            { "OrganizationId", string.IsNullOrWhiteSpace(organizationId) ? "default" : organizationId },
            { "Tags", new BsonArray() },
            { "TenantId", tenantId },
            { "ResourceId", resourceId },
            { "ResourceType", resourceType },
            { "UserId", userId },
            { "Action", action },
            { "Granted", true },
            { "Detail", JsonSerializer.Serialize(detail) },
        };
        if (record is not null)
            doc.Add("Record", record);
        return doc;
    }
}
