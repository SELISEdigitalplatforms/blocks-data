using System.Text.Json.Serialization;

namespace Storage.DomainService.Entities;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ContentEffect
{
    Allow = 1,
    Deny = 2
}
