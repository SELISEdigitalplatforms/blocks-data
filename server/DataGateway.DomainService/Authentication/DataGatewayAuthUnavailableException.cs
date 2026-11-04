namespace DataGateway.DomainService.Authentication;

/// <summary>
/// The token could not be checked because a service the check needs (Redis, Mongo) failed.
/// This says nothing about the token, so the gateway answers 503 and the caller retries;
/// it must never become a 401, which clients read as "signed out".
/// </summary>
public sealed class DataGatewayAuthUnavailableException : Exception
{
    public DataGatewayAuthUnavailableException()
    {
    }

    public DataGatewayAuthUnavailableException(string message)
        : base(message)
    {
    }

    public DataGatewayAuthUnavailableException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
