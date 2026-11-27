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

        /// <summary>
        /// Azure-only: a client for a blob of the shared <c>certificates</c> container, built from the Default
        /// configuration's connection string, so it fails on an S3 or SFTP configuration.
        /// </summary>
        [Obsolete("Use UploadPublicObjectAsync and OpenReadAsync, which work on every storage provider that has public read. GetBlobClientAsync returns an Azure type and needs an Azure configuration.")]
        Task<BlobClient> GetBlobClientAsync(string tenantId);

        /// <summary>
        /// Stores an object in a named container with public read, using the tenant's Default storage configuration,
        /// and returns its permanent public URL: readable without credentials, with no expiry. Public read is set per
        /// provider (the container's access level on Azure, a bucket policy on that one bucket on S3), and an existing
        /// object at the key is replaced.
        /// </summary>
        /// <param name="container">The container (Azure) or bucket (S3), shared across tenants when the caller wants that. Lowercase letters, digits and hyphens, 3 to 63 characters.</param>
        /// <param name="key">The object's key in the container.</param>
        /// <param name="content">The bytes to store.</param>
        /// <param name="contentType">The media type served with the object; <c>application/octet-stream</c> when blank.</param>
        /// <returns>The object's public URL.</returns>
        /// <exception cref="PublicObjectStorageException">The container or key is not valid, the tenant has no Default configuration, the provider has no public read (SFTP: <see cref="PublicObjectStorageException.NotSupportedCode"/>), or the provider refused. <see cref="PublicObjectStorageException.ErrorCode"/> carries the provider's code.</exception>
        Task<string> UploadPublicObjectAsync(string container, string key, Stream content, string contentType);

        /// <summary>
        /// Opens an object of a named container with the service's own credentials, or returns null when it does not
        /// exist. The caller disposes the stream.
        /// </summary>
        /// <exception cref="PublicObjectStorageException">As for <see cref="UploadPublicObjectAsync"/>.</exception>
        Task<Stream?> OpenReadAsync(string container, string key);

        /// <summary>
        /// Verifies and promotes (or rejects) a Quarantined upload. Idempotent and concurrency-safe.
        /// </summary>
        /// <param name="request">The request identifying the file and version to complete.</param>
        /// <returns>A response with the resulting verification status.</returns>
        Task<CompleteUploadResponse> CompleteUploadAsync(CompleteUploadRequest request);
    }
}
