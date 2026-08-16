using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using Worker.Consumers;
using FileDirectory = Storage.DomainService.Entities.FileDirectory;

namespace XUnitTest.Worker;

public class CreateDefaultDirectoryEventConsumerTests
{
    private readonly Mock<IFileDirectoryRepository> _directoryRepository = new();
    private readonly CreateDefaultDirectoryEventConsumer _consumer;

    public CreateDefaultDirectoryEventConsumerTests()
    {
        _consumer = new CreateDefaultDirectoryEventConsumer(
            NullLogger<CreateDefaultDirectoryEventConsumer>.Instance,
            _directoryRepository.Object);
    }

    private static CreateDefaultDirectoryEvent Event() => new()
    {
        ItemId = "item-1",
        ConfigurationName = "Azure",
        StorageStrategy = "S3Compatible",
        ProjectKey = "proj-1",
    };

    private static FileDirectory Directory(string itemId, string? parentId, string name) => new()
    {
        ItemId = itemId,
        ParentId = parentId,
        Name = name,
        SystemName = name.ToLower(),
        ConfigurationName = "Azure",
    };

    private void GivenTemplates(params FileDirectory[] directorys)
    {
        _directoryRepository
            .Setup(r => r.GetByConfigurationNameAsync("Azure", It.IsAny<CancellationToken>()))
            .ReturnsAsync(directorys.ToList());
    }

    private List<FileDirectory> CaptureSaved()
    {
        var captured = new List<FileDirectory>();
        _directoryRepository
            .Setup(r => r.CreateDirectoriesAsync(It.IsAny<List<FileDirectory>>()))
            .Callback<List<FileDirectory>>(captured.AddRange)
            .Returns(Task.CompletedTask);
        return captured;
    }

    [Fact]
    public async Task Consume_CreatesRootDirectorysAsDirectoriesWithFreshIds()
    {
        GivenTemplates(Directory("root-1", null, "Documents"));

        var saved = CaptureSaved();

        await _consumer.Consume(Event());

        _directoryRepository.Verify(r => r.CreateDirectoriesAsync(It.IsAny<List<FileDirectory>>()), Times.Once);
        var root = saved.Single();
        root.Name.Should().Be("Documents");
        root.ConfigurationName.Should().Be("S3Compatible");
        root.ParentId.Should().BeNull("a root directory has no parent");
        root.AncestorIds.Should().BeEmpty();
        root.FullPath.Should().Be("/Documents");
        root.SystemName.Should().Be("documents");
        root.Type.Should().Be(StructureType.Directory);
        root.ItemId.Should().NotBe("root-1", "each cloned directory gets a fresh id");
        root.InheritsParentAccess.Should().BeTrue();
        root.IsArchived.Should().BeFalse();
        root.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task Consume_WiresChildrenToTheirParentsNewIdAndBuildsAncestry()
    {
        GivenTemplates(
            Directory("root-1", null, "Documents"),
            Directory("child-1", "root-1", "Invoices"),
            Directory("grandchild-1", "child-1", "2026"));

        var saved = CaptureSaved();

        await _consumer.Consume(Event());

        saved.Should().HaveCount(3);
        saved.Select(d => d.ItemId).Should().OnlyHaveUniqueItems();

        var root = saved.Single(d => d.Name == "Documents");
        var child = saved.Single(d => d.Name == "Invoices");
        var grandchild = saved.Single(d => d.Name == "2026");

        child.ParentId.Should().Be(root.ItemId);
        child.AncestorIds.Should().Equal(new[] { root.ItemId });
        child.FullPath.Should().Be("/Documents/Invoices");

        grandchild.ParentId.Should().Be(child.ItemId);
        grandchild.AncestorIds.Should().Equal(new[] { root.ItemId, child.ItemId });
        grandchild.FullPath.Should().Be("/Documents/Invoices/2026");

        saved.Should().OnlyContain(d => d.ConfigurationName == "S3Compatible");
    }

    [Fact]
    public async Task Consume_DoesNotSaveAnythingWhenThereAreNoDefaultDirectorys()
    {
        GivenTemplates();

        await _consumer.Consume(Event());

        _directoryRepository.Verify(r => r.CreateDirectoriesAsync(It.IsAny<List<FileDirectory>>()), Times.Never);
    }

    [Fact]
    public async Task Consume_SwallowsTemplateFetchFailures()
    {
        _directoryRepository
            .Setup(r => r.GetByConfigurationNameAsync("Azure", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TimeoutException("mongo down"));

        var act = () => _consumer.Consume(Event());

        await act.Should().NotThrowAsync();
        _directoryRepository.Verify(r => r.CreateDirectoriesAsync(It.IsAny<List<FileDirectory>>()), Times.Never);
    }

    [Fact]
    public async Task Consume_SwallowsSaveFailures()
    {
        GivenTemplates(Directory("root-1", null, "Documents"));
        _directoryRepository
            .Setup(r => r.CreateDirectoriesAsync(It.IsAny<List<FileDirectory>>()))
            .ThrowsAsync(new InvalidOperationException("write failed"));

        var act = () => _consumer.Consume(Event());

        await act.Should().NotThrowAsync();
    }
}
