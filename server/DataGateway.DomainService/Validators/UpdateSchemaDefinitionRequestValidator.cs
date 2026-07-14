using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using MongoDB.Driver;

namespace DataGateway.DomainService.Validators;

public class UpdateSchemaDefinitionRequestValidator : AbstractValidator<UpdateSchemaDefinitionRequest>
{
    private readonly IDbRepository _dbRepository;
    private const string SchemaNameRequired = "Schema_Name_Is_Required.";
    private const string SchemaNameLength = "Schema_Name_Length_Must_Be_Between_1_And_50_Characters.";
    private const string SchemaNameInvalid = "Schema_Name_Invalid.";
    private const string SchemaNameAllowedChars = "Schema_Name_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.";

    private const string CollectionNameRequired = "Collection_Name_Is_Required.";
    private const string CollectionNameLength = "Collection_Name_Length_Must_Be_Between_1_And_50_Characters.";
    private const string CollectionNameUnique = "Collection_Name_Must_Be_Unique.";
    private const string CollectionNameAllowedChars = "Collection_Name_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.";

    private const string SchemaTypeRequired = "Schema_Type_Is_Required.";
    private const string SchemaTypeValid = "Schema_Type_Must_Be_Valid.";

    private const string FieldsRequired = "Fields_Are_Required.";
    private const string FieldsUnique = "Field_Names_Must_Be_Unique.";

    public UpdateSchemaDefinitionRequestValidator(IDbRepository dbRepository)
    {
        _dbRepository = dbRepository;

        Validate();
    }
    private void Validate()
    {
        RuleFor(x => x.ItemId)
            .NotEmpty().WithMessage("ItemId_Is_Required.");

        RuleFor(x => x.SchemaName)
            .NotEmpty().WithMessage(SchemaNameRequired)
            .Length(1, 50).WithMessage(SchemaNameLength)
            .Matches(SchemaValidatorHelper.NameAllowedPattern).WithMessage(SchemaNameAllowedChars);

        RuleFor(x => new { x.ItemId, x.SchemaName })
            .MustAsync(async (schemaDef, cancellation)
                => await IsValidSchemaName(schemaDef.SchemaName, schemaDef.ItemId)).WithMessage(SchemaNameInvalid);

        RuleFor(x => x.CollectionName)
            .Must((request, collectionName) => SchemaValidatorHelper.DoesNotEmptyCollectionName(collectionName, request.SchemaType))
                .WithMessage(CollectionNameRequired)
            .Must((request, collectionName) => SchemaValidatorHelper.IsValidCollectionNameLength(collectionName, request.SchemaType))
                .WithMessage(CollectionNameLength)
            .Must((request, collectionName) => SchemaValidatorHelper.IsAllowedCollectionName(collectionName, request.SchemaType))
                .WithMessage(CollectionNameAllowedChars)
            .MustAsync(async (request, collectionName, context, cancellation) =>
                await IsValidCollectionName(collectionName, request.SchemaType, request.ItemId))
            .WithMessage(CollectionNameUnique);

        RuleFor(x => x.SchemaType)
            .NotEmpty().WithMessage(SchemaTypeRequired)
            .IsInEnum().WithMessage(SchemaTypeValid);

        RuleFor(x => x.Fields)
            .NotNull().WithMessage(FieldsRequired)
            .Must(fields => fields is not null && fields.Count > 0).WithMessage(FieldsRequired)
            .Must(fields => fields.Select(f => f.Name).Distinct().Count() == fields.Count)
            .WithMessage(FieldsUnique);

        RuleForEach(x => x.Fields)
            .SetValidator(field => new FieldDefinitionRequestValidator(_dbRepository));
    }


    private async Task<bool> IsValidSchemaName(string schemaName, string itemId)
    {
        return await IsValidSchemaDefinition(nameof(SchemaDefinition.SchemaName), schemaName, itemId);
    }
    private async Task<bool> IsValidCollectionName(string collectionName, SchemaType schemaType, string itemId)
    {
        if (schemaType == SchemaType.Dto)
            return true;
        return await IsValidSchemaDefinition(nameof(SchemaDefinition.CollectionName), collectionName, itemId);
    }

    private async Task<bool> IsValidSchemaDefinition(string propertyName, string propertyValue, string itemId)
    {
        var filter = Builders<SchemaDefinition>.Filter.And(
            Builders<SchemaDefinition>.Filter.Eq(propertyName, propertyValue),
            Builders<SchemaDefinition>.Filter.Ne(nameof(SchemaDefinition.ItemId), itemId));
        var existingSchema = await _dbRepository.GetItemAsync<SchemaDefinition>(filter);
        if (existingSchema is not null)
        {
            return false;
        }
        return true;
    }
}
