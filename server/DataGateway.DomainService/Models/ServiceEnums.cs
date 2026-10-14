using System.Text.Json.Serialization;

namespace DataGateway.DomainService.Models;

public enum ScalarType
{
    String = 1,
    Int = 2,
    Long = 3,
    Float = 4,
    Boolean = 5,
    DateTime = 6,
    ID = 7
}

/// <summary>
/// Sort direction for typed order clauses.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SortDirection
{
    ASC,
    DESC
}

public enum PipelineTypes
{
    DataGatewayPipeline = 1,
    BuildPipeline = 2
}

public enum PipelineEventTypes
{
    RetrieveLog = 1,
    TriggerNext = 2,
    DeletePipeLine = 3
}
