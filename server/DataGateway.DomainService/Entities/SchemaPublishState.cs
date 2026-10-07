using MongoDB.Bson.Serialization.Attributes;

namespace DataGateway.DomainService.Entities;

/// <summary>
/// The tenant's published schema version, shared by every gateway pod. There is exactly one
/// document per tenant database (<see cref="StateId"/>). Each pod compares the version it built
/// against <see cref="CurrentVersion"/> and rebuilds its GraphQL schema when it is behind.
/// </summary>
[BsonIgnoreExtraElements]
public class SchemaPublishState : GraphQlBaseEntity
{
    public const string StateId = "state";

    /// <summary>Raised by one on every publish. A tenant that never published is at version 0.</summary>
    public long CurrentVersion { get; set; }
}
