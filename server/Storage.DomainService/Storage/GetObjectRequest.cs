using Storage.DomainService.Shared.Enums;

namespace DomainService.Storage.Dms
{
    public class GetObjectRequest
    {
        public string? ParentDirectoryId { get; set; }

        /// <summary>
        /// Optional module root to list when <see cref="ParentDirectoryId"/> is not supplied.
        /// The API resolves this to the module's default directory before listing.
        /// </summary>
        public ModuleName? ModuleName { get; set; }

        /// <summary>Opaque continuation token from the previous page. Null starts at the beginning.</summary>
        public string? Cursor { get; set; }

        public int Limit { get; set; } = 50;

        /// <summary>Null returns directorys and files together. Accepts the API kind strings "directory" / "file".</summary>
        public string? Type { get; set; }

        public string? Search { get; set; }
    }
}
