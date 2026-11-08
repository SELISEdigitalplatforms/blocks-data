using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Schemas;

/// <summary>
/// Stores and loads the per-entity views of published schema versions
/// (<see cref="Entities.PublishedEntityView"/>). Every call names the tenant explicitly.
/// </summary>
public interface IEntityViewStore
{
    /// <summary>
    /// Builds and stores a view for every entity of <paramref name="fullSource"/> as <paramref name="version"/>.
    /// A view that already exists is left as it is: another pod may have written it. Every view is
    /// attempted; if any fails, no completion marker is written and one exception reports all failures.
    /// </summary>
    Task WriteAsync(string tenantId, long version, SchemaSource fullSource);

    /// <summary>The view of one entity in a version; null when that version has no view for it.</summary>
    Task<SchemaSource?> LoadAsync(string tenantId, long version, string schemaName);

    /// <summary>Whether <paramref name="version"/> has all its views: true only once a complete write left its marker.</summary>
    Task<bool> HasVersionAsync(string tenantId, long version);

    /// <summary>
    /// Deletes the views of versions older than the newest kept one and not in <paramref name="keptVersions"/>.
    /// Does nothing when none are kept; a version newer than every kept one (a publish under way) is never touched.
    /// </summary>
    Task DeleteExceptAsync(string tenantId, IReadOnlyCollection<long> keptVersions);
}
