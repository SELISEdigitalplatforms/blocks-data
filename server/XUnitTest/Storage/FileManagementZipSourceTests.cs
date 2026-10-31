using DomainService.Configuration;
using DomainService.Storage;
using FluentAssertions;
using FluentValidation;
using MongoDB.Bson;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using Storage.DomainService.Storage.ZipDownload;
using XUnitTest.Infrastructure;
using Blocks.Genesis.Entities.Data;
using File = Blocks.Genesis.Entities.Data.File;

namespace XUnitTest.Storage;

/// <summary>
/// Unit tests for the zip-download source helpers on <see cref="FileManagementService"/>:
/// resolving selected file ids to readable versions, and opening a version's bytes.
/// </summary>
public class FileManagementZipSourceTests : IDisposable
{
    private readonly Mock<IFileRepository> _fileRepository = new();
    private readonly Mock<IStorageServiceFactory> _storageServiceFactory = new();
    private readonly Mock<IStorageConfigurationProvider> _configurationProvider = new();
    private readonly Mock<IObjectAccessResolver> _accessResolver = new();
    private readonly Mock<IObjectAccessRepository> _accessRepository = new();
    private readonly Mock<IStorageService> _storageService = new();

    public FileManagementZipSourceTests()
    {
        BlocksTestContext.Set();

        _accessResolver
            .Setup(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), It.IsAny<ObjectPermission>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _accessRepository
            .Setup(r => r.WriteAuditAsync(It.IsAny<ObjectAuditLog>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _storageServiceFactory.Setup(f => f.GetStorageService(It.IsAny<StorageConfiguration>())).Returns(_storageService.Object);
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private FileManagementService CreateSut() => new(
        _fileRepository.Object,
        _storageServiceFactory.Object,
        Mock.Of<IFileVersionRepository>(),
        _configurationProvider.Object,
        Mock.Of<IFileDirectoryRepository>(),
        Mock.Of<IValidator<GetPreSignedUrlForUploadRequest>>(),
        Mock.Of<IValidator<LocalStorageUploadRequest>>(),
        Mock.Of<IValidator<UpdateFileRequest>>(),
        Mock.Of<Blocks.Genesis.IMessageClient>(),
        _accessResolver.Object,
        _accessRepository.Object,
        Mock.Of<IUploadKeyRouter>(),
        Mock.Of<IUploadVerificationService>());

    private static BsonDocument Aggregate(string id, string? status, string? storageKey = null, long maxVersion = 2, long size = 100)
    {
        var doc = new BsonDocument
        {
            { "_id", id },
            { "VersionId", "v-" + id },
            { "MaxVersion", maxVersion },
            { "SizeInBytes", size },
        };
        if (storageKey != null) doc["StorageKey"] = storageKey;
        if (status != null) doc["FileVerificationStatus"] = status;
        return doc;
    }

    private static FileResponse Response(string id) => new()
    {
        ItemId = id,
        Name = id + ".pdf",
        AccessModifier = AccessModifier.Private,
        TenantId = "tenant-1",
    };

    private void SetupAggregates(params string?[] idsAndStatuses)
    {
        // pairs of (id, status)
        var docs = new List<BsonDocument>();
        var responses = new List<FileResponse>();
        for (var i = 0; i < idsAndStatuses.Length; i += 2)
        {
            docs.Add(Aggregate(idsAndStatuses[i]!, idsAndStatuses[i + 1], storageKey: "Private/" + idsAndStatuses[i] + "/key"));
            responses.Add(Response(idsAndStatuses[i]!));
        }

        _fileRepository
            .Setup(r => r.GetRequiredFiles(It.IsAny<IEnumerable<string>>(), null))
            .Returns((docs, responses.ToArray()));
    }

    private void SetupFile(string id, bool archived = false) =>
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(id)).ReturnsAsync(new File
        {
            ItemId = id,
            Name = id + ".pdf",
            IsArchived = archived,
            TenantId = "tenant-1",
        });

    [Fact]
    public async Task Resolve_drops_quarantined_and_rejected_versions()
    {
        SetupAggregates("f1", "Ready", "f2", "Quarantined", "f3", "Rejected", "f4", null);
        var sut = CreateSut();

        var result = await sut.ResolveZipSourcesAsync(["f1", "f2", "f3", "f4"], authorize: false, CancellationToken.None);

        result.Select(s => s.FileId).Should().Equal("f1", "f4");
        var f1 = result[0];
        f1.VersionId.Should().Be("v-f1");
        f1.VersionNo.Should().Be(2);
        f1.StorageKey.Should().Be("Private/f1/key");
        f1.SizeInBytes.Should().Be(100);
        f1.Name.Should().Be("f1.pdf");
        f1.AccessModifier.Should().Be(AccessModifier.Private);
        f1.TenantId.Should().Be("tenant-1");
    }

    [Fact]
    public async Task Resolve_returns_files_in_input_order()
    {
        SetupAggregates("f1", "Ready", "f2", "Ready", "f3", "Ready");
        var sut = CreateSut();

        var result = await sut.ResolveZipSourcesAsync(["f3", "f1", "f2"], authorize: false, CancellationToken.None);

        result.Select(s => s.FileId).Should().Equal("f3", "f1", "f2");
    }

    [Fact]
    public async Task Resolve_skips_a_malformed_version_aggregate_and_keeps_the_rest()
    {
        var good = Aggregate("f1", "Ready");
        var malformed = Aggregate("f2", "Ready");
        malformed.Remove("VersionId");
        _fileRepository
            .Setup(r => r.GetRequiredFiles(It.IsAny<IEnumerable<string>>(), null))
            .Returns((new List<BsonDocument> { malformed, good }, new[] { Response("f1"), Response("f2") }));
        var sut = CreateSut();

        var result = await sut.ResolveZipSourcesAsync(["f1", "f2"], authorize: false, CancellationToken.None);

        result.Select(s => s.FileId).Should().Equal("f1");
    }

    [Fact]
    public async Task Resolve_reads_a_size_stored_as_Int32()
    {
        var doc = Aggregate("f1", "Ready");
        doc["SizeInBytes"] = new BsonInt32(512);
        _fileRepository
            .Setup(r => r.GetRequiredFiles(It.IsAny<IEnumerable<string>>(), null))
            .Returns((new List<BsonDocument> { doc }, new[] { Response("f1") }));
        var sut = CreateSut();

        var result = await sut.ResolveZipSourcesAsync(["f1"], authorize: false, CancellationToken.None);

        result.Should().ContainSingle().Which.SizeInBytes.Should().Be(512);
    }

    [Fact]
    public async Task Resolve_with_authorize_drops_denied_archived_and_missing_files()
    {
        SetupFile("f1");
        SetupFile("f2");
        SetupFile("f3", archived: true);
        _fileRepository.Setup(r => r.GetFileByItemIdAsync("f4")).ReturnsAsync((File)null!);
        _accessResolver
            .Setup(r => r.ResolveAsync(It.Is<ObjectResourceDescriptor>(d => d.ResourceId == "f2"), ObjectPermission.Download, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        SetupAggregates("f1", "Ready", "f2", "Ready", "f3", "Ready", "f4", "Ready");
        var sut = CreateSut();

        var result = await sut.ResolveZipSourcesAsync(["f1", "f2", "f3", "f4"], authorize: true, CancellationToken.None);

        result.Select(s => s.FileId).Should().Equal("f1");
        _accessRepository.Verify(r => r.WriteAuditAsync(
            It.Is<ObjectAuditLog>(a => a.ResourceId == "f1" && a.Action == "ZipDownload" && a.Granted), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Resolve_without_authorize_never_calls_the_access_resolver()
    {
        SetupAggregates("f1", "Ready");
        var sut = CreateSut();

        await sut.ResolveZipSourcesAsync(["f1"], authorize: false, CancellationToken.None);

        _accessResolver.Verify(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), It.IsAny<ObjectPermission>(), It.IsAny<CancellationToken>()), Times.Never);
        _fileRepository.Verify(r => r.GetFileByItemIdAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Open_cloud_source_uses_the_versions_storage_key()
    {
        var source = Source(storageKey: "Private/f1/v1/old-name.pdf");
        var sut = CreateSut();

        await sut.OpenZipSourceAsync(source, new StorageConfiguration { StorageStrategy = "AWS" }, CancellationToken.None);

        _storageService.Verify(s => s.DownloadFileAsync("Private/f1/v1/old-name.pdf", null, null, null), Times.Once);
    }

    [Fact]
    public async Task Open_cloud_source_without_storage_key_falls_back_to_the_computed_path()
    {
        var source = Source(storageKey: null);
        var sut = CreateSut();

        await sut.OpenZipSourceAsync(source, new StorageConfiguration { StorageStrategy = "AWS" }, CancellationToken.None);

        _storageService.Verify(s => s.DownloadFileAsync("Private/f1/v1/a.pdf", null, null, null), Times.Once);
    }

    [Fact]
    public async Task Open_local_source_passes_name_tenant_file_and_version_number()
    {
        var source = Source(storageKey: null);
        source.VersionNo = 3;
        var sut = CreateSut();

        await sut.OpenZipSourceAsync(source, new StorageConfiguration { StorageStrategy = "SftpStorage" }, CancellationToken.None);

        _storageService.Verify(s => s.DownloadFileAsync("a.pdf", "tenant-1", "f1", "3"), Times.Once);
    }

    [Fact]
    public async Task Open_returns_the_provider_stream()
    {
        using var stream = new MemoryStream();
        _storageService.Setup(s => s.DownloadFileAsync(It.IsAny<string>(), null, null, null)).ReturnsAsync(stream);
        var sut = CreateSut();

        var result = await sut.OpenZipSourceAsync(Source(), new StorageConfiguration { StorageStrategy = "AWS" }, CancellationToken.None);

        result.Should().BeSameAs(stream);
    }

    [Fact]
    public async Task Open_returns_null_when_the_provider_throws()
    {
        _storageService.Setup(s => s.DownloadFileAsync(It.IsAny<string>(), null, null, null)).ThrowsAsync(new InvalidOperationException("boom"));
        var sut = CreateSut();

        var result = await sut.OpenZipSourceAsync(Source(), new StorageConfiguration { StorageStrategy = "AWS" }, CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Open_rethrows_cancellation_of_the_request()
    {
        using var cts = new CancellationTokenSource();
        _storageService
            .Setup(s => s.DownloadFileAsync(It.IsAny<string>(), null, null, null))
            .Returns(() =>
            {
                cts.Cancel();
                throw new OperationCanceledException(cts.Token);
            });
        var sut = CreateSut();

        var act = () => sut.OpenZipSourceAsync(Source(), new StorageConfiguration { StorageStrategy = "AWS" }, cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task Open_returns_null_when_the_provider_times_out_while_the_request_is_live()
    {
        _storageService
            .Setup(s => s.DownloadFileAsync(It.IsAny<string>(), null, null, null))
            .ThrowsAsync(new TaskCanceledException("provider timeout"));
        var sut = CreateSut();

        var result = await sut.OpenZipSourceAsync(Source(), new StorageConfiguration { StorageStrategy = "AWS" }, CancellationToken.None);

        result.Should().BeNull();
    }

    private static ZipSourceFile Source(string? storageKey = null) => new()
    {
        FileId = "f1",
        Name = "a.pdf",
        VersionId = "v1",
        VersionNo = 1,
        StorageKey = storageKey,
        AccessModifier = AccessModifier.Private,
        SizeInBytes = 10,
        TenantId = "tenant-1",
    };
}
