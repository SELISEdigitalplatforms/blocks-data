namespace DomainService.Storage.Dms
{
    public class ObjectSearchRequest
    {
        public string Query { get; set; } = string.Empty;

        /// <summary>Null searches from the top level down.</summary>
        public string? DirectoryId { get; set; }

        public string? Cursor { get; set; }
        public int Limit { get; set; } = 50;

        /// <summary>Null searches directorys and files together. Accepts "directory" / "file".</summary>
        public string? Type { get; set; }
    }
}
