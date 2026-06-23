using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.GraphTypes;

public class InsertInputType : BaseInputType
{
    protected override string NameSuffix => "InsertInput";
    protected override string[] AllowedBaseFields { get; } =
    [
        nameof(GraphQlBaseEntity.OrganizationId),
        nameof(GraphQlBaseEntity.Tags),
        nameof(GraphQlBaseEntity.Language),
        nameof(GraphQlBaseEntity.ItemId)
    ];

    public InsertInputType(SchemaDefinitionExtended schema, Dictionary<string, SchemaDefinitionExtended> schemaMap)
        : base(schema, schemaMap)
    {
    }
}
