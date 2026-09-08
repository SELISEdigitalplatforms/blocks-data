using System.Net;
using HotChocolate.AspNetCore.Serialization;
using HotChocolate.Execution;
using DataGateway.DomainService.Models.Constants;

namespace DataGateway.DomainService.Middlewares;

public class AuthHttpResponseFormatter : DefaultHttpResponseFormatter
{
    protected override HttpStatusCode OnDetermineStatusCode(
        IOperationResult result,
        FormatInfo format,
        HttpStatusCode? proposedStatusCode)
    {
        if (result.Errors?.Count > 0)
        {
            var codes = result.Errors.Select(error => error.Code).ToList();
            foreach (var code in codes)
            {
                if (code == GraphQlConstant.UnauthorizedErrorCode)
                {
                    return HttpStatusCode.Unauthorized;
                }

                if (code == "FORBIDDEN" || code == "AUTH_NOT_AUTHORIZED")
                {
                    return HttpStatusCode.Forbidden;
                }
            }

            // Hot Chocolate's HCxxxx codes describe a GraphQL document that could not be parsed or
            // validated. The request was understood by HTTP but is invalid GraphQL input, so expose
            // it as a client error instead of the GraphQL transport's default 200 response.
            if (codes.Any(code => code?.StartsWith("HC", StringComparison.Ordinal) == true))
            {
                return HttpStatusCode.BadRequest;
            }
        }

        return base.OnDetermineStatusCode(result, format, proposedStatusCode);
    }
}
