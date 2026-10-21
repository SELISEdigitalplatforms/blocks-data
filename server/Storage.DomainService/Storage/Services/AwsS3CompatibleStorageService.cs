using Amazon;
using Amazon.S3;
using Blocks.Genesis.Entities.Data;
using System.Diagnostics.CodeAnalysis;

namespace DomainService.Storage
{
    [ExcludeFromCodeCoverage]
    public class AwsS3CompatibleStorageService : AwsS3StorageService
    {
        public AwsS3CompatibleStorageService(StorageConfiguration configuration)
            : base(CreateS3Client(configuration))
        {
        }

        private static AmazonS3Client CreateS3Client(StorageConfiguration configuration)
        {
            // Force Signature Version 4 for MinIO/S3-compatible storage
            AWSConfigsS3.UseSignatureVersion4 = true;

            var s3Config = new AmazonS3Config
            {
                ServiceURL = configuration.Host, // e.g., https://s3.minio.seliseblocks.com (S3 compatible API endpoint)
                ForcePathStyle = true
            };
            var accessKey = configuration.AccessKey;
            var secretKey = configuration.SecretKey;

            return new AmazonS3Client(accessKey, secretKey, s3Config);
        }
    }
}
