namespace DataGateway.DomainService.Services;

/// <summary>
/// Which schemas a tenant's live published version contains, so the schema drafts can be told
/// apart from what apps using the API are actually served (for example after a rollback).
/// </summary>
public interface ILiveSchemaCatalog
{
    /// <summary>
    /// The IDs of the schemas in the tenant's live version; null when the tenant has no live
    /// version yet or it cannot be read, in which case nothing should be marked either way.
    /// </summary>
    Task<IReadOnlySet<string>?> GetLiveSchemaIdsAsync(string tenantId, CancellationToken cancellationToken = default);
}
