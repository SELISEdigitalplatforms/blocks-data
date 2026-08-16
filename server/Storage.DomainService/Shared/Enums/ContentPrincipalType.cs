using System.Text.Json.Serialization;

namespace Storage.DomainService.Entities;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ContentPrincipalType
{
    User = 1,
    Role = 2,
    Everyone = 3,
    Organization = 4
}
