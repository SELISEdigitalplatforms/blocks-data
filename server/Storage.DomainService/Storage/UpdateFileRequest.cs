using Blocks.Genesis;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Storage.DomainService.Storage
{
    public class UpdateFileRequest
    {
        public string ItemId { get; set; }
        public Dictionary<string, string> AdditionalProperties { get; set; } = new Dictionary<string, string>();

        /// <summary>"Creator" or "Organization". Empty/whitespace clears the file back to its
        /// legacy default (allow-all). Only applied when <see cref="UpdateObjectAccessLevel"/> is true.</summary>
        public string? ObjectAccessLevel { get; set; }

        /// <summary>Set to true to change ObjectAccessLevel with this request, including clearing it.</summary>
        public bool UpdateObjectAccessLevel { get; set; }
    }
}
