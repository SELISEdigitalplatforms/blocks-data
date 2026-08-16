using Blocks.Genesis;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using XUnitTest.Infrastructure;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;
using File = Storage.DomainService.Entities.File;

namespace XUnitTest.Storage;

/// <summary>
/// Covers the cached ancestry that access inheritance reads. The cycle handling is the
/// part that matters most: this service is usually run precisely because the stored
/// hierarchy is suspect, so it has to terminate on data that is already wrong rather
/// than assume the tree is well formed.
/// </summary>
[Collection("Mongo")]
public class ObjectHierarchyServiceTests : IDisposable
{
    private readonly IMongoDatabase _db;
    private readonly ObjectHierarchyService _hierarchy;

    public ObjectHierarchyServiceTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<FileDirectory>(It.IsAny<string>()))
            .Returns((string n) => _db.GetCollection<FileDirectory>(n));
        provider.Setup(p => p.GetCollection<File>(It.IsAny<string>()))
            .Returns((string n) => _db.GetCollection<File>(n));

        _hierarchy = new ObjectHierarchyService(provider.Object);
        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1");
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private Task Directory(string id, string name, string? parent, string tenantId = "tenant-1")
        => _db.GetCollection<FileDirectory>("FileDirectories").InsertOneAsync(new FileDirectory
        {
            ItemId = id,
            TenantId = tenantId,
            Name = name,
            SystemName = name.ToLowerInvariant(),
            ParentId = parent,
            Type = StructureType.Directory,
            CreatedBy = "user-1",
            CreatedDate = DateTime.UtcNow,
        });

    private Task FileIn(string id, string name, string parent, long sizeInBytes = 0)
        => _db.GetCollection<File>("Files").InsertOneAsync(new File
        {
            ItemId = id,
            TenantId = "tenant-1",
            Name = name,
            SystemName = name.ToLowerInvariant(),
            DirectoryId = parent,
            Type = StructureType.File,
            SizeInBytes = sizeInBytes,
            CreatedBy = "user-1",
            CreatedDate = DateTime.UtcNow,
        });

    private async Task<FileDirectory> Read(string id) =>
        await _db.GetCollection<FileDirectory>("FileDirectories").Find(d => d.ItemId == id).SingleAsync();

    private async Task<File> ReadFile(string id) =>
        await _db.GetCollection<File>("Files").Find(f => f.ItemId == id).SingleAsync();

    /// <summary>root -> a -> b -> c, with one file in each of a and c.</summary>
    private async Task BuildChain()
    {
        await Directory("root", "root", null);
        await Directory("a", "alpha", "root");
        await Directory("b", "beta", "a");
        await Directory("c", "gamma", "b");
        await FileIn("f-a", "in-a.txt", "a");
        await FileIn("f-c", "in-c.txt", "c");
    }

    [Fact]
    public async Task A_root_directory_has_no_ancestors()
    {
        await Directory("root", "root", null);

        (await _hierarchy.GetAncestorsAsync("root")).Should().BeEmpty();
    }

    [Fact]
    public async Task Ancestors_are_returned_root_first()
    {
        await BuildChain();

        var ancestors = await _hierarchy.GetAncestorsAsync("c");

        ancestors.Select(a => a.ItemId).Should().Equal("root", "a", "b");
    }

    [Fact]
    public async Task An_unknown_directory_has_no_ancestors()
    {
        (await _hierarchy.GetAncestorsAsync("nope")).Should().BeEmpty();
        (await _hierarchy.GetAncestorsAsync(string.Empty)).Should().BeEmpty();
    }

    [Fact]
    public async Task Rebuilding_writes_ancestry_and_path_through_the_whole_subtree()
    {
        await BuildChain();

        await _hierarchy.RebuildAncestorPathsAsync("root");

        (await Read("root")).AncestorIds.Should().BeEmpty();
        (await Read("root")).FullPath.Should().Be("/root");

        (await Read("a")).AncestorIds.Should().Equal("root");
        (await Read("a")).FullPath.Should().Be("/root/alpha");

        (await Read("c")).AncestorIds.Should().Equal("root", "a", "b");
        (await Read("c")).FullPath.Should().Be("/root/alpha/beta/gamma");
    }

    [Fact]
    public async Task Rebuilding_also_writes_ancestry_onto_the_files_in_each_directory()
    {
        await BuildChain();

        await _hierarchy.RebuildAncestorPathsAsync("root");

        // A file's ancestry ends at its own directory, which is what inheritance walks.
        (await ReadFile("f-a")).AncestorIds.Should().Equal("root", "a");
        (await ReadFile("f-c")).AncestorIds.Should().Equal("root", "a", "b", "c");
    }

    [Fact]
    public async Task Rebuilding_from_a_middle_directory_keeps_the_ancestry_above_it()
    {
        await BuildChain();

        await _hierarchy.RebuildAncestorPathsAsync("b");

        (await Read("b")).AncestorIds.Should().Equal("root", "a");
        (await Read("c")).AncestorIds.Should().Equal("root", "a", "b");
        (await Read("a")).AncestorIds.Should().BeEmpty("nothing above the starting directory is rewritten");
    }

    [Fact]
    public async Task Rebuilding_an_unknown_directory_changes_nothing()
    {
        await BuildChain();

        (await _hierarchy.RebuildAncestorPathsAsync("nope")).Should().Be(0);
    }

    [Fact]
    public async Task Rebuilding_is_safe_to_run_twice()
    {
        await BuildChain();

        await _hierarchy.RebuildAncestorPathsAsync("root");
        await _hierarchy.RebuildAncestorPathsAsync("root");

        (await Read("c")).AncestorIds.Should().Equal("root", "a", "b");
        (await Read("c")).FullPath.Should().Be("/root/alpha/beta/gamma");
    }

    [Fact]
    public async Task Rebuilding_terminates_on_a_hierarchy_that_is_already_cyclic()
    {
        // Two directorys pointing at each other, which no valid operation produces but bad
        // data can. Without the visited set this walk never returns.
        await Directory("x", "ex", "y");
        await Directory("y", "why", "x");

        var work = _hierarchy.RebuildAncestorPathsAsync("x");
        var finished = await Task.WhenAny(work, Task.Delay(TimeSpan.FromSeconds(10)));

        finished.Should().BeSameAs(work, "the visited set must break the ring");
        await work;
    }

    [Fact]
    public async Task Moving_a_directory_rewrites_the_subtree_beneath_it()
    {
        await BuildChain();
        await Directory("dest", "destination", "root");
        await _hierarchy.RebuildAncestorPathsAsync("root");

        var result = await _hierarchy.MoveDirectoryAsync("b", "dest");

        result.Should().Be(MoveDirectoryResult.Moved);
        (await Read("b")).AncestorIds.Should().Equal("root", "dest");
        (await Read("b")).FullPath.Should().Be("/root/destination/beta");
        (await Read("c")).AncestorIds.Should().Equal("root", "dest", "b");
        (await Read("c")).FullPath.Should().Be("/root/destination/beta/gamma");
        (await ReadFile("f-c")).AncestorIds.Should().Equal("root", "dest", "b", "c");
    }

    [Fact]
    public async Task Moving_a_directory_recalculates_source_target_and_ancestor_caches()
    {
        await Directory("root", "root", null);
        await Directory("source", "source", "root");
        await Directory("moved", "moved", "source");
        await Directory("target", "target", "root");
        await FileIn("source-file", "source.txt", "source", 10);
        await FileIn("moved-file", "moved.txt", "moved", 20);
        await _hierarchy.RebuildAncestorPathsAsync("root");

        var result = await _hierarchy.MoveDirectoryAsync("moved", "target");

        result.Should().Be(MoveDirectoryResult.Moved);
        var source = await Read("source");
        source.ChildDirectoryCount.Should().Be(0);
        source.ChildFileCount.Should().Be(1);
        source.SizeInBytes.Should().Be(10);

        var target = await Read("target");
        target.ChildDirectoryCount.Should().Be(1);
        target.ChildFileCount.Should().Be(0);
        target.SizeInBytes.Should().Be(20);

        var root = await Read("root");
        root.ChildDirectoryCount.Should().Be(2);
        root.SizeInBytes.Should().Be(30);
    }

    [Fact]
    public async Task Moving_a_directory_into_its_own_descendant_is_refused()
    {
        await BuildChain();

        var result = await _hierarchy.MoveDirectoryAsync("a", "c");

        result.Should().Be(MoveDirectoryResult.WouldCreateCycle);
        (await Read("a")).ParentId.Should().Be("root", "the move must not be applied");
    }

    [Fact]
    public async Task Moving_a_directory_into_itself_is_refused()
    {
        await BuildChain();

        (await _hierarchy.MoveDirectoryAsync("a", "a")).Should().Be(MoveDirectoryResult.WouldCreateCycle);
    }

    [Fact]
    public async Task Moving_to_a_target_that_does_not_exist_is_refused()
    {
        await BuildChain();

        (await _hierarchy.MoveDirectoryAsync("a", "nowhere")).Should().Be(MoveDirectoryResult.TargetNotFound);
        (await Read("a")).ParentId.Should().Be("root");
    }

    [Fact]
    public async Task Moving_a_directory_that_does_not_exist_is_refused()
    {
        await BuildChain();

        (await _hierarchy.MoveDirectoryAsync("nope", "root")).Should().Be(MoveDirectoryResult.SourceNotFound);
    }

    [Fact]
    public async Task Moving_a_default_directory_is_refused()
    {
        // Default directories are system roots and cannot be relocated, regardless
        // of where they are being moved to.
        await BuildChain();
        await Directory("cloud", "Cloud", "root");
        await _db.GetCollection<FileDirectory>("FileDirectories").UpdateOneAsync(
            d => d.ItemId == "cloud",
            Builders<FileDirectory>.Update.Set(d => d.Tags, new List<string> { "default" }));

        var result = await _hierarchy.MoveDirectoryAsync("cloud", "dest");

        result.Should().Be(MoveDirectoryResult.IsDefault);
        (await Read("cloud")).ParentId.Should().Be("root");
    }

    [Fact]
    public async Task Moving_onto_a_name_already_used_in_the_target_is_refused()
    {
        await BuildChain();
        await Directory("dest", "destination", "root");
        await Directory("clash", "beta", "dest");

        var result = await _hierarchy.MoveDirectoryAsync("b", "dest");

        result.Should().Be(MoveDirectoryResult.NameConflict);
        (await Read("b")).ParentId.Should().Be("a");
    }

    [Fact]
    public async Task Moving_a_directory_to_the_top_level_clears_its_ancestry()
    {
        await BuildChain();
        await _hierarchy.RebuildAncestorPathsAsync("root");

        var result = await _hierarchy.MoveDirectoryAsync("b", null);

        result.Should().Be(MoveDirectoryResult.Moved);
        var moved = await Read("b");
        moved.ParentId.Should().BeNull();
        moved.AncestorIds.Should().BeEmpty();
        moved.FullPath.Should().Be("/beta");
        (await Read("c")).AncestorIds.Should().Equal("b");
    }
}
