using System.Text.Json.Serialization;

namespace Storage.DomainService.Enums
{
    /// <summary>
    /// Lifecycle of a file version's upload-completion verification. A missing/null value on a
    /// legacy or migrated <see cref="Entities.FileVersion"/> row is treated as <see cref="Unverified"/>.
    /// </summary>
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum FileVerificationStatus
    {
        /// <summary>No completion was required for this version, or completion has not run yet.</summary>
        Unverified,

        /// <summary>Completion is required and the object is held in private quarantine pending verification.</summary>
        Quarantined,

        /// <summary>Completion succeeded; the object was promoted to its final key and is readable.</summary>
        Verified,

        /// <summary>Completion failed; the object stays blocked from reads.</summary>
        Rejected
    }
}
