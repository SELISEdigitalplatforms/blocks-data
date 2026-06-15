using DataGateway.DomainService.Exceptions;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Helpers;

public static class MutationValidationHelper
{
    public static void ThrowValidationError(DataValidationResult validationResult)
    {
        throw new DataValidationException(validationResult);
    }
}
