namespace Storage.DomainService.Storage
{
    public class GetDmsFileAndFolderResponse
    {
        public List<DmsFileAndFolderInfo> DmsFileAndFolderInfos { get; set; } = new List<DmsFileAndFolderInfo>();

        public long TotalCount { get; set; }
    }
    public class DmsFileAndFolderInfo
    {
        public string? ParentId { get; set; }
        public int Type { get; set; }
        public string? Name { get; set; }
        public string? FileStorageId { get; set; }
        public string? Extension { get; set; }
        public string? SizeInBytes { get; set; }
        public int Version { get; set; }
        public string? Description { get; set; }
        public string ItemId { get; set; }
        public DateTime LastUpdatedDate { get; set; }
    }
}
