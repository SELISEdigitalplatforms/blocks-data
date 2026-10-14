using Blocks.DataAccess.Policies;
using Blocks.Genesis;

namespace DataGateway.DomainService.Policies;

/// <summary>
/// The gateway's caller: the BlocksContext set by the token authenticator plus the root-tenant flag the
/// request-context middleware resolved from <c>x-blocks-key</c>. The only place the gateway reads ambient
/// request state for policy evaluation.
/// </summary>
public sealed class BlocksContextPrincipalAccessor : IAccessPrincipalAccessor
{
    public AccessPrincipal Current =>
        AccessPrincipal.From(BlocksContext.GetContext(), RequestContextAccessor.Current.IsRequestFromBlocksCloud);
}
