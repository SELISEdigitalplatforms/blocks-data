using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Schemas;

/// <summary>
/// Checks that a tenant's drafts build, before a publish stores them. Throws whatever the build
/// throws; the publish turns that into the reason shown to the admin.
/// </summary>
public interface IPublishedSchemaValidator
{
    void Validate(string tenantId, SchemaSource source);
}
