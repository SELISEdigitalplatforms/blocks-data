namespace DomainService.Storage.Dms
{
    public class CopyFileRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string TargetDirectoryId { get; set; } = string.Empty;

        /// <summary>When false the copy starts with no entries of its own and inherits from the target.</summary>
        public bool CopyAccessPolicies { get; set; }
    }
}
