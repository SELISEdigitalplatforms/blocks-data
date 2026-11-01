using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.LockIn;

/// <summary>
/// What a lock-in run needs in the tenant's database: the drafts the GraphQL schema is built from (schema
/// definitions, validations, access policies), the data collections to seed, and the geo indexes to create.
/// </summary>
public sealed class LockInTenant
{
    public required List<SchemaDefinition> Schemas { get; init; }
    public List<DataValidation> Validations { get; init; } = [];
    public List<DataAccessPolicy> Policies { get; init; } = [];

    /// <summary>Collection name to the rows seeded into it.</summary>
    public Dictionary<string, List<BsonDocument>> Seed { get; init; } = [];

    /// <summary>(collection, field) pairs that get a 2dsphere index, as the schema service creates for GeoJson fields.</summary>
    public List<(string Collection, string Field)> GeoIndexes { get; init; } = [];

    /// <summary>The collections whose contents a run reports (every seeded or entity collection).</summary>
    public IEnumerable<string> DataCollections =>
        Schemas.Where(s => s.SchemaType == SchemaType.Entity).Select(s => s.CollectionName).Concat(Seed.Keys).Distinct().Order(StringComparer.Ordinal);

    private const string ProductId = "lockin-product";
    private const string AddressId = "lockin-address";
    private const string NoteId = "lockin-note";

    /// <summary>
    /// Entity <c>Product</c> (read: Custom with an RLS policy "only rows whose Owner is the caller, unless the caller has
    /// role admin"; <c>Secret</c> masked on read and refused on write and edit unless admin; write/edit/delete: User, which
    /// is "authenticated") and entity <c>Note</c> (public read). A new instance on every access: building a schema modifies its source.
    /// </summary>
    public static LockInTenant Standard => new()
    {
        Schemas =
        [
            new SchemaDefinition
            {
                ItemId = AddressId, SchemaName = "Address", CollectionName = "Addresses", SchemaType = SchemaType.Dto,
                Fields =
                [
                    new FieldDefinition { Name = "City", Type = "String" },
                    new FieldDefinition { Name = "Zip", Type = "String" },
                ],
            },
            new SchemaDefinition
            {
                ItemId = ProductId, SchemaName = "Product", CollectionName = "Products", SchemaType = SchemaType.Entity,
                ReadAccessLevel = SchemaAccessLevel.Custom,
                WriteAccessLevel = SchemaAccessLevel.User,
                EditAccessLevel = SchemaAccessLevel.User,
                DeleteAccessLevel = SchemaAccessLevel.User,
                Fields =
                [
                    new FieldDefinition { Name = "ItemId", Type = "String" },
                    new FieldDefinition { Name = "Title", Type = "String", IsUniqueData = true },
                    new FieldDefinition { Name = "Price", Type = "Float" },
                    new FieldDefinition { Name = "Stock", Type = "Int" },
                    new FieldDefinition { Name = "Status", Type = "Enum", EnumValues = ["Draft", "Live"] },
                    new FieldDefinition { Name = "Location", Type = "GeoJson" },
                    new FieldDefinition
                    {
                        Name = "Secret", Type = "String",
                        ReadAccessLevel = SchemaAccessLevel.Custom,
                        WriteAccessLevel = SchemaAccessLevel.Custom,
                        EditAccessLevel = SchemaAccessLevel.Custom,
                    },
                    new FieldDefinition { Name = "Owner", Type = "String" },
                    // Public on purpose: the nested fields of a DTO field that inherits Custom read come back null for everybody,
                    // admin included, today. Reading Address as a plain nested object is what these cases need.
                    new FieldDefinition { Name = "Address", Type = "Address", ReadAccessLevel = SchemaAccessLevel.Public },
                    new FieldDefinition { Name = "Tags", Type = "String", IsArray = true },
                ],
            },
            new SchemaDefinition
            {
                ItemId = NoteId, SchemaName = "Note", CollectionName = "Notes", SchemaType = SchemaType.Entity,
                ReadAccessLevel = SchemaAccessLevel.Public,
                Fields = [new FieldDefinition { Name = "ItemId", Type = "String" }, new FieldDefinition { Name = "Text", Type = "String" }],
            },
        ],
        Validations =
        [
            new DataValidation
            {
                ItemId = "lockin-validation-title", SchemaId = ProductId, FieldName = "Title",
                Validations = [new ValidationRule { Type = ValidationType.NotEmpty, IsActive = true }],
            },
        ],
        Policies =
        [
            // Row-level read, two rule sets: an admin sees every row; anybody else only the rows they own.
            Draft(PolicyType.RLS, PolicyOperation.READ, [], Group(PolicyLogicalOperator.AND, IsAdmin()), "read-admin"),
            Draft(PolicyType.RLS, PolicyOperation.READ, [],
                Group(PolicyLogicalOperator.AND, Rule(ConditionSource.AUTH, "userid", PolicyOperator.EQUAL, ConditionSource.SCHEMA_FIELD, rightOperand: "Owner")),
                "read-owner"),
            // Field-level: only an admin gets Secret on read, and may send it on write and edit.
            Draft(PolicyType.CLS, PolicyOperation.READ, ["Secret"], Group(PolicyLogicalOperator.AND, IsAdmin()), "secret-read"),
            Draft(PolicyType.CLS, PolicyOperation.WRITE, ["Secret"], Group(PolicyLogicalOperator.AND, IsAdmin()), "secret-write"),
            Draft(PolicyType.CLS, PolicyOperation.EDIT, ["Secret"], Group(PolicyLogicalOperator.AND, IsAdmin()), "secret-edit"),
        ],
        Seed = new()
        {
            ["Products"] =
            [
                Product("p1", "Alpha", 10.5, 5, "Draft", 8.5417, 47.3769, "s-one", "u1", "Zurich", "8000", ["red", "new"]),
                Product("p2", "Bravo", 20.0, 0, "Draft", 8.3093, 47.0502, "s-two", "u2", "Lucerne", "6000", ["blue"]),
                Product("p3", "Charlie", 30.25, 12, "Live", 8.5817, 47.3769, "s-three", "u1", "Zurich", "8004", []),
            ],
            ["Notes"] =
            [
                new BsonDocument { { "_id", "n1" }, { "ItemId", "n1" }, { "Text", "Hello" }, { "IsDeleted", false } },
            ],
        },
        GeoIndexes = [("Products", "Location")],
    };

    private static PolicyRule IsAdmin() => Rule(ConditionSource.AUTH, "roles", PolicyOperator.CONTAIN, staticValue: "admin");

    private static DataAccessPolicy Draft(PolicyType type, PolicyOperation operation, string[] fields, PolicyRuleGroup group, string name)
    {
        var policy = Policy(type, operation, fields, group, priority: 1, name: name);
        policy.ItemId = "lockin-policy-" + name;
        policy.SchemaId = ProductId;
        policy.SchemaName = "Product";
        return policy;
    }

    private static BsonDocument Product(string id, string title, double price, int stock, string status, double lon, double lat, string secret, string owner, string city, string zip, string[] tags) =>
        new()
        {
            { "_id", id },
            { "ItemId", id },
            { "Title", title },
            { "Price", price },
            { "Stock", stock },
            { "Status", status },
            { "Location", new BsonDocument { { "type", "Point" }, { "coordinates", new BsonArray { lon, lat } } } },
            { "Secret", secret },
            { "Owner", owner },
            { "Address", new BsonDocument { { "City", city }, { "Zip", zip } } },
            { "Tags", new BsonArray(tags) },
            { "IsDeleted", false },
        };
}
