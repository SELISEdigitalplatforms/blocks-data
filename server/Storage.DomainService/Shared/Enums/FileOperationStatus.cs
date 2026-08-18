namespace Storage.DomainService.Services
{
    public enum FileOperationStatus
    {
        Succeeded = 0,
        FileNotFound = 1,
        TargetNotFound = 2,
        NameConflict = 3,
        ExtensionNotAllowed = 4,
        NotPermitted = 5,
        InvalidName = 6,
    }
}
