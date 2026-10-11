using Blocks.Genesis;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// Shared context for the logs of schema publishing and of keeping every pod on the published
/// schema.
///
/// Every line written inside <see cref="BeginScope"/> carries the pod, the tenant, the operation and
/// (when known) the version as separate fields of the log record, so one publish can be followed
/// across all pods by filtering on them. That matters for the background rebuilds, which run
/// outside any request and so have no trace id.
///
/// These logs hold identifiers, version numbers, counts, sizes and durations only: never schema
/// contents, data, or personal data in full. Who acted is logged as the user id and a masked email
/// (<see cref="LogMasking"/>).
/// </summary>
public static class SchemaLog
{
    public const string Publish = "Publish";
    public const string Rollback = "Rollback";
    public const string Bootstrap = "Bootstrap";
    public const string Rebuild = "Rebuild";
    public const string VersionCheck = "VersionCheck";

    /// <summary>This pod's name (in Kubernetes the machine name is the pod name).</summary>
    public static readonly string Pod = Environment.MachineName;

    public static IDisposable? BeginScope(ILogger logger, string operation, string tenantId, long? version = null)
    {
        var state = new Dictionary<string, object>
        {
            ["Pod"] = Pod,
            ["SchemaOperation"] = operation,
            ["TenantId"] = tenantId
        };
        if (version is not null)
        {
            state["SchemaVersion"] = version.Value;
        }

        return logger.BeginScope(state);
    }

    /// <summary>The user making the current request: their id, and their email masked.</summary>
    public static (string UserId, string MaskedEmail) CurrentUser()
    {
        var context = BlocksContext.GetContext();
        return (context?.UserId ?? string.Empty, LogMasking.MaskEmail(context?.Email));
    }

    public static long ElapsedMs(long startedTimestamp) =>
        (long)System.Diagnostics.Stopwatch.GetElapsedTime(startedTimestamp).TotalMilliseconds;
}
