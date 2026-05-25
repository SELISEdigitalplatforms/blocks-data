using Storage.DomainService.Shared.Entities;

namespace Storage.DomainService.Shared.Dtos
{
    public class DmsArtifactList
    {
        public List<DmsArtifact> DmsArtifacts { get; set; }
        public long TotalCount { get; set; }
    }
}
