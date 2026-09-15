using Blocks.Genesis;
using Storage.DomainService.Enums;

namespace DomainService.Configuration
{
    public class Configuration : IProjectKey
    {
        public string Name { get; set; }
        public string? ConnectionString { get; set; }
        public string? SecretKey { get; set; }
        public string? AccessKey { get; set; }
        public string StorageStrategy { get; set; }
        public string? CloudStorageRegionEndPoint { get; set; }
        public string ProjectKey { get ; set ; }
        public bool UpdateRequest { get; set; }
        public string? ItemId { get; set; }

        #region LocalStorage

        public string? Host { get; set; }
        public string? Port { get; set; }
        public string? UserName { get; set; }
        public string? Password { get; set; }
        public string? RemoteBasePath { get; set; }

        #endregion

        #region Phase1UploadSecurity

        /// <summary>Mirrors <c>StorageConfiguration.UploadUrlExpirySeconds</c>. Null/missing resolves to the documented default.</summary>
        public int? UploadUrlExpirySeconds { get; set; }

        /// <summary>Mirrors <c>StorageConfiguration.DownloadUrlExpirySeconds</c>. Null/missing resolves to the documented default.</summary>
        public int? DownloadUrlExpirySeconds { get; set; }

        /// <summary>Mirrors <c>StorageConfiguration.MaxFileSizeInBytes</c>. Null/missing resolves to the documented default.</summary>
        public long? MaxFileSizeInBytes { get; set; }

        /// <summary>Mirrors <c>StorageConfiguration.UploadCompletionRequiredFor</c>. Only Public/Private are honored.</summary>
        public List<AccessModifier>? UploadCompletionRequiredFor { get; set; }

        #endregion
    }
}
