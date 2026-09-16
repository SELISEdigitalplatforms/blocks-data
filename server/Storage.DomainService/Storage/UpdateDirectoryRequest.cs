namespace DomainService.Storage.Dms
{
    public class UpdateDirectoryRequest
    {
        public string DirectoryId { get; set; } = string.Empty;
        public string? Name { get; set; }
        public string? Description { get; set; }

        /// <summary>"Creator" or "Organization". Empty/whitespace clears the directory back to
        /// its legacy default (allow-all). Only applied when <see cref="UpdateObjectAccessLevel"/> is true.</summary>
        public string? ObjectAccessLevel { get; set; }

        /// <summary>Set to true to change ObjectAccessLevel with this request, including clearing it.</summary>
        public bool UpdateObjectAccessLevel { get; set; }
    }
}
