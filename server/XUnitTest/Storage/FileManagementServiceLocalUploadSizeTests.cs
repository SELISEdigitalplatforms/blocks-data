using DomainService.Configuration;
using DomainService.Storage;
using DomainService.Storage.Validators;
using FluentAssertions;
using FluentValidation;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using XUnitTest.Infrastructure;
using Blocks.Genesis.Entities.Data;
using File = Blocks.Genesis.Entities.Data.File;
using FileDirectory = Blocks.Genesis.Entities.Data.FileDirectory;

namespace XUnitTest.Storage;

/// <summary>
/// The local/SFTP upload size check of blocks-data#441 (spec §6.5, E7, A6, A21): a file is refused only when it is larger
/// than <c>max(effective limit, 15 MiB)</c>, after validation, the name rule, authorization and configuration resolution,
/// and before the provider call or any file, version or object-item write, on both the new-file and new-version handlers.
/// </summary>
public sealed class FileManagementServiceLocalUploadSizeTests : IDisposable
{
    private const long MiB = 1024 * 1024;
    private const string ExistingItemId = "file-1";
    private const string ParentId = "dir-1";
    private static readonly Dictionary<string, string> SizeRefused = new() { ["File"] = "actual_size_exceeds_maximum_allowed" };

    private readonly Mock<IFileRepository> _fileRepository = new();
    private readonly Mock<IFileVersionRepository> _versionRepository = new();
    private readonly Mock<IStorageConfigurationProvider> _configurationProvider = new();
    private readonly Mock<IStorageServiceFactory> _storageServiceFactory = new();
    private readonly Mock<IStorageService> _storageService = new();
    private readonly Mock<IFileDirectoryRepository> _directoryRepository = new();
    private readonly Mock<IObjectAccessResolver> _accessResolver = new();
    private readonly Mock<IObjectAccessRepository> _accessRepository = new();
    private readonly Mock<IObjectItemWriter> _objectItems = new();

    public FileManagementServiceLocalUploadSizeTests()
    {
        BlocksTestContext.Set();
        _accessResolver
            .Setup(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), It.IsAny<ObjectPermission>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _accessRepository
            .Setup(r => r.WriteAuditAsync(It.IsAny<ObjectAuditLog>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _directoryRepository
            .Setup(r => r.GetDirectoryByItemIDAsync(ParentId))
            .ReturnsAsync(new FileDirectory { ItemId = ParentId });
        _fileRepository
            .Setup(r => r.GetFileByItemIdAsync(ExistingItemId))
            .ReturnsAsync(new File { ItemId = ExistingItemId, Name = "report.pdf" });
        // The repository returns the next version number (it increments the file's counter).
        _versionRepository.Setup(r => r.GetLatestFileVersionNumberAsync(ExistingItemId)).ReturnsAsync(2);
        _storageServiceFactory.Setup(f => f.GetStorageService(It.IsAny<StorageConfiguration>())).Returns(_storageService.Object);
        ProviderReturns(true);
    }

    public void Dispose() => BlocksTestContext.Clear();

    private FileManagementService CreateSut() => new(
        _fileRepository.Object,
        _storageServiceFactory.Object,
        _versionRepository.Object,
        _configurationProvider.Object,
        _directoryRepository.Object,
        new GetPreSignedUrlForUploadRequestValidator(),
        new LocalStorageUploadRequestValidator(Mock.Of<IFileDirectoryRepository>()),
        Mock.Of<IValidator<UpdateFileRequest>>(),
        Mock.Of<Blocks.Genesis.IMessageClient>(),
        _accessResolver.Object,
        _accessRepository.Object,
        Mock.Of<IUploadKeyRouter>(),
        Mock.Of<IUploadVerificationService>(),
        NullLogger<FileManagementService>.Instance,
        _objectItems.Object);

    private void GivenSftpConfiguration(long? maxFileSizeInBytes) =>
        _configurationProvider
            .Setup(p => p.GetByStrategyAsync("SftpStorage", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StorageConfiguration { Name = "Sftp", MaxFileSizeInBytes = maxFileSizeInBytes });

    private void ProviderReturns(bool success) =>
        _storageService
            .Setup(s => s.UploadFileToSftpAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<IFormFile>()))
            .ReturnsAsync(success);

    private static IFormFile FileOf(long length) => Mock.Of<IFormFile>(f => f.Length == length && f.FileName == "report.pdf");

    private static LocalStorageUploadRequest Upload(long length, string name = "report.pdf", string? itemId = null) =>
        new() { Name = name, ItemId = itemId, ParentDirectoryId = ParentId, MetaData = "", Tags = "", File = FileOf(length) };

    private static LocalStorageUploadRequest NewVersionUpload(long length) => Upload(length, itemId: ExistingItemId);

    private void ProviderCalled(Times times) =>
        _storageService.Verify(
            s => s.UploadFileToSftpAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<IFormFile>()),
            times);

    private void NothingWritten()
    {
        ProviderCalled(Times.Never());
        _fileRepository.Verify(r => r.CreateFileAsync(It.IsAny<File>()), Times.Never);
        _versionRepository.Verify(r => r.CreateFileVersionAsync(It.IsAny<FileVersion>()), Times.Never);
        _objectItems.Verify(o => o.UpsertAsync(It.IsAny<File>(), It.IsAny<CancellationToken>()), Times.Never);
        // Taking a version number increments the file's version counter: a write too.
        _versionRepository.Verify(r => r.GetLatestFileVersionNumberAsync(It.IsAny<string>()), Times.Never);
    }

    // H9, H2, H3, C20

    [Theory]
    [InlineData(104_857_600L, 104_857_600L)]
    [InlineData(52_428_800L, 52_428_800L)]
    [InlineData(null, 15_728_640L)]
    [InlineData(10_485_760L, 15_728_640L)]
    [InlineData(209_715_200L, 104_857_600L)]
    public async Task H9_H2_H3_C20_a_new_file_at_the_local_acceptance_limit_is_uploaded_once(long? configured, long length)
    {
        GivenSftpConfiguration(configured);

        var response = await CreateSut().UploadFileToLocalStorageAsync(Upload(length));

        response.IsSuccess.Should().BeTrue();
        response.Errors.Should().BeNullOrEmpty();
        response.FileVersion.Should().Be(1);
        response.FileId.Should().NotBeNullOrEmpty();
        ProviderCalled(Times.Once());
        _fileRepository.Verify(r => r.CreateFileAsync(It.IsAny<File>()), Times.Once);
        _versionRepository.Verify(r => r.CreateFileVersionAsync(It.IsAny<FileVersion>()), Times.Once);
    }

    [Fact]
    public async Task H10_a_20_MiB_file_under_a_100_MiB_configuration_is_processed()
    {
        GivenSftpConfiguration(100 * MiB);

        var response = await CreateSut().UploadFileToLocalStorageAsync(Upload(20 * MiB));

        response.IsSuccess.Should().BeTrue();
        ProviderCalled(Times.Once());
    }

    [Fact]
    public async Task H11_a_new_version_within_the_limit_is_written_only_after_the_provider_succeeds()
    {
        GivenSftpConfiguration(100 * MiB);
        var sequence = new MockSequence();
        _storageService.InSequence(sequence)
            .Setup(s => s.UploadFileToSftpAsync(It.IsAny<string>(), It.IsAny<string>(), ExistingItemId, "2", It.IsAny<IFormFile>()))
            .ReturnsAsync(true);
        _versionRepository.InSequence(sequence)
            .Setup(r => r.CreateFileVersionAsync(It.Is<FileVersion>(v => v.No == 2)))
            .Returns(Task.CompletedTask);

        var response = await CreateSut().UploadFileToLocalStorageAsync(NewVersionUpload(100 * MiB));

        response.IsSuccess.Should().BeTrue();
        response.FileId.Should().Be(ExistingItemId);
        response.FileVersion.Should().Be(2);
        _versionRepository.Verify(r => r.CreateFileVersionAsync(It.Is<FileVersion>(v => v.No == 2)), Times.Once);
    }

    // C8, C2 (local), E7

    [Theory]
    [InlineData(104_857_600L, 104_857_601L)]
    [InlineData(null, 15_728_641L)]
    [InlineData(10_485_760L, 15_728_641L)]
    [InlineData(52_428_800L, 52_428_801L)]
    [InlineData(209_715_200L, 104_857_601L)]
    public async Task C8_C2_a_new_file_one_byte_over_the_local_acceptance_limit_is_refused_without_side_effects(long? configured, long length)
    {
        GivenSftpConfiguration(configured);

        var response = await CreateSut().UploadFileToLocalStorageAsync(Upload(length));

        response.IsSuccess.Should().BeFalse();
        response.Errors.Should().Equal(SizeRefused);
        NothingWritten();
    }

    [Theory]
    [InlineData(104_857_600L, 104_857_601L)]
    [InlineData(null, 15_728_641L)]
    public async Task C8_a_new_version_one_byte_over_the_local_acceptance_limit_is_refused_without_side_effects(long? configured, long length)
    {
        GivenSftpConfiguration(configured);

        var response = await CreateSut().UploadFileToLocalStorageAsync(NewVersionUpload(length));

        response.IsSuccess.Should().BeFalse();
        response.Errors.Should().Equal(SizeRefused);
        NothingWritten();
    }

    [Fact]
    public async Task C20_a_new_version_of_15_MiB_is_accepted_without_a_configured_limit()
    {
        GivenSftpConfiguration(null);

        var response = await CreateSut().UploadFileToLocalStorageAsync(NewVersionUpload(15 * MiB));

        response.IsSuccess.Should().BeTrue();
        ProviderCalled(Times.Once());
    }

    [Fact]
    public async Task C8_a_named_configuration_is_enforced_instead_of_the_sftp_default()
    {
        _configurationProvider
            .Setup(p => p.GetByNameAsync("Big", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StorageConfiguration { Name = "Big", MaxFileSizeInBytes = 20 * MiB });
        var request = Upload(20 * MiB + 1);
        request.ConfigurationName = "Big";

        var response = await CreateSut().UploadFileToLocalStorageAsync(request);

        response.Errors.Should().Equal(SizeRefused);
        NothingWritten();
    }

    // C10: the existing errors keep coming first (validation, name, authorization, configuration, then size).

    [Fact]
    public async Task C10_validation_failure_is_reported_before_the_size()
    {
        GivenSftpConfiguration(null);

        var response = await CreateSut().UploadFileToLocalStorageAsync(Upload(200 * MiB, name: "no-extension"));

        response.Errors.Should().Equal(new Dictionary<string, string> { ["Name"] = "File name must have an extension." });
        NothingWritten();
    }

    [Fact]
    public async Task C10_the_new_file_name_rule_is_reported_before_the_size()
    {
        GivenSftpConfiguration(null);

        var response = await CreateSut().UploadFileToLocalStorageAsync(Upload(200 * MiB, name: " lead.txt"));

        response.Errors.Should().ContainKey("Name").And.HaveCount(1);
        response.Errors!["Name"].Should().NotBe("actual_size_exceeds_maximum_allowed");
        NothingWritten();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task C10_access_denial_is_reported_before_the_size(bool newVersion)
    {
        GivenSftpConfiguration(null);
        _accessResolver
            .Setup(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), It.IsAny<ObjectPermission>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var response = await CreateSut().UploadFileToLocalStorageAsync(newVersion ? NewVersionUpload(200 * MiB) : Upload(200 * MiB));

        response.Errors.Should().Equal(new Dictionary<string, string> { ["access"] = "forbidden" });
        NothingWritten();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task C10_a_missing_configuration_is_reported_before_the_size(bool newVersion)
    {
        var response = await CreateSut().UploadFileToLocalStorageAsync(newVersion ? NewVersionUpload(200 * MiB) : Upload(200 * MiB));

        response.Errors.Should().Equal(new Dictionary<string, string> { ["Configuration"] = "configuration_not_found" });
        NothingWritten();
    }

    // C12, E13

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task C12_a_provider_failure_within_the_limit_writes_nothing(bool newVersion)
    {
        GivenSftpConfiguration(100 * MiB);
        ProviderReturns(false);

        var response = await CreateSut().UploadFileToLocalStorageAsync(newVersion ? NewVersionUpload(100 * MiB) : Upload(100 * MiB));

        response.IsSuccess.Should().BeFalse();
        response.Errors.Should().Equal(new Dictionary<string, string> { ["SftpStorage"] = "file_upload_to_sftp_failed" });
        ProviderCalled(Times.Once());
        _fileRepository.Verify(r => r.CreateFileAsync(It.IsAny<File>()), Times.Never);
        _versionRepository.Verify(r => r.CreateFileVersionAsync(It.IsAny<FileVersion>()), Times.Never);
    }
}
