using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace DataGateway.Rest;

/// <summary>
/// The REST API below the controller: each method runs one operation for the entity named in the route and answers
/// with a <see cref="RestResult"/>, a problem body included; it does not throw for a failed request.
/// </summary>
public interface IGatewayRestService
{
    /// <summary>A list. <paramref name="body"/> null reads the query string (<c>GET</c>); a value is the <c>POST</c> body, read once the entity is known.</summary>
    Task<RestResult> GetAsync(HttpContext http, string entity, JsonElement? body);

    Task<RestResult> GetByIdAsync(HttpContext http, string entity, string itemId);

    Task<RestResult> InsertAsync(HttpContext http, string entity, JsonElement body);

    Task<RestResult> InsertManyAsync(HttpContext http, string entity, JsonElement body);

    Task<RestResult> UpdateAsync(HttpContext http, string entity, string itemId, JsonElement body);

    /// <summary>The body is <c>{ "where": {…}, "input": {…} }</c>; an empty <c>where</c> is refused.</summary>
    Task<RestResult> UpdateManyAsync(HttpContext http, string entity, JsonElement body);

    Task<RestResult> UpsertAsync(HttpContext http, string entity, string itemId, JsonElement body);

    Task<RestResult> DeleteAsync(HttpContext http, string entity, string itemId, bool hardDelete);

    /// <summary>The body is <c>{ "where": {…} }</c>; a missing body or an empty <c>where</c> is refused.</summary>
    Task<RestResult> DeleteManyAsync(HttpContext http, string entity, JsonElement body, bool hardDelete);
}
