using System.Linq;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models.Constants;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using MongoDB.Bson;

namespace DataGateway.DomainService.Helpers;

public static class GraphQlTypeHelper
{
    public static bool IsScalar(string type) =>
            type is "String" or "Int" or "Float" or "Boolean" or "DateTime" or "ID";

    public static string GetScalarType(Type type)
    {
        var typeName = type.Name;
        if (type == typeof(string)) return "String";
        if (type == typeof(int) || type == typeof(Int32)) return "Int";
        if (type == typeof(long) || type == typeof(Int64)) return "Int";
        if (type == typeof(double) || type == typeof(float)) return "Float";
        if (type == typeof(bool)) return "Boolean";
        if (type == typeof(DateTime)) return "DateTime";
        if (type == typeof(Guid)) return "ID";
        return typeName;
    }

    public static ITypeNode GetTypeNode(string type, bool isArray = false)
    {
        var innerType = type switch
        {
            "String" => new NamedTypeNode("String"),
            "Int" => new NamedTypeNode("Int"),
            "Float" => new NamedTypeNode("Float"),
            "Boolean" => new NamedTypeNode("Boolean"),
            "DateTime" => new NamedTypeNode("DateTime"),
            "ID" => new NamedTypeNode("ID"),
            _ => throw new ArgumentException($"Unknown scalar type: {type}")
        };
        return isArray ? new ListTypeNode(innerType) : innerType;
    }

    public static ITypeNode GetCustomTypeNode(string type)
    {
        return new NamedTypeNode(type);
    }
    public static ITypeNode GetCustomTypeNode(string type, bool isArray)
    {
        if (isArray)
        {
            return new ListTypeNode(new NamedTypeNode(type));
        }
        return new NamedTypeNode(type);
    }

    public static string GetGraphQlFieldName(string projectShortKey, string fieldName)
    {

        if (string.IsNullOrEmpty(projectShortKey))
            return fieldName;

        return $"{fieldName}_{projectShortKey}".Trim();
    }

    #region Query Projection
    public static BsonDocument MapQueryProjection(this IResolverContext context)
    {
        var fields = new BsonDocument();
        var properties = context.GetQueryProperties();
        foreach (var prop in properties)
        {
            fields.Add(prop, 1);
        }

        return fields;
    }

    public static List<string> GetQueryProperties(this IResolverContext context, bool checkNestedProperties = true)
    {
        var fields = new List<string>();
        var selectionSet = context.Selection.SyntaxNode.SelectionSet;

        if (selectionSet is null) return fields;
        foreach (var selection in selectionSet.Selections)
        {
            if (selection is FieldNode fieldNode && fieldNode.Name.Value == "items" && fieldNode.SelectionSet != null)
            {
                fields = GetProjectionItems(fieldNode.SelectionSet, checkNestedProperties);
            }
        }

        return fields;
    }

    private static List<string> GetProjectionItems(
        SelectionSetNode selectionSet,
        bool checkNestedProperties,
        string prefix = "")
    {
        var fields = new List<string>();
        foreach (var selection in selectionSet.Selections)
        {
            if (selection is not FieldNode fieldNode) continue;

            var fieldName = fieldNode.Name.Value;
            var projectionField = string.IsNullOrEmpty(prefix) ? fieldName : $"{prefix}.{fieldName}";
            if (fieldNode.SelectionSet is null)
            {
                if (projectionField == nameof(GraphQlBaseEntity.ItemId))
                {
                    projectionField = GraphQlConstant.DbEntityIdFieldName;
                }
                fields.Add(projectionField);
            }
            else if (checkNestedProperties)
            {
                var nestedFields = GetProjectionItems(fieldNode.SelectionSet, checkNestedProperties, projectionField);
                fields.AddRange(nestedFields);
            }
            else
            {
                fields.Add(projectionField);
            }
        }
        return fields;
    }

    #endregion
    public static List<string> GetMutationProperties(this IResolverContext context, bool checkNestedProperties = true)
    {
        var fields = new List<string>();
        var selectionSet = context.Selection.SyntaxNode.SelectionSet;

        if (selectionSet is null) return fields;

        // Look for the mutation field (like "updateDemo")
        var mutationField = context.Selection.SyntaxNode;
        if (mutationField?.Arguments != null)
        {
            // Find the "input" argument
            var inputArgument = mutationField.Arguments.FirstOrDefault(arg => arg.Name.Value == "input");
            if (inputArgument?.Value is ObjectValueNode inputValue)
            {
                // Extract field names from the input object
                foreach (var field in inputValue.Fields)
                {
                    fields.Add(field.Name.Value);
                }
            }
        }

        return fields;
    }


    #region Mutation Input
    public static Dictionary<string, object?> MapMutationInput(this Dictionary<string, object?> input, ObjectValueNode? inputLiteral, InputObjectType? inputType)
    {
        if (inputLiteral?.Fields == null || inputType == null)
        {
            return input;
        }

        foreach (var field in inputLiteral.Fields)
        {
            var name = field.Name.Value;
            var fieldType = inputType.Fields.FirstOrDefault(f => f.Name == name)?.Type;

            if (fieldType is null)
            {
                continue;
            }


            object? value = null;

            // Handle Scalar Types
            if (fieldType.IsScalarType())
            {
                value = field.Value.ParseScalarValueByType(fieldType);
            }
            // Handle InputObjectType (nested objects)
            else if (fieldType.IsInputObjectType())
            {

                value = GetInputObjectValue(fieldType, field.Value);
            }
            // Handle List Types
            else if (fieldType.IsListType())
            {
                value = GetValueFromList(fieldType, field.Value as ListValueNode);
            }

            if (value is not null)
            {
                if (name == nameof(GraphQlBaseEntity.ItemId))
                {
                    name = GraphQlConstant.DbEntityIdFieldName;
                }

                if (input.ContainsKey(name))
                {
                    input[name] = value;
                }
                else
                {
                    input.Add(name, value);
                }
            }
        }

        return input;
    }

    /// <summary>Parses a list of input objects (e.g. for bulk insert) into a list of dictionaries.</summary>
    public static List<Dictionary<string, object?>> MapBulkMutationInput(ListValueNode? listNode, InputObjectType? inputType)
    {
        if (listNode?.Items == null || inputType == null)
            return [];
        var result = new List<Dictionary<string, object?>>();
        foreach (var item in listNode.Items)
        {
            var dict = new Dictionary<string, object?>();
            dict.MapMutationInput(item as ObjectValueNode, inputType);
            result.Add(dict);
        }
        return result;
    }

    private static object? GetInputObjectValue(IInputType fieldType, IValueNode nestedObjectValue)
    {
        var nestedInputType = fieldType as InputObjectType;
        var fieldValue = nestedObjectValue as ObjectValueNode;

        var input = new Dictionary<string, object?>();

        return input.MapMutationInput(fieldValue, nestedInputType);
    }

    private static object? GetValueFromList(IInputType fieldType, ListValueNode listValueNode)
    {
        var innerType = fieldType.InnerType();
        object? value = null;
        if (listValueNode != null)
        {
            // Handle List of Scalars
            if (innerType.IsScalarType())
            {
                value = listValueNode.Items
                    .Select(item => item.ParseScalarValueByType(innerType))
                    .ToList();
            }
            // Handle List of InputObjectType
            else if (innerType.IsInputObjectType())
            {
                var nestedInputType = innerType as InputObjectType;
                value = listValueNode.Items
                    .Select(item => GetInputObjectValue(nestedInputType, item))
                    .ToList();
            }
        }
        return value;
    }

    public static object? ParseValueNode(this IValueNode valueNode)
    {
        return valueNode switch
        {
            IntValueNode iv => int.Parse(iv.Value),
            FloatValueNode fv => double.Parse(fv.Value),
            StringValueNode sv => TryParseDateTimeOrString(sv.Value),
            BooleanValueNode bv => bv.Value,
            NullValueNode => null,
            ListValueNode lv => lv.Items.Select(ParseValueNode).ToList(),
            ObjectValueNode ov => ov.Fields.ToDictionary(f => f.Name.Value, f => ParseValueNode(f.Value)),
            _ => throw new NotSupportedException($"Unsupported value node type: {valueNode.GetType().Name}")
        };
    }

    /// <summary>
    /// Parses a scalar value node based on the expected type from schema
    /// </summary>
    public static object? ParseScalarValueByType(this IValueNode valueNode, IType fieldType)
    {

        if (valueNode is NullValueNode)
        {
            return null;
        }
        var scalarTypeName = fieldType.NamedType()?.Name;

        // Get the actual scalar type name (handles NonNullType wrapper)
        return scalarTypeName switch
        {
            "String" => ParseStringValue(valueNode),
            "Int" => ParseIntValue(valueNode),
            "Float" => ParseFloatValue(valueNode),
            "Boolean" => ParseBooleanValue(valueNode),
            "DateTime" => ParseDateTimeValue(valueNode),
            _ => ParseGenericValue(valueNode)
        };
    }

    public static BsonDocument ReplaceSystemFieldInFilter(this BsonDocument filter)
    {
        if (filter.ElementCount > 0 && filter.Contains(nameof(GraphQlBaseEntity.ItemId)))
        {
            //replace ItemId with DbEntityIdFieldName
            filter[GraphQlConstant.DbEntityIdFieldName] = filter[nameof(GraphQlBaseEntity.ItemId)];
            filter.Remove(nameof(GraphQlBaseEntity.ItemId));
        }
        return filter;
    }

    private static string ParseStringValue(IValueNode valueNode)
    {
        return valueNode switch
        {
            StringValueNode sv => sv.Value,
            IntValueNode iv => iv.Value,
            FloatValueNode fv => fv.Value,
            BooleanValueNode bv => bv.Value.ToString(),
            _ => valueNode.ToString()
        };
    }

    private static int ParseIntValue(IValueNode valueNode)
    {
        return valueNode switch
        {
            IntValueNode iv => int.Parse(iv.Value),
            StringValueNode sv when int.TryParse(sv.Value, out var intVal) => intVal,
            _ => throw new InvalidCastException($"Cannot convert {valueNode.GetType().Name} to Int")
        };
    }

    private static double ParseFloatValue(IValueNode valueNode)
    {
        return valueNode switch
        {
            FloatValueNode fv => double.Parse(fv.Value),
            IntValueNode iv => (double)int.Parse(iv.Value),
            StringValueNode sv when double.TryParse(sv.Value, out var doubleVal) => doubleVal,
            _ => throw new InvalidCastException($"Cannot convert {valueNode.GetType().Name} to Float")
        };
    }

    private static bool ParseBooleanValue(IValueNode valueNode)
    {
        return valueNode switch
        {
            BooleanValueNode bv => bv.Value,
            StringValueNode sv when bool.TryParse(sv.Value, out var boolVal) => boolVal,
            IntValueNode iv => int.Parse(iv.Value) != 0,
            _ => throw new InvalidCastException($"Cannot convert {valueNode.GetType().Name} to Boolean")
        };
    }

    private static DateTime ParseDateTimeValue(IValueNode valueNode)
    {
        return valueNode switch
        {
            StringValueNode sv when DateTimeOffset.TryParse(sv.Value, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var dto) => dto.UtcDateTime,
            StringValueNode sv when DateTime.TryParse(sv.Value, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var dt) => dt,
            _ => throw new InvalidCastException($"Cannot convert {valueNode.GetType().Name} to DateTime")
        };
    }


    private static object? ParseGenericValue(IValueNode valueNode)
    {
        var parsedValue = valueNode.ParseValueNode();

        // Convert DateTimeOffset to DateTime for MongoDB compatibility
        if (parsedValue is DateTimeOffset dto)
        {
            return dto.UtcDateTime;
        }

        return parsedValue;
    }

    private static object TryParseDateTimeOrString(string value)
    {
        if (DateTimeOffset.TryParse(value, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var dto))
            return dto;
        if (DateTime.TryParse(value, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var dt))
            return dt;
        return value;
    }
    #endregion
}
