using FluentValidation;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Validators;

public class ImportSchemaRequestValidator : AbstractValidator<ImportSchemaRequest>
{
    private const string ProjectKeyRequired = "Project_Key_Is_Required.";
    private const string FileIdRequired = "File_Id_Is_Required.";

    public ImportSchemaRequestValidator()
    {
        RuleFor(x => x.ProjectKey)
            .NotEmpty().WithMessage(ProjectKeyRequired);

        RuleFor(x => x.FileId)
            .NotEmpty().WithMessage(FileIdRequired);
    }
}
