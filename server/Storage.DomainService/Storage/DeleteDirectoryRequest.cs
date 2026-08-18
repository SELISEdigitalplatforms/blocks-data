namespace DomainService.Storage.Dms
{
    /// <summary>Deletes a directory.</summary>
    public class DeleteDirectoryRequest
    {
        public string DirectoryId { get; set; } = string.Empty;

        /// <summary>Removes the directory outright instead of moving it to the trash.</summary>
        public bool Permanent { get; set; } = true;
    }
}
