using Blocks.Genesis;

namespace Storage.DomainService.Utilities
{
    public static class Constants
    {
        public const string ServiceQueue = "blocks-storage-queue";

        public static MessageConfiguration GetMessageConfiguration()
        {
            return new MessageConfiguration
            {
                AzureServiceBusConfiguration = new AzureServiceBusConfiguration
                {
                    Queues = [ServiceQueue],
                    Topics = []
                }
            };
        }

        public const string ApiServiceName = "blocks-storage-api";
        public const string WorkerServiceName = "blocks-storage-worker";
        public const string DefaultConfigurationName = "Default";
        public const string CertificateCollectionName = "certificates";
        public const string StorageTopicName = "blocks-storage-topic";
        public const string StorageQueueName = "blocks_storage_listener";

    }
}
