using FluentValidation;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Validators;

public class UpdateDataSourceRequestValidator : AbstractValidator<UpdateDataSourceRequest>
{
    private const string ItemIdRequired = "ItemId_Is_Required.";
    private const string ConnectionStringRequired = "ConnectionString_Is_Required.";
    private const string DatabaseNameRequired = "DatabaseName_Is_Required.";
    private const string ProjectKeyRequired = "ProjectKey_Is_Required.";

    public UpdateDataSourceRequestValidator()
    {
        RuleFor(x => x.ItemId)
            .NotEmpty().WithMessage(ItemIdRequired);

        RuleFor(x => x.ConnectionString)
            .NotEmpty().WithMessage(ConnectionStringRequired);

        RuleFor(x => x.DatabaseName)
            .NotEmpty().WithMessage(DatabaseNameRequired);

        RuleFor(x => x.ProjectKey)
            .NotEmpty().WithMessage(ProjectKeyRequired);
    }
}
