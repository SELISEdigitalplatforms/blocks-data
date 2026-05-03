using DataGateway.DomainService.Services;
using System.Reflection;

namespace Blocks.Genesis
{
    public sealed class CloudBuildSecret : ICloudBuildSecret
    {
        public string SeliseGithubPat { get; set; }
        public string ServiceName { get; set; }
        public string SastBasicAuthToken { get; set; }
        public string DependencyTrackApiKey { get; set; }
        public string DependencyTrackDefaultTeamId { get; set; }
        public string SonarQubeToken { get; set; }
        public string GithubWebhookSecret { get; set; }
        public string GithubClientSecret { get; set; }
        public string GithubClientId { get; set; }


        public static async Task<ICloudBuildSecret> ProcessBlocksSecret(VaultType vaultType = VaultType.Azure)
        {
            IVault cloudVault = Vault.GetCloudVault(vaultType);
            return await ProcessBlocksSecret(cloudVault);
        }

        public static async Task<ICloudBuildSecret> ProcessBlocksSecret(IVault cloudVault)
        {
            var blocksSecret = new CloudBuildSecret();
            PropertyInfo[] properties = typeof(CloudBuildSecret).GetProperties();
            var blocksSecretVault = await cloudVault.ProcessSecretsAsync(properties.Select(x => x.Name).ToList());

            foreach (PropertyInfo property in properties)
            {
                string propertyName = property.Name;
                var isExist = blocksSecretVault.TryGetValue(propertyName, out var retrievedValue);

                if (isExist && !string.IsNullOrWhiteSpace(retrievedValue))
                {
                    object convertedValue = ConvertValue(retrievedValue, property.PropertyType);
                    UpdateProperty(blocksSecret, propertyName, convertedValue);
                }
                else if (!isExist)
                {
                    Console.WriteLine($"Warning: Secret property '{propertyName}' not found in vault.");
                }
                else if (string.IsNullOrWhiteSpace(retrievedValue))
                {
                    Console.WriteLine($"Warning: Secret property '{propertyName}' found but is empty or whitespace.");
                }
            }

            ValidateRequiredSecrets(blocksSecret);
            return blocksSecret;
        }

        private static void ValidateRequiredSecrets(CloudBuildSecret secret)
        {
            var requiredSecrets = new[] { nameof(CloudBuildSecret.SeliseGithubPat) };
            var missingSecrets = new List<string>();

            foreach (var secretName in requiredSecrets)
            {
                var property = typeof(CloudBuildSecret).GetProperty(secretName);
                if (property != null)
                {
                    var value = property.GetValue(secret) as string;
                    if (string.IsNullOrWhiteSpace(value))
                    {
                        missingSecrets.Add(secretName);
                    }
                }
            }

            if (missingSecrets.Count > 0)
            {
                var missingList = string.Join(", ", missingSecrets);
                throw new InvalidOperationException($"Required CloudBuild secrets are not configured in vault: {missingList}. Please ensure these secrets exist in Azure Vault.");
            }
        }



        public static void UpdateProperty<T>(T blocksSecret, string propertyName, object propertyValue) where T : class
        {
            var property = blocksSecret.GetType().GetProperty(propertyName);

            if (property != null && property.CanWrite)
            {
                property.SetValue(blocksSecret, propertyValue);
            }
            else
            {
                Console.WriteLine($"Property '{propertyName}' not found or is read-only.");
            }
        }

        public static object ConvertValue(string value, Type targetType)
        {
            if (targetType != typeof(string))
            {
                try
                {
                    return Convert.ChangeType(value, targetType);
                }
                catch (Exception e)
                {
                    Console.WriteLine(e.Message);
                }
            }
            return value;
        }
    }
}
