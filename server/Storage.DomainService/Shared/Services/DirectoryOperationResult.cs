using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;

namespace Storage.DomainService.Services;

public sealed class DirectoryOperationResult
{
    public DirectoryOperationStatus Status { get; init; }
    public string? DirectoryId { get; init; }
    public FileDirectory? Directory { get; init; }
    public ObjectPermissionFlags? Permissions { get; init; }
    public bool IsSuccess => Status == DirectoryOperationStatus.Succeeded;

    public static DirectoryOperationResult Failure(DirectoryOperationStatus status) => new() { Status = status };

    public static DirectoryOperationResult Success(
        string? directoryId = null, FileDirectory? directory = null, ObjectPermissionFlags? permissions = null) =>
        new()
        {
            Status = DirectoryOperationStatus.Succeeded,
            DirectoryId = directoryId,
            Directory = directory,
            Permissions = permissions,
        };
}
