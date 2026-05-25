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
        }

        return base.OnDetermineStatusCode(result, format, proposedStatusCode);
    }
}
