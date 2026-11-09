using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.LockIn;

/// <summary>
/// Characterisation of the GraphQL schema the gateway builds from a tenant's drafts: the SDL text is compared with a
/// golden file, so a refactor can prove the public API surface did not change.
/// </summary>
[Collection("Mongo")]
public class SchemaSdlLockInTests
{
    private readonly MongoFixture _fixture;

    public SchemaSdlLockInTests(MongoFixture fixture) => _fixture = fixture;

    private async Task RunAsync(string caseName, LockInTenant tenant)
    {
        await using var harness = await GatewayLockInHarness.CreateAsync(_fixture, tenant);

        GoldenFile.Match(caseName, harness.Sdl, ".graphql");
    }

    [Fact]
    public Task StandardTenant_SdlUnchanged() => RunAsync("sdl-standard", LockInTenant.Standard);

    [Fact]
    public Task DtoOnlyTenant_SdlUnchanged() => RunAsync("sdl-dto-only", LockInTenant.DtoOnly);

    [Fact]
    public Task EmptyTenant_SdlUnchanged() => RunAsync("sdl-empty", LockInTenant.Empty);
}
