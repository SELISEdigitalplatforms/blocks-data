using System.Diagnostics;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Helpers;

public static class MutationValidationHelper
{
    public static void ThrowValidationError(DataValidationResult validationResult, string? message = null)
    {
        GatewayOperationActivity.MarkFailed(
            Activity.Current,
            GatewayFailureKind.Validation,
            message ?? validationResult.ErrorMessage,
            GraphQlConstant.ValidationErrorErrorCode);

        throw new GraphQLException(
            ErrorBuilder.New()
                .SetMessage(message ?? validationResult.ErrorMessage)
                .SetCode(GraphQlConstant.ValidationErrorErrorCode)
                .SetExtension("validationErrors", validationResult.Errors.Select(e => new { field = e.FieldName, message = e.Message, validationType = e.ValidationType }).ToArray())
                .Build());
    }
}
