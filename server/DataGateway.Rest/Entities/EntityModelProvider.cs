using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess.Rules;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Schemas;
using DataGateway.DomainService.Services;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DataGateway.Rest.Entities;

/// <summary>
/// Loads the <see cref="EntityModel"/> of one entity of the tenant's live published version, from that entity's
/// stored view (<see cref="IEntityViewStore"/>), and caches it by tenant, version and name. A version published
/// before views existed has none: the first request builds them from the snapshot, once per tenant and version.
/// When storing the views fails, the entities cut from the snapshot are kept for a short while as packed bytes (a
/// "built" slot), so a persistent failure costs one snapshot load per window, not one per request.
/// The model cache holds found models only. A name that is certainly not an entity of the version is remembered apart,
/// in a small bounded list (4096 names, a minute after last use), so repeating it costs no store call and answers as
/// fast as a hit; a new version is a new key, so a publish is seen at once. Register as a singleton: it owns the caches.
/// </summary>
public sealed class EntityModelProvider : IEntityModelProvider, IDisposable
{
    private readonly ISchemaVersionStore _versions;
    private readonly IEntityViewStore _views;
    private readonly ISchemaSnapshotStore _snapshots;
    private readonly ILogger<EntityModelProvider> _logger;
    private readonly TimeSpan _slidingExpiration;
    private readonly TimeProvider _time;
    private readonly MemoryCache _cache;

    // Builds are serialised per (tenant, version) on one of a fixed set of locks: the same key always gets the same
    // lock, two keys may share one, and none is ever removed.
    private const int LockStripeCount = 64;
    private readonly SemaphoreSlim[] _buildLocks = Enumerable.Range(0, LockStripeCount).Select(_ => new SemaphoreSlim(1, 1)).ToArray();

    // The packed entities of versions whose views could not be stored, by "{tenant}|{version}".
    private const int MaxBuiltSlots = 16;
    private static readonly TimeSpan BuiltSlotLifetime = TimeSpan.FromMinutes(2);
    private readonly object _builtGate = new();
    private readonly Dictionary<string, BuiltSlot> _built = new(StringComparer.Ordinal);
    private long _builtSequence;

    /// <summary>Compressed per-entity views (<see cref="SchemaSnapshotStore.Pack"/>), never the snapshot itself.</summary>
    private sealed record BuiltSlot(long Sequence, DateTimeOffset ExpiresAt, IReadOnlyDictionary<string, byte[]> Views);

    // Names known not to be entities of a version, so a repeated unknown name answers at once, with no store call and
    // in the same time as a cached hit (an anonymous caller cannot tell names apart by timing). Least recently used
    // first out when full; an entry unused for a minute is gone.
    private const int MaxNegativeEntries = 4096;
    private static readonly TimeSpan NegativeLifetime = TimeSpan.FromMinutes(1);
    private readonly object _negativeGate = new();
    private readonly Dictionary<(string Tenant, long Version, string Name), LinkedListNode<NegativeEntry>> _negative = new();
    private readonly LinkedList<NegativeEntry> _negativeByUse = new();

    /// <summary>
    /// A name a version lacks. <see cref="SlotSequence"/> is set when only a built slot said so: the entry then holds
    /// only while that slot lives, so an expired or dropped slot is rebuilt as before.
    /// </summary>
    private sealed class NegativeEntry((string Tenant, long Version, string Name) key, long? slotSequence, DateTimeOffset lastUsed)
    {
        public (string Tenant, long Version, string Name) Key { get; } = key;
        public long? SlotSequence { get; } = slotSequence;
        public DateTimeOffset LastUsed { get; set; } = lastUsed;
    }

    /// <summary>How a view lookup ended: the source, or whether its absence is certain (and, if a slot said so, which).</summary>
    private readonly record struct ViewLookup(SchemaSource? Source, bool Definitive = false, long? SlotSequence = null);

    public EntityModelProvider(
        ISchemaVersionStore versions,
        IEntityViewStore views,
        ISchemaSnapshotStore snapshots,
        IOptions<EntityViewCacheOptions> options,
        ILogger<EntityModelProvider> logger,
        TimeProvider? timeProvider = null)
    {
        _versions = versions ?? throw new ArgumentNullException(nameof(versions));
        _views = views ?? throw new ArgumentNullException(nameof(views));
        _snapshots = snapshots ?? throw new ArgumentNullException(nameof(snapshots));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        var settings = options?.Value ?? new EntityViewCacheOptions();
        _slidingExpiration = TimeSpan.FromMinutes(settings.SlidingExpirationMinutes);
        _time = timeProvider ?? TimeProvider.System;
        // Every entry weighs 1, so the size limit counts models.
        _cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = settings.MaxEntries });
    }

    /// <summary>How many models are cached right now (approximate while others are using the cache).</summary>
    internal int CachedCount => _cache.Count;

    /// <summary>How many names are remembered as not found.</summary>
    internal int NegativeCount
    {
        get
        {
            lock (_negativeGate)
                return _negative.Count;
        }
    }

    public async Task<EntityModel?> GetAsync(string tenantId, string schemaName)
    {
        var version = await _versions.GetCachedAsync(tenantId);
        if (version <= 0)
            return null;

        var key = $"{tenantId}|{version}|{schemaName}";
        if (_cache.TryGetValue(key, out EntityModel? cached) && cached is not null)
            return cached;

        var negativeKey = (tenantId, version, schemaName);
        if (IsKnownMissing(negativeKey))
            return null;

        var lookup = await LoadViewAsync(tenantId, version, schemaName);
        var mini = lookup.Source;
        if (mini is null)
        {
            if (lookup.Definitive)
                RememberMissing(negativeKey, lookup.SlotSequence);
            return null;
        }

        var model = Assemble(mini, schemaName);
        if (model is not null)
        {
            _cache.Set(key, model, new MemoryCacheEntryOptions { Size = 1, SlidingExpiration = _slidingExpiration });
        }

        return model;
    }

    /// <summary>
    /// The entity's mini source. A miss is definitive when the version's views are complete (marker present, view
    /// missing) or a live built slot lacks the name; a missing snapshot is not, since a later request may find one.
    /// </summary>
    private async Task<ViewLookup> LoadViewAsync(string tenantId, long version, string schemaName)
    {
        if (await _views.HasVersionAsync(tenantId, version))
            return Stored(await _views.LoadAsync(tenantId, version, schemaName));

        var versionKey = $"{tenantId}|{version}";
        if (TryGetBuilt(versionKey, schemaName, out var fromSlot, out var slotSequence))
            return FromSlot(fromSlot, slotSequence);

        // The version has no views yet: build them, one request at a time per tenant and version.
        var gate = _buildLocks[LockStripe(tenantId, version)];
        await gate.WaitAsync();
        try
        {
            // Another request may have built them, or kept them, while this one waited.
            if (await _views.HasVersionAsync(tenantId, version))
                return Stored(await _views.LoadAsync(tenantId, version, schemaName));
            if (TryGetBuilt(versionKey, schemaName, out fromSlot, out slotSequence))
                return FromSlot(fromSlot, slotSequence);

            var snapshot = await _snapshots.LoadAsync(tenantId, version);
            if (snapshot is null)
            {
                _logger.LogWarning("Schema version {Version} of tenant {TenantId} has no snapshot to build entity views from", version, LogMasking.OneLine(tenantId));
                return new ViewLookup(null);
            }

            try
            {
                await _views.WriteAsync(tenantId, version, snapshot);
            }
            catch (Exception ex)
            {
                // Some views may be missing and the version is not marked complete. Answer from the snapshot in hand
                // for a while instead of reloading it and writing again on every request.
                _logger.LogWarning(ex, "Building the entity views of version {Version} of tenant {TenantId} failed", version, LogMasking.OneLine(tenantId));
                KeepBuilt(versionKey, snapshot);
                return TryGetBuilt(versionKey, schemaName, out fromSlot, out slotSequence)
                    ? FromSlot(fromSlot, slotSequence)
                    : new ViewLookup(null);
            }

            // The write marks the version complete, so a missing view now means no such entity.
            return Stored(await _views.LoadAsync(tenantId, version, schemaName));
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>From a complete version's views: absent means the version has no such entity.</summary>
    private static ViewLookup Stored(SchemaSource? source) => new(source, Definitive: source is null);

    private static ViewLookup FromSlot(SchemaSource? source, long slotSequence) =>
        new(source, Definitive: source is null, SlotSequence: slotSequence);

    /// <summary>
    /// Whether the name is remembered as missing. An entry unused for a minute, or one whose built slot has expired or
    /// been replaced, no longer counts and is dropped.
    /// </summary>
    private bool IsKnownMissing((string Tenant, long Version, string Name) key)
    {
        var now = _time.GetUtcNow();
        lock (_negativeGate)
        {
            if (!_negative.TryGetValue(key, out var node))
                return false;

            var entry = node.Value;
            if (now - entry.LastUsed >= NegativeLifetime || (entry.SlotSequence is { } sequence && !IsSlotLive(key, sequence, now)))
            {
                _negativeByUse.Remove(node);
                _negative.Remove(key);
                return false;
            }

            entry.LastUsed = now;
            _negativeByUse.Remove(node);
            _negativeByUse.AddFirst(node);
            return true;
        }
    }

    private void RememberMissing((string Tenant, long Version, string Name) key, long? slotSequence)
    {
        var now = _time.GetUtcNow();
        lock (_negativeGate)
        {
            if (_negative.TryGetValue(key, out var existing))
            {
                _negativeByUse.Remove(existing);
                _negative.Remove(key);
            }

            while (_negative.Count >= MaxNegativeEntries && _negativeByUse.Last is { } oldest)
            {
                _negativeByUse.RemoveLast();
                _negative.Remove(oldest.Value.Key);
            }

            _negative[key] = _negativeByUse.AddFirst(new NegativeEntry(key, slotSequence, now));
        }
    }

    private bool IsSlotLive((string Tenant, long Version, string Name) key, long sequence, DateTimeOffset now)
    {
        lock (_builtGate)
        {
            return _built.TryGetValue($"{key.Tenant}|{key.Version}", out var slot)
                && slot.Sequence == sequence
                && slot.ExpiresAt > now;
        }
    }

    private static int LockStripe(string tenantId, long version) =>
        (StringComparer.Ordinal.GetHashCode(tenantId) ^ version.GetHashCode()) & (LockStripeCount - 1);

    /// <summary>Packs every entity of <paramref name="snapshot"/> into a slot, replacing the oldest when all are taken.</summary>
    private void KeepBuilt(string versionKey, SchemaSource snapshot)
    {
        var views = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        foreach (var (name, source) in EntityViewBuilder.Build(snapshot))
            views[name] = SchemaSnapshotStore.Pack(source).CompressedBytes;

        lock (_builtGate)
        {
            var now = _time.GetUtcNow();
            foreach (var expired in _built.Where(kv => kv.Value.ExpiresAt <= now).Select(kv => kv.Key).ToList())
                _built.Remove(expired);
            while (_built.Count >= MaxBuiltSlots && !_built.ContainsKey(versionKey))
                _built.Remove(_built.MinBy(kv => kv.Value.Sequence).Key);
            _built[versionKey] = new BuiltSlot(++_builtSequence, now + BuiltSlotLifetime, views);
        }
    }

    /// <summary>
    /// Whether a live slot exists for the version; <paramref name="view"/> is then the requested entity's source, or
    /// null when the slot has no such entity. An expired slot is dropped and counts as none.
    /// </summary>
    private bool TryGetBuilt(string versionKey, string schemaName, out SchemaSource? view, out long sequence)
    {
        byte[]? packed = null;
        lock (_builtGate)
        {
            if (!_built.TryGetValue(versionKey, out var slot))
            {
                view = null;
                sequence = 0;
                return false;
            }

            if (slot.ExpiresAt <= _time.GetUtcNow())
            {
                _built.Remove(versionKey);
                view = null;
                sequence = 0;
                return false;
            }

            sequence = slot.Sequence;
            slot.Views.TryGetValue(schemaName, out packed);
        }

        view = packed is null ? null : SchemaSnapshotStore.Unpack(packed);
        return true;
    }

    /// <summary>The entity named <paramref name="schemaName"/> with its DTOs and reference targets, from one entity's mini source.</summary>
    private EntityModel? Assemble(SchemaSource mini, string schemaName)
    {
        var assembled = SchemaAssembler.Assemble(mini);
        var entity = assembled.FirstOrDefault(s => s.SchemaType == SchemaType.Entity && string.Equals(s.SchemaName, schemaName, StringComparison.Ordinal));
        if (entity is null)
            return null;

        var dtos = new Dictionary<string, SchemaDefinitionExtended>(StringComparer.Ordinal);
        foreach (var schema in assembled.Where(s => !ReferenceEquals(s, entity)))
            dtos.TryAdd(schema.SchemaName, schema);

        // As the GraphQL build does, but lenient: a rule on a missing target is left unchecked here.
        var systemTargets = mini.SystemEntitySchemas
            .Select(SystemLookupTargets.Restrict)
            .OfType<SchemaDefinition>()
            .Select(SchemaAssembler.SystemTarget);
        var references = ReferenceTargets.Build([.. assembled, .. systemTargets], strict: false, _logger);

        return new EntityModel(entity, references, dtos);
    }

    public void Dispose()
    {
        _cache.Dispose();
        foreach (var gate in _buildLocks)
            gate.Dispose();
    }
}
