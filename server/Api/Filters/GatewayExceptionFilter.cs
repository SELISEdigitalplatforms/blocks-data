using DataGateway.DomainService.Exceptions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace BlocksTemplate.Api.Filters;

public class GatewayExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not DataGatewayException gatewayEx)
            return;

        context.ExceptionHandled = true;

        switch (gatewayEx)
        {
            case AccessDeniedException accessDenied:
                HandleAccessDenied(context, accessDenied);
                break;

            case DataValidationException validation:
                var errors = validation.ValidationResult.Errors
                    .GroupBy(e => e.FieldName)
                    .ToDictionary(
                        g => g.Key,
                        g => g.Select(e => new { code = $"validation_{e.ValidationType.ToLowerInvariant()}", message = e.Message }).ToArray());

                context.Result = new ObjectResult(new
                {
                    status = 400,
                    message = "Validation failed.",
                    data = errors
                })
                { StatusCode = 400 };
                break;

            case EntityNotFoundException:
                context.Result = new ObjectResult(new
                {
                    status = 404,
                    message = gatewayEx.Message
                })
                { StatusCode = 404 };
                break;

            default:
                context.Result = new ObjectResult(new
                {
                    status = gatewayEx.StatusCode,
                    message = gatewayEx.Message
                })
                { StatusCode = gatewayEx.StatusCode };
                break;
        }
    }

    private static void HandleAccessDenied(ExceptionContext context, AccessDeniedException ex)
    {
        var isListEndpoint = context.HttpContext.Request.Method == "GET" &&
                             !context.RouteData.Values.ContainsKey("id");

        if (isListEndpoint)
        {
            // PocketBase pattern: return empty list instead of 403 to prevent enumeration
            context.Result = new ObjectResult(new
            {
                items = Array.Empty<object>(),
                totalCount = 0,
                page = 1,
                perPage = 20,
                totalPages = 0,
                hasNextPage = false,
                hasPreviousPage = false
            })
            { StatusCode = 200 };
        }
        else
        {
            // PocketBase pattern: return 404 for single-resource access denial to prevent existence leaks
            context.Result = new ObjectResult(new
            {
                status = 404,
                message = "The requested resource wasn't found."
            })
            { StatusCode = 404 };
        }
    }
}
