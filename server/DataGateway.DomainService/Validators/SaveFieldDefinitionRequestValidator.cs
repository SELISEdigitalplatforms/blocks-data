using System;
using FluentValidation;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;

namespace DataGateway.DomainService.Validators;

public class SaveFieldDefinitionRequestValidator : AbstractValidator<SaveFieldDefinitionRequest>
{
    private readonly IDbRepository _dbRepository;
    private const string SchemaDefinitionItemIdRequired = "SchemaDefinitionItemId_Is_Required.";
    private const string FieldsRequired = "Fields_Are_Required.";
    private const string FieldsUnique = "Field_Names_Must_Be_Unique.";

    public SaveFieldDefinitionRequestValidator(IDbRepository dbRepository)
    {
        _dbRepository = dbRepository;

        Validate();
    }
    private void Validate()
    {
        RuleFor(x => x.SchemaDefinitionItemId)
            .NotEmpty().WithMessage(SchemaDefinitionItemIdRequired);

        RuleFor(x => x.Fields)
            .NotNull().WithMessage(FieldsRequired)
            .Must(fields => fields is not null && fields.Count > 0).WithMessage(FieldsRequired)
            .Must(fields => fields.Select(f => f.Name).Distinct().Count() == fields.Count)
            .WithMessage(FieldsUnique);

        RuleForEach(x => x.Fields)
            .SetValidator(field => new FieldDefinitionRequestValidator(_dbRepository));
    }
}
