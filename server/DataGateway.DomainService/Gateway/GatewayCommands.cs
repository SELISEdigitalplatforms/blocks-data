using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess.Rules;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Gateway;

/// <summary>
/// The entity a gateway operation targets: its schema and the references that resolve against it. <c>Dtos</c> are the
/// DTO schemas its fields use, by name, for a transport that builds a field's input from the schema (REST); the engine
/// itself does not read them.
/// </summary>
public sealed record EntityModel(
    SchemaDefinitionExtended Schema,
    ReferenceTargets? References,
    IReadOnlyDictionary<string, SchemaDefinitionExtended>? Dtos = null);

/// <summary>
/// A filter as plain values only: string, numbers, bool, DateTime, <c>List&lt;object?&gt;</c> and nested
/// <c>IReadOnlyDictionary&lt;string, object?&gt;</c>. No transport type (HotChocolate's <c>Optional&lt;T&gt;</c>, a
/// binder's input classes) reaches the engine; the transport adapter normalises into this first.
/// </summary>
public sealed record WhereNode(IReadOnlyDictionary<string, object?> Root);

/// <summary>One sort entry: a schema field and the direction to sort it in.</summary>
public sealed record OrderItem(string Field, SortDirection Direction);

public sealed record QueryCommand(
    string OperationName,
    WhereNode? Where,
    IReadOnlyList<OrderItem>? Order,
    int? PageNo,
    int? PageSize,
    IReadOnlyList<string> Select,
    string? LegacyFilterJson = null,
    string? LegacySortJson = null);

/// <summary>
/// The record is lazy so the engine decides when (and whether) it is materialised: building it can
/// throw, and the engine must run its access checks first.
/// </summary>
public sealed record InsertCommand(string OperationName, Lazy<Dictionary<string, object?>> Record);

public sealed record InsertManyCommand(string OperationName, Lazy<List<Dictionary<string, object?>>> Records);

public sealed record UpdateCommand(
    string OperationName,
    WhereNode? Where,
    Lazy<Dictionary<string, object?>> Changes,
    string? LegacyFilterJson = null,
    bool CheckOwner = false);

/// <summary>
/// <paramref name="BoundByReadRules"/>: the update reaches only rows the caller may also read (the READ row rules are
/// ANDed into the filter when the entity's read level is Custom). The REST transport sets it; GraphQL does not.
/// </summary>
public sealed record UpdateManyCommand(
    string OperationName,
    WhereNode? Where,
    Lazy<Dictionary<string, object?>> Changes,
    string? LegacyFilterJson = null,
    bool CheckOwner = false,
    bool BoundByReadRules = false);

public sealed record DeleteCommand(
    string OperationName,
    WhereNode? Where,
    bool HardDelete,
    string? LegacyFilterJson = null,
    bool CheckOwner = false);

/// <summary>
/// <paramref name="BoundByReadRules"/>: the delete reaches only rows the caller may also read (the READ row rules are
/// ANDed into the filter when the entity's read level is Custom). The REST transport sets it; GraphQL does not.
/// </summary>
public sealed record DeleteManyCommand(
    string OperationName,
    WhereNode? Where,
    bool HardDelete,
    string? LegacyFilterJson = null,
    bool CheckOwner = false,
    bool BoundByReadRules = false);

/// <summary>
/// Create the record with this id, or update it if it exists. The record is in the shape
/// the GraphQL mutation input parser produces (plain values, with nested
/// <c>Dictionary&lt;string, object?&gt;</c> and <c>List&lt;object?&gt;</c>); its id key (<c>_id</c>), when present, is ignored in favour
/// of <paramref name="ItemId"/>, and the transport has already refused a body that names a different id.
/// </summary>
public sealed record UpsertCommand(string OperationName, string ItemId, Lazy<Dictionary<string, object?>> Record);

/// <summary>The outcome of an upsert: the write's response, and whether it created the record rather than updating it.</summary>
public sealed record UpsertResult(ActionResponse Response, bool Created);
