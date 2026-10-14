using Blocks.DataAccess.Entities;
using Blocks.DataAccess.Models;
using Blocks.DataAccess.Policies;
using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataAccess;

/// <summary>Rows in SchemaDefinitions and DataAccessPolicys are enough to get the final filter from a schema name.</summary>
[Collection("Mongo")]
public class DataAccessResolverTests
{
    private readonly IMongoDatabase _db;
    private readonly DataAccessResolver _resolver;
    private AccessPrincipal _principal = new("user-1", "user@x.com", "tenant-1", "org-1", [], [], true, false) { HasContext = true };

    public DataAccessResolverTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
        var contextProvider = new Mock<IDbContextProvider>();
        contextProvider.Setup(p => p.GetDatabase("tenant-1")).Returns(_db);
        var principals = new Mock<IAccessPrincipalAccessor>();
        principals.Setup(p => p.Current).Returns(() => _principal);
        _resolver = new DataAccessResolver(contextProvider.Object, new DataAccessPolicyResolver(new SchemaPolicySource()), principals.Object);
    }

    private async Task SeedOrderAsync()
    {
        var schema = new SchemaDefinition
        {
            ItemId = "sch-order",
            SchemaName = "Order",
            ReadAccessLevel = SchemaAccessLevel.Custom,
            EditAccessLevel = SchemaAccessLevel.Custom,
            Fields = [new FieldDefinition { Name = "Status", Type = "String" }, new FieldDefinition { Name = "CreatedBy", Type = "String" }]
        };
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertOneAsync(schema);

        var owner = Policy(PolicyType.RLS, PolicyOperation.READ, [],
            Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, ConditionSource.AUTH, "userId")));
        owner.ItemId = "pol-owner";
        owner.SchemaId = schema.ItemId;

        var deleted = Policy(PolicyType.RLS, PolicyOperation.EDIT, [], Group(PolicyLogicalOperator.AND));
        deleted.ItemId = "pol-deleted";
        deleted.SchemaId = schema.ItemId;
        deleted.IsDeleted = true;

        await _db.GetCollection<DataAccessPolicy>("DataAccessPolicys").InsertManyAsync([owner, deleted]);
        await _db.GetCollection<DataValidation>("DataValidations").InsertOneAsync(
            new DataValidation { ItemId = "val-1", SchemaId = schema.ItemId, FieldName = "Status" });
    }

    private async Task SeedProductAsync()
    {
        // Public read, public write; Email may only be written by signed-in users.
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertOneAsync(new SchemaDefinition
        {
            ItemId = "sch-product",
            SchemaName = "Product",
            ReadAccessLevel = SchemaAccessLevel.Public,
            WriteAccessLevel = SchemaAccessLevel.Public,
            EditAccessLevel = SchemaAccessLevel.Public,
            Fields =
            [
                new FieldDefinition { Name = "Name", Type = "String", WriteAccessLevel = SchemaAccessLevel.Public },
                new FieldDefinition { Name = "Email", Type = "String", WriteAccessLevel = SchemaAccessLevel.User, EditAccessLevel = SchemaAccessLevel.User },
            ]
        });
    }

    [Fact]
    public async Task ResolveReadAsync_ReturnsFilterProjectionAndMask()
    {
        await SeedProductAsync();

        var read = await _resolver.ResolveReadAsync("Product", new BsonDocument("ItemId", "p1"), ["Name"]);

        read.IsAccessGranted.Should().BeTrue();
        read.Filter!.ToJson().Should().Be(new BsonDocument("_id", "p1").ToJson());
        read.Projection!.Contains("Name").Should().BeTrue();
        var row = new Dictionary<string, object> { ["_id"] = "p1", ["Name"] = "Pen" };
        read.Mask(row).Should().BeSameAs(row);
        row["Name"].Should().Be("Pen");
    }

    [Fact]
    public async Task ResolveReadAsync_Denied_HasNoFilterAndMaskThrows()
    {
        await SeedOrderAsync();
        _principal = _principal with { UserId = "someone-else" };   // owner policy still grants rows, so deny via a Custom schema with no policy
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").InsertOneAsync(new SchemaDefinition
        {
            ItemId = "sch-locked", SchemaName = "Locked", ReadAccessLevel = SchemaAccessLevel.Custom,
            Fields = [new FieldDefinition { Name = "Name", Type = "String" }]
        });

        var read = await _resolver.ResolveReadAsync("Locked", new BsonDocument(), null);

        read.IsAccessGranted.Should().BeFalse();
        read.Filter.Should().BeNull();
        read.Projection.Should().BeNull();
        var act = () => read.Mask(new Dictionary<string, object>());
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public async Task ResolveProjectionAsync_MatchesReadProjection()
    {
        await SeedProductAsync();

        var read = await _resolver.ResolveReadAsync("Product", new BsonDocument(), ["Name", "Email"]);
        var projection = await _resolver.ResolveProjectionAsync("Product", ["Name", "Email"]);

        projection.IsAccessGranted.Should().BeTrue();
        projection.Projection!.ToJson().Should().Be(read.Projection!.ToJson());
    }

    [Fact]
    public async Task ResolveInsertAsync_RemovesUserOnlyFieldForAnonymousCaller()
    {
        await SeedProductAsync();
        _principal = AccessPrincipal.Anonymous with { TenantId = "tenant-1" };
        var input = new Dictionary<string, object?> { ["Name"] = "Pen", ["Email"] = "x@y" };

        var resolved = await _resolver.ResolveInsertAsync("Product", input);

        resolved.IsAccessGranted.Should().BeTrue();
        resolved.Input.Should().BeSameAs(input);
        resolved.RemovedFields.Should().Equal("Email");
        input.Should().ContainKey("Name").And.NotContainKey("Email");
    }

    [Fact]
    public async Task ResolveInputAsync_SignedInCaller_KeepsEverything()
    {
        await SeedProductAsync();
        var input = new Dictionary<string, object?> { ["Name"] = "Pen", ["Email"] = "x@y" };

        var resolved = await _resolver.ResolveInputAsync("Product", PolicyOperation.EDIT, input);

        resolved.IsAccessGranted.Should().BeTrue();
        resolved.RemovedFields.Should().BeEmpty();
        input.Should().HaveCount(2);
    }

    [Fact]
    public async Task ResolveUpdateAsync_PublicSchema_ReturnsBaseFilterAndInput_CustomWithoutPolicy_Denied()
    {
        await SeedProductAsync();
        await SeedOrderAsync();
        var baseFilter = new BsonDocument("_id", "1");

        var ok = await _resolver.ResolveUpdateAsync("Product", baseFilter, new Dictionary<string, object?> { ["Name"] = "Pen" });
        ok.IsAccessGranted.Should().BeTrue();
        ok.Filter.Should().BeSameAs(baseFilter);
        ok.Input.Should().NotBeNull();

        var denied = await _resolver.ResolveUpdateAsync("Order", baseFilter, new Dictionary<string, object?> { ["Status"] = "x" });
        denied.IsAccessGranted.Should().BeFalse();
        denied.Filter.Should().BeNull();
        denied.Input.Should().BeNull();
    }

    [Fact]
    public async Task ResolveDeleteAsync_CustomWithOwnerPolicy_AndsRlsFilter()
    {
        await SeedOrderAsync();
        var owner = Policy(PolicyType.RLS, PolicyOperation.DELETE, [],
            Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, ConditionSource.AUTH, "userId")));
        owner.ItemId = "pol-delete";
        owner.SchemaId = "sch-order";
        await _db.GetCollection<DataAccessPolicy>("DataAccessPolicys").InsertOneAsync(owner);
        await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").UpdateOneAsync(
            Builders<SchemaDefinition>.Filter.Eq(s => s.ItemId, "sch-order"),
            Builders<SchemaDefinition>.Update.Set(s => s.DeleteAccessLevel, SchemaAccessLevel.Custom));

        var resolved = await _resolver.ResolveDeleteAsync("Order", new BsonDocument("_id", "1"));

        resolved.IsAccessGranted.Should().BeTrue();
        resolved.Filter!["$and"].AsBsonArray.Should().Contain(new BsonDocument("CreatedBy", "user-1"));
    }

    [Fact]
    public async Task LoadSchemaAsync_AttachesStoredPoliciesAndValidations()
    {
        await SeedOrderAsync();

        var schema = await _resolver.LoadSchemaAsync("Order", _principal);

        schema.Should().NotBeNull();
        schema!.ReadAccessLevel.Should().Be(SchemaAccessLevel.Custom);
        schema.Policies.Should().Contain(p => p.ItemId == "pol-owner" && p.PolicyType == PolicyType.RLS);
        // Inherited fields get a column copy of the owner policy, as at publish time.
        schema.Policies.Where(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.READ)
            .SelectMany(p => p.FieldNames).Should().BeEquivalentTo("Status", "CreatedBy");
        schema.Fields.Single(f => f.Name == "Status").ValidationRule!.ItemId.Should().Be("val-1");
        (await _resolver.LoadSchemaAsync("Nope", _principal)).Should().BeNull();
    }

    [Fact]
    public async Task LoadSchemaAsync_MatchesGatewayAssemble_ForTheSameRows()
    {
        await SeedOrderAsync();
        var definitions = await _db.GetCollection<SchemaDefinition>("SchemaDefinitions").Find(d => !d.IsDeleted).ToListAsync();
        var policies = await _db.GetCollection<DataAccessPolicy>("DataAccessPolicys").Find(p => !p.IsDeleted).ToListAsync();
        var validations = await _db.GetCollection<DataValidation>("DataValidations").Find(v => !v.IsDeleted).ToListAsync();
        var expected = GraphqlSchemaBuilder.Assemble(new SchemaSource
            { SchemaDefinitions = definitions, DataAccessPolicies = policies, DataValidations = validations }).Single();

        var actual = await _resolver.LoadSchemaAsync("Order", _principal);

        // Column clones get a fresh ItemId, timestamps and an audit stamp on every assembly (the gateway stamps
        // from the ambient context, the loader from the principal); none of that is evaluated. Everything else must match.
        actual.Should().BeEquivalentTo(expected, o => o
            .Excluding(ctx => ctx.Path.StartsWith("Policies") && (
                ctx.Path.EndsWith("ItemId") || ctx.Path.EndsWith("CreatedBy") || ctx.Path.EndsWith("LastUpdatedBy") || ctx.Path.EndsWith("OrganizationId")))
            .Excluding(ctx => ctx.Path.EndsWith("CreatedDate"))
            .Excluding(ctx => ctx.Path.EndsWith("LastUpdatedDate")));
    }

    [Fact]
    public async Task ResolveReadAsync_CustomSchemaWithOwnerPolicy_MaskKeepsOwnRowFields()
    {
        // The case that fails without the derivation: no column policy is stored, yet the owner must see their fields.
        await SeedOrderAsync();

        var read = await _resolver.ResolveReadAsync("Order", new BsonDocument(), ["Status", "CreatedBy"]);

        read.IsAccessGranted.Should().BeTrue();
        var row = new Dictionary<string, object> { ["_id"] = "1", ["Status"] = "paid", ["CreatedBy"] = "user-1" };
        read.Mask(row);
        row["Status"].Should().Be("paid");
        row["CreatedBy"].Should().Be("user-1");
    }

    [Fact]
    public async Task ResolveReadFilterAsync_FromSchemaNameToFinalFilter()
    {
        await SeedOrderAsync();

        var resolved = await _resolver.ResolveReadFilterAsync("Order", new BsonDocument("Status", "paid"));

        resolved.IsAccessGranted.Should().BeTrue();
        resolved.Filter!["$and"].AsBsonArray.Should().HaveCount(2);
        resolved.Filter["$and"].AsBsonArray.Should().Contain(new BsonDocument("Status", "paid"));
        resolved.Filter["$and"].AsBsonArray.Should().Contain(new BsonDocument("CreatedBy", "user-1"));
    }

    [Fact]
    public async Task ResolveMutationFilterAsync_DeniedWithoutEditPolicy_UnknownSchemaThrows()
    {
        await SeedOrderAsync();

        var edit = await _resolver.ResolveMutationFilterAsync("Order", PolicyOperation.EDIT, new BsonDocument("_id", "1"));
        edit.IsAccessGranted.Should().BeFalse();
        edit.Filter.Should().BeNull();

        var act = () => _resolver.ResolveReadFilterAsync("Missing", new BsonDocument());
        await act.Should().ThrowAsync<KeyNotFoundException>().WithMessage("*Missing*");
    }
}
