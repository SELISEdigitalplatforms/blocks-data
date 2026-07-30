using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Services;
using Storage.DomainService.Shared.Entities;
using Storage.DomainService.Shared.Enums;
using Storage.DomainService.Storage;
using Worker.Consumers;

namespace XUnitTest.Worker;

public class CreateDefaultFolderEventConsumerTests
{
    private readonly Mock<IFileRepository> _fileRepository = new();
    private readonly CreateDefaultFolderEventConsumer _consumer;

    public CreateDefaultFolderEventConsumerTests()
    {
        _consumer = new CreateDefaultFolderEventConsumer(
            NullLogger<CreateDefaultFolderEventConsumer>.Instance,
            _fileRepository.Object);
    }

    private static CreateDefaultFolderEvent Event() => new()
    {
        ItemId = "item-1",
        ConfigurationName = "Azure",
        StorageStrategy = "S3Compatible",
        ProjectKey = "proj-1",
    };

    private static DmsArtifact Folder(string itemId, string parentId, string name) => new()
    {
        ItemId = itemId,
        ParentId = parentId,
        Name = name,
        ArtifactType = (int)DmsArtifactType.Folder,
        ConfigurationName = "Azure",
    };

    private List<DmsArtifact> GivenFolders(params DmsArtifact[] folders)
    {
        var list = folders.ToList();
        _fileRepository
            .Setup(r => r.GetDmsArtifactsAsync(It.IsAny<FilterDefinition<DmsArtifact>?>()))
            .ReturnsAsync(list);
        return list;
    }

    [Fact]
    public async Task Consume_RepointsRootFoldersAtTheTargetStrategyAndSaves()
    {
        var folders = GivenFolders(Folder("root-1", string.Empty, "Documents"));

        await _consumer.Consume(Event());

        _fileRepository.Verify(r => r.SavedmsArtifactsAsync(folders), Times.Once);
        var root = folders.Single();
        root.ConfigurationName.Should().Be("S3Compatible");
        root.ParentId.Should().BeEmpty("a root folder keeps its empty parent");
        root.ItemId.Should().NotBe("root-1", "each copied folder gets a fresh id");
    }

    [Fact]
    public async Task Consume_RewiresChildrenToTheirParentsNewId()
    {
        var folders = GivenFolders(
            Folder("root-1", string.Empty, "Documents"),
            Folder("child-1", "root-1", "Invoices"),
            Folder("grandchild-1", "child-1", "2026"));

        await _consumer.Consume(Event());

        var root = folders.Single(f => f.Name == "Documents");
        var child = folders.Single(f => f.Name == "Invoices");
        var grandchild = folders.Single(f => f.Name == "2026");

        child.ParentId.Should().Be(root.ItemId);
        grandchild.ParentId.Should().Be(child.ItemId);
        folders.Select(f => f.ItemId).Should().OnlyHaveUniqueItems();
        folders.Should().OnlyContain(f => f.ConfigurationName == "S3Compatible");
    }

    [Fact]
    public async Task Consume_LeavesFoldersWithNoMatchingParentUntouched()
    {
        // Parent id points at a folder that is not in the fetched set, so the recursion never
        // reaches it and it is saved as-is.
        var folders = GivenFolders(Folder("orphan-1", "missing-parent", "Orphan"));

        await _consumer.Consume(Event());

        var orphan = folders.Single();
        orphan.ItemId.Should().Be("orphan-1");
        orphan.ParentId.Should().Be("missing-parent");
        orphan.ConfigurationName.Should().Be("Azure");
        _fileRepository.Verify(r => r.SavedmsArtifactsAsync(folders), Times.Once);
    }

    [Fact]
    public async Task Consume_SavesAnEmptySetWhenThereAreNoDefaultFolders()
    {
        var folders = GivenFolders();

        await _consumer.Consume(Event());

        _fileRepository.Verify(r => r.SavedmsArtifactsAsync(folders), Times.Once);
        folders.Should().BeEmpty();
    }

    [Fact]
    public async Task Consume_SwallowsRepositoryFailures()
    {
        _fileRepository
            .Setup(r => r.GetDmsArtifactsAsync(It.IsAny<FilterDefinition<DmsArtifact>?>()))
            .ThrowsAsync(new TimeoutException("mongo down"));

        var act = () => _consumer.Consume(Event());

        await act.Should().NotThrowAsync();
        _fileRepository.Verify(r => r.SavedmsArtifactsAsync(It.IsAny<List<DmsArtifact>>()), Times.Never);
    }

    [Fact]
    public async Task Consume_SwallowsSaveFailures()
    {
        GivenFolders(Folder("root-1", string.Empty, "Documents"));
        _fileRepository
            .Setup(r => r.SavedmsArtifactsAsync(It.IsAny<List<DmsArtifact>>()))
            .ThrowsAsync(new InvalidOperationException("write failed"));

        var act = () => _consumer.Consume(Event());

        await act.Should().NotThrowAsync();
    }
}
