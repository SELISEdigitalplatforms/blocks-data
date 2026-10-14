using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.DataSources;

/// <summary>DataSourceSecretResolver (data SPEC1 §3.5.3; §12 "Resolver", R-SEC-TENANT, C11, C52).</summary>
[Collection("ContextSerial")]
public class DataSourceSecretResolverTests
{
    private const string Value = "mongodb://u:VeryPrivatePw@host:27017/";
    private readonly FakeSecretService _secrets = new();
    private readonly RecordingLoggerProvider _logs = new();

    private (DataSourceSecretResolver Resolver, Func<int> Scopes) Build()
    {
        var scopes = 0;
        var services = new ServiceCollection();
        services.AddScoped<ISecretService>(_ =>
        {
            Interlocked.Increment(ref scopes);
            return _secrets;
        });
        var resolver = new DataSourceSecretResolver(services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>(),
            _logs.CreateLogger<DataSourceSecretResolver>());
        return (resolver, () => scopes);
    }

    [Fact]
    public async Task OneValueReadPerCall_NewScopePerCall_NoCache()
    {
        BlocksContext.SetContext(null);
        var s = _secrets.Add("tenant-b", Value);
        var (resolver, scopes) = Build();

        (await resolver.ResolveAsync("tenant-b", s.Id)).Should().Be(Value);
        (await resolver.ResolveAsync("tenant-b", s.Id)).Should().Be(Value);

        _secrets.ValueReads.Should().Be(2);
        scopes().Should().Be(2);
    }

    [Fact]
    public async Task NoAmbientContext_ServiceContextIsAuthenticated_WithTheTenant()
    {
        BlocksContext.SetContext(null);
        var s = _secrets.Add("tenant-b", Value);
        var (resolver, _) = Build();

        await resolver.ResolveAsync("tenant-b", s.Id);

        var call = _secrets.Calls.Single();
        call.Tenant.Should().Be("tenant-b");
        call.User.Should().Be("blocks-data-datasource");
        BlocksContext.GetContext().Should().BeNull("the service context is only set for the call");
    }

    [Fact]
    public async Task FakeRefusesAnUnauthenticatedContext_LikeTheSecretPackage()
    {
        BlocksContext.SetContext(null);
        var act = () => _secrets.GetValueAsync("x");
        await act.Should().ThrowAsync<SecretAccessDeniedException>();
    }

    [Fact]
    public async Task SecretOfAnotherTenant_IsNotFound_FailClosed()
    {
        BlocksContext.SetContext(null);
        var s = _secrets.Add("tenant-a", Value);
        var (resolver, _) = Build();

        var act = () => resolver.ResolveAsync("tenant-b", s.Id);

        (await act.Should().ThrowAsync<DataSourceUnavailableException>()).Which.SecretError.Should().BeOfType<SecretNotFoundException>();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("default")]
    [InlineData("Default")]
    [InlineData("DEFAULT")]
    public async Task Sentinels_ReturnedAsIs_NoSecretCall(string? secretId)
    {
        var (resolver, scopes) = Build();
        (await resolver.ResolveAsync("t", secretId)).Should().Be(secretId);
        _secrets.Calls.Should().BeEmpty();
        scopes().Should().Be(0);
    }

    public static TheoryData<Exception> SecretErrors() => new()
    {
        new SecretVaultException("Key Vault https://kv.example.net throttled (429)", "get", "id"),
        new SecretStateException(SecretStatuses.Locked, "GetValue"),
        new SecretNotFoundException("abc"),
        new SecretAccessDeniedException("TENANT_DISABLED"),
    };

    [Theory]
    [MemberData(nameof(SecretErrors))]
    public async Task EverySecretError_DataSourceUnavailable_WithTheInnerMessage_ValueNeverLogged(Exception error)
    {
        BlocksContext.SetContext(null);
        var s = _secrets.Add("t", Value);
        _secrets.FailWith = error;
        var (resolver, _) = Build();

        var act = () => resolver.ResolveAsync("t", s.Id);

        var ex = (await act.Should().ThrowAsync<DataSourceUnavailableException>()).Which;
        ex.Message.Should().Be(error.Message);
        ex.InnerException.Should().BeSameAs(error);
        _logs.Logs.Should().Contain(l => l.Message.Contains("secret-read-failed") && l.Message.Contains(s.Id) && l.Message.Contains(error.GetType().Name));
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("VeryPrivatePw"));
    }

    [Fact]
    public void HasNoCacheClientDependency()
    {
        typeof(DataSourceSecretResolver).GetConstructors().SelectMany(c => c.GetParameters()).Select(p => p.ParameterType)
            .Should().NotContain(typeof(ICacheClient));
        typeof(DataSourceSecretResolver).GetFields(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
            .Select(f => f.FieldType).Should().NotContain(typeof(ICacheClient)).And.NotContain(typeof(string));
    }
}
