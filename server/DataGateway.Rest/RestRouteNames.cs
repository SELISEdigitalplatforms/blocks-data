using DataGateway.DomainService.Validators;
using Microsoft.AspNetCore.Http;

namespace DataGateway.Rest;

/// <summary>
/// The names the request log (Graph Log, the analytics cards) knows a REST operation by: the GraphQL field name of the
/// same operation, so history stays continuous across the two APIs (spec 2026-11-04 §4). List and <c>:query</c> are
/// <c>get{Entity}s</c>, get one is <c>get{Entity}ById</c> (GraphQL has no such operation), an unknown custom-method
/// verb is <c>unknown{Entity}</c>, and the rest are <c>insert</c>, <c>insertMany</c>, <c>update</c>,
/// <c>updateMany</c>, <c>upsert</c>, <c>delete</c> and <c>deleteMany</c> followed by the entity.
/// </summary>
public static class RestRouteNames
{
    /// <summary>What a request that matches no route is named after: <c>unknown{Entity}</c>, or this alone when no entity can be told.</summary>
    public const string Unknown = "unknown";

    private const string RoutePrefix = "/api/gateway";

    /// <summary>The request-log name of <paramref name="operation"/> on <paramref name="entity"/>.</summary>
    public static string OperationName(RestOperation operation, string entity) => operation switch
    {
        RestOperation.Get => $"get{entity}s",
        RestOperation.GetById => $"get{entity}ById",
        RestOperation.Insert => $"insert{entity}",
        RestOperation.InsertMany => $"insertMany{entity}",
        RestOperation.Update => $"update{entity}",
        RestOperation.UpdateMany => $"updateMany{entity}",
        RestOperation.Upsert => $"upsert{entity}",
        RestOperation.Delete => $"delete{entity}",
        RestOperation.DeleteMany => $"deleteMany{entity}",
        _ => throw new ArgumentOutOfRangeException(nameof(operation), operation, null),
    };

    /// <summary>The request-log name of a custom-method verb that is none of <see cref="RestCustomMethods.All"/>.</summary>
    public static string UnknownOperationName(string entity) => Unknown + entity;

    /// <summary>
    /// The request-log name of the operation <paramref name="method"/> and <paramref name="path"/> (<c>/api/gateway/…</c>)
    /// would have run, from the route table of spec 2026-11-04 §2 with the verb matched exactly. A request that matches
    /// no route (an unknown verb, a method the route does not take) is <c>unknown{Entity}</c>, and <c>unknown</c> alone
    /// when the path has no entity that passes the schema-name rule. For a request refused before the router picks an
    /// action, which therefore has no operation to name itself.
    /// </summary>
    public static string OperationFor(string method, string path)
    {
        var segments = Segments(path);
        var entity = EntityOf(segments);
        if (entity is null)
            return Unknown;

        var verb = SplitVerb(segments[0]).Verb;
        var operation = verb is null
            ? segments.Length switch
            {
                1 => Match(method, (HttpMethods.Get, RestOperation.Get), (HttpMethods.Post, RestOperation.Insert)),
                2 => Match(method, (HttpMethods.Get, RestOperation.GetById), (HttpMethods.Patch, RestOperation.Update),
                    (HttpMethods.Put, RestOperation.Upsert), (HttpMethods.Delete, RestOperation.Delete)),
                _ => null,
            }
            : segments.Length == 1 && HttpMethods.IsPost(method)
                ? verb switch
                {
                    RestCustomMethods.Query => RestOperation.Get,
                    RestCustomMethods.InsertMany => RestOperation.InsertMany,
                    RestCustomMethods.UpdateMany => RestOperation.UpdateMany,
                    RestCustomMethods.DeleteMany => RestOperation.DeleteMany,
                    _ => null,
                }
                : null;

        return operation is { } known ? OperationName(known, entity) : UnknownOperationName(entity);
    }

    /// <summary>
    /// The entity a REST path addresses (the part of its first segment before a <c>:verb</c>, percent-decoded), or
    /// <c>null</c> when the path is not under <c>/api/gateway/</c> or the name breaks the schema-name rule. Only a name
    /// that passes the rule is ever recorded in a log.
    /// </summary>
    public static string? EntityFor(string path) => EntityOf(Segments(path));

    private static string? EntityOf(string[] segments)
    {
        if (segments.Length == 0)
            return null;
        var name = SplitVerb(segments[0]).Name;
        return SchemaNameRules.IsValid(name) ? name : null;
    }

    /// <summary>The path's segments after <c>/api/gateway</c>, or none when it is not under it.</summary>
    private static string[] Segments(string path)
    {
        if (path is null || !path.StartsWith(RoutePrefix, StringComparison.OrdinalIgnoreCase))
            return [];
        var rest = path[RoutePrefix.Length..];
        if (rest.Length > 0 && rest[0] != '/')
            return [];
        return rest.Split('/', StringSplitOptions.RemoveEmptyEntries);
    }

    /// <summary>A first segment as the router reads it: <c>%3A</c> is ':', and the first ':' starts the verb.</summary>
    private static (string Name, string? Verb) SplitVerb(string segment)
    {
        var text = Uri.UnescapeDataString(segment);
        // The router's complex segment splits on the last ':', not the first; that never differs here, since an entity
        // with a ':' fails the route constraint and is answered 404 before any 415 is named from this.
        var colon = text.IndexOf(':', StringComparison.Ordinal);
        return colon < 0 ? (text, null) : (text[..colon], text[(colon + 1)..]);
    }

    private static RestOperation? Match(string method, params (string Method, RestOperation Operation)[] routes)
    {
        foreach (var (routeMethod, operation) in routes)
        {
            if (string.Equals(method, routeMethod, StringComparison.OrdinalIgnoreCase))
                return operation;
        }
        return null;
    }
}
