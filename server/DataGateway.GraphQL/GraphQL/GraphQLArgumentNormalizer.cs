using System.Collections;
using System.Reflection;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Conversion;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Models;
using HotChocolate;
using MongoDB.Bson;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Turns the values HotChocolate coerces a GraphQL argument into (CLR input objects whose members are
/// <see cref="Optional{T}"/>, dictionaries, lists) into the plain values the gateway engine takes: strings,
/// numbers, bools, dates, <c>List&lt;object?&gt;</c> and nested <c>Dictionary&lt;string, object?&gt;</c>. The where and order
/// converters then never see a HotChocolate type.
///
/// The whole tree is normalised up front, including the <c>and</c> / <c>or</c> lists and nested object paths, so
/// the converters need no lazy coercion of their own.
/// </summary>
public static class GraphQLArgumentNormalizer
{
    /// <summary>
    /// Normalises a coerced <c>where</c> argument. Returns null when it is absent, is not an object, or is
    /// empty once unset <see cref="Optional{T}"/> members are dropped.
    /// </summary>
    public static WhereNode? ToWhere(object? where)
    {
        if (where is null) return null;
        var normalised = Normalise(where, out _);
        return normalised is IReadOnlyDictionary<string, object?> { Count: > 0 } root ? new WhereNode(root) : null;
    }

    /// <summary>
    /// Converts a where argument as HotChocolate coerced it (CLR input objects with <see cref="Optional{T}"/>
    /// members, dictionaries, lists) to a MongoDB filter: it normalises the value to plain values first, then
    /// hands it to the GraphQL-free <see cref="WhereToMongoFilterConverter"/> core.
    /// </summary>
    public static BsonDocument? ConvertWhere(object? where, SchemaDefinitionExtended schema)
        => WhereToMongoFilterConverter.Convert(ToWhere(where)?.Root, schema);

    /// <summary>
    /// Reads a coerced <c>order</c> argument (a list of <c>{ field, direction }</c> entries). Entries that are not
    /// objects or have no field are skipped; a missing or unrecognised direction means ascending. Returns null when
    /// no entry remains.
    /// </summary>
    public static IReadOnlyList<OrderItem>? ToOrder(object? order) => OrderToMongoSortConverter.ToOrderItems(order);

    /// <summary>
    /// Returns the plain form of <paramref name="value"/>. <paramref name="omitted"/> is true when the value was an
    /// <see cref="Optional{T}"/> that was never set, which a containing object leaves out entirely.
    /// </summary>
    private static object? Normalise(object? value, out bool omitted)
    {
        omitted = false;
        value = Unwrap(value, out omitted);
        if (value is null) return null;

        switch (value)
        {
            case string:
            case BsonValue:
                return value;
            case IReadOnlyDictionary<string, object?> readOnly:
                return NormaliseDictionary(readOnly, readOnly is Dictionary<string, object?> d ? d.Comparer : null);
            case IDictionary<string, object?> dictionary:
                return NormaliseDictionary(dictionary, StringComparer.OrdinalIgnoreCase);
            case IDictionary raw:
                return NormaliseRawDictionary(raw);
            case IEnumerable enumerable:
                return NormaliseList(enumerable);
        }

        return IsInputObject(value.GetType()) ? NormaliseObject(value) : value;
    }

    private static Dictionary<string, object?> NormaliseDictionary(
        IEnumerable<KeyValuePair<string, object?>> source,
        IEqualityComparer<string>? comparer)
    {
        var result = new Dictionary<string, object?>(comparer);
        foreach (var pair in source)
        {
            var normalised = Normalise(pair.Value, out var omitted);
            if (!omitted)
                result[pair.Key] = normalised;
        }
        return result;
    }

    private static Dictionary<string, object?> NormaliseRawDictionary(IDictionary source)
    {
        var result = new Dictionary<string, object?>();
        foreach (DictionaryEntry entry in source)
        {
            if (entry.Key is not string key) continue;
            var normalised = Normalise(entry.Value, out var omitted);
            if (!omitted)
                result[key] = normalised;
        }
        return result;
    }

    private static List<object?> NormaliseList(IEnumerable source)
    {
        var result = new List<object?>();
        foreach (var item in source)
            result.Add(Normalise(item, out _));
        return result;
    }

    /// <summary>Reads a CLR input object's public members into a dictionary, dropping those never set.</summary>
    private static Dictionary<string, object?> NormaliseObject(object value)
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var prop in value.GetType().GetProperties(BindingFlags.Instance | BindingFlags.Public))
        {
            if (prop.GetIndexParameters().Length > 0) continue;
            if (!seen.Add(prop.Name)) continue;

            object? propValue;
            try
            {
                propValue = prop.GetValue(value);
            }
            catch
            {
                continue;
            }

            var normalised = Normalise(propValue, out var omitted);
            if (!omitted)
                result[prop.Name] = normalised;
        }
        return result;
    }

    /// <summary>
    /// True for the reference types HotChocolate binds input objects to. Scalars (primitives, enums, strings,
    /// <c>System</c> and driver value types) are left as they are.
    /// </summary>
    private static bool IsInputObject(Type type)
    {
        if (type.IsValueType || type.IsPrimitive || type.IsEnum) return false;
        var ns = type.Namespace;
        return ns is null
            || !(ns == "System" || ns.StartsWith("System.", StringComparison.Ordinal)
                || ns == "MongoDB" || ns.StartsWith("MongoDB.", StringComparison.Ordinal));
    }

    private static object? Unwrap(object? value, out bool omitted)
    {
        omitted = false;
        while (value is not null)
        {
            var type = value.GetType();
            if (!type.IsGenericType || type.GetGenericTypeDefinition() != typeof(Optional<>))
                break;

            var hasValueProp = type.GetProperty("HasValue");
            var valueProp = type.GetProperty("Value");
            if (hasValueProp is null || valueProp is null)
                break;
            if (hasValueProp.GetValue(value) is not true)
            {
                omitted = true;
                return null;
            }
            value = valueProp.GetValue(value);
        }

        return value;
    }
}
