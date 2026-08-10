namespace Storage.DomainService.Enums;

/// <summary>Why a directory operation was refused, so callers can map it to a status code.</summary>
public enum DirectoryOperationStatus
{
    Succeeded = 0,
    NotFound = 1,
    /// <summary>The caller lacks the permission the operation requires.</summary>
    NotPermitted = 2,
    /// <summary>A sibling already uses this name.</summary>
    NameConflict = 3,
    ParentNotFound = 4,
    /// <summary>Permanent deletion refused because the directory still has children.</summary>
    NotEmpty = 5,
    /// <summary>
    /// The directory is a default/system root (seeded from a template). It anchors the
    /// tenant tree and cannot be moved, renamed or deleted.
    /// </summary>
    IsDefault = 6,
}
