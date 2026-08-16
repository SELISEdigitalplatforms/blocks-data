using Blocks.Genesis;
using DomainService.Storage.Dms;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;

namespace Api.Controllers
{
    /// <summary>
    /// Directory operations: create, read, list children, rename, move and delete.
    /// </summary>
    /// <remarks>
    /// Creating a root directory is a separate permission from creating a nested one.
    /// Anyone with Edit on a parent may add a subdirectory, but starting a new tree at the
    /// root is a tenant-level act, so it is gated by
    /// <c>blocks-data::directory::create-root-directory</c> and assigned to the owner role only.
    ///
    /// Reads that the caller may not see report 404 rather than 403 throughout. Saying
    /// "forbidden" would confirm that a directory exists, which is enough to map a tree the
    /// caller cannot open.
    /// </remarks>
    [ApiController]
    [Route("[controller]")]
    public class DirectoryController : ControllerBase
    {
        private readonly IFileDirectoryManagementService _directoryManagementService;
        private readonly IObjectHierarchyService _objectHierarchyService;

        public DirectoryController(
            IFileDirectoryManagementService directoryManagementService,
            IObjectHierarchyService objectHierarchyService)
        {
            _directoryManagementService = directoryManagementService;
            _objectHierarchyService = objectHierarchyService;
        }

        /// <summary>Creates a directory beneath an existing parent.</summary>
        [HttpPost("CreateDirectory")]
        [HttpPost("create-directory")]
        [ProtectedEndPoint("blocks-data::directory::create-directory")]
        public async Task<IActionResult> CreateDirectory([FromBody] CreateDirectoryRequest request)
        {
            if (request is null) return BadRequest();

            if (string.IsNullOrWhiteSpace(request.ParentDirectoryId))
            {
                if (request.ModuleName.HasValue)
                {
                    var defaultDirectory = await _directoryManagementService
                        .GetDefaultDirectoryByModuleNameAsync(request.ModuleName.Value.ToString());

                    if (defaultDirectory is null)
                    {
                        return NotFound(new { message = $"Default directory not found for module: {request.ModuleName}" });
                    }

                    request.ParentDirectoryId = defaultDirectory.ItemId;
                }
                else
                {
                    // A root directory needs the stronger permission, which this action does not
                    // carry. Directing the caller at CreateRootDirectory keeps the two grants
                    // genuinely separate rather than branching inside one endpoint.
                    return BadRequest(new { message = "A parent directory is required. Use CreateRootDirectory to start a new tree." });
                }
            }

            var result = await _directoryManagementService.CreateDirectoryAsync(
                request.Name, request.ParentDirectoryId, request.Description,
                request.ConfigurationName, request.ModuleName?.ToString(), request.AllowedFileExtensions);

            return MapCreate(result);
        }

        /// <summary>Creates a directory at the root of the tenant.</summary>
        [HttpPost("CreateRootDirectory")]
        [HttpPost("create-root-directory")]
        [ProtectedEndPoint("blocks-data::directory::create-root-directory")]
        public async Task<IActionResult> CreateRootDirectory([FromBody] CreateDirectoryRequest request)
        {
            var result = await _directoryManagementService.CreateDirectoryAsync(
                request.Name, null, request.Description,
                request.ConfigurationName, request.ModuleName?.ToString(), request.AllowedFileExtensions);

            return MapCreate(result);
        }

        /// <summary>Directory details plus the operations the caller holds on it.</summary>
        [HttpGet("GetDirectory")]
        [HttpGet("get-directory")]
        [ProtectedEndPoint("blocks-data::directory::get-directory")]
        public async Task<IActionResult> GetDirectory([FromQuery] string directoryId)
        {
            var result = await _directoryManagementService.GetDirectoryAsync(directoryId);

            if (!result.IsSuccess || result.Directory is null)
            {
                return NotFound(new { message = $"Directory not found: {directoryId}" });
            }

            return Ok(DirectoryDetailResponse.From(result.Directory, result.Permissions));
        }

        /// <summary>Renames a directory or updates its description.</summary>
        [HttpPost("UpdateDirectory")]
        [HttpPost("update-directory")]
        [ProtectedEndPoint("blocks-data::directory::update-directory")]
        public async Task<IActionResult> UpdateDirectory([FromBody] UpdateDirectoryRequest request)
        {
            var result = await _directoryManagementService.UpdateDirectoryAsync(
                request.DirectoryId, request.Name, request.Description);

            return result.Status switch
            {
                DirectoryOperationStatus.Succeeded => Ok(new { directoryId = result.DirectoryId }),
                DirectoryOperationStatus.NameConflict => Conflict(new { message = "A directory with that name already exists here." }),
                DirectoryOperationStatus.IsDefault => BadRequest(new { message = "This is a default directory and cannot be renamed." }),
                DirectoryOperationStatus.NotPermitted => Forbid(),
                _ => NotFound(new { message = $"Directory not found: {request.DirectoryId}" }),
            };
        }

        /// <summary>Moves a directory to the trash, or removes it permanently.</summary>
        [HttpPost("DeleteDirectory")]
        [HttpPost("delete-directory")]
        [ProtectedEndPoint("blocks-data::directory::delete-directory")]
        public async Task<IActionResult> DeleteDirectory([FromBody] DeleteDirectoryRequest request)
        {
            var result = await _directoryManagementService.DeleteDirectoryAsync(request.DirectoryId, request.Permanent);

            return result.Status switch
            {
                DirectoryOperationStatus.Succeeded => Ok(new { directoryId = request.DirectoryId }),
                DirectoryOperationStatus.NotEmpty => Conflict(new { message = "Empty the directory before deleting it permanently." }),
                DirectoryOperationStatus.IsDefault => BadRequest(new { message = "This is a default directory and cannot be deleted." }),
                DirectoryOperationStatus.NotPermitted => Forbid(),
                _ => NotFound(new { message = $"Directory not found: {request.DirectoryId}" }),
            };
        }

        /// <summary>Re-parents a directory and rewrites the cached ancestry beneath it.</summary>
        [HttpPost("MoveDirectory")]
        [HttpPost("move-directory")]
        [ProtectedEndPoint("blocks-data::directory::move-directory")]
        public async Task<IActionResult> MoveDirectory([FromBody] MoveDirectoryRequest request)
        {
            var result = await _objectHierarchyService.MoveDirectoryAsync(request.DirectoryId, request.TargetDirectoryId);

            return result switch
            {
                MoveDirectoryResult.Moved => Ok(new { directoryId = request.DirectoryId }),
                MoveDirectoryResult.WouldCreateCycle => BadRequest(new { message = "A directory cannot be moved inside itself." }),
                MoveDirectoryResult.NameConflict => Conflict(new { message = "A directory with that name already exists in the target." }),
                MoveDirectoryResult.IsDefault => BadRequest(new { message = "This is a default directory and cannot be moved." }),
                MoveDirectoryResult.NotPermitted => Forbid(),
                MoveDirectoryResult.TargetNotFound => NotFound(new { message = $"Target directory not found: {request.TargetDirectoryId}" }),
                _ => NotFound(new { message = $"Directory not found: {request.DirectoryId}" }),
            };
        }

        private IActionResult MapCreate(DirectoryOperationResult result) => result.Status switch
        {
            DirectoryOperationStatus.Succeeded => Created(string.Empty, new { directoryId = result.DirectoryId }),
            DirectoryOperationStatus.NameConflict => Conflict(new { message = "A directory with that name already exists here." }),
            DirectoryOperationStatus.NotPermitted => Forbid(),
            DirectoryOperationStatus.ParentNotFound => NotFound(new { message = "Parent directory not found." }),
            _ => NotFound(new { message = "Directory not found." }),
        };
    }
}
