using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Authentication;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Schemas;
using DataGateway.DomainService.Services;
using DataGateway.Rest;
using DataGateway.Rest.Access;
using DataGateway.Rest.Entities;
using DataGateway.Rest.Errors;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using StackExchange.Redis;
using XUnitTest.DataGateway.LockIn;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;
using SortOrder = DataGateway.DomainService.Models.SortDirection;

namespace XUnitTest.DataGateway.Rest;

/// <summary>
/// The same operation over GraphQL and over REST, each on its own throwaway database seeded identically with the
/// lock-in tenant: GraphQL through <see cref="GatewayLockInHarness"/> (the real schema build and executor), REST through
/// <see cref="GatewayRestService"/> with the real engine. Each pair must give the same records or items, leave the same
/// data behind, and refuse with the same kind of error (GraphQL's <c>extensions.code</c> against REST's <c>code</c> and
/// status).
///
/// Where REST differs on purpose, the case asserts REST's own documented behaviour instead: REST refuses null or empty
/// filter shapes, offset-less date-times and duplicate regex operators (R8-R10); its bulk writes are also bounded by the
/// caller's read row rules (R23); its <c>where</c> / <c>order</c> refuse fields the masker could mask (R22); it keeps
/// <c>ID</c> strings as strings (R13); and it answers errors as problem+json instead of an <c>errors</c> array.
/// </summary>
[Collection("Mongo")]
public class RestGraphQLParityTests
{
    private const string Tenant = GatewayLockInHarness.TenantId;
    private const string Single = "acknowledged itemId totalImpactedData message";
    private const string Bulk = "acknowledged itemIds totalImpactedData message";

    private static readonly LockInCaller Owner = LockInCaller.User("u1");
    private static readonly LockInCaller Admin = LockInCaller.User("u1", "admin");

    private readonly MongoFixture _fixture;

    public RestGraphQLParityTests(MongoFixture fixture) => _fixture = fixture;

    // ---- reads ----

    [Fact]
    public async Task Get_WhereOrderPaging_Body()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, """
            { getProducts(where: { Price: { gte: 10 } }, order: [{ field: "Title", direction: DESC }], paging: { pageNo: 2, pageSize: 1 }) {
                items { ItemId Title Price Tags Address { City } } pageNo pageSize totalCount } }
            """, Admin,
            service => service.GetAsync(Request("POST", "/api/gateway/Product", Admin), "Product", Json("""
                { "where": { "Price": { "gte": 10 } }, "order": [{ "field": "Title", "direction": "DESC" }],
                  "paging": { "pageNo": 2, "pageSize": 1 }, "select": ["ItemId", "Title", "Price", "Tags", "Address.City"],
                  "includeTotalCount": true }
                """)));

        ShouldMatchList(graphQl, "getProducts", rest, expectedIds: ["p2"], paged: true);
    }

    [Fact]
    public async Task Get_OrderAndPaging_QueryString()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, """
            { getProducts(order: [{ field: "Price", direction: DESC }], paging: { pageNo: 1, pageSize: 2 }) {
                items { ItemId Title Stock Status } pageNo pageSize totalCount } }
            """, Admin,
            service => service.GetAsync(
                Request("GET", "/api/gateway/Product", Admin, "?order=Price:DESC&pageNo=1&pageSize=2&select=ItemId,Title,Stock,Status&includeTotalCount=true"),
                "Product", null));

        ShouldMatchList(graphQl, "getProducts", rest, expectedIds: ["p3", "p2"], paged: true);
    }

    [Fact]
    public async Task Get_NestedAndOr()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, """
            { getProducts(where: { or: [{ and: [{ Status: { eq: Live } }, { Stock: { gte: 0 } }] }, { Title: { eq: "Bravo" } }] }, order: [{ field: "Title" }]) {
                items { ItemId Title } pageNo pageSize totalCount } }
            """, Admin,
            service => service.GetAsync(Request("POST", "/api/gateway/Product", Admin), "Product", Json("""
                { "where": { "or": [{ "and": [{ "Status": { "eq": "Live" } }, { "Stock": { "gte": 0 } }] }, { "Title": { "eq": "Bravo" } }] },
                  "order": [{ "field": "Title", "direction": "ASC" }], "select": ["ItemId", "Title"], "includeTotalCount": true }
                """)));

        ShouldMatchList(graphQl, "getProducts", rest, expectedIds: ["p2", "p3"]);
    }

    [Fact]
    public async Task Get_UnderRowRules_NonAdmin()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, """
            { getProducts(order: [{ field: "Title" }]) { items { ItemId Title Owner } pageNo pageSize totalCount } }
            """, Owner,
            service => service.GetAsync(
                Request("GET", "/api/gateway/Product", Owner, "?order=Title&select=ItemId,Title,Owner&includeTotalCount=true"), "Product", null));

        // The row rules leave u1 its own rows, on both transports, in the items and in the count.
        ShouldMatchList(graphQl, "getProducts", rest, expectedIds: ["p1", "p3"]);
    }

    [Fact]
    public async Task GetById_RowHiddenByRowRules_EmptyVs404()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, """
            { getProducts(where: { ItemId: { eq: "p2" } }) { items { ItemId } } }
            """, Owner,
            service => service.GetByIdAsync(Request("GET", "/api/gateway/Product/item/p2", Owner), "Product", "p2"));

        // GraphQL answers an empty list; REST's one-record route answers 404, as for a record that does not exist.
        Data(graphQl, "getProducts")!["items"]!.AsArray().Should().BeEmpty();
        ShouldBeProblem(rest.Result, 404, "NOT_FOUND");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Get_ClsMaskedSelect(bool admin)
    {
        var caller = admin ? Admin : Owner;
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, """
            { getProducts(order: [{ field: "Title" }]) { items { ItemId Secret } pageNo pageSize } }
            """, caller,
            service => service.GetAsync(Request("GET", "/api/gateway/Product", caller, "?order=Title&select=ItemId,Secret"), "Product", null));

        ShouldMatchList(graphQl, "getProducts", rest, expectedIds: admin ? ["p1", "p2", "p3"] : ["p1", "p3"]);
        var secrets = Items(rest.Result).Select(item => item?["Secret"]?.GetValue<string>()).ToList();
        if (admin)
            secrets.Should().Equal("s-one", "s-two", "s-three");
        else
            secrets.Should().OnlyContain(secret => secret == null, "the column rule masks Secret for a non-admin on both transports");
    }

    [Fact]
    public async Task Get_GeoJsonField()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, """
            { getProducts(where: { ItemId: { eq: "p1" } }) { items { ItemId Location } pageNo pageSize } }
            """, Admin,
            service => service.GetAsync(Request("POST", "/api/gateway/Product", Admin), "Product",
                Json("""{ "where": { "ItemId": { "eq": "p1" } }, "select": ["ItemId", "Location"] }""")));

        ShouldMatchList(graphQl, "getProducts", rest, expectedIds: ["p1"]);
        // Today the shared masker empties a GeoJson value on both transports, admin included: Location carries the
        // row-rule copies, and the masker then walks into the value and nulls "Location.type" and "Location.coordinates",
        // which no policy names (pre-existing, in Genesis QueryClsRowMaskingHelper.NullDeniedFieldsByPath).
        Canonical(Data(graphQl, "getProducts")!["items"]![0]!["Location"]).Should().Be("{}");
        Items(rest.Result).Single()!["Location"]!.ToJsonString().Should().Be("""{"type":null,"coordinates":null}""");
    }

    /// <summary>
    /// A geo filter on <c>Location</c> (the lock-in <c>get-geo-near</c> point and distance) is not refused by REST:
    /// Location's read policies are row-rule copies (R21, R29), so the column-rule guard lets it through, and the row
    /// rules still bound the rows. u1 owns both rows in range; u2 owns only p2, which is out of range.
    /// </summary>
    [Theory]
    [InlineData("admin", new[] { "p1", "p3" })]
    [InlineData("u1", new[] { "p1", "p3" })]
    [InlineData("u2", new string[0])]
    public async Task Get_GeoNearFilter(string who, string[] expectedIds)
    {
        var caller = who == "admin" ? Admin : LockInCaller.User(who);
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, """
            { getProducts(where: { Location: { near: { geometry: { type: "Point", coordinates: [8.5417, 47.3769] }, maxDistanceMeters: 5000 } } }) {
                items { ItemId } pageNo pageSize } }
            """, caller,
            service => service.GetAsync(Request("POST", "/api/gateway/Product", caller), "Product", Json("""
                { "where": { "Location": { "near": { "geometry": { "type": "Point", "coordinates": [8.5417, 47.3769] }, "maxDistanceMeters": 5000 } } },
                  "select": ["ItemId"] }
                """)));

        rest.Result.StatusCode.Should().Be(200, "REST must not refuse a geo filter on Location: {0}", JsonSerializer.Serialize(rest.Result.Body));
        ShouldMatchList(graphQl, "getProducts", rest, expectedIds);
    }

    // ---- writes ----

    [Fact]
    public async Task Insert()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, """
            mutation { insertProduct(input: { ItemId: "p9", Title: "Lamp", Price: 5, Status: Live, Address: { City: "Oslo" }, Tags: ["a"] }) { acknowledged itemId totalImpactedData message } }
            """, Owner,
            service => service.InsertAsync(Request("POST", "/api/gateway/Product/item", Owner), "Product", Json("""
                { "ItemId": "p9", "Title": "Lamp", "Price": 5, "Status": "Live", "Address": { "City": "Oslo" }, "Tags": ["a"] }
                """)));

        rest.Result.StatusCode.Should().Be(201);
        ShouldMatchItemResult(graphQl, "insertProduct", rest);
        ShouldLeaveSameData(graphQl, rest);
    }

    [Fact]
    public async Task InsertMany()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, $$"""
            mutation { insertManyProduct(input: [{ ItemId: "p7", Title: "Lamp" }, { ItemId: "p8", Title: "Desk" }]) { {{Bulk}} } }
            """, Owner,
            service => service.InsertManyAsync(Request("POST", "/api/gateway/Product/items", Owner), "Product",
                Json("""[{ "ItemId": "p7", "Title": "Lamp" }, { "ItemId": "p8", "Title": "Desk" }]""")));

        rest.Result.StatusCode.Should().Be(200);
        var expected = Data(graphQl, "insertManyProduct")!;
        var body = Body(rest.Result);
        body["acknowledged"]!.GetValue<bool>().Should().Be(expected["acknowledged"]!.GetValue<bool>()).And.BeTrue();
        body["totalImpactedData"]!.GetValue<long>().Should().Be(expected["totalImpactedData"]!.GetValue<long>()).And.Be(2);
        Strings(body["itemIds"]).Should().Equal(Strings(expected["itemIds"]));
        ShouldLeaveSameData(graphQl, rest);
    }

    [Fact]
    public async Task Update()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, $$"""
            mutation { updateProduct(where: { ItemId: { eq: "p1" } }, input: { Price: 9, Address: { City: "Basel" } }) { {{Single}} } }
            """, Owner,
            service => service.UpdateAsync(Request("PATCH", "/api/gateway/Product/item/p1", Owner), "Product", "p1",
                Json("""{ "Price": 9, "Address": { "City": "Basel" } }""")));

        rest.Result.StatusCode.Should().Be(200);
        ShouldMatchItemResult(graphQl, "updateProduct", rest);
        ShouldLeaveSameData(graphQl, rest);
    }

    [Fact]
    public async Task Update_RowHiddenByRowRules_NotFoundVs404()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, $$"""
            mutation { updateProduct(where: { ItemId: { eq: "p2" } }, input: { Price: 9 }) { {{Single}} } }
            """, Owner,
            service => service.UpdateAsync(Request("PATCH", "/api/gateway/Product/item/p2", Owner), "Product", "p2", Json("""{ "Price": 9 }""")));

        // GraphQL answers its "not found" result (acknowledged false); REST answers 404. Nothing changes on either.
        Data(graphQl, "updateProduct")!["acknowledged"]!.GetValue<bool>().Should().BeFalse();
        ShouldBeProblem(rest.Result, 404, "NOT_FOUND");
        ShouldLeaveSameData(graphQl, rest);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task UpdateMany(bool admin)
    {
        var caller = admin ? Admin : Owner;
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, $$"""
            mutation { updateManyProduct(where: { Status: { eq: Draft } }, input: { Stock: 1 }) { {{Single}} } }
            """, caller,
            service => service.UpdateManyAsync(Request("PATCH", "/api/gateway/Product/items", caller), "Product",
                Json("""{ "where": { "Status": { "eq": "Draft" } }, "input": { "Stock": 1 } }""")));

        // An admin reaches both Draft rows; u1 only its own, by the edit row rules on GraphQL and by the edit and read
        // row rules on REST (R23), which here select the same rows.
        rest.Result.StatusCode.Should().Be(200);
        ShouldMatchBulkResult(graphQl, "updateManyProduct", rest, expectedImpacted: admin ? 2 : 1);
        ShouldLeaveSameData(graphQl, rest);
    }

    [Fact]
    public async Task Delete_Soft()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.WithAuditLog, $$"""
            mutation { deleteProduct(where: { ItemId: { eq: "p1" } }, input: { isHardDelete: false }) { {{Single}} } }
            """, Owner,
            service => service.DeleteAsync(Request("DELETE", "/api/gateway/Product/item/p1", Owner), "Product", "p1", hardDelete: false));

        rest.Result.StatusCode.Should().Be(200);
        ShouldMatchItemResult(graphQl, "deleteProduct", rest);
        // The row is gone and archived to the audit log, the same way on both.
        ShouldLeaveSameData(graphQl, rest);
        JsonNode.Parse(rest.MongoAfter)!["ObjectAuditLogs"]!.AsArray().Should().ContainSingle();
    }

    [Fact]
    public async Task Delete_Hard()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.WithAuditLog, $$"""
            mutation { deleteProduct(where: { ItemId: { eq: "p1" } }, input: { isHardDelete: true }) { {{Single}} } }
            """, Owner,
            service => service.DeleteAsync(Request("DELETE", "/api/gateway/Product/item/p1", Owner), "Product", "p1", hardDelete: true));

        rest.Result.StatusCode.Should().Be(200);
        ShouldMatchItemResult(graphQl, "deleteProduct", rest);
        ShouldLeaveSameData(graphQl, rest);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task DeleteMany_UnderRowRules(bool hardDelete)
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.WithAuditLog, $$"""
            mutation { deleteManyProduct(where: { Status: { eq: Draft } }, input: { isHardDelete: {{(hardDelete ? "true" : "false")}} }) { {{Single}} } }
            """, Owner,
            service => service.DeleteManyAsync(Request("DELETE", "/api/gateway/Product/items", Owner), "Product",
                Json("""{ "where": { "Status": { "eq": "Draft" } } }"""), hardDelete));

        // Of the two Draft rows u1 may delete only its own, p1.
        rest.Result.StatusCode.Should().Be(200);
        ShouldMatchBulkResult(graphQl, "deleteManyProduct", rest, expectedImpacted: 1);
        ShouldLeaveSameData(graphQl, rest);
    }

    // ---- refusals ----

    [Fact]
    public async Task Anonymous_Read_Refused()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, "{ getProducts { items { Title } } }", LockInCaller.Anonymous,
            service => service.GetAsync(Request("GET", "/api/gateway/Product", LockInCaller.Anonymous), "Product", null));

        ShouldRefuseAlike(graphQl, rest, 401, "AUTH_NOT_AUTHENTICATED");
    }

    [Fact]
    public async Task Anonymous_Write_Refused()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, $$"""
            mutation { insertProduct(input: { ItemId: "p9", Title: "Lamp" }) { {{Single}} } }
            """, LockInCaller.Anonymous,
            service => service.InsertAsync(Request("POST", "/api/gateway/Product/item", LockInCaller.Anonymous), "Product",
                Json("""{ "ItemId": "p9", "Title": "Lamp" }""")));

        ShouldRefuseAlike(graphQl, rest, 401, "AUTH_NOT_AUTHENTICATED");
        ShouldLeaveSameData(graphQl, rest);
    }

    [Fact]
    public async Task ValidationError_Refused()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, $$"""
            mutation { insertProduct(input: { ItemId: "p9", Title: "" }) { {{Single}} } }
            """, Owner,
            service => service.InsertAsync(Request("POST", "/api/gateway/Product/item", Owner), "Product", Json("""{ "ItemId": "p9", "Title": "" }""")));

        ShouldRefuseAlike(graphQl, rest, 400, "VALIDATION_ERROR");
        ShouldHaveSameFieldErrors(graphQl, rest, ("Title", "NotEmpty"));
        ShouldLeaveSameData(graphQl, rest);
    }

    [Fact]
    public async Task ValidationError_InsertMany_OneInvalid_NothingWritten()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, $$"""
            mutation { insertManyProduct(input: [{ ItemId: "p7", Title: "Lamp" }, { ItemId: "p8", Title: "" }]) { {{Bulk}} } }
            """, Owner,
            service => service.InsertManyAsync(Request("POST", "/api/gateway/Product/items", Owner), "Product",
                Json("""[{ "ItemId": "p7", "Title": "Lamp" }, { "ItemId": "p8", "Title": "" }]""")));

        ShouldRefuseAlike(graphQl, rest, 400, "VALIDATION_ERROR");
        ShouldLeaveSameData(graphQl, rest);
    }

    [Fact]
    public async Task UniqueConflict_Insert_Refused()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, $$"""
            mutation { insertProduct(input: { ItemId: "p9", Title: "Alpha" }) { {{Single}} } }
            """, Owner,
            service => service.InsertAsync(Request("POST", "/api/gateway/Product/item", Owner), "Product", Json("""{ "ItemId": "p9", "Title": "Alpha" }""")));

        // The same VALIDATION_ERROR; REST answers it 409 because every field error is a Unique one.
        ShouldRefuseAlike(graphQl, rest, 409, "VALIDATION_ERROR");
        ShouldHaveSameFieldErrors(graphQl, rest, ("Title", "Unique"));
        ShouldLeaveSameData(graphQl, rest);
    }

    [Fact]
    public async Task UniqueConflict_Update_Refused()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, $$"""
            mutation { updateProduct(where: { ItemId: { eq: "p1" } }, input: { Title: "Charlie" }) { {{Single}} } }
            """, Owner,
            service => service.UpdateAsync(Request("PATCH", "/api/gateway/Product/item/p1", Owner), "Product", "p1", Json("""{ "Title": "Charlie" }""")));

        ShouldRefuseAlike(graphQl, rest, 409, "VALIDATION_ERROR");
        ShouldHaveSameFieldErrors(graphQl, rest, ("Title", "Unique"));
        ShouldLeaveSameData(graphQl, rest);
    }

    [Fact]
    public async Task ColumnRuleOnWrite_Refused()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, $$"""
            mutation { updateProduct(where: { ItemId: { eq: "p1" } }, input: { Secret: "x" }) { {{Single}} } }
            """, Owner,
            service => service.UpdateAsync(Request("PATCH", "/api/gateway/Product/item/p1", Owner), "Product", "p1", Json("""{ "Secret": "x" }""")));

        // A write column rule refuses as a field error on both, not as FORBIDDEN.
        ShouldRefuseAlike(graphQl, rest, 400, "VALIDATION_ERROR");
        ShouldHaveSameFieldErrors(graphQl, rest, ("Secret", "ColumnAccess"));
        ShouldLeaveSameData(graphQl, rest);
    }

    // ---- intended differences: REST's documented behaviour ----

    [Fact]
    public async Task Difference_BulkDelete_AlsoBoundByReadRowRules()
    {
        // Delete open to every signed-in user, read limited to own rows (R23): GraphQL deletes every Draft row, REST
        // only the Draft rows u1 can read.
        static LockInTenant DeleteForEveryone()
        {
            var tenant = LockInTenant.Standard;
            tenant.Schemas.Single(s => s.SchemaName == "Product").DeleteAccessLevel = SchemaAccessLevel.User;
            tenant.Policies.RemoveAll(p => p.Operation == PolicyOperation.DELETE);
            return tenant;
        }

        var (graphQl, rest) = await BothAsync(DeleteForEveryone, $$"""
            mutation { deleteManyProduct(where: { Status: { eq: Draft } }, input: { isHardDelete: true }) { {{Single}} } }
            """, Owner,
            service => service.DeleteManyAsync(Request("DELETE", "/api/gateway/Product/items", Owner), "Product",
                Json("""{ "where": { "Status": { "eq": "Draft" } } }"""), hardDelete: true));

        Data(graphQl, "deleteManyProduct")!["totalImpactedData"]!.GetValue<long>().Should().Be(2);
        Body(rest.Result)["totalImpactedData"]!.GetValue<long>().Should().Be(1);
        ProductIds(graphQl.MongoAfterJson).Should().Equal("p3");
        ProductIds(rest.MongoAfter).Should().Equal("p2", "p3");
    }

    [Fact]
    public async Task Difference_WhereOnMaskedField_RefusedByRest()
    {
        // GraphQL filters on the masked Secret (and the matching rows give its value away); REST refuses (R22).
        var (graphQl, rest) = await BothAsync(() => LockInTenant.Standard, """
            { getProducts(where: { Secret: { eq: "s-one" } }) { items { ItemId Secret } } }
            """, Owner,
            service => service.GetAsync(Request("POST", "/api/gateway/Product", Owner), "Product",
                Json("""{ "where": { "Secret": { "eq": "s-one" } }, "select": ["ItemId", "Secret"] }""")));

        Data(graphQl, "getProducts")!["items"]!.AsArray().Select(i => i!["ItemId"]!.GetValue<string>()).Should().Equal("p1");
        ShouldBeProblem(rest.Result, 403, "FORBIDDEN");
    }

    [Fact]
    public async Task Difference_NullFilterOperand_RefusedByRest()
    {
        // A null operand is silently dropped by the shared converter, widening the filter; REST refuses it (R9).
        var (_, rest) = await BothAsync(() => LockInTenant.Standard, "{ getProducts { items { ItemId } } }", Admin,
            service => service.GetAsync(Request("POST", "/api/gateway/Product", Admin), "Product",
                Json("""{ "where": { "Title": { "eq": null } } }""")));

        ShouldBeProblem(rest.Result, 400, "VALIDATION_ERROR");
    }

    // ---- R26: a DTO field that inherits a Custom read level ----

    /// <summary>
    /// The DTO field <c>Billing</c> sets no read level, so it inherits Product's Custom read, and the entity carries no
    /// rows for its fields (<c>Billing.Fields</c> is empty). The masker (<see cref="QueryClsRowMaskingHelper.MaskCustomFieldsWithNoPolicy"/>,
    /// run by the engine for both transports) nulls it for every caller, admin included: its effective level is Custom
    /// and no column policy names it or anything under it.
    /// </summary>
    [Fact]
    public async Task InheritedDtoField_NulledOnBothTransports()
    {
        var (graphQl, rest) = await BothAsync(() => LockInTenant.WithInheritedDtoField, """
            { getProducts(where: { ItemId: { eq: "p1" } }) { items { ItemId Billing { City Zip } } pageNo pageSize } }
            """, Admin,
            service => service.GetAsync(Request("POST", "/api/gateway/Product", Admin), "Product",
                Json("""{ "where": { "ItemId": { "eq": "p1" } }, "select": ["ItemId", "Billing.City", "Billing.Zip"] }""")));

        ShouldMatchList(graphQl, "getProducts", rest, expectedIds: ["p1"]);
        var item = Items(rest.Result).Single()!.AsObject();
        // Stored (see the data), yet null on a row the admin can read.
        item.ContainsKey("Billing").Should().BeTrue();
        item["Billing"].Should().BeNull();
        rest.MongoAfter.Should().Contain("\"City\": \"Bern\"");
    }

    [Fact]
    public void ColumnRule_InheritedDtoNulledByMasker_403()
    {
        // The guard computes what the masker nulls with the masker's own rule (effective Custom read level, no column
        // policy covering the path), so a filter or sort under Billing is refused even if it got past the parser.
        // Cleared when done, as RestSide.DisposeAsync does, so the ambient context does not leak to tests running alongside.
        try
        {
            BlocksTestContext.Set(tenantId: Tenant);
            var entity = Model(LockInTenant.WithInheritedDtoField, "Product");
            var admin = new AccessPrincipal("u1", "u1@lockin.test", Tenant, "org-1", ["admin"], [], IsAuthenticated: true, IsRootTenant: false);
            var resolver = Resolver();
            var where = new WhereNode(new Dictionary<string, object?>
            {
                ["Billing"] = new Dictionary<string, object?> { ["City"] = new Dictionary<string, object?> { ["eq"] = "Bern" } },
            });

            var byWhere = () => ColumnRuleGuard.Check(resolver, admin, entity, where, null);
            var byOrder = () => ColumnRuleGuard.Check(resolver, admin, entity, null, [new OrderItem("Billing.Zip", SortOrder.ASC)]);

            byWhere.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN" && e.Message.Contains("'Billing.City'"));
            byOrder.Should().Throw<GatewayException>().Where(e => e.Code == "FORBIDDEN" && e.Message.Contains("'Billing.Zip'"));

            // The same path the masker nulls on a row the admin can read.
            var request = new SchemaAccessRequest(admin, entity.Schema, PolicyOperation.READ);
            var projection = resolver.BuildReadProjection(request, new BsonDocument { { "_id", 1 }, { "Billing.City", 1 }, { "Billing.Zip", 1 } });
            var row = new Dictionary<string, object>
            {
                ["_id"] = "p1",
                ["Billing"] = new Dictionary<string, object> { ["City"] = "Bern", ["Zip"] = "3000" },
            };
            resolver.MaskRow(request, row, projection)["Billing"].Should().BeNull();
            ColumnRuleGuard.MaskedPaths(admin, entity.Schema, projection.ClsReadPolicies).Paths.Should().Contain("Billing");
        }
        finally
        {
            ClearContext();
        }
    }

    [Fact]
    public async Task InheritedDtoField_WhereAndOrder_RefusedBeforeTheEngine()
    {
        // Over the API the request does not even reach the guard: with no rows for Billing's fields the entity offers
        // no filter or sort on them, as GraphQL's generated filter type has none (400, nothing read).
        var rest = await RestSide.CreateAsync(_fixture, LockInTenant.WithInheritedDtoField);
        await using var _ = rest;

        var byWhere = await rest.Service.GetAsync(Request("POST", "/api/gateway/Product", Admin), "Product",
            Json("""{ "where": { "Billing": { "City": { "eq": "Bern" } } } }"""));
        var byOrder = await rest.Service.GetAsync(Request("GET", "/api/gateway/Product", Admin, "?order=Billing.City"), "Product", null);

        ShouldBeProblem(byWhere, 400, "VALIDATION_ERROR");
        ShouldBeProblem(byOrder, 400, "VALIDATION_ERROR");
    }

    /// <summary>
    /// For contrast, the same DTO field when the entity carries rows for its fields (<c>Billing.City</c>,
    /// <c>Billing.Zip</c>, as schemas edited in the console store them): those Inherited scalars get the row-rule copies
    /// (R21), which cover <c>Billing</c>, so the masker leaves the values on readable rows, on both transports, and a
    /// REST filter on them is allowed and reveals nothing the caller cannot read.
    /// </summary>
    [Fact]
    public async Task InheritedDtoField_WithFieldRows_ReadAndFilterable()
    {
        var (graphQl, rest) = await BothAsync(WithBillingFieldRows, """
            { getProducts(where: { ItemId: { eq: "p1" } }) { items { ItemId Billing { City Zip } } pageNo pageSize } }
            """, Admin,
            service => service.GetAsync(Request("POST", "/api/gateway/Product", Admin), "Product",
                Json("""{ "where": { "ItemId": { "eq": "p1" } }, "select": ["ItemId", "Billing.City", "Billing.Zip"] }""")));

        ShouldMatchList(graphQl, "getProducts", rest, expectedIds: ["p1"]);
        Items(rest.Result).Single()!["Billing"]!["City"]!.GetValue<string>().Should().Be("Bern");

        var filtered = await RestSide.CreateAsync(_fixture, WithBillingFieldRows());
        await using var __ = filtered;
        var result = await filtered.Service.GetAsync(Request("POST", "/api/gateway/Product", Owner), "Product",
            Json("""{ "where": { "Billing": { "City": { "eq": "Bern" } } }, "select": ["ItemId", "Billing.City"] }"""));

        result.StatusCode.Should().Be(200);
        Items(result).Select(i => i!["ItemId"]!.GetValue<string>()).Should().Equal("p1");
    }

    private static LockInTenant WithBillingFieldRows()
    {
        var tenant = LockInTenant.WithInheritedDtoField;
        var product = tenant.Schemas.Single(s => s.SchemaName == "Product");
        product.Fields!.Add(new FieldDefinition { Name = "Billing.City", Type = "String", IsReferenceField = true, ReferenceFieldType = "Address" });
        product.Fields.Add(new FieldDefinition { Name = "Billing.Zip", Type = "String", IsReferenceField = true, ReferenceFieldType = "Address" });
        return tenant;
    }

    // ---- running both sides ----

    /// <summary>What REST answered and the data it left behind, normalised as the lock-in harness normalises GraphQL's.</summary>
    private sealed record RestOutcome(RestResult Result, string MongoAfter);

    /// <summary>
    /// Runs <paramref name="document"/> through GraphQL and <paramref name="rest"/> through the REST service, each on a
    /// fresh database seeded from its own instance of the tenant (building a schema modifies its source).
    /// </summary>
    private async Task<(LockInResult GraphQl, RestOutcome RestSide)> BothAsync(
        Func<LockInTenant> tenant, string document, LockInCaller caller, Func<GatewayRestService, Task<RestResult>> rest)
    {
        LockInResult graphQl;
        await using (var harness = await GatewayLockInHarness.CreateAsync(_fixture, tenant()))
            graphQl = await harness.ExecuteAsync(document, caller);

        var side = await RestSide.CreateAsync(_fixture, tenant());
        await using var _ = side;
        var result = await rest(side.Service);
        return (graphQl, new RestOutcome(result, await side.MongoAfterAsync()));
    }

    private static EntityModel Model(LockInTenant tenant, string name)
    {
        var assembled = SchemaAssembler.Assemble(new SchemaSource
        {
            SchemaDefinitions = tenant.Schemas,
            DataValidations = tenant.Validations,
            DataAccessPolicies = tenant.Policies,
        });
        var entity = assembled.Single(s => s.SchemaName == name);
        return new EntityModel(entity, null, assembled.Where(s => s.SchemaName != name).ToDictionary(s => s.SchemaName));
    }

    /// <summary>The REST service over a throwaway database seeded with the tenant's rows, with the real engine and policies.</summary>
    private sealed class RestSide : IAsyncDisposable
    {
        private readonly MongoFixture _fixture;
        private readonly IMongoDatabase _db;
        private readonly LockInTenant _tenant;

        private RestSide(MongoFixture fixture, IMongoDatabase db, LockInTenant tenant, GatewayRestService service)
        {
            _fixture = fixture;
            _db = db;
            _tenant = tenant;
            Service = service;
        }

        public GatewayRestService Service { get; }

        public static async Task<RestSide> CreateAsync(MongoFixture fixture, LockInTenant tenant)
        {
            var db = fixture.CreateDatabase();
            var provider = new Mock<IDbContextProvider>();
            provider.Setup(p => p.GetDatabase()).Returns(db);
            provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
            provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
            var cache = new Mock<ICacheClient>();
            cache.Setup(c => c.GetHashValueAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<HashEntry>());
            var store = new Mock<IDataSourceConfigStore>();
            store.Setup(x => x.LoadAsync(It.IsAny<string>())).ReturnsAsync(new DataSourceRoute(false, "seed-secret", "default", "1"));
            var repository = new GqlDbRepository(provider.Object, cache.Object, Mock.Of<IDataSourceClientCache>(), store.Object);

            foreach (var (collection, rows) in tenant.Seed)
                await db.GetCollection<BsonDocument>(collection).InsertManyAsync(rows);
            foreach (var (collection, field) in tenant.GeoIndexes)
                await db.GetCollection<BsonDocument>(collection).Indexes.CreateOneAsync(
                    new CreateIndexModel<BsonDocument>(Builders<BsonDocument>.IndexKeys.Geo2DSphere(field), new CreateIndexOptions { Name = field + "_2dsphere" }));

            BlocksTestContext.Set(tenantId: Tenant);
            var assembled = SchemaAssembler.Assemble(new SchemaSource
            {
                SchemaDefinitions = tenant.Schemas,
                DataValidations = tenant.Validations,
                DataAccessPolicies = tenant.Policies,
            });
            var models = new Mock<IEntityModelProvider>();
            foreach (var entity in assembled.Where(s => s.SchemaType == SchemaType.Entity))
            {
                var others = assembled.Where(s => s.SchemaName != entity.SchemaName).ToDictionary(s => s.SchemaName);
                models.Setup(m => m.GetAsync(Tenant, entity.SchemaName)).ReturnsAsync(new EntityModel(entity, null, others));
            }

            var engine = new MongoGatewayDataEngine(repository, Resolver(), Principals(), NullLogger.Instance,
                eventPublisher: Mock.Of<IDataChangeEventPublisher>());
            var service = new GatewayRestService(engine, models.Object, Resolver(), Principals(),
                Options.Create(new RestLimits()), NullLogger<GatewayRestService>.Instance);
            return new RestSide(fixture, db, tenant, service);
        }

        /// <summary>Every data collection afterwards, exactly as <see cref="LockInResult.MongoAfterJson"/> reports it.</summary>
        public async Task<string> MongoAfterAsync()
        {
            var state = new JsonObject();
            foreach (var name in _tenant.DataCollections)
            {
                var rows = await _db.GetCollection<BsonDocument>(name).Find(FilterDefinition<BsonDocument>.Empty).ToListAsync();
                var array = new JsonArray();
                foreach (var row in rows.OrderBy(r => r["_id"].ToString(), StringComparer.Ordinal))
                    array.Add(GatewayLockInHarness.BsonToNode(row));
                state[name] = array;
            }
            return GatewayLockInHarness.Normalise(state, sortKeys: true)!.ToJsonString(GatewayLockInHarness.Indented);
        }

        public async ValueTask DisposeAsync()
        {
            try { await _fixture.Client.DropDatabaseAsync(_db.DatabaseNamespace.DatabaseName); }
            catch { /* best effort */ }
            ClearContext();
        }
    }

    /// <summary>
    /// The request as it reaches the REST service, for the same caller the GraphQL side ran as. Not async, so the
    /// ambient context it sets stays with the call that follows.
    /// </summary>
    private static DefaultHttpContext Request(string method, string path, LockInCaller caller, string? query = null)
    {
        RequestContextAccessor.Current = new RequestContext { BlocksKey = Tenant, IsRequestFromBlocksCloud = false };
        SetContext(
            userId: caller.UserId ?? string.Empty,
            userName: caller.Authenticated ? $"{caller.UserId}@lockin.test" : string.Empty,
            tenantId: Tenant,
            isAuthenticated: caller.Authenticated,
            roles: caller.Roles);

        ClaimsPrincipal? principal = caller.Authenticated
            ? new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(BlocksContext.TENANT_ID_CLAIM, Tenant), new Claim(BlocksContext.USER_ID_CLAIM, caller.UserId!)], "Bearer"))
            : null;
        var authenticator = new Mock<DataGatewayTokenAuthenticator>(
            new Mock<ITenants>().Object, new Mock<ICacheClient>().Object, new Mock<IHttpClientFactory>().Object, new Mock<IDbRepository>().Object);
        authenticator.Setup(a => a.GetPrincipalFromTokenAsync(It.IsAny<HttpRequest>(), It.IsAny<string>())).ReturnsAsync(principal);
        var services = new ServiceCollection();
        services.AddSingleton(authenticator.Object);

        var http = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        http.Request.Method = method;
        http.Request.Path = path;
        if (query is not null)
            http.Request.QueryString = new QueryString(query);
        http.Request.Headers["x-blocks-key"] = Tenant;
        if (caller.Authenticated)
            http.Request.Headers.Authorization = "Bearer test-token";
        return http;
    }

    private static JsonElement Json(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    // ---- comparing ----

    private static JsonNode? Data(LockInResult graphQl, string field) => JsonNode.Parse(graphQl.ResponseJson)!["data"]?[field];

    private static JsonNode Body(RestResult result) => JsonSerializer.SerializeToNode(result.Body, result.Body!.GetType())!;

    private static List<JsonNode?> Items(RestResult result) => [.. Body(result)["items"]!.AsArray()];

    private static List<string?> Strings(JsonNode? array) => [.. array!.AsArray().Select(n => n?.GetValue<string>())];

    private static List<string> ProductIds(string mongoAfter) =>
        [.. JsonNode.Parse(mongoAfter)!["Products"]!.AsArray().Select(row => row!["_id"]!.GetValue<string>())];

    /// <summary>
    /// The same items in the same order (nulls and absent fields count alike, numbers by value), the same page, and,
    /// when GraphQL selected it, the same total. Without paging in the request both read at most 10 rows, but GraphQL
    /// reports the number of items as the page size and REST its default page size (10).
    /// </summary>
    private static void ShouldMatchList(LockInResult graphQl, string field, RestOutcome rest, string[] expectedIds, bool paged = false)
    {
        rest.Result.StatusCode.Should().Be(200, "REST answered {0}", JsonSerializer.Serialize(rest.Result.Body));
        var expected = Data(graphQl, field);
        expected.Should().NotBeNull("GraphQL answered {0}", graphQl.ResponseJson);
        var body = Body(rest.Result);

        Canonical(body["items"]).Should().Be(Canonical(expected!["items"]));
        Items(rest.Result).Select(i => i!["ItemId"]!.GetValue<string>()).Should().Equal(expectedIds);
        body["pageNo"]!.GetValue<int>().Should().Be(expected["pageNo"]!.GetValue<int>());
        if (expected.AsObject().ContainsKey("pageSize"))
            body["pageSize"]!.GetValue<int>().Should().Be(paged ? expected["pageSize"]!.GetValue<int>() : new RestLimits().DefaultPageSize);
        if (expected.AsObject().ContainsKey("totalCount"))
            body["totalCount"]!.GetValue<long>().Should().Be(expected["totalCount"]!.GetValue<long>());
    }

    private static void ShouldMatchItemResult(LockInResult graphQl, string field, RestOutcome rest)
    {
        var expected = Data(graphQl, field);
        expected.Should().NotBeNull("GraphQL answered {0}", graphQl.ResponseJson);
        var body = Body(rest.Result);
        body["acknowledged"]!.GetValue<bool>().Should().Be(expected!["acknowledged"]!.GetValue<bool>()).And.BeTrue();
        body["itemId"]?.GetValue<string>().Should().NotBeNull();
        body["itemId"]!.GetValue<string>().Should().Be(expected["itemId"]?.GetValue<string>());
        // A successful GraphQL write carries no message. REST's one-record answer has no totalImpactedData or message
        // at all (RestItemResponse: acknowledged, itemId, and created for an upsert only); "nothing matched" is its 404
        // instead (see the RowHiddenByRowRules cases), so those two fields have nothing on the REST side to compare with.
        expected["message"].Should().BeNull("GraphQL answered {0}", graphQl.ResponseJson);
        body.AsObject().Select(p => p.Key).Should().BeEquivalentTo(["acknowledged", "itemId"]);
    }

    private static void ShouldMatchBulkResult(LockInResult graphQl, string field, RestOutcome rest, long expectedImpacted)
    {
        var expected = Data(graphQl, field);
        expected.Should().NotBeNull("GraphQL answered {0}", graphQl.ResponseJson);
        var body = Body(rest.Result);
        body["acknowledged"]!.GetValue<bool>().Should().Be(expected!["acknowledged"]!.GetValue<bool>()).And.BeTrue();
        body["totalImpactedData"]!.GetValue<long>().Should().Be(expected["totalImpactedData"]!.GetValue<long>()).And.Be(expectedImpacted);
    }

    private static void ShouldLeaveSameData(LockInResult graphQl, RestOutcome rest) =>
        rest.MongoAfter.Should().Be(graphQl.MongoAfterJson);

    private static void ShouldBeProblem(RestResult result, int status, string code)
    {
        result.StatusCode.Should().Be(status, "REST answered {0}", JsonSerializer.Serialize(result.Body));
        result.Body.Should().BeOfType<GatewayProblem>().Which.Code.Should().Be(code);
    }

    /// <summary>GraphQL's one error carries <paramref name="code"/>; REST answers the same code with <paramref name="status"/>.</summary>
    private static void ShouldRefuseAlike(LockInResult graphQl, RestOutcome rest, int status, string code)
    {
        var errors = JsonNode.Parse(graphQl.ResponseJson)!["errors"];
        errors.Should().NotBeNull("GraphQL answered {0}", graphQl.ResponseJson);
        errors!.AsArray().Should().ContainSingle();
        errors[0]!["extensions"]!["code"]!.GetValue<string>().Should().Be(code);
        ShouldBeProblem(rest.Result, status, code);
    }

    private static readonly Regex GraphQlFieldError = new(@"field = (?<field>[^,]+), .*validationType = (?<type>\w+)", RegexOptions.Compiled);

    /// <summary>The same (field, validation type) pairs: GraphQL's <c>validationErrors</c> texts, REST's <c>errors</c> objects.</summary>
    private static void ShouldHaveSameFieldErrors(LockInResult graphQl, RestOutcome rest, params (string Field, string Type)[] expected)
    {
        var graphQlErrors = JsonNode.Parse(graphQl.ResponseJson)!["errors"]![0]!["extensions"]!["validationErrors"]!.AsArray()
            .Select(e => GraphQlFieldError.Match(e!.GetValue<string>()))
            .Select(m => (m.Groups["field"].Value, m.Groups["type"].Value))
            .ToList();
        var restErrors = ((GatewayProblem)rest.Result.Body!).Errors!.Select(e => (e.Field, e.ValidationType)).ToList();

        restErrors.Should().BeEquivalentTo(graphQlErrors);
        restErrors.Should().BeEquivalentTo(expected);
    }

    /// <summary>A JSON value with object keys sorted, null members dropped, and every number as a double.</summary>
    private static string Canonical(JsonNode? node) => CanonicalNode(node)?.ToJsonString() ?? "null";

    private static JsonNode? CanonicalNode(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject obj:
                var result = new JsonObject();
                foreach (var (key, value) in obj.OrderBy(p => p.Key, StringComparer.Ordinal))
                {
                    if (value is not null)
                        result[key] = CanonicalNode(value);
                }
                return result;
            case JsonArray array:
                return new JsonArray([.. array.Select(CanonicalNode)]);
            case JsonValue value when value.GetValueKind() == JsonValueKind.Number:
                return JsonValue.Create(double.Parse(value.ToJsonString(), System.Globalization.CultureInfo.InvariantCulture));
            default:
                return node?.DeepClone();
        }
    }
}
