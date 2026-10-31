using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;

namespace Storage.DomainService.Storage.ZipDownload;

public class PrepareZipDownloadRequest
{
    public List<string> ItemIds { get; set; } = new();
    public List<string> DirectoryIds { get; set; } = new();
    public string? ConfigurationName { get; set; }
    public string? ZipName { get; set; }
}

public class PrepareZipDownloadResponse : BaseResponse
{
    public string Ticket { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public int FileCount { get; set; }
    public long TotalBytes { get; set; }
    public string ZipName { get; set; } = string.Empty;
}

/// <summary>A file resolved at prepare time, carrying what the stream step needs to read its bytes.</summary>
public sealed class ZipSourceFile
{
    public string FileId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string VersionId { get; set; } = string.Empty;
    public long VersionNo { get; set; }
    public string? StorageKey { get; set; }
    public AccessModifier AccessModifier { get; set; }
    public long SizeInBytes { get; set; }
    public string TenantId { get; set; } = string.Empty;
}

public enum ZipEntryKind
{
    Folder,
    File
}

public sealed class ZipTicketEntry
{
    public ZipEntryKind Kind { get; set; }
    public string ZipPath { get; set; } = string.Empty;
    public ZipSourceFile? Source { get; set; }
}

/// <summary>The resolved download stored under a single-use ticket.</summary>
public sealed class ZipTicket
{
    public string TenantId { get; set; } = string.Empty;
    public string ConfigurationName { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string ZipName { get; set; } = string.Empty;
    public List<ZipTicketEntry> Entries { get; set; } = new();
}
