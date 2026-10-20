using DataGateway.DomainService.Models.Constants;
using HotChocolate.Execution;
using HotChocolate.Execution.Configuration;
using HotChocolate.Validation.Options;
using Microsoft.Extensions.DependencyInjection;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Validation that has to hold on <b>every</b> tenant executor.
///
/// HotChocolate keys validation by executor name: <c>DisableIntrospection()</c>,
/// <c>AddValidationRule()</c> and friends configure only the executor they are called on. The
/// gateway's <c>AddGraphQLServer()</c> is a template that serves no traffic; the executors that do
/// are created at runtime per tenant by <see cref="ProjectExecutorOptionsMonitor"/>, under names
/// nobody knows at startup. So the settings are registered for all names at once
/// (<c>ConfigureAll</c>), which also covers names created later.
/// </summary>
public static class GatewayValidation
{
    public static IRequestExecutorBuilder AddGatewayValidation(this IRequestExecutorBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.ConfigureAll<ValidationOptionsModifiers>(modifiers =>
            modifiers.RulesModifiers.Add((_, rules) =>
            {
                // Introspection is refused unless the request is marked as allowed below.
                rules.Rules.Add(new IntrospectionRule());
                rules.Rules.Add(new MaxRootFieldsRule(GraphQlConstant.MaxRootFieldsPerOperation));
            }));

        // A logged-in user may read their own tenant's schema (the console's playground relies on
        // it); anyone else is refused by IntrospectionRule. DataGatewayGraphQLEndpointExtensions
        // sets context.User only when the request carried a valid token.
        return builder.AddHttpRequestInterceptor((context, _, request, _) =>
        {
            if (context.User?.Identity?.IsAuthenticated == true)
            {
                request.AllowIntrospection();
            }

            return default;
        });
    }
}
