using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using XUnitTest.Infrastructure;

namespace XUnitTest.Storage;

/// <summary>
/// Round-trips the DMS access-control entities through a real mongod. The point of
/// these tests is the storage representation, not the C# shape: the data migration
/// writes enum names as strings, so a driver that persisted them as ints would read
/// back nothing and every access query would silently return empty.
/// </summary>
[Collection("Mongo")]
public class ContentAccessEntityTests
{
    private readonly IMongoDatabase _db;

    public ContentAccessEntityTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
    }

    private static ContentAccessPolicy NewPolicy() => new()
    {
        ItemId = Guid.NewGuid().ToString(),
        TenantId = "tenant-1",
        ResourceId = "folder-1",
        ResourceType = ContentResourceType.Folder,
        PrincipalType = ContentPrincipalType.Role,
        PrincipalId = "editors",
        Permission = ContentPermission.Owner,
        Effect = ContentEffect.Allow,
        Priority = 10,
        GrantedBy = "user-1",
        CreatedDate = DateTime.UtcNow,
        LastUpdatedDate = DateTime.UtcNow
    };

    [Fact]
    public async Task ContentAccessPolicy_stores_every_enum_as_its_string_name()
    {
        var typed = _db.GetCollection<ContentAccessPolicy>("ContentAccessPolicies");
        var policy = NewPolicy();

        await typed.InsertOneAsync(policy);

        var raw = await _db.GetCollection<BsonDocument>("ContentAccessPolicies")
            .Find(Builders<BsonDocument>.Filter.Eq("_id", policy.ItemId))
            .SingleAsync();

        raw["ResourceType"].AsString.Should().Be("Folder");
        raw["PrincipalType"].AsString.Should().Be("Role");
        raw["Permission"].AsString.Should().Be("Owner");
        raw["Effect"].AsString.Should().Be("Allow");
    }

    [Fact]
    public async Task ContentAccessPolicy_reads_back_with_every_field_intact()
    {
        var typed = _db.GetCollection<ContentAccessPolicy>("ContentAccessPolicies");
        var policy = NewPolicy();
        policy.ExpiresAt = new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        await typed.InsertOneAsync(policy);
        var found = await typed.Find(p => p.ItemId == policy.ItemId).SingleAsync();

        found.TenantId.Should().Be("tenant-1");
        found.ResourceId.Should().Be("folder-1");
        found.ResourceType.Should().Be(ContentResourceType.Folder);
        found.PrincipalType.Should().Be(ContentPrincipalType.Role);
        found.PrincipalId.Should().Be("editors");
        found.Permission.Should().Be(ContentPermission.Owner);
        found.Effect.Should().Be(ContentEffect.Allow);
        found.Priority.Should().Be(10);
        found.ExpiresAt.Should().Be(policy.ExpiresAt);
        found.GrantedBy.Should().Be("user-1");
    }

    [Fact]
    public async Task ContentAccessPolicy_is_queryable_by_enum_value()
    {
        var typed = _db.GetCollection<ContentAccessPolicy>("ContentAccessPolicies");
        var allow = NewPolicy();
        var deny = NewPolicy();
        deny.Effect = ContentEffect.Deny;
        deny.Permission = ContentPermission.View;

        await typed.InsertManyAsync(new[] { allow, deny });

        // A round trip is not enough on its own: the filter has to serialize the enum
        // the same way the insert did, which is what actually breaks on a mismatch.
        var denies = await typed.Find(p => p.Effect == ContentEffect.Deny).ToListAsync();

        denies.Should().ContainSingle();
        denies[0].ItemId.Should().Be(deny.ItemId);
        denies[0].Permission.Should().Be(ContentPermission.View);
    }

    [Fact]
    public async Task ContentAccessPolicy_tolerates_a_document_with_unknown_fields()
    {
        var id = Guid.NewGuid().ToString();
        await _db.GetCollection<BsonDocument>("ContentAccessPolicies").InsertOneAsync(new BsonDocument
        {
            { "_id", id },
            { "TenantId", "tenant-1" },
            { "ResourceId", "file-9" },
            { "ResourceType", "File" },
            { "PrincipalType", "Everyone" },
            { "Permission", "View" },
            { "Effect", "Allow" },
            { "Priority", 0 },
            { "LegacyColumnFromMigration", "ignored" }
        });

        var found = await _db.GetCollection<ContentAccessPolicy>("ContentAccessPolicies")
            .Find(p => p.ItemId == id).SingleAsync();

        found.ResourceType.Should().Be(ContentResourceType.File);
        found.PrincipalType.Should().Be(ContentPrincipalType.Everyone);
        found.PrincipalId.Should().BeNull();
    }

    [Fact]
    public async Task ContentAuditLog_stores_its_resource_type_as_a_string_and_keeps_denials()
    {
        var typed = _db.GetCollection<ContentAuditLog>("ContentAuditLogs");
        var entry = new ContentAuditLog
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            ResourceId = "file-1",
            ResourceType = ContentResourceType.File,
            UserId = "user-2",
            Action = "Download",
            Granted = false,
            Detail = "version 3",
            CreatedDate = DateTime.UtcNow
        };

        await typed.InsertOneAsync(entry);

        var raw = await _db.GetCollection<BsonDocument>("ContentAuditLogs")
            .Find(Builders<BsonDocument>.Filter.Eq("_id", entry.ItemId))
            .SingleAsync();
        raw["ResourceType"].AsString.Should().Be("File");

        var found = await typed.Find(a => a.ItemId == entry.ItemId).SingleAsync();
        found.Granted.Should().BeFalse();
        found.Action.Should().Be("Download");
        found.Detail.Should().Be("version 3");
    }

    [Fact]
    public void ContentPermission_order_encodes_the_implication_hierarchy()
    {
        // The resolver treats a higher permission as satisfying every lower operation,
        // so the numeric order is load bearing rather than cosmetic.
        var ordered = new[]
        {
            ContentPermission.View,
            ContentPermission.Download,
            ContentPermission.Edit,
            ContentPermission.Delete,
            ContentPermission.Manage,
            ContentPermission.Owner,
        };

        ordered.Select(p => (int)p).Should().BeInAscendingOrder();
    }

    [Fact]
    public void ContentPermission_names_match_what_the_migration_writes()
    {
        // The migration writes these exact strings, so a rename here would orphan
        // every policy row it produced.
        Enum.GetNames<ContentPermission>().Should().BeEquivalentTo(
            "View", "Download", "Edit", "Delete", "Manage", "Owner");
        Enum.GetNames<ContentEffect>().Should().BeEquivalentTo("Allow", "Deny");
        Enum.GetNames<ContentPrincipalType>().Should().BeEquivalentTo(
            "User", "Role", "Everyone", "Organization");
        Enum.GetNames<ContentResourceType>().Should().BeEquivalentTo("Folder", "File");
    }
}
