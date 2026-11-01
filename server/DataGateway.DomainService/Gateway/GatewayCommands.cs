using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess.Rules;
using DataGateway.DomainService.Models;

namespace DataGateway.DomainService.Gateway;

/// <summary>The entity a gateway operation targets: its schema and the references that resolve against it.</summary>
public sealed record EntityModel(SchemaDefinitionExtended Schema, ReferenceTargets? References);

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

public sealed record UpdateManyCommand(
    string OperationName,
    WhereNode? Where,
    Lazy<Dictionary<string, object?>> Changes,
    string? LegacyFilterJson = null,
    bool CheckOwner = false);

public sealed record DeleteCommand(
    string OperationName,
    WhereNode? Where,
    bool HardDelete,
    string? LegacyFilterJson = null,
    bool CheckOwner = false);

public sealed record DeleteManyCommand(
    string OperationName,
    WhereNode? Where,
    bool HardDelete,
    string? LegacyFilterJson = null,
    bool CheckOwner = false);
