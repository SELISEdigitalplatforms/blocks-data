namespace Storage.DomainService.Services
{
    public enum ObjectAccessOperationStatus
    {
        Succeeded, ResourceNotFound, NotPermitted, SelfDenyRejected, PrincipalRequired, WouldOrphanResource, PolicyNotFound,
    }
}
