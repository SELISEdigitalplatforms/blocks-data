using System.Text.Json;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Schemas;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Rest;

/// <summary>
/// The write-side test entity: <c>Parcel</c> has a field of every type the record reader accepts, base-entity fields
/// that are and are not writable, and DTO fields reached both ways an assembled entity carries them: <c>Ship</c> and
/// <c>Lines</c> through dotted rows (as <c>SchemaAssembler.Assemble</c> nests them into <c>Fields</c>), <c>Billing</c>
/// only through <see cref="EntityModel.Dtos"/>. <c>Ship</c>'s inline rows deliberately lack the DTO's <c>Detail</c> field,
/// so a test can show the DTO schema (what GraphQL builds its input from) wins over the inline rows. The DTO <c>Line</c>
/// has a field named <c>ItemId</c>. The same <see cref="Source"/> seeds the GraphQL schema the parity tests
/// compare against.
/// </summary>
internal static class RecordTestEntity
{
    public static readonly string[] StatusValues = ["Open", "Closed", "Pending"];
    public static readonly string[] LevelValues = ["Low", "High"];

    private static SchemaDefinition Entity(string name, params FieldDefinition[] fields) => new()
    {
        ItemId = $"id-{name}",
        SchemaName = name,
        CollectionName = $"{name}s",
        SchemaType = SchemaType.Entity,
        Fields = [.. fields]
    };

    private static SchemaDefinition Dto(string name, params FieldDefinition[] fields) => new()
    {
        ItemId = $"id-{name}",
        SchemaName = name,
        CollectionName = $"{name}s",
        SchemaType = SchemaType.Dto,
        Fields = [.. fields]
    };

    private static FieldDefinition F(string name, string type = "String", bool isArray = false, string[]? enumValues = null) => new()
    {
        Name = name,
        Type = type,
        IsArray = isArray,
        EnumValues = enumValues?.ToList()
    };

    /// <summary>A dotted row on the entity: how a DTO's field is stored next to the DTO field itself.</summary>
    private static FieldDefinition Nested(string path, string dto, string type = "String") => new()
    {
        Name = path,
        Type = type,
        IsReferenceField = true,
        ReferenceFieldType = dto
    };

    /// <summary>A fresh source each call: assembling modifies the definitions, so each consumer gets its own.</summary>
    public static SchemaSource Source() => new()
    {
        SchemaDefinitions =
        [
            Entity("Parcel",
                F("ItemId"),
                F("CreatedBy"),
                F("Tags", isArray: true),
                F("Code", "ID"),
                F("Name"),
                F("Age", "Int"),
                F("Score", "Float"),
                F("IsActive", "Boolean"),
                F("Born", "DateTime"),
                F("Status", "Enum", enumValues: StatusValues),
                F("Levels", "Enum", isArray: true, enumValues: LevelValues),
                F("Location", "GeoJson"),
                F("Zones", "GeoJson", isArray: true),
                F("Nicknames", isArray: true),
                F("Scores", "Float", isArray: true),
                F("Ship", "Address"),
                Nested("Ship.Street", "Address"),
                Nested("Ship.City", "Address"),
                Nested("Ship.Zip", "Address", "Int"),
                F("Billing", "Address"),
                F("Lines", "Line", isArray: true),
                Nested("Lines.Sku", "Line"),
                Nested("Lines.Qty", "Line", "Int"),
                Nested("Lines.Price", "Line", "Float")),
            Dto("Address", F("Street"), F("City"), F("Zip", "Int"), F("Detail", "Line")),
            Dto("Line", F("ItemId"), F("Sku"), F("Qty", "Int"), F("Price", "Float"))
        ]
    };

    /// <summary>The assembled entity with its DTO schemas, shaped as the entity view provider hands them over.</summary>
    public static EntityModel Model()
    {
        BlocksTestContext.Set();
        var assembled = SchemaAssembler.Assemble(Source());
        var entity = assembled.Single(s => s.SchemaName == "Parcel");
        var dtos = assembled.Where(s => s.SchemaType == SchemaType.Dto).ToDictionary(s => s.SchemaName);
        return new EntityModel(entity, null, dtos);
    }

    public static JsonElement Json(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}
