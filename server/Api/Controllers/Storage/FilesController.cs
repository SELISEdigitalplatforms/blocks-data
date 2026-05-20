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
        // private readonly ChangeControllerContext _changeControllerContext;

        /// <summary>
        /// Initializes a new instance of the <see cref="FilesController"/> class.
        /// </summary>
        /// <param name="fileManagementService">Service for managing file operations.</param>
        /// <param name="changeControllerContext">Context changer for the controller.</param>
        public FilesController(IFileManagementService fileManagementService)
        //    ChangeControllerContext changeControllerContext)
        {
            _fileManagementService = fileManagementService;
            // _changeControllerContext = changeControllerContext;
        }

        /// <summary>
        /// Retrieves a file for download based on the provided request.
        /// </summary>
        /// <param name="request">The request containing file details.</param>
        /// <returns>A response containing the file details or null if not found.</returns>
        [HttpGet]
        // [ProtectedEndPoint("uds::files::getfile")]
        [Authorize]
        public async Task<FileResponse?> GetFile([FromQuery] GetFileRequest request)
        {
            // _changeControllerContext.ChangeContext(request);
            return await _fileManagementService.GetUrlForDownloadFileAsync(request);
        }

        /// <summary>
        /// Retrieves multiple files for download based on the provided request.
        /// </summary>
        /// <param name="request">The request containing file details.</param>
        /// <returns>A response containing the file details or null if not found.</returns>
        [HttpPost]
        // [ProtectedEndPoint("uds::files::getfiles")]
        [Authorize]
        public async Task<List<FileResponse>?> GetFiles([FromBody] GetFilesRequest request)
        {
            // _changeControllerContext.ChangeContext(request);
            return await _fileManagementService.GetMultipleUrlsForDownloadFilesAsync(request);
        }

        /// <summary>
        /// Retrieves multiple files Information.
        /// </summary>
        /// <param name="request">The request containing file details.</param>
        /// <returns>A response containing the file details or null if not found.</returns>
        [HttpPost]
        // [ProtectedEndPoint("uds::files::getfilesinfo")]
        [Authorize]
        public async Task<GetFilesInfoResponse> GetFilesInfo([FromBody] GetFilesInfoRequest request)
        {
            // _changeControllerContext.ChangeContext(request);
            return await _fileManagementService.GetFilesInfoAsync(request);
        }

        /// <summary>
        /// Generates a pre-signed URL for uploading a file.
        /// </summary>
        /// <param name="request">The request containing upload details.</param>
        /// <returns>A response containing the pre-signed URL for upload.</returns>
        [HttpPost]
        // [ProtectedEndPoint("uds::files::getpresignedurlforupload")]
        [Authorize]
        public async Task<GetPreSignedUrlForUploadResponse> GetPreSignedUrlForUpload([FromBody] GetPreSignedUrlForUploadRequest request)
        {
            // _changeControllerContext.ChangeContext(request);
            return await _fileManagementService.GetPerSignedUrlForUploadAsync(request);
        }

        /// <summary>
        /// Deletes a file based on the provided request.
        /// </summary>
        /// <param name="request">The request containing file deletion details.</param>
        /// <returns>A response indicating the result of the delete operation.</returns>
        [HttpPost]
        // [ProtectedEndPoint("uds::files::deletefile")]
        [Authorize]
        public async Task<BaseResponse> DeleteFile([FromBody] DeleteFileRequest request)
        {
            // _changeControllerContext.ChangeContext(request);
            return await _fileManagementService.DeleteFileAsync(request);
        }

        /// <summary>
        /// Uploads a file to local storage.
        /// </summary>
        /// <param name="request">The request containing the file stream and metadata for the upload.</param>
        /// <returns>A response containing the details of the uploaded file.</returns>
        [HttpPost]
        // [ProtectedEndPoint("uds::files::uploadfiletolocalstorage")]
        [Authorize]
        public async Task<LocalStorageUploadResponse> UploadFileToLocalStorage([FromForm] LocalStorageUploadRequest request)
        {
            // _changeControllerContext.ChangeContext(request);
            return await _fileManagementService.UploadFileToLocalStorageAsync(request);
        }

        /// <summary>
        /// Downloads a file from local storage based on the provided request. (This endpoint is for internal use only!)
        /// </summary>
        /// <param name="request">The request containing file download details.</param>
        /// <returns>A response containing the file stream and metadata of the downloaded file.</returns>
        [ApiExplorerSettings(IgnoreApi = true)]
        [HttpGet]
        // [ProtectedEndPoint("uds::files::downloadfile")]
        [Authorize]
        public async Task<IActionResult> DownloadFile([FromQuery] DownloadFileRequest request)
        {
            // _changeControllerContext.ChangeContext(request);
            var fileResponse = await _fileManagementService.DownloadFileFromLocalStorageAsync(request);

            if (fileResponse.FileStream == null)
            {
                return NotFound(fileResponse.Errors);
            }

            return File(fileResponse.FileStream, "application/octet-stream", fileResponse.FileName);
        }

        [HttpPost]
        // [ProtectedEndPoint("uds::files::updatefileadditionalinfo")]
        [Authorize]
        public async Task<IActionResult> updateFileAdditionalInfo([FromBody] UpdateFileRequest command)
        {
            if (command == null) return BadRequest();
            // _changeControllerContext.ChangeContext(command);
            var result = await _fileManagementService.UpdateFileAsync(command);
            return result.IsSuccess ? Ok(result) : BadRequest(result);
        }

        [HttpPost]
        // [ProtectedEndPoint("uds::files::getdmsfileandfolder")]
        [Authorize]
        public async Task<GetDmsFileAndFolderResponse> GetDmsFileAndFolder([FromBody] GetDmsFileAndFolderRequest command)
        {
            if (command == null) return new GetDmsFileAndFolderResponse();
            // _changeControllerContext.ChangeContext(command);
            return await _fileManagementService.GetDmsFileAndFolder(command);
        }

        [HttpPost]
        // [ProtectedEndPoint("uds::files::uploadfile")]
        [Authorize]
        public async Task<DmsResponse> UploadFile([FromBody] UploadFilesRequest command)
        {
            if (command == null) return null;
            // _changeControllerContext.ChangeContext(command);

            return await _fileManagementService.UploadFilesAsync(command);
        }


        [HttpPost]
        // [ProtectedEndPoint("uds::files::createfolder")]
        [Authorize]
        public async Task<DmsResponse> CreateFolder([FromBody] CreateFolderRequest command)
        {
            if (command == null) return null;
            // _changeControllerContext.ChangeContext(command);

            return await _fileManagementService.CreateFolderAsync(command);
        }

        /// <summary>
        /// Deletes a folder based on the provided request.
        /// </summary>
        /// <param name="request">The request containing folder deletion details (folder id, optional configuration and project key).</param>
        /// <returns>A <see cref="BaseResponse"/> indicating whether the delete operation succeeded and any associated errors.</returns>
        [HttpPost]
        // [ProtectedEndPoint("uds::files::deletefolder")]
        [Authorize]
        public async Task<BaseResponse> DeleteFolder([FromBody] DeleteFolderRequest request)
        {
            // _changeControllerContext.ChangeContext(request);
            return await _fileManagementService.DeleteFolderAsync(request);
        }
    }
}
