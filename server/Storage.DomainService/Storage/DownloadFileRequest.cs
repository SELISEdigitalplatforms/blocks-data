using Blocks.Genesis;
using Microsoft.AspNetCore.Mvc;

namespace DomainService.Storage
{
    public class DownloadFileRequest : IProjectKey
    {
        public string ProjectKey { get; set; }

        [FromQuery(Name = "x-blocks-key")]
        public string? XBlocksKey { get; set; }
        public string? ConfigurationName { get; set; }
        public string? Signature { get; set; }
    }
}
