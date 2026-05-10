using Blocks.Genesis;

namespace DataGateway.DomainService.Models.Constants;

public static class GraphQlConstant
{
    public const string ApiServiceName = "blocks-uds-api";
    public const string WorkerServiceName = "blocks-uds-worker";
    public const string DataGatewayQueueName = "blocks_uds_import_export_listener";
	public const string DataGatewayInitiateQueueName = "blocks_uds_pipeline_initiate_listener";
	public const string StorageQueueName = "blocks_storage_listener";
    public const string MigrationCompletionTopic = "migration_topic";
    public const string DataChangeTriggerQueue = "blocks_workflow_data_trigger_listener";
    public const string BlocksRootDbName = "BlocksRootDb";
    public const string MOCK_DATA_TAG = "mock-data";

    public const string HardDeleteFieldName = "isHardDelete";
    public const string FilterFieldName = "filter";
    public const string WhereFieldName = "where";
    public const string OrderFieldName = "order";
    public const string InputFieldName = "input";
    public const string PagingFieldName = "paging";
    public const string DbEntityIdFieldName = "_id";

    public const string OwnerPermission = "OWNER";
    public const string CheckForOwnerContextKey = "CheckForOwner";

    public const string GraphQLPath = "gateway";
    public const string BlocksKeyHeaderKey = "x-blocks-key";
    public const string UnauthorizedErrorCode = "AUTH_NOT_AUTHENTICATED";
    public const string ValidationErrorErrorCode = "VALIDATION_ERROR";
    public static string TenantId { get; private set; } = string.Empty;
    public static string TenantSlug { get; private set; } = string.Empty;
    private const string DefaultProvider = "azure";
    private const string RabbitMqProvider = "rabbitmq";

    public const int MaxNestedLevelIterationLimit = 3;

    public static void SetAsTenantId(this string tenantId)
    {
        TenantId = tenantId;
    }
    public static void SetTenantInformation(string tenantId, string tenantSlug)
    {
        TenantId = tenantId;
        TenantSlug = tenantSlug;
    }

    public static MessageConfiguration GetMessageConfiguration(string messageConnectionString)
    {
        var provider = GetProvider(messageConnectionString);

        return provider switch
        {
            RabbitMqProvider => CreateRabbitMqConfiguration(),
            _ => CreateAzureServiceBusConfiguration()
        };
    }

    private static string GetProvider(string messageConnectionString)
    {
        if (Uri.TryCreate(messageConnectionString, UriKind.Absolute, out var uri) &&
            (uri.Scheme.Equals("amqp", StringComparison.OrdinalIgnoreCase) ||
             uri.Scheme.Equals("amqps", StringComparison.OrdinalIgnoreCase)))
        {
            return RabbitMqProvider;
        }

        return DefaultProvider;
    }

    private static MessageConfiguration CreateRabbitMqConfiguration()
    {
        return new MessageConfiguration
        {
            RabbitMqConfiguration = new RabbitMqConfiguration
            {
                ConsumerSubscriptions = [ConsumerSubscription.BindToQueue(DataGatewayQueueName),
                                         ConsumerSubscription.BindToQueue(StorageQueueName)],
            }
        };
    }

    private static MessageConfiguration CreateAzureServiceBusConfiguration()
    {
        return new MessageConfiguration
        {
            AzureServiceBusConfiguration = new AzureServiceBusConfiguration
            {
                Queues = [DataGatewayQueueName, StorageQueueName],
            }
        };
    }
}
