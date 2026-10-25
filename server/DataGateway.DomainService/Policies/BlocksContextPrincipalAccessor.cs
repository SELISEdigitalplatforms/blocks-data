using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis;

namespace DataGateway.DomainService.Policies;

/// <summary>
/// The gateway's caller: the BlocksContext set by the token authenticator. An impersonated token
/// bypasses data access policies (<see cref="AccessPrincipal.IsRootTenant"/>); every other caller,
/// including one sending the root tenant's <c>x-blocks-key</c>, is held to the schema's policies.
/// The only place the gateway reads ambient request state for policy evaluation.
/// </summary>
public sealed class BlocksContextPrincipalAccessor : IAccessPrincipalAccessor
{
    public AccessPrincipal Current => For(BlocksContext.GetContext());

    /// <summary>The principal for a BlocksContext: policies are bypassed only for an impersonated token.</summary>
    public static AccessPrincipal For(BlocksContext? context) =>
        AccessPrincipal.From(context, isRootTenant: context?.Impersonated == true);
}
