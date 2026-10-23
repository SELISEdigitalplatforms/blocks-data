using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Helpers;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Rule R6 of the access grant feature: data-access policies and schema security levels may be written by the
/// system caller only. Any other caller is refused and a warning is logged.
/// </summary>
public interface IAccessGrantGuard
{
    /// <summary>True when the caller may perform <paramref name="action"/>; a refusal is logged.</summary>
    bool IsAllowed(string action);
}

public sealed class AccessGrantGuard : IAccessGrantGuard
{
    public const string ErrorKey = "Access_Grant_Not_Allowed";
    private const string RuleR6 = "R6";

    private readonly IAccessPrincipalAccessor _principals;
    private readonly ILogger<AccessGrantGuard> _logger;

    public AccessGrantGuard(
        IAccessPrincipalAccessor principals,
        ILogger<AccessGrantGuard> logger)
    {
        _principals = principals;
        _logger = logger;
    }

    public bool IsAllowed(string action)
    {
        var principal = _principals.Current;
        if (RecordOrganizationRule.MaySetAnyOrganization(principal))
            return true;

        _logger.LogWarning("AccessGrant denied {Rule} {CallerId} {OrgId} {Action}",
            RuleR6, principal.UserId, principal.OrganizationId, action);
        return false;
    }
}
