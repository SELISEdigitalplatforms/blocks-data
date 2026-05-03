using Blocks.Genesis;

namespace Storage.DomainService.Entities
{
    public class StorageConfiguration : BaseEntity
    {
        public string Name { get; set; }
        public string ConnectionString { get; set; }
        public string SecretKey { get; set; }
        public string AccessKey { get; set; }
        public string StorageStrategy { get; set; }
        public string CloudStorageRegionEndPoint { get ; set ;  }

        #region LocalStorage

        public string Host { get; set; }
        public  string Port { get; set; }
        public  string UserName { get; set; }
        public  string Password { get; set; }
        public  string RemoteBasePath { get; set; }
        public string SftpSecretKey { get; set; }

        #endregion

        public static string GetMaskedCloudStorageRegionEndPoint( string endPoint)
        {
            if (string.IsNullOrEmpty(endPoint))
                return string.Empty;

            ReadOnlySpan<char> span = endPoint.AsSpan();
            if (span.Length <= 2)
                return new string('*', span.Length);

            return $"{span[0]}{new string('*', span.Length - 2)}{span[^1]}";
        }
    }
}
