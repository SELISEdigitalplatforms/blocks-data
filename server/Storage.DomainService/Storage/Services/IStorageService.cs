using Microsoft.AspNetCore.Http;
using Storage.DomainService.Entities;

namespace DomainService.Storage
{
    public interface IStorageService
    {
        Task<IEnumerable<string>> ListFilesAsync();
        Task<bool> DeleteFileAsync(string fileInfo);
        string GeneratePreSignedUploadUrlAsync(string fileName, TimeSpan expiry);
        Task<string?> GetDownloadUrlAsync(DownloadUrlRequest request);
        Task<Stream?> DownloadFileAsync(string fileName, string? projectKey = null,  string? itemId = null, string? versionId = null);
        Task<bool> UploadFileToSftpAsync(string fileName, string projectKey, string itemId, string versionId, IFormFile file);
    }
}
