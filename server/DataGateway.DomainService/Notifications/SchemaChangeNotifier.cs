using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Notifications;

/// <summary>Tells the people who own a schema that someone else changed it.</summary>
public interface ISchemaChangeNotifier
{
    /// <summary>Sends <c>data-schema-changed</c> to the schema's creator and last editor, not to the actor. Never throws.</summary>
    Task NotifyChangedAsync(SchemaDefinition schema, SchemaChangeType changeType);
}

/// <inheritdoc />
public sealed class SchemaChangeNotifier : ISchemaChangeNotifier
{
    public const string ChangedName = "data-schema-changed";

    private readonly IBuiltInNotificationSender _sender;
    private readonly ILogger<SchemaChangeNotifier> _logger;

    public SchemaChangeNotifier(IBuiltInNotificationSender sender, ILogger<SchemaChangeNotifier> logger)
    {
        _sender = sender;
        _logger = logger;
    }

    /// <summary>The wire name of a change type, e.g. <c>fields-saved</c>.</summary>
    public static string KindName(SchemaChangeType changeType) => changeType switch
    {
        SchemaChangeType.SchemaCreate => "created",
        SchemaChangeType.SchemaUpdate => "updated",
        SchemaChangeType.SchemaDelete => "deleted",
        SchemaChangeType.SchemaFieldUpdate => "fields-saved",
        SchemaChangeType.SchemaIndexCreate => "index-created",
        SchemaChangeType.SchemaIndexDelete => "index-deleted",
        _ => "updated"
    };

    public async Task NotifyChangedAsync(SchemaDefinition schema, SchemaChangeType changeType)
    {
        try
        {
            var context = BlocksContext.GetContext();
            var actorId = context?.UserId ?? string.Empty;
            var recipients = BuiltInNotificationSender.Recipients(schema.CreatedBy, schema.LastUpdatedBy);
            recipients.RemoveAll(u => string.Equals(u, actorId, StringComparison.Ordinal) || u == "system");
            if (recipients.Count == 0) return;

            var kindName = KindName(changeType);
            await _sender.SendAsync(new BuiltInNotification(
                context?.TenantId ?? string.Empty,
                ChangedName,
                recipients,
                new
                {
                    @event = ChangedName,
                    title = "Schema changed",
                    description = $"Schema {schema.SchemaName} was changed ({kindName}).",
                    isSuccess = true,
                    schemaName = schema.SchemaName,
                    changeKind = kindName,
                    occurredAt = DateTime.UtcNow
                },
                OrganizationId: context?.OrganizationId,
                IncludeImpersonatedActor: false));
        }
        catch (Exception ex)
        {
            // The schema change has succeeded; a notification problem must not turn it into a failure.
            _logger.LogWarning("Notification {ConfigurationName} could not be prepared, error={ErrorType}", ChangedName, ex.GetType().Name);
        }
    }
}
