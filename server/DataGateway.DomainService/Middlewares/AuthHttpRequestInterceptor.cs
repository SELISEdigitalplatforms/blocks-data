using System.Net;
using HotChocolate.AspNetCore.Serialization;
using HotChocolate.Execution;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;

namespace DataGateway.DomainService.Middlewares;

public class AuthHttpResponseFormatter : DefaultHttpResponseFormatter
{
    protected override HttpStatusCode OnDetermineStatusCode(
        IOperationResult result,
        FormatInfo format,
        HttpStatusCode? proposedStatusCode)
    {
        var errors = result.Errors;
        if (errors?.Count > 0)
        {
            var codes = errors.Select(error => error.Code).ToList();
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

            // Invalid GraphQL input is an HTTP client error. Hot Chocolate normally supplies an
            // HCxxxx code, but literal coercion errors can contain only a message (for example an
            // EnumValue supplied where DynamicSortInput is required).
            if (errors.Any(error =>
                GatewayFailureKind.IsGraphQlDocumentError(error.Code, error.Message)))
            {
                return HttpStatusCode.BadRequest;
            }
        }

        return base.OnDetermineStatusCode(result, format, proposedStatusCode);
    }
}
