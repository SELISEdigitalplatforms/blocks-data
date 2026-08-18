using System.Text.Json.Serialization;

namespace Storage.DomainService.Entities;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ObjectResourceType
{
    Directory = 1,
    File = 2
}
