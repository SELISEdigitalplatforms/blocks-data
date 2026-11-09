namespace DataGateway.DomainService.Models;

/// <summary>
/// The response of a write that matched no row the caller may touch (no such row, or the row rules hide it).
/// It is an <see cref="ActionResponse"/> in every way, and GraphQL, which exposes <see cref="ActionResponse"/>,
/// returns it unchanged; the type only lets another transport (REST) tell "not found" from a plain
/// unacknowledged write without parsing the message.
/// </summary>
public sealed class NotFoundActionResponse : ActionResponse
{
}
