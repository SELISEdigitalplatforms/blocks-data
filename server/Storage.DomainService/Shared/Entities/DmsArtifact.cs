using Blocks.Genesis;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Storage.DomainService.Shared.Entities
{
    [BsonIgnoreExtraElements]
    public class DmsArtifact : BaseEntity
    {
        public string Name { get; set; }
        public int Version { get; set; }
        public string Description { get; set; }
        public string ParentId { get; set; }
        public string FileStorageId { get; set; }
        public string Extension { get; set; }
        public int ArtifactType { get; set; }
        public string Color { get; set; }
        public string SizeInBytes { get; set; }
        public bool IsArchived { get; set; }
        public bool IsActive { get; set; } = true;
        public string TenantId { get; set; }
        public string ConfigurationName { get; set; }
        public string ModuleName { get; set; }
    }
}
