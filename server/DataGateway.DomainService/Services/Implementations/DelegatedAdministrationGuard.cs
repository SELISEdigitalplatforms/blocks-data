using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Helpers;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

/// <summary>
/// Rule R6 of delegated administration: data-access policies and schema security levels may be written by the
/// system caller only. Mode comes from <c>DelegatedAdministration:Mode</c>: <c>Audit</c> (default) logs a warning
/// and allows, <c>Enforce</c> refuses.
/// </summary>
public interface IDelegatedAdministrationGuard
{
    /// <summary>True when the caller may perform <paramref name="action"/>. In Audit mode a would-deny is logged and allowed.</summary>
    bool IsAllowed(string action);
}

public sealed class DelegatedAdministrationGuard : IDelegatedAdministrationGuard
{
    public const string ModeKey = "DelegatedAdministration:Mode";
    public const string EnforceMode = "Enforce";
    public const string ErrorKey = "Access_Grant_Not_Allowed";
    private const string RuleR6 = "R6";

    private readonly IConfiguration _configuration;
    private readonly IAccessPrincipalAccessor _principals;
    private readonly ILogger<DelegatedAdministrationGuard> _logger;

    public DelegatedAdministrationGuard(
        IConfiguration configuration,
        IAccessPrincipalAccessor principals,
        ILogger<DelegatedAdministrationGuard> logger)
    {
        _configuration = configuration;
        _principals = principals;
        _logger = logger;
    }

    public bool IsAllowed(string action)
    {
        var principal = _principals.Current;
        if (RecordOrganizationRule.MaySetAnyOrganization(principal))
            return true;

        if (string.Equals(_configuration[ModeKey], EnforceMode, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("DelegatedAdministration denied {Rule} {CallerId} {OrgId} {Action}",
                RuleR6, principal.UserId, principal.OrganizationId, action);
            return false;
        }

        _logger.LogWarning("DelegatedAdministration would deny {Rule} {CallerId} {OrgId} {Action}",
            RuleR6, principal.UserId, principal.OrganizationId, action);
        return true;
    }
}
