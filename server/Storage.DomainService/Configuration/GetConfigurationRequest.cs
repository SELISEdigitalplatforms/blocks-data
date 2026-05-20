using Blocks.Genesis;

namespace DomainService.Configuration
{
    public class GetConfigurationRequest : IProjectKey
    {
        public string ProjectKey { get ; set ; } = string.Empty;
        public string ConfigurationName { get ; set ; } 
    }
}
