using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Validators;

internal static class SchemaValidatorHelper
{
    internal static bool DoesNotEmptyCollectionName(string collectionName, SchemaType schemaType)
    {
        return schemaType == SchemaType.Dto || (schemaType == SchemaType.Entity && !string.IsNullOrWhiteSpace(collectionName));
    }

    internal static bool IsValidCollectionNameLength(string collectionName, SchemaType schemaType)
    {
        return schemaType == SchemaType.Dto || (schemaType == SchemaType.Entity && collectionName?.Length >= 1 && collectionName?.Length <= 50);
    }
}
