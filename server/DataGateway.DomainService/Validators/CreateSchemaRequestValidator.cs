using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using MongoDB.Driver;

namespace DataGateway.DomainService.Validators;

public class CreateSchemaRequestValidator : AbstractValidator<CreateSchemaRequest>
{
    private readonly IDbRepository _dbRepository;
    private const string SchemaNameRequired = "SchemaName_Is_Required.";
    private const string SchemaNameLength = "SchemaName_Length_Must_Be_Between_1_And_50_Characters.";
    private const string SchemaNameInvalid = "SchemaName_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.";
    private const string CollectionNameRequired = "CollectionName_Is_Required.";
    private const string CollectionNameLength = "CollectionName_Length_Must_Be_Between_1_And_50_Characters.";
    private const string CollectionNameInvalid = "CollectionName_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.";
    private const string SchemaTypeRequired = "SchemaType_Is_Required.";

    public CreateSchemaRequestValidator(IDbRepository dbRepository)
    {
        _dbRepository = dbRepository;

        Validate();
    }

    private void Validate()
    {
        RuleFor(x => x.SchemaName)
            .NotEmpty().WithMessage(SchemaNameRequired)
            .Length(1, 50).WithMessage(SchemaNameLength)
            .Matches(SchemaValidatorHelper.NameAllowedPattern).WithMessage(SchemaNameInvalid);

        RuleFor(x => x.CollectionName)
            .Must((request, collectionName) => SchemaValidatorHelper.DoesNotEmptyCollectionName(collectionName, request.SchemaType))
                .WithMessage(CollectionNameRequired)
            .Must((request, collectionName) => SchemaValidatorHelper.IsValidCollectionNameLength(collectionName, request.SchemaType))
                .WithMessage(CollectionNameLength)
            .Must((request, collectionName) => SchemaValidatorHelper.IsAllowedCollectionName(collectionName, request.SchemaType))
                .WithMessage(CollectionNameInvalid);

        RuleFor(x => x.SchemaType)
            .NotEmpty().WithMessage(SchemaTypeRequired);
    }

    public async Task<bool> IsValidSchemaName(string schemaName)
    {
        return await IsValidSchemaDefinition(nameof(SchemaDefinition.SchemaName), schemaName);
    }
    public async Task<bool> IsValidCollectionName(string collectionName, SchemaType schemaType)
    {
        if (schemaType == SchemaType.Dto)
            return true;
        return await IsValidSchemaDefinition(nameof(SchemaDefinition.CollectionName), collectionName);
    }

    private async Task<bool> IsValidSchemaDefinition(string propertyName, string propertyValue)
    {

        var filter = Builders<SchemaDefinition>.Filter.And(
            Builders<SchemaDefinition>.Filter.Eq(propertyName, propertyValue));
        var existingSchema = await _dbRepository.GetItemAsync<SchemaDefinition>(filter);

        return existingSchema is null;
    }
}
