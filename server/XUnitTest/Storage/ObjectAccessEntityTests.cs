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
public class ObjectAccessEntityTests
{
    private readonly IMongoDatabase _db;

    public ObjectAccessEntityTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
    }

    private static ObjectAccessPolicy NewPolicy() => new()
    {
        ItemId = Guid.NewGuid().ToString(),
        TenantId = "tenant-1",
        ResourceId = "directory-1",
        ResourceType = ObjectResourceType.Directory,
        PrincipalType = ObjectPrincipalType.Role,
        PrincipalId = "editors",
        Permission = ObjectPermission.Owner,
        Effect = ObjectEffect.Allow,
        Priority = 10,
        GrantedBy = "user-1",
        CreatedDate = DateTime.UtcNow,
        LastUpdatedDate = DateTime.UtcNow
    };

    [Fact]
    public async Task ObjectAccessPolicy_stores_every_enum_as_its_string_name()
    {
        var typed = _db.GetCollection<ObjectAccessPolicy>("ObjectAccessPolicies");
        var policy = NewPolicy();

        await typed.InsertOneAsync(policy);

        var raw = await _db.GetCollection<BsonDocument>("ObjectAccessPolicies")
            .Find(Builders<BsonDocument>.Filter.Eq("_id", policy.ItemId))
            .SingleAsync();

        raw["ResourceType"].AsString.Should().Be("Directory");
        raw["PrincipalType"].AsString.Should().Be("Role");
        raw["Permission"].AsString.Should().Be("Owner");
        raw["Effect"].AsString.Should().Be("Allow");
    }

    [Fact]
    public async Task ObjectAccessPolicy_reads_back_with_every_field_intact()
    {
        var typed = _db.GetCollection<ObjectAccessPolicy>("ObjectAccessPolicies");
        var policy = NewPolicy();
        policy.ExpiresAt = new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        await typed.InsertOneAsync(policy);
        var found = await typed.Find(p => p.ItemId == policy.ItemId).SingleAsync();

        found.TenantId.Should().Be("tenant-1");
        found.ResourceId.Should().Be("directory-1");
        found.ResourceType.Should().Be(ObjectResourceType.Directory);
        found.PrincipalType.Should().Be(ObjectPrincipalType.Role);
        found.PrincipalId.Should().Be("editors");
        found.Permission.Should().Be(ObjectPermission.Owner);
        found.Effect.Should().Be(ObjectEffect.Allow);
        found.Priority.Should().Be(10);
        found.ExpiresAt.Should().Be(policy.ExpiresAt);
        found.GrantedBy.Should().Be("user-1");
    }

    [Fact]
    public async Task ObjectAccessPolicy_is_queryable_by_enum_value()
    {
        var typed = _db.GetCollection<ObjectAccessPolicy>("ObjectAccessPolicies");
        var allow = NewPolicy();
        var deny = NewPolicy();
        deny.Effect = ObjectEffect.Deny;
        deny.Permission = ObjectPermission.View;

        await typed.InsertManyAsync(new[] { allow, deny });

        // A round trip is not enough on its own: the filter has to serialize the enum
        // the same way the insert did, which is what actually breaks on a mismatch.
        var denies = await typed.Find(p => p.Effect == ObjectEffect.Deny).ToListAsync();

        denies.Should().ContainSingle();
        denies[0].ItemId.Should().Be(deny.ItemId);
        denies[0].Permission.Should().Be(ObjectPermission.View);
    }

    [Fact]
    public async Task ObjectAccessPolicy_tolerates_a_document_with_unknown_fields()
    {
        var id = Guid.NewGuid().ToString();
        await _db.GetCollection<BsonDocument>("ObjectAccessPolicies").InsertOneAsync(new BsonDocument
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

        var found = await _db.GetCollection<ObjectAccessPolicy>("ObjectAccessPolicies")
            .Find(p => p.ItemId == id).SingleAsync();

        found.ResourceType.Should().Be(ObjectResourceType.File);
        found.PrincipalType.Should().Be(ObjectPrincipalType.Everyone);
        found.PrincipalId.Should().BeNull();
    }

    [Fact]
    public async Task ObjectAuditLog_stores_its_resource_type_as_a_string_and_keeps_denials()
    {
        var typed = _db.GetCollection<ObjectAuditLog>("ObjectAuditLogs");
        var entry = new ObjectAuditLog
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            ResourceId = "file-1",
            ResourceType = ObjectResourceType.File,
            UserId = "user-2",
            Action = "Download",
            Granted = false,
            Detail = "version 3",
            CreatedDate = DateTime.UtcNow
        };

        await typed.InsertOneAsync(entry);

        var raw = await _db.GetCollection<BsonDocument>("ObjectAuditLogs")
            .Find(Builders<BsonDocument>.Filter.Eq("_id", entry.ItemId))
            .SingleAsync();
        raw["ResourceType"].AsString.Should().Be("File");

        var found = await typed.Find(a => a.ItemId == entry.ItemId).SingleAsync();
        found.Granted.Should().BeFalse();
        found.Action.Should().Be("Download");
        found.Detail.Should().Be("version 3");
    }

    [Fact]
    public void ObjectPermission_order_encodes_the_implication_hierarchy()
    {
        // The resolver treats a higher permission as satisfying every lower operation,
        // so the numeric order is load bearing rather than cosmetic.
        var ordered = new[]
        {
            ObjectPermission.View,
            ObjectPermission.Download,
            ObjectPermission.Edit,
            ObjectPermission.Delete,
            ObjectPermission.Manage,
            ObjectPermission.Owner,
        };

        ordered.Select(p => (int)p).Should().BeInAscendingOrder();
    }

    [Fact]
    public void ObjectPermission_names_match_what_the_migration_writes()
    {
        // The migration writes these exact strings, so a rename here would orphan
        // every policy row it produced.
        Enum.GetNames<ObjectPermission>().Should().BeEquivalentTo(
            "View", "Download", "Edit", "Delete", "Manage", "Owner");
        Enum.GetNames<ObjectEffect>().Should().BeEquivalentTo("Allow", "Deny");
        Enum.GetNames<ObjectPrincipalType>().Should().BeEquivalentTo(
            "User", "Role", "Everyone", "Organization");
        Enum.GetNames<ObjectResourceType>().Should().BeEquivalentTo("Directory", "File");
    }
}
