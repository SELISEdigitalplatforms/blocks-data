using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Validators;

public class CreateSchemaDefinitionRequestValidator : AbstractValidator<CreateSchemaDefinitionRequest>
{
    private readonly IDbRepository _dbRepository;
    private const string SchemaNameRequired = "Schema_Name_Is_Required.";
    private const string SchemaNameLength = "Schema_Name_Length_Must_Be_Between_1_And_50_Characters.";

    private const string CollectionNameRequired = "Collection_Name_Is_Required.";
    private const string CollectionNameLength = "Collection_Name_Length_Must_Be_Between_1_And_50_Characters.";

    private const string SchemaTypeRequired = "Schema_Type_Is_Required.";
    private const string SchemaTypeValid = "Schema_Type_Must_Be_Valid.";

    private const string FieldsRequired = "Fields_Are_Required.";
    private const string FieldsUnique = "Field_Names_Must_Be_Unique.";


    public CreateSchemaDefinitionRequestValidator(IDbRepository dbRepository)
    {
        _dbRepository = dbRepository;
        Validate();
    }

    private void Validate()
    {
        RuleFor(x => x.SchemaName)
            .NotEmpty().WithMessage(SchemaNameRequired)
            .Length(1, 50).WithMessage(SchemaNameLength);

        RuleFor(x => x.CollectionName)
            .Must((request, collectionName) => SchemaValidatorHelper.DoesNotEmptyCollectionName(collectionName, request.SchemaType))
                .WithMessage(CollectionNameRequired)
            .Must((request, collectionName) => SchemaValidatorHelper.IsValidCollectionNameLength(collectionName, request.SchemaType))
                .WithMessage(CollectionNameLength);

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
}
