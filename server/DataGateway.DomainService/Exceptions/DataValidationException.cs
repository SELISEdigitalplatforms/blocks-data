using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Exceptions;

public class DataValidationException : DataGatewayException
{
    public DataValidationResult ValidationResult { get; }

    public DataValidationException(DataValidationResult validationResult)
        : base(validationResult.ErrorMessage, "VALIDATION_ERROR", 400)
    {
        ValidationResult = validationResult;
    }
}
