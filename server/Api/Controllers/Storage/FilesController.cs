using Blocks.Genesis;
using DomainService.Storage;
using DomainService.Storage.Dms;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;

namespace Api.Controllers
{
    /// <summary>
    /// Controller for managing file-related operations such as downloading, uploading, and deleting files.
    /// </summary>
    [ApiController]
    [Route("[controller]/[action]")]
    public class FilesController : ControllerBase
    {
        private readonly IFileManagementService _fileManagementService;
        private readonly IContentFileService _contentFileService;

        /// <summary>
        /// Initializes a new instance of the <see cref="FilesController"/> class.
        /// </summary>
        /// <param name="fileManagementService">Service for managing file operations.</param>
        /// <param name="contentFileService">Service for file version, move and copy operations.</param>
        public FilesController(IFileManagementService fileManagementService, IContentFileService contentFileService)
        {
            _fileManagementService = fileManagementService;
            _contentFileService = contentFileService;
        }

        /// <summary>
        /// Retrieves a file for download based on the provided request.
        /// </summary>
        /// <param name="request">The request containing file details.</param>
        /// <returns>A response containing the file details or null if not found.</returns>
        [HttpGet]
        [ProtectedEndPoint("blocks-data::get-file")]
        public async Task<FileResponse?> GetFile([FromQuery] GetFileRequest request)
        {
            return await _fileManagementService.GetUrlForDownloadFileAsync(request);
        }

        /// <summary>
        /// Retrieves multiple files for download based on the provided request.
        /// </summary>
        /// <param name="request">The request containing file details.</param>
        /// <returns>A response containing the file details or null if not found.</returns>
        [HttpPost]
        [ProtectedEndPoint("blocks-data::get-files")]
        public async Task<List<FileResponse>?> GetFiles([FromBody] GetFilesRequest request)
        {
            return await _fileManagementService.GetMultipleUrlsForDownloadFilesAsync(request);
        }

        /// <summary>
        /// Retrieves multiple files Information.
        /// </summary>
        /// <param name="request">The request containing file details.</param>
        /// <returns>A response containing the file details or null if not found.</returns>
        [HttpPost]
        [ProtectedEndPoint("blocks-data::get-files-info")]
        public async Task<GetFilesInfoResponse> GetFilesInfo([FromBody] GetFilesInfoRequest request)
        {
            return await _fileManagementService.GetFilesInfoAsync(request);
        }

        /// <summary>
        /// Generates a pre-signed URL for uploading a file.
        /// </summary>
        /// <param name="request">The request containing upload details.</param>
        /// <returns>A response containing the pre-signed URL for upload.</returns>
        [HttpPost]
        [ProtectedEndPoint("blocks-data::get-pre-signed-url-for-upload")]
        public async Task<GetPreSignedUrlForUploadResponse> GetPreSignedUrlForUpload([FromBody] GetPreSignedUrlForUploadRequest request)
        {
            return await _fileManagementService.GetPerSignedUrlForUploadAsync(request);
        }

        /// <summary>
        /// Deletes a file based on the provided request.
        /// </summary>
        /// <param name="request">The request containing file deletion details.</param>
        /// <returns>A response indicating the result of the delete operation.</returns>
        [HttpPost]
        [ProtectedEndPoint("blocks-data::delete-file")]
        public async Task<BaseResponse> DeleteFile([FromBody] DeleteFileRequest request)
        {
            return await _fileManagementService.DeleteFileAsync(request);
        }

        /// <summary>
        /// Uploads a file to local storage.
        /// </summary>
        /// <param name="request">The request containing the file stream and metadata for the upload.</param>
        /// <returns>A response containing the details of the uploaded file.</returns>
        [HttpPost]
        [ProtectedEndPoint("blocks-data::upload-file-to-local-storage")]
        public async Task<LocalStorageUploadResponse> UploadFileToLocalStorage([FromForm] LocalStorageUploadRequest request)
        {
            return await _fileManagementService.UploadFileToLocalStorageAsync(request);
        }

        /// <summary>
        /// Downloads a file from local storage based on the provided request. (This endpoint is for internal use only!)
        /// </summary>
        /// <param name="request">The request containing file download details.</param>
        /// <returns>A response containing the file stream and metadata of the downloaded file.</returns>
        [ApiExplorerSettings(IgnoreApi = true)]
        [HttpGet]
        [ProtectedEndPoint("blocks-data::download-file")]
        public async Task<IActionResult> DownloadFile([FromQuery] DownloadFileRequest request)
        {
            var fileResponse = await _fileManagementService.DownloadFileFromLocalStorageAsync(request);

            if (fileResponse.FileStream == null)
            {
                return NotFound(fileResponse.Errors);
            }

            return File(fileResponse.FileStream, "application/octet-stream", fileResponse.FileName);
        }

        [HttpPost]
        [ProtectedEndPoint("blocks-data::update-file-additional-info")]
        public async Task<IActionResult> UpdateFileAdditionalInfo([FromBody] UpdateFileRequest command)
        {
            if (command == null) return BadRequest();
            var result = await _fileManagementService.UpdateFileAsync(command);
            return result.IsSuccess ? Ok(result) : BadRequest(result);
        }

        // Deprecated: use /Files/UpdateFileAdditionalInfo. Kept so the leaked camelCase URL keeps working.
        [Obsolete("Renamed to UpdateFileAdditionalInfo.")]
        [HttpPost]
        [ProtectedEndPoint("blocks-data::update-file-additional-info")]
        public Task<IActionResult> updateFileAdditionalInfo([FromBody] UpdateFileRequest command)
            => UpdateFileAdditionalInfo(command);

        /// <summary>Cursor-paginated version history of a file, newest first.</summary>
        [HttpGet]
        [ProtectedEndPoint("blocks-data::get-file-versions")]
        public async Task<IActionResult> GetFileVersions([FromQuery] GetFileVersionsRequest request)
        {
            var page = await _contentFileService.GetVersionsAsync(request.FileId, request.Cursor, request.Limit);
            return Ok(new FileVersionsResponse
            {
                Items = page.Items.Select(FileVersionDto.From).ToList(),
                NextCursor = page.NextCursor,
                HasMore = page.HasMore,
            });
        }

        /// <summary>Creates the next version of a file and returns a presigned upload URL.</summary>
        [HttpPost]
        [ProtectedEndPoint("blocks-data::create-file-version")]
        public async Task<IActionResult> CreateFileVersion([FromBody] CreateFileVersionRequest request)
        {
            var result = await _fileManagementService.CreateFileVersionAsync(request);
            return result.IsSuccess ? Ok(result) : BadRequest(result);
        }

        /// <summary>Copies a file into another directory without duplicating its stored bytes.</summary>
        [HttpPost]
        [ProtectedEndPoint("blocks-data::copy-file")]
        public async Task<IActionResult> CopyFile([FromBody] CopyFileRequest request)
        {
            var result = await _contentFileService.CopyFileAsync(request.FileId, request.TargetDirectoryId, request.CopyAccessPolicies);
            return result.Status == FileOperationStatus.Succeeded
                ? Ok(new { fileId = result.NewFileId })
                : MapFileOperation(result.Status);
        }

        /// <summary>Re-parents a file into another directory.</summary>
        [HttpPost]
        [ProtectedEndPoint("blocks-data::move-file")]
        public async Task<IActionResult> MoveFile([FromBody] MoveFileRequest request)
        {
            var result = await _contentFileService.MoveFileAsync(request.FileId, request.TargetDirectoryId);
            return result.Status == FileOperationStatus.Succeeded
                ? Ok(new { fileId = request.FileId })
                : MapFileOperation(result.Status);
        }

        private IActionResult MapFileOperation(FileOperationStatus status) => status switch
        {
            FileOperationStatus.FileNotFound => NotFound(new { message = "File not found." }),
            FileOperationStatus.TargetNotFound => NotFound(new { message = "Target directory not found." }),
            FileOperationStatus.NameConflict => Conflict(new { message = "A file with that name already exists in the target directory." }),
            FileOperationStatus.ExtensionNotAllowed => BadRequest(new { message = "The target directory does not allow this file extension." }),
            _ => BadRequest(new { message = "The file operation could not be completed." }),
        };
    }
}
