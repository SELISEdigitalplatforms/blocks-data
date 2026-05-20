using Blocks.Genesis;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Storage.DomainService.Storage
{
    public class UpdateFileRequest : IProjectKey
    {
        public string ItemId { get; set; }
        public Dictionary<string, string> AdditionalProperties { get; set; } = new Dictionary<string, string>();
        public string? ProjectKey { get; set; }
    }
}
