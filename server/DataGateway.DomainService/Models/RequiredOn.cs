using System.Text.Json.Serialization;

namespace DataGateway.DomainService.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RequiredOn
{
    None,
    Insert,
    Update,
    Both
}
