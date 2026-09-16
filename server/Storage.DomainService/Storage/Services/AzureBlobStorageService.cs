using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs;
using DomainService.Configuration;
using Blocks.Genesis;
using Azure.Storage.Sas;
using Microsoft.AspNetCore.Http;
using Storage.DomainService.Utilities;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using System.Diagnostics.CodeAnalysis;

namespace DomainService.Storage
{
    [ExcludeFromCodeCoverage]
    public class AzureBlobStorageService : IStorageService
    {
        /// <summary>Azure container names are lowercase, 3-63 chars; leaves room for the "-quarantine" suffix.</summary>
        private const int MaxTenantSegmentLength = 63 - 11;

        /// <summary>Lifetime of the server-generated, never-client-visible SAS used to authorize a same-account copy off a private container.</summary>
        private static readonly TimeSpan InternalCopySasExpiry = TimeSpan.FromMinutes(5);

        private readonly BlobContainerClient _containerClient;

        /// <summary>Private container backing `Public/Quarantine/...`, `Private/Quarantine/...`, and `Verification/...` candidate keys. Never created with public access.</summary>
        private readonly BlobContainerClient _quarantineContainerClient;

        public AzureBlobStorageService(IConfigurationRepository configurationRepository)
        {
            var blobServiceClient = new BlobServiceClient(StorageProvider.ConnectionString);
            var tenantSegment = BlocksContext.GetContext()?.TenantId.ToLower();

            _containerClient = blobServiceClient.GetBlobContainerClient(tenantSegment);
            _containerClient.CreateIfNotExists(PublicAccessType.Blob);

            _quarantineContainerClient = blobServiceClient.GetBlobContainerClient(GetQuarantineContainerName(tenantSegment));
            _quarantineContainerClient.CreateIfNotExists(PublicAccessType.None);
        }

        private static string GetQuarantineContainerName(string? tenantSegment)
        {
            // Sanitized independently of the primary container's own name, which is left exactly as it
            // is today for existing tenants; only this new derived name needs to be a valid Azure
            // container name regardless of what characters happen to be in the tenant id.
            var sanitized = StorageKeySanitizer.SanitizeTenantSegment(tenantSegment);
            var trimmed = sanitized.Length > MaxTenantSegmentLength ? sanitized[..MaxTenantSegmentLength] : sanitized;

            return $"{trimmed}-quarantine";
        }

        public async Task<Stream?> DownloadFileAsync(string fileName, string? projectKey = null, string? itemId = null, string? versionId = null)
        {
            var blobClient = _containerClient.GetBlobClient(fileName);

            if (await blobClient.ExistsAsync())
            {
                var response = await blobClient.DownloadAsync();
                return response.Value.Content;
            }
            return null;
        }

        public async Task<SignedDownloadUrl?> GetDownloadUrlAsync(DownloadUrlRequest request)
        {
            var blobClient = _containerClient.GetBlobClient(request.FileName);

            if (await blobClient.ExistsAsync())
            {
                var expiresAtUtc = DateTimeOffset.UtcNow.Add(request.ExpiryDuration);
                var sasBuilder = new BlobSasBuilder
                {
                    BlobContainerName = _containerClient.Name,
                    BlobName = request.FileName,
                    Resource = "b",
                    ExpiresOn = expiresAtUtc
                };

                sasBuilder.SetPermissions(BlobContainerSasPermissions.Read);

                var sasUri = blobClient.GenerateSasUri(sasBuilder).ToString();
                var isAnonymousPublicUrl = request.AccessModifier == AccessModifier.Public;

                return new SignedDownloadUrl
                {
                    Url = isAnonymousPublicUrl ? StripSasQuery(sasUri) : sasUri,
                    // The Public case strips the SAS token entirely and relies on the container's own
                    // anonymous blob access, so this URL has no meaningful expiry of its own.
                    ExpiresAtUtc = isAnonymousPublicUrl ? null : expiresAtUtc.UtcDateTime
                };
            }
            return null;
        }

        private static string StripSasQuery(string sasUri) => sasUri.Substring(0, sasUri.IndexOf('?'));

        public async Task<IEnumerable<string>> ListFilesAsync()
        {
            var files = new List<string>();

            await foreach (var blob in _containerClient.GetBlobsAsync())
            {
                files.Add(blob.Name);
            }
            return files;
        }

        public async Task<bool> DeleteFileAsync(string fileInfo)
        {
            var blobClient = _containerClient.GetBlobClient(fileInfo);
            await blobClient.DeleteIfExistsAsync();
            return true;
        }

        public string GeneratePreSignedUploadUrlAsync(string fileName, TimeSpan expiry)
        {
            var blobClient = _containerClient.GetBlobClient(fileName);

            var sasBuilder = new BlobSasBuilder
            {
                BlobContainerName = _containerClient.Name,
                BlobName = fileName,
                Resource = "b",
                ExpiresOn = DateTimeOffset.UtcNow.Add(expiry)
            };

            sasBuilder.SetPermissions(BlobSasPermissions.Write);

            return blobClient.GenerateSasUri(sasBuilder).ToString();
        }

        public Task<bool> UploadFileToSftpAsync(string fileName, string projectKey, string itemId, string versionId, IFormFile file)
        {
            throw new NotImplementedException();
        }

        #region Phase1UploadSecurity

        public Dictionary<string, string> GetRequiredUploadHeaders(string? contentType) =>
            new() { ["x-ms-blob-type"] = "BlockBlob" };

        public string GenerateQuarantineUploadUrl(string key, TimeSpan expiry)
        {
            var blobClient = _quarantineContainerClient.GetBlobClient(key);

            var sasBuilder = new BlobSasBuilder
            {
                BlobContainerName = _quarantineContainerClient.Name,
                BlobName = key,
                Resource = "b",
                ExpiresOn = DateTimeOffset.UtcNow.Add(expiry)
            };

            sasBuilder.SetPermissions(BlobSasPermissions.Write);

            return blobClient.GenerateSasUri(sasBuilder).ToString();
        }

        public async Task<string?> CopyToVerificationCandidateAsync(string quarantineKey, string candidateKey)
        {
            var source = _quarantineContainerClient.GetBlobClient(quarantineKey);

            if (!await source.ExistsAsync())
                return null;

            var destination = _quarantineContainerClient.GetBlobClient(candidateKey);
            await destination.SyncCopyFromUriAsync(GenerateInternalReadSasUri(source));

            return candidateKey;
        }

        public async Task<StorageObjectMetadata?> GetCandidateMetadataAsync(string candidateKey)
        {
            var blobClient = _quarantineContainerClient.GetBlobClient(candidateKey);

            if (!await blobClient.ExistsAsync())
                return null;

            var properties = await blobClient.GetPropertiesAsync();

            return new StorageObjectMetadata
            {
                SizeInBytes = properties.Value.ContentLength,
                ContentType = properties.Value.ContentType,
                // Hex-encoded so it is directly comparable to an S3 ETag and to a client-declared MD5,
                // both of which this codebase treats as hex - Azure's SDK otherwise exposes it as bytes.
                Checksum = properties.Value.ContentHash is { Length: > 0 } hash ? Convert.ToHexString(hash) : null
            };
        }

        public async Task<byte[]> ReadCandidateInitialBytesAsync(string candidateKey, int byteCount)
        {
            var blobClient = _quarantineContainerClient.GetBlobClient(candidateKey);
            var response = await blobClient.DownloadStreamingAsync(new BlobDownloadOptions { Range = new Azure.HttpRange(0, byteCount) });

            using var buffer = new MemoryStream();
            await response.Value.Content.CopyToAsync(buffer);

            return buffer.ToArray();
        }

        public async Task<Stream> OpenCandidateReadStreamAsync(string candidateKey)
        {
            var blobClient = _quarantineContainerClient.GetBlobClient(candidateKey);
            var response = await blobClient.DownloadStreamingAsync();

            return response.Value.Content;
        }

        public async Task PromoteCandidateToFinalAsync(string candidateKey, string finalKey)
        {
            var source = _quarantineContainerClient.GetBlobClient(candidateKey);
            var destination = _containerClient.GetBlobClient(finalKey);

            await destination.SyncCopyFromUriAsync(GenerateInternalReadSasUri(source));
        }

        /// <summary>
        /// Short-lived, server-only read SAS authorizing a same-account copy off the private quarantine
        /// container. Never returned to a caller.
        /// </summary>
        private static Uri GenerateInternalReadSasUri(BlobClient source)
        {
            var sasBuilder = new BlobSasBuilder
            {
                BlobContainerName = source.BlobContainerName,
                BlobName = source.Name,
                Resource = "b",
                ExpiresOn = DateTimeOffset.UtcNow.Add(InternalCopySasExpiry)
            };

            sasBuilder.SetPermissions(BlobSasPermissions.Read);

            return source.GenerateSasUri(sasBuilder);
        }

        #endregion
    }
}
