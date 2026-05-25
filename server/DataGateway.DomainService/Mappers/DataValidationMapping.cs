using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Mappers;

public static class DataValidationMapping
{
    public static DataValidationResponse MapToResponse(this DataValidation entity)
    {
        return new DataValidationResponse
        {
            ItemId = entity.ItemId,
            SchemaId = entity.SchemaId,
            FieldName = entity.FieldName,
            Validations = entity.Validations?.Select(v => v.MapToResponse()).ToList() ?? new List<ValidationRuleResponse>(),
            CreatedDate = entity.CreatedDate,
            LastUpdatedDate = entity.LastUpdatedDate
        };
    }

    public static ValidationRuleResponse MapToResponse(this ValidationRule rule)
    {
        return new ValidationRuleResponse
        {
            Type = rule.Type,
            Value = rule.Value,
            SecondaryValue = rule.SecondaryValue,
            ErrorMessage = rule.ErrorMessage,
            IsActive = rule.IsActive
        };
    }

    public static ValidationRule MapToEntity(this Models.ValidationRuleRequest request)
    {
        return new ValidationRule
        {
            Type = request.Type,
            Value = JsonValueHelper.ToStorableValue(request.Value),
            SecondaryValue = JsonValueHelper.ToStorableValue(request.SecondaryValue),
            ErrorMessage = request.ErrorMessage,
            IsActive = request.IsActive
        };
    }
}
