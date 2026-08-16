namespace DomainService.Storage.Dms
{
    public class TrashRequest
    {
        public string? Cursor { get; set; }
        public int Limit { get; set; } = 50;

        /// <summary>Narrows the trash to directorys or files. Both when omitted. Accepts "directory" / "file".</summary>
        public string? Type { get; set; }
    }
}
