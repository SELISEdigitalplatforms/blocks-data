using Azure.Storage.Blobs;
using Blocks.Genesis;
using DomainService.Storage;
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

        Task<string> UploadPublicCertificateAsync(UploadCertificateRequest request);
        Task<BaseMutationResponse> UpdateFileAsync(UpdateFileRequest command);
        Task<GetDmsFileAndFolderResponse> GetDmsFileAndFolder(GetDmsFileAndFolderRequest command);
        Task<DmsResponse> UploadFilesAsync(UploadFilesRequest command);
        Task<DmsResponse> CreateFolderAsync(CreateFolderRequest command);
        Task<BaseResponse> DeleteFolderAsync(DeleteFolderRequest deleteFolderRequest);
    }
}
