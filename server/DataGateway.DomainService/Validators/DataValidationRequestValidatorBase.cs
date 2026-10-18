using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using MongoDB.Driver;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Validators;

public abstract class DataValidationRequestValidatorBase<T> : AbstractValidator<T>
{
    protected readonly IDbRepository _dbRepository;

    protected const string SchemaIdRequired = "Schema_Id_Is_Required.";
    protected const string SchemaIdMustExist = "Schema_Id_Must_Exist.";
    protected const string FieldNameRequired = "Field_Name_Is_Required.";
    protected const string FieldNameLength = "Field_Name_Length_Must_Be_Between_1_And_100_Characters.";
    protected const string ValidationsRequired = "At_Least_One_Validation_Rule_Is_Required.";

    protected DataValidationRequestValidatorBase(IDbRepository dbRepository)
    {
        _dbRepository = dbRepository;
    }

    protected async Task<bool> SchemaExists(string schemaId)
    {
        if (string.IsNullOrWhiteSpace(schemaId))
            return false;

        var filter = Builders<SchemaDefinition>.Filter.Eq(x => x.ItemId, schemaId);
        var schema = await _dbRepository.GetItemAsync<SchemaDefinition>(filter);
        // A system entity's field validations are not tenant-editable.
        return schema is not null && !schema.IsSystemEntity;
    }

    /// <summary>
    /// Adds the check for Reference rules (value must exist in another schema's data): at most one per field,
    /// on a text or number field, pointing at a single-value field of the same kind on an existing Entity schema.
    /// </summary>
    protected void ValidateReferenceRules(Func<T, string> schemaId, Func<T, string> fieldName, Func<T, List<ValidationRuleRequest>?> rules)
    {
        RuleFor(x => x).CustomAsync(async (request, context, _) =>
        {
            var problem = await CheckReferenceRulesAsync(schemaId(request), fieldName(request), rules(request));
            if (problem is not null)
                context.AddFailure("Validations", problem);
        });
    }

    private async Task<string?> CheckReferenceRulesAsync(string schemaId, string fieldName, List<ValidationRuleRequest>? rules)
    {
        var references = rules?.Where(r => r.Type == ValidationType.Reference).ToList() ?? [];
        if (references.Count == 0)
            return null;
        if (references.Count > 1)
            return ReferenceRuleCompatibility.OnlyOneReference;

        var schema = await _dbRepository.GetItemAsync<SchemaDefinition>(Builders<SchemaDefinition>.Filter.Eq(x => x.ItemId, schemaId));
        var source = schema?.Fields.FirstOrDefault(f => f.Name == fieldName);
        if (source is null)
            return ReferenceRuleCompatibility.SourceFieldMustExist;

        var rule = references[0].MapToEntity();
        var targetFilter = Builders<SchemaDefinition>.Filter.Eq(x => x.SchemaName, ReferenceTargets.TargetSchemaName(rule))
            & Builders<SchemaDefinition>.Filter.Eq(x => x.IsDeleted, false);
        var target = await _dbRepository.GetItemAsync<SchemaDefinition>(targetFilter);
        return ReferenceRuleCompatibility.Check(source, target, ReferenceTargets.TargetFieldName(rule));
    }
}
