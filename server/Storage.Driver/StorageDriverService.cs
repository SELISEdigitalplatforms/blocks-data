using Azure.Storage.Blobs;
using Blocks.Genesis;
using DomainService.Storage;
using Storage.DomainService.Services;

namespace StorageDriver
{
    public class StorageDriverService : IStorageDriverService
    {
        private readonly IFileManagementService _fileManagementService;

        public StorageDriverService(IFileManagementService fileManagementService)
        {
            _fileManagementService = fileManagementService;
        }

        public async Task<GetPreSignedUrlForUploadResponse> GetPerSignedUrlForUploadAsync(GetPreSignedUrlForUploadRequest request)
        {
            return await _fileManagementService.GetPerSignedUrlForUploadAsync(request);
        }

        public async Task<FileResponse?> GetUrlForDownloadFileAsync(GetFileRequest request)
        {
            return await _fileManagementService.GetUrlForDownloadFileAsync(request);
        }

        public async Task<BaseResponse> DeleteFileAsync(DeleteFileRequest deleteFileRequest)
        {
            return await _fileManagementService.DeleteFileAsync(deleteFileRequest);
        }

        public async Task<List<FileResponse>?> GetMultipleUrlsForDownloadFileAsync(GetFilesRequest request)
        {
            return await _fileManagementService.GetMultipleUrlsForDownloadFilesAsync(request);
        }

        public Task<LocalStorageUploadResponse> UploadFileToLocalStorageAsync(LocalStorageUploadRequest request)
        {
            return _fileManagementService.UploadFileToLocalStorageAsync(request);
        }

        public async Task<BlobClient> GetBlobClientAsync(string tenantId)
        {
            return await _fileManagementService.GetBlobClientAsync(tenantId);
        }
    }
}
