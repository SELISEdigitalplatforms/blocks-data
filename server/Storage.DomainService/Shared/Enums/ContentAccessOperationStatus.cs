namespace Storage.DomainService.Services
{
    public enum ContentAccessOperationStatus
    {
        Succeeded, ResourceNotFound, NotPermitted, SelfDenyRejected, PrincipalRequired, WouldOrphanResource, PolicyNotFound,
    }
}
