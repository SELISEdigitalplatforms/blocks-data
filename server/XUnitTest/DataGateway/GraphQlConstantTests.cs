using DataGateway.DomainService.Models.Constants;
using FluentAssertions;

namespace XUnitTest.DataGateway;

/// <summary>
/// Covers the pure helpers on <see cref="GraphQlConstant"/>: tenant setters and message
/// configuration selection by connection-string scheme.
/// </summary>
public class GraphQlConstantTests
{
    [Fact]
    public void SetAsTenantId_SetsTenantId()
    {
        "tenant-abc".SetAsTenantId();
        GraphQlConstant.TenantId.Should().Be("tenant-abc");
    }

    [Fact]
    public void SetTenantInformation_SetsIdAndSlug()
    {
        GraphQlConstant.SetTenantInformation("t-1", "slug-1");
        GraphQlConstant.TenantId.Should().Be("t-1");
        GraphQlConstant.TenantSlug.Should().Be("slug-1");
    }

    [Theory]
    [InlineData("amqp://guest:guest@localhost:5672")]
    [InlineData("amqps://guest:guest@host:5671")]
    public void GetMessageConfiguration_AmqpScheme_UsesRabbitMq(string connectionString)
    {
        var config = GraphQlConstant.GetMessageConfiguration(connectionString);
        config.RabbitMqConfiguration.Should().NotBeNull();
    }

    [Theory]
    [InlineData("Endpoint=sb://ns.servicebus.windows.net/;SharedAccessKeyName=k;SharedAccessKey=v")]
    [InlineData("not-a-uri")]
    public void GetMessageConfiguration_NonAmqp_UsesAzureServiceBus(string connectionString)
    {
        var config = GraphQlConstant.GetMessageConfiguration(connectionString);
        config.AzureServiceBusConfiguration.Should().NotBeNull();
    }
}
