namespace Storage.DomainService.Services
{
    public enum MoveDirectoryResult
    {
        Moved, SourceNotFound, TargetNotFound, WouldCreateCycle, NameConflict, IsDefault, NotPermitted,
    }
}
