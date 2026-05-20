namespace DataGateway.DomainService.Services;

public class TokenRepository : ITokenRepository
{
    public Task<string> GetToken(string userId)
    {
        return Task.FromResult(string.Empty);
    }
}