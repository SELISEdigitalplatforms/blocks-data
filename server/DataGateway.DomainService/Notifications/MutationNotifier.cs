using System.Collections.Concurrent;
using Blocks.Genesis;
using Blocks.Genesis.Entities.Os;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Notifications;

/// <summary>What happened to records. The wire value is the lower-case name.</summary>
public enum RecordChangeKind
{
    Insert,
    Update,
    Delete
}

/// <summary>The notifications of record writes. Both methods never throw; run them after the write, not on the write path.</summary>
public interface IMutationNotifier
{
    /// <summary>
    /// Sends <c>data-record-changed</c> (never record values), unless the tenant has not switched it on for a wide
    /// audience. Optional and off by default.
    /// </summary>
    /// <param name="recordId">The record, for a single change; null for a bulk change.</param>
    /// <param name="count">How many records changed.</param>
    Task NotifyRecordsChangedAsync(string schemaName, RecordChangeKind kind, string? recordId, long count);

    /// <summary>One final result per bulk request, to the caller (never per row or per batch).</summary>
    Task NotifyBulkResultAsync(string schemaName, string operation, bool acknowledged, long count);
}

/// <inheritdoc />
public sealed class MutationNotifier : IMutationNotifier
{
    public const string ChangedName = "data-record-changed";
    public const string BulkProgressName = "data-bulk-change-progress";
    internal const string ConfigKey = "notification-config:" + ChangedName;
    internal static readonly TimeSpan CacheTime = TimeSpan.FromSeconds(60);
    private const int MaxCachedTenants = 10_000;

    private readonly IBuiltInNotificationSender _sender;
    private readonly IKeyValueStore _keyValueStore;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<MutationNotifier> _logger;
    private readonly ConcurrentDictionary<string, (bool Enabled, DateTimeOffset ExpiresAt)> _cache = new();

    public MutationNotifier(
        IBuiltInNotificationSender sender,
        IKeyValueStore keyValueStore,
        ILogger<MutationNotifier> logger,
        TimeProvider? timeProvider = null)
    {
        _sender = sender;
        _keyValueStore = keyValueStore;
        _logger = logger;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    /// <summary>The wire name of a change kind.</summary>
    public static string KindName(RecordChangeKind kind) => kind switch
    {
        RecordChangeKind.Insert => "insert",
        RecordChangeKind.Update => "update",
        _ => "delete"
    };

    /// <summary>True when the config is on and reaches everyone, or a selected group that has rules.</summary>
    public static bool IsWatched(NotificationConfiguration? config)
    {
        if (config is null || config.IsDisabled) return false;
        var audience = config.EffectiveAudience();
        return audience.Level == NotificationAudienceLevel.AllUsers
            || (audience.Level == NotificationAudienceLevel.Selected && audience.HasRules());
    }

    public async Task NotifyRecordsChangedAsync(string schemaName, RecordChangeKind kind, string? recordId, long count)
    {
        try
        {
            var context = BlocksContext.GetContext();
            var tenantId = context?.TenantId;
            if (string.IsNullOrWhiteSpace(tenantId) || !await IsEnabledAsync(tenantId)) return;

            var kindName = KindName(kind);
            await _sender.SendAsync(new BuiltInNotification(
                tenantId,
                ChangedName,
                [],
                new
                {
                    @event = ChangedName,
                    title = "Records changed",
                    description = $"{count} record(s) in {schemaName} ({kindName}).",
                    isSuccess = true,
                    schemaName,
                    operation = kindName,
                    recordId,
                    count,
                    actorId = context?.UserId,
                    occurredAt = DateTime.UtcNow
                },
                OrganizationId: context?.OrganizationId,
                IncludeImpersonatedActor: false));
        }
        catch (Exception ex)
        {
            // The write has succeeded; a notification problem must not turn it into a failure.
            _logger.LogWarning("Notification {ConfigurationName} could not be prepared, error={ErrorType}", ChangedName, ex.GetType().Name);
        }
    }

    public async Task NotifyBulkResultAsync(string schemaName, string operation, bool acknowledged, long count)
    {
        try
        {
            var context = BlocksContext.GetContext();
            await _sender.SendAsync(new BuiltInNotification(
                context?.TenantId ?? string.Empty,
                BulkProgressName,
                BuiltInNotificationSender.Recipients(context?.UserId),
                new
                {
                    @event = BulkProgressName,
                    title = "Bulk change finished",
                    description = acknowledged ? $"Bulk {operation} finished." : $"Bulk {operation} was not completed.",
                    isSuccess = acknowledged,
                    schemaName,
                    operation,
                    affectedCount = count,
                    occurredAt = DateTime.UtcNow
                },
                OrganizationId: context?.OrganizationId));
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Notification {ConfigurationName} could not be prepared, error={ErrorType}", BulkProgressName, ex.GetType().Name);
        }
    }

    /// <summary>One config read per tenant per minute; a failed read counts as "off" for that minute.</summary>
    private async Task<bool> IsEnabledAsync(string tenantId)
    {
        var now = _timeProvider.GetUtcNow();
        if (_cache.TryGetValue(tenantId, out var cached) && cached.ExpiresAt > now) return cached.Enabled;

        var enabled = false;
        try
        {
            enabled = IsWatched(await _keyValueStore.GetAsync<NotificationConfiguration>(ConfigKey));
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Notification {ConfigurationName} config could not be read, error={ErrorType}", ChangedName, ex.GetType().Name);
        }

        if (_cache.Count >= MaxCachedTenants) _cache.Clear();
        _cache[tenantId] = (enabled, now + CacheTime);
        return enabled;
    }
}
