using FluentValidation;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Validators;

public class CreateDataAccessPolicyRequestValidator : AbstractValidator<CreateDataAccessPolicyRequest>
{
    private const string PolicyNameRequired = "Policy_Name_Is_Required.";
    private const string PolicyNameLength = "Policy_Name_Length_Must_Not_Exceed_200_Characters.";
    private const string PolicyDescriptionLength = "Policy_Description_Length_Must_Not_Exceed_2000_Characters.";
    private const string PolicyTypeInvalid = "Policy_Type_Must_Be_Valid.";
    private const string OperationInvalid = "Policy_Operation_Must_Be_Valid.";
    private const string SchemaNameRequired = "Schema_Name_Is_Required.";
    private const string SchemaNameLength = "Schema_Name_Length_Must_Not_Exceed_200_Characters.";
    private const string SchemaIdRequired = "Schema_Id_Is_Required.";
    private const string ProjectKeyRequired = "ProjectKey_Is_Required.";
    private const string FieldNamesRequiredForCls = "Field_Names_Are_Required_For_Column_Level_Security.";
    private const string FieldNameEmpty = "Field_Name_Must_Not_Be_Empty.";

    public CreateDataAccessPolicyRequestValidator()
    {
        RuleFor(x => x.PolicyName)
            .NotEmpty().WithMessage(PolicyNameRequired)
            .MaximumLength(200).WithMessage(PolicyNameLength);

        RuleFor(x => x.PolicyDescription)
            .MaximumLength(2000).WithMessage(PolicyDescriptionLength);

        RuleFor(x => x.PolicyType)
            .IsInEnum().WithMessage(PolicyTypeInvalid);

        RuleFor(x => x.Operation)
            .IsInEnum().WithMessage(OperationInvalid);

        RuleFor(x => x.SchemaName)
            .NotEmpty().WithMessage(SchemaNameRequired)
            .MaximumLength(200).WithMessage(SchemaNameLength);

        RuleFor(x => x.SchemaId)
            .NotEmpty().WithMessage(SchemaIdRequired);

        RuleFor(x => x.ProjectKey)
            .NotEmpty().WithMessage(ProjectKeyRequired);

        RuleFor(x => x.FieldNames)
            .NotNull()
            .Must(names => names.Length > 0)
            .When(x => x.PolicyType == PolicyType.CLS)
            .WithMessage(FieldNamesRequiredForCls);

        RuleForEach(x => x.FieldNames)
            .NotEmpty()
            .WithMessage(FieldNameEmpty)
            .When(x => x.PolicyType == PolicyType.CLS);

        RuleFor(x => x.RuleGroup)
            .NotNull()
            .SetValidator(new PolicyRuleGroupValidator());
    }
}
