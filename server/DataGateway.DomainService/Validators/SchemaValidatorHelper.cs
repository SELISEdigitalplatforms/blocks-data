using System.Text.RegularExpressions;
using DataGateway.DomainService.Models;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Validators;

internal static class SchemaValidatorHelper
{
    // The rule itself lives in SchemaNameRules, which the REST API shares.
    internal static readonly Regex NameAllowedPattern = SchemaNameRules.Pattern;

    internal static bool DoesNotEmptyCollectionName(string collectionName, SchemaType schemaType)
    {
        return schemaType == SchemaType.Dto || (schemaType == SchemaType.Entity && !string.IsNullOrWhiteSpace(collectionName));
    }

    internal static bool IsValidCollectionNameLength(string collectionName, SchemaType schemaType)
    {
        return schemaType == SchemaType.Dto || (schemaType == SchemaType.Entity && collectionName?.Length >= 1 && collectionName?.Length <= 50);
    }

    internal static bool IsAllowedCollectionName(string collectionName, SchemaType schemaType)
    {
        if (schemaType == SchemaType.Dto)
            return true;
        if (string.IsNullOrEmpty(collectionName))
            return true;
        return NameAllowedPattern.IsMatch(collectionName);
    }
}