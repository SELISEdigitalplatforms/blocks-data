using System.Diagnostics;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Middlewares;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution.Processing;
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
