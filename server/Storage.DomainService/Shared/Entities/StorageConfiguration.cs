using Blocks.Genesis;
using Storage.DomainService.Enums;
using Storage.DomainService.Utilities;

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

        #region Phase1UploadSecurity

        /// <summary>Lifetime of a generated upload URL, in seconds. Null/missing resolves to <see cref="Constants.DefaultUploadUrlExpirySeconds"/>.</summary>
        public int? UploadUrlExpirySeconds { get; set; }

        /// <summary>Lifetime of a generated download URL, in seconds. Null/missing resolves to <see cref="Constants.DefaultDownloadUrlExpirySeconds"/>.</summary>
        public int? DownloadUrlExpirySeconds { get; set; }

        /// <summary>Maximum accepted upload size, in bytes. Null/missing resolves to <see cref="Constants.DefaultMaxFileSizeInBytes"/>.</summary>
        public long? MaxFileSizeInBytes { get; set; }

        /// <summary>
        /// Access modifiers for which upload completion (quarantine + synchronous verification) is required.
        /// Only <see cref="AccessModifier.Public"/> and <see cref="AccessModifier.Private"/> are honored; any
        /// other value is ignored. Null/missing resolves to an empty set (completion not required).
        /// </summary>
        public List<AccessModifier>? UploadCompletionRequiredFor { get; set; }

        /// <summary>Resolves <see cref="UploadUrlExpirySeconds"/> to its effective, documented-default value.</summary>
        public int GetUploadUrlExpirySeconds() =>
            UploadUrlExpirySeconds is > 0 ? UploadUrlExpirySeconds.Value : Constants.DefaultUploadUrlExpirySeconds;

        /// <summary>Resolves <see cref="DownloadUrlExpirySeconds"/> to its effective, documented-default value.</summary>
        public int GetDownloadUrlExpirySeconds() =>
            DownloadUrlExpirySeconds is > 0 ? DownloadUrlExpirySeconds.Value : Constants.DefaultDownloadUrlExpirySeconds;

        /// <summary>Resolves <see cref="MaxFileSizeInBytes"/> to its effective, documented-default value.</summary>
        public long GetMaxFileSizeInBytes() =>
            MaxFileSizeInBytes is > 0 ? MaxFileSizeInBytes.Value : Constants.DefaultMaxFileSizeInBytes;

        /// <summary>
        /// Whether upload completion is required for <paramref name="accessModifier"/>, after dropping any
        /// configured value outside the allowed <see cref="AccessModifier.Public"/>/<see cref="AccessModifier.Private"/> set.
        /// </summary>
        public bool IsUploadCompletionRequiredFor(AccessModifier accessModifier) =>
            AccessModifierValidation.AllowedUploadCompletionAccessModifiers.Contains(accessModifier)
            && UploadCompletionRequiredFor?.Contains(accessModifier) == true;

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
