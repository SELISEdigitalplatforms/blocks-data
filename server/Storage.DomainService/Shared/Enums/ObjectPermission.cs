using System.Text.Json.Serialization;

namespace Storage.DomainService.Entities;

/// <summary>Ordered from least to most capable; numeric order is part of resolver semantics.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ObjectPermission
{
    View = 1,
    Download = 2,
    Edit = 3,
    Delete = 4,
    Manage = 5,
    Owner = 6
}
