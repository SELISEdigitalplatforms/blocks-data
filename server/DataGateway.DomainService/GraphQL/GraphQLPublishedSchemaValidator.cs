using DataGateway.DomainService.Models;
using DataGateway.DomainService.Schema;
using HotChocolate;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Validates a publish by building the throwaway GraphQL schema the drafts would serve.
/// </summary>
public sealed class GraphQLPublishedSchemaValidator(GraphqlSchemaBuilder builder) : IPublishedSchemaValidator
{
    public void Validate(string tenantId, SchemaSource source)
    {
        var schemaBuilder = SchemaBuilder.New();
        // A tenant without definitions has nothing to validate (and nothing to serve).
        // Strict: a Reference rule pointing at a schema or field that no longer exists stops the publish.
        if (builder.BuildSchema(tenantId, source, schemaBuilder, strictReferences: true))
        {
            schemaBuilder.Create();
        }
    }
}
