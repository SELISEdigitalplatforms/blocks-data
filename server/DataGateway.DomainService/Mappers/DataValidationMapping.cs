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
            EvaluationVersion = rule.EvaluationVersion,
            When = rule.When,
            TargetFilter = rule.TargetFilter
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
            EvaluationVersion = request.EvaluationVersion ?? 0,
            When = request.When,
            TargetFilter = request.TargetFilter
        }.WithPlainList();
        if (ReferenceTargets.IsLookupRule(rule))
        {
            // Stored as plain names: the target schema, and its field (ItemId unless another was picked).
            rule.Value = ReferenceTargets.TargetSchemaName(rule);
            rule.SecondaryValue = ReferenceTargets.TargetFieldName(rule);
        }
        if (rule.Type == ValidationType.Reference)
        {
            // Lists are always checked item by item, so at least 1. A higher version the client sends is kept:
            // from 2, deleted target rows don't count.
            rule.EvaluationVersion = Math.Max(rule.EvaluationVersion, 1);
        }
        return rule;
    }

    /// <summary>
    /// In / Not in values as a plain list. A JSON array arrives as an array, which the BSON object serializer writes
    /// as <c>{ _t, _v }</c>; a list is written as a plain array.
    /// </summary>
    public static ValidationRule WithPlainList(this ValidationRule rule)
    {
        if (rule.Type is ValidationType.In or ValidationType.NotIn && rule.Value is object?[] values)
            rule.Value = values.ToList();
        return rule;
    }
}
