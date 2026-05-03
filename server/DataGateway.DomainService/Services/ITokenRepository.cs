namespace DataGateway.DomainService.Services;

public interface ITokenRepository
{
    Task<string> GetToken(string userId);
}