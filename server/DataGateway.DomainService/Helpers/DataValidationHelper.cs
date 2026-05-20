using System.Text.RegularExpressions;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Models.Responses;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Static helper class for validating data against validation rules
/// </summary>
public static class DataValidationHelper
{
    /// <summary>
    /// Comparison types for numeric and date validations
    /// </summary>
    private enum ComparisonType
    {
        GreaterThan,
        LessThan,
        GreaterThanOrEqual,
        LessThanOrEqual
    }

    /// <summary>
    /// Validates input data against the schema's validation rules.
    /// Supports nested objects: when a field is not a scalar type, validation recurses into the nested value.
    /// </summary>
    /// <param name="input">The input data dictionary (can contain nested dictionaries or lists of dictionaries)</param>
    /// <param name="schema">The schema definition with validation rules</param>
    /// <returns>Validation result containing any errors</returns>
    public static DataValidationResult Validate(this Dictionary<string, object?> input, SchemaDefinitionExtended schema)
    {
        var result = new DataValidationResult();
        ValidateData(input, schema.Fields, result, pathPrefix: "");
        return result;
    }

    /// <summary>
    /// Validates input against a list of field definitions and appends errors to the result.
    /// Recurses into nested objects when a field is not a scalar type.
    /// </summary>
    private static void ValidateData(
        Dictionary<string, object?> input,
        List<FieldDefinitionResponse> fields,
        DataValidationResult result,
        string pathPrefix)
    {
        foreach (var fieldKey in input.Keys)
        {
            var fieldDefinition = fields.FirstOrDefault(f => f.Name == fieldKey);
            if (fieldDefinition is null)
            {
                continue; // Skip unknown fields
            }

            var fieldValue = input[fieldKey];
            var fieldPath = string.IsNullOrEmpty(pathPrefix) ? fieldKey : $"{pathPrefix}{fieldKey}";

            if (!GraphQlTypeHelper.IsScalar(fieldDefinition.Type))
            {
                // Nested type: validate the nested object(s)
                if (fieldValue is null)
                {
                    continue;
                }

                if (fieldDefinition.IsArray && fieldValue is System.Collections.IEnumerable list && fieldValue is not string)
                {
                    var index = 0;
                    foreach (var item in list)
                    {
                        if (item is Dictionary<string, object?> nestedDict && fieldDefinition.Fields.Count > 0)
                        {
                            ValidateData(nestedDict, fieldDefinition.Fields, result, $"{fieldPath}[{index}].");
                        }
                        index++;
                    }
                }
                else if (fieldValue is Dictionary<string, object?> nestedDict && fieldDefinition.Fields.Count > 0)
                {
                    ValidateData(nestedDict, fieldDefinition.Fields, result, $"{fieldPath}.");
                }
                continue;
            }

            // Scalar field: run validation rules
            if (fieldDefinition.ValidationRule is null || fieldDefinition.ValidationRule.Validations is null)
            {
                continue;
            }

            var fieldType = fieldDefinition.Type;
            foreach (var validation in fieldDefinition.ValidationRule.Validations)
            {
                if (!validation.IsActive)
                {
                    continue;
                }

                var error = ValidateField(fieldPath, fieldValue, fieldType, validation);
                if (error is not null)
                {
                    result.Errors.Add(error);
                }
            }
        }
    }

    /// <summary>
    /// Validates a single field against a validation rule
    /// </summary>
    /// <returns>ValidationError if validation fails, null otherwise</returns>
    private static ValidationError? ValidateField(
        string fieldName,
        object? fieldValue,
        string fieldType,
        ValidationRule validation)
    {
        var errorMessage = string.IsNullOrWhiteSpace(validation.ErrorMessage)
        ? $"Field '{fieldName}' is invalid." : validation.ErrorMessage;

        return validation.Type switch
        {
            ValidationType.NotEmpty => ValidateNotEmpty(fieldName, fieldValue, errorMessage),
            ValidationType.Regex => ValidateRegex(fieldName, fieldValue, validation.Value, errorMessage),
            ValidationType.MinLength => ValidateMinLength(fieldName, fieldValue, validation.Value, errorMessage),
            ValidationType.MaxLength => ValidateMaxLength(fieldName, fieldValue, validation.Value, errorMessage),
            ValidationType.LengthRange => ValidateLengthRange(fieldName, fieldValue, validation.Value, validation.SecondaryValue, errorMessage),
            ValidationType.Equal => ValidateEqual(fieldName, fieldValue, validation.Value, fieldType, errorMessage),
            ValidationType.NotEqual => ValidateNotEqual(fieldName, fieldValue, validation.Value, fieldType, errorMessage),
            ValidationType.GreaterThan => ValidateComparison(fieldName, fieldValue, validation.Value, fieldType, ComparisonType.GreaterThan, errorMessage),
            ValidationType.LessThan => ValidateComparison(fieldName, fieldValue, validation.Value, fieldType, ComparisonType.LessThan, errorMessage),
            ValidationType.GreaterThanOrEqual => ValidateComparison(fieldName, fieldValue, validation.Value, fieldType, ComparisonType.GreaterThanOrEqual, errorMessage),
            ValidationType.LessThanOrEqual => ValidateComparison(fieldName, fieldValue, validation.Value, fieldType, ComparisonType.LessThanOrEqual, errorMessage),
            ValidationType.Range => ValidateRange(fieldName, fieldValue, validation.Value, validation.SecondaryValue, fieldType, errorMessage),
            _ => null
        };
    }

    #region Validation Methods

    private static ValidationError? ValidateNotEmpty(string fieldName, object? fieldValue, string? errorMessage)
    {
        if (fieldValue is null || string.IsNullOrWhiteSpace(fieldValue.ToString()))
        {
            return new ValidationError
            {
                FieldName = fieldName,
                Message = errorMessage ?? $"Field '{fieldName}' cannot be empty.",
                ValidationType = nameof(ValidationType.NotEmpty)
            };
        }
        return null;
    }

    private static ValidationError? ValidateRegex(string fieldName, object? fieldValue, object? pattern, string? errorMessage)
    {
        if (fieldValue is not null && pattern is not null)
        {
            var patternStr = pattern.ToString();
            if (!string.IsNullOrEmpty(patternStr) &&
                !Regex.IsMatch(fieldValue.ToString() ?? "", patternStr))
            {
                return new ValidationError
                {
                    FieldName = fieldName,
                    Message = errorMessage ?? $"Field '{fieldName}' does not match the required pattern.",
                    ValidationType = nameof(ValidationType.Regex)
                };
            }
        }
        return null;
    }

    private static ValidationError? ValidateMinLength(string fieldName, object? fieldValue, object? minLengthValue, string? errorMessage)
    {
        if (fieldValue is not null && minLengthValue is not null)
        {
            var minLength = Convert.ToInt32(minLengthValue);
            var strValue = fieldValue.ToString() ?? "";
            if (strValue.Length < minLength)
            {
                return new ValidationError
                {
                    FieldName = fieldName,
                    Message = errorMessage ?? $"Field '{fieldName}' must be at least {minLength} characters long.",
                    ValidationType = nameof(ValidationType.MinLength)
                };
            }
        }
        return null;
    }

    private static ValidationError? ValidateMaxLength(string fieldName, object? fieldValue, object? maxLengthValue, string? errorMessage)
    {
        if (fieldValue is not null && maxLengthValue is not null)
        {
            var maxLength = Convert.ToInt32(maxLengthValue);
            var strValue = fieldValue.ToString() ?? "";
            if (strValue.Length > maxLength)
            {
                return new ValidationError
                {
                    FieldName = fieldName,
                    Message = errorMessage ?? $"Field '{fieldName}' must not exceed {maxLength} characters.",
                    ValidationType = nameof(ValidationType.MaxLength)
                };
            }
        }
        return null;
    }

    private static ValidationError? ValidateLengthRange(string fieldName, object? fieldValue, object? minValue, object? maxValue, string? errorMessage)
    {
        if (fieldValue is not null && minValue is not null && maxValue is not null)
        {
            var minLen = Convert.ToInt32(minValue);
            var maxLen = Convert.ToInt32(maxValue);
            var strValue = fieldValue.ToString() ?? "";
            if (strValue.Length < minLen || strValue.Length > maxLen)
            {
                return new ValidationError
                {
                    FieldName = fieldName,
                    Message = errorMessage ?? $"Field '{fieldName}' must be between {minLen} and {maxLen} characters.",
                    ValidationType = nameof(ValidationType.LengthRange)
                };
            }
        }
        return null;
    }

    private static ValidationError? ValidateEqual(string fieldName, object? fieldValue, object? validationValue, string fieldType, string? errorMessage)
    {
        if (!IsEqual(fieldValue, validationValue, fieldType))
        {
            return new ValidationError
            {
                FieldName = fieldName,
                Message = errorMessage ?? $"Field '{fieldName}' must be equal to {validationValue}.",
                ValidationType = nameof(ValidationType.Equal)
            };
        }
        return null;
    }

    private static ValidationError? ValidateNotEqual(string fieldName, object? fieldValue, object? validationValue, string fieldType, string? errorMessage)
    {
        if (IsEqual(fieldValue, validationValue, fieldType))
        {
            return new ValidationError
            {
                FieldName = fieldName,
                Message = errorMessage ?? $"Field '{fieldName}' must not be equal to {validationValue}.",
                ValidationType = nameof(ValidationType.NotEqual)
            };
        }
        return null;
    }

    private static ValidationError? ValidateComparison(string fieldName, object? fieldValue, object? validationValue, string fieldType, ComparisonType comparisonType, string? errorMessage)
    {
        if (!CompareValues(fieldValue, validationValue, fieldType, comparisonType))
        {
            var comparisonText = comparisonType switch
            {
                ComparisonType.GreaterThan => "greater than",
                ComparisonType.LessThan => "less than",
                ComparisonType.GreaterThanOrEqual => "greater than or equal to",
                ComparisonType.LessThanOrEqual => "less than or equal to",
                _ => "compared to"
            };

            return new ValidationError
            {
                FieldName = fieldName,
                Message = errorMessage ?? $"Field '{fieldName}' must be {comparisonText} {validationValue}.",
                ValidationType = comparisonType.ToString()
            };
        }
        return null;
    }

    private static ValidationError? ValidateRange(string fieldName, object? fieldValue, object? minValue, object? maxValue, string fieldType, string? errorMessage)
    {
        if (!IsInRange(fieldValue, minValue, maxValue, fieldType))
        {
            return new ValidationError
            {
                FieldName = fieldName,
                Message = errorMessage ?? $"Field '{fieldName}' must be between {minValue} and {maxValue}.",
                ValidationType = nameof(ValidationType.Range)
            };
        }
        return null;
    }

    #endregion

    #region Comparison Helper Methods

    /// <summary>
    /// Checks if two values are equal based on the field type
    /// </summary>
    private static bool IsEqual(object? fieldValue, object? validationValue, string fieldType)
    {
        if (fieldValue is null && validationValue is null) return true;
        if (fieldValue is null || validationValue is null) return false;

        try
        {
            return fieldType.ToLowerInvariant() switch
            {
				"int" or "long" => Convert.ToInt64(fieldValue) == Convert.ToInt64(validationValue),
				"float" or "double" or "decimal" => Math.Abs(Convert.ToDouble(fieldValue) - Convert.ToDouble(validationValue)) < 0.0001,
				"datetime" or "date" => Convert.ToDateTime(fieldValue) == Convert.ToDateTime(validationValue),
				"boolean" or "bool" => Convert.ToBoolean(fieldValue) == Convert.ToBoolean(validationValue),
                _ => fieldValue.ToString() == validationValue.ToString()
            };
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Compares two values based on the field type and comparison type
    /// </summary>
    private static bool CompareValues(object? fieldValue, object? validationValue, string fieldType, ComparisonType comparisonType)
    {
        if (fieldValue is null || validationValue is null) return false;

        try
        {
            int comparison = fieldType.ToLowerInvariant() switch
            {
				"int" or "long" => Convert.ToInt64(fieldValue).CompareTo(Convert.ToInt64(validationValue)),
				"float" or "double" or "decimal" => Convert.ToDouble(fieldValue).CompareTo(Convert.ToDouble(validationValue)),
				"datetime" or "date" => Convert.ToDateTime(fieldValue).CompareTo(Convert.ToDateTime(validationValue)),
                _ => string.Compare(fieldValue.ToString(), validationValue.ToString(), StringComparison.Ordinal)
            };

            return comparisonType switch
            {
                ComparisonType.GreaterThan => comparison > 0,
                ComparisonType.LessThan => comparison < 0,
                ComparisonType.GreaterThanOrEqual => comparison >= 0,
                ComparisonType.LessThanOrEqual => comparison <= 0,
                _ => false
            };
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Checks if a value is within a specified range
    /// </summary>
    private static bool IsInRange(object? fieldValue, object? minValue, object? maxValue, string fieldType)
    {
        if (fieldValue is null || minValue is null || maxValue is null) return false;

        return CompareValues(fieldValue, minValue, fieldType, ComparisonType.GreaterThanOrEqual)
            && CompareValues(fieldValue, maxValue, fieldType, ComparisonType.LessThanOrEqual);
    }

    #endregion
}
