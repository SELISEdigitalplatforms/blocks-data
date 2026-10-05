using System.Xml.Schema;
using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Repositories;
using MongoDB.Driver;

namespace DataGateway.DomainService.Validators;

public class FieldDefinitionRequestValidator : AbstractValidator<FieldDefinitionRequest>
{
    private readonly IDbRepository _dbRepository;
    private const string NameRequired = "Field_Name_Is_Required.";
    private const string NameLength = "Field_Name_Length_Must_Be_Between_1_And_50_Characters.";
    private const string NameAllowedChars = "Field_Name_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.";

    private const string TypeRequired = "Field_Type_Is_Required.";
    private const string TypeValid = "Field_Type_Is_Not_Valid.";

    public FieldDefinitionRequestValidator(IDbRepository dbRepository)
    {
        _dbRepository = dbRepository ?? throw new ArgumentNullException(nameof(dbRepository));
        Validate();
    }

    private void Validate()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage(NameRequired)
            .Length(1, 50).WithMessage(NameLength)
            .Matches(SchemaValidatorHelper.NameAllowedPattern).WithMessage(NameAllowedChars);

        RuleFor(x => x.Type)
            .NotEmpty().WithMessage(TypeRequired)
            .Must((request, type) => IsValidType(type))
            .WithMessage(TypeValid);

        RuleFor(x => x.EnumValues)
            .Must((request, values) =>
            {
                var list = values ?? [];
                if (request.Type == "Enum")
                    return list.Count > 0;
                return list.Count == 0;
            })
            .WithMessage(request =>
                request.Type == "Enum"
                    ? "Field_EnumValues_Is_Required."
                    : "Field_EnumValues_Not_Allowed_For_Non_Enum_Type.");

        When(x => x.Type == "Enum" && x.EnumValues is { Count: > 0 }, () =>
        {
            RuleFor(x => x.EnumValues)
                .Must(v => v.Count <= 100)
                .WithMessage("Field_EnumValues_Must_Not_Exceed_100_Values.");

            RuleForEach(x => x.EnumValues)
                .Must(v => !string.IsNullOrEmpty(v) && v.Length <= 100)
                .WithMessage("Field_EnumValues_Value_Length_Must_Be_Between_1_And_100_Characters.")
                .Matches(SchemaValidatorHelper.NameAllowedPattern)
                .WithMessage("Field_EnumValues_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.");

            RuleFor(x => x.EnumValues)
                .Must(v => v.Count == v.Distinct(StringComparer.Ordinal).Count())
                .WithMessage("Field_EnumValues_Must_Be_Unique.");
        });

    }
    private bool IsValidType(string type)
    {
        var isValid = GraphQlTypeHelper.IsScalar(type);
        if (isValid)
            return true;

        var filter = Builders<SchemaDefinition>.Filter.Eq(s => s.SchemaName, type);
        var customSchema = _dbRepository.GetItemAsync<SchemaDefinition>(filter).Result;
        return customSchema is not null;
    }
}