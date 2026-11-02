using System.Reflection;
using Api.Controllers;
using Blocks.Genesis;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;

namespace XUnitTest.Api;

/// <summary>
/// The REST routes of the Data Gateway, read from the controller's attributes: the table is the public contract
/// (spec §6.1), so a renamed template or a changed verb must fail here.
/// </summary>
public class DataGatewayRestRouteTests
{
    private static readonly (string Action, string Verb, string Template)[] Expected =
    [
        ("Get", "GET", ""),
        ("Get", "POST", ""),
        ("GetById", "GET", "item/{itemId}"),
        ("Insert", "POST", "item"),
        ("Update", "PATCH", "item/{itemId}"),
        ("Upsert", "PUT", "item/{itemId}"),
        ("Delete", "DELETE", "item/{itemId}"),
        ("InsertMany", "POST", "items"),
        ("UpdateMany", "PATCH", "items"),
        ("DeleteMany", "DELETE", "items"),
    ];

    private static IEnumerable<MethodInfo> Actions() =>
        typeof(DataGatewayController).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);

    private static (string Action, string Verb, string Template) Route(MethodInfo action)
    {
        var http = action.GetCustomAttributes<HttpMethodAttribute>().Should().ContainSingle().Subject;
        return (action.Name, http.HttpMethods.Should().ContainSingle().Subject, http.Template ?? "");
    }

    [Fact]
    public void EveryAction_HasExpectedVerbAndTemplate()
    {
        Actions().Select(Route).Should().BeEquivalentTo(Expected);

        typeof(DataGatewayController).GetCustomAttribute<RouteAttribute>()!.Template.Should().Be("gateway/{entity}");
        typeof(DataGatewayController).GetCustomAttribute<ApiControllerAttribute>().Should().NotBeNull();
    }

    [Fact]
    public void Routes_DoNotCollide()
    {
        var routes = Actions().Select(Route).Select(r => (r.Verb, r.Template)).ToList();

        routes.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void EveryAction_BindsTheEntityFromTheRoute_AndItemIdsToo()
    {
        foreach (var action in Actions())
        {
            var parameters = action.GetParameters();
            parameters.Select(p => p.Name).Should().Contain("entity");
            var template = Route(action).Template;
            if (template.Contains("{itemId}"))
                parameters.Select(p => p.Name).Should().Contain("itemId");
            else
                parameters.Select(p => p.Name).Should().NotContain("itemId");
        }
    }

    [Fact]
    public void EveryActionThatReadsABody_ConsumesJson_AndTakesItFromTheBody()
    {
        var withBody = new[]
        {
            (Verb: "POST", Template: ""), (Verb: "POST", Template: "item"), (Verb: "PATCH", Template: "item/{itemId}"),
            (Verb: "PUT", Template: "item/{itemId}"), (Verb: "POST", Template: "items"), (Verb: "PATCH", Template: "items"),
            (Verb: "DELETE", Template: "items"),
        };

        foreach (var action in Actions())
        {
            var route = Route(action);
            var reads = withBody.Contains((route.Verb, route.Template));
            var consumes = action.GetCustomAttribute<ConsumesAttribute>();
            if (reads)
            {
                consumes.Should().NotBeNull($"{route.Verb} {route.Template} reads a JSON body");
                consumes!.ContentTypes.Should().Equal("application/json");
                action.GetParameters().Should().ContainSingle(p => p.GetCustomAttribute<FromBodyAttribute>() != null);
            }
            else
            {
                consumes.Should().BeNull();
                action.GetParameters().Should().NotContain(p => p.GetCustomAttribute<FromBodyAttribute>() != null);
            }
        }
    }

    [Fact]
    public void BothDeletes_TakeHardDeleteFromTheQuery_DefaultingToFalse()
    {
        var deletes = Actions().Where(a => a.Name is "Delete" or "DeleteMany").ToList();

        deletes.Should().HaveCount(2);
        foreach (var action in deletes)
        {
            var parameter = action.GetParameters().Single(p => p.Name == "hardDelete");
            parameter.ParameterType.Should().Be(typeof(bool));
            parameter.GetCustomAttribute<FromQueryAttribute>().Should().NotBeNull();
            parameter.HasDefaultValue.Should().BeTrue();
            parameter.DefaultValue.Should().Be(false);
        }
    }

    [Fact]
    public void Controller_CarriesProblemAndSizeLimitFilters()
    {
        // Without these the 400/413/415 problem contract and the request body limit silently disappear.
        typeof(DataGatewayController).GetCustomAttribute<RestProblemFilterAttribute>().Should().NotBeNull();
        typeof(DataGatewayController).GetCustomAttribute<RestRequestSizeLimitAttribute>().Should().NotBeNull();
    }

    [Fact]
    public void Controller_IsNotProtectedByAnEndpointPolicy_SoPublicEntitiesWorkAnonymously()
    {
        typeof(DataGatewayController).GetCustomAttribute<ProtectedEndPointAttribute>().Should().BeNull();
        Actions().Should().OnlyContain(a => a.GetCustomAttribute<ProtectedEndPointAttribute>() == null);
    }
}
