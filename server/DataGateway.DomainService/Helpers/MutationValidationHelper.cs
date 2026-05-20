using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;
using HotChocolate;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Helpers for mutation input validation and error reporting.
/// </summary>
public static class MutationValidationHelper
{
    /// <summary>Throws a GraphQL validation error with field-level details.</summary>
    public static void ThrowValidationError(DataValidationResult validationResult)
    {
        throw new GraphQLException(
            ErrorBuilder.New()
                .SetMessage(validationResult.ErrorMessage)
                .SetCode(GraphQlConstant.ValidationErrorErrorCode)
                .SetExtension("validationErrors", validationResult.Errors.Select(e => new { field = e.FieldName, message = e.Message, validationType = e.ValidationType }).ToArray())
                .Build());
    }
}
