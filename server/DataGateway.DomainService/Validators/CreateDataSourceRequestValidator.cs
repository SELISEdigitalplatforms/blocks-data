using FluentValidation;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Validators;

public class CreateDataSourceRequestValidator : AbstractValidator<CreateDataGatewayConfigurationRequest>
{
    private const string ConnectionStringInvalid = "ConnectionString_Is_Invalid.";
    private const string DatabaseNameRequired = "DatabaseName_Is_Required.";
    private const string ProjectKeyRequired = "ProjectKey_Is_Required.";

    public CreateDataSourceRequestValidator()
    {
        // Empty or "default" = Blocks DB; null (update only) = keep. A custom value must parse as a MongoDB string,
        // otherwise it would be saved and every data request of the tenant would then fail.
        RuleFor(x => x.ConnectionString)
            .Must(DataSourceConnectionString.IsValidOrDefault).WithMessage(ConnectionStringInvalid);

        RuleFor(x => x.DatabaseName)
            .NotEmpty().WithMessage(DatabaseNameRequired)
            .When(x => DataSourceConnectionString.IsCustom(x.ConnectionString));

        RuleFor(x => x.ProjectKey)
            .NotEmpty().WithMessage(ProjectKeyRequired);
    }
}
