using System.Text.Json.Serialization;

namespace Storage.DomainService.Entities;

/// <summary>
/// The default access a File or FileDirectory grants when no explicit
/// <see cref="ObjectAccessPolicy"/> exists on it or its ancestors yet. Unset (null) preserves
/// pre-existing behaviour: every tenant user is allowed in, exactly as before this enum existed.
/// An explicit <see cref="ObjectAccessPolicy"/> grant always overrides this default.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ObjectAccessLevel
{
    /// <summary>Only the creator has access until the item is explicitly shared.</summary>
    Creator = 1,

    /// <summary>Anyone in the creator's organization has access until narrowed by an explicit policy.</summary>
    Organization = 2
}
