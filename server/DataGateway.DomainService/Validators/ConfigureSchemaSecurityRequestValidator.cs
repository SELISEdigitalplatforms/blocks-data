using FluentValidation;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Validators;

public class ConfigureSchemaSecurityRequestValidator : AbstractValidator<ConfigureSchemaSecurityRequest>
{
    private const string ProjectKeyRequired = "ProjectKey_Is_Required.";
    private const string SchemaIdRequired = "Schema_Id_Is_Required.";
    private const string PolicyTypeInvalid = "Policy_Type_Must_Be_Valid.";
    private const string OperationInvalid = "Policy_Operation_Must_Be_Valid.";
    private const string AccessLevelInvalid = "Access_Level_Must_Be_Valid.";
    private const string FieldNamesRequiredForCls = "Field_Names_Are_Required_For_Column_Level_Security.";
    private const string FieldNameEmpty = "Field_Name_Must_Not_Be_Empty.";

    public ConfigureSchemaSecurityRequestValidator()
    {
        RuleFor(x => x.ProjectKey)
            .NotEmpty().WithMessage(ProjectKeyRequired);

        RuleFor(x => x.SchemaId)
            .NotEmpty().WithMessage(SchemaIdRequired);

        RuleFor(x => x.PolicyType)
            .IsInEnum().WithMessage(PolicyTypeInvalid);

        RuleFor(x => x.Operation)
            .IsInEnum().WithMessage(OperationInvalid);

        RuleFor(x => x.AccessLevel)
            .IsInEnum().WithMessage(AccessLevelInvalid);

        RuleFor(x => x.FieldNames)
            .NotNull()
            .Must(names => names.Length > 0)
            .When(x => x.PolicyType == PolicyType.CLS)
            .WithMessage(FieldNamesRequiredForCls);

        RuleForEach(x => x.FieldNames)
            .NotEmpty()
            .WithMessage(FieldNameEmpty)
            .When(x => x.PolicyType == PolicyType.CLS);
    }
}
