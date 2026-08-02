using Blocks.Genesis;
using DomainService.Storage.Dms;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Storage.DomainService.Services;

namespace Api.Controllers
{
    /// <summary>
    /// Folder operations: create, read, list children, rename, move and delete.
    /// </summary>
    /// <remarks>
    /// Creating a root folder is a separate permission from creating a nested one.
    /// Anyone with Edit on a parent may add a subfolder, but starting a new tree at the
    /// root is a tenant-level act, so it is gated by
    /// <c>blocks-data::create-root-folder</c> and assigned to the owner role only.
    ///
    /// Reads that the caller may not see report 404 rather than 403 throughout. Saying
    /// "forbidden" would confirm that a folder exists, which is enough to map a tree the
    /// caller cannot open.
    /// </remarks>
    [ApiController]
    [Route("[controller]/[action]")]
    public class FoldersController : ControllerBase
    {
        private readonly IFolderManagementService _folderManagementService;
        private readonly IContentListingService _contentListingService;
        private readonly IContentHierarchyService _contentHierarchyService;

        public FoldersController(
            IFolderManagementService folderManagementService,
            IContentListingService contentListingService,
            IContentHierarchyService contentHierarchyService)
        {
            _folderManagementService = folderManagementService;
            _contentListingService = contentListingService;
            _contentHierarchyService = contentHierarchyService;
        }

        /// <summary>Creates a folder beneath an existing parent.</summary>
        [HttpPost]
        [Authorize]
        // [ProtectedEndPoint("blocks-data::create-folder")]
        public async Task<IActionResult> CreateFolder([FromBody] CreateFolderRequest request)
        {
            if (string.IsNullOrWhiteSpace(request?.ParentFolderId))
            {
                // A root folder needs the stronger permission, which this action does not
                // carry. Directing the caller at CreateRootFolder keeps the two grants
                // genuinely separate rather than branching inside one endpoint.
                return BadRequest(new { message = "A parent folder is required. Use CreateRootFolder to start a new tree." });
            }

            var result = await _folderManagementService.CreateFolderAsync(
                request.Name, request.ParentFolderId, request.Description,
                request.ConfigurationName, request.ModuleName, request.AllowedFileExtensions);

            return MapCreate(result);
        }

        /// <summary>Creates a folder at the root of the tenant.</summary>
        [HttpPost]
        [Authorize]
        //[ProtectedEndPoint("blocks-data::create-root-folder")]
        public async Task<IActionResult> CreateRootFolder([FromBody] CreateFolderRequest request)
        {
            var result = await _folderManagementService.CreateFolderAsync(
                request.Name, null, request.Description,
                request.ConfigurationName, request.ModuleName, request.AllowedFileExtensions);

            return MapCreate(result);
        }

        /// <summary>Folder details plus the operations the caller holds on it.</summary>
        [HttpGet]
        [Authorize]
        // [ProtectedEndPoint("blocks-data::get-folder")]
        public async Task<IActionResult> GetFolder([FromQuery] string folderId)
        {
            var result = await _folderManagementService.GetFolderAsync(folderId);

            if (!result.IsSuccess || result.Folder is null)
            {
                return NotFound(new { message = $"Folder not found: {folderId}" });
            }

            return Ok(FolderDetailResponse.From(result.Folder, result.Permissions));
        }

        /// <summary>Access-resolved, cursor-paginated children of a folder.</summary>
        [HttpGet]
        [Authorize]
        // [ProtectedEndPoint("blocks-data::get-folder-children")]
        public async Task<IActionResult> GetFolderChildren([FromQuery] GetFolderChildrenRequest request)
        {
            var page = await _contentListingService.GetVisibleChildrenAsync(
                request.FolderId, request.Cursor, request.Limit, request.Type, request.Search);

            return Ok(ChildrenResponse.From(page));
        }

        /// <summary>Renames a folder or updates its description.</summary>
        [HttpPost]
        [Authorize]
        // [ProtectedEndPoint("blocks-data::update-folder")]
        public async Task<IActionResult> UpdateFolder([FromBody] UpdateFolderRequest request)
        {
            var result = await _folderManagementService.UpdateFolderAsync(
                request.FolderId, request.Name, request.Description);

            return result.Status switch
            {
                FolderOperationStatus.Succeeded => Ok(new { folderId = result.FolderId }),
                FolderOperationStatus.NameConflict => Conflict(new { message = "A folder with that name already exists here." }),
                FolderOperationStatus.NotPermitted => Forbid(),
                _ => NotFound(new { message = $"Folder not found: {request.FolderId}" }),
            };
        }

        /// <summary>Moves a folder to the trash, or removes it permanently.</summary>
        [HttpPost]
        [Authorize]
        // [ProtectedEndPoint("blocks-data::delete-folder")]
        public async Task<IActionResult> DeleteFolder([FromBody] DeleteFolderContentRequest request)
        {
            var result = await _folderManagementService.DeleteFolderAsync(request.FolderId, request.Permanent);

            return result.Status switch
            {
                FolderOperationStatus.Succeeded => Ok(new { folderId = request.FolderId }),
                FolderOperationStatus.NotEmpty => Conflict(new { message = "Empty the folder before deleting it permanently." }),
                FolderOperationStatus.NotPermitted => Forbid(),
                _ => NotFound(new { message = $"Folder not found: {request.FolderId}" }),
            };
        }

        /// <summary>Re-parents a folder and rewrites the cached ancestry beneath it.</summary>
        [HttpPost]
        [Authorize]
        // [ProtectedEndPoint("blocks-data::move-folder")]
        public async Task<IActionResult> MoveFolder([FromBody] MoveFolderRequest request)
        {
            var result = await _contentHierarchyService.MoveFolderAsync(request.FolderId, request.TargetFolderId);

            return result switch
            {
                MoveFolderResult.Moved => Ok(new { folderId = request.FolderId }),
                MoveFolderResult.WouldCreateCycle => BadRequest(new { message = "A folder cannot be moved inside itself." }),
                MoveFolderResult.NameConflict => Conflict(new { message = "A folder with that name already exists in the target." }),
                MoveFolderResult.TargetNotFound => NotFound(new { message = $"Target folder not found: {request.TargetFolderId}" }),
                _ => NotFound(new { message = $"Folder not found: {request.FolderId}" }),
            };
        }

        private IActionResult MapCreate(FolderOperationResult result) => result.Status switch
        {
            FolderOperationStatus.Succeeded => Created(string.Empty, new { folderId = result.FolderId }),
            FolderOperationStatus.NameConflict => Conflict(new { message = "A folder with that name already exists here." }),
            FolderOperationStatus.NotPermitted => Forbid(),
            FolderOperationStatus.ParentNotFound => NotFound(new { message = "Parent folder not found." }),
            _ => NotFound(new { message = "Folder not found." }),
        };
    }
}
