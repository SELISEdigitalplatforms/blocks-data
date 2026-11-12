using System.Collections.Immutable;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using FluentAssertions;
using HotChocolate.Execution.Processing;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using HotChocolate.Types;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Gateway;

/// <summary>The query half of the gateway engine, called without GraphQL.</summary>
[Collection("ContextSerial")]
public class QueryEngineTests : IDisposable
{
    private readonly Mock<IGqlDbRepository> _repo = new();

    public void Dispose()
    {
        ClearContext();
        _logs.Dispose();
        GC.SuppressFinalize(this);
    }

    private MongoGatewayDataEngine Engine() =>
        new(_repo.Object, Resolver(), Principals(), NullLogger.Instance);

    private BsonDocument? _projection;

    private void SetupRepo(List<BsonDocument> docs)
    {
        _repo.Setup(r => r.GetItemsAsync(
                It.IsAny<string>(),
                It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<BsonDocument>(),
                It.IsAny<BsonDocument>(),
                It.IsAny<int>(),
                It.IsAny<int>()))
            .Callback<string, FilterDefinition<BsonDocument>, BsonDocument, BsonDocument, int, int>(
                (_, _, _, projection, _, _) => _projection = projection)
            .ReturnsAsync(docs);
        _repo.Setup(r => r.CountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()))
            .ReturnsAsync(docs.Count);
    }

    private static BsonDocument Doc(string name) =>
        new() { { "_id", Guid.NewGuid().ToString() }, { "Name", name } };

    private static QueryCommand Command(IReadOnlyList<string> select) =>
        new("getPersons", null, null, null, null, select);

    [Fact]
    public async Task ReadDenied_ThrowsGatewayForbidden()
    {
        ClearContext();
        SetBlocksCloud(false);
        var schema = Schema(read: SchemaAccessLevel.Custom, fields: new() { Field("Name") });

        var act = () => Engine().QueryAsync(new EntityModel(schema, null), Command(["Name"]));

        var ex = await act.Should().ThrowAsync<GatewayException>();
        ex.Which.Code.Should().Be(GraphQlConstant.ForbiddenErrorCode);
        _repo.Verify(r => r.GetItemsAsync(
            It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(),
            It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()), Times.Never);
    }

    [Fact]
    public async Task EmptySelect_ReadsLikeToday()
    {
        ClearContext();
        SetBlocksCloud(true);
        var schema = Schema(fields: new() { Field("Name") });
        SetupRepo([Doc("Alice"), Doc("Bob")]);

        // Today: `{ getPersons { totalCount } }` selects no items, so the projection is empty.
        var doc = Utf8GraphQLParser.Parse("{ getPersons { totalCount } }");
        var fieldNode = (FieldNode)((OperationDefinitionNode)doc.Definitions[0]).SelectionSet.Selections[0];
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.SyntaxNode).Returns(fieldNode);
        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns("getPersons");
        selection.Setup(s => s.Field).Returns(field.Object);
        var ctx = new Mock<IResolverContext>();
        ctx.Setup(c => c.Selection).Returns(selection.Object);
        ctx.Setup(c => c.ScopedContextData).Returns(ImmutableDictionary<string, object?>.Empty);
        var viaAdapter = await new QueryService(_repo.Object, Resolver(), Principals(), NullLogger<QueryService>.Instance)
            .GetDataAsync(ctx.Object, schema);
        var adapterProjection = _projection;

        var viaEngine = await Engine().QueryAsync(new EntityModel(schema, null), Command([]));

        viaEngine.Items.Should().BeEquivalentTo(viaAdapter.Items);
        viaEngine.Items.Should().HaveCount(2);
        viaEngine.PageNo.Should().Be(viaAdapter.PageNo);
        viaEngine.PageSize.Should().Be(viaAdapter.PageSize);
        _projection!.ToJson().Should().Be(adapterProjection!.ToJson());
        (await viaEngine.GetTotalCountAsync()).Should().Be(2);
    }

    // ---- paging: the page-size cap (default 1000) and the paging errors ----

    private const string ClampTemplate =
        "Data Gateway page size clamped for tenant {TenantId}, schema {SchemaName}: requested {RequestedPageSize}, effective {EffectivePageSize}";

    private const string ConfigTemplate =
        "DataGateway:MaxPageSize {ConfiguredValue} is not a positive integer; using the default {DefaultMaxPageSize}";

    private readonly RecordingLoggerProvider _logs = new();

    private MongoGatewayDataEngine CappedEngine(int? maxPageSize) =>
        new(_repo.Object, Resolver(), Principals(), _logs.CreateLogger("MongoGatewayDataEngine"), maxPageSize);

    private static QueryCommand Paging(int? pageNo, int? pageSize) =>
        new("getPersons", null, null, pageNo, pageSize, ["Name"]);

    /// <summary>A signed-in caller of tenant-1 on a Public schema, with one stored row.</summary>
    private SchemaDefinitionExtended PagingSetup()
    {
        ClearContext();
        SetBlocksCloud(true);
        SetContext(tenantId: "tenant-1");
        SetupRepo([Doc("Alice")]);
        return Schema(fields: new() { Field("Name") });
    }

    private void VerifyRead(int skip, int limit) =>
        _repo.Verify(r => r.GetItemsAsync(
            "Persons", It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(),
            It.IsAny<BsonDocument>(), skip, limit), Times.Once);

    private void VerifyNoRepositoryCall()
    {
        _repo.Verify(r => r.GetItemsAsync(
            It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(),
            It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()), Times.Never);
        _repo.Verify(r => r.CountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()), Times.Never);
    }

    // RecordedLog drops {OriginalFormat}, so a template is recognised by its fixed opening text.
    private List<RecordedLog> Warnings(string template) =>
        _logs.Logs.Where(l => l.Level == LogLevel.Warning
            && l.Message.StartsWith(template[..template.IndexOf('{', StringComparison.Ordinal)], StringComparison.Ordinal)).ToList();

    /// <summary>H1 (E1), H2 (E2, E13), H3 (E3), H4 (E4), H6 (E5), H8 (E8), H13 (E12): skip/limit read and pageNo/pageSize reported.</summary>
    [Theory]
    [InlineData(null, 3, 7, 14, 7, 3)]          // H1 E1
    [InlineData(null, null, null, 0, 10, 1)]    // H2 E2
    [InlineData(5, null, null, 0, 5, 1)]        // H2 E13: a cap below 10 bounds the default page
    [InlineData(null, 1, 0, 0, 1000, 1)]        // H3 E3
    [InlineData(null, 2, 0, 1000, 1000, 2)]     // H3: skip = (pageNo-1) x cap
    [InlineData(null, 2, 5000, 1000, 1000, 2)]  // H4 E4
    [InlineData(null, null, 50, 0, 50, 1)]      // H6 E5
    [InlineData(200, 1, 0, 0, 200, 1)]          // H8 E8
    [InlineData(200, 1, 500, 0, 200, 1)]        // H8: a configured cap clamps larger sizes
    [InlineData(null, 3, null, 20, 10, 3)]      // H13 E12
    public async Task Paging_ReadsAndReportsTheEffectivePage(
        int? cap, int? pageNo, int? pageSize, int expectedSkip, int expectedLimit, int expectedPageNo)
    {
        var schema = PagingSetup();

        var result = await CappedEngine(cap).QueryAsync(new EntityModel(schema, null), Paging(pageNo, pageSize));

        VerifyRead(expectedSkip, expectedLimit);
        result.PageNo.Should().Be(expectedPageNo);
        result.PageSize.Should().Be(expectedLimit);
    }

    /// <summary>C7, C10: every accepted input reads between 1 and the cap rows, never 0, and int.MaxValue does not overflow.</summary>
    [Theory]
    [InlineData(1, null, 10)]
    [InlineData(1, 0, 1000)]
    [InlineData(1, 1, 1)]
    [InlineData(1, 1000, 1000)]
    [InlineData(1, 1001, 1000)]
    [InlineData(1, int.MaxValue, 1000)]
    [InlineData(2, null, 10)]
    [InlineData(2, 0, 1000)]
    [InlineData(2, 1, 1)]
    [InlineData(2, 1000, 1000)]
    [InlineData(2, 1001, 1000)]
    [InlineData(2, int.MaxValue, 1000)]
    public async Task Paging_LimitIsAlwaysBetweenOneAndTheCap(int pageNo, int? pageSize, int expectedLimit)
    {
        var schema = PagingSetup();
        var limits = new List<int>();
        var skips = new List<int>();
        _repo.Setup(r => r.GetItemsAsync(
                It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(),
                It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()))
            .Callback<string, FilterDefinition<BsonDocument>, BsonDocument, BsonDocument, int, int>(
                (_, _, _, _, skip, limit) => { skips.Add(skip); limits.Add(limit); })
            .ReturnsAsync([Doc("Alice")]);

        var result = await CappedEngine(null).QueryAsync(new EntityModel(schema, null), Paging(pageNo, pageSize));

        limits.Should().ContainSingle().Which.Should().BeInRange(1, MongoGatewayDataEngine.DefaultMaxPageSize).And.Be(expectedLimit);
        skips.Single().Should().Be((pageNo - 1) * limits.Single());
        result.PageSize.Should().Be(limits.Single());
    }

    /// <summary>H7 at the engine: no configured value means a cap of 1000.</summary>
    [Fact]
    public async Task NoConfiguredCap_UsesTheDefaultOf1000()
    {
        var schema = PagingSetup();

        await CappedEngine(null).QueryAsync(new EntityModel(schema, null), Paging(1, int.MaxValue));

        MongoGatewayDataEngine.DefaultMaxPageSize.Should().Be(1000);
        VerifyRead(0, 1000);
    }

    /// <summary>C1 (E7): a pageNo below 1, with or without pageSize, is a VALIDATION_ERROR with no repository call.</summary>
    [Theory]
    [InlineData(0, 10)]
    [InlineData(0, null)]
    [InlineData(-1, 10)]
    [InlineData(0, -1)] // both invalid: the pageNo error wins
    public async Task InvalidPageNo_IsRefused_WithoutARead(int pageNo, int? pageSize)
    {
        var schema = PagingSetup();

        var act = () => CappedEngine(null).QueryAsync(new EntityModel(schema, null), Paging(pageNo, pageSize));

        var ex = (await act.Should().ThrowAsync<GatewayException>()).Which;
        ex.Code.Should().Be(GraphQlConstant.ValidationErrorErrorCode);
        ex.Message.Should().Be("'pageNo' must be 1 or greater.");
        ex.FieldErrors.Should().BeNull();
        VerifyNoRepositoryCall();
    }

    /// <summary>C2 (E6): a negative pageSize is a VALIDATION_ERROR with no repository call.</summary>
    [Theory]
    [InlineData(1, -1)]
    [InlineData(null, -5)]
    [InlineData(1, int.MinValue)]
    public async Task NegativePageSize_IsRefused_WithoutARead(int? pageNo, int pageSize)
    {
        var schema = PagingSetup();

        var act = () => CappedEngine(null).QueryAsync(new EntityModel(schema, null), Paging(pageNo, pageSize));

        var ex = (await act.Should().ThrowAsync<GatewayException>()).Which;
        ex.Code.Should().Be(GraphQlConstant.ValidationErrorErrorCode);
        ex.Message.Should().Be("'pageSize' must be 0 or greater.");
        ex.FieldErrors.Should().BeNull();
        VerifyNoRepositoryCall();
    }

    /// <summary>The paging messages must not look like document errors, which the HTTP formatter maps to 400 (C5).</summary>
    [Theory]
    [InlineData("'pageNo' must be 1 or greater.")]
    [InlineData("'pageSize' must be 0 or greater.")]
    public void PagingMessages_AreNotGraphQlDocumentErrors(string message) =>
        GatewayFailureKind
            .IsGraphQlDocumentError(GraphQlConstant.ValidationErrorErrorCode, message).Should().BeFalse();

    /// <summary>C4: RLS denial keeps priority over invalid paging.</summary>
    [Fact]
    public async Task ReadDenied_WithInvalidPaging_StillForbidden()
    {
        ClearContext();
        SetBlocksCloud(false);
        var schema = Schema(read: SchemaAccessLevel.Custom, fields: new() { Field("Name") });

        var act = () => CappedEngine(null).QueryAsync(new EntityModel(schema, null), Paging(0, -1));

        var ex = await act.Should().ThrowAsync<GatewayException>();
        ex.Which.Code.Should().Be(GraphQlConstant.ForbiddenErrorCode);
        VerifyNoRepositoryCall();
    }

    /// <summary>Order-conversion and filter errors keep priority over invalid paging (spec §3 constraints, §6.2).</summary>
    [Fact]
    public async Task OrderError_WithInvalidPaging_StillTheOrderError()
    {
        var schema = PagingSetup();
        var command = new QueryCommand("getPersons", null, [new OrderItem("Nope", global::DataGateway.DomainService.Models.SortDirection.ASC)], 0, -1, ["Name"]);

        var act = () => CappedEngine(null).QueryAsync(new EntityModel(schema, null), command);

        (await act.Should().ThrowAsync<ArgumentException>()).Which.Message.Should().Contain("'Nope' is not defined");
        VerifyNoRepositoryCall();
    }

    /// <summary>H5, C11: one clamp Warning per list read, carrying only tenant, schema, requested and effective size.</summary>
    [Fact]
    public async Task AboveTheCap_LogsOneClampWarning_WithOnlyTheFourFields()
    {
        var schema = PagingSetup();
        var command = new QueryCommand("getPersons", null, null, 2, 5000, ["Name"],
            LegacyFilterJson: """{ "Name": "secret-filter-value" }""", LegacySortJson: """{ "Name": 1 }""");

        await CappedEngine(null).QueryAsync(new EntityModel(schema, null), command);

        var warning = Warnings(ClampTemplate).Should().ContainSingle().Subject;
        warning.Category.Should().Be("MongoGatewayDataEngine");
        warning.Message.Should().Be("Data Gateway page size clamped for tenant tenant-1, schema Person: requested 5000, effective 1000");
        warning.Fields.Keys.Should().BeEquivalentTo("TenantId", "SchemaName", "RequestedPageSize", "EffectivePageSize");
        warning.AllText().Should().NotContain("Alice").And.NotContain("secret-filter-value").And.NotContain("user-1").And.NotContain("user@x.com");
    }

    /// <summary>C12: a pageSize of 0, within the cap, at the cap or absent logs no clamp Warning.</summary>
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(1000)]
    [InlineData(null)]
    public async Task ZeroOrWithinTheCap_LogsNoClampWarning(int? pageSize)
    {
        var schema = PagingSetup();

        await CappedEngine(null).QueryAsync(new EntityModel(schema, null), Paging(1, pageSize));

        Warnings(ClampTemplate).Should().BeEmpty();
    }

    /// <summary>C6 (E9), C11: a cap of 0 or below falls back to 1000 with exactly one Warning per engine, however many reads.</summary>
    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task NonPositiveCap_FallsBackTo1000_AndWarnsOncePerEngine(int configured)
    {
        var schema = PagingSetup();

        var engine = CappedEngine(configured);
        await engine.QueryAsync(new EntityModel(schema, null), Paging(1, 5000));
        await engine.QueryAsync(new EntityModel(schema, null), Paging(1, 0));
        await engine.QueryAsync(new EntityModel(schema, null), Paging(1, 10));

        _repo.Verify(r => r.GetItemsAsync(
            "Persons", It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(),
            It.IsAny<BsonDocument>(), 0, 1000), Times.Exactly(2));
        var config = Warnings(ConfigTemplate).Should().ContainSingle().Subject;
        config.Message.Should().Be($"DataGateway:MaxPageSize {configured} is not a positive integer; using the default 1000");
        config.Fields.Keys.Should().BeEquivalentTo("ConfiguredValue", "DefaultMaxPageSize");
        Warnings(ClampTemplate).Should().ContainSingle().Which.Message.Should().EndWith("requested 5000, effective 1000");
    }

    /// <summary>A positive configured cap or none logs no configuration Warning (MutationService passes none).</summary>
    [Theory]
    [InlineData(null)]
    [InlineData(1)]
    [InlineData(200)]
    public void ValidOrMissingCap_LogsNothingAtConstruction(int? configured)
    {
        _ = CappedEngine(configured);

        _logs.Logs.Should().BeEmpty();
    }

    /// <summary>C9: a capped read makes one GetItemsAsync and counts only when the total is asked for, once.</summary>
    [Fact]
    public async Task CappedRead_CountsOnlyWhenAsked()
    {
        var schema = PagingSetup();

        var result = await CappedEngine(null).QueryAsync(new EntityModel(schema, null), Paging(1, 0));

        VerifyRead(0, 1000);
        _repo.Verify(r => r.CountAsync(It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>()), Times.Never);
        await result.GetTotalCountAsync();
        await result.GetTotalCountAsync();
        _repo.Verify(r => r.CountAsync("Persons", It.IsAny<FilterDefinition<BsonDocument>>()), Times.Once);
        _repo.Verify(r => r.GetItemsAsync(
            It.IsAny<string>(), It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<BsonDocument>(),
            It.IsAny<BsonDocument>(), It.IsAny<int>(), It.IsAny<int>()), Times.Once);
    }
}
