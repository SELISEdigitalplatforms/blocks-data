using Storage.DomainService.Storage;

namespace Storage.DomainService.Shared.Services
{
    public interface IArtifact
    {
        public Task<DmsResponse> CreateArtifact(ArtifactBaseRequest command);
    }
}
