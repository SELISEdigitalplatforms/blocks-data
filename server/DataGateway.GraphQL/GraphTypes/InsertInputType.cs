using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.GraphTypes;

public class InsertInputType : BaseInputType
{
    protected override string NameSuffix => "InsertInput";
    protected override WriteOperation Operation => WriteOperation.Insert;

    public InsertInputType(SchemaDefinitionExtended schema, Dictionary<string, SchemaDefinitionExtended> schemaMap)
        : base(schema, schemaMap)
    {
    }
}
