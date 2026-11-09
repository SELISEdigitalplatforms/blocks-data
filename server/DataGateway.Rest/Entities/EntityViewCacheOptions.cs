namespace DataGateway.Rest.Entities;

/// <summary>
/// The limits of the entity model cache, bound from configuration section <see cref="SectionName"/>. Settable
/// properties with defaults, so configuration binding can override any one of them.
/// </summary>
public sealed class EntityViewCacheOptions
{
    public const string SectionName = "DataGateway:Rest:EntityViewCache";

    /// <summary>The most entity models kept at once, across all tenants and versions; a full cache takes no more.</summary>
    public int MaxEntries { get; set; } = 2000;

    /// <summary>How long a model stays cached after its last use, in minutes.</summary>
    public int SlidingExpirationMinutes { get; set; } = 10;
}
