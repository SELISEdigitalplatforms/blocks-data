using Azure.Storage.Blobs;
using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using DomainService.Storage;
using DomainService.Storage.Dms;
using Microsoft.AspNetCore.Mvc;
using Storage.DomainService.Storage;
using Storage.DomainService.Storage.ZipDownload;

namespace Storage.DomainService.Services
{
    public interface IFileManagementService
    {
        Task<GetPreSignedUrlForUploadResponse> GetPerSignedUrlForUploadAsync(GetPreSignedUrlForUploadRequest request);
        Task<FileResponse?> GetUrlForDownloadFileAsync(GetFileRequest request);
        Task<List<FileResponse>?> GetMultipleUrlsForDownloadFilesAsync(GetFilesRequest request);
        Task<BaseResponse> DeleteFileAsync(DeleteFileRequest deleteFileRequest);
        /// <summary>
        /// Deletes a file as part of a directory cascade. The caller's Delete permission on
        /// the directory has already been verified, so an independently shared child must
        /// not prevent the subtree from being removed.
        /// </summary>
        Task<BaseResponse> DeleteFileForDirectoryCascadeAsync(DeleteFileRequest deleteFileRequest);
        Task<LocalStorageUploadResponse> UploadFileToLocalStorageAsync(LocalStorageUploadRequest request);
        Task<DownloadFileResponse> DownloadFileFromLocalStorageAsync(DownloadFileRequest request);
        Task<GetFilesInfoResponse> GetFilesInfoAsync(GetFilesInfoRequest query);
        Task<BlobClient> GetBlobClientAsync(string tenantId);

        Task<BaseMutationResponse> UpdateFileAsync(UpdateFileRequest command);

        /// <summary>Creates the next version of an existing file and returns a presigned upload URL.</summary>
        Task<CreateFileVersionResponse> CreateFileVersionAsync(CreateFileVersionRequest request);

        /// <summary>Verifies and promotes (or rejects) a Quarantined version. Idempotent and concurrency-safe.</summary>
        Task<CompleteUploadResponse> CompleteUploadAsync(CompleteUploadRequest request);

        /// <summary>
        /// Resolves file ids to the readable latest version of each, in input order. Files that are
        /// missing, quarantined or rejected are dropped. With <paramref name="authorize"/>, each file must also
        /// be unarchived and pass an audited Download check; without it the caller already holds the access decision.
        /// </summary>
        Task<List<ZipSourceFile>> ResolveZipSourcesAsync(IReadOnlyList<string> fileIds, bool authorize, CancellationToken cancellationToken);

        /// <summary>Opens the bytes of a resolved version, or returns null when the provider cannot supply them.</summary>
        Task<Stream?> OpenZipSourceAsync(ZipSourceFile source, StorageConfiguration configuration, CancellationToken cancellationToken);
    }
}
