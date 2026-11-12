using System.Text.Json.Serialization;

namespace DataGateway.Rest;

/// <summary>The REST API's operations, one per route and verb (the two forms of <see cref="Get"/> share one).</summary>
public enum RestOperation { Get, GetById, Insert, InsertMany, Update, UpdateMany, Upsert, Delete, DeleteMany }

/// <summary>
/// What a REST operation answers: the status, the body to write (a response object below, a record, or a
/// <see cref="Errors.GatewayProblem"/>), and the <c>Location</c> header of a created record.
/// </summary>
public sealed record RestResult(int StatusCode, object? Body, string? Location = null);

/// <summary>
/// A list response. <c>totalCount</c>, <c>totalPages</c> and <c>hasNextPage</c> need a count of every matching row,
/// so they are present only when the request asked for the total.
/// </summary>
public sealed record RestListResponse(
    [property: JsonPropertyName("items")] IReadOnlyList<Dictionary<string, object?>> Items,
    [property: JsonPropertyName("pageNo")] int PageNo,
    [property: JsonPropertyName("pageSize")] int PageSize,
    [property: JsonPropertyName("hasPreviousPage")] bool HasPreviousPage,
    [property: JsonPropertyName("totalCount"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] long? TotalCount = null,
    [property: JsonPropertyName("totalPages"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? TotalPages = null,
    [property: JsonPropertyName("hasNextPage"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? HasNextPage = null);

/// <summary>The response of a write to one record. <c>created</c> is set by an upsert only.</summary>
public sealed record RestItemResponse(
    [property: JsonPropertyName("acknowledged")] bool Acknowledged,
    [property: JsonPropertyName("itemId")] string? ItemId,
    [property: JsonPropertyName("created"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Created = null);

/// <summary>The response of a write to many records. <c>itemIds</c> is set by a bulk insert only.</summary>
public sealed record RestBulkResponse(
    [property: JsonPropertyName("acknowledged")] bool Acknowledged,
    [property: JsonPropertyName("totalImpactedData")] long TotalImpactedData,
    [property: JsonPropertyName("itemIds"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<string>? ItemIds = null);
