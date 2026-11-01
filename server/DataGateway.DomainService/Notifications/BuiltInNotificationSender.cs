using Blocks.Genesis;
using Blocks.Genesis.Notifications;

namespace DataGateway.DomainService.Notifications;

/// <summary>One notification for the Genesis publisher: the config to use, who it is about and the short payload.</summary>
/// <param name="TenantId">The tenant where the action happened.</param>
/// <param name="ConfigurationName">Name of the built-in notification config.</param>
/// <param name="UserIds">The users the event is about. The notification config decides who else receives it.</param>
/// <param name="Payload">Ids and short text only. Serialized as it is.</param>
/// <param name="ResponseKey">Optional response key.</param>
/// <param name="ResponseValue">Optional response value.</param>
/// <param name="OrganizationId">The record owner's organization. Null: the organization of the current context.
/// A same-tenant user-token send always uses the token's organization (Genesis rule).</param>
/// <param name="IncludeImpersonatedActor">True (default): when a root user acts inside the project, that user is named
/// too, so console users get it. False for notices where the actor must not get their own notice.</param>
public sealed record BuiltInNotification(
    string TenantId,
    string ConfigurationName,
    IReadOnlyList<string> UserIds,
    object Payload,
    string? ResponseKey = null,
    string? ResponseValue = null,
    string? OrganizationId = null,
    bool IncludeImpersonatedActor = true);

/// <summary>Queues a built-in notification on the Genesis publisher. Best effort: never throws.</summary>
public interface IBuiltInNotificationSender
{
    /// <returns>True when the notification was handed to the publisher.</returns>
    Task<bool> SendAsync(BuiltInNotification notification);
}

/// <inheritdoc />
public sealed class BuiltInNotificationSender : IBuiltInNotificationSender
{
    private readonly INotificationPublisher _publisher;

    public BuiltInNotificationSender(INotificationPublisher publisher)
    {
        _publisher = publisher;
    }

    /// <summary>The non-empty user ids, without duplicates.</summary>
    public static List<string> Recipients(params string?[] userIds) =>
        userIds.Where(u => !string.IsNullOrWhiteSpace(u)).Select(u => u!).Distinct(StringComparer.Ordinal).ToList();

    /// <summary>
    /// The named users of a send: the given users plus, when a root user acts inside a project (impersonated),
    /// the acting user, so console users get the notification too.
    /// </summary>
    public static List<string> NamedUsers(IEnumerable<string?>? userIds, BlocksContext? context)
    {
        var named = Recipients((userIds ?? []).ToArray());
        if (context is { Impersonated: true } && !string.IsNullOrWhiteSpace(context.UserId)
            && !named.Contains(context.UserId, StringComparer.Ordinal))
        {
            named.Add(context.UserId);
        }

        return named;
    }

    public Task<bool> SendAsync(BuiltInNotification notification)
    {
        if (notification is null || string.IsNullOrWhiteSpace(notification.ConfigurationName))
            return Task.FromResult(false);

        var context = BlocksContext.GetContext();
        var organizationId = string.IsNullOrWhiteSpace(notification.OrganizationId)
            ? context?.OrganizationId
            : notification.OrganizationId;

        // Publish returns at once and never throws; who receives it is decided by the notification config.
        _publisher.Publish(new NotificationRequest
        {
            Name = notification.ConfigurationName,
            TenantId = string.IsNullOrWhiteSpace(notification.TenantId) ? null : notification.TenantId,
            NamedUserIds = NamedUsers(notification.UserIds, notification.IncludeImpersonatedActor ? context : null),
            OrganizationId = organizationId,
            Payload = notification.Payload,
            ResponseKey = notification.ResponseKey,
            ResponseValue = notification.ResponseValue
        });
        return Task.FromResult(true);
    }
}
