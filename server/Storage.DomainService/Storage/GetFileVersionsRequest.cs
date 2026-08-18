namespace DomainService.Storage.Dms
{
    public class GetFileVersionsRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string? Cursor { get; set; }
        public int Limit { get; set; } = 25;
    }
}
