namespace DataGateway.DomainService.Exceptions;

public class EntityNotFoundException : DataGatewayException
{
    public EntityNotFoundException(string message)
        : base(message, "NOT_FOUND", 404)
    {
    }
}
