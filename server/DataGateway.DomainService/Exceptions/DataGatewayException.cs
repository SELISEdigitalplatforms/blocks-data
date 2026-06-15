namespace DataGateway.DomainService.Exceptions;

public abstract class DataGatewayException : Exception
{
    public string ErrorCode { get; }
    public int StatusCode { get; }

    protected DataGatewayException(string message, string errorCode, int statusCode)
        : base(message)
    {
        ErrorCode = errorCode;
        StatusCode = statusCode;
    }
}
