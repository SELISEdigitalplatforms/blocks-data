using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Blocks.Genesis;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Validators;
using DataGateway.Rest.Errors;
using DataGateway.Rest.Parsing;
using Microsoft.AspNetCore.Http;

namespace DataGateway.Rest.Logging;

/// <summary>
/// The request-history record of one REST request: the same <see cref="GatewayOperation"/> GraphQL fills, with
/// <see cref="GatewayOperation.Transport"/> <c>"rest"</c> and the GraphQL-style operation name as
/// <see cref="GatewayOperation.SchemaName"/>, so Graph Log shows both APIs side by side. <see cref="Finish"/> writes
/// it onto the request's activity.
/// </summary>
public sealed class RestOperationLog
{
    /// <summary>The most characters of method, path, query string and body kept in <see cref="GatewayOperation.OperationQuery"/>.</summary>
    public const int MaxOperationQueryLength = 8192;

    private const string Transport = "rest";

    /// <summary>Every query's name starts with it (<see cref="RestRouteNames"/>); every mutation's does not.</summary>
    private const string QueryNamePrefix = "get";

    private readonly HttpContext _http;
    private readonly JsonElement? _body;
    private readonly GatewayOperation _operation;
    private EntityModel? _entity;

    private RestOperationLog(HttpContext http, JsonElement? body, GatewayOperation operation)
    {
        _http = http;
        _body = body;
        _operation = operation;
    }

    internal static RestOperationLog Begin(HttpContext http, RestOperation operation, string operationName, string entityName, JsonElement? body)
    {
        var gatewayOperation = GatewayOperationActivity.GetOrCreate(Activity.Current);
        gatewayOperation.Transport = Transport;
        gatewayOperation.OperationType = operation is RestOperation.Get or RestOperation.GetById ? "query" : "mutation";
        gatewayOperation.SchemaName = operationName;
        gatewayOperation.EntityName = entityName;
        return new RestOperationLog(http, body, gatewayOperation);
    }

    /// <summary>The entity, once loaded: its PII fields are what the logged body masks.</summary>
    internal void UseEntity(EntityModel entity) => _entity = entity;

    /// <summary>
    /// Records a failed request. The check that refused it may already have said why (the first reason recorded
    /// wins); otherwise the kind follows from the answer.
    /// </summary>
    internal void Failed(Exception ex, RestResult result)
    {
        var code = (result.Body as GatewayProblem)?.Code;
        var kind = result.StatusCode is StatusCodes.Status400BadRequest or StatusCodes.Status409Conflict && ex is GatewayException
            ? GatewayFailureKind.Validation
            : KindFor(result.StatusCode);
        // The log is internal: it keeps the exception's own message, which the answer never carries.
        GatewayOperationActivity.MarkFailed(Activity.Current, kind, ex.Message, code);
    }

    /// <summary>
    /// Logs a request the REST API refused before an operation ran (an unknown custom-method verb, a wrong content type),
    /// as one failed entry with transport <c>rest</c>. <paramref name="entityName"/> is recorded only when it passes the
    /// schema-name rule, and the body is not logged (it was never read). Does nothing without an ambient activity.
    /// </summary>
    public static void Refused(HttpContext http, string? entityName, string operationName, int status, string code, string message)
    {
        ArgumentNullException.ThrowIfNull(http);
        var activity = Activity.Current;
        if (activity is null)
            return;

        var gatewayOperation = GatewayOperationActivity.GetOrCreate(activity);
        gatewayOperation.Transport = Transport;
        gatewayOperation.OperationType = operationName.StartsWith(QueryNamePrefix, StringComparison.Ordinal) ? "query" : "mutation";
        gatewayOperation.SchemaName = operationName;
        gatewayOperation.EntityName = SchemaNameRules.IsValid(entityName) ? entityName : null;
        gatewayOperation.OperationQuery = Truncate(RequestLine(http).ToString());
        gatewayOperation.InAppRequest = IsInAppRequest();
        GatewayOperationActivity.MarkFailed(activity, KindFor(status), message, code);
        GatewayOperationActivity.Tag(activity, gatewayOperation);
    }

    private static string KindFor(int status) => status switch
    {
        StatusCodes.Status401Unauthorized => GatewayFailureKind.Authentication,
        StatusCodes.Status403Forbidden => GatewayFailureKind.Authorization,
        >= 400 and < 500 => GatewayFailureKind.BadRequest,
        _ => GatewayFailureKind.Unhandled,
    };

    /// <summary>Fills in what the request was and tags the activity.</summary>
    internal void Finish()
    {
        _operation.OperationQuery = Truncate(Describe());
        _operation.InAppRequest = IsInAppRequest();
        GatewayOperationActivity.Tag(Activity.Current, _operation);
    }

    /// <summary>
    /// As GraphQL sets it: false only for an impersonated (Blocks Console) caller. Graph Log and analytics hide the
    /// other rows unless "Include Playground operations" is on. Without a context (a refusal before the caller is
    /// known) nobody is impersonating, so the request counts as in-app.
    /// </summary>
    private static bool IsInAppRequest() => !(BlocksContext.GetContext()?.Impersonated ?? false);

    private string Describe()
    {
        var text = RequestLine(_http);
        if (_body is { ValueKind: not JsonValueKind.Undefined } body)
            text.Append('\n').Append(MaskedBody(body));
        return text.ToString();
    }

    private static StringBuilder RequestLine(HttpContext http)
    {
        var request = http.Request;
        return new StringBuilder()
            .Append(request.Method).Append(' ').Append(request.PathBase).Append(request.Path).Append(request.QueryString);
    }

    private static string Truncate(string text) =>
        text.Length <= MaxOperationQueryLength ? text : text[..MaxOperationQueryLength];

    /// <summary>
    /// The body with every value under a PII field masked, wherever the field's name appears (a record, a <c>where</c>,
    /// an <c>input</c>). Before the entity is known, every value is masked.
    /// </summary>
    private string MaskedBody(JsonElement body)
    {
        JsonNode? node;
        try
        {
            node = JsonNode.Parse(body.GetRawText());
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            return "<unreadable body>";
        }

        var piiNames = _entity is null ? null : PiiFieldNames(_entity);
        var maskAll = piiNames is null;
        if (node is JsonValue rootValue && maskAll)
            node = Masked(rootValue);
        else
            Mask(node, maskAll, piiNames ?? []);
        try
        {
            return node?.ToJsonString() ?? "null";
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or ArgumentException)
        {
            return "<unreadable body>";
        }
    }

    /// <summary>Masks, in place, every value under a PII name (every value at all when <paramref name="maskAll"/>).</summary>
    private static void Mask(JsonNode? node, bool maskAll, HashSet<string> piiNames)
    {
        switch (node)
        {
            case JsonObject obj:
                foreach (var name in obj.Select(property => property.Key).ToList())
                {
                    var mask = maskAll || piiNames.Contains(name);
                    if (obj[name] is JsonValue value)
                    {
                        if (mask)
                            obj[name] = Masked(value);
                    }
                    else
                    {
                        Mask(obj[name], mask, piiNames);
                    }
                }
                break;
            case JsonArray array:
                for (var i = 0; i < array.Count; i++)
                {
                    if (array[i] is JsonValue value)
                    {
                        if (maskAll)
                            array[i] = Masked(value);
                    }
                    else
                    {
                        Mask(array[i], maskAll, piiNames);
                    }
                }
                break;
        }
    }

    private static JsonValue Masked(JsonValue value) =>
        JsonValue.Create(LogMasking.MaskText(value.TryGetValue<string>(out var text) ? text : value.ToJsonString()));

    /// <summary>The names of the entity's PII fields, its DTOs' included.</summary>
    private static HashSet<string> PiiFieldNames(EntityModel entity)
    {
        var names = new HashSet<string>(StringComparer.Ordinal);
        Collect(entity.Schema.Fields, entity, names, depth: 0);
        return names;
    }

    private static void Collect(IList<FieldDefinitionResponse>? fields, EntityModel entity, HashSet<string> names, int depth)
    {
        // DTOs can refer to each other; a schema nests only a few levels deep.
        if (fields is null || depth > JsonRecordReader.MaxDepth)
            return;
        foreach (var field in fields)
        {
            if (field.IsPIIData)
            {
                names.Add(field.Name);
                if (field.Name == nameof(GraphQlBaseEntity.ItemId))
                    names.Add(GraphQlConstant.DbEntityIdFieldName);
            }
            Collect(FieldPaths.ChildrenOf(field, entity), entity, names, depth + 1);
        }
    }
}
