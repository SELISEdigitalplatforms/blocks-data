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
    [Route("files")]
    public class FileController : ControllerBase
    {
        private readonly IFileManagementService _fileManagementService;
        private readonly IFileService _fileService;

        /// <summary>
        /// Initializes a new instance of the <see cref="FileController"/> class.
        /// </summary>
        /// <param name="fileManagementService">Service for managing file operations.</param>
        /// <param name="fileService">Service for file version, move and copy operations.</param>
        public FileController(IFileManagementService fileManagementService, IFileService fileService)
        {
            _fileManagementService = fileManagementService;
            _fileService = fileService;
        }

        /// <summary>
        /// Retrieves a file for download based on the provided request.
        /// </summary>
        /// <param name="request">The request containing file details.</param>
        /// <returns>A response containing the file details or null if not found.</returns>
        [HttpGet("get-file")]
        [ProtectedEndPoint("blocks-data::file::get-file")]
        public async Task<FileResponse?> GetFile([FromQuery] GetFileRequest request)
        {
            return await _fileManagementService.GetUrlForDownloadFileAsync(request);
        }

        /// <summary>
        /// Retrieves multiple files for download based on the provided request.
        /// </summary>
        /// <param name="request">The request containing file details.</param>
        /// <returns>A response containing the file details or null if not found.</returns>
        [HttpPost("get-files")]
        [ProtectedEndPoint("blocks-data::file::get-files")]
        public async Task<List<FileResponse>?> GetFiles([FromBody] GetFilesRequest request)
        {
            return await _fileManagementService.GetMultipleUrlsForDownloadFilesAsync(request);
        }

        /// <summary>
        /// Retrieves multiple files Information.
        /// </summary>
        /// <param name="request">The request containing file details.</param>
        /// <returns>A response containing the file details or null if not found.</returns>
        [HttpPost("get-files-info")]
        [ProtectedEndPoint("blocks-data::file::get-files-info")]
        public async Task<GetFilesInfoResponse> GetFilesInfo([FromBody] GetFilesInfoRequest request)
        {
            return await _fileManagementService.GetFilesInfoAsync(request);
        }

        /// <summary>
        /// Generates a pre-signed URL for uploading a file.
        /// </summary>
        /// <param name="request">The request containing upload details.</param>
        /// <returns>A response containing the pre-signed URL for upload.</returns>
        [HttpPost("get-pre-signed-url-for-upload")]
        [ProtectedEndPoint("blocks-data::file::get-pre-signed-url-for-upload")]
        public async Task<GetPreSignedUrlForUploadResponse> GetPreSignedUrlForUpload([FromBody] GetPreSignedUrlForUploadRequest request)
        {
            return await _fileManagementService.GetPerSignedUrlForUploadAsync(request);
        }

        /// <summary>
        /// Moves a file to trash, or permanently removes it when <c>Permanent</c> is true.
        /// </summary>
        /// <param name="request">The request containing file deletion details.</param>
        /// <returns>A response indicating the result of the delete operation.</returns>
        [HttpPost("delete-file")]
        [ProtectedEndPoint("blocks-data::file::delete-file")]
        public async Task<BaseResponse> DeleteFile([FromBody] DeleteFileRequest request)
        {
            return await _fileManagementService.DeleteFileAsync(request);
        }

        /// <summary>
        /// Uploads a file to local storage.
        /// </summary>
        /// <param name="request">The request containing the file stream and metadata for the upload.</param>
        /// <returns>A response containing the details of the uploaded file.</returns>
        [HttpPost("upload-file-to-local-storage")]
        [ProtectedEndPoint("blocks-data::file::upload-file-to-local-storage")]
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
        [HttpGet("download-file")]
        [ProtectedEndPoint("blocks-data::file::download-file")]
        public async Task<IActionResult> DownloadFile([FromQuery] DownloadFileRequest request)
        {
            var fileResponse = await _fileManagementService.DownloadFileFromLocalStorageAsync(request);

            if (fileResponse.FileStream == null)
            {
                return NotFound(fileResponse.Errors);
            }

            return File(fileResponse.FileStream, "application/octet-stream", fileResponse.FileName);
        }

        [HttpPost("update-file-additional-info")]
        [ProtectedEndPoint("blocks-data::file::update-file-additional-info")]
        public async Task<IActionResult> UpdateFileAdditionalInfo([FromBody] UpdateFileRequest command)
        {
            if (command == null) return BadRequest();
            var result = await _fileManagementService.UpdateFileAsync(command);
            return result.IsSuccess ? Ok(result) : BadRequest(result);
        }

        // Deprecated: use /Files/UpdateFileAdditionalInfo. Kept so the leaked camelCase URL keeps working.
        // No kebab-case route here: it would collide with UpdateFileAdditionalInfo's own kebab route above.
        [HttpPost("updateFileAdditionalInfo")]
        [ProtectedEndPoint("blocks-data::file::update-file-additional-info")]
        public Task<IActionResult> updateFileAdditionalInfo([FromBody] UpdateFileRequest command)
            => UpdateFileAdditionalInfo(command);

        /// <summary>Cursor-paginated version history of a file, newest first.</summary>
        [HttpGet("get-file-versions")]
        [ProtectedEndPoint("blocks-data::file::get-file-versions")]
        public async Task<IActionResult> GetFileVersions([FromQuery] GetFileVersionsRequest request)
        {
            var page = await _fileService.GetVersionsAsync(request.FileId, request.Cursor, request.Limit);
            return Ok(new FileVersionsResponse
            {
                Items = page.Items.Select(FileVersionDto.From).ToList(),
                NextCursor = page.NextCursor,
                HasMore = page.HasMore,
            });
        }

        /// <summary>Creates the next version of a file and returns a presigned upload URL.</summary>
        [HttpPost("create-file-version")]
        [ProtectedEndPoint("blocks-data::file::create-file-version")]
        public async Task<IActionResult> CreateFileVersion([FromBody] CreateFileVersionRequest request)
        {
            var result = await _fileManagementService.CreateFileVersionAsync(request);
            return result.IsSuccess ? Ok(result) : BadRequest(result);
        }

        /// <summary>Copies a file into another directory without duplicating its stored bytes.</summary>
        [HttpPost("copy-file")]
        [ProtectedEndPoint("blocks-data::file::copy-file")]
        public async Task<IActionResult> CopyFile([FromBody] CopyFileRequest request)
        {
            var result = await _fileService.CopyFileAsync(request.FileId, request.TargetDirectoryId, request.CopyAccessPolicies);
            return result.Status == FileOperationStatus.Succeeded
                ? Ok(new { fileId = result.NewFileId })
                : MapFileOperation(result.Status);
        }

        /// <summary>Re-parents a file into another directory.</summary>
        [HttpPost("move-file")]
        [ProtectedEndPoint("blocks-data::file::move-file")]
        public async Task<IActionResult> MoveFile([FromBody] MoveFileRequest request)
        {
            var result = await _fileService.MoveFileAsync(request.FileId, request.TargetDirectoryId);
            return result.Status == FileOperationStatus.Succeeded
                ? Ok(new { fileId = request.FileId })
                : MapFileOperation(result.Status);
        }

        /// <summary>Renames a file without moving it or changing its stored content.</summary>
        [HttpPost("rename-file")]
        [ProtectedEndPoint("blocks-data::file::rename-file")]
        public async Task<IActionResult> RenameFile([FromBody] RenameFileRequest request)
        {
            var result = await _fileService.RenameFileAsync(request.FileId, request.Name);
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
            FileOperationStatus.InvalidName => BadRequest(new { message = "A file name is required." }),
            FileOperationStatus.NotPermitted => Forbid(),
            _ => BadRequest(new { message = "The file operation could not be completed." }),
        };
    }
}
