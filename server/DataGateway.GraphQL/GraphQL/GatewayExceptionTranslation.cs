using DataGateway.DomainService.Gateway;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Turns the transport-neutral <see cref="GatewayException"/> into the GraphQL error the gateway has
/// always returned, so shared code can throw one exception type and GraphQL callers see no change.
/// </summary>
public static class GatewayExceptionTranslation
{
    public static GraphQLException ToGraphQLException(this GatewayException ex)
    {
        ArgumentNullException.ThrowIfNull(ex);

        var error = ErrorBuilder.New()
            .SetMessage(ex.Message)
            .SetCode(ex.Code);

        if (ex.FieldErrors is not null)
        {
            error.SetExtension(
                "validationErrors",
                ex.FieldErrors
                    .Select(e => new { field = e.Field, message = e.Message, validationType = e.ValidationType })
                    .ToArray());
        }

        return new GraphQLException(error.Build());
    }

    public static async Task<T> TranslateAsync<T>(Func<Task<T>> action)
    {
        ArgumentNullException.ThrowIfNull(action);

        try
        {
            return await action();
        }
        catch (GatewayException ex)
        {
            throw ex.ToGraphQLException();
        }
    }
}
