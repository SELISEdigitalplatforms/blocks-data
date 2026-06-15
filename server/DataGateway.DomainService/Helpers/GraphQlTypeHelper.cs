using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models.Constants;
using MongoDB.Bson;

namespace DataGateway.DomainService.Helpers;

public static class GraphQlTypeHelper
{
    public static bool IsScalar(string type) =>
        type is "String" or "Int" or "Float" or "Boolean" or "DateTime" or "ID";

    public static string GetScalarType(Type type)
    {
        if (type == typeof(string)) return "String";
        if (type == typeof(int) || type == typeof(Int32)) return "Int";
        if (type == typeof(long) || type == typeof(Int64)) return "Int";
        if (type == typeof(double) || type == typeof(float)) return "Float";
        if (type == typeof(bool)) return "Boolean";
        if (type == typeof(DateTime)) return "DateTime";
        if (type == typeof(Guid)) return "ID";
        return type.Name;
    }

    public static BsonDocument ReplaceSystemFieldInFilter(this BsonDocument filter)
    {
        if (filter.ElementCount > 0 && filter.Contains(nameof(GraphQlBaseEntity.ItemId)))
        {
            filter[GraphQlConstant.DbEntityIdFieldName] = filter[nameof(GraphQlBaseEntity.ItemId)];
            filter.Remove(nameof(GraphQlBaseEntity.ItemId));
        }
        return filter;
    }
}
