using System.Collections.Concurrent;
using Blocks.Genesis;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace XUnitTest.Infrastructure;

/// <summary>
/// In-memory <see cref="ISecretService"/>. Like Blocks.Secrets' <c>SecretAuthorizationService</c> it refuses a
/// context that is not authenticated or has no tenant, and it scopes every secret to the caller's tenant.
/// Records every call (with the tenant and user of the context) so tests can assert call order.
/// </summary>
public sealed class FakeSecretService : ISecretService
{
    public sealed class Stored
    {
        public required string Id { get; init; }
        public required string TenantId { get; init; }
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string Status { get; set; } = SecretStatuses.Active;
        public string? Value { get; set; }
        public List<string> Tags { get; set; } = [];
        public string? OrganizationId { get; set; }
    }

    public ConcurrentDictionary<string, Stored> Secrets { get; } = new();
    public ConcurrentQueue<(string Op, string Tenant, string User, string? SecretId)> Calls { get; } = new();

    /// <summary>Run before every call (e.g. read the root doc to check the flag order, or throw).</summary>
    public Func<string, string?, Task>? BeforeCall { get; set; }

    /// <summary>Thrown by every call when set (vault down).</summary>
    public Exception? FailWith { get; set; }

    public int ValueReads => Calls.Count(c => c.Op == "GetValue");

    public Stored Add(string tenantId, string value, string status = SecretStatuses.Active, string? id = null)
    {
        var s = new Stored
        {
            Id = id ?? Guid.NewGuid().ToString("N"),
            TenantId = tenantId,
            Name = "data-source-connection",
            Type = SecretTypes.Service,
            Status = status,
            Value = value,
            Tags = ["data"]
        };
        Secrets[s.Id] = s;
        return s;
    }

    private async Task<string> CallerAsync(string op, string? secretId)
    {
        var ctx = BlocksContext.GetContext();
        if (ctx is null || !ctx.IsAuthenticated || string.IsNullOrWhiteSpace(ctx.TenantId))
            throw new SecretAccessDeniedException("NO_TENANT_CONTEXT");
        Calls.Enqueue((op, ctx.TenantId, ctx.UserId, secretId));
        if (BeforeCall is not null)
            await BeforeCall(op, secretId);
        if (FailWith is not null)
            throw FailWith;
        return ctx.TenantId;
    }

    private Stored? Find(string tenant, string id) =>
        Secrets.TryGetValue(id, out var s) && s.TenantId == tenant ? s : null;

    public async Task<string> SetAsync(SetSecretRequest request, CancellationToken cancellationToken = default)
    {
        var tenant = await CallerAsync("Set", null);
        var s = new Stored
        {
            Id = Guid.NewGuid().ToString("N"),
            TenantId = tenant,
            Name = request.Name,
            Type = request.Type,
            Value = request.Value,
            Tags = request.Tags?.ToList() ?? [],
            OrganizationId = request.OrganizationId
        };
        Secrets[s.Id] = s;
        return s.Id;
    }

    public async Task<SecretResult?> GetAsync(string secretId, CancellationToken cancellationToken = default)
    {
        var tenant = await CallerAsync("Get", secretId);
        var s = Find(tenant, secretId);
        return s is null ? null : new SecretResult { SecretId = s.Id, Name = s.Name, Type = s.Type, Status = s.Status, Tags = s.Tags };
    }

    public async Task<SecretListResult> FindAsync(SecretFilter filter, CancellationToken cancellationToken = default)
    {
        var tenant = await CallerAsync("Find", null);
        var list = Secrets.Values
            .Where(s => s.TenantId == tenant)
            .Where(s => filter.Tags is null || filter.Tags.Count == 0 || s.Tags.Intersect(filter.Tags).Any())
            .Where(s => filter.Status is null || s.Status == filter.Status)
            .Where(s => filter.IncludeDeleted || s.Status != SecretStatuses.Deleted)
            .Select(s => new SecretResult { SecretId = s.Id, Name = s.Name, Type = s.Type, Status = s.Status, Tags = s.Tags })
            .ToList();
        return new SecretListResult { Data = list, TotalCount = list.Count };
    }

    public async Task<string> GetValueAsync(string secretId, CancellationToken cancellationToken = default)
    {
        var tenant = await CallerAsync("GetValue", secretId);
        var s = Find(tenant, secretId) ?? throw new SecretNotFoundException(secretId);
        if (s.Status != SecretStatuses.Active)
            throw new SecretStateException(s.Status, "GetValue");
        return s.Value ?? throw new SecretNotFoundException(secretId, "VALUE_MISSING");
    }

    public async Task RotateAsync(string secretId, RotateSecretRequest request, CancellationToken cancellationToken = default)
    {
        var tenant = await CallerAsync("Rotate", secretId);
        var s = Find(tenant, secretId) ?? throw new SecretNotFoundException(secretId);
        s.Value = request.Value;
    }

    public async Task DeleteAsync(string secretId, CancellationToken cancellationToken = default)
    {
        var tenant = await CallerAsync("Delete", secretId);
        var s = Find(tenant, secretId) ?? throw new SecretNotFoundException(secretId);
        s.Status = SecretStatuses.Deleted;
    }

    public Task<IReadOnlyDictionary<string, string>> SetManyAsync(IReadOnlyCollection<SetSecretRequest> requests, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<IReadOnlyList<SecretTagEntry>> GetTagsAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<IReadOnlyDictionary<string, string>> GetValuesAsync(IReadOnlyCollection<string> secretIds, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task UpdateAsync(string secretId, UpdateSecretRequest request, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task LockAsync(string secretId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task UnlockAsync(string secretId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task RestoreAsync(string secretId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task UpdateAccessAsync(string secretId, SecretAccess access, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<SecretAuditListResult> GetAuditLogsAsync(SecretAuditFilter filter, CancellationToken cancellationToken = default) => throw new NotSupportedException();

    /// <summary>A real <see cref="DataSourceSecretResolver"/> whose scopes resolve this fake.</summary>
    public DataSourceSecretResolver Resolver()
    {
        var services = new ServiceCollection();
        services.AddScoped<ISecretService>(_ => this);
        return new DataSourceSecretResolver(services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>(),
            NullLogger<DataSourceSecretResolver>.Instance);
    }
}
