using DataGateway.DomainService.Gateway;

namespace DataGateway.Rest.Entities;

/// <summary>
/// Hands the REST API the model of one entity in a tenant's live published schema. It loads that entity only,
/// never the tenant's whole schema.
/// </summary>
public interface IEntityModelProvider
{
    /// <summary>
    /// The model of the entity named <paramref name="schemaName"/> (exact, case-sensitive) in the tenant's live version.
    /// Null when the tenant has not published, or the live version has no such entity (a DTO is not one).
    /// </summary>
    Task<EntityModel?> GetAsync(string tenantId, string schemaName);
}
