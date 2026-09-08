using FluentValidation;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Validators;

public class CreateSchemaIndexRequestValidator : AbstractValidator<CreateSchemaIndexRequest>
{
    private const string SchemaDefinitionItemIdRequired = "SchemaDefinitionItemId_Is_Required.";
    private const string InvalidIndexFields = "INVALID_INDEX_FIELDS";
    private const string FieldNameRequired = "Field_Name_Is_Required.";

    public CreateSchemaIndexRequestValidator()
    {
        RuleFor(x => x.SchemaDefinitionItemId)
            .NotEmpty().WithMessage(SchemaDefinitionItemIdRequired);

        RuleFor(x => x.Fields)
            .NotNull().WithMessage(InvalidIndexFields)
            .Must(fields => fields is not null && fields.Count > 0 && fields.Count <= 10)
            .WithMessage(InvalidIndexFields)
            .Must(fields => fields is null || fields.Select(f => f.FieldName).Distinct().Count() == fields.Count)
            .WithMessage(InvalidIndexFields);

        RuleForEach(x => x.Fields)
            .ChildRules(field =>
            {
                field.RuleFor(f => f.FieldName).NotEmpty().WithMessage(FieldNameRequired);
            });
    }
}
