using DomainService.Configuration;
using DomainService.Storage;
using DomainService.Storage.Validators;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using Storage.DomainService.Storage.Validators;
using StorageDriver;

namespace Blocks.Extension.DependencyInjection
{
    public static class StorageDriverServiceExtension
    {
        public static void RegisterBlocksStorageServices(this IServiceCollection services)
        {
            services.AddSingleton<IStorageDriverService, StorageDriverService>();

            // Register validator
            services.AddTransient<IValidator<GetPreSignedUrlForUploadRequest>, GetPreSignedUrlForUploadRequestValidator>();
            services.AddTransient<IValidator<LocalStorageUploadRequest>, LocalStorageUploadRequestValidator>();

            // Register services
            services.AddTransient<IValidator<UpdateFileRequest>, UpdateFileRequestValidator>();
            services.AddTransient<AwsS3CompatibleStorageService>();
            services.AddSingleton<IFileManagementService, FileManagementService>();
            services.AddSingleton<IFileRepository, FileRepository>();
            services.AddSingleton<IFileVersionRepository, FileVersionRepository>();
            services.AddSingleton<IFileDirectoryRepository, FileDirectoryRepository>();
            services.AddSingleton<IStorageServiceFactory, StorageServiceFactory>();
            services.AddSingleton<IConfigurationRepository, ConfigurationRepository>();
            services.AddTransient<AzureBlobStorageService>();
            services.AddTransient<AwsS3StorageService>();
            
        }
    }
}
