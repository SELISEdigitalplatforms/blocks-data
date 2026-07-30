using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using XUnitTest.Infrastructure;
using Directory = Storage.DomainService.Entities.Directory;
using File = Storage.DomainService.Entities.File;

namespace XUnitTest.Storage;

/// <summary>
/// Covers the fields added to the existing File, Directory and FileVersion entities.
/// The defaults matter as much as the round trip: documents written before this change
/// carry none of these fields, so a wrong default would flip existing content to
/// archived or make it stop inheriting access the moment it is read back.
/// </summary>
[Collection("Mongo")]
public class DmsEntityExtensionTests
{
    private readonly IMongoDatabase _db;

    public DmsEntityExtensionTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();
    }

    [Fact]
    public void File_defaults_are_safe_for_documents_written_before_the_new_fields()
    {
        var file = new File();

        file.InheritsParentAccess.Should().BeTrue();
        file.IsActive.Should().BeTrue();
        file.IsArchived.Should().BeFalse();
        file.AncestorIds.Should().NotBeNull().And.BeEmpty();
    }

    [Fact]
    public void Directory_defaults_are_safe_for_documents_written_before_the_new_fields()
    {
        var directory = new Directory();

        directory.InheritsParentAccess.Should().BeTrue();
        directory.IsActive.Should().BeTrue();
        directory.IsArchived.Should().BeFalse();
        directory.AncestorIds.Should().NotBeNull().And.BeEmpty();
        directory.FullPath.Should().BeEmpty();
        directory.ChildFileCount.Should().Be(0);
        directory.ChildFolderCount.Should().Be(0);
        directory.SizeInBytes.Should().Be(0);
    }

    [Fact]
    public void Directory_factory_carries_the_new_options_through()
    {
        var directory = Directory.CreateNew(new DirectoryOptions
        {
            Name = "Reports",
            ParentDirectoryId = "parent-1",
            ItemId = "dir-1",
            TenantId = "tenant-1",
            CreateDate = DateTime.UtcNow,
            CreatedBy = "user-1",
            Language = "en",
            AncestorIds = new List<string> { "root-1", "parent-1" },
            FullPath = "/root/parent",
            InheritsParentAccess = false,
            ConfigurationName = "default",
            ModuleName = "dms",
            Description = "Quarterly reports",
        });

        directory.AncestorIds.Should().Equal("root-1", "parent-1");
        directory.FullPath.Should().Be("/root/parent");
        directory.InheritsParentAccess.Should().BeFalse();
        directory.ConfigurationName.Should().Be("default");
        directory.ModuleName.Should().Be("dms");
        directory.Description.Should().Be("Quarterly reports");
        directory.SystemName.Should().Be("reports");
    }

    [Fact]
    public void Directory_factory_defaults_the_new_options_when_they_are_not_supplied()
    {
        var directory = Directory.CreateNew(new DirectoryOptions
        {
            Name = "Inbox",
            ItemId = "dir-2",
            TenantId = "tenant-1",
            CreateDate = DateTime.UtcNow,
            CreatedBy = "user-1",
            Language = "en",
        });

        directory.AncestorIds.Should().NotBeNull().And.BeEmpty();
        directory.FullPath.Should().BeEmpty();
        directory.InheritsParentAccess.Should().BeTrue();
        directory.ParentDirectoryID.Should().BeNull();
    }

    [Fact]
    public void FileVersion_factory_carries_storage_key_and_uploader()
    {
        var version = FileVersion.CreateNew("file-1", 3, new FileVersionOptions
        {
            ItemId = "ver-1",
            TenantId = "tenant-1",
            CreatedBy = "user-1",
            StorageKey = "tenant-1/file-1/3",
            UploadedBy = "user-2",
        });

        version.No.Should().Be(3);
        version.FileId.Should().Be("file-1");
        version.StorageKey.Should().Be("tenant-1/file-1/3");
        version.UploadedBy.Should().Be("user-2");
    }

    [Fact]
    public void FileVersion_storage_key_stays_null_when_not_supplied_so_download_falls_back()
    {
        var version = FileVersion.CreateNew("file-1", 1, new FileVersionOptions
        {
            ItemId = "ver-2",
            TenantId = "tenant-1",
            CreatedBy = "user-1",
        });

        version.StorageKey.Should().BeNull();
        version.UploadedBy.Should().BeNull();
    }

    [Fact]
    public async Task File_written_without_the_new_fields_reads_back_active_and_inheriting()
    {
        var id = Guid.NewGuid().ToString();
        await _db.GetCollection<BsonDocument>("Files").InsertOneAsync(new BsonDocument
        {
            { "_id", id },
            { "Name", "legacy.pdf" },
            { "TenantId", "tenant-1" },
            { "SystemName", "legacy.pdf" },
            { "Url", "https://example.invalid/legacy.pdf" },
        });

        var found = await _db.GetCollection<File>("Files").Find(f => f.ItemId == id).SingleAsync();

        found.Name.Should().Be("legacy.pdf");
        found.IsArchived.Should().BeFalse();
        found.AncestorIds.Should().NotBeNull().And.BeEmpty();
    }

    [Fact]
    public async Task File_round_trips_its_new_fields()
    {
        var typed = _db.GetCollection<File>("Files");
        var file = new File
        {
            ItemId = Guid.NewGuid().ToString(),
            Name = "report.pdf",
            TenantId = "tenant-1",
            SystemName = "report.pdf",
            Url = "https://example.invalid/report.pdf",
            AncestorIds = new List<string> { "root-1", "dir-1" },
            InheritsParentAccess = false,
            Extension = "pdf",
            SizeInBytes = 2048,
            ContentType = "application/pdf",
            IsArchived = true,
            IsActive = false,
            ConfigurationName = "default",
        };

        await typed.InsertOneAsync(file);
        var found = await typed.Find(f => f.ItemId == file.ItemId).SingleAsync();

        found.AncestorIds.Should().Equal("root-1", "dir-1");
        found.InheritsParentAccess.Should().BeFalse();
        found.Extension.Should().Be("pdf");
        found.SizeInBytes.Should().Be(2048);
        found.ContentType.Should().Be("application/pdf");
        found.IsArchived.Should().BeTrue();
        found.IsActive.Should().BeFalse();
        found.ConfigurationName.Should().Be("default");
    }

    [Fact]
    public async Task Directory_round_trips_its_new_fields()
    {
        var typed = _db.GetCollection<Directory>("Directories");
        var directory = new Directory
        {
            ItemId = Guid.NewGuid().ToString(),
            Name = "Reports",
            TenantId = "tenant-1",
            SystemName = "reports",
            AncestorIds = new List<string> { "root-1" },
            FullPath = "/root",
            InheritsParentAccess = false,
            IsArchived = true,
            IsActive = false,
            ConfigurationName = "default",
            ModuleName = "dms",
            Description = "Quarterly reports",
            ChildFolderCount = 2,
            ChildFileCount = 5,
            SizeInBytes = 4096,
        };

        await typed.InsertOneAsync(directory);
        var found = await typed.Find(d => d.ItemId == directory.ItemId).SingleAsync();

        found.AncestorIds.Should().Equal("root-1");
        found.FullPath.Should().Be("/root");
        found.InheritsParentAccess.Should().BeFalse();
        found.IsArchived.Should().BeTrue();
        found.IsActive.Should().BeFalse();
        found.ModuleName.Should().Be("dms");
        found.Description.Should().Be("Quarterly reports");
        found.ChildFolderCount.Should().Be(2);
        found.ChildFileCount.Should().Be(5);
        found.SizeInBytes.Should().Be(4096);
    }

    [Fact]
    public async Task FileVersion_round_trips_its_new_fields()
    {
        var typed = _db.GetCollection<FileVersion>("FileVersions");
        var version = FileVersion.CreateNew("file-1", 2, new FileVersionOptions
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            CreatedBy = "user-1",
            StorageKey = "tenant-1/file-1/2",
            UploadedBy = "user-2",
        });
        version.SizeInBytes = 1024;

        await typed.InsertOneAsync(version);
        var found = await typed.Find(v => v.ItemId == version.ItemId).SingleAsync();

        found.StorageKey.Should().Be("tenant-1/file-1/2");
        found.UploadedBy.Should().Be("user-2");
        found.SizeInBytes.Should().Be(1024);
        found.No.Should().Be(2);
    }
}
