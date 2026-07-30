using Blocks.Genesis;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using XUnitTest.Infrastructure;
using Directory = Storage.DomainService.Entities.Directory;
using File = Storage.DomainService.Entities.File;

namespace XUnitTest.Storage;

/// <summary>
/// Covers file version history, move and copy. The copy is deliberately zero-copy: new
/// version rows point at the same immutable storage objects, so the tests assert that
/// the keys are shared rather than regenerated.
/// </summary>
[Collection("Mongo")]
public class ContentFileServiceTests : IDisposable
{
    private readonly IMongoDatabase _db;
    private readonly ContentAccessRepository _accessRepository;
    private readonly ContentFileService _files;

    public ContentFileServiceTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<File>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<File>(n));
        provider.Setup(p => p.GetCollection<Directory>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<Directory>(n));
        provider.Setup(p => p.GetCollection<FileVersion>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<FileVersion>(n));
        provider.Setup(p => p.GetCollection<ContentAccessPolicy>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ContentAccessPolicy>(n));
        provider.Setup(p => p.GetCollection<ContentAuditLog>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<ContentAuditLog>(n));

        _accessRepository = new ContentAccessRepository(provider.Object);
        _files = new ContentFileService(provider.Object, _accessRepository);

        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1");
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private Task Folder(string id, string name, string[]? allowedExtensions = null, List<string>? ancestors = null)
        => _db.GetCollection<Directory>("Directories").InsertOneAsync(new Directory
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = name,
            SystemName = name.ToLowerInvariant(),
            Type = StructureType.Directory,
            AncestorIds = ancestors ?? new List<string>(),
            AllowedFileExtensions = allowedExtensions!,
            CreatedBy = "user-1",
            CreatedDate = DateTime.UtcNow,
        });

    private Task FileDoc(string id, string name, string parent, string tenantId = "tenant-1", string? extension = "txt")
        => _db.GetCollection<File>("Files").InsertOneAsync(new File
        {
            ItemId = id,
            TenantId = tenantId,
            Name = name,
            SystemName = name.ToLowerInvariant(),
            ParentDirectoryID = parent,
            Type = StructureType.File,
            Extension = extension,
            SizeInBytes = 42,
            ContentType = "text/plain",
            CurrentVersion = 2,
            AncestorIds = new List<string> { parent },
            CreatedBy = "author",
            CreatedDate = DateTime.UtcNow,
        });

    private Task Version(string fileId, long no, string storageKey)
    {
        var v = FileVersion.CreateNew(fileId, no, new FileVersionOptions
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            CreatedBy = "author",
            StorageKey = storageKey,
            UploadedBy = "author",
        });
        v.SizeInBytes = 10 * no;
        return _db.GetCollection<FileVersion>("FileVersions").InsertOneAsync(v);
    }

    private async Task<File> ReadFile(string id) =>
        await _db.GetCollection<File>("Files").Find(f => f.ItemId == id).SingleAsync();

    // Versions

    [Fact]
    public async Task Versions_are_returned_newest_first()
    {
        await FileDoc("file-1", "doc.txt", "dir-1");
        for (long i = 1; i <= 3; i++) await Version("file-1", i, $"Private/file-1/v{i}/doc.txt");

        var page = await _files.GetVersionsAsync("file-1");

        page.Items.Select(v => v.No).Should().Equal(3, 2, 1);
        page.HasMore.Should().BeFalse();
        page.NextCursor.Should().BeNull();
    }

    [Fact]
    public async Task Version_paging_walks_the_history_once()
    {
        await FileDoc("file-1", "doc.txt", "dir-1");
        for (long i = 1; i <= 7; i++) await Version("file-1", i, $"Private/file-1/v{i}/doc.txt");

        var seen = new List<long>();
        string? cursor = null;
        var guard = 0;

        do
        {
            var page = await _files.GetVersionsAsync("file-1", cursor, limit: 3);
            seen.AddRange(page.Items.Select(v => v.No));
            cursor = page.NextCursor;
            if (++guard > 10) break;
        } while (cursor is not null);

        seen.Should().Equal(7, 6, 5, 4, 3, 2, 1);
        seen.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task Versions_of_another_file_or_tenant_are_not_returned()
    {
        await FileDoc("file-1", "doc.txt", "dir-1");
        await Version("file-1", 1, "Private/file-1/v1/doc.txt");
        await Version("file-2", 1, "Private/file-2/v1/other.txt");

        var page = await _files.GetVersionsAsync("file-1");

        page.Items.Should().ContainSingle();
        page.Items[0].FileId.Should().Be("file-1");
    }

    [Fact]
    public async Task Asking_for_versions_of_nothing_returns_an_empty_page()
    {
        (await _files.GetVersionsAsync(string.Empty)).Items.Should().BeEmpty();
        (await _files.GetVersionsAsync("no-such-file")).Items.Should().BeEmpty();
    }

    [Fact]
    public async Task A_malformed_version_cursor_falls_back_to_the_newest_page()
    {
        await FileDoc("file-1", "doc.txt", "dir-1");
        await Version("file-1", 1, "Private/file-1/v1/doc.txt");

        var page = await _files.GetVersionsAsync("file-1", cursor: "not a number");

        page.Items.Should().ContainSingle();
    }

    // Move

    [Fact]
    public async Task Moving_a_file_repoints_it_and_rewrites_its_ancestry()
    {
        await Folder("dir-1", "source");
        await Folder("dir-2", "target", ancestors: new List<string> { "root" });
        await FileDoc("file-1", "doc.txt", "dir-1");

        var result = await _files.MoveFileAsync("file-1", "dir-2");

        result.Status.Should().Be(FileOperationStatus.Succeeded);
        var moved = await ReadFile("file-1");
        moved.ParentDirectoryID.Should().Be("dir-2");
        moved.AncestorIds.Should().Equal("root", "dir-2");
    }

    [Fact]
    public async Task Moving_a_file_that_does_not_exist_is_refused()
    {
        await Folder("dir-2", "target");

        (await _files.MoveFileAsync("nope", "dir-2")).Status.Should().Be(FileOperationStatus.FileNotFound);
    }

    [Fact]
    public async Task Moving_into_a_folder_that_does_not_exist_is_refused()
    {
        await Folder("dir-1", "source");
        await FileDoc("file-1", "doc.txt", "dir-1");

        (await _files.MoveFileAsync("file-1", "nowhere")).Status.Should().Be(FileOperationStatus.TargetNotFound);
        (await ReadFile("file-1")).ParentDirectoryID.Should().Be("dir-1", "a refused move writes nothing");
    }

    [Fact]
    public async Task Moving_onto_an_existing_name_in_the_target_is_refused()
    {
        await Folder("dir-1", "source");
        await Folder("dir-2", "target");
        await FileDoc("file-1", "doc.txt", "dir-1");
        await FileDoc("file-2", "doc.txt", "dir-2");

        var result = await _files.MoveFileAsync("file-1", "dir-2");

        result.Status.Should().Be(FileOperationStatus.NameConflict);
        (await ReadFile("file-1")).ParentDirectoryID.Should().Be("dir-1");
    }

    [Fact]
    public async Task Moving_a_file_into_a_folder_that_rejects_its_extension_is_refused()
    {
        await Folder("dir-1", "source");
        await Folder("dir-2", "images", allowedExtensions: new[] { "png", "jpg" });
        await FileDoc("file-1", "doc.txt", "dir-1", extension: "txt");

        var result = await _files.MoveFileAsync("file-1", "dir-2");

        result.Status.Should().Be(FileOperationStatus.ExtensionNotAllowed);
    }

    [Fact]
    public async Task An_allowed_extension_is_matched_regardless_of_case_or_leading_dot()
    {
        await Folder("dir-1", "source");
        await Folder("dir-2", "images", allowedExtensions: new[] { ".PNG" });
        await FileDoc("file-1", "photo.png", "dir-1", extension: "png");

        (await _files.MoveFileAsync("file-1", "dir-2")).Status.Should().Be(FileOperationStatus.Succeeded);
    }

    [Fact]
    public async Task Moving_a_file_into_the_folder_it_already_sits_in_is_allowed()
    {
        // The file itself is excluded from the name-clash probe, so a no-op move does not
        // collide with its own record.
        await Folder("dir-1", "source");
        await FileDoc("file-1", "doc.txt", "dir-1");

        (await _files.MoveFileAsync("file-1", "dir-1")).Status.Should().Be(FileOperationStatus.Succeeded);
    }

    [Fact]
    public async Task A_file_in_another_tenant_cannot_be_moved()
    {
        await Folder("dir-2", "target");
        await FileDoc("file-1", "doc.txt", "dir-1", tenantId: "tenant-2");

        (await _files.MoveFileAsync("file-1", "dir-2")).Status.Should().Be(FileOperationStatus.FileNotFound);
    }

    // Copy

    [Fact]
    public async Task Copying_creates_a_new_file_in_the_target_and_leaves_the_source_alone()
    {
        await Folder("dir-1", "source");
        await Folder("dir-2", "target", ancestors: new List<string> { "root" });
        await FileDoc("file-1", "doc.txt", "dir-1");

        var result = await _files.CopyFileAsync("file-1", "dir-2");

        result.Status.Should().Be(FileOperationStatus.Succeeded);
        result.NewFileId.Should().NotBeNullOrEmpty().And.NotBe("file-1");

        var copy = await ReadFile(result.NewFileId!);
        copy.ParentDirectoryID.Should().Be("dir-2");
        copy.AncestorIds.Should().Equal("root", "dir-2");
        copy.Name.Should().Be("doc.txt");
        copy.SizeInBytes.Should().Be(42);

        (await ReadFile("file-1")).ParentDirectoryID.Should().Be("dir-1");
    }

    [Fact]
    public async Task A_copy_shares_the_storage_objects_of_the_source_rather_than_duplicating_them()
    {
        // Zero-copy: versions are immutable, so the clone points at the same keys. The
        // consequence is that deleting a file must not purge storage another file still
        // references.
        await Folder("dir-1", "source");
        await Folder("dir-2", "target");
        await FileDoc("file-1", "doc.txt", "dir-1");
        await Version("file-1", 1, "Private/file-1/v1/doc.txt");
        await Version("file-1", 2, "Private/file-1/v2/doc.txt");

        var result = await _files.CopyFileAsync("file-1", "dir-2");

        var copied = await _files.GetVersionsAsync(result.NewFileId!);
        copied.Items.Select(v => v.No).Should().Equal(2, 1);
        copied.Items.Select(v => v.StorageKey)
            .Should().Equal("Private/file-1/v2/doc.txt", "Private/file-1/v1/doc.txt");
        copied.Items.Should().OnlyContain(v => v.FileId == result.NewFileId);

        // The clone rows are distinct documents, not the source's rows relabelled.
        var sourceVersions = await _files.GetVersionsAsync("file-1");
        sourceVersions.Items.Should().HaveCount(2);
        sourceVersions.Items.Select(v => v.ItemId)
            .Should().NotIntersectWith(copied.Items.Select(v => v.ItemId));
    }

    [Fact]
    public async Task A_copy_inherits_from_where_it_lands_even_when_the_source_did_not()
    {
        await Folder("dir-1", "source");
        await Folder("dir-2", "target");
        await _db.GetCollection<File>("Files").InsertOneAsync(new File
        {
            ItemId = "file-1",
            TenantId = "tenant-1",
            Name = "doc.txt",
            SystemName = "doc.txt",
            ParentDirectoryID = "dir-1",
            InheritsParentAccess = false,
            CreatedBy = "author",
        });

        var result = await _files.CopyFileAsync("file-1", "dir-2");

        (await ReadFile(result.NewFileId!)).InheritsParentAccess
            .Should().BeTrue("a copy must not silently carry a detached policy into a new location");
    }

    [Fact]
    public async Task Access_entries_are_not_carried_over_unless_asked_for()
    {
        await Folder("dir-1", "source");
        await Folder("dir-2", "target");
        await FileDoc("file-1", "doc.txt", "dir-1");
        await _accessRepository.GrantAsync(new ContentAccessPolicy
        {
            ItemId = Guid.NewGuid().ToString(),
            TenantId = "tenant-1",
            ResourceId = "file-1",
            ResourceType = ContentResourceType.File,
            PrincipalType = ContentPrincipalType.Role,
            PrincipalId = "editors",
            Permission = ContentPermission.Edit,
            Effect = ContentEffect.Allow,
        });

        var plain = await _files.CopyFileAsync("file-1", "dir-2");
        (await _accessRepository.GetByResourceAsync(plain.NewFileId!)).Should().BeEmpty();

        await Folder("dir-3", "another");
        var withPolicies = await _files.CopyFileAsync("file-1", "dir-3", copyAccessPolicies: true);
        var cloned = await _accessRepository.GetByResourceAsync(withPolicies.NewFileId!);

        cloned.Should().ContainSingle();
        cloned[0].PrincipalId.Should().Be("editors");
        cloned[0].Permission.Should().Be(ContentPermission.Edit);
        cloned[0].ResourceId.Should().Be(withPolicies.NewFileId);
    }

    [Fact]
    public async Task Copying_onto_an_existing_name_in_the_target_is_refused()
    {
        await Folder("dir-1", "source");
        await Folder("dir-2", "target");
        await FileDoc("file-1", "doc.txt", "dir-1");
        await FileDoc("file-2", "doc.txt", "dir-2");

        var result = await _files.CopyFileAsync("file-1", "dir-2");

        result.Status.Should().Be(FileOperationStatus.NameConflict);
        result.NewFileId.Should().BeNull();
    }

    [Fact]
    public async Task Copying_a_file_with_no_versions_still_produces_the_file_record()
    {
        await Folder("dir-1", "source");
        await Folder("dir-2", "target");
        await FileDoc("file-1", "doc.txt", "dir-1");

        var result = await _files.CopyFileAsync("file-1", "dir-2");

        result.Status.Should().Be(FileOperationStatus.Succeeded);
        (await _files.GetVersionsAsync(result.NewFileId!)).Items.Should().BeEmpty();
    }

    [Fact]
    public async Task Copying_a_missing_file_or_into_a_missing_folder_is_refused()
    {
        await Folder("dir-2", "target");
        await Folder("dir-1", "source");
        await FileDoc("file-1", "doc.txt", "dir-1");

        (await _files.CopyFileAsync("nope", "dir-2")).Status.Should().Be(FileOperationStatus.FileNotFound);
        (await _files.CopyFileAsync("file-1", "nowhere")).Status.Should().Be(FileOperationStatus.TargetNotFound);
    }
}
