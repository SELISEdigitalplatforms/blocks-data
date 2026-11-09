using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Schemas;
using DataGateway.DomainService.Services;
using Blocks.Genesis.DataAccess.Rules;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Newtonsoft.Json;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

public class EntityViewBuilderTests
{
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

    private static FieldDefinition Field(string name, string type = "String") => new() { Name = name, Type = type };

    private static DataValidation Rules(string schemaId, string field, params ValidationRule[] rules) => new()
    {
        ItemId = $"val-{schemaId}-{field}",
        SchemaId = schemaId,
        FieldName = field,
        Validations = [.. rules]
    };

    private static DataAccessPolicy Policy(string schemaId) => new()
    {
        ItemId = $"pol-{schemaId}",
        SchemaId = schemaId,
        PolicyName = $"Policy of {schemaId}",
        PolicyType = PolicyType.RLS
    };

    private static SchemaSource ViewOf(IReadOnlyList<(string SchemaName, SchemaSource Source)> views, string name) =>
        views.Single(v => v.SchemaName == name).Source;

    private static string[] Names(SchemaSource source) => source.SchemaDefinitions.Select(s => s.SchemaName).OrderBy(n => n).ToArray();

    [Fact]
    public void Build_IncludesNestedDtosTransitively()
    {
        var source = new SchemaSource
        {
            SchemaDefinitions =
            [
                Entity("Order", Field("Name"), Field("Shipping", "Address")),
                Dto("Address", Field("Street"), Field("Geo", "GeoPoint")),
                Dto("GeoPoint", Field("Lat", "Float")),
                Dto("Unrelated", Field("X"))
            ],
            DataValidations = [Rules("id-GeoPoint", "Lat"), Rules("id-Unrelated", "X")],
            DataAccessPolicies = [Policy("id-Address"), Policy("id-Unrelated")]
        };

        var view = ViewOf(EntityViewBuilder.Build(source), "Order");

        Names(view).Should().Equal("Address", "GeoPoint", "Order");
        view.DataValidations.Select(v => v.SchemaId).Should().BeEquivalentTo(["id-GeoPoint"]);
        view.DataAccessPolicies.Select(p => p.SchemaId).Should().BeEquivalentTo(["id-Address"]);
    }

    [Fact]
    public void Build_IncludesReferenceTargetsAndTheirPolicies()
    {
        var lookup = new ValidationRule { Type = ValidationType.Reference, Value = "Customer", SecondaryValue = "ItemId", IsActive = true };
        var inactive = new ValidationRule { Type = ValidationType.Reference, Value = "Product", SecondaryValue = "ItemId", IsActive = false };
        var system = new ValidationRule { Type = ValidationType.Reference, Value = "UserAccount", SecondaryValue = "ItemId", IsActive = true };
        var source = new SchemaSource
        {
            SchemaDefinitions =
            [
                Entity("Order", Field("CustomerId"), Field("ProductId"), Field("OwnerId")),
                Entity("Customer", Field("Status")),
                Entity("Product", Field("Sku")),
                Entity("Other", Field("Y"))
            ],
            DataValidations =
            [
                Rules("id-Order", "CustomerId", lookup),
                Rules("id-Order", "ProductId", inactive),
                Rules("id-Order", "OwnerId", system),
                Rules("id-Customer", "Status"),
                Rules("id-Other", "Y")
            ],
            DataAccessPolicies = [Policy("id-Customer"), Policy("id-Product"), Policy("id-Other")],
            SystemEntitySchemas =
            [
                new SchemaDefinition { ItemId = "sys-1", SchemaName = "UserAccount", SchemaType = SchemaType.Entity, IsSystemEntity = true, Fields = [Field("Email")] },
                new SchemaDefinition { ItemId = "sys-2", SchemaName = "Unreferenced", SchemaType = SchemaType.Entity, IsSystemEntity = true, Fields = [Field("Z")] }
            ]
        };

        var views = EntityViewBuilder.Build(source);
        var order = ViewOf(views, "Order");

        Names(order).Should().Equal("Customer", "Order");
        // Customer's own rules stay out: a view only validates writes to its own entity.
        order.DataValidations.Select(v => v.SchemaId).Should().BeEquivalentTo(["id-Order", "id-Order", "id-Order"]);
        order.DataAccessPolicies.Select(p => p.SchemaId).Should().BeEquivalentTo(["id-Customer"]);
        order.SystemEntitySchemas.Select(s => s.SchemaName).Should().Equal("UserAccount");

        // An entity with no rules of its own pulls in nothing else.
        Names(ViewOf(views, "Other")).Should().Equal("Other");
        ViewOf(views, "Other").SystemEntitySchemas.Should().BeEmpty();
    }

    [Fact]
    public void Build_DtoOnlySchema_GetsNoView()
    {
        var source = new SchemaSource
        {
            SchemaDefinitions = [Entity("Order", Field("Name")), Dto("Address", Field("Street"))]
        };

        var views = EntityViewBuilder.Build(source);

        views.Select(v => v.SchemaName).Should().Equal("Order");
    }

    [Fact]
    public void Build_CyclicDtos_Terminates()
    {
        var source = new SchemaSource
        {
            SchemaDefinitions =
            [
                Entity("Node", Field("Child", "A")),
                Dto("A", Field("B", "B"), Field("Self", "A")),
                Dto("B", Field("A", "A"))
            ]
        };

        var view = ViewOf(EntityViewBuilder.Build(source), "Node");

        Names(view).Should().Equal("A", "B", "Node");
    }

    [Fact]
    public void Build_LookupChain_ViewIsSelfContained()
    {
        var toCustomer = new ValidationRule { Type = ValidationType.Reference, Value = "Customer", SecondaryValue = "ItemId", IsActive = true };
        var toRegion = new ValidationRule { Type = ValidationType.Reference, Value = "Region", SecondaryValue = "ItemId", IsActive = true };
        var source = new SchemaSource
        {
            SchemaDefinitions =
            [
                Entity("Order", Field("CustomerId")),
                Entity("Customer", Field("Status"), Field("RegionId")),
                Entity("Region", Field("Code"))
            ],
            DataValidations = [Rules("id-Order", "CustomerId", toCustomer), Rules("id-Customer", "RegionId", toRegion)],
            DataAccessPolicies = [Policy("id-Order"), Policy("id-Customer"), Policy("id-Region")]
        };

        var order = ViewOf(EntityViewBuilder.Build(source), "Order");

        Names(order).Should().Equal("Customer", "Order");
        order.SchemaDefinitions.Single(s => s.SchemaName == "Customer").Fields.Select(f => f.Name).Should().Equal("Status", "RegionId");
        order.DataValidations.Select(v => v.SchemaId).Should().Equal("id-Order");
        order.DataAccessPolicies.Select(p => p.SchemaId).Should().BeEquivalentTo(["id-Order", "id-Customer"]);

        var assembled = SchemaAssembler.Assemble(order);
        var build = () => ReferenceTargets.Build(assembled, strict: true, NullLogger.Instance);
        build.Should().NotThrow();
    }

    [Fact]
    public void Build_MiniSourceAssemblesLikeFull()
    {
        BlocksTestContext.Set();
        var street = new ValidationRule { Type = ValidationType.NotEmpty, IsActive = true };
        var source = new SchemaSource
        {
            SchemaDefinitions =
            [
                // A DTO field reached through the entity is a dotted row on the entity, next to the DTO's own schema.
                Entity("Order", Field("Name"), Field("Ship", "Address"),
                    new FieldDefinition { Name = "Ship.Street", Type = "String", IsReferenceField = true, ReferenceFieldType = "Address" }),
                Dto("Address", Field("Street"), Field("City")),
                Entity("Other", Field("Y"))
            ],
            DataValidations =
            [
                Rules("id-Order", "Ship.Street", street),
                Rules("id-Address", "Street", street),
                Rules("id-Order", "Name", new ValidationRule { Type = ValidationType.NotEmpty, IsActive = true }),
                Rules("id-Other", "Y", street)
            ],
            DataAccessPolicies =
            [
                new DataAccessPolicy { ItemId = "pol-cls", SchemaId = "id-Order", PolicyName = "Hide name", PolicyType = PolicyType.CLS, Operation = PolicyOperation.READ, FieldNames = ["Name"] },
                new DataAccessPolicy { ItemId = "pol-rls", SchemaId = "id-Order", PolicyName = "Own rows", PolicyType = PolicyType.RLS, Operation = PolicyOperation.READ },
                new DataAccessPolicy { ItemId = "pol-other", SchemaId = "id-Other", PolicyName = "Other", PolicyType = PolicyType.RLS, Operation = PolicyOperation.READ }
            ]
        };

        // Assembling modifies definitions, so each side gets its own copy.
        var full = SchemaAssembler.Assemble(SchemaSnapshotStore.Unpack(SchemaSnapshotStore.Pack(source).CompressedBytes))
            .Single(s => s.SchemaName == "Order");
        var mini = SchemaAssembler.Assemble(SchemaSnapshotStore.Unpack(SchemaSnapshotStore.Pack(ViewOf(EntityViewBuilder.Build(source), "Order")).CompressedBytes))
            .Single(s => s.SchemaName == "Order");

        mini.Fields.Single(f => f.Name == "Ship").Fields.Single(f => f.Name == "Street").ValidationRule.Should().NotBeNull();
        mini.Policies.Should().NotBeEmpty();
        mini.Policies.Select(p => p.ItemId).Should().Equal(full.Policies.Select(p => p.ItemId));
        JsonConvert.SerializeObject(mini).Should().Be(JsonConvert.SerializeObject(full));
    }
}
