using Blocks.Genesis;

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
    }
}
