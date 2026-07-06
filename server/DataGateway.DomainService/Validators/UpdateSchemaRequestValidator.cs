using FluentValidation;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Validators;

public class UpdateSchemaRequestValidator : AbstractValidator<UpdateSchemaRequest>
{
    private const string ItemIdRequired = "ItemId_Is_Required.";
    private const string SchemaNameRequired = "SchemaName_Is_Required.";
    private const string SchemaNameLength = "SchemaName_Length_Must_Be_Between_1_And_50_Characters.";
    private const string SchemaNameInvalid = "SchemaName_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.";
    private const string CollectionNameRequired = "CollectionName_Is_Required.";
    private const string CollectionNameLength = "CollectionName_Length_Must_Be_Between_1_And_50_Characters.";
    private const string CollectionNameInvalid = "CollectionName_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.";
    private const string SchemaTypeRequired = "SchemaType_Is_Required.";

    public UpdateSchemaRequestValidator()
    {
        RuleFor(x => x.ItemId)
            .NotEmpty().WithMessage(ItemIdRequired);

        RuleFor(x => x.SchemaName)
            .NotEmpty().WithMessage(SchemaNameRequired)
            .Length(1, 50).WithMessage(SchemaNameLength)
            .Matches(SchemaValidatorHelper.NameAllowedPattern).WithMessage(SchemaNameInvalid);

        RuleFor(x => x.CollectionName)
            .NotEmpty().WithMessage(CollectionNameRequired)
            .Length(1, 50).WithMessage(CollectionNameLength)
            .Matches(SchemaValidatorHelper.NameAllowedPattern).WithMessage(CollectionNameInvalid)
            .When(x => x.SchemaType == SchemaType.Entity);

        RuleFor(x => x.SchemaType)
            .NotEmpty().WithMessage(SchemaTypeRequired);
    }
}