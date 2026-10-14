using System.Collections.Concurrent;
using Blocks.Genesis;
using Blocks.Secrets;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using MongoDB.Bson;
using MongoDB.Driver;
using Worker.Jobs;
using XUnitTest.Infrastructure;

namespace XUnitTest.Worker;

/// <summary>
/// DSC secret migration Worker job (data SPEC1 §3.6; R-WORKER-JOB, R-WORKER-VALUE-CONFLICT, R-WORKER-NOCOPY,
/// R-FAIL-WORKER-CRASH, R-ROLL-SCRUB, C14, C15, C17, C28, C55, C57, C60, C63, C65, C68) on the real throwaway Mongo
/// (root DB + one DB per tenant), an in-memory secret service and an in-memory Redis.
/// </summary>
[Collection("Mongo")]
public class DataSourceSecretMigrationJobTests
{
    private const string Custom = "mongodb://u:JobSecretPw@byo:27017/";
    private const string Custom2 = "mongodb://u:OtherJobPw@byo2:27017/";
    private readonly MongoFixture _fixture;
    private readonly FakeDatabases _dbs;
    private readonly FakeRedis _redis = new();
    private readonly FakeSecretService _secrets = new();
    private readonly RecordingLoggerProvider _logs = new();

    public DataSourceSecretMigrationJobTests(MongoFixture fixture)
    {
        _fixture = fixture;
        _dbs = new FakeDatabases(fixture.CreateDatabase());
        BlocksContext.SetContext(null);
    }

    private DataSourceSecretMigrationJob Job(string? dataDeployed = null) => new(
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            [DataSourceSecretMigrationJob.DataDeployedConfigKey] = dataDeployed
        }).Build(),
        _dbs, _redis, _secrets.Resolver(), _logs.CreateLogger<DataSourceSecretMigrationJob>());

    private IMongoCollection<BsonDocument> Root => _dbs.Root.GetCollection<BsonDocument>("DataServiceConfigurations");
    private IMongoCollection<BsonDocument> Copies(string tenant) => _dbs.TenantDb(_dbs.Tenant(tenant)).GetCollection<BsonDocument>("DataServiceConfigurations");

    private static string B64(string v) => Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(v));

    private async Task CopyAsync(string tenant, string? value, DateTime? lastUpdated = null, string id = "copy-1", string pattern = "sb_{SchemaName}s", bool isRoot = false)
    {
        _dbs.Add(tenant, isRoot, _fixture);
        var doc = new BsonDocument
        {
            { "_id", id }, { "DatabaseName", "db-" + tenant }, { "IsDeleted", false }, { "IsCollectionNameEditable", false },
            { "CollectionNamePattern", pattern }, { "ProjectKey", tenant }, { "ProjectShortKey", "s" },
            { "LastUpdatedDate", lastUpdated ?? new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc) }
        };
        doc["DbConnectionString"] = value is null ? BsonNull.Value : B64(value);
        await Copies(tenant).InsertOneAsync(doc);
    }

    private async Task<BsonDocument?> RootDocAsync(string tenant) => await Root.Find(new BsonDocument("_id", tenant)).FirstOrDefaultAsync();

    private async Task<DscRunSummary> RunAsync(string mode, string? dataDeployed = null) => await Job(dataDeployed).RunAsync(mode, CancellationToken.None);

    // ---------------- guards ----------------

    [Fact]
    public async Task SecondReplica_SkipsWhenTheLockIsHeld()
    {
        await CopyAsync("t1", Custom);
        _redis.LockHeldElsewhere = true;
        var s = await RunAsync("apply");
        s.Ran.Should().BeFalse();
        (await RootDocAsync("t1")).Should().BeNull();
        _secrets.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task LockIsTaken_WithTtl2h_AndReleased()
    {
        await CopyAsync("t1", "default");
        await RunAsync("plan");
        _redis.LockCalls.Should().ContainSingle().Which.Should().Be(("datagateway::dsc-secret-migration::lock", TimeSpan.FromHours(2)));
        _redis.Released.Should().BeTrue();
    }

    [Theory]
    [InlineData("restore-redis")]
    [InlineData("whatever")]
    public async Task UnknownMode_LogsAndDoesNothing(string mode)
    {
        await CopyAsync("t1", Custom);
        var s = await RunAsync(mode);
        s.Ran.Should().BeFalse();
        _redis.LockCalls.Should().BeEmpty();
        (await RootDocAsync("t1")).Should().BeNull();
        _logs.Logs.Should().Contain(l => l.Message.Contains("unknown mode"));
    }

    [Fact]
    public async Task Scrub_RefusedWithoutDataDeployed()
    {
        await CopyAsync("t1", Custom);
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64(Custom), ["DatabaseName"] = "db" };
        var s = await RunAsync("scrub-redis");
        s.Ran.Should().BeFalse();
        _redis.Scrubbed.Should().BeEmpty();
        _logs.Logs.Should().Contain(l => l.Message.Contains("DataDeployed=yes"));
    }

    // ---------------- plan ----------------

    [Fact]
    public async Task Plan_NoWrites_ReportsBlockers()
    {
        await CopyAsync("two-live", Custom);
        await Copies("two-live").InsertOneAsync(new BsonDocument { { "_id", "copy-2" }, { "IsDeleted", false }, { "DbConnectionString", B64(Custom) } });
        await CopyAsync("bad-b64", null);
        await Copies("bad-b64").UpdateOneAsync(new BsonDocument(), new BsonDocument("$set", new BsonDocument("DbConnectionString", "%%%not-base64")));
        await CopyAsync("redis-diff", Custom);
        _redis.Hashes["redis-diff"] = new() { ["DbConnectionString"] = B64(Custom2), ["DatabaseName"] = "db" };
        await CopyAsync("fine", "default");

        var s = await RunAsync("plan");

        s.Results["two-live"].Should().StartWith("kind=custom root=missing", "2+ live docs: the first one is taken (owner 2026-10-14)");
        s.Results["bad-b64"].Should().Be("blocker:invalid-base64");
        s.Results["redis-diff"].Should().Be("blocker:redis-differs");
        s.Results["fine"].Should().StartWith("kind=default root=missing");
        (await Root.CountDocumentsAsync(new BsonDocument())).Should().Be(0);
        _secrets.Calls.Should().BeEmpty();
        _logs.Logs.Should().Contain(l => l.Message.Contains("value-store="));
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("JobSecretPw") || l.AllText().Contains("OtherJobPw"));
    }

    // ---------------- apply ----------------

    [Fact]
    public async Task Apply_Custom_ServiceSecretAndRootDoc_NoValueInRoot_MarkerKept_DateNotOlder()
    {
        var copyDate = new DateTime(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc);
        await CopyAsync("t1", Custom, copyDate);

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("migrated kind=custom");
        var secret = _secrets.Secrets.Values.Single();
        secret.TenantId.Should().Be("t1");
        secret.Type.Should().Be(SecretTypes.Service);
        secret.Name.Should().Be("data-source-connection");
        secret.Tags.Should().Equal("data");
        secret.Value.Should().Be(Custom);
        _secrets.Calls.Should().AllSatisfy(c => c.User.Should().Be("blocks-data-dsc-migration"));
        var root = (await RootDocAsync("t1"))!;
        root.Contains("DbConnectionString").Should().BeFalse();
        root["ConfigItemId"].AsString.Should().Be("copy-1");
        root["DbConnectionSecretId"].AsString.Should().Be(secret.Id);
        root["MigratedFrom"].AsString.Should().Be("DataServiceConfigurations");
        root["DatabaseName"].AsString.Should().Be("db-t1");
        root["LastUpdatedDate"].ToUniversalTime().Should().BeOnOrAfter(copyDate);
        _logs.Logs.Should().Contain(l => l.Message.Contains("[dsc-migration] mode=apply tenant=t1 result=migrated"));
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("JobSecretPw"));
    }

    [Theory]
    [InlineData("default", "default")]
    [InlineData(null, null)]
    [InlineData("", null)]
    public async Task Apply_DefaultOrBlank_NoSecret(string? value, string? expectedId)
    {
        await CopyAsync("t1", value);
        await RunAsync("apply");
        _secrets.Calls.Should().BeEmpty();
        var root = (await RootDocAsync("t1"))!;
        if (expectedId is null) root["DbConnectionSecretId"].IsBsonNull.Should().BeTrue();
        else root["DbConnectionSecretId"].AsString.Should().Be(expectedId);
    }

    [Fact]
    public async Task Apply_RootTenant_CopyLivesInTheRootDb_RootDocNextToIt()
    {
        await CopyAsync("root-t", Custom, isRoot: true, id: "legacy-root");
        await CopyAsync("t2", "default");

        await RunAsync("apply");

        (await RootDocAsync("root-t"))!["ConfigItemId"].AsString.Should().Be("legacy-root");
        (await Root.CountDocumentsAsync(new BsonDocument("_id", "legacy-root"))).Should().Be(1, "the root tenant's legacy doc is never touched");
        (await RootDocAsync("t2")).Should().NotBeNull();
        var rerun = await RunAsync("apply");
        rerun.Results["root-t"].Should().Be("in-sync", "root docs of other tenants in the root DB are never taken for the root tenant's copy");
    }

    [Fact]
    public async Task Apply_TwoLiveDocs_FirstInNaturalOrderCopied_ExtraLoggedAndUntouched()
    {
        // _ids chosen so _id order != natural order: the first inserted doc must win.
        await CopyAsync("t1", Custom, id: "zz-first");
        var extra = new BsonDocument
        {
            { "_id", "aa-second" }, { "DatabaseName", "db-extra" }, { "IsDeleted", false },
            { "DbConnectionString", B64(Custom2) }, { "LastUpdatedDate", new DateTime(2026, 10, 9, 0, 0, 0, DateTimeKind.Utc) }
        };
        await Copies("t1").InsertOneAsync(extra);

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("migrated kind=custom");
        var root = (await RootDocAsync("t1"))!;
        root["ConfigItemId"].AsString.Should().Be("zz-first");
        root["DatabaseName"].AsString.Should().Be("db-t1");
        _secrets.Secrets.Values.Should().ContainSingle().Which.Value.Should().Be(Custom);
        (await Copies("t1").CountDocumentsAsync(new BsonDocument())).Should().Be(2);
        (await Copies("t1").Find(new BsonDocument("_id", "aa-second")).SingleAsync()).Equals(extra).Should().BeTrue("extra live docs are never changed");
        _logs.Logs.Should().Contain(l => l.Message.Contains("tenant=t1 live-docs=2 using=zz-first") && l.Message.Contains("extra-ids-kept=aa-second"));
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("JobSecretPw") || l.AllText().Contains("OtherJobPw"));

        (await RunAsync("verify")).Results["t1"].Should().Be("verified kind=custom");
        (await RunAsync("apply")).Results["t1"].Should().Be("in-sync");
        (await Copies("t1").Find(new BsonDocument("_id", "aa-second")).SingleAsync()).Equals(extra).Should().BeTrue();
    }

    [Fact]
    public async Task Apply_RootTenant_ExtraLegacyDocSortingFirstById_NaturalOrderDocCopied_ExtraUntouched()
    {
        // The root tenant's read has an _id $nin clause; without the $natural hint Mongo returns _id order
        // and would take "a-dsc-root-2" (lessons 2026-10-14). The app reads "dsc-seed" (natural order).
        await CopyAsync("root-t", "default", isRoot: true, id: "dsc-seed");
        var extra = new BsonDocument
        {
            { "_id", "a-dsc-root-2" }, { "DatabaseName", "db-extra" }, { "IsDeleted", false }, { "DbConnectionString", B64(Custom2) }
        };
        await Root.InsertOneAsync(extra);
        await CopyAsync("t2", Custom);

        var s = await RunAsync("apply");

        s.Results["root-t"].Should().Be("migrated kind=default");
        var root = (await RootDocAsync("root-t"))!;
        root["ConfigItemId"].AsString.Should().Be("dsc-seed");
        root["DbConnectionSecretId"].AsString.Should().Be("default");
        (await Root.Find(new BsonDocument("_id", "a-dsc-root-2")).SingleAsync()).Equals(extra).Should().BeTrue("extra live docs are never changed");
        (await Root.CountDocumentsAsync(new BsonDocument("_id", "dsc-seed"))).Should().Be(1);
        _logs.Logs.Should().Contain(l => l.Message.Contains("tenant=root-t live-docs=2 using=dsc-seed") && l.Message.Contains("extra-ids-kept=a-dsc-root-2"));
        _secrets.Secrets.Values.Should().ContainSingle().Which.TenantId.Should().Be("t2");
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("OtherJobPw") || l.AllText().Contains("JobSecretPw"));
        (await RunAsync("verify")).Results["root-t"].Should().Be("verified kind=default");
    }

    [Fact]
    public async Task Apply_OrphanGuard_CrashBetweenSecretAndRootDoc_ReusesTheSecret_RotatesIfDifferent()
    {
        await CopyAsync("t1", Custom);
        var orphan = _secrets.Add("t1", Custom2);

        await RunAsync("apply");

        _secrets.Secrets.Should().HaveCount(1);
        (await RootDocAsync("t1"))!["DbConnectionSecretId"].AsString.Should().Be(orphan.Id);
        orphan.Value.Should().Be(Custom);
        _secrets.Calls.Should().NotContain(c => c.Op == "Set");
    }

    [Fact]
    public async Task Apply_OrphanGuard_SkipsASecretUsedByAnotherRootDoc()
    {
        await CopyAsync("t1", Custom);
        var used = _secrets.Add("t1", Custom);
        await Root.InsertOneAsync(new BsonDocument { { "_id", "someone" }, { "ConfigItemId", "x" }, { "DbConnectionSecretId", used.Id } });

        await RunAsync("apply");

        (await RootDocAsync("t1"))!["DbConnectionSecretId"].AsString.Should().NotBe(used.Id);
        _secrets.Calls.Should().Contain(c => c.Op == "Set");
    }

    [Fact]
    public async Task Apply_Rerun_IsInSync_NoSecondSecret()
    {
        await CopyAsync("t1", Custom);
        await RunAsync("apply");
        var again = await RunAsync("apply");
        again.Results["t1"].Should().Be("in-sync");
        _secrets.Secrets.Should().HaveCount(1);
    }

    [Fact]
    public async Task Apply_CopyNewer_NotFlagged_ResyncsFieldsWithSet_RotatesTheValue_MarkerKept()
    {
        await CopyAsync("t1", Custom, new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc));
        await RunAsync("apply");
        var newer = new DateTime(2026, 10, 5, 0, 0, 0, DateTimeKind.Utc);
        await Copies("t1").UpdateOneAsync(new BsonDocument(), new BsonDocument("$set", new BsonDocument
        {
            { "DbConnectionString", B64(Custom2) }, { "CollectionNamePattern", "new_{SchemaName}" }, { "LastUpdatedDate", newer }
        }));

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("resynced");
        var root = (await RootDocAsync("t1"))!;
        root["CollectionNamePattern"].AsString.Should().Be("new_{SchemaName}");
        root["MigratedFrom"].AsString.Should().Be("DataServiceConfigurations");
        _secrets.Secrets[root["DbConnectionSecretId"].AsString].Value.Should().Be(Custom2);
        _secrets.Calls.Should().Contain(c => c.Op == "Rotate");
    }

    [Theory]
    [InlineData("default", Custom)]
    [InlineData(Custom, "default")]
    public async Task Apply_Flagged_CopyNotNewer_ValueDiffers_NoRotate_NoBlocker(string copyValue, string newCodeValue)
    {
        await CopyAsync("t1", copyValue, new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc));
        var newId = newCodeValue == "default" ? "default" : _secrets.Add("t1", newCodeValue).Id;
        await Root.InsertOneAsync(RootFromCopy("t1", newId, flagged: true, lastUpdated: new DateTime(2026, 10, 3, 0, 0, 0, DateTimeKind.Utc)));
        var callsBefore = _secrets.Calls.Count;

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("in-sync");
        _secrets.Calls.Skip(callsBefore).Should().NotContain(c => c.Op == "Rotate" || c.Op == "Set");
        var verify = await RunAsync("verify");
        verify.Results["t1"].Should().Be("value-changed-after-deploy");
        verify.Problems.Should().Be(0);
    }

    [Fact]
    public async Task Apply_Flagged_CopyNewer_ValueDiffers_ValueConflictBlocker_NothingWritten()
    {
        await CopyAsync("t1", Custom2, new DateTime(2026, 10, 9, 0, 0, 0, DateTimeKind.Utc));
        var id = _secrets.Add("t1", Custom).Id;
        await Root.InsertOneAsync(RootFromCopy("t1", id, flagged: true, lastUpdated: new DateTime(2026, 10, 3, 0, 0, 0, DateTimeKind.Utc)));

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("blocker:value-conflict");
        _secrets.Secrets[id].Value.Should().Be(Custom);
        (await RunAsync("verify")).Results["t1"].Should().Be("problem:value-conflict");
        (await RunAsync("plan")).Results["t1"].Should().Be("blocker:value-conflict");
    }

    [Fact]
    public async Task Verify_Flagged_CopyNewer_SameValue_IsCopyNewer_NotValueConflict_ApplyResyncs()
    {
        await CopyAsync("t1", Custom, new DateTime(2026, 10, 9, 0, 0, 0, DateTimeKind.Utc));
        var id = _secrets.Add("t1", Custom).Id;
        await Root.InsertOneAsync(RootFromCopy("t1", id, flagged: true, lastUpdated: new DateTime(2026, 10, 3, 0, 0, 0, DateTimeKind.Utc)));

        (await RunAsync("verify")).Results["t1"].Should().Be("problem:copy-newer");
        (await RunAsync("apply")).Results["t1"].Should().Be("resynced");
        _secrets.Calls.Should().NotContain(c => c.Op == "Rotate" || c.Op == "Set");
        (await RunAsync("verify")).Results["t1"].Should().Be("value-changed-after-deploy");
    }

    [Fact]
    public async Task Apply_DuplicateKeyOnRootInsert_RootExists_DeletesOnlyItsOwnNewSecret()
    {
        await CopyAsync("t1", Custom);
        _secrets.BeforeCall = async (op, _) =>
        {
            if (op == "Set") // a parallel writer creates the root doc between the read and the insert
                await Root.InsertOneAsync(new BsonDocument { { "_id", "t1" }, { "ConfigItemId", "copy-1" }, { "DbConnectionSecretId", "default" } });
        };

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("root-exists");
        var created = _secrets.Secrets.Values.Single();
        created.Status.Should().Be(SecretStatuses.Deleted, "the secret this run created is not left as an orphan");
        (await RootDocAsync("t1"))!["DbConnectionSecretId"].AsString.Should().Be("default");
    }

    [Fact]
    public async Task Apply_DuplicateKeyOnRootInsert_ReusedSecretIsNotDeleted()
    {
        await CopyAsync("t1", Custom);
        var orphan = _secrets.Add("t1", Custom);
        _secrets.BeforeCall = async (op, _) =>
        {
            if (op == "Find")
                await Root.InsertOneAsync(new BsonDocument { { "_id", "t1" }, { "ConfigItemId", "copy-1" }, { "DbConnectionSecretId", "default" } });
        };

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("root-exists");
        orphan.Status.Should().Be(SecretStatuses.Active);
        _secrets.Calls.Should().NotContain(c => c.Op == "Delete" || c.Op == "Set");
    }

    [Theory]
    [InlineData("Default")]
    [InlineData("DEFAULT")]
    public async Task DefaultInAnyCase_IsTheBlocksDbSentinel_AsToday(string value)
    {
        await CopyAsync("t1", value);
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64(value), ["DatabaseName"] = "db" };

        (await RunAsync("plan")).Results["t1"].Should().StartWith("kind=default");
        (await RunAsync("apply")).Results["t1"].Should().Be("migrated kind=default");
        _secrets.Calls.Should().BeEmpty();
        (await RootDocAsync("t1"))!["DbConnectionSecretId"].AsString.Should().Be("default");
        (await RunAsync("scrub-redis", dataDeployed: "yes")).Results["t1"].Should().Be("scrubbed");
        (await RunAsync("verify")).Results["t1"].Should().Be("verified kind=default");
    }

    [Fact]
    public async Task Apply_RootNewer_FieldDiffers_RepairsTheCopy_NonSecretFieldsOnly()
    {
        await CopyAsync("t1", Custom, new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc));
        await RunAsync("apply");
        var rootDate = new DateTime(2026, 10, 6, 0, 0, 0, DateTimeKind.Utc);
        await Root.UpdateOneAsync(new BsonDocument("_id", "t1"), new BsonDocument("$set", new BsonDocument
        {
            { "CollectionNamePattern", "root_{SchemaName}" }, { "LastUpdatedDate", rootDate }
        }));
        (await RunAsync("verify")).Results["t1"].Should().Be("problem:field-differs=CollectionNamePattern");

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("copy-repaired");
        var copy = await Copies("t1").Find(new BsonDocument()).FirstAsync();
        copy["CollectionNamePattern"].AsString.Should().Be("root_{SchemaName}");
        copy["DbConnectionString"].AsString.Should().Be(B64(Custom), "never the value");
        copy["IsDeleted"].AsBoolean.Should().BeFalse();
        copy["LastUpdatedDate"].ToUniversalTime().Should().Be(rootDate);
        _logs.Logs.Should().Contain(l => l.Message.Contains("result=copy-repaired"));
        (await RunAsync("verify")).Results["t1"].Should().StartWith("verified");
    }

    [Fact]
    public async Task OverwrittenRootDoc_Blocker_NothingWritten_NeverTakenAsTheRootTenantsLegacyDoc()
    {
        await CopyAsync("root-t", "default", isRoot: true, id: "legacy-root");
        await CopyAsync("t1", Custom);
        await Root.InsertOneAsync(new BsonDocument { { "_id", "t1" }, { "DbConnectionString", B64(Custom2) }, { "IsDeleted", false } });

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("blocker:overwritten-root-doc");
        (await RootDocAsync("t1"))!.Contains("ConfigItemId").Should().BeFalse();
        s.Results["root-t"].Should().Be("migrated kind=default", "the overwritten doc (_id = a TenantId) is not a root-tenant copy");
        (await RunAsync("verify")).Results["t1"].Should().Be("problem:overwritten-root-doc");
    }

    [Fact]
    public async Task NoDscDocAnywhere_NoDsc_NotAProblem_RootOnlyTenant_Ok()
    {
        _dbs.Add("empty", false, _fixture);
        _dbs.Add("root-only", false, _fixture);
        await Root.InsertOneAsync(new BsonDocument { { "_id", "root-only" }, { "ConfigItemId", "x" }, { "DbConnectionSecretId", "default" } });

        foreach (var mode in new[] { "plan", "apply", "verify" })
        {
            var s = await RunAsync(mode);
            s.Results["empty"].Should().Be("no-dsc");
            s.Results["root-only"].Should().Be("root-only");
            s.Problems.Should().Be(0);
            s.Blockers.Should().Be(0);
        }
    }

    [Theory]
    [InlineData("malformed")]
    [InlineData("foreign")]
    [InlineData("locked")]
    public async Task Verify_RootOnly_BadRootIdFails(string kind)
    {
        _dbs.Add("root-only", false, _fixture);
        var id = kind switch
        {
            "malformed" => "not-hex",
            "foreign" => _secrets.Add("other-tenant", Custom).Id,
            _ => _secrets.Add("root-only", Custom, SecretStatuses.Locked).Id
        };
        await Root.InsertOneAsync(new BsonDocument { { "_id", "root-only" }, { "ConfigItemId", "x" }, { "DbConnectionSecretId", id } });

        var s = await RunAsync("verify");

        s.Results["root-only"].Should().StartWith("problem:");
    }

    [Fact]
    public async Task Verify_Flagged_LockedSecret_StillFails()
    {
        await CopyAsync("t1", "default");
        var id = _secrets.Add("t1", Custom, SecretStatuses.Locked).Id;
        await Root.InsertOneAsync(RootFromCopy("t1", id, flagged: true, lastUpdated: new DateTime(2026, 10, 3, 0, 0, 0, DateTimeKind.Utc)));
        (await RunAsync("verify")).Results["t1"].Should().StartWith("problem:secret-unusable");
    }

    [Fact]
    public async Task Verify_LegacyRedisValueLeft_PendingScrub()
    {
        await CopyAsync("t1", Custom);
        await RunAsync("apply");
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64(Custom), ["DatabaseName"] = "db" };
        (await RunAsync("verify")).Results["t1"].Should().Be("problem:pending-scrub");
    }

    [Fact]
    public async Task DisabledTenant_SetRefused_ErrorForThatTenant_OthersGoOn()
    {
        await CopyAsync("disabled", Custom);
        await CopyAsync("t2", "default");
        _secrets.BeforeCall = (op, _) =>
            op == "Set" && BlocksContext.GetContext()?.TenantId == "disabled"
                ? throw new SecretAccessDeniedException("TENANT_DISABLED")
                : Task.CompletedTask;

        var s = await RunAsync("apply");

        s.Results["disabled"].Should().Be("error:SecretAccessDeniedException");
        (await RootDocAsync("disabled")).Should().BeNull();
        (await RootDocAsync("t2")).Should().NotBeNull();
    }

    // ---------------- scrub-redis ----------------

    [Fact]
    public async Task Scrub_LegacyEqualsResolvedSecret_OneTransaction_SetIdAndVersion_DeleteLegacy()
    {
        await CopyAsync("t1", Custom);
        await RunAsync("apply");
        var id = (await RootDocAsync("t1"))!["DbConnectionSecretId"].AsString;
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64(Custom), ["DatabaseName"] = "db" };

        var s = await RunAsync("scrub-redis", dataDeployed: "yes");

        s.Results["t1"].Should().Be("scrubbed");
        _redis.Scrubbed.Should().ContainSingle().Which.Should().Match<(string Key, string SecretId, string Version)>(x => x.Key == "t1" && x.SecretId == id && x.Version.Length > 0);
        _redis.Hashes["t1"].Should().NotContainKey("DbConnectionString");
        (await RunAsync("verify")).Results["t1"].Should().StartWith("verified");
    }

    [Fact]
    public async Task Scrub_LegacyDiffers_Blocker_HashKept()
    {
        await CopyAsync("t1", Custom);
        await RunAsync("apply");
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64(Custom2), ["DatabaseName"] = "db" };

        var s = await RunAsync("scrub-redis", dataDeployed: "yes");

        s.Results["t1"].Should().Be("blocker:legacy-value-differs");
        _redis.Hashes["t1"].Should().ContainKey("DbConnectionString");
    }

    [Fact]
    public async Task Scrub_DefaultSentinel_ComparesWithTheSentinel()
    {
        await CopyAsync("t1", "default");
        await RunAsync("apply");
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64("default"), ["DatabaseName"] = "db" };
        (await RunAsync("scrub-redis", dataDeployed: "yes")).Results["t1"].Should().Be("scrubbed");
        _redis.Scrubbed.Single().SecretId.Should().Be("default");
    }

    // ---------------- helpers ----------------

    private static BsonDocument RootFromCopy(string tenant, string? secretId, bool flagged, DateTime lastUpdated) => new()
    {
        { "_id", tenant }, { "ConfigItemId", "copy-1" }, { "DatabaseName", "db-" + tenant }, { "IsDeleted", false },
        { "IsCollectionNameEditable", false }, { "CollectionNamePattern", "sb_{SchemaName}s" }, { "ProjectKey", tenant },
        { "ProjectShortKey", "s" }, { "LastUpdatedDate", lastUpdated },
        { "DbConnectionSecretId", secretId is null ? BsonNull.Value : secretId }, { "ValueChangedAfterDeploy", flagged }
    };

    private sealed class FakeDatabases(IMongoDatabase root) : IDscMigrationDatabases
    {
        private readonly ConcurrentDictionary<string, (DscTenant Tenant, IMongoDatabase Db)> _tenants = new();
        public IMongoDatabase Root { get; } = root;

        public void Add(string tenant, bool isRoot, MongoFixture fixture) =>
            _tenants.GetOrAdd(tenant, _ => (new DscTenant(tenant, isRoot, false, "cs", "db"), isRoot ? Root : fixture.CreateDatabase()));

        public DscTenant Tenant(string id) => _tenants[id].Tenant;

        public Task<IReadOnlyList<DscTenant>> GetTenantsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<DscTenant>>(_tenants.Values.Select(v => v.Tenant).ToList());

        public IMongoDatabase TenantDb(DscTenant tenant) => _tenants[tenant.TenantId].Db;
    }

    private sealed class FakeRedis : IDscMigrationRedis
    {
        public bool LockHeldElsewhere { get; set; }
        public bool Released { get; private set; }
        public List<(string Key, TimeSpan Ttl)> LockCalls { get; } = new();
        public ConcurrentDictionary<string, Dictionary<string, string>> Hashes { get; } = new();
        public List<(string Key, string SecretId, string Version)> Scrubbed { get; } = new();

        public Task<bool> TryLockAsync(string key, string token, TimeSpan ttl)
        {
            LockCalls.Add((key, ttl));
            return Task.FromResult(!LockHeldElsewhere);
        }

        public Task ReleaseLockAsync(string key, string token)
        {
            Released = true;
            return Task.CompletedTask;
        }

        public Task<Dictionary<string, string>> GetHashAsync(string key) =>
            Task.FromResult(Hashes.TryGetValue(key, out var h) ? new Dictionary<string, string>(h) : new Dictionary<string, string>());

        public Task<bool> ScrubAsync(string key, string secretId, string version)
        {
            Scrubbed.Add((key, secretId, version));
            var h = Hashes.GetOrAdd(key, _ => new());
            h["DbConnectionSecretId"] = secretId;
            h["Version"] = version;
            h.Remove("DbConnectionString");
            return Task.FromResult(true);
        }
    }
}
