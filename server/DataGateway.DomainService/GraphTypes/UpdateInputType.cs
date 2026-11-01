using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.GraphTypes;

public class UpdateInputType : BaseInputType
{
    protected override string NameSuffix => "UpdateInput";
    protected override WriteOperation Operation => WriteOperation.Update;

    public UpdateInputType(SchemaDefinitionExtended schema, Dictionary<string, SchemaDefinitionExtended> schemaMap)
        : base(schema, schemaMap)
    {
    }
}

