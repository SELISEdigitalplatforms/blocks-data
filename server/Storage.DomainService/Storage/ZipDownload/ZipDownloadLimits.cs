namespace Storage.DomainService.Storage.ZipDownload;

/// <summary>Fixed limits and error codes for the zip download feature.</summary>
public static class ZipDownloadLimits
{
    public const int MaxFiles = 5_000;
    public const int MaxFolders = 5_000;
    public const long MaxTotalBytes = 2L * 1024 * 1024 * 1024;
    public const int MaxRequestIds = 1_000;
    public const int TicketTtlSeconds = 120;
    public const int ListingPageSize = 200;

    public const string LimitExceeded = "zip_limit_exceeded";
    public const string NothingToDownload = "zip_nothing_to_download";
}
