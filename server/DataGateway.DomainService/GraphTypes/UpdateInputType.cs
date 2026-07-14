using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.GraphTypes;

public class UpdateInputType : BaseInputType
{
    protected override string NameSuffix => "UpdateInput";
    protected override string[] AllowedBaseFields { get; } =
    [
        nameof(GraphQlBaseEntity.OrganizationId),
        nameof(GraphQlBaseEntity.Tags),
        nameof(GraphQlBaseEntity.Language)
    ];

    public UpdateInputType(SchemaDefinitionExtended schema, Dictionary<string, SchemaDefinitionExtended> schemaMap)
        : base(schema, schemaMap)
    {
    }
}

