using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Directory = Storage.DomainService.Entities.Directory;

namespace Storage.DomainService.Services;

public sealed class DirectoryOperationResult
{
    public DirectoryOperationStatus Status { get; init; }
    public string? DirectoryId { get; init; }
    public Directory? Directory { get; init; }
    public ContentPermissionFlags? Permissions { get; init; }
    public bool IsSuccess => Status == DirectoryOperationStatus.Succeeded;

    public static DirectoryOperationResult Failure(DirectoryOperationStatus status) => new() { Status = status };

    public static DirectoryOperationResult Success(
        string? directoryId = null, Directory? directory = null, ContentPermissionFlags? permissions = null) =>
        new()
        {
            Status = DirectoryOperationStatus.Succeeded,
            DirectoryId = directoryId,
            Directory = directory,
            Permissions = permissions,
        };
}
