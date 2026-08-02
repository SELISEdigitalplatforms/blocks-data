using Blocks.Genesis;
using DomainService.Storage;
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

        /// <summary>
        /// Initializes a new instance of the <see cref="FilesController"/> class.
        /// </summary>
        /// <param name="fileManagementService">Service for managing file operations.</param>
        public FilesController(IFileManagementService fileManagementService)
        {
            _fileManagementService = fileManagementService;
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
    }
}
