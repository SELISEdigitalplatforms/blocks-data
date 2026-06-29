using FluentValidation;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Validators;

public class CreateDataSourceRequestValidator : AbstractValidator<CreateDataGatewayConfigurationRequest>
{
    private const string ConnectionStringRequired = "ConnectionString_Is_Required.";
    private const string DatabaseNameRequired = "DatabaseName_Is_Required.";
    private const string ProjectKeyRequired = "ProjectKey_Is_Required.";

    public CreateDataSourceRequestValidator()
    {
        RuleFor(x => x.ConnectionString)
            .NotEmpty().WithMessage(ConnectionStringRequired);

        RuleFor(x => x.DatabaseName)
            .NotEmpty().WithMessage(DatabaseNameRequired);

        RuleFor(x => x.ProjectKey)
            .NotEmpty().WithMessage(ProjectKeyRequired);
    }
}
