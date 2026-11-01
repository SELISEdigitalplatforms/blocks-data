using DataGateway.DomainService.Entities;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Models;

/// <summary>
/// Everything a tenant's GraphQL schema is built from: the schema definitions with their access
/// levels, the field validations, and the access policies. Read from the drafts when publishing,
/// and from a published snapshot when a pod builds.
/// </summary>
public sealed class SchemaSource
{
    public List<SchemaDefinition> SchemaDefinitions { get; init; } = [];
    public List<DataValidation> DataValidations { get; init; } = [];
    public List<DataAccessPolicy> DataAccessPolicies { get; init; } = [];

    /// <summary>
    /// System entities that a tenant rule (Reference or Must not exist in) points at: reference targets only, never
    /// built as GraphQL types. Empty when no rule points at one, which is every source from before they could.
    /// </summary>
    public List<SchemaDefinition> SystemEntitySchemas { get; init; } = [];
}
