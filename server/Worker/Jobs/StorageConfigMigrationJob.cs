using Blocks.Genesis.Entities.Data;
using DomainService.Configuration;
using MongoDB.Driver;

namespace Worker.Jobs;

/// <summary>Totals of one storage-config migration run.</summary>
public sealed class StorageMigrationSummary
{
    public string Mode { get; set; } = string.Empty;
    public bool Ran { get; set; }
    public int Targets { get; set; }
    public int Ok { get; set; }
    public int Changed { get; set; }
    public int Problems { get; set; }
    public int Errors { get; set; }

    /// <summary>Target id (TenantId, or <c>seed:BlocksConfiguration</c>) → result text (names, counts, ids; never a value).</summary>
    public Dictionary<string, string> Results { get; } = new(StringComparer.Ordinal);
}

/// <summary>
/// One-time move of <c>StorageConfigurations</c> (every tenant DB + the seed DB <c>BlocksConfiguration</c>) to the
/// <c>storage-config:&lt;Name&gt;</c> rows of <c>KeyValueStores</c> + SecretStore (owner 2026-10-24). Off unless
/// <c>StorageConfigMigration__Mode</c> is set: <c>plan</c> (read-only counts) | <c>apply</c> (creates missing rows and their
/// secrets; never overwrites a row; safe to re-run) | <c>verify</c> (row, secrets and values match the old docs) |
/// <c>cleanup</c> (drops the old collection of a DB only when verify passes for every doc in it; needs
/// <c>StorageConfigMigration__SnapshotTaken=yes</c>). One replica runs it (Redis lock). Seed secrets live in the root
/// tenant. Never logs a value.
/// </summary>
public sealed class StorageConfigMigrationJob : BackgroundService
{
    public const string ModeConfigKey = "StorageConfigMigration:Mode";
    public const string SnapshotTakenConfigKey = "StorageConfigMigration:SnapshotTaken";
    public const string LockKey = "storage::config-migration::lock";
    public static readonly TimeSpan LockTtl = TimeSpan.FromHours(2);
    public const string SeedTargetId = "seed:" + StorageConfigMigrationDatabases.SeedDatabaseName;

    public const string ModePlan = "plan";
    public const string ModeApply = "apply";
    public const string ModeVerify = "verify";
    public const string ModeCleanup = "cleanup";

    private const string LogPrefix = "[storage-migration]";

    private readonly IConfiguration _configuration;
    private readonly IDscMigrationRedis _redis;
    private readonly IStorageConfigurationStore _store;
    private readonly StorageConfigMigrationVerifier _verifier;
    private readonly StorageConfigMigrationTargets _targets;
    private readonly ILogger<StorageConfigMigrationJob> _logger;

    public StorageConfigMigrationJob(
        IConfiguration configuration,
        IDscMigrationRedis redis,
        IStorageConfigurationStore store,
        StorageConfigMigrationVerifier verifier,
        StorageConfigMigrationTargets targets,
        ILogger<StorageConfigMigrationJob> logger)
    {
        _configuration = configuration;
        _redis = redis;
        _store = store;
        _verifier = verifier;
        _targets = targets;
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
            _logger.LogError("{Prefix} mode={Mode} run failed error={ErrorType}", LogPrefix, mode, ex.GetType().Name); // NOSONAR S6667 — type only
        }
    }

    public async Task<StorageMigrationSummary> RunAsync(string mode, CancellationToken cancellationToken)
    {
        var summary = new StorageMigrationSummary { Mode = mode };
        if (mode is not (ModePlan or ModeApply or ModeVerify or ModeCleanup))
        {
            _logger.LogWarning("{Prefix} mode={Mode} unknown mode: nothing done (modes: plan, apply, verify, cleanup)", LogPrefix, mode);
            return summary;
        }

        if (mode == ModeCleanup && !string.Equals(_configuration[SnapshotTakenConfigKey], "yes", StringComparison.Ordinal))
        {
            _logger.LogWarning("{Prefix} mode={Mode} refused: needs StorageConfigMigration__SnapshotTaken=yes (take a DB snapshot first)", LogPrefix, mode);
            return summary;
        }

        var token = Guid.NewGuid().ToString("N");
        if (!await _redis.TryLockAsync(LockKey, token, LockTtl))
        {
            _logger.LogInformation("{Prefix} mode={Mode} skipped: another replica holds the lock", LogPrefix, mode);
            return summary;
        }

        try
        {
            summary.Ran = true;
            await RunTargetsAsync(mode, summary, cancellationToken);
            _logger.LogInformation(
                "{Prefix} mode={Mode} totals targets={Targets} ok={Ok} changed={Changed} problems={Problems} errors={Errors}",
                LogPrefix, mode, summary.Targets, summary.Ok, summary.Changed, summary.Problems, summary.Errors);
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
                _logger.LogWarning("{Prefix} lock release failed error={ErrorType} (it expires after {Ttl})", LogPrefix, ex.GetType().Name, LockTtl); // NOSONAR S6667 — type only
            }
        }
    }

    private async Task RunTargetsAsync(string mode, StorageMigrationSummary summary, CancellationToken cancellationToken)
    {
        var (targets, skipped) = await _targets.BuildAsync(cancellationToken);
        foreach (var (id, result, isProblem) in skipped)
            Record(summary, mode, id, isProblem ? Outcome.Problem(result) : Outcome.Ok(result));
        foreach (var target in targets)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Outcome outcome;
            try
            {
                outcome = await RunTargetAsync(mode, target, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                outcome = Outcome.Error($"error:{ex.GetType().Name}");
            }

            Record(summary, mode, target.Id, outcome);
        }
    }

    private void Record(StorageMigrationSummary summary, string mode, string targetId, Outcome outcome)
    {
        summary.Targets++;
        summary.Results[targetId] = outcome.Result;
        switch (outcome.Kind)
        {
            case OutcomeKind.Ok: summary.Ok++; break;
            case OutcomeKind.Changed: summary.Changed++; break;
            case OutcomeKind.Problem: summary.Problems++; break;
            default: summary.Errors++; break;
        }

        _logger.LogInformation("{Prefix} mode={Mode} target={Target} result={Result}", LogPrefix, mode, targetId, outcome.Result);
    }

    #region Targets

    private enum OutcomeKind { Ok, Changed, Problem, Error }

    private readonly record struct Outcome(OutcomeKind Kind, string Result)
    {
        public static Outcome Ok(string r) => new(OutcomeKind.Ok, r);
        public static Outcome Changed(string r) => new(OutcomeKind.Changed, r);
        public static Outcome Problem(string r) => new(OutcomeKind.Problem, "problem:" + r);
        public static Outcome Error(string r) => new(OutcomeKind.Error, r);
    }

    private async Task<Outcome> RunTargetAsync(string mode, MigrationTarget target, CancellationToken ct)
    {
        var state = await _targets.ReadAsync(target, ct);
        foreach (var (name, docs) in state.ByName.Where(kv => kv.Value.Count > 1))
            _logger.LogWarning("{Prefix} target={Target} name={Name} docs={Count} using the first (the doc the old app reads) ids={Ids}",
                LogPrefix, target.Id, name, docs.Count, string.Join(",", docs.Select(d => d.ItemId)));
        if (state.ByName.Count > 1)
            _logger.LogInformation("{Prefix} target={Target} has {Count} named configs: {Names}", LogPrefix, target.Id, state.ByName.Count, string.Join(",", state.ByName.Keys));

        return mode switch
        {
            ModePlan => Plan(state),
            ModeApply => await ApplyAsync(state, ct),
            ModeVerify => await VerifyAsync(state, ct),
            _ => await CleanupAsync(state, ct)
        };
    }

    #endregion

    #region Modes

    private static Outcome Plan(MigrationTargetState s)
    {
        var migrated = s.ByName.Keys.Count(s.Rows.ContainsKey);
        var pending = s.ByName.Count - migrated;
        var text = $"docs={s.DocCount} names={s.ByName.Count} migrated={migrated} pending={pending} rows={s.Rows.Count}"
            + (s.NoNameCount > 0 ? $" no-name-docs={s.NoNameCount}" : string.Empty)
            + (s.ByName.Count > 1 ? " multiple-configs" : string.Empty);
        return s.NoNameCount > 0 ? Outcome.Problem(text) : Outcome.Ok(text);
    }

    private async Task<Outcome> ApplyAsync(MigrationTargetState s, CancellationToken ct)
    {
        int migrated = 0, exists = 0, errors = 0;
        foreach (var (name, docs) in s.ByName)
        {
            if (s.Rows.ContainsKey(name))
            {
                exists++;
                continue;
            }

            try
            {
                var created = await MigrateOneAsync(s.Target, docs[0], ct);
                if (created)
                    migrated++;
                else
                    exists++;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                errors++;
                _logger.LogWarning("{Prefix} target={Target} name={Name} apply failed error={ErrorType}", LogPrefix, s.Target.Id, name, ex.GetType().Name); // NOSONAR S6667 — type only
            }
        }

        var text = $"migrated={migrated} exists={exists} errors={errors}" + (s.NoNameCount > 0 ? $" no-name-docs={s.NoNameCount}" : string.Empty);
        if (errors > 0)
            return Outcome.Error(text);
        return migrated > 0 ? Outcome.Changed(text) : Outcome.Ok(text);
    }

    /// <summary>Insert-only: an existing row is never overwritten; a crashed run's secrets are reused (no duplicates).</summary>
    private async Task<bool> MigrateOneAsync(MigrationTarget target, StorageConfiguration doc, CancellationToken ct)
    {
        var migratedAt = DateTime.UtcNow;
        var settings = StorageSettings.FromConfiguration(doc);
        settings.MigratedAt = migratedAt;
        if (settings.CreatedDate == default)
            settings.CreatedDate = migratedAt;
        if (settings.LastUpdatedDate == default)
            settings.LastUpdatedDate = migratedAt;
        var result = await _store.CreateIfAbsentAsync(settings, StorageSecretValues.FromConfiguration(doc), target.Scope, ct);
        return result.Created;
    }

    private async Task<Outcome> VerifyAsync(MigrationTargetState s, CancellationToken ct)
    {
        var failures = await VerifyAllAsync(s, ct);
        var text = $"names={s.ByName.Count} ok={s.ByName.Count - failures.Count} failed={failures.Count}"
            + (s.NoNameCount > 0 ? $" no-name-docs={s.NoNameCount}" : string.Empty);
        return failures.Count > 0 || s.NoNameCount > 0 ? Outcome.Problem(text) : Outcome.Ok(text);
    }

    private async Task<Outcome> CleanupAsync(MigrationTargetState s, CancellationToken ct)
    {
        if (!s.CollectionExists)
            return Outcome.Ok("no-collection");

        var failures = await VerifyAllAsync(s, ct);
        if (failures.Count > 0 || s.NoNameCount > 0)
            return Outcome.Problem($"kept failed={failures.Count} no-name-docs={s.NoNameCount}");

        await _targets.DropLegacyAsync(s.Target, ct);
        return Outcome.Changed($"dropped docs={s.DocCount}");
    }

    /// <summary>Names that fail verify (each logged with its reason; never a value).</summary>
    private async Task<List<string>> VerifyAllAsync(MigrationTargetState s, CancellationToken ct)
    {
        var failures = new List<string>();
        foreach (var (name, docs) in s.ByName)
        {
            var reason = await _verifier.VerifyAsync(s.TenantId, docs[0], s.Rows.GetValueOrDefault(name), ct);
            if (reason is null)
                continue;
            failures.Add(name);
            _logger.LogWarning("{Prefix} target={Target} name={Name} verify failed reason={Reason}", LogPrefix, s.Target.Id, name, reason);
        }

        return failures;
    }

    #endregion
}
