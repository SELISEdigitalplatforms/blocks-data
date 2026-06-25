using DataGateway.DomainService.Services;
using System.Reflection;

namespace Blocks.Genesis
{
    public sealed class CloudBuildSecret : ICloudBuildSecret
    {
        public string? ChatGptEncryptedSecret { get; set; }
        public string? ChatGptEncryptionKey { get; set; }

        public static async Task<ICloudBuildSecret> ProcessBlocksSecret(VaultType vaultType = VaultType.Azure)
        {
             IVault cloudVault = Vault.GetCloudVault(vaultType);
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

            return blocksSecret;
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
