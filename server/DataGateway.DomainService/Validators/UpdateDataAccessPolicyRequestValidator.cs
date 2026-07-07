using FluentValidation;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Validators;

public class UpdateDataAccessPolicyRequestValidator : AbstractValidator<UpdateDataAccessPolicyRequest>
{
    private const string ItemIdRequired = "ItemId_Is_Required.";
    private const string PolicyNameRequired = "Policy_Name_Must_Not_Be_Empty_When_Provided.";
    private const string PolicyNameLength = "Policy_Name_Length_Must_Not_Exceed_200_Characters.";
    private const string PolicyDescriptionLength = "Policy_Description_Length_Must_Not_Exceed_2000_Characters.";
    private const string FieldNameEmpty = "Field_Name_Must_Not_Be_Empty.";

    public UpdateDataAccessPolicyRequestValidator()
    {
        RuleFor(x => x.ItemId)
            .NotEmpty().WithMessage(ItemIdRequired);

        When(x => x.PolicyName is not null, () =>
        {
            RuleFor(x => x.PolicyName!)
                .NotEmpty().WithMessage(PolicyNameRequired)
                .MaximumLength(200).WithMessage(PolicyNameLength);
        });

        When(x => x.PolicyDescription is not null, () =>
        {
            RuleFor(x => x.PolicyDescription!)
                .MaximumLength(2000).WithMessage(PolicyDescriptionLength);
        });

        When(x => x.FieldNames is not null, () =>
        {
            RuleForEach(x => x.FieldNames!)
                .NotEmpty()
                .WithMessage(FieldNameEmpty);
        });

        When(x => x.RuleGroup is not null, () =>
        {
            RuleFor(x => x.RuleGroup!)
                .SetValidator(new PolicyRuleGroupValidator());
        });
    }
}
