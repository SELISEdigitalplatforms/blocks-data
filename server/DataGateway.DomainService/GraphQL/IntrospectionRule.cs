using DataGateway.DomainService.Models.Constants;
using HotChocolate;
using HotChocolate.Language;
using HotChocolate.Validation;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Validation rule: introspection (<c>__schema</c> / <c>__type</c>, including through fragments) is
/// refused unless the request was marked as allowed — which <see cref="GatewayValidation"/> does for
/// authenticated requests through <c>OperationRequestBuilder.AllowIntrospection()</c>, the same
/// switch HotChocolate's own rule honours. HotChocolate's rule is not used because it can only be
/// attached to a named executor, and the tenant executors are created at runtime.
/// </summary>
public sealed class IntrospectionRule : IDocumentValidatorRule
{
    public ushort Priority => 0;

    // The verdict depends on the request (who is calling), not only on the document.
    public bool IsCacheable => false;

    public void Validate(IDocumentValidatorContext context, DocumentNode document)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(document);

        if (context.ContextData.ContainsKey(WellKnownContextData.IntrospectionAllowed)
            || !GraphQLIntrospectionHelper.ContainsIntrospectionQuery(document))
        {
            return;
        }

        context.ReportError(ErrorBuilder.New()
            .SetMessage("Introspection is not allowed for the current request.")
            .SetCode(GraphQlConstant.IntrospectionNotAllowedErrorCode)
            .Build());
    }
}
