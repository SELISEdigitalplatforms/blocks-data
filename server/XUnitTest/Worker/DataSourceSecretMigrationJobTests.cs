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
/// Data-source migration Worker job (owner 2026-10-15: ONE model, no fallback). For every tenant: a Service secret
/// <c>data-source</c> (plain value, <c>default</c> = Blocks DB) + the root doc (<c>_id</c> = TenantId, same fields as the
/// old doc, no connection string and no helper fields). Old tenant docs are never touched. Runs on the real throwaway
/// Mongo (root DB + one DB per tenant), an in-memory secret service and an in-memory Redis.
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

    private static BsonDocument OldDoc(string tenant, string? value, string id = "copy-1", bool deleted = false, DateTime? lastUpdated = null, string pattern = "sb_{SchemaName}s")
    {
        var doc = new BsonDocument
        {
            { "_id", id }, { "DatabaseName", "db-" + tenant }, { "IsDeleted", deleted }, { "IsCollectionNameEditable", true },
            { "CollectionNamePattern", pattern }, { "ProjectKey", tenant }, { "ProjectShortKey", "s" },
            { "CreatedDate", new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc) }, { "CreatedBy", "creator" },
            { "LastUpdatedBy", "editor" }, { "OrganizationId", "org-1" },
            { "AnalyticsConfiguration", new BsonDocument { { "EnableAnalytics", true }, { "ValidTill", new DateTime(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc) } } },
            { "LastUpdatedDate", lastUpdated ?? new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc) }
        };
        doc["DbConnectionString"] = value is null ? BsonNull.Value : B64(value);
        return doc;
    }

    private async Task CopyAsync(string tenant, string? value, DateTime? lastUpdated = null, string id = "copy-1", bool isRoot = false, bool disabled = false)
    {
        _dbs.Add(tenant, isRoot, _fixture, disabled);
        await Copies(tenant).InsertOneAsync(OldDoc(tenant, value, id, lastUpdated: lastUpdated));
    }

    private async Task<BsonDocument?> RootDocAsync(string tenant) => await Root.Find(new BsonDocument("_id", tenant)).FirstOrDefaultAsync();

    private async Task<DscRunSummary> RunAsync(string mode, string? dataDeployed = null) => await Job(dataDeployed).RunAsync(mode, CancellationToken.None);

    private static string[] Forbidden => ["DbConnectionString", "ConfigItemId", "ValueChangedAfterDeploy", "MigratedFrom"];

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
        await RunAsync("apply");
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64(Custom), ["DatabaseName"] = "db" };
        var s = await RunAsync("scrub-redis");
        s.Ran.Should().BeFalse();
        _redis.Removed.Should().BeEmpty();
        _logs.Logs.Should().Contain(l => l.Message.Contains("DataDeployed=yes"));
    }

    // ---------------- plan ----------------

    [Fact]
    public async Task Plan_NoWrites_ReportsBlockers_MultiDocIsNoBlocker()
    {
        await CopyAsync("two-live", Custom);
        await Copies("two-live").InsertOneAsync(OldDoc("two-live", "default", "copy-2"));
        await CopyAsync("bad-b64", null);
        await Copies("bad-b64").UpdateOneAsync(new BsonDocument(), new BsonDocument("$set", new BsonDocument("DbConnectionString", "%%%not-base64")));
        await CopyAsync("redis-diff", Custom);
        _redis.Hashes["redis-diff"] = new() { ["DbConnectionString"] = B64(Custom2), ["DatabaseName"] = "db" };
        await CopyAsync("fine", "default");
        _dbs.Add("no-doc", false, _fixture);

        var s = await RunAsync("plan");

        s.Results["two-live"].Should().StartWith("kind=custom root=missing live-docs=2");
        s.Results["bad-b64"].Should().Be("blocker:invalid-base64");
        s.Results["redis-diff"].Should().Contain("redis=differs", "reported, not a blocker");
        s.Results["fine"].Should().StartWith("kind=default root=missing live-docs=1");
        s.Results["no-doc"].Should().StartWith("kind=default root=missing live-docs=0");
        (await Root.CountDocumentsAsync(new BsonDocument())).Should().Be(0);
        _secrets.Calls.Should().BeEmpty();
        _logs.Logs.Should().Contain(l => l.Message.Contains("value-store="));
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("JobSecretPw") || l.AllText().Contains("OtherJobPw"));
    }

    // ---------------- apply: value + root doc ----------------

    [Fact]
    public async Task Apply_Custom_PlainServiceSecret_RootDocSameFields_NoOldModelFields_OldDocUntouched()
    {
        var copyDate = new DateTime(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc);
        await CopyAsync("t1", Custom, copyDate);
        var oldBefore = await Copies("t1").Find(new BsonDocument()).FirstAsync();

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("migrated kind=custom");
        var secret = _secrets.Secrets.Values.Single();
        secret.TenantId.Should().Be("t1");
        secret.Type.Should().Be(SecretTypes.Service);
        secret.Name.Should().Be("data-source");
        secret.Value.Should().Be(Custom, "plain value, not base64");
        _secrets.Calls.Should().AllSatisfy(c => c.User.Should().Be("blocks-data-dsc-migration"));
        var root = (await RootDocAsync("t1"))!;
        foreach (var f in Forbidden)
            root.Contains(f).Should().BeFalse(f);
        root["TenantId"].AsString.Should().Be("t1");
        root["DbConnectionSecretId"].AsString.Should().Be(secret.Id);
        root["DatabaseName"].AsString.Should().Be("db-t1");
        root["IsCollectionNameEditable"].AsBoolean.Should().BeTrue();
        root["CollectionNamePattern"].AsString.Should().Be("sb_{SchemaName}s");
        root["ProjectKey"].AsString.Should().Be("t1");
        root["ProjectShortKey"].AsString.Should().Be("s");
        root["AnalyticsConfiguration"]["EnableAnalytics"].AsBoolean.Should().BeTrue();
        root["CreatedBy"].AsString.Should().Be("creator");
        root["IsDeleted"].AsBoolean.Should().BeFalse();
        root["LastUpdatedDate"].ToUniversalTime().Should().Be(copyDate);
        (await Copies("t1").Find(new BsonDocument()).FirstAsync()).ToJson().Should().Be(oldBefore.ToJson(), "old docs are deleted by the cleanup, never by the Worker");
        _redis.Removed.Should().BeEmpty();
        _logs.Logs.Should().Contain(l => l.Message.Contains("[dsc-migration] mode=apply tenant=t1 result=migrated"));
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("JobSecretPw"));
    }

    [Theory]
    [InlineData("default")]
    [InlineData("Default")]
    [InlineData(null)]
    [InlineData("")]
    public async Task Apply_DefaultOrBlank_SecretWithTheValueDefault(string? value)
    {
        await CopyAsync("t1", value);

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("migrated kind=default");
        var secret = _secrets.Secrets.Values.Single();
        secret.Value.Should().Be("default");
        secret.Type.Should().Be(SecretTypes.Service);
        (await RootDocAsync("t1"))!["DbConnectionSecretId"].AsString.Should().Be(secret.Id, "always a secret id, never null or a magic text");
    }

    [Fact]
    public async Task Apply_TenantWithoutOldDoc_GetsSeedDefaultsAndADefaultSecret()
    {
        _dbs.Add("fresh", false, _fixture);

        var s = await RunAsync("apply");

        s.Results["fresh"].Should().Be("migrated kind=default");
        var root = (await RootDocAsync("fresh"))!;
        root["_id"].AsString.Should().Be("fresh");
        root["TenantId"].AsString.Should().Be("fresh");
        root["DatabaseName"].AsString.Should().Be("default");
        root["IsCollectionNameEditable"].AsBoolean.Should().BeFalse();
        root["CollectionNamePattern"].AsString.Should().Be("sb_{SchemaName}s");
        root["ProjectKey"].AsString.Should().BeEmpty();
        root["ProjectShortKey"].AsString.Should().BeEmpty();
        root["IsDeleted"].AsBoolean.Should().BeFalse();
        root["AnalyticsConfiguration"].IsBsonNull.Should().BeTrue();
        _secrets.Secrets[root["DbConnectionSecretId"].AsString].Value.Should().Be("default");
    }

    [Fact]
    public async Task Apply_TenantWithoutDbInfo_StillGetsRootDoc_NoOldDocRead()
    {
        _dbs.AddNoDb("nodb");
        var s = await RunAsync("apply");
        s.Results["nodb"].Should().Be("migrated kind=default");
        (await RootDocAsync("nodb")).Should().NotBeNull();
    }

    [Fact]
    public async Task Apply_BlocksDbTenantsOfTheRootDbToo_RootTenantLegacyDocLivesInTheRootDb()
    {
        await CopyAsync("root-t", Custom, isRoot: true, id: "legacy-root");
        await CopyAsync("t2", "default");

        await RunAsync("apply");

        (await RootDocAsync("root-t"))!["DbConnectionSecretId"].AsString.Should().NotBeNullOrEmpty();
        (await Root.CountDocumentsAsync(new BsonDocument("_id", "legacy-root"))).Should().Be(1, "the root tenant's legacy doc is never touched");
        _secrets.Secrets.Values.Single(x => x.TenantId == "root-t").Value.Should().Be(Custom);
        (await RootDocAsync("t2")).Should().NotBeNull();
        var rerun = await RunAsync("apply");
        rerun.Results["root-t"].Should().Be("root-exists", "root docs of other tenants in the root DB are never taken for the root tenant's old doc");
        rerun.Results["t2"].Should().Be("root-exists");
    }

    // ---------------- apply: 2+ live docs ----------------

    [Fact]
    public async Task Apply_TwoLiveDocs_TheDocTheOldAppReads_FirstOfFindIsDeletedFalse_ChosenIdLogged_ExtraUntouched()
    {
        _dbs.Add("t1", false, _fixture);
        // natural (insert) order: a deleted doc, then "zz-first", then "aa-second" (sorts first by _id: must NOT win)
        await Copies("t1").InsertManyAsync([
            OldDoc("t1", Custom2, "000-deleted", deleted: true),
            OldDoc("t1", Custom, "zz-first"),
            OldDoc("t1", "default", "aa-second")
        ]);
        var extraBefore = await Copies("t1").Find(new BsonDocument("_id", "aa-second")).FirstAsync();

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("migrated kind=custom");
        _secrets.Secrets.Values.Single().Value.Should().Be(Custom);
        (await Copies("t1").Find(new BsonDocument("_id", "aa-second")).FirstAsync()).ToJson().Should().Be(extraBefore.ToJson());
        (await Copies("t1").CountDocumentsAsync(new BsonDocument())).Should().Be(3);
        var log = _logs.Logs.Single(l => l.Message.Contains("live-docs=") && l.Message.Contains("using="));
        log.AllText().Should().Contain("zz-first").And.Contain("aa-second").And.Contain("2");
        log.AllText().Should().NotContain("JobSecretPw");
        (await RunAsync("verify")).Results["t1"].Should().Be("verified kind=custom");
    }

    [Fact]
    public async Task Apply_RootTenant_TwoLegacyDocs_RootDocsOfOtherTenantsInTheSameCollectionAreSkipped()
    {
        _dbs.Add("root-t", true, _fixture);
        _dbs.Add("t9", false, _fixture);
        // a root doc of another tenant is in the root DB FIRST; then the two legacy docs, "dsc-seed" before "a-dsc-root-2"
        await Root.InsertOneAsync(new BsonDocument { { "_id", "t9" }, { "IsDeleted", false }, { "DbConnectionSecretId", "x" } });
        await Root.InsertManyAsync([OldDoc("root-t", "default", "dsc-seed"), OldDoc("root-t", Custom, "a-dsc-root-2")]);

        var s = await RunAsync("apply");

        s.Results["root-t"].Should().Be("migrated kind=default");
        _secrets.Secrets.Values.Single(x => x.TenantId == "root-t").Value.Should().Be("default");
        (await Root.CountDocumentsAsync(new BsonDocument { { "_id", new BsonDocument("$in", new BsonArray { "dsc-seed", "a-dsc-root-2" }) } })).Should().Be(2);
    }

    // ---------------- apply: idempotent re-run ----------------

    [Fact]
    public async Task Apply_Rerun_RootExistsWithValidSecret_Skipped_NoSecondSecret_NoWrite()
    {
        await CopyAsync("t1", Custom);
        await RunAsync("apply");
        var rootBefore = (await RootDocAsync("t1"))!;
        var secretCountBefore = _secrets.Secrets.Count;

        var again = await RunAsync("apply");

        again.Results["t1"].Should().Be("root-exists");
        again.Changed.Should().Be(0);
        _secrets.Secrets.Should().HaveCount(secretCountBefore);
        _secrets.Calls.Count(c => c.Op == "Set").Should().Be(1);
        (await RootDocAsync("t1"))!.ToJson().Should().Be(rootBefore.ToJson());
    }

    [Fact]
    public async Task Apply_RootDocFromNewServer_ValidSecret_NeverOverwritten()
    {
        await CopyAsync("t1", Custom);
        var made = _secrets.Add("t1", "default");
        made.Name = "data-source";
        await Root.InsertOneAsync(new BsonDocument { { "_id", "t1" }, { "TenantId", "t1" }, { "DbConnectionSecretId", made.Id }, { "DatabaseName", "default" } });

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("root-exists");
        _secrets.Calls.Should().NotContain(c => c.Op == "Set");
        (await RootDocAsync("t1"))!["DatabaseName"].AsString.Should().Be("default");
    }

    [Fact]
    public async Task Apply_RootDocWithOldModelFields_ValidSecret_FieldsRemoved_NothingElseChanged()
    {
        await CopyAsync("t1", Custom);
        var made = _secrets.Add("t1", Custom);
        await Root.InsertOneAsync(new BsonDocument
        {
            { "_id", "t1" }, { "TenantId", "t1" }, { "DbConnectionSecretId", made.Id }, { "DatabaseName", "keep" },
            { "ConfigItemId", "copy-1" }, { "ValueChangedAfterDeploy", true }, { "MigratedFrom", "DataServiceConfigurations" }
        });

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("root-normalized");
        var root = (await RootDocAsync("t1"))!;
        foreach (var f in Forbidden)
            root.Contains(f).Should().BeFalse(f);
        root["DatabaseName"].AsString.Should().Be("keep");
        root["DbConnectionSecretId"].AsString.Should().Be(made.Id);
        _secrets.Calls.Should().NotContain(c => c.Op == "Set" || c.Op == "Rotate");
    }

    [Fact]
    public async Task Apply_RootDocLinkedSecretGone_NewSecretFromOldDoc_RootRepointed_OldSecretKept()
    {
        await CopyAsync("t1", Custom);
        var broken = _secrets.Add("t1", Custom, SecretStatuses.Deleted);
        await Root.InsertOneAsync(new BsonDocument { { "_id", "t1" }, { "TenantId", "t1" }, { "DbConnectionSecretId", broken.Id }, { "DatabaseName", "keep" } });

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("secret-repaired");
        var root = (await RootDocAsync("t1"))!;
        root["DbConnectionSecretId"].AsString.Should().NotBe(broken.Id);
        _secrets.Secrets[root["DbConnectionSecretId"].AsString].Value.Should().Be(Custom);
        _secrets.Secrets[broken.Id].Status.Should().Be(SecretStatuses.Deleted);
        root["DatabaseName"].AsString.Should().Be("keep");
    }

    [Fact]
    public async Task Apply_RootDocLinkedSecretGone_NoOldDoc_Blocker_NothingInvented()
    {
        _dbs.Add("t1", false, _fixture);
        await Root.InsertOneAsync(new BsonDocument { { "_id", "t1" }, { "TenantId", "t1" }, { "DbConnectionSecretId", new string('a', 32) } });

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("blocker:root-secret-broken");
        _secrets.Calls.Should().NotContain(c => c.Op == "Set");
    }

    [Fact]
    public async Task Apply_OverwrittenRootDoc_HoldsConnectionString_Blocker_NothingWritten()
    {
        await CopyAsync("t1", Custom);
        await Root.InsertOneAsync(new BsonDocument { { "_id", "t1" }, { "DbConnectionString", B64(Custom2) }, { "DatabaseName", "x" } });

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("blocker:overwritten-root-doc");
        _secrets.Secrets.Should().BeEmpty();
    }

    [Fact]
    public async Task Apply_InvalidBase64_Blocker_NothingWritten()
    {
        await CopyAsync("t1", null);
        await Copies("t1").UpdateOneAsync(new BsonDocument(), new BsonDocument("$set", new BsonDocument("DbConnectionString", "%%%")));
        var s = await RunAsync("apply");
        s.Results["t1"].Should().Be("blocker:invalid-base64");
        (await RootDocAsync("t1")).Should().BeNull();
        _secrets.Secrets.Should().BeEmpty();
    }

    // ---------------- apply: races + failures ----------------

    [Fact]
    public async Task Apply_DuplicateKeyOnRootInsert_RootExists_DeletesOnlyItsOwnNewSecret()
    {
        await CopyAsync("t1", Custom);
        var other = _secrets.Add("t1", "default");
        _secrets.BeforeCall = async (op, _) =>
        {
            if (op == "Set")
                await Root.InsertOneAsync(new BsonDocument { { "_id", "t1" }, { "TenantId", "t1" }, { "DbConnectionSecretId", other.Id } });
        };

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("root-exists");
        _secrets.Secrets.Values.Where(x => x.Id != other.Id).Single().Status.Should().Be(SecretStatuses.Deleted);
        other.Status.Should().Be(SecretStatuses.Active);
        (await RootDocAsync("t1"))!["DbConnectionSecretId"].AsString.Should().Be(other.Id);
    }

    [Fact]
    public async Task DisabledTenant_NothingDone_InEveryMode_OthersGoOn()
    {
        await CopyAsync("disabled", Custom, disabled: true);
        await CopyAsync("t2", "default");

        foreach (var mode in new[] { "plan", "apply", "verify" })
            (await RunAsync(mode)).Results["disabled"].Should().Be("skipped-disabled");
        _redis.Hashes["disabled"] = new() { ["DbConnectionString"] = B64(Custom) };
        (await RunAsync("scrub-redis", "yes")).Results["disabled"].Should().Be("skipped-disabled");

        (await RootDocAsync("disabled")).Should().BeNull();
        _secrets.Calls.Should().NotContain(c => c.Tenant == "disabled");
        _redis.Hashes["disabled"].Should().ContainKey("DbConnectionString");
        (await Copies("disabled").CountDocumentsAsync(new BsonDocument())).Should().Be(1);
        (await RootDocAsync("t2")).Should().NotBeNull();
    }

    [Fact]
    public async Task SecretServiceFails_ErrorForThatTenant_NoRootDoc_OthersGoOn()
    {
        await CopyAsync("broken", Custom);
        await CopyAsync("t2", "default");
        _secrets.BeforeCall = (op, _) =>
            op == "Set" && BlocksContext.GetContext()?.TenantId == "broken"
                ? throw new SecretAccessDeniedException("DENIED")
                : Task.CompletedTask;

        var s = await RunAsync("apply");

        s.Results["broken"].Should().Be("error:SecretAccessDeniedException");
        s.Errors.Should().Be(1);
        (await RootDocAsync("broken")).Should().BeNull();
        (await RootDocAsync("t2")).Should().NotBeNull();
    }

    // ---------------- verify ----------------

    [Fact]
    public async Task Verify_AfterApply_Ok_ForCustomAndDefault()
    {
        await CopyAsync("t1", Custom);
        await CopyAsync("t2", "default");
        _dbs.Add("t3", false, _fixture);
        await RunAsync("apply");

        var s = await RunAsync("verify");

        s.Results["t1"].Should().Be("verified kind=custom");
        s.Results["t2"].Should().Be("verified kind=default");
        s.Results["t3"].Should().Be("verified kind=default");
        s.Problems.Should().Be(0);
    }

    [Fact]
    public async Task Verify_Problems_NoRootDoc_LegacyField_InvalidId_Missing_Differs()
    {
        await CopyAsync("none", Custom);
        await CopyAsync("legacy", Custom);
        await CopyAsync("badid", Custom);
        await CopyAsync("gone", Custom);
        await CopyAsync("diff", Custom);
        await CopyAsync("fielddiff", Custom);
        await RunAsync("apply");
        // apply made a root doc for every tenant above; remove the one that must be missing
        await Root.DeleteOneAsync(new BsonDocument("_id", "none"));
        await Root.UpdateOneAsync(new BsonDocument("_id", "legacy"), new BsonDocument("$set", new BsonDocument("ConfigItemId", "copy-1")));
        await Root.UpdateOneAsync(new BsonDocument("_id", "badid"), new BsonDocument("$set", new BsonDocument("DbConnectionSecretId", "default")));
        var goneId = (await RootDocAsync("gone"))!["DbConnectionSecretId"].AsString;
        _secrets.Secrets.TryRemove(goneId, out _);
        _secrets.Secrets[(await RootDocAsync("diff"))!["DbConnectionSecretId"].AsString].Value = Custom2;
        await Root.UpdateOneAsync(new BsonDocument("_id", "fielddiff"), new BsonDocument("$set", new BsonDocument("CollectionNamePattern", "other")));

        var s = await RunAsync("verify");

        s.Results["none"].Should().Be("problem:no-root-doc");
        s.Results["legacy"].Should().Be("problem:legacy-field=ConfigItemId");
        s.Results["badid"].Should().Be("problem:invalid-secret-id");
        s.Results["gone"].Should().Be("problem:secret-missing");
        s.Results["diff"].Should().Be("problem:value-differs");
        s.Results["fielddiff"].Should().Be("problem:field-differs=CollectionNamePattern");
    }

    [Fact]
    public async Task Verify_RootDocChangedByTheNewCode_NotComparedWithTheOldDoc()
    {
        await CopyAsync("t1", Custom);
        await RunAsync("apply");
        var id = (await RootDocAsync("t1"))!["DbConnectionSecretId"].AsString;
        _secrets.Secrets[id].Value = Custom2;
        await Root.UpdateOneAsync(new BsonDocument("_id", "t1"), new BsonDocument("$set", new BsonDocument
        {
            { "CollectionNamePattern", "new_{SchemaName}" }, { "LastUpdatedDate", DateTime.UtcNow.AddDays(1) }
        }));

        (await RunAsync("verify")).Results["t1"].Should().Be("verified kind=custom");
    }

    [Fact]
    public async Task Verify_LegacyRedisField_OnlyAProblemOnceDataIsDeployed()
    {
        await CopyAsync("t1", Custom);
        await RunAsync("apply");
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64(Custom), ["DatabaseName"] = "db" };

        (await RunAsync("verify")).Results["t1"].Should().StartWith("verified");
        (await RunAsync("verify", "yes")).Results["t1"].Should().Be("problem:pending-scrub");
    }

    // ---------------- scrub-redis ----------------

    [Fact]
    public async Task Scrub_RemovesOnlyTheLegacyField_KeepsTheRest()
    {
        await CopyAsync("t1", Custom);
        await RunAsync("apply");
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64(Custom), ["DbConnectionSecretId"] = "abc", ["ConnectionType"] = "Custom", ["DatabaseName"] = "db", ["Version"] = "7" };

        var s = await RunAsync("scrub-redis", dataDeployed: "yes");

        s.Results["t1"].Should().Be("scrubbed");
        _redis.Removed.Should().ContainSingle().Which.Should().Be("t1");
        _redis.Hashes["t1"].Should().BeEquivalentTo(new Dictionary<string, string> { ["DbConnectionSecretId"] = "abc", ["ConnectionType"] = "Custom", ["DatabaseName"] = "db", ["Version"] = "7" });
        (await RunAsync("verify", "yes")).Results["t1"].Should().StartWith("verified");
    }

    [Fact]
    public async Task Scrub_OldShapeHash_IsDeletedWhole_ACacheMiss()
    {
        await CopyAsync("t1", Custom);
        await RunAsync("apply");
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64(Custom), ["DatabaseName"] = "db" };

        (await RunAsync("scrub-redis", "yes")).Results["t1"].Should().Be("scrubbed");

        _redis.Hashes.Should().NotContainKey("t1");
    }

    [Fact]
    public async Task Scrub_NoRootDoc_Blocker_HashKept_NoLegacyField_Ok()
    {
        await CopyAsync("t1", Custom);
        _redis.Hashes["t1"] = new() { ["DbConnectionString"] = B64(Custom), ["DatabaseName"] = "db" };
        await CopyAsync("t2", "default");

        var s = await RunAsync("scrub-redis", "yes");

        s.Results["t1"].Should().Be("blocker:no-root-doc");
        s.Results["t2"].Should().Be("no-legacy-field");
        _redis.Hashes["t1"].Should().ContainKey("DbConnectionString");
        _redis.Removed.Should().BeEmpty();
    }

    // ---------------- first-use root doc made by the new Api before apply ----------------

    private static readonly DateTime FirstUseAt = new(2026, 10, 14, 8, 0, 0, DateTimeKind.Utc);

    private async Task<string> FirstUseRootAsync(string tenant, string secretValue = "default", string dbName = "default", DateTime? lastUpdated = null)
    {
        var made = _secrets.Add(tenant, secretValue);
        made.Name = "data-source";
        await Root.InsertOneAsync(new BsonDocument
        {
            { "_id", tenant }, { "TenantId", tenant }, { "DbConnectionSecretId", made.Id }, { "DatabaseName", dbName },
            { "IsDeleted", false }, { "IsCollectionNameEditable", false }, { "CollectionNamePattern", "sb_{SchemaName}s" },
            { "ProjectKey", "" }, { "ProjectShortKey", "" }, { "AnalyticsConfiguration", BsonNull.Value },
            { "CreatedDate", FirstUseAt }, { "CreatedBy", "someone" }, { "LastUpdatedDate", lastUpdated ?? FirstUseAt }, { "LastUpdatedBy", "someone" }
        });
        return made.Id;
    }

    [Fact]
    public async Task Apply_FirstUseRoot_Byo_Corrected_SameSecretRotated_FieldsCopied_HashDeleted()
    {
        await CopyAsync("t1", Custom);
        var id = await FirstUseRootAsync("t1");
        _redis.Hashes["t1"] = new Dictionary<string, string> { ["DbConnectionSecretId"] = id, ["ConnectionType"] = "Default" };

        var plan = await RunAsync("plan");
        plan.Corrected.Should().Be(1);
        _secrets.Calls.Should().NotContain(c => c.Op == "Rotate" || c.Op == "Set");
        (await RootDocAsync("t1"))!["DatabaseName"].AsString.Should().Be("default");

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("corrected-first-use kind=custom");
        s.Corrected.Should().Be(1);
        var root = (await RootDocAsync("t1"))!;
        root["DbConnectionSecretId"].AsString.Should().Be(id);
        _secrets.Secrets[id].Value.Should().Be(Custom);
        _secrets.Secrets.Should().HaveCount(1);
        root["DatabaseName"].AsString.Should().Be("db-t1");
        root["IsCollectionNameEditable"].AsBoolean.Should().BeTrue();
        root["ProjectKey"].AsString.Should().Be("t1");
        root["ProjectShortKey"].AsString.Should().Be("s");
        root["AnalyticsConfiguration"]["EnableAnalytics"].AsBoolean.Should().BeTrue();
        _redis.Deleted.Should().Equal("t1");
        _redis.Hashes.Should().NotContainKey("t1");
        _logs.Logs.Should().Contain(l => l.Message.Contains("corrected-first-use"));
        _logs.Logs.Should().NotContain(l => l.AllText().Contains("JobSecretPw"));
        (await RunAsync("verify")).Results["t1"].Should().Be("verified kind=custom");
    }

    [Fact]
    public async Task Apply_FirstUseRoot_DefaultSecret_DifferentDatabaseName_Corrected_SecretStaysDefault()
    {
        await CopyAsync("t1", null);
        var id = await FirstUseRootAsync("t1");

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("corrected-first-use kind=default");
        (await RootDocAsync("t1"))!["DatabaseName"].AsString.Should().Be("db-t1");
        _secrets.Secrets[id].Value.Should().Be("default");
        _secrets.Calls.Should().NotContain(c => c.Op == "Set");
    }

    [Fact]
    public async Task Verify_FirstUseRoot_StillDiffering_IsAProblem_AfterApplyOk()
    {
        await CopyAsync("t1", Custom);
        await FirstUseRootAsync("t1");

        (await RunAsync("verify")).Results["t1"].Should().Be("problem:first-use-differs=DatabaseName");
        await RunAsync("apply");
        (await RunAsync("verify")).Results["t1"].Should().Be("verified kind=custom");
    }

    [Fact]
    public async Task Apply_UserSavedRoot_NeverOverwritten_WarnsWhenDifferent()
    {
        await CopyAsync("t1", Custom);
        var id = await FirstUseRootAsync("t1", dbName: "user-db", lastUpdated: FirstUseAt.AddMinutes(5));

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("root-exists");
        s.Corrected.Should().Be(0);
        (await RootDocAsync("t1"))!["DatabaseName"].AsString.Should().Be("user-db");
        _secrets.Secrets[id].Value.Should().Be("default");
        _secrets.Calls.Should().NotContain(c => c.Op == "Rotate");
        _redis.Deleted.Should().BeEmpty();
        _logs.Logs.Should().Contain(l => l.Level == Microsoft.Extensions.Logging.LogLevel.Warning && l.Message.Contains("user-saved-root-differs-from-old-doc"));
    }

    [Fact]
    public async Task Apply_FirstUseRoot_NoOldDoc_Untouched()
    {
        _dbs.Add("t1", false, _fixture);
        var id = await FirstUseRootAsync("t1");

        var s = await RunAsync("apply");

        s.Results["t1"].Should().Be("root-exists");
        (await RootDocAsync("t1"))!["DatabaseName"].AsString.Should().Be("default");
        _secrets.Secrets[id].Value.Should().Be("default");
        _redis.Deleted.Should().BeEmpty();
    }

    [Fact]
    public async Task Apply_FirstUseCorrection_Rerun_NoOp()
    {
        await CopyAsync("t1", Custom);
        await FirstUseRootAsync("t1");
        await RunAsync("apply");
        var before = (await RootDocAsync("t1"))!.ToJson();
        var rotates = _secrets.Calls.Count(c => c.Op == "Rotate");

        var again = await RunAsync("apply");

        again.Results["t1"].Should().Be("root-exists");
        again.Changed.Should().Be(0);
        again.Corrected.Should().Be(0);
        (await RootDocAsync("t1"))!.ToJson().Should().Be(before);
        _secrets.Calls.Count(c => c.Op == "Rotate").Should().Be(rotates);
        _redis.Deleted.Should().HaveCount(1);
    }

    // ---------------- helpers ----------------

    private sealed class FakeDatabases(IMongoDatabase root) : IDscMigrationDatabases
    {
        private readonly ConcurrentDictionary<string, (DscTenant Tenant, IMongoDatabase? Db)> _tenants = new();
        public IMongoDatabase Root { get; } = root;

        public void Add(string tenant, bool isRoot, MongoFixture fixture, bool disabled = false) =>
            _tenants.GetOrAdd(tenant, _ => (new DscTenant(tenant, isRoot, disabled, "cs", "db"), isRoot ? Root : fixture.CreateDatabase()));

        public void AddNoDb(string tenant) =>
            _tenants.GetOrAdd(tenant, _ => (new DscTenant(tenant, false, false, string.Empty, string.Empty), null));

        public DscTenant Tenant(string id) => _tenants[id].Tenant;

        public Task<IReadOnlyList<DscTenant>> GetTenantsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<DscTenant>>(_tenants.Values.Select(v => v.Tenant).ToList());

        public IMongoDatabase TenantDb(DscTenant tenant) =>
            _tenants[tenant.TenantId].Db ?? throw new InvalidOperationException("tenant has no DB");
    }

    private sealed class FakeRedis : IDscMigrationRedis
    {
        public bool LockHeldElsewhere { get; set; }
        public bool Released { get; private set; }
        public List<(string Key, TimeSpan Ttl)> LockCalls { get; } = new();
        public ConcurrentDictionary<string, Dictionary<string, string>> Hashes { get; } = new();
        public List<string> Removed { get; } = new();

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

        public Task DeleteHashAsync(string key)
        {
            Deleted.Add(key);
            Hashes.TryRemove(key, out _);
            return Task.CompletedTask;
        }

        public List<string> Deleted { get; } = new();

        /// <summary>Same as the Lua script: HDEL the legacy field; no secret-id field left = DEL the key.</summary>
        public Task<bool> RemoveLegacyFieldAsync(string key)
        {
            Removed.Add(key);
            if (Hashes.TryGetValue(key, out var h))
            {
                h.Remove("DbConnectionString");
                if (!h.ContainsKey("DbConnectionSecretId") || !h.ContainsKey("ConnectionType"))
                    Hashes.TryRemove(key, out _);
            }
            return Task.FromResult(true);
        }
    }
}
