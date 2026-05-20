using Blocks.Genesis;

namespace DomainService.Configuration
{
    public class GetAllConfigurationRequest : IProjectKey
    {
        public string ProjectKey { get; set; } = string.Empty;
    }
}
