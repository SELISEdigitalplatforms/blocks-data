using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using Blocks.Genesis.DataAccess.Rules;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models.Constants;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// The transport-neutral form of <see cref="MutationValidationHelper.ThrowValidationError"/>: marks the request
/// failed the same way and throws a <see cref="GatewayException"/> carrying the same code, message and per-field
/// errors. The GraphQL layer turns it back into the error <c>ThrowValidationError</c> builds
/// (<c>GatewayExceptionTranslation</c>), so GraphQL clients see no change.
/// </summary>
public static class GatewayValidationError
{
    [DoesNotReturn]
    public static void Throw(DataValidationResult validationResult, string? message = null)
    {
        GatewayOperationActivity.MarkFailed(
            Activity.Current,
            GatewayFailureKind.Validation,
            message ?? validationResult.ErrorMessage,
            GraphQlConstant.ValidationErrorErrorCode);

        throw new GatewayException(
            GraphQlConstant.ValidationErrorErrorCode,
            message ?? validationResult.ErrorMessage,
            validationResult.Errors
                .Select(e => new GatewayFieldError(e.FieldName, e.Message, e.ValidationType))
                .ToList());
    }
}
