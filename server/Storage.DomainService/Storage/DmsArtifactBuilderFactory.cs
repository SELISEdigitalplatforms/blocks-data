using Microsoft.Extensions.DependencyInjection;
using Storage.DomainService.Shared.Enums;
using Storage.DomainService.Shared.Services;

namespace Storage.DomainService.Storage
{
    public class DmsArtifactBuilderFactory
    {
        private readonly IServiceProvider _serviceProvider;

        public DmsArtifactBuilderFactory(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public IArtifact CreateArtifactBuilder(DmsArtifactType artifactType)
        {
            switch (artifactType)
            {
                case DmsArtifactType.File:
                    {
                        return _serviceProvider.GetService<FileArtifactBuilder>();
                    }
                case DmsArtifactType.Folder:
                    {
                        return _serviceProvider.GetService<FolderArtifactBuilder>();
                    }
                default:
                    return null;

            }
        }
    }
}
