namespace DataGateway.DomainService.Exceptions;

public class AccessDeniedException : DataGatewayException
{
    public AccessDeniedException(string message, string errorCode = "AUTH_NOT_AUTHENTICATED")
        : base(message, errorCode, 401)
    {
    }
}
