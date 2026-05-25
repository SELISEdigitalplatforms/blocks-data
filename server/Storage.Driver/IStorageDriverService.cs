using Azure.Storage.Blobs;
using Blocks.Genesis;
using DomainService.Storage;

namespace StorageDriver
{
    /// <summary>
    /// Defines operations for managing storage-related functionalities, including uploading, downloading, and deleting files.
    /// </summary>
    public interface IStorageDriverService
    {

        /// <summary>
        /// Generates a pre-signed URL for uploading a file.
        /// </summary>
        /// <param name="request">The request object containing upload details.</param>
        /// <returns>A response containing the pre-signed URL.</returns>
        Task<GetPreSignedUrlForUploadResponse> GetPerSignedUrlForUploadAsync(GetPreSignedUrlForUploadRequest request);

        /// <summary>
        /// Retrieves the download URL for a specified file.
        /// </summary>
        /// <param name="request">The request object containing file details.</param>
        /// <returns>A response containing the file's download URL or null if not found.</returns>
        Task<FileResponse?> GetUrlForDownloadFileAsync(GetFileRequest request);

        /// <summary>
        /// Deletes a file from the storage.
        /// </summary>
        /// <param name="deleteFileRequest">The request object containing file deletion details.</param>
        /// <returns>A response indicating the result of the delete operation.</returns>
        Task<BaseResponse> DeleteFileAsync(DeleteFileRequest deleteFileRequest);

        /// <summary>
        /// Retrieves multiple files for download based on the provided request.
        /// </summary>
        /// <param name="request">The request containing file details.</param>
        /// <returns>A response containing the file details or null if not found.</returns>
        Task<List<FileResponse>?> GetMultipleUrlsForDownloadFileAsync(GetFilesRequest request);

        /// <summary>
        /// Uploads a file to local storage.
        /// </summary>
        /// <param name="request">The request containing the file stream and metadata for the upload.</param>
        /// <returns>A response containing the details of the uploaded file.</returns>
        Task<LocalStorageUploadResponse> UploadFileToLocalStorageAsync(LocalStorageUploadRequest request);

        Task<BlobClient> GetBlobClientAsync(string tenantId);
    }
}
