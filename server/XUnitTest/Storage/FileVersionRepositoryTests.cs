using Blocks.Genesis;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;

namespace XUnitTest.Storage
{
    /// <summary>
    /// Unit tests for <see cref="FileVersionRepository"/>. The collection name is derived from the
    /// entity type name, and the version counter is issued by a find-and-increment against the Files
    /// collection rather than by reading and writing separately. Both are pinned here, along with the
    /// missing-file case that has to yield 0 rather than throw.
    /// </summary>
    public class FileVersionRepositoryTests
    {
        private const string VersionCollection = "FileVersions";

        private readonly Mock<IDbContextProvider> _provider = new();
        private readonly Mock<IMongoCollection<FileVersion>> _versions = new();
        private readonly Mock<IMongoCollection<BsonDocument>> _files = new();
        private readonly FileVersionRepository _sut;

        public FileVersionRepositoryTests()
        {
            _provider.Setup(p => p.GetCollection<FileVersion>(VersionCollection)).Returns(_versions.Object);
            _provider.Setup(p => p.GetCollection<BsonDocument>("Files")).Returns(_files.Object);

            _versions.Setup(c => c.InsertOneAsync(It.IsAny<FileVersion>(), It.IsAny<InsertOneOptions>(), It.IsAny<CancellationToken>()))
                     .Returns(Task.CompletedTask);
            _versions.Setup(c => c.DeleteManyAsync(It.IsAny<FilterDefinition<FileVersion>>(), It.IsAny<CancellationToken>()))
                     .ReturnsAsync(new DeleteResult.Acknowledged(3));

            _sut = new FileVersionRepository(_provider.Object);
        }

        [Fact]
        public async Task TryClaimCompletionAsync_ClaimsAQuarantinedVersionAndReturnsIt()
        {
            var claimed = FileVersion.CreateNew("f1", 1, new FileVersionOptions
            {
                ItemId = "v1",
                FileVerificationStatus = FileVerificationStatus.Quarantined
            });

            _versions.Setup(c => c.FindOneAndUpdateAsync(
                         It.IsAny<FilterDefinition<FileVersion>>(),
                         It.IsAny<UpdateDefinition<FileVersion>>(),
                         It.IsAny<FindOneAndUpdateOptions<FileVersion, FileVersion>>(),
                         It.IsAny<CancellationToken>()))
                     .ReturnsAsync(claimed);

            var result = await _sut.TryClaimCompletionAsync("f1", "v1", TimeSpan.FromMinutes(5));

            result.Should().BeSameAs(claimed);
            _versions.Verify(c => c.FindOneAndUpdateAsync(
                It.IsAny<FilterDefinition<FileVersion>>(),
                It.IsAny<UpdateDefinition<FileVersion>>(),
                // Read-modify-write must round-trip the claimed document, not just acknowledge the write.
                It.Is<FindOneAndUpdateOptions<FileVersion, FileVersion>>(o => !o.IsUpsert && o.ReturnDocument == ReturnDocument.After),
                It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task TryClaimCompletionAsync_ReturnsNullWhenNoVersionMatchesTheClaimFilter()
        {
            // Covers: version missing, not Quarantined, or already claimed under an unexpired lease -
            // all three collapse to "the filter matched nothing" from the repository's point of view.
            _versions.Setup(c => c.FindOneAndUpdateAsync(
                         It.IsAny<FilterDefinition<FileVersion>>(),
                         It.IsAny<UpdateDefinition<FileVersion>>(),
                         It.IsAny<FindOneAndUpdateOptions<FileVersion, FileVersion>>(),
                         It.IsAny<CancellationToken>()))
                     .ReturnsAsync((FileVersion?)null);

            var result = await _sut.TryClaimCompletionAsync("f1", "v1", TimeSpan.FromMinutes(5));

            result.Should().BeNull();
        }

        [Fact]
        public async Task CompleteVerificationAsync_ModifiedDocument_ReturnsTrue()
        {
            _versions.Setup(c => c.UpdateOneAsync(
                         It.IsAny<FilterDefinition<FileVersion>>(),
                         It.IsAny<UpdateDefinition<FileVersion>>(),
                         It.IsAny<UpdateOptions>(),
                         It.IsAny<CancellationToken>()))
                     .ReturnsAsync(new UpdateResult.Acknowledged(1, 1, null));

            var result = await _sut.CompleteVerificationAsync("f1", "v1", FileVerificationStatus.Verified, "Private/f1/v1/report.pdf", null);

            result.Should().BeTrue();
        }

        [Fact]
        public async Task CompleteVerificationAsync_NoMatchingDocument_ReturnsFalse()
        {
            _versions.Setup(c => c.UpdateOneAsync(
                         It.IsAny<FilterDefinition<FileVersion>>(),
                         It.IsAny<UpdateDefinition<FileVersion>>(),
                         It.IsAny<UpdateOptions>(),
                         It.IsAny<CancellationToken>()))
                     .ReturnsAsync(new UpdateResult.Acknowledged(0, 0, null));

            var result = await _sut.CompleteVerificationAsync("f1", "v1", FileVerificationStatus.Rejected, null, "checksum_mismatch");

            result.Should().BeFalse();
        }

        [Fact]
        public async Task CreateFileVersionAsync_InsertsIntoTheTypeDerivedCollection()
        {
            var version = FileVersion.CreateNew("f1", 1, new FileVersionOptions { ItemId = "v1", TenantId = "t1" });

            await _sut.CreateFileVersionAsync(version);

            _provider.Verify(p => p.GetCollection<FileVersion>(VersionCollection), Times.Once);
            _versions.Verify(c => c.InsertOneAsync(version, It.IsAny<InsertOneOptions>(), It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task DeleteFileVersionsAsync_RemovesEveryVersionOfTheFile()
        {
            await _sut.DeleteFileVersionsAsync("f1");

            _versions.Verify(c => c.DeleteManyAsync(
                It.IsAny<FilterDefinition<FileVersion>>(), It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task GetLatestFileVersionNumberAsync_ReturnsTheIncrementedCounter()
        {
            _files.Setup(c => c.FindOneAndUpdateAsync(
                     It.IsAny<FilterDefinition<BsonDocument>>(),
                     It.IsAny<UpdateDefinition<BsonDocument>>(),
                     It.IsAny<FindOneAndUpdateOptions<BsonDocument, BsonDocument>>(),
                     It.IsAny<CancellationToken>()))
                  .ReturnsAsync(new BsonDocument { { "_id", "f1" }, { "CurrentVersion", 7L } });

            (await _sut.GetLatestFileVersionNumberAsync("f1")).Should().Be(7);
        }

        [Fact]
        public async Task GetLatestFileVersionNumberAsync_ReturnsZeroWhenTheFileDoesNotExist()
        {
            _files.Setup(c => c.FindOneAndUpdateAsync(
                     It.IsAny<FilterDefinition<BsonDocument>>(),
                     It.IsAny<UpdateDefinition<BsonDocument>>(),
                     It.IsAny<FindOneAndUpdateOptions<BsonDocument, BsonDocument>>(),
                     It.IsAny<CancellationToken>()))
                  .ReturnsAsync((BsonDocument?)null);

            // Upsert is off, so a missing file must yield 0 rather than throw on the indexer.
            (await _sut.GetLatestFileVersionNumberAsync("missing")).Should().Be(0);
        }

        [Fact]
        public async Task GetLatestFileVersionNumberAsync_IssuesTheCounterAgainstTheFilesCollection()
        {
            _files.Setup(c => c.FindOneAndUpdateAsync(
                     It.IsAny<FilterDefinition<BsonDocument>>(),
                     It.IsAny<UpdateDefinition<BsonDocument>>(),
                     It.IsAny<FindOneAndUpdateOptions<BsonDocument, BsonDocument>>(),
                     It.IsAny<CancellationToken>()))
                  .ReturnsAsync(new BsonDocument { { "CurrentVersion", 1L } });

            await _sut.GetLatestFileVersionNumberAsync("f1");

            // One atomic find-and-increment, not a read followed by a write.
            _provider.Verify(p => p.GetCollection<BsonDocument>("Files"), Times.Once);
            _files.Verify(c => c.FindOneAndUpdateAsync(
                It.IsAny<FilterDefinition<BsonDocument>>(),
                It.IsAny<UpdateDefinition<BsonDocument>>(),
                It.Is<FindOneAndUpdateOptions<BsonDocument, BsonDocument>>(o => !o.IsUpsert && o.ReturnDocument == ReturnDocument.After),
                It.IsAny<CancellationToken>()), Times.Once);
        }
    }
}
