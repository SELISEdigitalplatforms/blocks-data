namespace DataGateway.Rest;

/// <summary>
/// The custom methods of the REST API, <c>POST /api/gateway/{entity}:{verb}</c> (spec 2026-11-04 §2): the operations
/// that need a body and are not a create or an update of one record. A verb is matched exactly, case included, so
/// <c>:DeleteMany</c> is refused rather than guessed.
/// </summary>
public static class RestCustomMethods
{
    public const string Query = "query";
    public const string InsertMany = "insertMany";
    public const string UpdateMany = "updateMany";
    public const string DeleteMany = "deleteMany";

    /// <summary>Every verb, in the order the API documents them.</summary>
    public static readonly IReadOnlyList<string> All = [Query, InsertMany, UpdateMany, DeleteMany];

    /// <summary>The detail of the <c>UNKNOWN_METHOD</c> problem a verb outside <see cref="All"/> is answered with.</summary>
    public static string UnknownMethodDetail(string verb) =>
        $"Unknown method '{verb}'. Use one of: {string.Join(", ", All)}.";
}
