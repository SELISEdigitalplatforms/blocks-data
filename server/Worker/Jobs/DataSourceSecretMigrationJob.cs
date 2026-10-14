using System.Text;
using System.Text.RegularExpressions;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Worker.Jobs;

/// <summary>Totals of one job run.</summary>
public sealed class DscRunSummary
{
    public string Mode { get; set; } = string.Empty;
    public bool Ran { get; set; }
    public int Tenants { get; set; }
    public int Ok { get; set; }
    public int Changed { get; set; }
    public int Blockers { get; set; }
    public int Problems { get; set; }
    public int Errors { get; set; }
    public Dictionary<string, string> Results { get; } = new(StringComparer.Ordinal);
}

/// <summary>
/// Moves every tenant's <c>DataServiceConfigurations</c> doc to the root DB with its connection string in a
/// Blocks <c>service</c> secret (data SPEC1 §3.6). Off unless <c>DataSourceSecretMigration__Mode</c> is set
/// (<c>plan</c> | <c>apply</c> | <c>verify</c> | <c>scrub-redis</c>). One replica runs it (Redis lock). It runs
/// inside the app's own Secrets, Mongo and Redis setup, so a secret lands in the store the app reads.
/// Never logs a value. There is no mode that writes a value into Redis.
/// </summary>
public sealed class DataSourceSecretMigrationJob : BackgroundService
{
    public const string ModeConfigKey = "DataSourceSecretMigration:Mode";
    public const string DataDeployedConfigKey = "DataSourceSecretMigration:DataDeployed";
    public const string LockKey = "datagateway::dsc-secret-migration::lock";
    public static readonly TimeSpan LockTtl = TimeSpan.FromHours(2);
    public const string MigrationUser = "blocks-data-dsc-migration";
    public const string MarkerField = "MigratedFrom";
    public const string FlagField = "ValueChangedAfterDeploy";

    public const string ModePlan = "plan";
    public const string ModeApply = "apply";
    public const string ModeVerify = "verify";
    public const string ModeScrub = "scrub-redis";

    /// <summary>Fields compared between root doc and tenant copy (same as the script's DSC_FIELDS).</summary>
    public static readonly string[] CompareFields =
        ["DatabaseName", "IsCollectionNameEditable", "CollectionNamePattern", "ProjectKey", "ProjectShortKey", "AnalyticsConfiguration", "IsDeleted"];

    /// <summary>Fields copied root → tenant copy by the repair (CompareFields minus IsDeleted).</summary>
    public static readonly string[] RepairFields =
        ["DatabaseName", "IsCollectionNameEditable", "CollectionNamePattern", "AnalyticsConfiguration", "ProjectKey", "ProjectShortKey"];

    private static readonly Regex SecretIdPattern = new("^[0-9a-f]{32}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly IConfiguration _configuration;
    private readonly IDscMigrationDatabases _databases;
    private readonly IDscMigrationRedis _redis;
    private readonly IDataSourceSecretResolver _secrets;
    private readonly ILogger<DataSourceSecretMigrationJob> _logger;

    public DataSourceSecretMigrationJob(
        IConfiguration configuration,
        IDscMigrationDatabases databases,
        IDscMigrationRedis redis,
        IDataSourceSecretResolver secrets,
        ILogger<DataSourceSecretMigrationJob> logger)
    {
        _configuration = configuration;
        _databases = databases;
        _redis = redis;
        _secrets = secrets;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var mode = _configuration[ModeConfigKey];
        if (string.IsNullOrWhiteSpace(mode))
            return;

        try
        {
            await RunAsync(mode.Trim(), stoppingToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError("[dsc-migration] mode={Mode} run failed error={ErrorType}", mode, ex.GetType().Name);
        }
    }

    public async Task<DscRunSummary> RunAsync(string mode, CancellationToken cancellationToken)
    {
        var summary = new DscRunSummary { Mode = mode };
        if (mode is not (ModePlan or ModeApply or ModeVerify or ModeScrub))
        {
            _logger.LogWarning("[dsc-migration] mode={Mode} unknown mode: nothing done (modes: plan, apply, verify, scrub-redis)", mode);
            return summary;
        }

        if (mode == ModeScrub && !string.Equals(_configuration[DataDeployedConfigKey], "yes", StringComparison.Ordinal))
        {
            _logger.LogWarning("[dsc-migration] mode={Mode} refused: needs DataSourceSecretMigration__DataDeployed=yes (no old data pod left)", mode);
            return summary;
        }

        var token = Guid.NewGuid().ToString("N");
        if (!await _redis.TryLockAsync(LockKey, token, LockTtl))
        {
            _logger.LogInformation("[dsc-migration] mode={Mode} skipped: another replica holds the lock", mode);
            return summary;
        }

        try
        {
            summary.Ran = true;
            if (mode == ModePlan)
                _logger.LogInformation("[dsc-migration] mode={Mode} value-store={Store}", mode, ResolveValueStore());

            var tenants = await _databases.GetTenantsAsync(cancellationToken);
            var allTenantIds = tenants.Select(t => t.TenantId).ToHashSet(StringComparer.Ordinal);
            foreach (var tenant in tenants)
            {
                cancellationToken.ThrowIfCancellationRequested();
                summary.Tenants++;
                TenantOutcome outcome;
                try
                {
                    outcome = await RunTenantAsync(mode, tenant, allTenantIds, cancellationToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    outcome = TenantOutcome.Error($"error:{ex.GetType().Name}");
                }

                summary.Results[tenant.TenantId] = outcome.Result;
                switch (outcome.Kind)
                {
                    case OutcomeKind.Ok: summary.Ok++; break;
                    case OutcomeKind.Changed: summary.Changed++; break;
                    case OutcomeKind.Blocker: summary.Blockers++; break;
                    case OutcomeKind.Problem: summary.Problems++; break;
                    case OutcomeKind.Error: summary.Errors++; break;
                }

                _logger.LogInformation("[dsc-migration] mode={Mode} tenant={TenantId} result={Result}", mode, tenant.TenantId, outcome.Result);
            }

            _logger.LogInformation(
                "[dsc-migration] mode={Mode} totals tenants={Tenants} ok={Ok} changed={Changed} blockers={Blockers} problems={Problems} errors={Errors}",
                mode, summary.Tenants, summary.Ok, summary.Changed, summary.Blockers, summary.Problems, summary.Errors);
            return summary;
        }
        finally
        {
            try
            {
                await _redis.ReleaseLockAsync(LockKey, token);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("[dsc-migration] lock release failed error={ErrorType} (it expires after {Ttl})", ex.GetType().Name, LockTtl);
            }
        }
    }

    #region Per tenant

    private enum OutcomeKind { Ok, Changed, Blocker, Problem, Error }

    private readonly record struct TenantOutcome(OutcomeKind Kind, string Result)
    {
        public static TenantOutcome Ok(string r) => new(OutcomeKind.Ok, r);
        public static TenantOutcome Changed(string r) => new(OutcomeKind.Changed, r);
        public static TenantOutcome Blocker(string r) => new(OutcomeKind.Blocker, "blocker:" + r);
        public static TenantOutcome Problem(string r) => new(OutcomeKind.Problem, "problem:" + r);
        public static TenantOutcome Error(string r) => new(OutcomeKind.Error, r);
    }

    private sealed class TenantState
    {
        public required DscTenant Tenant { get; init; }
        public required List<BsonDocument> Live { get; init; }
        public BsonDocument? Root { get; init; }
        public required Dictionary<string, string> Hash { get; init; }

        /// <summary>
        /// The first live doc in natural order = the doc the app reads (unsorted <c>Find(IsDeleted == false).FirstOrDefault()</c>).
        /// Extra live docs (owner decision 2026-10-14) are only logged, never changed or deleted.
        /// </summary>
        public BsonDocument? Copy => Live.Count > 0 ? Live[0] : null;
        public bool RootOverwritten => Root is not null && !Root.Contains("ConfigItemId") && Root.Contains("DbConnectionString");
        public bool Flagged => Root is not null && Root.TryGetValue(FlagField, out var f) && f.IsBoolean && f.AsBoolean;
        public string Tid => Tenant.TenantId;
    }

    private async Task<TenantOutcome> RunTenantAsync(string mode, DscTenant tenant, HashSet<string> allTenantIds, CancellationToken ct)
    {
        var state = await ReadStateAsync(tenant, allTenantIds, ct);

        if (state.Live.Count == 0 && state.Root is null)
            return TenantOutcome.Ok("no-dsc");

        if (state.RootOverwritten)
            return mode == ModeVerify ? TenantOutcome.Problem("overwritten-root-doc") : TenantOutcome.Blocker("overwritten-root-doc");

        if (state.Live.Count > 1)
            _logger.LogWarning(
                "[dsc-migration] mode={Mode} tenant={TenantId} live-docs={LiveDocs} using={CopyId} (first in natural order, the doc the app reads) extra-ids-kept={ExtraIds}",
                mode, state.Tid, state.Live.Count, IdText(state.Live[0]["_id"]),
                string.Join(",", state.Live.Skip(1).Select(d => IdText(d["_id"]))));

        // Root doc and no tenant copy (os project after X11, a create by new code, or after cleanup): OK.
        if (state.Copy is null)
            return mode switch
            {
                ModeVerify => await VerifyRootIdAsync(state, "root-only"),
                ModeScrub => await ScrubAsync(state),
                _ => TenantOutcome.Ok("root-only")
            };

        var kind = ValueKind(state.Copy.GetValue("DbConnectionString", BsonNull.Value), out var copyValue);
        if (kind == "invalid")
            return mode == ModeVerify ? TenantOutcome.Problem("invalid-base64") : TenantOutcome.Blocker("invalid-base64");

        return mode switch
        {
            ModePlan => await PlanAsync(state, kind, copyValue),
            ModeApply => await ApplyAsync(state, kind, copyValue),
            ModeVerify => await VerifyAsync(state, kind, copyValue),
            _ => await ScrubAsync(state)
        };
    }

    private async Task<TenantState> ReadStateAsync(DscTenant tenant, HashSet<string> allTenantIds, CancellationToken ct)
    {
        // The root tenant's tenant DB is the root DB: there a tenant copy = a doc without ConfigItemId whose _id is
        // not a TenantId (a doc without ConfigItemId and _id = TenantId is an overwritten root doc, never a copy).
        var copyFilter = tenant.IsRootTenant
            ? new BsonDocument
            {
                { "ConfigItemId", new BsonDocument("$exists", false) },
                { "_id", new BsonDocument("$nin", new BsonArray(allTenantIds)) }
            }
            : new BsonDocument();
        // $natural hint: the order must be the app's read order (unsorted FirstOrDefault). Without it the root
        // tenant's _id $nin clause makes Mongo walk the _id index and return _id order.
        var docs = await _databases.TenantDb(tenant).GetCollection<BsonDocument>(DscMigrationConstants.CollectionName)
            .Find(copyFilter, new FindOptions { Hint = new BsonDocument("$natural", 1) }).ToListAsync(ct);
        var live = docs.Where(d => d.TryGetValue("IsDeleted", out var v) && v.IsBoolean && !v.AsBoolean).ToList();
        var root = await RootCollection.Find(new BsonDocument("_id", tenant.TenantId)).FirstOrDefaultAsync(ct);
        var hash = await _redis.GetHashAsync(tenant.TenantId);
        return new TenantState { Tenant = tenant, Live = live, Root = root, Hash = hash };
    }

    private IMongoCollection<BsonDocument> RootCollection =>
        _databases.Root.GetCollection<BsonDocument>(DscMigrationConstants.CollectionName);

    private async Task<TenantOutcome> PlanAsync(TenantState s, string kind, string? copyValue)
    {
        var blocker = LegacyRedisBlocker(s, copyValue);
        if (blocker is not null)
            return TenantOutcome.Blocker(blocker);

        var rootState = s.Root is null ? "missing" : s.Root.Contains(MarkerField) ? "migrated" : "new-code";
        if (s.Root is not null && IsCopyNewer(s) && s.Flagged && !await SameValueAsync(s, kind, copyValue))
            return TenantOutcome.Blocker("value-conflict");
        return TenantOutcome.Ok($"kind={kind} root={rootState} hash={HashState(s.Hash)}");
    }

    private async Task<TenantOutcome> ApplyAsync(TenantState s, string kind, string? copyValue)
    {
        var blocker = LegacyRedisBlocker(s, copyValue);
        if (blocker is not null)
            return TenantOutcome.Blocker(blocker);

        if (s.Root is null)
            return await CreateRootDocAsync(s, kind, copyValue);

        if (IsCopyNewer(s))
        {
            if (s.Flagged)
            {
                // Never rotate from the tenant copy of a flagged tenant (its value is old by design).
                if (!await SameValueAsync(s, kind, copyValue))
                    return TenantOutcome.Blocker("value-conflict");
                await SetRootFieldsFromCopyAsync(s, null);
                return TenantOutcome.Changed("resynced");
            }

            var secretId = await SecretIdForCopyValueAsync(s, kind, copyValue);
            await SetRootFieldsFromCopyAsync(s, secretId);
            return TenantOutcome.Changed("resynced");
        }

        // Root newer (or same date) and non-secret fields differ: a tenant-copy write failed after the root write.
        var differing = RepairFields.Where(f => !SameField(s.Root, s.Copy!, f)).ToList();
        if (differing.Count > 0)
        {
            var set = new BsonDocument();
            foreach (var f in differing)
                set[f] = s.Root.GetValue(f, BsonNull.Value);
            set["LastUpdatedDate"] = s.Root.GetValue("LastUpdatedDate", BsonNull.Value);
            await _databases.TenantDb(s.Tenant).GetCollection<BsonDocument>(DscMigrationConstants.CollectionName)
                .UpdateOneAsync(new BsonDocument("_id", s.Copy!["_id"]), new BsonDocument("$set", set));
            return TenantOutcome.Changed("copy-repaired");
        }

        return TenantOutcome.Ok("in-sync");
    }

    private async Task<TenantOutcome> CreateRootDocAsync(TenantState s, string kind, string? copyValue)
    {
        string? secretId;
        var created = false;
        switch (kind)
        {
            case "blank": secretId = null; break;
            case "default": secretId = DataSourceSecretResolver.DefaultSentinel; break;
            default:
                (secretId, created) = await ReuseOrSetSecretAsync(s.Tid, copyValue!);
                break;
        }

        var root = new BsonDocument();
        foreach (var element in s.Copy!)
        {
            if (element.Name is "_id" or "DbConnectionString")
                continue;
            root[element.Name] = element.Value;
        }
        root.InsertAt(0, new BsonElement("_id", s.Tid));
        root["ConfigItemId"] = IdText(s.Copy["_id"]);
        root["DbConnectionSecretId"] = secretId is null ? BsonNull.Value : new BsonString(secretId);
        root[MarkerField] = DscMigrationConstants.CollectionName;
        if (!root.Contains("LastUpdatedDate") || !root["LastUpdatedDate"].IsValidDateTime)
            root["LastUpdatedDate"] = DateTime.UtcNow;

        try
        {
            await RootCollection.InsertOneAsync(root);
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            if (created && secretId is not null)
                await _secrets.ExecuteAsync(s.Tid, async x => { await x.DeleteAsync(secretId); return true; }, MigrationUser);
            return TenantOutcome.Ok("root-exists");
        }

        return TenantOutcome.Changed($"migrated kind={kind}");
    }

    /// <summary>
    /// Orphan guard: an active <c>data-source-connection</c> secret (tag <c>data</c>) of this tenant that no other
    /// root doc uses is reused (rotated when its value differs), so a crash between secret and root doc never
    /// leaves a second secret. Else a new secret.
    /// </summary>
    private async Task<(string SecretId, bool Created)> ReuseOrSetSecretAsync(string tenantId, string value)
    {
        var found = await _secrets.ExecuteAsync(tenantId, x => x.FindAsync(new SecretFilter
        {
            Tags = [DataGatewayConfigurationService.SecretTag],
            Status = SecretStatuses.Active,
            PageSize = 100
        }), MigrationUser);

        foreach (var candidate in found.Data.Where(d =>
                     d.Name == DataGatewayConfigurationService.SecretName && d.Status == SecretStatuses.Active))
        {
            var usedByOther = await RootCollection.Find(new BsonDocument
            {
                { "DbConnectionSecretId", candidate.SecretId },
                { "_id", new BsonDocument("$ne", tenantId) }
            }).AnyAsync();
            if (usedByOther)
                continue;

            var current = await _secrets.ExecuteAsync(tenantId, x => x.GetValueAsync(candidate.SecretId), MigrationUser);
            if (!string.Equals(current, value, StringComparison.Ordinal))
                await _secrets.ExecuteAsync(tenantId, async x =>
                {
                    await x.RotateAsync(candidate.SecretId, new RotateSecretRequest { Value = value });
                    return true;
                }, MigrationUser);
            return (candidate.SecretId, false);
        }

        var id = await _secrets.ExecuteAsync(tenantId, x => x.SetAsync(new SetSecretRequest
        {
            Name = DataGatewayConfigurationService.SecretName,
            Type = SecretTypes.Service,
            Tags = [DataGatewayConfigurationService.SecretTag],
            OrganizationId = "default",
            Value = value
        }), MigrationUser);
        return (id, true);
    }

    /// <summary>Secret id the root doc must point at for the (newer, not flagged) tenant copy value.</summary>
    private async Task<string?> SecretIdForCopyValueAsync(TenantState s, string kind, string? copyValue)
    {
        if (kind == "blank")
            return null;
        if (kind == "default")
            return DataSourceSecretResolver.DefaultSentinel;

        var rootId = RootSecretId(s.Root!);
        if (rootId is not null && SecretIdPattern.IsMatch(rootId))
        {
            var meta = await _secrets.ExecuteAsync(s.Tid, x => x.GetAsync(rootId), MigrationUser);
            if (meta is not null && (meta.Status == SecretStatuses.Active || meta.Status == SecretStatuses.Locked))
            {
                string? current = null;
                if (meta.Status == SecretStatuses.Active)
                {
                    try
                    {
                        current = await _secrets.ExecuteAsync(s.Tid, x => x.GetValueAsync(rootId), MigrationUser);
                    }
                    catch (SecretNotFoundException)
                    {
                        current = null;
                    }
                }
                if (!string.Equals(current, copyValue, StringComparison.Ordinal))
                    await _secrets.ExecuteAsync(s.Tid, async x =>
                    {
                        await x.RotateAsync(rootId, new RotateSecretRequest { Value = copyValue! });
                        return true;
                    }, MigrationUser);
                return rootId;
            }
        }

        return (await ReuseOrSetSecretAsync(s.Tid, copyValue!)).SecretId;
    }

    /// <summary>Copies the compared fields copy → root with <c>$set</c> (marker kept, never a whole-doc replace).</summary>
    private async Task SetRootFieldsFromCopyAsync(TenantState s, string? secretIdOrKeep)
    {
        var set = new BsonDocument();
        foreach (var f in CompareFields)
            set[f] = s.Copy!.GetValue(f, BsonNull.Value);
        set["LastUpdatedDate"] = s.Copy!.GetValue("LastUpdatedDate", BsonNull.Value);
        if (!s.Flagged)
            set["DbConnectionSecretId"] = secretIdOrKeep is null ? BsonNull.Value : new BsonString(secretIdOrKeep);
        await RootCollection.UpdateOneAsync(new BsonDocument("_id", s.Tid), new BsonDocument("$set", set));
    }

    private async Task<TenantOutcome> VerifyAsync(TenantState s, string kind, string? copyValue)
    {
        if (s.Root is null)
            return TenantOutcome.Problem("no-root-doc");
        if (s.Root.Contains("DbConnectionString"))
            return TenantOutcome.Problem("root-holds-connection-string");
        if (!string.Equals(s.Root.GetValue("ConfigItemId", BsonNull.Value).ToString(), IdText(s.Copy!["_id"]), StringComparison.Ordinal))
            return TenantOutcome.Problem("config-item-id-differs");

        if (IsCopyNewer(s))
        {
            // Same rule as apply: value-conflict only when a flagged root doc's value differs from the newer copy.
            var conflict = s.Flagged && !await SameValueAsync(s, kind, copyValue);
            return TenantOutcome.Problem(conflict ? "value-conflict" : "copy-newer");
        }

        var differing = CompareFields.FirstOrDefault(f => !SameField(s.Root, s.Copy!, f));
        if (differing is not null)
            return TenantOutcome.Problem($"field-differs={differing}");

        if (s.Flagged)
        {
            var rootCheck = await VerifyRootIdAsync(s, "value-changed-after-deploy");
            if (rootCheck.Kind != OutcomeKind.Ok)
                return rootCheck;
            return PendingScrub(s) ?? rootCheck;
        }

        var sid = RootSecretId(s.Root);
        switch (kind)
        {
            case "blank" when !string.IsNullOrEmpty(sid):
                return TenantOutcome.Problem("kind-differs");
            case "default" when !DataSourceSecretResolver.IsDefault(sid):
                return TenantOutcome.Problem("kind-differs");
            case "custom":
                if (sid is null || !SecretIdPattern.IsMatch(sid))
                    return TenantOutcome.Problem("kind-differs");
                string? resolved;
                try
                {
                    resolved = await _secrets.ExecuteAsync(s.Tid, x => x.GetValueAsync(sid), MigrationUser);
                }
                catch (Exception ex) when (ex is SecretException)
                {
                    return TenantOutcome.Problem($"secret-unusable={ex.GetType().Name}");
                }
                if (!string.Equals(resolved, copyValue, StringComparison.Ordinal))
                    return TenantOutcome.Problem("value-differs");
                break;
        }

        return PendingScrub(s) ?? TenantOutcome.Ok($"verified kind={kind}");
    }

    /// <summary>Only "the root doc's own id is valid": null, "default", or a 32-hex id whose secret resolves in that tenant.</summary>
    private async Task<TenantOutcome> VerifyRootIdAsync(TenantState s, string okResult)
    {
        if (s.Root!.Contains("DbConnectionString"))
            return TenantOutcome.Problem("root-holds-connection-string");
        var sid = RootSecretId(s.Root);
        if (DataSourceSecretResolver.IsSentinel(sid))
            return PendingScrub(s) ?? TenantOutcome.Ok(okResult);
        if (!SecretIdPattern.IsMatch(sid!))
            return TenantOutcome.Problem("invalid-secret-id");
        try
        {
            await _secrets.ExecuteAsync(s.Tid, x => x.GetValueAsync(sid!), MigrationUser);
        }
        catch (Exception ex) when (ex is SecretException)
        {
            return TenantOutcome.Problem($"secret-unusable={ex.GetType().Name}");
        }
        return PendingScrub(s) ?? TenantOutcome.Ok(okResult);
    }

    private async Task<TenantOutcome> ScrubAsync(TenantState s)
    {
        if (!s.Hash.TryGetValue(GqlDbRepository.HashFieldLegacyConnectionString, out var legacyB64))
            return TenantOutcome.Ok("no-legacy-field");
        if (s.Root is null)
            return TenantOutcome.Blocker("no-root-doc");

        if (ValueKind(legacyB64, out var legacyValue) == "invalid")
            return TenantOutcome.Blocker("legacy-invalid-base64");

        var sid = RootSecretId(s.Root);
        bool same;
        if (sid is null)
            same = string.IsNullOrWhiteSpace(legacyValue);
        else if (DataSourceSecretResolver.IsDefault(sid))
            same = DataSourceSecretResolver.IsDefault(legacyValue);
        else
        {
            try
            {
                var resolved = await _secrets.ExecuteAsync(s.Tid, x => x.GetValueAsync(sid), MigrationUser);
                same = string.Equals(resolved, legacyValue, StringComparison.Ordinal);
            }
            catch (Exception ex) when (ex is SecretException)
            {
                return TenantOutcome.Blocker($"secret-unusable={ex.GetType().Name}");
            }
        }

        if (!same)
            return TenantOutcome.Blocker("legacy-value-differs");

        var ok = await _redis.ScrubAsync(s.Tid, sid ?? string.Empty, DateTime.UtcNow.Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture));
        return ok ? TenantOutcome.Changed("scrubbed") : TenantOutcome.Error("scrub-transaction-failed");
    }

    #endregion

    #region Helpers

    /// <summary>Legacy Redis value ≠ tenant copy value → blocker (the app uses the Redis value today).</summary>
    private static string? LegacyRedisBlocker(TenantState s, string? copyValue)
    {
        if (!s.Hash.TryGetValue(GqlDbRepository.HashFieldLegacyConnectionString, out var legacyB64))
            return null;
        if (s.Flagged)
            return null;
        if (ValueKind(legacyB64, out var legacyValue) == "invalid")
            return "legacy-invalid-base64";
        return string.Equals(legacyValue ?? string.Empty, copyValue ?? string.Empty, StringComparison.Ordinal) ? null : "redis-differs";
    }

    private static TenantOutcome? PendingScrub(TenantState s) =>
        s.Hash.ContainsKey(GqlDbRepository.HashFieldLegacyConnectionString) ? TenantOutcome.Problem("pending-scrub") : null;

    private async Task<bool> SameValueAsync(TenantState s, string kind, string? copyValue)
    {
        var sid = RootSecretId(s.Root!);
        if (sid is null)
            return kind == "blank";
        if (DataSourceSecretResolver.IsDefault(sid))
            return kind == "default";
        if (kind != "custom")
            return false;
        try
        {
            var resolved = await _secrets.ExecuteAsync(s.Tid, x => x.GetValueAsync(sid), MigrationUser);
            return string.Equals(resolved, copyValue, StringComparison.Ordinal);
        }
        catch (SecretException)
        {
            return false;
        }
    }

    private static bool IsCopyNewer(TenantState s)
    {
        var copyDate = s.Copy!.GetValue("LastUpdatedDate", BsonNull.Value);
        var rootDate = s.Root!.GetValue("LastUpdatedDate", BsonNull.Value);
        return copyDate.IsValidDateTime && rootDate.IsValidDateTime && copyDate.ToUniversalTime() > rootDate.ToUniversalTime();
    }

    private static string? RootSecretId(BsonDocument root)
    {
        var v = root.GetValue("DbConnectionSecretId", BsonNull.Value);
        return v.IsBsonNull ? null : v.ToString();
    }

    private static string HashState(Dictionary<string, string> hash) =>
        hash.Count == 0 ? "none"
        : hash.ContainsKey(GqlDbRepository.HashFieldLegacyConnectionString) ? "legacy"
        : hash.ContainsKey(GqlDbRepository.HashFieldSecretId) ? "secret-id"
        : "other";

    /// <summary>blank | default | custom | invalid (same rule as the script's connKind). The value stays in memory only.</summary>
    internal static string ValueKind(BsonValue b64Value, out string? value)
    {
        value = null;
        if (b64Value.IsBsonNull)
            return "blank";
        if (!b64Value.IsString)
            return "invalid";
        return ValueKind(b64Value.AsString, out value);
    }

    internal static string ValueKind(string? b64, out string? value)
    {
        value = null;
        if (string.IsNullOrEmpty(b64))
            return "blank";
        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(b64);
        }
        catch (FormatException)
        {
            return "invalid";
        }
        value = Encoding.UTF8.GetString(bytes);
        if (string.IsNullOrWhiteSpace(value))
            return "blank";
        return DataSourceSecretResolver.IsDefault(value) ? "default" : "custom";
    }

    private static string IdText(BsonValue id) => id.IsString ? id.AsString : id.ToString() ?? string.Empty;

    private static bool SameField(BsonDocument a, BsonDocument b, string field) =>
        Canon(a.GetValue(field, BsonNull.Value)).Equals(Canon(b.GetValue(field, BsonNull.Value)));

    /// <summary>Key-sorted copy (field order never makes two docs differ).</summary>
    private static BsonValue Canon(BsonValue v)
    {
        if (v.IsBsonDocument)
        {
            var sorted = new BsonDocument();
            foreach (var e in v.AsBsonDocument.Elements.OrderBy(e => e.Name, StringComparer.Ordinal))
                sorted.Add(e.Name, Canon(e.Value));
            return sorted;
        }
        if (v.IsBsonArray)
            return new BsonArray(v.AsBsonArray.Select(Canon));
        if (v.IsValidDateTime)
            return new BsonDateTime(v.ToUniversalTime());
        return v;
    }

    private static string ResolveValueStore()
    {
        var configured = Environment.GetEnvironmentVariable("Secrets__ValueStore");
        if (!string.IsNullOrWhiteSpace(configured))
            return configured;
        return string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("KeyVault__KeyVaultUrl")) ? "Database" : "KeyVault";
    }

    #endregion
}
