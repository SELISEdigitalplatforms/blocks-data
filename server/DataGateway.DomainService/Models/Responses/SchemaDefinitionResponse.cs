using Blocks.Genesis.DataAccess.Evaluation;
using System;
using System.Text.Json.Serialization;
using DataGateway.DomainService.Entities;
using Blocks.Genesis.Entities.Data;

namespace DataGateway.DomainService.Models;

public class SchemaDefinitionResponse
{
    public string Id { get; set; } = string.Empty;
    public string CollectionName { get; set; } = string.Empty;
    public List<FieldDefinitionResponse> Fields { get; set; } = [];
    public string SchemaName { get; set; } = string.Empty;
    /// <summary>The schema's description; left out when it has none.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; set; }
    public SchemaType SchemaType { get; set; }
    public string ProjectKey { get; set; } = string.Empty;
    public string ProjectShortKey { get; set; } = string.Empty;
    public string ProjectSchemaName { get; set; } = string.Empty;
    public string QuerySchema { get; set; } = string.Empty;
    public string[] MutationSchemas { get; set; } = [];
    public SchemaAccessLevel ReadAccessLevel { get; set; }
    public SchemaAccessLevel WriteAccessLevel { get; set; }
    public SchemaAccessLevel EditAccessLevel { get; set; }
    public SchemaAccessLevel DeleteAccessLevel { get; set; }
    public List<DataAccessPolicy> ReadPolicies { get; set; } = [];
    public List<DataAccessPolicy> WritePolicies { get; set; } = [];
    public List<DataAccessPolicy> EditPolicies { get; set; } = [];
    public List<DataAccessPolicy> DeletePolicies { get; set; } = [];
    public List<string> SchemaReferences { get; set; } = [];
    public int TotalSchemaReferences { get; set; } = 0;
    public int TotalReadPolicies { get; set; }
    public int TotalWritePolicies { get; set; }
    public int TotalEditPolicies { get; set; }
    public int TotalDeletePolicies { get; set; }
    /// <summary>
    /// Whether the live published version contains this schema; null when that is not known
    /// (no version published yet). A schema added after the live version is false until published.
    /// </summary>
    public bool? IsLive { get; set; }
}


public class CollectionSummaryResponse
{
    public string Name { get; set; } = string.Empty;
    public string CollectionName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
}

public class CollectionListResponse
{
    public List<CollectionSummaryResponse> Collections { get; set; } = [];
}

public class CollectionFieldResponse
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<CollectionFieldResponse>? Fields { get; set; }
}

public class CollectionDetailResponse
{
    public string Name { get; set; } = string.Empty;
    public string CollectionName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public List<CollectionFieldResponse> Fields { get; set; } = [];
}
