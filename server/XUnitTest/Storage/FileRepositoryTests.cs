using Blocks.Genesis;
using DomainService.Storage;
using FluentAssertions;
using Moq;
using MongoDB.Driver;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using XUnitTest.Infrastructure;
using File = Storage.DomainService.Entities.File;

namespace XUnitTest.Storage;

/// <summary>
/// Runs against a real (ephemeral) MongoDB so the driver actually performs the BSON
/// field-name matching a mock would silently skip — the class this guards against
/// (<see cref="FileResponse"/>) reads a differently-spelled property than the one
/// the <see cref="File"/> entity is stored under.
/// </summary>
[Collection("Mongo")]
public class FileRepositoryTests
{
    private readonly IMongoDatabase _db;
    private readonly FileRepository _repository;

    public FileRepositoryTests(MongoFixture fixture)
    {
        _db = fixture.CreateDatabase();

        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<File>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<File>(n));
        provider.Setup(p => p.GetCollection<FileResponse>(It.IsAny<string>())).Returns((string n) => _db.GetCollection<FileResponse>(n));
        provider.Setup(p => p.GetDatabase(It.IsAny<string>())).Returns(_db);

        _repository = new FileRepository(provider.Object);

        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1");
    }

    [Fact]
    public async Task GetRequiredFiles_reads_the_files_own_created_date_from_the_database()
    {
        var created = new DateTime(2026, 1, 5, 10, 30, 0, DateTimeKind.Utc);
        await _db.GetCollection<File>("Files").InsertOneAsync(new File
        {
            ItemId = "file-1",
            TenantId = "tenant-1",
            Name = "doc.txt",
            SystemName = "doc.txt",
            Type = StructureType.File,
            CreatedDate = created,
            CreatedBy = "author",
        });

        var (_, files) = _repository.GetRequiredFiles(["file-1"], null);

        files.Should().ContainSingle();
        files[0].CreatedDate.Should().Be(created);
    }
}
