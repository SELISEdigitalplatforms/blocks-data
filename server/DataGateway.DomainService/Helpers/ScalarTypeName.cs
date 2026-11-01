namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Maps a CLR type to the gateway scalar type name it is stored as (<c>String</c>, <c>Int</c>, <c>Float</c>,
/// <c>Boolean</c>, <c>DateTime</c>); any other type keeps its own name.
/// </summary>
public static class ScalarTypeName
{
    public static string Of(Type type)
    {
        var typeName = type.Name;
        if (type == typeof(string)) return "String";
        if (type == typeof(int) || type == typeof(Int32)) return "Int";
        if (type == typeof(long) || type == typeof(Int64)) return "Int";
        if (type == typeof(double) || type == typeof(float)) return "Float";
        if (type == typeof(bool)) return "Boolean";
        if (type == typeof(DateTime)) return "DateTime";
        if (type == typeof(Guid)) return "String";
        return typeName;
    }
}
