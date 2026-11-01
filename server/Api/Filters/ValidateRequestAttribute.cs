using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Blocks.Data.Api.Filters;

/// <summary>
/// Runs the registered <see cref="IValidator{T}"/> for each action argument and answers 400
/// before the action runs when one fails. Nothing in the pipeline runs validators on its own,
/// so an endpoint whose request has a validator opts in with this attribute.
/// </summary>
/// <remarks>
/// Opt-in rather than global: the Data Gateway services validate inside the service, and the
/// upload and bulk-share endpoints report validation failures in their own response shape.
/// Arguments without a registered validator, and null arguments, are left to the action.
/// </remarks>
[AttributeUsage(AttributeTargets.Method)]
public sealed class ValidateRequestAttribute : ActionFilterAttribute
{
    public override async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var errors = new Dictionary<string, string>();

        foreach (var argument in context.ActionArguments.Values)
        {
            if (argument is null) continue;

            var validatorType = typeof(IValidator<>).MakeGenericType(argument.GetType());
            if (context.HttpContext.RequestServices.GetService(validatorType) is not IValidator validator) continue;

            var result = await validator.ValidateAsync(new ValidationContext<object>(argument), context.HttpContext.RequestAborted);
            foreach (var error in result.Errors)
                errors.TryAdd(error.PropertyName, error.ErrorMessage);
        }

        if (errors.Count > 0)
        {
            context.Result = new BadRequestObjectResult(new { message = "The request is invalid.", errors });
            return;
        }

        await next();
    }
}
