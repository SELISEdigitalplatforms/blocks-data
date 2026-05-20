using FluentValidation;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;

namespace DataGateway.DomainService.Validators;

public class UpdateDataValidationRequestValidator : DataValidationRequestValidatorBase<UpdateDataValidationRequest>
{
    private const string ItemIdRequired = "Item_Id_Is_Required.";

    public UpdateDataValidationRequestValidator(IDbRepository dbRepository) : base(dbRepository)
    {
        Validate();
    }

    private void Validate()
    {
        RuleFor(x => x.ItemId)
            .NotEmpty().WithMessage(ItemIdRequired);

        RuleFor(x => x.SchemaId)
            .NotEmpty().WithMessage(SchemaIdRequired)
            .MustAsync(async (schemaId, cancellation) => await SchemaExists(schemaId))
            .WithMessage(SchemaIdMustExist);

        RuleFor(x => x.FieldName)
            .NotEmpty().WithMessage(FieldNameRequired)
            .Length(1, 100).WithMessage(FieldNameLength);

        RuleFor(x => x.Validations)
            .NotNull().WithMessage(ValidationsRequired)
            .Must(validations => validations is not null && validations.Count > 0)
            .WithMessage(ValidationsRequired);

        RuleForEach(x => x.Validations)
            .SetValidator(new ValidationRuleRequestValidator());
    }
}
