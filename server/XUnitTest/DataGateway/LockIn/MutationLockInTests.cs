using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.LockIn;

/// <summary>
/// Characterisation of the gateway's GraphQL mutations: each case runs one mutation as one caller through the real code
/// path and compares the response, the data afterwards, the published events and the request-log summary with a golden
/// file. The files record today's behaviour, right or wrong, so a refactor can prove it changed nothing.
/// </summary>
[Collection("Mongo")]
public class MutationLockInTests
{
    private const string Single = "acknowledged itemId totalImpactedData message";
    private const string Bulk = "acknowledged itemIds totalImpactedData message";

    private const string InsertInput = """{ ItemId: "p9", Title: "Lamp", Price: 5, Status: Live, Address: { City: "Oslo" }, Tags: ["a"] }""";

    private readonly MongoFixture _fixture;

    public MutationLockInTests(MongoFixture fixture) => _fixture = fixture;

    private async Task RunAsync(string caseName, string document, LockInCaller caller, LockInTenant? tenant = null)
    {
        await using var harness = await GatewayLockInHarness.CreateAsync(_fixture, tenant ?? LockInTenant.Standard);

        var result = await harness.ExecuteAsync(document, caller);

        GoldenFile.Match(caseName, result.ToGoldenJson());
    }

    private static string Insert(string input) => $"mutation {{ insertProduct(input: {input}) {{ {Single} }} }}";

    [Fact]
    public Task InsertAllowed() => RunAsync("insert-allowed", Insert(InsertInput), LockInCaller.User("u1"));

    [Fact]
    public Task InsertAnonymous() => RunAsync("insert-anonymous", Insert(InsertInput), LockInCaller.Anonymous);

    [Fact]
    public Task InsertValidation() => RunAsync("insert-validation", Insert("""{ ItemId: "p9", Title: "" }"""), LockInCaller.User("u1"));

    [Fact]
    public Task InsertUnique() => RunAsync("insert-unique", Insert("""{ ItemId: "p9", Title: "Alpha" }"""), LockInCaller.User("u1"));

    [Fact]
    public Task InsertInvalidGeoJson() => RunAsync("insert-invalid-geojson",
        Insert("""{ ItemId: "p9", Title: "Lamp", Location: { type: "Point" } }"""), LockInCaller.User("u1"));

    [Fact]
    public Task InsertClsRefused() => RunAsync("insert-cls-refused",
        Insert("""{ ItemId: "p9", Title: "Lamp", Price: 5, Status: Live, Address: { City: "Oslo" }, Tags: ["a"], Secret: "x" }"""), LockInCaller.User("u1"));

    [Fact]
    public Task UpdateClsRefused() => RunAsync("update-cls-refused", $$"""
        mutation { updateProduct(where: { ItemId: { eq: "p1" } }, input: { Secret: "x" }) { {{Single}} } }
        """, LockInCaller.User("u1"));

    [Fact]
    public Task InsertManyAllowed() => RunAsync("insertMany-allowed", $$"""
        mutation { insertManyProduct(input: [{ ItemId: "p7", Title: "Lamp" }, { ItemId: "p8", Title: "Desk" }]) { {{Bulk}} } }
        """, LockInCaller.User("u1"));

    [Fact]
    public Task InsertManyOneInvalid() => RunAsync("insertMany-one-invalid", $$"""
        mutation { insertManyProduct(input: [{ ItemId: "p7", Title: "Lamp" }, { ItemId: "p8", Title: "" }]) { {{Bulk}} } }
        """, LockInCaller.User("u1"));

    [Fact]
    public Task UpdateAllowed() => RunAsync("update-allowed", $$"""
        mutation { updateProduct(where: { ItemId: { eq: "p1" } }, input: { Price: 9 }) { {{Single}} } }
        """, LockInCaller.User("u1"));

    [Fact]
    public Task UpdateLegacyFilter() => RunAsync("update-legacy-filter", $$"""
        mutation { updateProduct(filter: "{\"_id\":\"p1\"}", input: { Price: 9 }) { {{Single}} } }
        """, LockInCaller.User("u1"));

    [Fact]
    public Task UpdateNotFound() => RunAsync("update-not-found", $$"""
        mutation { updateProduct(where: { ItemId: { eq: "nope" } }, input: { Price: 9 }) { {{Single}} } }
        """, LockInCaller.User("u1"));

    [Fact]
    public Task UpdateRlsHidden() => RunAsync("update-rls-hidden", $$"""
        mutation { updateProduct(where: { ItemId: { eq: "p2" } }, input: { Price: 9 }) { {{Single}} } }
        """, LockInCaller.User("u1"));

    [Fact]
    public Task UpdateUnique() => RunAsync("update-unique", $$"""
        mutation { updateProduct(where: { ItemId: { eq: "p1" } }, input: { Title: "Charlie" }) { {{Single}} } }
        """, LockInCaller.User("u1"));

    [Fact]
    public Task UpdateManyAllowed() => RunAsync("updateMany-allowed", $$"""
        mutation { updateManyProduct(where: { Status: { eq: Draft } }, input: { Stock: 1 }) { {{Single}} } }
        """, LockInCaller.User("u1", "admin"));

    [Fact]
    public Task UpdateManyNone() => RunAsync("updateMany-none", $$"""
        mutation { updateManyProduct(where: { ItemId: { eq: "nope" } }, input: { Stock: 1 }) { {{Single}} } }
        """, LockInCaller.User("u1", "admin"));

    [Fact]
    public Task DeleteSoft() => RunAsync("delete-soft", $$"""
        mutation { deleteProduct(where: { ItemId: { eq: "p1" } }, input: { isHardDelete: false }) { {{Single}} } }
        """, LockInCaller.User("u1"), LockInTenant.WithAuditLog);

    [Fact]
    public Task DeleteHard() => RunAsync("delete-hard", $$"""
        mutation { deleteProduct(where: { ItemId: { eq: "p1" } }, input: { isHardDelete: true }) { {{Single}} } }
        """, LockInCaller.User("u1"), LockInTenant.WithAuditLog);

    [Fact]
    public Task DeleteNotFound() => RunAsync("delete-not-found", $$"""
        mutation { deleteProduct(where: { ItemId: { eq: "nope" } }, input: { isHardDelete: true }) { {{Single}} } }
        """, LockInCaller.User("u1"), LockInTenant.WithAuditLog);

    [Fact]
    public Task DeleteManyRlsScoped() => RunAsync("deleteMany-rls-scoped", $$"""
        mutation { deleteManyProduct(where: { Status: { eq: Draft } }, input: { isHardDelete: true }) { {{Single}} } }
        """, LockInCaller.User("u1"), LockInTenant.WithAuditLog);

    [Fact]
    public Task DeleteManyAndWhere() => RunAsync("deleteMany-and-where", $$"""
        mutation { deleteManyProduct(where: { and: [{ Status: { eq: Draft } }, { Owner: { eq: "u1" } }] }, input: { isHardDelete: true }) { {{Single}} } }
        """, LockInCaller.User("u1", "admin"), LockInTenant.WithAuditLog);

    [Fact]
    public Task DeleteManySoft() => RunAsync("deleteMany-soft", $$"""
        mutation { deleteManyProduct(where: { Status: { eq: Draft } }, input: { isHardDelete: false }) { {{Single}} } }
        """, LockInCaller.User("u1"), LockInTenant.WithAuditLog);
}
