using Blocks.Genesis;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Blocks.Data.Api.Filters;

/// <summary>
/// Answers HTTP 413 with the upload error envelope (<c>{ isSuccess: false, errors: { File: "request_body_exceeds_maximum_allowed" } }</c>)
/// when a form request body is larger than the action's <see cref="RequestSizeLimitAttribute"/>. The action never runs.
/// </summary>
/// <remarks>
/// Kestrel signals an oversized body by failing the read with a 413 <see cref="BadHttpRequestException"/>. Left to model
/// binding, that read failure is kept only as a model-state message and <c>[ApiController]</c> answers it as a generic 400,
/// so this filter reads the form itself first. It is a resource filter: it runs after the authorization filters that apply
/// the request limits and after the global permission filter, and before model binding, which then reuses the form read
/// here. Any other read failure (a malformed or aborted body) is left to model binding, which answers it as before.
/// </remarks>
[AttributeUsage(AttributeTargets.Method)]
public sealed class RequestBodyTooLargeFilterAttribute : Attribute, IAsyncResourceFilter
{
    /// <summary>The error code returned under <c>errors.File</c>.</summary>
    public const string ErrorCode = "request_body_exceeds_maximum_allowed";

    /// <inheritdoc />
    public async Task OnResourceExecutionAsync(ResourceExecutingContext context, ResourceExecutionDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        if (await IsBodyTooLargeAsync(context.HttpContext))
        {
            context.Result = new ObjectResult(new BaseResponse
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string> { ["File"] = ErrorCode },
            })
            {
                StatusCode = StatusCodes.Status413PayloadTooLarge,
            };
            return;
        }

        await next();
    }

    private static async Task<bool> IsBodyTooLargeAsync(HttpContext http)
    {
        if (!http.Request.HasFormContentType)
            return false;

        try
        {
            await http.Request.ReadFormAsync(http.RequestAborted);
            return false;
        }
        catch (BadHttpRequestException exception) when (exception.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return true;
        }
        catch (Exception exception) when (exception is IOException or InvalidDataException)
        {
            // Not a size failure: model binding reads the form again and reports it as it always has.
            return false;
        }
    }
}
