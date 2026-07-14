
namespace DataGateway.DomainService.Services
{
    public interface ICloudBuildSecret
    {
        public string? ChatGptEncryptedSecret { get; set; }
        public string? ChatGptEncryptionKey { get; set; }
    }
}
