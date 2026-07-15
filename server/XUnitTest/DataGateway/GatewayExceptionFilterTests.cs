using BlocksTemplate.Api.Filters;
using DataGateway.DomainService.Exceptions;
using DataGateway.DomainService.Models.Responses;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;

namespace XUnitTest.DataGateway;

public class GatewayExceptionFilterTests
{
    private static ExceptionContext BuildContext(Exception ex, string method = "GET", bool withId = false)
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Method = method;
        var routeData = new RouteData();
        if (withId)
            routeData.Values["id"] = "1";
        var actionContext = new ActionContext(httpContext, routeData, new ActionDescriptor());
        return new ExceptionContext(actionContext, new List<IFilterMetadata>()) { Exception = ex };
    }

    [Fact]
    public void OnException_NonGatewayException_NotHandled()
    {
        var filter = new GatewayExceptionFilter();
        var context = BuildContext(new InvalidOperationException("boom"));
        filter.OnException(context);
        context.ExceptionHandled.Should().BeFalse();
        context.Result.Should().BeNull();
    }

    [Fact]
    public void OnException_AccessDenied_ListEndpoint_ReturnsEmptyList200()
    {
        var filter = new GatewayExceptionFilter();
        var context = BuildContext(new AccessDeniedException("denied"), method: "GET", withId: false);
        filter.OnException(context);
        context.ExceptionHandled.Should().BeTrue();
        context.Result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(200);
    }

    [Fact]
    public void OnException_AccessDenied_SingleResource_Returns404()
    {
        var filter = new GatewayExceptionFilter();
        var context = BuildContext(new AccessDeniedException("denied"), method: "GET", withId: true);
        filter.OnException(context);
        context.Result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(404);
    }

    [Fact]
    public void OnException_ValidationException_Returns400WithGroupedErrors()
    {
        var result = new DataValidationResult();
        result.AddError("Email", "Email is invalid", "Regex");
        var filter = new GatewayExceptionFilter();
        var context = BuildContext(new DataValidationException(result), method: "POST");
        filter.OnException(context);
        context.Result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(400);
    }

    [Fact]
    public void OnException_EntityNotFound_Returns404()
    {
        var filter = new GatewayExceptionFilter();
        var context = BuildContext(new EntityNotFoundException("Schema not found"), method: "GET", withId: true);
        filter.OnException(context);
        context.Result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(404);
    }
}
