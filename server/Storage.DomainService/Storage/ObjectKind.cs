using Storage.DomainService.Enums;

namespace DomainService.Storage.Dms
{
    /// <summary>
    /// Maps the API kind strings the frontend sends ("directory" / "file") onto the
    /// <see cref="StructureType"/> the listing/search services filter on. Any other
    /// value (null, empty, "all", typos) resolves to null, which the services read as
    /// "no filter" — matching the contract where an omitted type returns both kinds.
    /// </summary>
    public static class ObjectKind
    {
        public static StructureType? FromApiString(string? value)
            => value?.Trim().ToLowerInvariant() switch
            {
                "directory" => StructureType.Directory,
                "file" => StructureType.File,
                _ => null,
            };
    }
}
