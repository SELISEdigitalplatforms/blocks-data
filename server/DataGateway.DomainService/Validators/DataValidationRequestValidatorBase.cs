using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using MongoDB.Driver;
using Blocks.Genesis.Entities.Data;
using Blocks.Genesis.DataAccess.Rules;

namespace DataGateway.DomainService.Validators;

/// <summary>Messages of the validation rule checks that are shared by the validation API and schema import.</summary>
public static class DataValidationRequestValidatorMessages
{
    public const string OnlyOneMustNotExistIn = "Only_One_Must_Not_Exist_In_Validation_Per_Field.";

    public static string FilterPropertyMissing(string property, string schemaName) => $"{property} isn't a property of {schemaName}";

    /// <summary>
    /// The properties a Reference / Must not exist in filter names that <paramref name="target"/> doesn't have. Nested
    /// properties are dotted rows of the schema; ItemId is on every record. The rule's other checks are Genesis's.
    /// </summary>
    public static IEnumerable<string> FilterProblems(PolicyRuleGroup? filter, SchemaDefinition? target)
    {
        if (filter is null || target is null)
            yield break;
        var properties = target.Fields.Select(f => f.Name).Append(ReferenceTargets.DefaultTargetField).ToHashSet(StringComparer.Ordinal);
        foreach (var name in FilterProperties(filter).Where(name => !properties.Contains(name)).Distinct())
            yield return FilterPropertyMissing(name, target.SchemaName);
    }

    private static IEnumerable<string> FilterProperties(PolicyRuleGroup group) =>
        group.Rules.Where(rule => rule.LeftSource == ConditionSource.SCHEMA_FIELD).Select(rule => rule.LeftOperand)
            .Concat(group.NestedGroups.SelectMany(FilterProperties));

    /// <summary>
    /// The schema a rule's target name means: the tenant's own Entity of that name first, as the schema build picks it,
    /// then a system entity, holding only what a lookup may see (<see cref="SystemLookupTargets"/>).
    /// </summary>
    public static async Task<SchemaDefinition?> FindTargetAsync(IDbRepository repository, string schemaName)
    {
        var byName = Builders<SchemaDefinition>.Filter.Eq(x => x.SchemaName, schemaName) & Builders<SchemaDefinition>.Filter.Eq(x => x.IsDeleted, false);
        return await repository.GetItemAsync(byName & Builders<SchemaDefinition>.Filter.Ne(x => x.IsSystemEntity, true))
            ?? SystemLookupTargets.Restrict(await repository.GetItemAsync(byName & Builders<SchemaDefinition>.Filter.Eq(x => x.IsSystemEntity, true)));
    }
}

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
    /// Adds the check for Reference rules (value must exist in another schema's data) and Must not exist in rules
    /// (it must not): at most one of each per field, on a text or number field, pointing at a single-value field of
    /// the same kind on an existing Entity schema.
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

    /// <summary>
    /// Adds the check for variables in comparison values (<c>{{Schema.StartDate}}</c>): well formed, naming an
    /// existing single-value property of the same kind. Only version-1 rules have variables.
    /// </summary>
    protected void ValidateVariableRules(Func<T, string> schemaId, Func<T, string> fieldName, Func<T, List<ValidationRuleRequest>?> rules)
    {
        RuleFor(x => x).CustomAsync(async (request, context, _) =>
        {
            var candidates = (rules(request) ?? []).Where(r => r.EvaluationVersion >= 1).ToList();
            if (candidates.Count == 0)
                return;

            var schema = await _dbRepository.GetItemAsync<SchemaDefinition>(Builders<SchemaDefinition>.Filter.Eq(x => x.ItemId, schemaId(request)));
            var source = schema?.Fields.FirstOrDefault(f => f.Name == fieldName(request));
            if (schema is null || source is null)
                return;

            var fields = VariableSyntax.FieldsOf(schema.Fields);
            foreach (var rule in candidates)
            {
                if (ValidationVariableCheck.Check(rule.MapToEntity(), source.Type, schema.SchemaName, fields) is { } problem)
                {
                    context.AddFailure("Validations", problem);
                    return;
                }
            }
        });
    }

    /// <summary>
    /// Adds the check for the rule features that came with the validation and access rules plan (the types In, Not in,
    /// list rules and Must not exist in, "only when" conditions, reference filters and dates relative to now). A rule
    /// that uses none of them gets no message from it.
    /// </summary>
    protected void ValidateNewRules(Func<T, string> schemaId, Func<T, string> fieldName, Func<T, List<ValidationRuleRequest>?> rules)
    {
        RuleFor(x => x).CustomAsync(async (request, context, _) =>
        {
            var requested = rules(request) ?? [];
            if (requested.Count == 0)
                return;

            var schema = await _dbRepository.GetItemAsync<SchemaDefinition>(Builders<SchemaDefinition>.Filter.Eq(x => x.ItemId, schemaId(request)));
            var source = schema?.Fields.FirstOrDefault(f => f.Name == fieldName(request));
            if (schema is null || source is null)
                return;

            var field = new RuleField(source.Name, source.Type, source.IsArray, source.EnumValues);
            var fields = VariableSyntax.FieldsOf(schema.Fields);
            foreach (var problem in requested.SelectMany(r => ValidationRuleCheck.Check(r.MapToEntity(), field, schema.SchemaName, schema.IsSystemEntity, fields)).Distinct())
                context.AddFailure("Validations", problem);
        });
    }

    private async Task<string?> CheckReferenceRulesAsync(string schemaId, string fieldName, List<ValidationRuleRequest>? rules)
    {
        var lookups = rules?.Where(r => r.Type is ValidationType.Reference or ValidationType.NotExistsIn).ToList() ?? [];
        if (lookups.Count == 0)
            return null;
        if (lookups.Count(r => r.Type == ValidationType.Reference) > 1)
            return ReferenceRuleCompatibility.OnlyOneReference;
        if (lookups.Count(r => r.Type == ValidationType.NotExistsIn) > 1)
            return DataValidationRequestValidatorMessages.OnlyOneMustNotExistIn;

        var schema = await _dbRepository.GetItemAsync<SchemaDefinition>(Builders<SchemaDefinition>.Filter.Eq(x => x.ItemId, schemaId));
        var source = schema?.Fields.FirstOrDefault(f => f.Name == fieldName);
        if (source is null)
            return ReferenceRuleCompatibility.SourceFieldMustExist;

        foreach (var rule in lookups.Select(r => r.MapToEntity()))
        {
            var target = await DataValidationRequestValidatorMessages.FindTargetAsync(_dbRepository, ReferenceTargets.TargetSchemaName(rule));
            if (ReferenceRuleCompatibility.Check(source, target, ReferenceTargets.TargetFieldName(rule)) is { } problem)
                return problem;
            if (DataValidationRequestValidatorMessages.FilterProblems(rule.TargetFilter, target).FirstOrDefault() is { } filterProblem)
                return filterProblem;
        }
        return null;
    }
}
