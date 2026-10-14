using Blocks.DataAccess.Entities;
using Blocks.DataAccess.Models;
using Blocks.DataAccess.Policies;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataAccess;

/// <summary>
/// Pins the resolver to the behaviour the gateway's query and mutation services had before the
/// evaluation code moved here, including the two quirks that were kept on purpose: the READ gate
/// honours <c>ALL</c> policies while the mutation gate ignores them, and the root tenant bypasses
/// everything.
/// </summary>
public class DataAccessPolicyResolverTests
{
    private static readonly IDataAccessPolicyResolver Resolver = new DataAccessPolicyResolver(new SchemaPolicySource());

    private static AccessPrincipal User(bool root = false, bool authenticated = true, params string[] roles) =>
        new("user-1", "user@x.com", "tenant-1", "org-1", roles, [], authenticated, root) { HasContext = true };

    private static DataAccessPolicy RolePolicy(PolicyOperation operation, string role, PolicyType type = PolicyType.RLS, string[]? fields = null) =>
        Policy(type, operation, fields ?? [],
            Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.AUTH, "roles", PolicyOperator.CONTAIN, ConditionSource.STATIC_VALUE, staticValue: role)));

    private static DataAccessPolicy OwnerPolicy(PolicyOperation operation) =>
        Policy(PolicyType.RLS, operation, [],
            Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, ConditionSource.AUTH, "userId")));

    // ---- Check: READ gate (former QueryService.EvaluateRlsPolicies) ----

    [Fact]
    public void Check_Read_PublicSchema_Grants()
    {
        var schema = Schema(read: SchemaAccessLevel.Public);
        Resolver.Check(new SchemaAccessRequest(User(), schema, PolicyOperation.READ)).IsAccessGranted.Should().BeTrue();
    }

    [Fact]
    public void Check_Read_CustomWithoutPolicies_Denies()
    {
        var schema = Schema(read: SchemaAccessLevel.Custom);
        Resolver.Check(new SchemaAccessRequest(User(), schema, PolicyOperation.READ)).IsAccessGranted.Should().BeFalse();
    }

    [Fact]
    public void Check_Read_RootTenant_BypassesCustom()
    {
        var schema = Schema(read: SchemaAccessLevel.Custom);
        Resolver.Check(new SchemaAccessRequest(User(root: true), schema, PolicyOperation.READ)).IsAccessGranted.Should().BeTrue();
    }

    [Fact]
    public void Check_Read_AllOperationPolicy_Applies()
    {
        var schema = Schema(read: SchemaAccessLevel.Custom, policies: [RolePolicy(PolicyOperation.ALL, "admin")]);

        Resolver.Check(new SchemaAccessRequest(User(roles: "admin"), schema, PolicyOperation.READ)).IsAccessGranted.Should().BeTrue();
        Resolver.Check(new SchemaAccessRequest(User(roles: "guest"), schema, PolicyOperation.READ)).IsAccessGranted.Should().BeFalse();
    }

    // ---- Check: mutation gate (former MutationService.EvaluateRlsPolicies) ----

    [Fact]
    public void Check_Edit_AllOperationPolicy_IsIgnored_AsBefore()
    {
        var schema = Schema(edit: SchemaAccessLevel.Custom, policies: [RolePolicy(PolicyOperation.ALL, "admin")]);
        Resolver.Check(new SchemaAccessRequest(User(roles: "admin"), schema, PolicyOperation.EDIT)).IsAccessGranted.Should().BeFalse();
    }

    [Fact]
    public void Check_Edit_EditPolicy_Evaluates()
    {
        var schema = Schema(edit: SchemaAccessLevel.Custom, policies: [RolePolicy(PolicyOperation.EDIT, "admin")]);

        Resolver.Check(new SchemaAccessRequest(User(roles: "admin"), schema, PolicyOperation.EDIT)).IsAccessGranted.Should().BeTrue();
        Resolver.Check(new SchemaAccessRequest(User(roles: "guest"), schema, PolicyOperation.EDIT)).IsAccessGranted.Should().BeFalse();
    }

    [Fact]
    public void Check_Write_NonCustomLevel_Grants()
    {
        var schema = Schema(write: SchemaAccessLevel.User);
        Resolver.Check(new SchemaAccessRequest(User(), schema, PolicyOperation.WRITE)).IsAccessGranted.Should().BeTrue();
    }

    // ---- Filters ----

    [Fact]
    public void BuildReadFilter_Custom_CombinesUserFilterWithRlsFilter()
    {
        var schema = Schema(read: SchemaAccessLevel.Custom, policies: [OwnerPolicy(PolicyOperation.READ)]);
        var request = new SchemaAccessRequest(User(), schema, PolicyOperation.READ);
        var rls = Resolver.Check(request);
        rls.IsAccessGranted.Should().BeTrue();
        rls.DataFilter.ToJson().Should().Be(new BsonDocument("CreatedBy", "user-1").ToJson());

        var filter = Resolver.BuildReadFilter(request, new BsonDocument("Name", "A"), rls);

        filter["$and"].AsBsonArray.Should().HaveCount(2);
        filter["$and"].AsBsonArray.Should().Contain(new BsonDocument("CreatedBy", "user-1"));
    }

    [Fact]
    public void BuildReadFilter_Custom_EmptyUserFilter_ReturnsRlsFilterAlone()
    {
        var schema = Schema(read: SchemaAccessLevel.Custom, policies: [OwnerPolicy(PolicyOperation.READ)]);
        var request = new SchemaAccessRequest(User(), schema, PolicyOperation.READ);
        var rls = Resolver.Check(request);

        Resolver.BuildReadFilter(request, new BsonDocument(), rls).ToJson().Should().Be(new BsonDocument("CreatedBy", "user-1").ToJson());
    }

    [Fact]
    public void BuildReadFilter_NonCustom_MapsItemIdToUnderscoreId()
    {
        var schema = Schema(read: SchemaAccessLevel.Public);
        var request = new SchemaAccessRequest(User(), schema, PolicyOperation.READ);

        var filter = Resolver.BuildReadFilter(request, new BsonDocument("ItemId", "x"), Resolver.Check(request));

        filter.ToJson().Should().Be(new BsonDocument("_id", "x").ToJson());
    }

    [Fact]
    public void ApplyMutationFilter_Custom_AndsRlsFilter_NonCustom_ReturnsBase()
    {
        var baseFilter = new BsonDocument("Name", "A");
        var rls = new PolicyEvaluationResult { IsAccessGranted = true, RequiresDataFilter = true, DataFilter = new BsonDocument("CreatedBy", "user-1") };

        var custom = Schema(edit: SchemaAccessLevel.Custom);
        Resolver.ApplyMutationFilter(new SchemaAccessRequest(User(), custom, PolicyOperation.EDIT), baseFilter, rls)["$and"].AsBsonArray.Should().HaveCount(2);

        var open = Schema(edit: SchemaAccessLevel.Public);
        Resolver.ApplyMutationFilter(new SchemaAccessRequest(User(), open, PolicyOperation.EDIT), baseFilter, rls).Should().BeSameAs(baseFilter);
    }

    // ---- Projection + row masking ----

    [Fact]
    public void MaskRow_ClsPolicyNotSatisfied_NullsProtectedField_AndSatisfied_KeepsIt()
    {
        var schema = Schema(
            read: SchemaAccessLevel.Custom,
            fields: [Field("Name", read: SchemaAccessLevel.Public), Field("Salary", "Int", read: SchemaAccessLevel.Custom)],
            policies: [RolePolicy(PolicyOperation.READ, "hr", PolicyType.CLS, ["Salary"])]);

        Dictionary<string, object> Row() => new() { ["_id"] = "1", ["Name"] = "Alice", ["Salary"] = 100 };

        var denied = new SchemaAccessRequest(User(roles: "staff"), schema, PolicyOperation.READ);
        var deniedProjection = Resolver.BuildReadProjection(denied, ["Name", "Salary"]);
        deniedProjection.ClsReadPolicies.Should().HaveCount(1);
        var maskedRow = Resolver.MaskRow(denied, Row(), deniedProjection);
        maskedRow["Name"].Should().Be("Alice");
        maskedRow["Salary"].Should().BeNull();

        var allowed = new SchemaAccessRequest(User(roles: "hr"), schema, PolicyOperation.READ);
        var allowedRow = Resolver.MaskRow(allowed, Row(), Resolver.BuildReadProjection(allowed, ["Name", "Salary"]));
        allowedRow["Salary"].Should().Be(100);
    }

    [Fact]
    public void MaskRow_RootTenant_LeavesRowUntouched()
    {
        var schema = Schema(
            read: SchemaAccessLevel.Custom,
            fields: [Field("Salary", "Int", read: SchemaAccessLevel.Custom)],
            policies: [RolePolicy(PolicyOperation.READ, "hr", PolicyType.CLS, ["Salary"])]);
        var request = new SchemaAccessRequest(User(root: true), schema, PolicyOperation.READ);
        var projection = Resolver.BuildReadProjection(request, ["Salary"]);
        projection.ClsReadPolicies.Should().BeEmpty();

        var row = new Dictionary<string, object> { ["_id"] = "1", ["Salary"] = 100 };
        Resolver.MaskRow(request, row, projection).Should().BeSameAs(row);
        row["Salary"].Should().Be(100);
    }

    // ---- Input restriction ----

    [Fact]
    public void RestrictInput_UserLevelField_IsRemovedForAnonymousCaller()
    {
        var schema = Schema(write: SchemaAccessLevel.Public, fields: [Field("Name"), Field("Email", write: SchemaAccessLevel.User)]);
        var input = new Dictionary<string, object?> { ["Name"] = "a", ["Email"] = "e" };

        var restriction = Resolver.RestrictInput(new SchemaAccessRequest(User(authenticated: false), schema, PolicyOperation.WRITE), input);

        restriction.RemovedFieldNames.Should().Equal("Email");
        input.Should().ContainKey("Name").And.NotContainKey("Email");
    }

    [Fact]
    public void RestrictInput_AuthenticatedCaller_KeepsUserLevelField()
    {
        var schema = Schema(write: SchemaAccessLevel.Public, fields: [Field("Name"), Field("Email", write: SchemaAccessLevel.User)]);
        var input = new Dictionary<string, object?> { ["Name"] = "a", ["Email"] = "e" };

        var restriction = Resolver.RestrictInput(new SchemaAccessRequest(User(), schema, PolicyOperation.WRITE), input);

        restriction.RemovedFieldNames.Should().BeEmpty();
        input.Should().HaveCount(2);
    }

    // ---- ListAllowed ----

    [Fact]
    public void ListAllowed_PublicSchema_AllOperations_CustomWithoutPolicies_None()
    {
        Resolver.ListAllowed(User(), Schema()).Should().BeEquivalentTo(
            [PolicyOperation.READ, PolicyOperation.WRITE, PolicyOperation.EDIT, PolicyOperation.DELETE]);

        var locked = Schema(read: SchemaAccessLevel.Custom, write: SchemaAccessLevel.Custom, edit: SchemaAccessLevel.Custom, delete: SchemaAccessLevel.Custom);
        Resolver.ListAllowed(User(), locked).Should().BeEmpty();
    }
}
