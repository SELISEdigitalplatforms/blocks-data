using System.Diagnostics;
using System.Globalization;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Middlewares;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution;
using HotChocolate.Execution.Processing;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using HotChocolate.Types;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

/// <summary>
/// A gateway request is logged as "failed" for several very different reasons, and the log has to
/// say which — see <see cref="GatewayFailureKind"/>. These cover the recording side: the checks
/// that reject a request stamp their own reason, the reason survives being re-reported further out,
/// and the tag is written once per request.
/// </summary>
[Collection("ContextSerial")]
public class GatewayFailureLoggingTests : IDisposable
{
    public void Dispose()
    {
        ClearContext();
        GC.SuppressFinalize(this);
    }

    [Fact]
    public void MarkFailedRecordsTheReasonAndFlipsTheResponseStatus()
    {
        using var activity = new Activity("request").Start();

        GatewayOperationActivity.MarkFailed(
            activity, GatewayFailureKind.Validation, "Name is required.", GraphQlConstant.ValidationErrorErrorCode);

        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);
        gatewayOperation.ResponseStatus.Should().Be("failed");
        gatewayOperation.FailureKind.Should().Be(GatewayFailureKind.Validation);
        gatewayOperation.FailureCode.Should().Be(GraphQlConstant.ValidationErrorErrorCode);
        gatewayOperation.FailureMessage.Should().Be("Name is required.");
    }

    [Fact]
    public void TheFirstReasonWinsOverAnythingReportedLater()
    {
        using var activity = new Activity("request").Start();

        // The check that rejected the request knows more than the generic error handling that sees
        // the resulting GraphQL error further out.
        GatewayOperationActivity.MarkFailed(activity, GatewayFailureKind.Authorization, "Denied by policy.");
        GatewayOperationActivity.MarkFailed(activity, GatewayFailureKind.Unhandled, "Unexpected Execution Error");

        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);
        gatewayOperation.FailureKind.Should().Be(GatewayFailureKind.Authorization);
        gatewayOperation.FailureMessage.Should().Be("Denied by policy.");
    }

    [Fact]
    public void AnUnknownReasonCanBeReplacedWhenTheHttpPipelineLearnsItWasA5xx()
    {
        using var activity = new Activity("request").Start();

        GatewayOperationActivity.MarkFailed(activity, GatewayFailureKind.Unknown, "Execution failed.");
        GatewayOperationActivity.MarkFailed(activity, GatewayFailureKind.Unhandled, "HTTP 500.");

        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);
        gatewayOperation.FailureKind.Should().Be(GatewayFailureKind.Unhandled);
        gatewayOperation.FailureMessage.Should().Be("HTTP 500.");
    }

    [Fact]
    public void TaggingTwiceLeavesASingleGatewayOperationTag()
    {
        using var activity = new Activity("request").Start();
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);

        // An early rejection tags the activity, and the pipeline listener tags it again on the way
        // out; a duplicate key would break the trace document the exporter writes.
        GatewayOperationActivity.Tag(activity, gatewayOperation);
        gatewayOperation.FailureKind = GatewayFailureKind.Unhandled;
        GatewayOperationActivity.Tag(activity, gatewayOperation);

        var tags = activity.TagObjects.Where(tag => tag.Key == "GatewayOperation").ToList();
        tags.Should().HaveCount(1);
        var logged = tags[0].Value.Should().BeAssignableTo<Dictionary<string, object?>>().Subject;
        logged[nameof(GatewayOperation.FailureKind)].Should().Be(GatewayFailureKind.Unhandled);
    }

    [Fact]
    public async Task AnUnauthenticatedRequestIsLoggedAsAnAuthenticationFailure()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(false);
        using var activity = new Activity("request").Start();

        var middleware = new ReadSchemaAccessMiddleware(
            _ => default, Schema(read: SchemaAccessLevel.User));

        var act = () => middleware.InvokeAsync(MiddlewareContext("tenant-1").Object);

        await act.Should().ThrowAsync<GraphQLException>();
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);
        gatewayOperation.ResponseStatus.Should().Be("failed");
        gatewayOperation.FailureKind.Should().Be(GatewayFailureKind.Authentication);
        gatewayOperation.FailureMessage.Should().Be("User is not authenticated.");
    }

    [Fact]
    public async Task AnInvalidTenantIsLoggedAsAnAuthenticationFailure()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(false);
        using var activity = new Activity("request").Start();

        var middleware = new ReadSchemaAccessMiddleware(_ => default, Schema());

        var act = () => middleware.InvokeAsync(MiddlewareContext("someone-else").Object);

        await act.Should().ThrowAsync<GraphQLException>();
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);
        gatewayOperation.FailureKind.Should().Be(GatewayFailureKind.Authentication);
        gatewayOperation.FailureMessage.Should().Be("Tenant is not valid.");
    }

    [Fact]
    public void AValidationErrorIsLoggedAsAValidationFailure()
    {
        using var activity = new Activity("request").Start();
        var validationResult = new DataValidationResult();
        validationResult.AddError("Name", "Name is required.", "Required");

        var act = () => MutationValidationHelper.ThrowValidationError(validationResult);

        act.Should().Throw<GraphQLException>();
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);
        gatewayOperation.ResponseStatus.Should().Be("failed");
        gatewayOperation.FailureKind.Should().Be(GatewayFailureKind.Validation);
        gatewayOperation.FailureCode.Should().Be(GraphQlConstant.ValidationErrorErrorCode);
    }

    [Fact]
    public void ADocumentErrorReplacesTheEarlyUnknownPlaceholder()
    {
        SetContext();
        SetBlocksCloud(false);
        using var activity = new Activity("request").Start();
        var error = ErrorBuilder.New()
            .SetMessage("Variable `order` is not an input type.")
            .SetCode("HC0017")
            .Build();
        var result = new Mock<IOperationResult>();
        result.SetupGet(r => r.Errors).Returns([error]);
        var context = new Mock<IRequestContext>();
        context.SetupGet(c => c.Document).Returns(Utf8GraphQLParser.Parse(
            "query getBrands($order: [BrandSortInput!]) { getBrands(order: $order) { totalCount } }"));
        context.SetupGet(c => c.Result).Returns(result.Object);

        var listener = new GatewayActivityDiagnosticEventListener();
        using (var scope = listener.ExecuteRequest(context.Object))
        {
            listener.RequestError(context.Object, new InvalidOperationException("early pipeline error"));
        }

        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);
        gatewayOperation.FailureKind.Should().Be(GatewayFailureKind.SyntaxError);
        gatewayOperation.FailureCode.Should().Be("HC0017");
        gatewayOperation.FailureMessage.Should().Be("Variable `order` is not an input type.");
        gatewayOperation.SchemaName.Should().Be("getBrands");
    }

    private static Mock<IMiddlewareContext> MiddlewareContext(string blocksKey)
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers[GraphQlConstant.BlocksKeyHeaderKey] = blocksKey;

        var services = new ServiceCollection();
        services.AddSingleton<IHttpContextAccessor>(new HttpContextAccessor { HttpContext = httpContext });

        var field = new Mock<IObjectField>();
        field.Setup(f => f.Name).Returns("getPersons");
        var selection = new Mock<ISelection>();
        selection.Setup(s => s.Field).Returns(field.Object);

        var context = new Mock<IMiddlewareContext>();
        context.SetupGet(c => c.Services).Returns(services.BuildServiceProvider());
        context.SetupGet(c => c.Selection).Returns(selection.Object);
        return context;
    }
}

public class GatewayGraphQlErrorClassificationTests
{
    [Fact]
    public void GraphQlSyntaxErrorsCountAsErrorsRatherThanClientDenials()
    {
        GatewayFailureKind.IsDenial(GatewayFailureKind.SyntaxError).Should().BeFalse();
    }

    [Fact]
    public void HotChocolateDocumentErrorsAreSyntaxErrorsEvenWhenTheyCarryAnException()
    {
        var error = ErrorBuilder.New()
            .SetMessage("Variable `order` is not an input type.")
            .SetCode("HC0017")
            .SetException(new InvalidOperationException("schema validation detail"))
            .Build();

        GatewayActivityDiagnosticEventListener.Classify(error, StatusCodes.Status200OK)
            .Should().Be(GatewayFailureKind.SyntaxError);
    }

    [Theory]
    [InlineData(StatusCodes.Status200OK, GatewayFailureKind.Unknown)]
    [InlineData(StatusCodes.Status400BadRequest, GatewayFailureKind.Unknown)]
    [InlineData(StatusCodes.Status500InternalServerError, GatewayFailureKind.Unhandled)]
    [InlineData(StatusCodes.Status503ServiceUnavailable, GatewayFailureKind.Unhandled)]
    public void Only5xxResponsesAreClassifiedAsServerErrors(int statusCode, string expected)
    {
        var error = ErrorBuilder.New()
            .SetMessage("Unexpected execution error.")
            .SetException(new InvalidOperationException("detail"))
            .Build();

        GatewayActivityDiagnosticEventListener.Classify(error, statusCode)
            .Should().Be(expected);
    }

    [Fact]
    public void TheReaderRepairsPreviouslyStoredHotChocolateErrors()
    {
        GraphLogHistoryService.NormalizeFailureKind(
                GatewayFailureKind.Unhandled, "HC0017", StatusCodes.Status200OK)
            .Should().Be(GatewayFailureKind.SyntaxError);
    }

    [Fact]
    public void TheReaderRepairsOldDocumentErrorsWhoseCodeWasNotStored()
    {
        GraphLogHistoryService.NormalizeFailureKind(
                GatewayFailureKind.Unknown,
                string.Empty,
                StatusCodes.Status200OK,
                "Variable `order` is not an input type.")
            .Should().Be(GatewayFailureKind.SyntaxError);
    }

    [Fact]
    public void TheReaderUses400ToRepairAnUnknownStoredReason()
    {
        GraphLogHistoryService.NormalizeFailureKind(
                GatewayFailureKind.Unknown, string.Empty, StatusCodes.Status400BadRequest)
            .Should().Be(GatewayFailureKind.BadRequest);
    }

    [Fact]
    public void ATrulyEmptyStoredReasonRemainsUnknown()
    {
        GraphLogHistoryService.NormalizeFailureKind(
                string.Empty, string.Empty, StatusCodes.Status400BadRequest)
            .Should().Be(GatewayFailureKind.Unknown);
    }

    [Theory]
    [InlineData(StatusCodes.Status200OK, GatewayFailureKind.Unknown)]
    [InlineData(StatusCodes.Status502BadGateway, GatewayFailureKind.Unhandled)]
    public void TheReaderOnlyShowsUnhandledAsServerErrorFor5xx(int statusCode, string expected)
    {
        GraphLogHistoryService.NormalizeFailureKind(
                GatewayFailureKind.Unhandled, string.Empty, statusCode)
            .Should().Be(expected);
    }
}

public class GatewayGraphQlOperationMetadataTests
{
    [Theory]
    [InlineData("query getBrands($order: [BrandSortInput!]) { getBrands(order: $order) { totalCount } }", "getBrands")]
    [InlineData("query getCategorys { getCategorys { totalCount } }", "getCategorys")]
    [InlineData("query getProducts { getProducts { totalCount } }", "getProducts")]
    [InlineData("query Q { ...Root } fragment Root on Query { getProducts { totalCount } }", "getProducts")]
    public void RecoversTheSchemaFieldBeforeResolverExecution(string query, string expected)
    {
        var document = Utf8GraphQLParser.Parse(query);

        GraphQLOperationHelper.GetFirstRootFieldName(document).Should().Be(expected);
    }
}

public class GatewayGraphLogHistorySortTests
{
    [Theory]
    [InlineData("time", "$Timestamp")]
    [InlineData("schema", "SchemaName")]
    [InlineData("type", "OperationType")]
    [InlineData("status", "$switch")]
    [InlineData("code", "http.response.status_code")]
    [InlineData("duration", "$Duration")]
    [InlineData("size", "response.size.bytes")]
    [InlineData("source", "InAppRequest")]
    [InlineData("not-a-column", "$Timestamp")]
    public void UsesAnAllowlistedServerSortForEveryTableColumn(string requestedSort, string expected)
    {
        GraphLogHistoryService.GetHistorySortExpression(requestedSort).ToString()
            .Should().Contain(expected);
    }
}

/// <summary>
/// Introspection is tooling fetching the schema, not data access, and one introspection response
/// can outweigh a day of real traffic — so analytics leaves it out. Detection has to be exact:
/// treating the everyday "__typename" as introspection would silently drop real traffic.
/// </summary>
public class IntrospectionDetectionTests
{
    [Theory]
    [InlineData("query IntrospectionQuery { __schema { queryType { name } } }")]
    [InlineData("{ __type(name: \"BlxDrive\") { name } }")]
    [InlineData("query Q { ...F } fragment F on Query { __schema { types { name } } }")]
    public void RecognisesIntrospection(string query)
    {
        GraphQLIntrospectionHelper.ContainsIntrospectionQuery(Utf8GraphQLParser.Parse(query))
            .Should().BeTrue();
    }

    [Theory]
    [InlineData("query { getBlxDrives { items { ItemId __typename } } }")]
    [InlineData("mutation { insertBlxDrive(input: { UserId: \"u1\" }) { itemId } }")]
    [InlineData("{ getBlxDrives { items { ItemId } totalCount } }")]
    public void LeavesRealTrafficAlone(string query)
    {
        GraphQLIntrospectionHelper.ContainsIntrospectionQuery(Utf8GraphQLParser.Parse(query))
            .Should().BeFalse();
    }
}

/// <summary>
/// Phase timing has to partition a request's duration rather than double-count it, which is the
/// whole basis of the "where the time goes" breakdown.
/// </summary>
public class GatewayPhaseTimingTests
{
    [Fact]
    public void OuterPhasesExcludeTheDatabaseTimeTheyContain()
    {
        using var activity = new Activity("request").Start();

        using (GatewayOperationActivity.Measure(GatewayPhase.Policy))
        {
            Thread.Sleep(20);
            using (GatewayOperationActivity.Measure(GatewayPhase.Database))
            {
                Thread.Sleep(40);
            }
        }

        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);
        gatewayOperation.DatabaseMs.Should().BeGreaterThanOrEqualTo(40);
        // Policy saw ~60ms of wall time but only ~20ms of it was its own.
        gatewayOperation.PolicyMs.Should().BeLessThan(gatewayOperation.DatabaseMs);
    }

    [Fact]
    public void NestedDatabaseScopesAreCountedOnce()
    {
        using var activity = new Activity("request").Start();

        // One repository method delegating to another.
        using (GatewayOperationActivity.Measure(GatewayPhase.Database))
        {
            using (GatewayOperationActivity.Measure(GatewayPhase.Database))
            {
                Thread.Sleep(40);
            }
        }

        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);
        gatewayOperation.DatabaseMs.Should().BeGreaterThanOrEqualTo(40).And.BeLessThan(80);
    }

    [Fact]
    public void SequentialScopesInTheSamePhaseAccumulate()
    {
        using var activity = new Activity("request").Start();

        for (var i = 0; i < 2; i++)
        {
            using (GatewayOperationActivity.Measure(GatewayPhase.Database))
            {
                Thread.Sleep(20);
            }
        }

        GatewayOperationActivity.GetOrCreate(activity).DatabaseMs.Should().BeGreaterThanOrEqualTo(40);
    }

    [Fact]
    public void MeasuringWithoutAnActivityIsANoOp()
    {
        Activity.Current = null;

        using (GatewayOperationActivity.Measure(GatewayPhase.Database))
        {
            Thread.Sleep(5);
        }

        // Nothing to assert beyond "it did not throw" — there is no request to attribute this to.
        Activity.Current.Should().BeNull();
    }
}

/// <summary>
/// The bucketing every analytics series shares. Getting this wrong misaligns the charts against
/// each other, so the key and step are pinned down here rather than left to the callers.
/// </summary>
public class GraphLogBucketingTests
{
    [Theory]
    [InlineData("hourly", "2026-08-30T19:09:57Z", "2026-08-30T19:00:00")]
    [InlineData("daily", "2026-08-30T19:09:57Z", "2026-08-30T00:00:00")]
    [InlineData("weekly", "2026-08-30T19:09:57Z", "2026-08-24T00:00:00")] // Monday of that week
    public void KeyOfSnapsATimestampToItsBucket(string granularity, string timestamp, string expected)
    {
        var bucketing = GraphLogBucketing.Parse(granularity);

        var key = bucketing.KeyOf(DateTime.Parse(timestamp, styles: DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal));

        key.Should().Be(DateTime.Parse(expected));
    }

    [Fact]
    public void AnUnknownGranularityFallsBackToDaily()
    {
        GraphLogBucketing.Parse("fortnightly").Should().BeSameAs(GraphLogBucketing.Daily);
        GraphLogBucketing.Parse(null).Should().BeSameAs(GraphLogBucketing.Daily);
    }

    [Fact]
    public void RangeFillsEveryBucketIncludingTheEmptyOnes()
    {
        var from = new DateTime(2026, 8, 30, 22, 15, 0, DateTimeKind.Utc);
        var to = new DateTime(2026, 8, 31, 1, 5, 0, DateTimeKind.Utc);

        var buckets = GraphLogBucketing.Hourly.Range(from, to).ToList();

        buckets.Should().HaveCount(4);
        buckets[0].Should().Be(new DateTime(2026, 8, 30, 22, 0, 0, DateTimeKind.Utc));
        buckets[^1].Should().Be(new DateTime(2026, 8, 31, 1, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void HourlyDefaultsToTheLastDayRatherThanTheLastWeek()
    {
        var rangeEnd = new DateTime(2026, 8, 31, 12, 30, 0, DateTimeKind.Utc);

        GraphLogBucketing.Hourly.DefaultRangeStart(rangeEnd)
            .Should().Be(new DateTime(2026, 8, 30, 12, 0, 0, DateTimeKind.Utc));
        GraphLogBucketing.Daily.DefaultRangeStart(rangeEnd)
            .Should().Be(new DateTime(2026, 8, 24, 0, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void DailyBucketingUsesTheViewerDateRatherThanTheUtcDate()
    {
        var utcOffset = GraphLogHistoryService.GetUtcOffset(360);
        var timestamp = new DateTime(2026, 9, 8, 18, 49, 0, DateTimeKind.Utc);

        var localBucket = GraphLogBucketing.Daily.KeyOf(
            GraphLogHistoryService.ToViewerTime(timestamp, utcOffset));
        var responseDate = GraphLogHistoryService.ToBucketResponseDate(
            localBucket, GraphLogBucketing.Daily, utcOffset);

        localBucket.Should().Be(new DateTime(2026, 9, 9));
        responseDate.Should().Be(new DateTime(2026, 9, 9, 0, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void DateOnlyRangeBoundariesAreMidnightInTheViewerTimezone()
    {
        var utcOffset = GraphLogHistoryService.GetUtcOffset(360);
        var from = new DateTime(2026, 9, 2);
        var to = new DateTime(2026, 9, 9);

        GraphLogHistoryService.ToUtc(from, utcOffset)
            .Should().Be(new DateTime(2026, 9, 1, 18, 0, 0, DateTimeKind.Utc));
        GraphLogHistoryService.ToRangeEndExclusive(to, utcOffset)
            .Should().Be(new DateTime(2026, 9, 9, 18, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void HourlyBucketResponseIsARealUtcInstantForLocalRendering()
    {
        var utcOffset = GraphLogHistoryService.GetUtcOffset(360);
        var localBucket = new DateTime(2026, 9, 9, 0, 0, 0);

        GraphLogHistoryService.ToBucketResponseDate(
                localBucket, GraphLogBucketing.Hourly, utcOffset)
            .Should().Be(new DateTime(2026, 9, 8, 18, 0, 0, DateTimeKind.Utc));
    }
}
