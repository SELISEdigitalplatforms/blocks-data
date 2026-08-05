using Blocks.Genesis;
using FluentAssertions;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using XUnitTest.Infrastructure;
using Directory = Storage.DomainService.Entities.Directory;

namespace XUnitTest.Storage;

[Collection("Mongo")]
public class DirectoryRepositoryTests
{
    private readonly IMongoDatabase _database;
    private readonly DirectoryRepository _repository;

    public DirectoryRepositoryTests(MongoFixture fixture)
    {
        _database = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<Directory>(It.IsAny<string>()))
            .Returns((string name) => _database.GetCollection<Directory>(name));

        _repository = new DirectoryRepository(provider.Object);
    }

    [Fact]
    public async Task GetDefaultDirectoryByModuleNameAsync_returns_seeded_directory_matched_by_description()
    {
        await AddDirectoryAsync("default-construct", description: "Default_Construct");
        await AddDirectoryAsync("iam-cloud", description: "IAM_Cloud");

        var result = await _repository.GetDefaultDirectoryByModuleNameAsync("Default_Construct");

        result.Should().NotBeNull();
        result!.ItemId.Should().Be("default-construct");
    }

    [Fact]
    public async Task GetDefaultDirectoryByModuleNameAsync_returns_directory_matched_by_module_name()
    {
        await AddDirectoryAsync("data-gateway", moduleName: "DataGateway");

        var result = await _repository.GetDefaultDirectoryByModuleNameAsync("DataGateway");

        result.Should().NotBeNull();
        result!.ItemId.Should().Be("data-gateway");
    }

    private Task AddDirectoryAsync(string itemId, string? description = null, string? moduleName = null) =>
        _database.GetCollection<Directory>("Directories").InsertOneAsync(new Directory
        {
            ItemId = itemId,
            Name = itemId,
            SystemName = itemId,
            Type = StructureType.Directory,
            TypeString = StructureType.Directory.ToString(),
            TenantId = "tenant-1",
            Description = description,
            ModuleName = moduleName,
            IsArchived = false,
            CreatedDate = DateTime.UtcNow,
        });
}
