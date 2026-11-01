using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.LockIn;

/// <summary>
/// Characterisation of the gateway's GraphQL queries: each case runs one document as one caller through the real code
/// path and compares the response, the data afterwards, the published events and the request-log summary with a golden
/// file. The files record today's behaviour, right or wrong, so a refactor can prove it changed nothing.
/// </summary>
[Collection("Mongo")]
public class QueryLockInTests
{
    private readonly MongoFixture _fixture;

    public QueryLockInTests(MongoFixture fixture) => _fixture = fixture;

    private async Task RunAsync(string caseName, string document, LockInCaller caller, LockInTenant? tenant = null)
    {
        await using var harness = await GatewayLockInHarness.CreateAsync(_fixture, tenant ?? LockInTenant.Standard);

        var result = await harness.ExecuteAsync(document, caller);

        GoldenFile.Match(caseName, result.ToGoldenJson());
    }

    [Fact]
    public Task GetAllowed() => RunAsync("get-allowed", """
        { getProducts(where: { Status: { eq: Live } }, order: [{ field: "Title", direction: DESC }], paging: { pageNo: 1, pageSize: 2 }) {
            items { ItemId Title Address { City } } pageNo pageSize } }
        """, LockInCaller.User("u1", "admin"));

    [Fact]
    public Task GetPublicAnonymous() => RunAsync("get-public-anonymous", "{ getNotes { items { Text } } }", LockInCaller.Anonymous);

    [Fact]
    public Task GetDeniedAnonymous() => RunAsync("get-denied-anonymous", "{ getProducts { items { Title } } }", LockInCaller.Anonymous);

    [Fact]
    public Task GetRlsHidesRows() => RunAsync("get-rls-hides-rows", "{ getProducts { items { ItemId } } }", LockInCaller.User("u1"));

    [Fact]
    public Task GetClsMasksField() => RunAsync("get-cls-masks-field", "{ getProducts { items { ItemId Secret } } }", LockInCaller.User("u1"));

    [Fact]
    public Task GetTotalOnly() => RunAsync("get-total-only", "{ getProducts { totalCount } }", LockInCaller.User("u1", "admin"));

    [Fact]
    public Task GetLegacyFilter() => RunAsync("get-legacy-filter", """
        { getProducts(input: { filter: "{\"Status\":\"Live\"}", sort: "{\"Title\":1}", pageNo: 1, pageSize: 10 }) { items { ItemId } } }
        """, LockInCaller.User("u1", "admin"));

    [Fact]
    public Task GetLegacyAndTyped() => RunAsync("get-legacy-and-typed", """
        { getProducts(input: { filter: "{\"Status\":\"Draft\"}" }, where: { Status: { eq: Live } }) { items { ItemId } } }
        """, LockInCaller.User("u1", "admin"));

    [Fact]
    public Task GetAndWhere() => RunAsync("get-and-where", """
        { getProducts(where: { and: [{ Status: { eq: Live } }, { Owner: { eq: "u1" } }] }) { items { ItemId } } }
        """, LockInCaller.User("u1", "admin"));

    // Address is not filterable in the generated SDL (ProductFilterInput has no Address field), so the second branch of the or
    // filters on Title instead of a nested city.
    [Fact]
    public Task GetNestedAndOr() => RunAsync("get-nested-and-or", """
        { getProducts(where: { or: [{ and: [{ Status: { eq: Live } }, { Stock: { gte: 0 } }] }, { Title: { eq: "Bravo" } }] }) { items { ItemId } } }
        """, LockInCaller.User("u1", "admin"));

    [Fact]
    public Task GetUnknownSortField() => RunAsync("get-unknown-sort-field", """
        { getProducts(order: [{ field: "Nope" }]) { items { ItemId } } }
        """, LockInCaller.User("u1", "admin"));

    [Fact]
    public Task GetGeoNear() => RunAsync("get-geo-near", """
        { getProducts(where: { Location: { near: { geometry: { type: "Point", coordinates: [8.5417, 47.3769] }, maxDistanceMeters: 5000 } } }) {
            items { ItemId } } }
        """, LockInCaller.User("u1", "admin"));

    [Fact]
    public Task GetClsAdminSeesField() => RunAsync("get-cls-admin-sees-field", "{ getProducts { items { ItemId Secret } } }", LockInCaller.User("u1", "admin"));

    // Today a DTO field that inherits its read level from a Custom-read entity returns null nested fields for everyone,
    // admin included. Locked in as it is; the Address field of the standard tenant is Public so the other cases avoid it.
    [Fact]
    public Task GetDtoInheritsCustomRead() => RunAsync("get-dto-inherits-custom-read", """
        { getProducts(where: { ItemId: { eq: "p1" } }) { items { ItemId Billing { City Zip } } } }
        """, LockInCaller.User("u1", "admin"), LockInTenant.WithInheritedDtoField);
}
