namespace DataGateway.DomainService.Models;

/// <summary>Makes an earlier published schema version live again.</summary>
public class RollbackSchemaVersionRequest
{
    /// <summary>The published version to make live; one of the versions in the version history.</summary>
    public long Version { get; set; }
}
