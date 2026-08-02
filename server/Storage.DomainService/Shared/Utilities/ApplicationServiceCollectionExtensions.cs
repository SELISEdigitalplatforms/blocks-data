using Blocks.Genesis;
using DomainService.Configuration;
using DomainService.Storage;
using DomainService.Storage.Dms;
using DomainService.Storage.Services;
using DomainService.Storage.Validators;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Storage.DomainService.Services;
using Storage.DomainService.Shared.Services;
using Storage.DomainService.Storage;
using Storage.DomainService.Storage.Validators;

namespace Storage.DomainService.Utilities
{
    public static class ApplicationServiceCollectionExtensions
    {
        public static void AddStorageDomainServices(this IServiceCollection services)
        {
            // Register validator
            services.AddTransient<IValidator<GetPreSignedUrlForUploadRequest>, GetPreSignedUrlForUploadRequestValidator>();
            services.AddTransient<IValidator<LocalStorageUploadRequest>, LocalStorageUploadRequestValidator>();
            services.AddTransient<IValidator<UpdateFileRequest>, UpdateFileRequestValidator>();
            services.AddTransient<IValidator<global::DomainService.Storage.Dms.CreateFolderRequest>, CreateFolderRequestValidator>();
            services.AddTransient<IValidator<UpdateFolderRequest>, UpdateFolderRequestValidator>();
            services.AddTransient<IValidator<GetFolderChildrenRequest>, GetFolderChildrenRequestValidator>();
            services.AddTransient<IValidator<CopyFileRequest>, CopyFileRequestValidator>();
            services.AddTransient<IValidator<MoveFileRequest>, MoveFileRequestValidator>();
            services.AddTransient<IValidator<MoveFolderRequest>, MoveFolderRequestValidator>();
            services.AddTransient<IValidator<GrantAccessRequest>, GrantAccessRequestValidator>();
            services.AddTransient<IValidator<RevokeAccessRequest>, RevokeAccessRequestValidator>();
            services.AddTransient<IValidator<ToggleInheritanceRequest>, ToggleInheritanceRequestValidator>();
            services.AddTransient<IValidator<ContentSearchRequest>, ContentSearchRequestValidator>();
            services.AddTransient<IValidator<TrashRequest>, TrashRequestValidator>();
            services.AddTransient<IValidator<RestoreFromTrashRequest>, RestoreFromTrashRequestValidator>();
            services.AddTransient<IValidator<CreateFileVersionRequest>, CreateFileVersionRequestValidator>();
            services.AddTransient<IValidator<GetFileVersionsRequest>, GetFileVersionsRequestValidator>();

            // Register services
            services.AddSingleton<IFileManagementService, FileManagementService>();
            services.AddSingleton<IFileRepository, FileRepository>();
            services.AddSingleton<IFileVersionRepository, FileVersionRepository>();
            services.AddSingleton<IDirectoryRepository, DirectoryRepository>();
            services.AddSingleton<IContentAccessRepository, ContentAccessRepository>();
            services.AddSingleton<IContentAccessResolver, ContentAccessResolver>();
            services.AddSingleton<IContentListingService, ContentListingService>();
            services.AddSingleton<IContentHierarchyService, ContentHierarchyService>();
            services.AddSingleton<IContentFileService, ContentFileService>();
            services.AddSingleton<IContentManagementService, ContentManagementService>();
            services.AddSingleton<IFolderManagementService, FolderManagementService>();
            services.AddSingleton<IContentDiscoveryService, ContentDiscoveryService>();
            services.AddSingleton<IStorageServiceFactory, StorageServiceFactory>();
            services.AddSingleton<DmsArtifactBuilderFactory>();
            services.AddSingleton<FileArtifactBuilder>();
            services.AddSingleton<IConfigurationRepository, ConfigurationRepository>();
            services.AddTransient<AzureBlobStorageService>();
            services.AddTransient<AwsS3StorageService>();
            services.AddTransient<SftpStorageService>();
            services.AddTransient<AwsS3CompatibleStorageService>();
            services.AddHttpContextAccessor();
        }
    }
}
