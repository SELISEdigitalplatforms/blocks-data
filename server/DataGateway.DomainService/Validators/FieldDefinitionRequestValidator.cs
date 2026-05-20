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
            .Length(1, 50).WithMessage(NameLength);

        RuleFor(x => x.Type)
            .NotEmpty().WithMessage(TypeRequired)
            .Must((request, type) => IsValidType(type))
            .WithMessage(TypeValid);

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