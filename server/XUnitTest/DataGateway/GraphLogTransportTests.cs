using Api.Controllers;
using Blocks.Data.Api.Filters;
using Blocks.Genesis;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway;

/// <summary>
/// Every request's log entry carries the transport it came through (<c>rest</c> or <c>graphql</c>).
/// Entries written before the field existed have none and read as GraphQL. These run the real
/// history and analytics queries against an ephemeral MongoDB, so the stored-document path, the
/// filter and the counts are exercised together.
/// </summary>
[Collection("Mongo")]
public class GraphLogTransportTests
{
    private static readonly DateTime Day = new(2026, 9, 10, 12, 0, 0, DateTimeKind.Utc);

    private readonly GraphLogHistoryService _service;
    private readonly IMongoCollection<BsonDocument> _traces;

    public GraphLogTransportTests(MongoFixture fixture)
    {
        BlocksTestContext.Set();
        var db = fixture.CreateDatabase();
        _traces = db.GetCollection<BsonDocument>(TenantContext.GetTenantId());

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(db);
        provider.Setup(p => p.GetDatabase(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).Returns(db);
        _service = new GraphLogHistoryService(provider.Object, new Mock<IBlocksSecret>().Object);
    }

    private void Seed(string traceId, string schemaName, string? transport, string status = "success", int minute = 0, bool inAppRequest = true)
    {
        var operation = new BsonDocument
        {
            { "SchemaName", schemaName },
            { "EntityName", "Person" },
            { "OperationType", "query" },
            { "ResponseStatus", status },
            { "InAppRequest", inAppRequest },
        };
        if (transport is not null)
            operation["Transport"] = transport;

        _traces.InsertOne(new BsonDocument
        {
            { "TraceId", traceId },
            { "Timestamp", Day.AddMinutes(minute) },
            { "Duration", 10.0 },
            { "Attributes", new BsonDocument("GatewayOperation", operation) },
        });
    }

    private void SeedMixed()
    {
        Seed("r1", "getPersons", "rest", minute: 1);
        Seed("r2", "getPersons", "rest", "failed", minute: 2);
        Seed("g1", "getPersons", "graphql", minute: 3);
        Seed("n1", "getPersons", null, minute: 4);
        Seed("e1", "getPersons", "", minute: 5);
        Seed("r3", "insertPerson", "rest", minute: 6);
    }

    private static GetGraphLogHistoryRequest History(string? transport = null) =>
        new() { Transport = transport, PageSize = 50, From = Day.Date, To = Day.Date };

    private static GetGraphLogAnalyticsRequest Analytics(string? transport = null) =>
        new() { Transport = transport, From = Day.Date, To = Day.Date };

    // ---- history items ----------------------------------------------------------------------

    [Fact]
    public async Task HistoryItem_CarriesItsTransport()
    {
        SeedMixed();

        var page = await _service.GetHistoryAsync(History());

        page.Items.Single(i => i.TraceId == "r1").Transport.Should().Be("rest");
        page.Items.Single(i => i.TraceId == "g1").Transport.Should().Be("graphql");
    }

    [Theory]
    [InlineData("n1")]
    [InlineData("e1")]
    public async Task HistoryItem_WithoutATransport_ReadsAsGraphQl(string traceId)
    {
        SeedMixed();

        var page = await _service.GetHistoryAsync(History());

        page.Items.Single(i => i.TraceId == traceId).Transport.Should().Be("graphql");
    }

    // ---- in-app vs console --------------------------------------------------------------------

    private void SeedInAppAndConsoleRest()
    {
        Seed("app", "getPersons", "rest", minute: 1);
        Seed("console", "getPersons", "rest", minute: 2, inAppRequest: false);
    }

    [Fact]
    public async Task History_InAppRestRow_ShowsWithoutIncludeBlocksConsole_AndAConsoleRowDoesNot()
    {
        SeedInAppAndConsoleRest();

        var page = await _service.GetHistoryAsync(History());
        var withConsole = await _service.GetHistoryAsync(new GetGraphLogHistoryRequest
        {
            PageSize = 50, From = Day.Date, To = Day.Date, IncludeBlocksConsole = true,
        });

        page.Items.Select(i => i.TraceId).Should().BeEquivalentTo("app");
        page.Items.Single().InAppRequest.Should().BeTrue();
        withConsole.Items.Select(i => i.TraceId).Should().BeEquivalentTo("app", "console");
    }

    [Fact]
    public async Task Analytics_InAppRestRow_CountsWithoutIncludeBlocksConsole_AndAConsoleRowDoesNot()
    {
        SeedInAppAndConsoleRest();

        var analytics = await _service.GetAnalyticsAsync(Analytics());
        var withConsole = await _service.GetAnalyticsAsync(new GetGraphLogAnalyticsRequest
        {
            From = Day.Date, To = Day.Date, IncludeBlocksConsole = true,
        });

        analytics.OperationStats.Single().RestCount.Should().Be(1);
        withConsole.OperationStats.Single().RestCount.Should().Be(2);
    }

    // ---- history filter ---------------------------------------------------------------------

    [Theory]
    [InlineData("rest")]
    [InlineData("REST")]
    [InlineData("Rest")]
    public async Task HistoryFilter_Rest_ReturnsOnlyRestRows(string transport)
    {
        SeedMixed();

        var page = await _service.GetHistoryAsync(History(transport));

        page.Items.Select(i => i.TraceId).Should().BeEquivalentTo("r1", "r2", "r3");
        page.Items.Should().OnlyContain(i => i.Transport == "rest");
        page.TotalCount.Should().Be(3);
    }

    [Theory]
    [InlineData("graphql")]
    [InlineData("GraphQL")]
    public async Task HistoryFilter_GraphQl_IncludesEntriesWithNoTransport(string transport)
    {
        SeedMixed();

        var page = await _service.GetHistoryAsync(History(transport));

        page.Items.Select(i => i.TraceId).Should().BeEquivalentTo("g1", "n1", "e1");
        page.Items.Should().OnlyContain(i => i.Transport == "graphql");
        page.TotalCount.Should().Be(3);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public async Task HistoryFilter_Absent_ReturnsEveryTransport(string? transport)
    {
        SeedMixed();

        var page = await _service.GetHistoryAsync(History(transport));

        page.TotalCount.Should().Be(6);
    }

    // ---- analytics --------------------------------------------------------------------------

    [Fact]
    public async Task OperationStats_SplitCountsByTransport_AndSumToCalls()
    {
        SeedMixed();

        var stats = (await _service.GetAnalyticsAsync(Analytics())).OperationStats;

        var persons = stats.Single(s => s.SchemaName == "getPersons");
        persons.Calls.Should().Be(5);
        persons.RestCount.Should().Be(2);
        persons.GraphQLCount.Should().Be(3);
        var inserts = stats.Single(s => s.SchemaName == "insertPerson");
        inserts.RestCount.Should().Be(1);
        inserts.GraphQLCount.Should().Be(0);
        stats.Should().OnlyContain(s => s.RestCount + s.GraphQLCount == s.Calls);
    }

    [Fact]
    public async Task AnalyticsFilter_Rest_NarrowsEveryCard()
    {
        SeedMixed();

        var analytics = await _service.GetAnalyticsAsync(Analytics("rest"));

        analytics.RequestsOverTime.Sum(b => b.Success + b.Denied + b.Errored).Should().Be(3);
        analytics.OperationStats.Sum(s => s.Calls).Should().Be(3);
        analytics.OperationStats.Sum(s => s.GraphQLCount).Should().Be(0);
        analytics.FailureStats.Sum(f => f.Count).Should().Be(1);
        analytics.FailureHotspots.Sum(h => h.Count).Should().Be(1);
        analytics.SchemaCoverage.Single(c => c.EntityName == "Person").Calls.Should().Be(3);
    }

    [Fact]
    public async Task AnalyticsFilter_GraphQl_IncludesEntriesWithNoTransport()
    {
        SeedMixed();

        var analytics = await _service.GetAnalyticsAsync(Analytics("GraphQL"));

        analytics.RequestsOverTime.Sum(b => b.Success + b.Denied + b.Errored).Should().Be(3);
        analytics.OperationStats.Sum(s => s.Calls).Should().Be(3);
        analytics.OperationStats.Sum(s => s.RestCount).Should().Be(0);
        analytics.FailureStats.Should().BeEmpty();
        analytics.SchemaCoverage.Single(c => c.EntityName == "Person").Calls.Should().Be(3);
    }

    [Fact]
    public async Task AnalyticsFilter_Absent_CountsEveryTransport()
    {
        SeedMixed();

        var analytics = await _service.GetAnalyticsAsync(Analytics());

        analytics.OperationStats.Sum(s => s.Calls).Should().Be(6);
    }
}

/// <summary>
/// The Transport filter is validated like the other graph-log values that have a fixed set: a
/// FluentValidation validator run by <see cref="ValidateRequestAttribute"/>, answering 400.
/// </summary>
public class GraphLogTransportValidationTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("rest")]
    [InlineData("graphql")]
    [InlineData("REST")]
    [InlineData("GraphQL")]
    public void KnownOrAbsentTransport_IsValid(string? transport)
    {
        new GetGraphLogHistoryRequestValidator().Validate(new GetGraphLogHistoryRequest { Transport = transport })
            .IsValid.Should().BeTrue();
        new GetGraphLogAnalyticsRequestValidator().Validate(new GetGraphLogAnalyticsRequest { Transport = transport })
            .IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("grpc")]
    [InlineData("soap")]
    [InlineData("rest ")]
    public void UnknownTransport_IsInvalid(string transport)
    {
        var history = new GetGraphLogHistoryRequestValidator().Validate(new GetGraphLogHistoryRequest { Transport = transport });
        var analytics = new GetGraphLogAnalyticsRequestValidator().Validate(new GetGraphLogAnalyticsRequest { Transport = transport });

        history.IsValid.Should().BeFalse();
        history.Errors.Should().ContainSingle().Which.PropertyName.Should().Be(nameof(GetGraphLogHistoryRequest.Transport));
        analytics.IsValid.Should().BeFalse();
        analytics.Errors.Should().ContainSingle().Which.PropertyName.Should().Be(nameof(GetGraphLogAnalyticsRequest.Transport));
    }

    [Theory]
    [InlineData(nameof(GraphLogController.GetHistory))]
    [InlineData(nameof(GraphLogController.GetAnalytics))]
    public void BothEndpoints_RunTheirValidators(string action) =>
        typeof(GraphLogController).GetMethod(action)!
            .GetCustomAttributes(typeof(ValidateRequestAttribute), inherit: false)
            .Should().HaveCount(1);

    [Fact]
    public async Task UnknownTransport_IsAnswered400BeforeTheActionRuns()
    {
        var services = new ServiceCollection();
        services.AddValidatorsFromAssemblyContaining<GetGraphLogHistoryRequestValidator>();
        var httpContext = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        var context = new ActionExecutingContext(
            new ActionContext(httpContext, new RouteData(), new ActionDescriptor()),
            new List<IFilterMetadata>(),
            new Dictionary<string, object?> { ["request"] = new GetGraphLogHistoryRequest { Transport = "grpc" } },
            controller: new object());
        var actionRan = false;

        await new ValidateRequestAttribute().OnActionExecutionAsync(context, () =>
        {
            actionRan = true;
            return Task.FromResult(new ActionExecutedContext(context, new List<IFilterMetadata>(), context.Controller));
        });

        actionRan.Should().BeFalse();
        context.Result.Should().BeOfType<BadRequestObjectResult>();
    }
}
