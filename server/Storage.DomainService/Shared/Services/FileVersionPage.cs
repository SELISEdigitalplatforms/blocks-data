using Storage.DomainService.Entities;
using Blocks.Genesis.Entities.Data;

namespace Storage.DomainService.Services
{
    public sealed class FileVersionPage
    {
        public List<FileVersion> Items { get; set; } = new();
        public string? NextCursor { get; set; }
        public bool HasMore { get; set; }
    }
}
