using Amazon.S3;
using Amazon.S3.Model;
using Blocks.Genesis;
using Microsoft.AspNetCore.Http;
using Storage.DomainService.Entities;
using Storage.DomainService.Utilities;
using System.Diagnostics.CodeAnalysis;

namespace DomainService.Storage
{
    [ExcludeFromCodeCoverage]
    public class AwsS3StorageService : IStorageService
    {
        /// <summary>S3 bucket names are lowercase, 3-63 chars; leaves room for the "-quarantine" suffix.</summary>
        private const int MaxTenantSegmentLength = 63 - 11;

        protected readonly AmazonS3Client _s3Client;
        protected readonly string _bucketName;

        /// <summary>Private bucket backing `Public/Quarantine/...`, `Private/Quarantine/...`, and `Verification/...` candidate keys.</summary>
        protected readonly string _quarantineBucketName;

        public AwsS3StorageService()
        {
            var accessKey = StorageProvider.AccessKey;
            var secretKey = StorageProvider.SecretKey;
            var region = StorageProvider.Region;
            _bucketName = BlocksContext.GetContext()?.TenantId ?? string.Empty;
            _quarantineBucketName = GetQuarantineBucketName(_bucketName);

            _s3Client = new AmazonS3Client(accessKey, secretKey, Amazon.RegionEndpoint.GetBySystemName(region));

            EnsureBucketExistsAsync(_bucketName).GetAwaiter().GetResult();
            EnsureBucketExistsAsync(_quarantineBucketName).GetAwaiter().GetResult();
        }

        protected internal AwsS3StorageService(AmazonS3Client s3Client)
        {
            _s3Client = s3Client;
            _bucketName = BlocksContext.GetContext()?.TenantId.ToLower() ?? string.Empty;
            _quarantineBucketName = GetQuarantineBucketName(_bucketName);

            EnsureBucketExistsAsync(_bucketName).GetAwaiter().GetResult();
            EnsureBucketExistsAsync(_quarantineBucketName).GetAwaiter().GetResult();
        }

        private static string GetQuarantineBucketName(string bucketName)
        {
            // Sanitized independently of the primary bucket's own name, which is left exactly as it is
            // today for existing tenants; only this new derived name needs to be a valid S3 bucket name
            // regardless of what characters happen to be in the tenant id.
            var sanitized = StorageKeySanitizer.SanitizeTenantSegment(bucketName);
            var trimmed = sanitized.Length > MaxTenantSegmentLength ? sanitized[..MaxTenantSegmentLength] : sanitized;

            return $"{trimmed}-quarantine";
        }

        public async Task<Stream?> DownloadFileAsync(string fileName, string? projectKey = null, string? itemId = null, string? versionId = null)
        {
            try
            {
                var response = await _s3Client.GetObjectAsync(_bucketName, fileName);
                return response.ResponseStream;
            }
            catch (AmazonS3Exception)
            {
                return null;
            }
        }

        public async Task<IEnumerable<string>> ListFilesAsync()
        {
            var request = new ListObjectsV2Request { BucketName = _bucketName };
            var response = await _s3Client.ListObjectsV2Async(request);
            return response.S3Objects.Select(o => o.Key).ToList();
        }

        public async Task<bool> DeleteFileAsync(string fileInfo)
        {
            await _s3Client.DeleteObjectAsync(_bucketName, fileInfo);
            return true;
        }


        public string GeneratePreSignedUploadUrlAsync(string fileName, TimeSpan expiry)
        {
            var request = new GetPreSignedUrlRequest
            {
                BucketName = _bucketName,
                Key = fileName,
                Expires = DateTime.UtcNow.Add(expiry),
                Verb = HttpVerb.PUT // Specifies that this is a PUT request for upload
            };
            return _s3Client.GetPreSignedURL(request);
        }

        public async Task<SignedDownloadUrl?> GetDownloadUrlAsync(DownloadUrlRequest request)
        {
            // S3 has no equivalent of Azure's anonymous-container bypass in this codebase - every
            // presigned GET, Public file or not, really does expire when Expires elapses.
            var expiresAtUtc = DateTime.UtcNow.Add(request.ExpiryDuration);
            var finalRequest = new GetPreSignedUrlRequest
            {
                BucketName = _bucketName,
                Key = request.FileName,
                Expires = expiresAtUtc,
                Verb = HttpVerb.GET // Specifies that this is a GET request
            };

            var url = await _s3Client.GetPreSignedURLAsync(finalRequest);
            return new SignedDownloadUrl { Url = url, ExpiresAtUtc = expiresAtUtc };
        }

        public Task<bool> UploadFileToSftpAsync(string fileName, string projectKey, string itemId, string versionId, IFormFile file)
        {
            throw new NotImplementedException();
        }

        /// <summary>
        /// Ensures the named bucket exists, creating it if necessary.
        /// </summary>
        protected virtual async Task EnsureBucketExistsAsync(string bucketName)
        {
            if (string.IsNullOrWhiteSpace(bucketName))
                return;

            try
            {
                // Check if bucket exists
                await _s3Client.GetBucketLocationAsync(bucketName);
            }
            catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                // Bucket doesn't exist, create it
                var putBucketRequest = new PutBucketRequest
                {
                    BucketName = bucketName,
                    UseClientRegion = true
                };
                await _s3Client.PutBucketAsync(putBucketRequest);
            }
        }

        #region Phase1UploadSecurity

        public Dictionary<string, string> GetRequiredUploadHeaders(string? contentType) => new();

        public string GenerateQuarantineUploadUrl(string key, TimeSpan expiry)
        {
            var request = new GetPreSignedUrlRequest
            {
                BucketName = _quarantineBucketName,
                Key = key,
                Expires = DateTime.UtcNow.Add(expiry),
                Verb = HttpVerb.PUT
            };
            return _s3Client.GetPreSignedURL(request);
        }

        public async Task<string?> CopyToVerificationCandidateAsync(string quarantineKey, string candidateKey)
        {
            if (!await ObjectExistsAsync(_quarantineBucketName, quarantineKey))
                return null;

            await _s3Client.CopyObjectAsync(new CopyObjectRequest
            {
                SourceBucket = _quarantineBucketName,
                SourceKey = quarantineKey,
                DestinationBucket = _quarantineBucketName,
                DestinationKey = candidateKey
            });

            return candidateKey;
        }

        public async Task<StorageObjectMetadata?> GetCandidateMetadataAsync(string candidateKey)
        {
            try
            {
                var response = await _s3Client.GetObjectMetadataAsync(_quarantineBucketName, candidateKey);

                var etag = response.ETag?.Trim('"');

                return new StorageObjectMetadata
                {
                    SizeInBytes = response.ContentLength,
                    ContentType = response.Headers.ContentType,
                    // A multipart upload's ETag is not an MD5 of the object (it is "<hash>-<partCount>"),
                    // so only a plain ETag is usable as a checksum.
                    Checksum = string.IsNullOrEmpty(etag) || etag.Contains('-') ? null : etag
                };
            }
            catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return null;
            }
        }

        public async Task<byte[]> ReadCandidateInitialBytesAsync(string candidateKey, int byteCount)
        {
            var request = new GetObjectRequest
            {
                BucketName = _quarantineBucketName,
                Key = candidateKey,
                ByteRange = new ByteRange(0, byteCount - 1)
            };

            using var response = await _s3Client.GetObjectAsync(request);
            using var buffer = new MemoryStream();
            await response.ResponseStream.CopyToAsync(buffer);

            return buffer.ToArray();
        }

        public async Task<Stream> OpenCandidateReadStreamAsync(string candidateKey)
        {
            var response = await _s3Client.GetObjectAsync(_quarantineBucketName, candidateKey);
            return response.ResponseStream;
        }

        public async Task PromoteCandidateToFinalAsync(string candidateKey, string finalKey)
        {
            await _s3Client.CopyObjectAsync(new CopyObjectRequest
            {
                SourceBucket = _quarantineBucketName,
                SourceKey = candidateKey,
                DestinationBucket = _bucketName,
                DestinationKey = finalKey
            });
        }

        private async Task<bool> ObjectExistsAsync(string bucketName, string key)
        {
            try
            {
                await _s3Client.GetObjectMetadataAsync(bucketName, key);
                return true;
            }
            catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return false;
            }
        }

        #endregion
    }
}
