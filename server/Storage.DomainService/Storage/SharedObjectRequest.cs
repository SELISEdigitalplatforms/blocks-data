namespace DomainService.Storage.Dms
{
    /// <summary>Cursor-paginated objects explicitly shared with the calling principal.</summary>
    public class SharedObjectRequest
    {
        public string? Cursor { get; set; }
        public int Limit { get; set; } = 50;

        /// <summary>Narrows results to directorys or files. Both when omitted.</summary>
        public string? Type { get; set; }
    }
}
