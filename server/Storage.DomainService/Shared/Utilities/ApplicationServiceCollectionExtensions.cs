using Blocks.Genesis;
using DomainService.Configuration;
using DomainService.Storage;
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

            // Register services
            services.AddSingleton<IFileManagementService, FileManagementService>();
            services.AddSingleton<IFileRepository, FileRepository>();
            services.AddSingleton<IFileVersionRepository, FileVersionRepository>();
            services.AddSingleton<IDirectoryRepository, DirectoryRepository>();
            services.AddSingleton<IContentAccessRepository, ContentAccessRepository>();
            services.AddSingleton<IContentAccessResolver, ContentAccessResolver>();
            services.AddSingleton<IContentListingService, ContentListingService>();
            services.AddSingleton<IStorageServiceFactory, StorageServiceFactory>();
            services.AddSingleton<DmsArtifactBuilderFactory>();
            services.AddSingleton<FileArtifactBuilder>();
            services.AddSingleton<FolderArtifactBuilder>();
            services.AddSingleton<IConfigurationRepository, ConfigurationRepository>();
            services.AddTransient<AzureBlobStorageService>();
            services.AddTransient<AwsS3StorageService>();
            services.AddTransient<SftpStorageService>();
            services.AddTransient<AwsS3CompatibleStorageService>();
            // services.AddSingleton<ChangeControllerContext>();
            services.AddHttpContextAccessor();
        }
    }
}
