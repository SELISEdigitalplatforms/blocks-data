using System.Globalization;
using DataGateway.DomainService.Validators;

namespace Api.Controllers;

/// <summary>
/// The <c>schemaName</c> route constraint: a route value matches only when it could be a schema name
/// (<see cref="SchemaNameRules"/>: 1 to 50 letters, digits or '_', not starting with a digit). On the REST routes it
/// keeps a <c>{entity}:{verb}</c> segment off the standard routes (the ':' never passes), and makes the router answer
/// 404 for a name no schema can have, before any action or the service runs (spec 2026-11-04 §3.1, §3.3).
/// </summary>
public sealed class SchemaNameRouteConstraint : IRouteConstraint
{
    /// <summary>The name the constraint is registered under in <c>RouteOptions.ConstraintMap</c> (<c>Program.cs</c>).</summary>
    public const string Name = "schemaName";

    /// <inheritdoc />
    public bool Match(HttpContext? httpContext, IRouter? route, string routeKey, RouteValueDictionary values, RouteDirection routeDirection)
    {
        ArgumentNullException.ThrowIfNull(values);
        return values.TryGetValue(routeKey, out var value)
            && SchemaNameRules.IsValid(Convert.ToString(value, CultureInfo.InvariantCulture));
    }
}
