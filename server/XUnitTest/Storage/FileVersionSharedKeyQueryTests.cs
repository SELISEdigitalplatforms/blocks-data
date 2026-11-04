using Blocks.Genesis;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Services;
using XUnitTest.Infrastructure;
using Blocks.Genesis.Entities.Data;

namespace XUnitTest.Storage;

/// <summary>
/// The shared-key query of permanent deletion (blocks-data#418, spec §5, §6.1) on a real MongoDB: one query
/// per file, <c>StorageKey $in</c> + <c>FileId $ne</c>, served by the <c>{StorageKey: 1}</c> index, and
/// scoped to the caller's tenant database.
/// </summary>
[Collection("Mongo")]
public class FileVersionSharedKeyQueryTests
{
    private const string Collection = "FileVersions";

    private readonly IMongoDatabase _tenantA;
    private readonly IMongoDatabase _tenantB;
    private readonly FileVersionRepository _repositoryA;

    private static readonly string[] SharedCandidates = { "Private/F1/V1/report.pdf", "Private/F1/V2/report.pdf", "Private/F1/V9/legacy.txt" };
    private static readonly string[] OneKey = { "Private/F1/V1/a.pdf" };
    private static readonly string[] ExplainedKeys = { "Private/F1/V1/doc.pdf", "Private/F2/V2/doc.pdf" };

    public FileVersionSharedKeyQueryTests(MongoFixture fixture)
    {
        ArgumentNullException.ThrowIfNull(fixture);
        _tenantA = fixture.CreateDatabase();
        _tenantB = fixture.CreateDatabase();
        _repositoryA = RepositoryFor(_tenantA);
    }

    private static FileVersionRepository RepositoryFor(IMongoDatabase database)
    {
        var provider = new Mock<IDbContextProvider>();
        provider.Setup(p => p.GetCollection<FileVersion>(It.IsAny<string>()))
            .Returns((string name) => database.GetCollection<FileVersion>(name));
        return new FileVersionRepository(provider.Object);
    }

    private static Task AddAsync(IMongoDatabase database, string fileId, string versionId, long no, string? key) =>
        database.GetCollection<FileVersion>(Collection).InsertOneAsync(
            FileVersion.CreateNew(fileId, no, new FileVersionOptions { ItemId = versionId, StorageKey = key }));

    [Fact]
    public async Task C1_returns_only_candidate_keys_another_file_references()
    {
        await AddAsync(_tenantA, "F1", "V1", 1, "Private/F1/V1/report.pdf");
        await AddAsync(_tenantA, "F1", "V2", 2, "Private/F1/V2/report.pdf");
        await AddAsync(_tenantA, "F2", "C1", 1, "Private/F1/V1/report.pdf");
        await AddAsync(_tenantA, "F3", "X1", 1, "Private/F3/X1/other.pdf");

        var shared = await _repositoryA.GetKeysReferencedByOtherFilesAsync("F1", SharedCandidates);

        shared.Should().BeEquivalentTo("Private/F1/V1/report.pdf");
    }

    [Fact]
    public async Task C1_the_files_own_versions_never_count_as_references()
    {
        await AddAsync(_tenantA, "F1", "V1", 1, "Private/F1/V1/a.pdf");
        await AddAsync(_tenantA, "F1", "V2", 2, "Private/F1/V1/a.pdf");

        var shared = await _repositoryA.GetKeysReferencedByOtherFilesAsync("F1", OneKey);

        shared.Should().BeEmpty();
    }

    [Fact]
    public async Task C13_another_tenants_versions_never_count_as_references()
    {
        await AddAsync(_tenantA, "F1", "V1", 1, "Private/F1/V1/a.pdf");
        await AddAsync(_tenantB, "F2", "C1", 1, "Private/F1/V1/a.pdf");

        var shared = await _repositoryA.GetKeysReferencedByOtherFilesAsync("F1", OneKey);

        shared.Should().BeEmpty();
        (await RepositoryFor(_tenantB).GetKeysReferencedByOtherFilesAsync("F9", OneKey))
            .Should().BeEquivalentTo("Private/F1/V1/a.pdf");
    }

    [Fact]
    public async Task GetVersionKeysAsync_reads_id_number_and_key_of_every_version_of_the_file_only()
    {
        await AddAsync(_tenantA, "F1", "V1", 1, "Private/F1/V1/a.pdf");
        await AddAsync(_tenantA, "F1", "V2", 2, null);
        await AddAsync(_tenantA, "F2", "W1", 1, "Private/F2/W1/b.pdf");

        var versions = await _repositoryA.GetVersionKeysAsync("F1");

        versions.Select(v => (v.ItemId, v.No, v.StorageKey)).Should().BeEquivalentTo(new[]
        {
            ("V1", 1L, (string?)"Private/F1/V1/a.pdf"),
            ("V2", 2L, (string?)null),
        });
    }

    [Fact]
    public async Task Performance_the_shared_key_query_is_StorageKey_in_and_FileId_ne_and_uses_the_StorageKey_index()
    {
        var collection = _tenantA.GetCollection<FileVersion>(Collection);
        for (var i = 0; i < 50; i++)
            await AddAsync(_tenantA, $"F{i}", $"V{i}", 1, $"Private/F{i}/V{i}/doc.pdf");
        await collection.Indexes.CreateOneAsync(new CreateIndexModel<FileVersion>(
            Builders<FileVersion>.IndexKeys.Ascending(v => v.StorageKey), new CreateIndexOptions { Name = "IX_FileVersions_StorageKey" }));

        var filter = FileVersionRepository.KeysReferencedByOtherFilesFilter("F1", ExplainedKeys)
            .Render(new RenderArgs<FileVersion>(collection.DocumentSerializer, collection.Settings.SerializerRegistry));

        filter.ToString().Should().Contain("\"StorageKey\" : { \"$in\"").And.Contain("\"FileId\" : { \"$ne\" : \"F1\" }");

        var explain = await _tenantA.RunCommandAsync<BsonDocument>(new BsonDocument
        {
            { "explain", new BsonDocument { { "find", Collection }, { "filter", filter } } },
            { "verbosity", "queryPlanner" },
        });
        explain["queryPlanner"]["winningPlan"].ToJson().Should().Contain("IXSCAN").And.Contain("IX_FileVersions_StorageKey");
    }
}
