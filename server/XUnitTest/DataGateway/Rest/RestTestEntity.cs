using System.Text.Json;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Rest;

/// <summary>
/// An entity with one field of every filterable type, shaped like an assembled schema: <c>Ship</c> carries its DTO
/// fields inline (as <c>SchemaAssembler.Assemble</c> nests them), <c>Billing</c> carries none, so its fields are
/// only reachable through <see cref="EntityModel.Dtos"/>.
/// </summary>
internal static class RestTestEntity
{
    public static readonly string[] StatusValues = ["Open", "Closed", "Pending"];

    public static EntityModel Order()
    {
        var status = Field("Status", SchemaTypeHelper.EnumTypeName);
        status.EnumValues = [.. StatusValues];

        var schema = Schema(schemaName: "Order", collectionName: "Orders", fields:
        [
            Field("ItemId", "ID"),
            Field("Name"),
            Field("Email"),
            Field("Age", "Int"),
            Field("Score", "Float"),
            Field("IsActive", "Boolean"),
            Field("CreatedDate", "DateTime"),
            status,
            Field("Location", GeoJsonValidator.TypeName),
            Field("Ship", "Address", children:
            [
                Field("Street"),
                Field("City"),
                Field("Zip", "Int")
            ]),
            Field("Billing", "Address")
        ]);

        var address = Schema(schemaName: "Address", collectionName: "Addresses", fields:
        [
            Field("Street"),
            Field("City"),
            Field("Zip", "Int")
        ]);

        return new EntityModel(schema, null, new Dictionary<string, SchemaDefinitionExtended> { ["Address"] = address });
    }

    public static JsonElement Json(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}
