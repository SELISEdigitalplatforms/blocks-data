using MongoDB.Driver;
using Storage.DomainService.Services;
using Storage.DomainService.Shared.Entities;
using Storage.DomainService.Shared.Enums;

namespace Storage.DomainService.Shared.Services
{
    public class ArtifactContext
    {
        public readonly IFileRepository _fileRepository;

        public ArtifactContext(IFileRepository fileRepository)
        {
            _fileRepository = fileRepository ;
        }

        protected async Task<DmsArtifact> GetParentIfExistsAndValidAsync(string providedParentId)
        {
            var parentArtifact = await _fileRepository.GetDmsArtifactByNameAndParentIdAsync("", providedParentId);

            if (parentArtifact == null || parentArtifact.DmsArtifacts == null)
            {
                throw new ArgumentException($"ParentId = {providedParentId} does not exist.");
            }

            if (parentArtifact.DmsArtifacts.FirstOrDefault()?.ArtifactType == (int)DmsArtifactType.File)
            {
                throw new NotSupportedException($"Artifact type file can not have child artifacts");
            }

            return parentArtifact.DmsArtifacts.FirstOrDefault();
        }
    }
}
