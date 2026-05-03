using FluentValidation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Repositories;
using MongoDB.Driver;

namespace DataGateway.DomainService.Validators;

public abstract class DataValidationRequestValidatorBase<T> : AbstractValidator<T>
{
    protected readonly IDbRepository _dbRepository;

    protected const string SchemaIdRequired = "Schema_Id_Is_Required.";
    protected const string SchemaIdMustExist = "Schema_Id_Must_Exist.";
    protected const string FieldNameRequired = "Field_Name_Is_Required.";
    protected const string FieldNameLength = "Field_Name_Length_Must_Be_Between_1_And_100_Characters.";
    protected const string ValidationsRequired = "At_Least_One_Validation_Rule_Is_Required.";

    protected DataValidationRequestValidatorBase(IDbRepository dbRepository)
    {
        _dbRepository = dbRepository;
    }

    protected async Task<bool> SchemaExists(string schemaId)
    {
        if (string.IsNullOrWhiteSpace(schemaId))
            return false;

        var filter = Builders<SchemaDefinition>.Filter.Eq(x => x.ItemId, schemaId);
        var schema = await _dbRepository.GetItemAsync<SchemaDefinition>(filter);
        return schema is not null;
    }
}
