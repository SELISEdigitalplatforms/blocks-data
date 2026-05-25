
namespace DataGateway.DomainService.Services
{
    public interface ICloudBuildSecret
    {
        public string ServiceName { get; set; }
        public string SeliseGithubPat { get; set; }
        public string SastBasicAuthToken { get; set; }
        public string DependencyTrackApiKey { get; set; }
        public string DependencyTrackDefaultTeamId { get; set; }
        public string SonarQubeToken { get; set; }
        public string GithubWebhookSecret { get; set; }
        public string GithubClientSecret { get; set; }
        public string GithubClientId { get; set; }
    }
}
