using System.Runtime.CompilerServices;
using System.Security.Claims;
using Blocks.Genesis;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// The caller of the current request, read once per request.
///
/// For an authenticated gateway request <see cref="BlocksContext.GetContext"/> rebuilds the context
/// from the token's claims on every call (the authenticator's <c>SetContext</c> runs inside an
/// async method, so it never reaches the request). Policy checks ask for the caller once per rule
/// and row, and the claims include every role-derived permission, so the rebuilds dominated large
/// queries. The rebuilt value depends only on the token's identity and the request it arrived on,
/// so it is kept per identity: the identity is created for one request, and the entry goes with it.
/// </summary>
internal static class RequestBlocksContext
{
    private static readonly ConditionalWeakTable<ClaimsIdentity, BlocksContext> ByIdentity = new();

    public static BlocksContext? Get()
    {
        // Tests pin a context of their own; only the request-derived context is kept.
        if (BlocksContext.IsTestMode
            || BlocksHttpContextAccessor.Instance?.HttpContext?.User?.Identity is not ClaimsIdentity { IsAuthenticated: true } identity)
        {
            return BlocksContext.GetContext();
        }

        if (ByIdentity.TryGetValue(identity, out var cached))
            return cached;

        // GetContext returns null when reading the context failed; that is not kept, so the next
        // call tries again exactly as it would have before.
        var context = BlocksContext.GetContext();
        if (context is not null)
            ByIdentity.AddOrUpdate(identity, context);
        return context;
    }
}
