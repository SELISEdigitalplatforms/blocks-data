using System.Collections;
using System.Text.Json;
using System.Text.RegularExpressions;
using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Validators;
using DataGateway.Rest.Access;
using DataGateway.Rest.Entities;
using DataGateway.Rest.Errors;
using DataGateway.Rest.Logging;
using DataGateway.Rest.Parsing;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DataGateway.Rest;

/// <summary>
/// Runs the REST operations against the gateway engine. Every operation goes through the same steps, in this order:
/// <list type="number">
/// <item>the <c>x-blocks-key</c> header is required (also the CSRF guard);</item>
/// <item>the caller is authenticated and the tenant resolved, as GraphQL does, and pinned on the request context;</item>
/// <item>the route's item id is checked;</item>
/// <item>the entity is loaded: unknown is 401 for an anonymous caller (so entities cannot be enumerated), 404 otherwise;</item>
/// <item>the access gate checks the operation's access level(s), before any body is read or the engine runs, since
/// the engine checks only Custom (row rule) access;</item>
/// <item>the request is parsed;</item>
/// <item>the column-rule guard refuses a <c>where</c> / <c>order</c> on a protected field;</item>
/// <item>a bulk update or delete needs a non-empty <c>where</c>, and reaches only rows the caller may also read
/// (the column-rule guard lets row-rule-copied fields through, which is safe only within the readable rows);</item>
/// <item>the engine runs the command, named in GraphQL style for the request log;</item>
/// <item>its result becomes the answer.</item>
/// </list>
/// A failure at any step is answered by <see cref="GatewayProblemMapper"/>, and every request leaves one request-log
/// record (<see cref="RestOperationLog"/>).
/// </summary>
public sealed partial class GatewayRestService : IGatewayRestService
{
    private const string ItemIdField = "ItemId";
    private const string NotAuthenticatedMessage = "User is not authenticated.";
    private const string LocationFormat = "/api/gateway/{0}/item/{1}";
    private const string BodyItemIdMessage = "Field 'ItemId' must be 1-64 characters of letters, digits, '_' or '-'.";

    private readonly IGatewayDataEngine _engine;
    private readonly IEntityModelProvider _models;
    private readonly IDataAccessPolicyResolutionService _resolver;
    private readonly IAccessPrincipalAccessor _principals;
    private readonly RestLimits _limits;
    private readonly ILogger<GatewayRestService> _logger;

    public GatewayRestService(
        IGatewayDataEngine engine,
        IEntityModelProvider models,
        IDataAccessPolicyResolutionService resolver,
        IAccessPrincipalAccessor principals,
        IOptions<RestLimits> limits,
        ILogger<GatewayRestService> logger)
    {
        _engine = engine ?? throw new ArgumentNullException(nameof(engine));
        _models = models ?? throw new ArgumentNullException(nameof(models));
        _resolver = resolver ?? throw new ArgumentNullException(nameof(resolver));
        _principals = principals ?? throw new ArgumentNullException(nameof(principals));
        _limits = limits?.Value ?? new RestLimits();
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    [GeneratedRegex("^[A-Za-z0-9_-]{1,64}$")]
    private static partial Regex ItemIdPattern();

    // ---- operations ----

    public Task<RestResult> GetAsync(HttpContext http, string entity, JsonElement? body) =>
        RunAsync(http, RestOperation.Get, entity, itemId: null, body, async (model, name) =>
        {
            var options = Read(() => body is { } json
                ? QueryBodyParser.Parse(json, model, _limits)
                : QueryStringParser.Parse(http.Request.Query, model, _limits));
            GuardColumns(model, options.Where, options.Order);

            var response = await _engine.QueryAsync(model, new QueryCommand(
                name, options.Where, options.Order, options.PageNo, options.PageSize, Projection(model, options.Select)));
            return await ListAsync(response, options.IncludeTotalCount);
        });

    public Task<RestResult> GetByIdAsync(HttpContext http, string entity, string itemId) =>
        RunAsync(http, RestOperation.GetById, entity, itemId, body: null, async (model, name) =>
        {
            var select = Read(() => QueryStringParser.ParseSelectOnly(http.Request.Query, model));

            var row = await _engine.GetByIdAsync(model, itemId, Projection(model, select), name);
            return row is null
                ? NotFound(http, "No record with this id was found, or you don't have permission to read it.")
                : new RestResult(StatusCodes.Status200OK, Output(row));
        });

    public Task<RestResult> InsertAsync(HttpContext http, string entity, JsonElement body) =>
        RunAsync(http, RestOperation.Insert, entity, itemId: null, body, async (model, name) =>
        {
            var record = Read(() => JsonRecordReader.Read(body, model, WriteOperation.Insert));
            CheckBodyItemId(record, index: null);

            var response = await _engine.InsertAsync(model, new InsertCommand(name, Lazy(record)));
            if (response is NotFoundActionResponse)
                return NotFound(http, response.Message);
            return Created(entity, response.ItemId, new RestItemResponse(response.Acknowledged, response.ItemId));
        });

    public Task<RestResult> InsertManyAsync(HttpContext http, string entity, JsonElement body) =>
        RunAsync(http, RestOperation.InsertMany, entity, itemId: null, body, async (model, name) =>
        {
            var records = Read(() => JsonRecordReader.ReadMany(body, model, _limits.MaxBulkItems));
            for (var index = 0; index < records.Count; index++)
                CheckBodyItemId(records[index], index);

            var response = await _engine.InsertManyAsync(model, new InsertManyCommand(name, new Lazy<List<Dictionary<string, object?>>>(() => records)));
            return new RestResult(StatusCodes.Status200OK, new RestBulkResponse(response.Acknowledged, response.TotalImpactedData, response.ItemIds));
        });

    public Task<RestResult> UpdateAsync(HttpContext http, string entity, string itemId, JsonElement body) =>
        RunAsync(http, RestOperation.Update, entity, itemId, body, async (model, name) =>
        {
            var changes = Read(() => JsonRecordReader.Read(body, model, WriteOperation.Update));

            var response = await _engine.UpdateAsync(model, new UpdateCommand(name, ById(itemId), Lazy(changes)));
            return ItemResult(http, response);
        });

    public Task<RestResult> UpdateManyAsync(HttpContext http, string entity, JsonElement body) =>
        RunAsync(http, RestOperation.UpdateMany, entity, itemId: null, body, async (model, name) =>
        {
            var (where, changes) = Read(() =>
            {
                var members = Members(body, "where", "input");
                var filter = members.TryGetValue("where", out var whereJson) ? JsonWhereReader.Read(whereJson, model, _limits) : null;
                if (!members.TryGetValue("input", out var input))
                    throw new RestRequestException("The request body needs an 'input' with the fields to change.");
                return (filter, JsonRecordReader.Read(input, model, WriteOperation.Update));
            });
            GuardColumns(model, where, null);
            RequireWhere(where, "update");

            var response = await _engine.UpdateManyAsync(model, new UpdateManyCommand(name, where, Lazy(changes), BoundByReadRules: true));
            return BulkResult(response);
        });

    public Task<RestResult> UpsertAsync(HttpContext http, string entity, string itemId, JsonElement body) =>
        RunAsync(http, RestOperation.Upsert, entity, itemId, body, async (model, name) =>
        {
            var record = Read(() => JsonRecordReader.Read(body, model, WriteOperation.Insert));
            CheckBodyItemId(record, index: null);
            // The record reader renames ItemId to _id, as GraphQL's input mapping does.
            if (record.TryGetValue(GraphQlConstant.DbEntityIdFieldName, out var bodyId) && !Equals(bodyId, itemId))
                throw RestRequestException.ForField(ItemIdField, "The body's 'ItemId' must match the item id in the route.", FieldPaths.InvalidValueType);

            var result = await _engine.UpsertAsync(model, new UpsertCommand(name, itemId, Lazy(record)));
            var response = result.Response;
            if (response is NotFoundActionResponse)
                return NotFound(http, response.Message);
            var answer = new RestItemResponse(response.Acknowledged, response.ItemId ?? itemId, result.Created);
            return result.Created
                ? Created(entity, response.ItemId ?? itemId, answer)
                : new RestResult(StatusCodes.Status200OK, answer);
        });

    public Task<RestResult> DeleteAsync(HttpContext http, string entity, string itemId, bool hardDelete) =>
        RunAsync(http, RestOperation.Delete, entity, itemId, body: null, async (model, name) =>
        {
            var response = await _engine.DeleteAsync(model, new DeleteCommand(name, ById(itemId), hardDelete));
            return ItemResult(http, response);
        });

    public Task<RestResult> DeleteManyAsync(HttpContext http, string entity, JsonElement body, bool hardDelete) =>
        RunAsync(http, RestOperation.DeleteMany, entity, itemId: null, body, async (model, name) =>
        {
            var where = Read(() =>
            {
                // A body some proxy dropped arrives as nothing: refused like an empty 'where', never "delete everything".
                if (body.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
                    throw new RestRequestException("The request body needs a 'where' that selects the records to delete.");
                var members = Members(body, "where");
                return members.TryGetValue("where", out var whereJson) ? JsonWhereReader.Read(whereJson, model, _limits) : null;
            });
            GuardColumns(model, where, null);
            RequireWhere(where, "delete");

            var response = await _engine.DeleteManyAsync(model, new DeleteManyCommand(name, where, hardDelete, BoundByReadRules: true));
            return BulkResult(response);
        });

    // ---- the shared steps ----

    private async Task<RestResult> RunAsync(
        HttpContext http,
        RestOperation operation,
        string entityName,
        string? itemId,
        JsonElement? body,
        Func<EntityModel, string, Task<RestResult>> run)
    {
        ArgumentNullException.ThrowIfNull(http);
        var operationName = OperationName(operation, entityName);
        var log = RestOperationLog.Begin(http, operation, operationName, entityName, body);
        try
        {
            var entity = await ResolveEntityAsync(http, entityName, itemId);
            log.UseEntity(entity);
            CheckAccess(http, operation, entity.Schema);
            return await run(entity, operationName);
        }
        catch (Exception ex)
        {
            var result = GatewayProblemMapper.Map(ex, http);
            if (result.StatusCode >= StatusCodes.Status500InternalServerError)
                _logger.LogError(ex, "REST {OperationName} failed unexpectedly", LogMasking.OneLine(operationName));
            log.Failed(ex, result);
            return result;
        }
        finally
        {
            log.Finish();
        }
    }

    /// <summary>Steps 1 to 4: blocks key, caller and tenant, item id, entity.</summary>
    private async Task<EntityModel> ResolveEntityAsync(HttpContext http, string entityName, string? itemId)
    {
        if (string.IsNullOrWhiteSpace(http.Request.Headers[GraphQlConstant.BlocksKeyHeaderKey].FirstOrDefault()))
            throw NotAuthenticated($"The '{GraphQlConstant.BlocksKeyHeaderKey}' header is required.");

        var isAuthenticated = await GatewayCallerResolver.AuthenticateAsync(http);
        var tenantId = GatewayCallerResolver.ResolveTenantId()
            ?? throw NotAuthenticated($"Unable to resolve tenant. Provide a valid bearer token or the '{GraphQlConstant.BlocksKeyHeaderKey}' header.");
        // Pinned for the rest of the request (entity, data access), as the GraphQL entry point does.
        var requestContext = RequestContextAccessor.Current;
        requestContext.TenantId = tenantId;
        RequestContextAccessor.Current = requestContext;

        if (itemId is not null && !ItemIdPattern().IsMatch(itemId))
            throw RestRequestException.ForField(
                ItemIdField, "The item id must be 1 to 64 characters of letters, digits, '_' or '-'.", FieldPaths.InvalidValueType);

        // A name no schema can have is answered as an unknown entity, without a lookup.
        var entity = SchemaNameRules.IsValid(entityName) ? await _models.GetAsync(tenantId, entityName) : null;
        if (entity is not null)
            return entity;

        // An anonymous caller is told the same for an entity that does not exist as for one that is not public.
        throw isAuthenticated
            ? new GatewayException(GatewayProblemMapper.NotFoundCode, $"Entity '{entityName}' was not found.")
            : NotAuthenticated(NotAuthenticatedMessage);
    }

    /// <summary>
    /// Step 5: the access level(s) of the operation. An upsert needs both write and edit: the engine decides between
    /// insert and update only after this check, so a caller lacking either must not get through.
    /// </summary>
    private static void CheckAccess(HttpContext http, RestOperation operation, SchemaDefinitionExtended schema)
    {
        foreach (var level in AccessLevels(operation, schema))
        {
            switch (SchemaAccessGate.Check(http, level))
            {
                case SchemaAccessDecision.InvalidTenant:
                    throw NotAuthenticated("Tenant is not valid.");
                case SchemaAccessDecision.NotAuthenticated:
                    throw NotAuthenticated(NotAuthenticatedMessage);
            }
        }
    }

    private static IEnumerable<SchemaAccessLevel> AccessLevels(RestOperation operation, SchemaDefinitionExtended schema) => operation switch
    {
        RestOperation.Get or RestOperation.GetById => [schema.ReadAccessLevel],
        RestOperation.Insert or RestOperation.InsertMany => [schema.WriteAccessLevel],
        RestOperation.Update or RestOperation.UpdateMany => [schema.EditAccessLevel],
        RestOperation.Upsert => [schema.WriteAccessLevel, schema.EditAccessLevel],
        RestOperation.Delete or RestOperation.DeleteMany => [schema.DeleteAccessLevel],
        _ => throw new ArgumentOutOfRangeException(nameof(operation), operation, null),
    };

    /// <summary>The GraphQL field name of the same operation, as the request log and Graph Log know it.</summary>
    internal static string OperationName(RestOperation operation, string entity) => operation switch
    {
        RestOperation.Get or RestOperation.GetById => $"get{entity}s",
        RestOperation.Insert => $"insert{entity}",
        RestOperation.InsertMany => $"insertMany{entity}",
        RestOperation.Update => $"update{entity}",
        RestOperation.UpdateMany => $"updateMany{entity}",
        RestOperation.Upsert => $"upsert{entity}",
        RestOperation.Delete => $"delete{entity}",
        RestOperation.DeleteMany => $"deleteMany{entity}",
        _ => throw new ArgumentOutOfRangeException(nameof(operation), operation, null),
    };

    private static GatewayException NotAuthenticated(string message) =>
        new(GraphQlConstant.UnauthorizedErrorCode, message);

    /// <summary>
    /// Runs a parse step. A value System.Text.Json cannot read as asked (it throws <see cref="InvalidOperationException"/>)
    /// or malformed JSON is the caller's 400, not a 500.
    /// </summary>
    private static T Read<T>(Func<T> read)
    {
        try
        {
            return read();
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            throw new RestRequestException("The request body could not be read.");
        }
    }

    /// <summary>The members of a body object, each allowed name at most once; anything else is refused.</summary>
    private static Dictionary<string, JsonElement> Members(JsonElement body, params string[] allowed)
    {
        if (body.ValueKind != JsonValueKind.Object)
            throw new RestRequestException("The request body must be a JSON object.");

        var members = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var property in body.EnumerateObject())
        {
            var name = JsonText.Name(property, "");
            if (!allowed.Contains(name, StringComparer.Ordinal))
                throw new RestRequestException($"Unknown property '{name}'.");
            if (!members.TryAdd(name, property.Value))
                throw new RestRequestException($"Property '{name}' was given more than once.");
        }
        return members;
    }

    private void GuardColumns(EntityModel entity, WhereNode? where, IReadOnlyList<OrderItem>? order) =>
        ColumnRuleGuard.Check(_resolver, _principals.Current, entity, where, order);

    private static void RequireWhere(WhereNode? where, string action)
    {
        if (where is null || where.Root.Count == 0)
            throw new RestRequestException($"A 'where' with at least one condition is required; a {action} of every record is refused.");
    }

    /// <summary>
    /// A record's own <c>ItemId</c> must follow the route's item-id rule (R34), or the record could be reached only
    /// through the list and bulk routes. <paramref name="index"/> is the record's position in a bulk insert.
    /// </summary>
    private static void CheckBodyItemId(Dictionary<string, object?> record, int? index)
    {
        // The record reader renames ItemId to _id. Left out (or null), the store assigns one that follows the rule.
        if (!record.TryGetValue(GraphQlConstant.DbEntityIdFieldName, out var bodyId) || bodyId is null)
            return;
        if (bodyId is string id && ItemIdPattern().IsMatch(id))
            return;
        if (index is null)
            throw RestRequestException.ForField(ItemIdField, BodyItemIdMessage, FieldPaths.InvalidValueType);
        var message = $"Item {index}: {BodyItemIdMessage}";
        throw new RestRequestException(message, [new GatewayFieldError($"[{index}].{ItemIdField}", message, FieldPaths.InvalidValueType)]);
    }

    private static Lazy<Dictionary<string, object?>> Lazy(Dictionary<string, object?> record) => new(() => record);

    private static WhereNode ById(string itemId) =>
        new(new Dictionary<string, object?>
        {
            [ItemIdField] = new Dictionary<string, object?> { ["eq"] = itemId },
        });

    /// <summary>
    /// The paths the engine projects: those asked for, or every top-level field of the entity when none were, so the
    /// answer holds the entity's fields only (not the bookkeeping fields stored beside them). <c>ItemId</c> is stored
    /// as <c>_id</c> and always returned; a path under another selected path is dropped (the store refuses both).
    /// </summary>
    private static IReadOnlyList<string> Projection(EntityModel entity, IReadOnlyList<string> select)
    {
        var requested = select.Count > 0 ? select : entity.Schema.Fields.Select(f => f.Name).ToList();
        var paths = requested
            .Select(path => path == ItemIdField ? GraphQlConstant.DbEntityIdFieldName : path)
            .Append(GraphQlConstant.DbEntityIdFieldName)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        return paths
            .Where(path => !paths.Any(other => path.StartsWith(other + ".", StringComparison.Ordinal)))
            .ToList();
    }

    // ---- results ----

    private static async Task<RestResult> ListAsync(QueryResponse<Dictionary<string, object>> response, bool includeTotalCount)
    {
        var items = (response.Items ?? []).Select(Output).ToList();
        var list = new RestListResponse(items, response.PageNo, response.PageSize, response.PageNo > 1);
        if (includeTotalCount)
        {
            // Counting scans every matching row, so it runs only when asked for.
            var totalCount = await response.GetTotalCountAsync();
            var totalPages = QueryResponse<Dictionary<string, object>>.TotalPagesFor(totalCount, response.PageSize);
            list = list with { TotalCount = totalCount, TotalPages = totalPages, HasNextPage = response.PageNo < totalPages };
        }
        return new RestResult(StatusCodes.Status200OK, list);
    }

    private static RestResult ItemResult(HttpContext http, ActionResponse response) =>
        response is NotFoundActionResponse
            ? NotFound(http, response.Message)
            : new RestResult(StatusCodes.Status200OK, new RestItemResponse(response.Acknowledged, response.ItemId));

    /// <summary>
    /// A bulk update or delete. One that matched no row the caller may touch is not an error (R33): it is answered
    /// with the bulk shape, nothing acknowledged and nothing changed, as any other bulk result.
    /// </summary>
    private static RestResult BulkResult(ActionResponse response) =>
        response is NotFoundActionResponse
            ? new RestResult(StatusCodes.Status200OK, new RestBulkResponse(Acknowledged: false, TotalImpactedData: 0))
            : new RestResult(StatusCodes.Status200OK, new RestBulkResponse(response.Acknowledged, response.TotalImpactedData));

    private static RestResult Created(string entity, string? itemId, object body) =>
        string.IsNullOrEmpty(itemId)
            ? new RestResult(StatusCodes.Status200OK, body)
            : new RestResult(StatusCodes.Status201Created, body,
                string.Format(LocationFormat, Uri.EscapeDataString(entity), Uri.EscapeDataString(itemId)));

    /// <summary>
    /// A write or read that matched no row the caller may see. Answered 404, but not logged as a failure: GraphQL logs
    /// the same outcome (its "not found" response) as a success, and Graph Log keeps counting both alike.
    /// </summary>
    private static RestResult NotFound(HttpContext http, string? message) =>
        GatewayProblemMapper.Problem(http, StatusCodes.Status404NotFound, GatewayProblemMapper.NotFoundCode,
            string.IsNullOrWhiteSpace(message) ? "No matching record was found, or you don't have permission to access it." : message);

    /// <summary>A stored row as the API returns it: <c>_id</c> as <c>ItemId</c>, at every level, as GraphQL resolves it.</summary>
    private static Dictionary<string, object?> Output(IDictionary<string, object> row)
    {
        var output = new Dictionary<string, object?>(row.Count, StringComparer.Ordinal);
        var hasId = row.TryGetValue(GraphQlConstant.DbEntityIdFieldName, out var id);
        if (hasId)
            output[ItemIdField] = OutputValue(id);
        foreach (var (key, value) in row)
        {
            if (key == GraphQlConstant.DbEntityIdFieldName || (hasId && key == ItemIdField))
                continue;
            output[key] = OutputValue(value);
        }
        return output;
    }

    private static object? OutputValue(object? value) => value switch
    {
        IDictionary<string, object> nested => Output(nested),
        string text => text,
        IList list => list.Cast<object?>().Select(OutputValue).ToList(),
        _ => value,
    };
}
