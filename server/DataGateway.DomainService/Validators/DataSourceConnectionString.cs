using DataGateway.DomainService.Helpers;
using MongoDB.Driver;

namespace DataGateway.DomainService.Validators;

/// <summary>Reads the <c>ConnectionString</c> of a data-source request.</summary>
public static class DataSourceConnectionString
{
    /// <summary>A real connection string (not null, empty or <c>default</c>).</summary>
    public static bool IsCustom(string? value) => !value.IsNullOrWhiteSpaceOrDefault();

    /// <summary>Null, empty, <c>default</c>, or a string the MongoDB driver accepts. Never echoes the value.</summary>
    public static bool IsValidOrDefault(string? value)
    {
        if (!IsCustom(value))
            return true;
        try
        {
            _ = MongoClientSettings.FromConnectionString(value!.Trim());
            return true;
        }
        catch
        {
            return false;
        }
    }
}
