namespace DataGateway.DomainService.Services;

/// <summary>
/// The tenant's schema definitions do not build into a valid GraphQL schema, so they were not
/// published. Nothing changed: the published version and the pending changes are as they were.
/// </summary>
public sealed class SchemaPublishException(string message, Exception innerException)
    : Exception(message, innerException);
