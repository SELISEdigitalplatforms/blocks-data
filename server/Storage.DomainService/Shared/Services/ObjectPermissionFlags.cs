namespace Storage.DomainService.Services
{
    /// <summary>The six operations a caller can hold on one resource.</summary>
    public sealed class ObjectPermissionFlags
    {
        public bool CanView { get; set; }
        public bool CanDownload { get; set; }
        public bool CanEdit { get; set; }
        public bool CanDelete { get; set; }
        public bool CanManage { get; set; }
        public bool CanOwner { get; set; }
    }
}
