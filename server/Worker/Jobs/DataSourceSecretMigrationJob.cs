using System.Text;
using System.Text.RegularExpressions;
using Blocks.Secrets;
using DataGateway.DomainService.DataSources;
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
/// One-time migration of the data-source config to the one model (owner 2026-10-15, no fallback): for EVERY tenant
/// a Blocks <c>Service</c> secret (<c>data-source</c>, plain value, <c>default</c> = the tenant's Blocks DB) and one
/// root doc in <c>BlocksRootDb.DataServiceConfigurations</c> (<c>_id</c> = TenantId, same fields as the old tenant doc,
/// <c>DbConnectionSecretId</c> always set). Old tenant docs are never touched here (the migration script deletes them
/// after the new code runs). Off unless <c>DataSourceSecretMigration__Mode</c> is set
/// (<c>plan</c> | <c>apply</c> | <c>verify</c> | <c>scrub-redis</c>). One replica runs it (Redis lock). Never logs a
/// value. The only Redis write is the removal of the legacy <c>DbConnectionString</c> field (scrub-redis).
/// Works on <see cref="BsonDocument"/>, not on the server entity.
/// </summary>
public sealed class DataSourceSecretMigrationJob : BackgroundService
{
    public const string ModeConfigKey = "DataSourceSecretMigration:Mode";
    public const string DataDeployedConfigKey = "DataSourceSecretMigration:DataDeployed";
    public const string LockKey = "datagateway::dsc-secret-migration::lock";
    public static readonly TimeSpan LockTtl = TimeSpan.FromHours(2);
    public const string MigrationUser = "blocks-data-dsc-migration";

    public const string SecretName = "data-source";
    public const string DefaultValue = "default";

    public const string ModePlan = "plan";
    public const string ModeApply = "apply";
    public const string ModeVerify = "verify";
    public const string ModeScrub = "scrub-redis";

    /// <summary>Fields the old model had and the root doc never has (removed by apply when found).</summary>
    public static readonly string[] ForbiddenRootFields = ["DbConnectionString", "ConfigItemId", "ValueChangedAfterDeploy", "MigratedFrom"];

    /// <summary>Fields compared between root doc and the chosen old doc (verify, root not changed by the new code).</summary>
    public static readonly string[] CompareFields =
        ["DatabaseName", "IsCollectionNameEditable", "CollectionNamePattern", "ProjectKey", "ProjectShortKey", "AnalyticsConfiguration", "IsDeleted"];

    private static readonly string[] NotCopiedFields =
        ["_id", "ItemId", "TenantId", "DbConnectionSecretId", .. ForbiddenRootFields];

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

        if (mode == ModeScrub && !DataDeployed)
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

    private bool DataDeployed => string.Equals(_configuration[DataDeployedConfigKey], "yes", StringComparison.Ordinal);

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

    private enum SecretHealth { Valid, Missing, Broken }

    private sealed class TenantState
    {
        public required DscTenant Tenant { get; init; }

        /// <summary>Every live (IsDeleted == false) old doc, in the order the old app's query returns them.</summary>
        public required List<BsonDocument> Live { get; init; }
        public BsonDocument? Root { get; init; }
        public required Dictionary<string, string> Hash { get; init; }

        /// <summary>The ONE doc the old app reads: the first of <c>Find({IsDeleted:false})</c>, no sort.</summary>
        public BsonDocument? Old => Live.Count > 0 ? Live[0] : null;
        public string Tid => Tenant.TenantId;
    }

    private async Task<TenantOutcome> RunTenantAsync(string mode, DscTenant tenant, HashSet<string> allTenantIds, CancellationToken ct)
    {
        // Owner rule: a disabled tenant is left alone in every mode (nothing read, written or created).
        if (tenant.IsDisabled)
            return TenantOutcome.Ok("skipped-disabled");

        var state = await ReadStateAsync(tenant, allTenantIds, ct);
        if (state.Live.Count > 1)
            _logger.LogWarning(
                "[dsc-migration] mode={Mode} tenant={TenantId} live-docs={Count} using={UsedId} (first of the old app's query, the doc it reads) extra-ids={ExtraIds}",
                mode, state.Tid, state.Live.Count, IdText(state.Old!["_id"]), string.Join(",", state.Live.Skip(1).Select(d => IdText(d["_id"]))));

        return mode switch
        {
            ModePlan => await PlanAsync(state),
            ModeApply => await ApplyAsync(state),
            ModeVerify => await VerifyAsync(state),
            _ => await ScrubAsync(state)
        };
    }

    /// <summary>
    /// The old app's own read (blocks-data origin/main <c>DataGatewayConfigurationService.GetConfiguration</c> →
    /// <c>DbRepository.GetItemAsync(filter)</c>, blocks-os <c>GetDataGatewayConfigurationAsync</c>):
    /// <c>Find({IsDeleted:false}).FirstOrDefault()</c> in the tenant DB, no sort, no hint. The same query is sent
    /// here and the whole result is kept, so the first doc is the one the old app returns. In the root DB (root
    /// tenant) the root docs of the new model are removed in memory (their _id is a TenantId).
    /// </summary>
    private async Task<TenantState> ReadStateAsync(DscTenant tenant, HashSet<string> allTenantIds, CancellationToken ct)
    {
        var live = new List<BsonDocument>();
        if (tenant.IsRootTenant || (!string.IsNullOrWhiteSpace(tenant.DbConnectionString) && !string.IsNullOrWhiteSpace(tenant.DbName)))
        {
            var docs = await _databases.TenantDb(tenant).GetCollection<BsonDocument>(DscMigrationConstants.CollectionName)
                .Find(new BsonDocument("IsDeleted", false)).ToListAsync(ct);
            live = tenant.IsRootTenant ? docs.Where(d => !IsRootDocOf(d, allTenantIds)).ToList() : docs;
        }

        var root = await RootCollection.Find(new BsonDocument("_id", tenant.TenantId)).FirstOrDefaultAsync(ct);
        var hash = await _redis.GetHashAsync(tenant.TenantId);
        return new TenantState { Tenant = tenant, Live = live, Root = root, Hash = hash };
    }

    /// <summary>A root doc of the new model (<c>_id</c> = a TenantId, or it has a secret id); never an old tenant doc.</summary>
    private static bool IsRootDocOf(BsonDocument d, HashSet<string> allTenantIds) =>
        d.Contains("DbConnectionSecretId") || (d["_id"].IsString && allTenantIds.Contains(d["_id"].AsString));

    private IMongoCollection<BsonDocument> RootCollection =>
        _databases.Root.GetCollection<BsonDocument>(DscMigrationConstants.CollectionName);

    private async Task<TenantOutcome> PlanAsync(TenantState s)
    {
        var kind = OldKind(s, out var oldValue);
        if (kind == "invalid")
            return TenantOutcome.Blocker("invalid-base64");
        if (IsOverwritten(s.Root))
            return TenantOutcome.Blocker("overwritten-root-doc");

        string rootState;
        if (s.Root is null)
            rootState = "missing";
        else
        {
            var health = await SecretHealthAsync(s, RootSecretId(s.Root));
            rootState = health != SecretHealth.Valid ? "secret-broken"
                : ForbiddenRootFields.Any(f => s.Root.Contains(f)) ? "legacy-fields"
                : "ok";
        }

        var redis = RedisDiffers(s, oldValue) ? " redis=differs" : string.Empty;
        return TenantOutcome.Ok($"kind={kind} root={rootState} live-docs={s.Live.Count} hash={HashState(s.Hash)}{redis}");
    }

    private async Task<TenantOutcome> ApplyAsync(TenantState s)
    {
        var kind = OldKind(s, out var oldValue);
        if (kind == "invalid")
            return TenantOutcome.Blocker("invalid-base64");
        if (IsOverwritten(s.Root))
            return TenantOutcome.Blocker("overwritten-root-doc");

        var value = oldValue ?? DefaultValue;
        if (s.Root is null)
            return await CreateRootDocAsync(s, kind, value);

        var health = await SecretHealthAsync(s, RootSecretId(s.Root));
        if (health != SecretHealth.Valid)
        {
            // Broken or missing linked secret: a new secret and the root doc repointed (captcha's repair path). The old
            // secret is left as it is. Only possible while the old doc still gives the value.
            if (s.Old is null)
                return TenantOutcome.Blocker("root-secret-broken");
            var newId = await CreateSecretAsync(s.Tid, value);
            try
            {
                await RootCollection.UpdateOneAsync(
                    new BsonDocument("_id", s.Tid),
                    new BsonDocument("$set", new BsonDocument("DbConnectionSecretId", newId)));
            }
            catch
            {
                await TryDeleteSecretAsync(s.Tid, newId);
                throw;
            }
            return TenantOutcome.Changed("secret-repaired");
        }

        // Root doc with a valid secret: nothing to create. Fields of the old model are removed (one model, no leftovers).
        var present = ForbiddenRootFields.Where(f => s.Root.Contains(f)).ToList();
        if (present.Count == 0)
            return TenantOutcome.Ok("root-exists");

        var unset = new BsonDocument();
        foreach (var f in present)
            unset[f] = 1;
        await RootCollection.UpdateOneAsync(new BsonDocument("_id", s.Tid), new BsonDocument("$unset", unset));
        return TenantOutcome.Changed("root-normalized");
    }

    private async Task<TenantOutcome> CreateRootDocAsync(TenantState s, string kind, string value)
    {
        var secretId = await CreateSecretAsync(s.Tid, value);
        var root = BuildRootDoc(s, secretId);
        try
        {
            await RootCollection.InsertOneAsync(root);
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            // Race (the new server created its own default root doc): insert-only, the loser deletes its own secret.
            await TryDeleteSecretAsync(s.Tid, secretId);
            return TenantOutcome.Ok("root-exists");
        }
        catch
        {
            await TryDeleteSecretAsync(s.Tid, secretId);
            throw;
        }

        return TenantOutcome.Changed($"migrated kind={kind}");
    }

    /// <summary>Same fields as the old doc (no connection string, no helper fields) + TenantId + the secret id.</summary>
    private static BsonDocument BuildRootDoc(TenantState s, string secretId)
    {
        var root = new BsonDocument("_id", s.Tid);
        if (s.Old is not null)
        {
            foreach (var element in s.Old.Where(e => !NotCopiedFields.Contains(e.Name)))
                root[element.Name] = element.Value;
        }
        else
        {
            // New tenant without an old doc: the seed doc defaults.
            var now = DateTime.UtcNow;
            root["CreatedDate"] = now;
            root["CreatedBy"] = MigrationUser;
            root["LastUpdatedDate"] = now;
            root["LastUpdatedBy"] = MigrationUser;
            root["Language"] = string.Empty;
            root["OrganizationId"] = "default";
            root["Tags"] = new BsonArray();
            root["IsDeleted"] = false;
            root["DatabaseName"] = "default";
            root["IsCollectionNameEditable"] = false;
            root["CollectionNamePattern"] = "sb_{SchemaName}s";
            root["ProjectKey"] = string.Empty;
            root["ProjectShortKey"] = string.Empty;
            root["AnalyticsConfiguration"] = BsonNull.Value;
        }

        root["TenantId"] = s.Tid;
        root["DbConnectionSecretId"] = secretId;
        if (!root.Contains("LastUpdatedDate") || !root["LastUpdatedDate"].IsValidDateTime)
            root["LastUpdatedDate"] = DateTime.UtcNow;
        return root;
    }

    private Task<string> CreateSecretAsync(string tenantId, string value) =>
        _secrets.ExecuteAsync(tenantId, x => x.SetAsync(new SetSecretRequest
        {
            Name = SecretName,
            Type = SecretTypes.Service,
            Value = value,
            Description = "Data source connection"
        }), MigrationUser);

    private async Task TryDeleteSecretAsync(string tenantId, string secretId)
    {
        try
        {
            await _secrets.ExecuteAsync(tenantId, async x => { await x.DeleteAsync(secretId); return true; }, MigrationUser);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[dsc-migration] tenant={TenantId} own secret {SecretId} could not be deleted error={ErrorType}", tenantId, secretId, ex.GetType().Name);
        }
    }

    private async Task<TenantOutcome> VerifyAsync(TenantState s)
    {
        if (s.Root is null)
            return TenantOutcome.Problem("no-root-doc");
        if (IsOverwritten(s.Root))
            return TenantOutcome.Problem("overwritten-root-doc");
        var legacyField = ForbiddenRootFields.FirstOrDefault(f => s.Root.Contains(f));
        if (legacyField is not null)
            return TenantOutcome.Problem($"legacy-field={legacyField}");

        var sid = RootSecretId(s.Root);
        if (sid is null || !SecretIdPattern.IsMatch(sid))
            return TenantOutcome.Problem("invalid-secret-id");

        string? resolved = null;
        var locked = false;
        try
        {
            var meta = await _secrets.ExecuteAsync(s.Tid, x => x.GetAsync(sid), MigrationUser);
            if (meta is null)
                return TenantOutcome.Problem("secret-missing");
            if (meta.Status == SecretStatuses.Locked)
                locked = true;
            else if (meta.Status != SecretStatuses.Active)
                return TenantOutcome.Problem($"secret-status={meta.Status}");
            else
                resolved = await _secrets.ExecuteAsync(s.Tid, x => x.GetValueAsync(sid), MigrationUser);
        }
        catch (Exception ex) when (ex is SecretException)
        {
            return TenantOutcome.Problem($"secret-unusable={ex.GetType().Name}");
        }

        // The new code may have changed the root doc (a save); then it is no longer comparable with the old doc.
        if (s.Old is not null && !RootNewerThanOld(s))
        {
            var differing = CompareFields.FirstOrDefault(f => !SameField(s.Root, s.Old, f));
            if (differing is not null)
                return TenantOutcome.Problem($"field-differs={differing}");

            if (resolved is not null)
            {
                OldKind(s, out var oldValue);
                if (!string.Equals(resolved, oldValue ?? DefaultValue, StringComparison.Ordinal))
                    return TenantOutcome.Problem("value-differs");
            }
        }

        if (DataDeployed && s.Hash.ContainsKey(DscMigrationConstants.HashFieldLegacyConnectionString))
            return TenantOutcome.Problem("pending-scrub");

        var kind = locked ? "locked" : IsDefault(resolved) || string.IsNullOrWhiteSpace(resolved) ? "default" : "custom";
        return TenantOutcome.Ok($"verified kind={kind}");
    }

    private async Task<TenantOutcome> ScrubAsync(TenantState s)
    {
        if (!s.Hash.ContainsKey(DscMigrationConstants.HashFieldLegacyConnectionString))
            return TenantOutcome.Ok("no-legacy-field");

        // Only after the root doc and its secret exist: the new server then reloads the hash from the root doc.
        if (s.Root is null)
            return TenantOutcome.Blocker("no-root-doc");
        if (await SecretHealthAsync(s, RootSecretId(s.Root)) != SecretHealth.Valid)
            return TenantOutcome.Blocker("root-secret-broken");

        var ok = await _redis.RemoveLegacyFieldAsync(s.Tid);
        return ok ? TenantOutcome.Changed("scrubbed") : TenantOutcome.Error("scrub-failed");
    }

    #endregion

    #region Helpers

    /// <summary>blank | default | custom | invalid of the chosen old doc (none = blank). The value stays in memory only.</summary>
    private static string OldKind(TenantState s, out string? value)
    {
        value = null;
        if (s.Old is null)
            return "default";
        var kind = ValueKind(s.Old.GetValue("DbConnectionString", BsonNull.Value), out var decoded);
        value = kind == "custom" ? decoded : null;
        return kind == "blank" ? "default" : kind;
    }

    /// <summary>Root doc that holds an old-style connection string and no usable secret id (never written by the new code).</summary>
    private static bool IsOverwritten(BsonDocument? root) =>
        root is not null && root.Contains("DbConnectionString") && (RootSecretId(root) is not { } id || !SecretIdPattern.IsMatch(id));

    private async Task<SecretHealth> SecretHealthAsync(TenantState s, string? secretId)
    {
        if (secretId is null || !SecretIdPattern.IsMatch(secretId))
            return SecretHealth.Missing;
        try
        {
            var meta = await _secrets.ExecuteAsync(s.Tid, x => x.GetAsync(secretId), MigrationUser);
            if (meta is null)
                return SecretHealth.Missing;
            return meta.Status is SecretStatuses.Active or SecretStatuses.Locked ? SecretHealth.Valid : SecretHealth.Broken;
        }
        catch (SecretNotFoundException)
        {
            return SecretHealth.Missing;
        }
    }

    private static bool RootNewerThanOld(TenantState s)
    {
        var oldDate = s.Old!.GetValue("LastUpdatedDate", BsonNull.Value);
        var rootDate = s.Root!.GetValue("LastUpdatedDate", BsonNull.Value);
        return oldDate.IsValidDateTime && rootDate.IsValidDateTime && rootDate.ToUniversalTime() > oldDate.ToUniversalTime();
    }

    /// <summary>The legacy Redis value is what the old app really connected with; a different value is only reported.</summary>
    private static bool RedisDiffers(TenantState s, string? oldValue)
    {
        if (!s.Hash.TryGetValue(DscMigrationConstants.HashFieldLegacyConnectionString, out var legacyB64))
            return false;
        if (ValueKind(legacyB64, out var legacyValue) == "invalid")
            return true;
        return !string.Equals(legacyValue ?? DefaultValue, oldValue ?? DefaultValue, StringComparison.Ordinal);
    }

    private static string? RootSecretId(BsonDocument root)
    {
        var v = root.GetValue("DbConnectionSecretId", BsonNull.Value);
        return v.IsBsonNull ? null : v.ToString();
    }

    private static string HashState(Dictionary<string, string> hash) =>
        hash.Count == 0 ? "none"
        : hash.ContainsKey(DscMigrationConstants.HashFieldLegacyConnectionString) ? "legacy"
        : hash.ContainsKey(DscMigrationConstants.HashFieldSecretId) ? "secret-id"
        : "other";

    /// <summary>"default" in any case (as the old app's <c>IsNullOrWhiteSpaceOrDefault</c>).</summary>
    internal static bool IsDefault(string? value) =>
        string.Equals(value, DefaultValue, StringComparison.OrdinalIgnoreCase);

    /// <summary>blank | default | custom | invalid (the base64 rule of the old app). The value stays in memory only.</summary>
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
        {
            value = null;
            return "blank";
        }
        return IsDefault(value) ? "default" : "custom";
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
