using System.Reflection;
using Api.Controllers;
using DataGateway.Rest;
using FluentAssertions;

namespace XUnitTest.Architecture;

/// <summary>
/// The REST transport talks to the gateway engine only. It must not depend on the GraphQL transport (HotChocolate)
/// or on the store (MongoDB): every database detail stays behind the engine.
/// </summary>
public class RestArchitectureTests
{
    [Fact]
    public void Rest_ReferencesNoHotChocolateOrMongo()
    {
        typeof(RestLimits).Assembly.GetReferencedAssemblies()
            .Select(a => a.Name).Should().NotContain(n => n!.StartsWith("HotChocolate") || n.StartsWith("MongoDB"));
    }

    /// <summary>
    /// The controller is a thin shell (spec §3.3): what it is built from and what its actions take come from the REST
    /// project, the BCL, System.Text.Json or ASP.NET Core, never from the domain service or a store.
    /// </summary>
    [Fact]
    public void DataGatewayController_DependsOnlyOnRestAndFramework()
    {
        var restAssembly = typeof(RestLimits).Assembly;
        var allowedAssemblies = new[] { restAssembly, typeof(object).Assembly, typeof(System.Text.Json.JsonElement).Assembly };
        bool Allowed(Type type)
        {
            if (type.IsGenericType && type.GetGenericArguments().Any(argument => !Allowed(argument)))
                return false;
            if (type.HasElementType && !Allowed(type.GetElementType()!))
                return false;
            var name = type.Assembly.GetName().Name ?? string.Empty;
            return allowedAssemblies.Contains(type.Assembly)
                || name.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal)
                || name.StartsWith("Microsoft.Extensions", StringComparison.Ordinal)
                || name.StartsWith("System.", StringComparison.Ordinal);
        }

        var controller = typeof(DataGatewayController);
        var constructorTypes = controller.GetConstructors().SelectMany(c => c.GetParameters()).Select(p => p.ParameterType);
        var actionTypes = controller
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .SelectMany(m => m.GetParameters().Select(p => p.ParameterType).Append(m.ReturnType));

        constructorTypes.Concat(actionTypes).Where(type => !Allowed(type)).Should().BeEmpty();
    }
}
