using Blocks.Genesis.Entities.Data;
using Storage.DomainService.Enums;
using Storage.DomainService.Utilities;

namespace Storage.DomainService.Entities
{
    /// <summary>
    /// Data-service helpers for <see cref="StorageConfiguration"/> (the class itself lives in SeliseBlocks.Genesis.OS, namespace Blocks.Genesis.Entities.Data).
    /// Same names and behaviour as the former instance methods; they need data-only <see cref="Constants"/> and
    /// <see cref="AccessModifierValidation"/>, so they stay here.
    /// </summary>
    public static class StorageConfigurationExtensions
    {
        /// <summary>Resolves <see cref="StorageConfiguration.UploadUrlExpirySeconds"/> to its effective, documented-default value.</summary>
        public static int GetUploadUrlExpirySeconds(this StorageConfiguration configuration) =>
            configuration.UploadUrlExpirySeconds is > 0 ? configuration.UploadUrlExpirySeconds.Value : Constants.DefaultUploadUrlExpirySeconds;

        /// <summary>Resolves <see cref="StorageConfiguration.DownloadUrlExpirySeconds"/> to its effective, documented-default value.</summary>
        public static int GetDownloadUrlExpirySeconds(this StorageConfiguration configuration) =>
            configuration.DownloadUrlExpirySeconds is > 0 ? configuration.DownloadUrlExpirySeconds.Value : Constants.DefaultDownloadUrlExpirySeconds;

        /// <summary>Resolves <see cref="StorageConfiguration.MaxFileSizeInBytes"/> to its effective, documented-default value.</summary>
        public static long GetMaxFileSizeInBytes(this StorageConfiguration configuration) =>
            configuration.MaxFileSizeInBytes is > 0 ? configuration.MaxFileSizeInBytes.Value : Constants.DefaultMaxFileSizeInBytes;

        /// <summary>
        /// Whether upload completion is required for <paramref name="accessModifier"/>, after dropping any
        /// configured value outside the allowed <see cref="AccessModifier.Public"/>/<see cref="AccessModifier.Private"/> set.
        /// </summary>
        public static bool IsUploadCompletionRequiredFor(this StorageConfiguration configuration, AccessModifier accessModifier) =>
            AccessModifierValidation.AllowedUploadCompletionAccessModifiers.Contains(accessModifier)
            && configuration.UploadCompletionRequiredFor?.Contains(accessModifier) == true;
    }
}
