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
        private readonly BlobContainerClient _containerClient;

        public AzureBlobStorageService(IConfigurationRepository configurationRepository)
        {
            var blobServiceClient = new BlobServiceClient(StorageProvider.ConnectionString);
            _containerClient = blobServiceClient.GetBlobContainerClient(BlocksContext.GetContext()?.TenantId.ToLower());

            _containerClient.CreateIfNotExists(PublicAccessType.Blob);
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

        public async Task<string?> GetDownloadUrlAsync(DownloadUrlRequest request)
        {
            var blobClient = _containerClient.GetBlobClient(request.FileName);

            if (await blobClient.ExistsAsync())
            {

                var sasBuilder = new BlobSasBuilder
                {
                    BlobContainerName = _containerClient.Name,
                    BlobName = request.FileName,
                    Resource = "b",
                    ExpiresOn = DateTimeOffset.UtcNow.Add(request.ExpiryDuration)
                };

                sasBuilder.SetPermissions(BlobContainerSasPermissions.Read);

                return GenerateDownloadUriByAccessType(blobClient.GenerateSasUri(sasBuilder).ToString(), request.AccessModifier);
            }
            return null;
        }

        private static string GenerateDownloadUriByAccessType(string sasUri, AccessModifier accessModifier)
        {
            if (accessModifier == AccessModifier.Public)
                return sasUri.Substring(0, sasUri.IndexOf('?'));

            return sasUri;
        }

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
    }
}
