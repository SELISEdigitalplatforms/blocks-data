using Blocks.Genesis;

namespace Storage.DomainService.Entities
{
    public class FileVersion : BaseEntity
    {
        public long No { get; private set; }
        public string? FileId { get; private set; }
        public long SizeInBytes { get; set; }
        public string? TenantId { get; private set; }

        private FileVersion() { }

        public static FileVersion CreateNew(string fileId, long no, FileVersionOptions options)
        {
            if (options == null) throw new ArgumentNullException(nameof(options));

            return new FileVersion
            {
                FileId = fileId,
                No = options.LazyUpdate ? -no : no,
                ItemId = options.ItemId,
                TenantId = options.TenantId,
                CreatedDate = options.CreateDate,
                CreatedBy = options.CreatedBy,
                Tags = options.Tags,
                Language = options.Language
            };
        }
    }

    public class FileVersionOptions
    {
        public string ItemId { get; set; } = string.Empty;
        public string TenantId { get; set; } = string.Empty;
        public DateTime CreateDate { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;
        public List<string>? Tags { get; set; }
        public string Language { get; set; } = "en";
        public bool LazyUpdate { get; set; } = false;
    }
}
