namespace DomainService.Storage
{
    /// <summary>
    /// Provider-reported metadata for a stored object, read without streaming its bytes. Used during
    /// upload-completion verification to check the actual stored size/type against the declared values.
    /// </summary>
    public class StorageObjectMetadata
    {
        public long SizeInBytes { get; set; }
        public string? ContentType { get; set; }

        /// <summary>Provider-computed content hash (e.g. an S3 ETag for a non-multipart upload, or an Azure content-MD5), when the provider exposes one without streaming the object; otherwise null.</summary>
        public string? Checksum { get; set; }
    }
}
