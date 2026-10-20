using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Responses;
using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Rules;

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
            IsActive = rule.IsActive,
            EvaluationVersion = rule.EvaluationVersion
        };
    }

    public static ValidationRule MapToEntity(this Models.ValidationRuleRequest request)
    {
        var rule = new ValidationRule
        {
            Type = request.Type,
            Value = JsonValueHelper.ToStorableValue(request.Value),
            SecondaryValue = JsonValueHelper.ToStorableValue(request.SecondaryValue),
            ErrorMessage = request.ErrorMessage,
            IsActive = request.IsActive,
            EvaluationVersion = request.EvaluationVersion ?? 0
        };
        if (rule.Type == ValidationType.Reference)
        {
            // Stored as plain names: the target schema, and its field (ItemId unless another was picked).
            rule.Value = ReferenceTargets.TargetSchemaName(rule);
            rule.SecondaryValue = ReferenceTargets.TargetFieldName(rule);
            // A new rule type, so it has no earlier behaviour to keep: lists are always checked item by item.
            rule.EvaluationVersion = 1;
        }
        return rule;
    }
}
