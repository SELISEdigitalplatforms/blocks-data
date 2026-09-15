using Blocks.Genesis;

namespace Storage.DomainService.Utilities
{
    public static class Constants
    {
        public const string ServiceQueue = "blocks-storage-queue";

        /// <summary>Default lifetime of a generated upload URL when a configuration omits <c>UploadUrlExpirySeconds</c>.</summary>
        public const int DefaultUploadUrlExpirySeconds = 600;

        /// <summary>Default lifetime of a generated download URL when a configuration omits <c>DownloadUrlExpirySeconds</c>.</summary>
        public const int DefaultDownloadUrlExpirySeconds = 300;

        /// <summary>Default maximum accepted upload size (5 MiB) when a configuration omits <c>MaxFileSizeInBytes</c>.</summary>
        public const long DefaultMaxFileSizeInBytes = 5_242_880L;

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
