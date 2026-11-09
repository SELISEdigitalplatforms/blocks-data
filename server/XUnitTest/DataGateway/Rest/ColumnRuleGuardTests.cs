using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Schemas;
using DataGateway.Rest.Access;
using XUnitTest.Infrastructure;
using FluentAssertions;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Rest;

/// <summary>
/// A field a read column rule protects may not be filtered or sorted on: the rows a filter keeps (or the order a sort
/// gives) would reveal the masked value. Selecting it is not refused; it is masked per row, as GraphQL does.
/// </summary>
public class ColumnRuleGuardTests
{
    private static readonly AccessPrincipal Caller =
        new("u1", "u1@test", "tenant-1", "org-1", [], [], IsAuthenticated: true, IsRootTenant: false);

    /// <summary>
    /// Person with a read column rule (admins only) on each group of <paramref name="protectedFields"/>. <c>Salary</c>,
    /// <c>Contact</c> and <c>Contact.Phone</c> have the Custom read level, as fields with column rules of their own do;
    /// <c>Name</c> and <c>Contact.Email</c> are left at Inherited.
    /// </summary>
    private static EntityModel Person(params string[][] protectedFields)
    {
        var policies = protectedFields
            .Select((fields, i) => Policy(PolicyType.CLS, PolicyOperation.READ, fields,
                Group(PolicyLogicalOperator.AND, Rule(ConditionSource.AUTH, "roles", PolicyOperator.CONTAIN, staticValue: "admin")),
                priority: 1, name: "cls-" + i))
            .ToList();
        var schema = Schema(
            read: SchemaAccessLevel.Public,
            fields:
            [
                Field("ItemId"),
                Field("Name"),
                Field("Salary", "Float", read: SchemaAccessLevel.Custom),
                Field("Contact", "Contact", read: SchemaAccessLevel.Custom,
                    children: [Field("Email"), Field("Phone", read: SchemaAccessLevel.Custom)]),
                Field("Address", "Address", children: [Field("City")]),
            ],
            policies: policies);
        return new EntityModel(schema, null);
    }

    private static EntityModel Standard() => Person(["Salary"], ["Contact"]);

    private static WhereNode Where(Dictionary<string, object?> root) => new(root);

    private static Dictionary<string, object?> Eq(object value) => new() { ["eq"] = value };

    private static void Check(EntityModel entity, WhereNode? where, IReadOnlyList<OrderItem>? order = null, AccessPrincipal? principal = null)
        => ColumnRuleGuard.Check(Resolver(), principal ?? Caller, entity, where, order);

    [Fact]
    public void Where_OnProtectedField_IsForbidden()
    {
        var act = () => Check(Standard(), Where(new() { ["Salary"] = Eq(100.0) }));

        act.Should().Throw<GatewayException>()
            .Where(e => e.Code == "FORBIDDEN" && e.Message.Contains("'Salary'"));
    }

    [Fact]
    public void Where_OnProtectedFieldInsideAndOr_IsForbidden()
    {
        var where = Where(new()
        {
            ["and"] = new List<object?>
            {
                new Dictionary<string, object?> { ["Name"] = Eq("Ann") },
                new Dictionary<string, object?>
                {
                    ["or"] = new List<object?> { new Dictionary<string, object?> { ["Salary"] = Eq(1.0) } },
                },
            },
        });

        var act = () => Check(Standard(), where);

        act.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN");
    }

    [Fact]
    public void Where_OnFieldInsideProtectedDto_IsForbidden()
    {
        var where = Where(new() { ["Contact"] = new Dictionary<string, object?> { ["Email"] = Eq("a@b.c") } });

        var act = () => Check(Standard(), where);

        act.Should().Throw<GatewayException>()
            .Where(e => e.Code == "FORBIDDEN" && e.Message.Contains("'Contact.Email'"));
    }

    [Fact]
    public void Where_OnProtectedNestedPath_IsForbidden()
    {
        var where = Where(new() { ["Contact"] = new Dictionary<string, object?> { ["Phone"] = Eq("1") } });

        var act = () => Check(Person(["Contact.Phone"]), where);

        act.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN");
    }

    [Fact]
    public void Where_OnSiblingOfProtectedNestedPath_IsAllowed()
    {
        var where = Where(new() { ["Contact"] = new Dictionary<string, object?> { ["Email"] = Eq("a@b.c") } });

        var act = () => Check(Person(["Contact.Phone"]), where);

        act.Should().NotThrow();
    }

    [Fact]
    public void Where_OnInheritedScalarCoveredOnlyByRowRuleCopies_IsAllowed()
    {
        // Schema assembly gives every inherited scalar field of a Custom-read entity a copy of the row rules as a read
        // column policy; the row rules already hide the rows those copies would mask.
        var act = () => Check(Person(["Name"], ["Contact.Email"]),
            Where(new()
            {
                ["Name"] = Eq("Ann"),
                ["Contact"] = new Dictionary<string, object?> { ["Email"] = Eq("a@b.c") },
            }),
            [new OrderItem("Name", SortDirection.ASC)]);

        act.Should().NotThrow();
    }

    [Fact]
    public void Where_InsideInheritedDtoWithItsOwnColumnRule_IsForbidden()
    {
        // A policy on a whole DTO is a column rule of its own even when the DTO field is left at Inherited.
        var where = Where(new() { ["Address"] = new Dictionary<string, object?> { ["City"] = Eq("Bern") } });

        var act = () => Check(Person(["Address"]), where);

        act.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN");
    }

    [Fact]
    public void Order_OnProtectedField_IsForbidden()
    {
        var act = () => Check(Standard(), null, [new OrderItem("Name", SortDirection.ASC), new OrderItem("Salary", SortDirection.DESC)]);

        act.Should().Throw<GatewayException>()
            .Where(e => e.Code == "FORBIDDEN" && e.Message.Contains("'Salary'"));
    }

    [Fact]
    public void Order_OnDtoWithProtectedChild_IsForbidden()
    {
        // The DTO itself is left at Inherited; only a field inside it has a column rule. A sort on the whole DTO
        // orders by that field too, so it is refused like a sort on the field (defense in depth: the parser already
        // refuses a sort on a DTO).
        var schema = Schema(
            read: SchemaAccessLevel.Public,
            fields:
            [
                Field("ItemId"),
                Field("Name"),
                Field("Address", "Address", children: [Field("City", read: SchemaAccessLevel.Custom), Field("Street")]),
            ],
            policies: [Policy(PolicyType.CLS, PolicyOperation.READ, ["Address.City"], AdminOnly(), priority: 1, name: "city")]);
        var entity = new EntityModel(schema, null);

        var byOrder = () => Check(entity, null, [new OrderItem("Address", SortDirection.ASC)]);
        var onSibling = () => Check(entity, Where(new() { ["Address"] = new Dictionary<string, object?> { ["Street"] = Eq("Main") } }));

        byOrder.Should().Throw<GatewayException>()
            .Where(e => e.Code == "FORBIDDEN"
                        && e.Message == "Field 'Address' cannot be used in 'where' or 'order': a column access rule protects it.");
        onSibling.Should().NotThrow();
    }

    [Fact]
    public void Order_OnDtoWithMaskedChild_IsForbidden()
    {
        // The masker hides a User-level field from an anonymous caller without any policy; a sort on its DTO is refused.
        var entity = new EntityModel(Schema(fields:
        [
            Field("ItemId"),
            Field("Contact", "Contact", children: [Field("Email", read: SchemaAccessLevel.User), Field("Phone")]),
        ]), null);

        var anonymous = () => Check(entity, null, [new OrderItem("Contact", SortDirection.ASC)], AnonymousCaller);
        var signedIn = () => Check(entity, null, [new OrderItem("Contact", SortDirection.ASC)]);

        anonymous.Should().Throw<GatewayException>()
            .Where(e => e.Code == "FORBIDDEN"
                        && e.Message == "Field 'Contact' cannot be used in 'where' or 'order': a column access rule protects it.");
        signedIn.Should().NotThrow();
    }

    [Fact]
    public void WhereAndOrder_OnUnprotectedFields_AreAllowed()
    {
        var act = () => Check(Standard(), Where(new() { ["Name"] = Eq("Ann") }), [new OrderItem("Name", SortDirection.ASC)]);

        act.Should().NotThrow();
    }

    private static readonly AccessPrincipal AnonymousCaller =
        new(null, null, "tenant-1", null, [], [], IsAuthenticated: false, IsRootTenant: false);

    private static PolicyRuleGroup AdminOnly() =>
        Group(PolicyLogicalOperator.AND, Rule(ConditionSource.AUTH, "roles", PolicyOperator.CONTAIN, staticValue: "admin"));

    [Fact]
    public void ColumnRule_WhereOnCustomFieldWithoutPolicy_403()
    {
        // The masker nulls a Custom field no column policy covers (once the entity has any column policy).
        var schema = Schema(
            fields: [Field("ItemId"), Field("Name"), Field("Salary", "Float", read: SchemaAccessLevel.Custom), Field("Bonus", "Float", read: SchemaAccessLevel.Custom)],
            policies: [Policy(PolicyType.CLS, PolicyOperation.READ, ["Salary"], AdminOnly(), priority: 1, name: "salary")]);
        var entity = new EntityModel(schema, null);

        var onBonus = () => Check(entity, Where(new() { ["Bonus"] = Eq(1.0) }));
        var onBonusOrder = () => Check(entity, null, [new OrderItem("Bonus", SortDirection.ASC)]);
        var onName = () => Check(entity, Where(new() { ["Name"] = Eq("Ann") }));

        onBonus.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN" && e.Message.Contains("'Bonus'"));
        onBonusOrder.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN");
        onName.Should().NotThrow();
    }

    [Fact]
    public void ColumnRule_WhereInsideCustomDtoWithoutPolicy_403()
    {
        var schema = Schema(
            fields: [Field("Name", read: SchemaAccessLevel.Custom), Field("Contact", "Contact", read: SchemaAccessLevel.Custom, children: [Field("Email")])],
            policies: [Policy(PolicyType.CLS, PolicyOperation.READ, ["Name"], AdminOnly(), priority: 1, name: "name")]);

        var act = () => Check(new EntityModel(schema, null), Where(new() { ["Contact"] = new Dictionary<string, object?> { ["Email"] = Eq("a@b.c") } }));

        act.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN" && e.Message.Contains("'Contact.Email'"));
    }

    [Fact]
    public void ColumnRule_CustomReadEntityWithoutColumnPolicies_RefusesAllButItemId()
    {
        // With no column policy on a Custom-read entity the masker keeps only the id.
        var entity = new EntityModel(Schema(read: SchemaAccessLevel.Custom, fields: [Field("ItemId"), Field("Name", read: SchemaAccessLevel.Public)]), null);

        var onName = () => Check(entity, Where(new() { ["Name"] = Eq("Ann") }));
        var onId = () => Check(entity, Where(new() { ["ItemId"] = Eq("p1") }));

        onName.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN");
        onId.Should().NotThrow();
    }

    private static EntityModel WithUserField() =>
        new(Schema(fields: [Field("ItemId"), Field("Name"), Field("Email", read: SchemaAccessLevel.User)]), null);

    [Fact]
    public void ColumnRule_AnonymousWhereOnUserField_403()
    {
        var byWhere = () => Check(WithUserField(), Where(new() { ["Email"] = Eq("a@b.c") }), principal: AnonymousCaller);
        var byOrder = () => Check(WithUserField(), null, [new OrderItem("Email", SortDirection.ASC)], AnonymousCaller);
        var onPublicField = () => Check(WithUserField(), Where(new() { ["Name"] = Eq("Ann") }), principal: AnonymousCaller);

        byWhere.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN" && e.Message.Contains("'Email'"));
        byOrder.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN");
        onPublicField.Should().NotThrow();
    }

    [Fact]
    public void ColumnRule_AuthenticatedWhereOnUserField_Allowed()
    {
        var act = () => Check(WithUserField(), Where(new() { ["Email"] = Eq("a@b.c") }), [new OrderItem("Email", SortDirection.ASC)]);

        act.Should().NotThrow();
    }

    [Fact]
    public void ColumnRule_AssembledSchema_RowRuleCopiesAllowed()
    {
        BlocksTestContext.Set(tenantId: "tenant-1");
        const string schemaId = "schema-note";
        var rowRule = Policy(PolicyType.RLS, PolicyOperation.READ, [],
            Group(PolicyLogicalOperator.AND, Rule(ConditionSource.AUTH, "userid", PolicyOperator.EQUAL, ConditionSource.SCHEMA_FIELD, rightOperand: "Owner")),
            priority: 1, name: "read-owner");
        rowRule.ItemId = "policy-read-owner";
        rowRule.SchemaId = schemaId;
        // Authored for a field left at Inherited: assembly replaces it with the row-rule copies.
        var authored = Policy(PolicyType.CLS, PolicyOperation.READ, ["Secret"], AdminOnly(), priority: 1, name: "secret-read");
        authored.ItemId = "policy-authored-secret";
        authored.SchemaId = schemaId;
        var source = new SchemaSource
        {
            SchemaDefinitions =
            [
                new SchemaDefinition
                {
                    ItemId = schemaId, SchemaName = "Note", CollectionName = "Notes", SchemaType = SchemaType.Entity,
                    ReadAccessLevel = SchemaAccessLevel.Custom,
                    Fields =
                    [
                        new FieldDefinition { Name = "ItemId", Type = "String" },
                        new FieldDefinition { Name = "Title", Type = "String" },
                        new FieldDefinition { Name = "Secret", Type = "String" },
                        new FieldDefinition { Name = "Owner", Type = "String" },
                    ],
                },
            ],
            DataAccessPolicies = [rowRule, authored],
        };

        var schema = SchemaAssembler.Assemble(source).Single();
        var entity = new EntityModel(schema, null);

        schema.Policies.Should().NotContain(p => p.ItemId == "policy-authored-secret");
        schema.Policies.Should().Contain(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.READ && p.FieldNames.Contains("Title"));
        var act = () => Check(entity, Where(new() { ["Title"] = Eq("a"), ["Secret"] = Eq("b") }), [new OrderItem("Owner", SortDirection.ASC)]);
        act.Should().NotThrow();
    }

    [Fact]
    public void NoWhereAndNoOrder_IsAllowed()
    {
        var act = () => Check(Standard(), null);

        act.Should().NotThrow();
    }

    [Fact]
    public void RootTenant_IsExempt()
    {
        var root = AccessPrincipal.Anonymous with { IsRootTenant = true };

        var act = () => Check(Standard(), Where(new() { ["Salary"] = Eq(100.0) }), [new OrderItem("Salary", SortDirection.ASC)], root);

        act.Should().NotThrow();
    }

    [Fact]
    public void PathsOf_CollectsLeafPathsOfWhereAndOrder()
    {
        var where = Where(new()
        {
            ["Name"] = Eq("Ann"),
            ["Contact"] = new Dictionary<string, object?> { ["Email"] = Eq("a@b.c") },
            ["or"] = new List<object?> { new Dictionary<string, object?> { ["Salary"] = Eq(1.0) } },
        });

        var paths = ColumnRuleGuard.PathsOf(Standard(), where, [new OrderItem("ItemId", SortDirection.ASC)]);

        paths.Should().BeEquivalentTo(["Name", "Contact.Email", "Salary", "ItemId"]);
    }
}
