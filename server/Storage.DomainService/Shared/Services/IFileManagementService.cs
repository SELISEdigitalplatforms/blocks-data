using Azure.Storage.Blobs;
using Blocks.Genesis;
using DomainService.Storage;
using DomainService.Storage.Dms;
using Microsoft.AspNetCore.Mvc;
using Storage.DomainService.Storage;

namespace Storage.DomainService.Services
{
    public interface IFileManagementService
    {
        Task<GetPreSignedUrlForUploadResponse> GetPerSignedUrlForUploadAsync(GetPreSignedUrlForUploadRequest request);
        Task<FileResponse?> GetUrlForDownloadFileAsync(GetFileRequest request);
        Task<List<FileResponse>?> GetMultipleUrlsForDownloadFilesAsync(GetFilesRequest request);
        Task<BaseResponse> DeleteFileAsync(DeleteFileRequest deleteFileRequest);
        Task<LocalStorageUploadResponse> UploadFileToLocalStorageAsync(LocalStorageUploadRequest request);
        Task<DownloadFileResponse> DownloadFileFromLocalStorageAsync(DownloadFileRequest request);
        Task<GetFilesInfoResponse> GetFilesInfoAsync(GetFilesInfoRequest query);
        Task<BlobClient> GetBlobClientAsync(string tenantId);

        Task<BaseMutationResponse> UpdateFileAsync(UpdateFileRequest command);

        /// <summary>Creates the next version of an existing file and returns a presigned upload URL.</summary>
        Task<CreateFileVersionResponse> CreateFileVersionAsync(CreateFileVersionRequest request);
    }
}
