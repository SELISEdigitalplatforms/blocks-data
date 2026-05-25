using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;

namespace DataGateway.DomainService.Validators;

public class CreateDataValidationRequestValidator : DataValidationRequestValidatorBase<CreateDataValidationRequest>
{
    public CreateDataValidationRequestValidator(IDbRepository dbRepository) : base(dbRepository)
    {
        Validate();
    }

    private void Validate()
    {
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

public class ValidationRuleRequestValidator : AbstractValidator<ValidationRuleRequest>
{
    private const string ValidationTypeValid = "Validation_Type_Must_Be_Valid.";
    private const string ValueRequiredForValidationType = "Value_Is_Required_For_This_Validation_Type.";
    private const string SecondaryValueRequiredForRange = "Secondary_Value_Is_Required_For_Range_Validation.";

    public ValidationRuleRequestValidator()
    {
        RuleFor(x => x.Type)
            .IsInEnum().WithMessage(ValidationTypeValid);

        // Value is required for most validation types (except NotEmpty)
        RuleFor(x => x.Value)
            .NotNull()
            .When(x => x.Type != ValidationType.NotEmpty)
            .WithMessage(ValueRequiredForValidationType);

        // Secondary value is required for range validations
        RuleFor(x => x.SecondaryValue)
            .NotNull()
            .When(x => x.Type == ValidationType.Range || x.Type == ValidationType.LengthRange)
            .WithMessage(SecondaryValueRequiredForRange);
    }
}
