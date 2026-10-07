namespace DataGateway.DomainService.Services;

/// <summary>
/// Reads and raises a tenant's published schema version (<see cref="Entities.SchemaPublishState"/>).
/// Every call names the tenant explicitly, so it works outside an HTTP request (for example while
/// HotChocolate rebuilds an executor in the background).
/// </summary>
public interface ISchemaVersionStore
{
    /// <summary>The tenant's current version; 0 when it has never published.</summary>
    Task<long> GetAsync(string tenantId, CancellationToken cancellationToken = default);

    /// <summary>Atomically raises the tenant's version by one and returns the new value.</summary>
    Task<long> BumpAsync(string tenantId, CancellationToken cancellationToken = default);
}
