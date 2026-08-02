using Microsoft.Extensions.DependencyInjection;
using Storage.DomainService.Shared.Enums;
using Storage.DomainService.Shared.Services;

namespace Storage.DomainService.Storage
{
    /// <summary>
    /// Resolves the builder for an artifact kind. Folder creation now lives on
    /// <c>FoldersController</c> / <c>FolderManagementService</c>, so the factory handles
    /// only file artifacts; the folder builder and its registration have been retired.
    /// </summary>
    public class DmsArtifactBuilderFactory
    {
        private readonly IServiceProvider _serviceProvider;

        public DmsArtifactBuilderFactory(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public IArtifact CreateArtifactBuilder(DmsArtifactType artifactType)
        {
            if (artifactType == DmsArtifactType.File)
            {
                return _serviceProvider.GetService<FileArtifactBuilder>();
            }

            return null;
        }
    }
}
