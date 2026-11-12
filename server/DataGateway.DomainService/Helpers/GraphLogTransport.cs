namespace DataGateway.DomainService.Helpers;

/// <summary>
/// The values of <see cref="GatewayOperation.Transport"/> that Graph Log history and analytics
/// understand. Only the REST API writes one ("rest"); GraphQL requests write none, and an entry
/// without a transport reads as GraphQL.
/// </summary>
public static class GraphLogTransport
{
    public const string Rest = "rest";
    public const string GraphQl = "graphql";

    public const string InvalidFilterMessage = "Transport_Must_Be_Rest_Or_GraphQL.";

    /// <summary>Whether a <c>Transport</c> filter value is one the API accepts. Blank means "no filter".</summary>
    public static bool IsValidFilter(string? value) =>
        string.IsNullOrWhiteSpace(value)
        || string.Equals(value, Rest, StringComparison.OrdinalIgnoreCase)
        || string.Equals(value, GraphQl, StringComparison.OrdinalIgnoreCase);

    /// <summary>The transport a stored entry reads as: "rest", otherwise "graphql".</summary>
    public static string Read(string? stored) =>
        string.Equals(stored, Rest, StringComparison.Ordinal) ? Rest : GraphQl;
}
