using DomainService.Configuration;
using DomainService.Storage;
using FluentAssertions;
using FluentValidation;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using XUnitTest.Infrastructure;
using File = Storage.DomainService.Entities.File;

namespace XUnitTest.Storage;

/// <summary>
/// Unit tests for <see cref="FileManagementService.CompleteUploadAsync"/>: the endpoint's own
/// orchestration (authorization, idempotent replay, the atomic claim, and promotion/persistence),
/// as distinct from <see cref="UploadVerificationServiceTests"/> which cover the verification
/// pipeline itself. Every dependency is mocked so each scenario isolates one branch of the switch.
/// </summary>
public class CompleteUploadOrchestrationTests : IDisposable
{
    private readonly Mock<IFileRepository> _fileRepository = new();
    private readonly Mock<IStorageServiceFactory> _storageServiceFactory = new();
    private readonly Mock<IFileVersionRepository> _versionRepository = new();
    private readonly Mock<IConfigurationRepository> _configurationRepository = new();
    private readonly Mock<IObjectAccessResolver> _accessResolver = new();
    private readonly Mock<IObjectAccessRepository> _accessRepository = new();
    private readonly Mock<IUploadVerificationService> _uploadVerificationService = new();
    private readonly Mock<IStorageService> _storageService = new();

    private const string FileId = "file-1";
    private const string FileVersionId = "version-1";

    public CompleteUploadOrchestrationTests()
    {
        BlocksTestContext.Set();

        _accessResolver
            .Setup(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), It.IsAny<ObjectPermission>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _accessRepository
            .Setup(r => r.WriteAuditAsync(It.IsAny<ObjectAuditLog>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _storageServiceFactory.Setup(f => f.GetStorageService(It.IsAny<StorageConfiguration>())).Returns(_storageService.Object);
        _configurationRepository
            .Setup(r => r.GetConfigurationByNameAsync(It.IsAny<string>()))
            .ReturnsAsync(new StorageConfiguration { Name = "Default", StorageStrategy = "Azure" });
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        GC.SuppressFinalize(this);
    }

    private FileManagementService CreateSut() => new(
        _fileRepository.Object,
        _storageServiceFactory.Object,
        _versionRepository.Object,
        _configurationRepository.Object,
        Mock.Of<IFileDirectoryRepository>(),
        Mock.Of<IValidator<GetPreSignedUrlForUploadRequest>>(),
        Mock.Of<IValidator<LocalStorageUploadRequest>>(),
        Mock.Of<IValidator<UpdateFileRequest>>(),
        Mock.Of<Blocks.Genesis.IMessageClient>(),
        _accessResolver.Object,
        _accessRepository.Object,
        Mock.Of<IUploadKeyRouter>(),
        _uploadVerificationService.Object);

    private static File QuarantinedFile() => new()
    {
        ItemId = FileId,
        Name = "report.pdf",
        AccessModifier = AccessModifier.Public,
        ConfigurationName = "Default",
    };

    private static FileVersion QuarantinedVersion(FileVerificationStatus status = FileVerificationStatus.Quarantined) =>
        FileVersion.CreateNew(FileId, 1, new FileVersionOptions
        {
            ItemId = FileVersionId,
            UploadCompletionRequired = true,
            FileVerificationStatus = status,
        });

    [Theory]
    [InlineData(null, "v1")]
    [InlineData("f1", null)]
    [InlineData("", "")]
    public async Task MissingIdentifiers_ReturnsNotFoundWithoutTouchingTheRepository(string? fileId, string? fileVersionId)
    {
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = fileId!, FileVersionId = fileVersionId! });

        result.IsSuccess.Should().BeFalse();
        _fileRepository.Verify(r => r.GetFileByItemIdAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task UnknownFileId_ReturnsNotFound()
    {
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync((File)null!);
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeFalse();
        _versionRepository.Verify(r => r.GetFileVersionAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task CallerLacksEditPermission_ReturnsAccessDeniedWithoutClaimingCompletion()
    {
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync(QuarantinedFile());
        _accessResolver
            .Setup(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), ObjectPermission.Edit, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeFalse();
        _versionRepository.Verify(r => r.TryClaimCompletionAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>()), Times.Never);
    }

    [Fact]
    public async Task MismatchedFileAndVersionIds_ReturnsNotFound()
    {
        // GetFileVersionAsync(fileId, fileVersionId) itself filters on both ids, so a version
        // that belongs to a different file returns null - the mismatch is indistinguishable from
        // not-found at this layer, which is exactly the point (no information is leaked either way).
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync(QuarantinedFile());
        _versionRepository.Setup(r => r.GetFileVersionAsync(FileId, FileVersionId)).ReturnsAsync((FileVersion?)null);
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().ContainKey("FileVersionId");
    }

    [Fact]
    public async Task VersionThatNeverRequiredCompletion_ReturnsNotFoundRatherThanExposingWhy()
    {
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync(QuarantinedFile());
        var version = FileVersion.CreateNew(FileId, 1, new FileVersionOptions { ItemId = FileVersionId, UploadCompletionRequired = false });
        _versionRepository.Setup(r => r.GetFileVersionAsync(FileId, FileVersionId)).ReturnsAsync(version);
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeFalse();
        _versionRepository.Verify(r => r.TryClaimCompletionAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>()), Times.Never);
    }

    [Fact]
    public async Task AlreadyVerified_IsIdempotent_ReturnsSuccessWithoutReVerifying()
    {
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync(QuarantinedFile());
        _versionRepository
            .Setup(r => r.GetFileVersionAsync(FileId, FileVersionId))
            .ReturnsAsync(QuarantinedVersion(FileVerificationStatus.Verified));
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeTrue();
        result.VerificationStatus.Should().Be(FileVerificationStatus.Verified);
        _versionRepository.Verify(r => r.TryClaimCompletionAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>()), Times.Never);
        _uploadVerificationService.Verify(
            v => v.VerifyAsync(It.IsAny<IStorageService>(), It.IsAny<StorageConfiguration>(), It.IsAny<FileVersion>(), It.IsAny<string>(), It.IsAny<string>()),
            Times.Never);
    }

    [Fact]
    public async Task AlreadyRejected_IsIdempotent_ReturnsTheStoredRejectionReasonWithoutReVerifying()
    {
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync(QuarantinedFile());
        var rejected = QuarantinedVersion(FileVerificationStatus.Rejected);
        rejected.RejectionReason = "checksum_mismatch";
        _versionRepository.Setup(r => r.GetFileVersionAsync(FileId, FileVersionId)).ReturnsAsync(rejected);
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeTrue("the completion call itself succeeded; the outcome is carried in VerificationStatus");
        result.VerificationStatus.Should().Be(FileVerificationStatus.Rejected);
        result.RejectionReason.Should().Be("checksum_mismatch");
        _versionRepository.Verify(r => r.TryClaimCompletionAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>()), Times.Never);
    }

    [Fact]
    public async Task MissingConfiguration_ReturnsConfigurationNotFoundWithoutClaiming()
    {
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync(QuarantinedFile());
        _versionRepository.Setup(r => r.GetFileVersionAsync(FileId, FileVersionId)).ReturnsAsync(QuarantinedVersion());
        _configurationRepository.Setup(r => r.GetConfigurationByNameAsync(It.IsAny<string>())).ReturnsAsync((StorageConfiguration)null!);
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().ContainKey("Configuration");
        _versionRepository.Verify(r => r.TryClaimCompletionAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>()), Times.Never);
    }

    [Fact]
    public async Task LostClaim_ConcurrentAttemptAlreadyVerified_ReturnsThatOutcomeWithoutErroring()
    {
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync(QuarantinedFile());
        _versionRepository.SetupSequence(r => r.GetFileVersionAsync(FileId, FileVersionId))
            .ReturnsAsync(QuarantinedVersion())
            .ReturnsAsync(QuarantinedVersion(FileVerificationStatus.Verified));
        _versionRepository
            .Setup(r => r.TryClaimCompletionAsync(FileId, FileVersionId, It.IsAny<TimeSpan>()))
            .ReturnsAsync((FileVersion?)null);
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeTrue();
        result.VerificationStatus.Should().Be(FileVerificationStatus.Verified);
    }

    [Fact]
    public async Task LostClaim_ConcurrentAttemptStillInProgress_ReturnsAlreadyInProgressError()
    {
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync(QuarantinedFile());
        _versionRepository.SetupSequence(r => r.GetFileVersionAsync(FileId, FileVersionId))
            .ReturnsAsync(QuarantinedVersion())
            .ReturnsAsync(QuarantinedVersion());
        _versionRepository
            .Setup(r => r.TryClaimCompletionAsync(FileId, FileVersionId, It.IsAny<TimeSpan>()))
            .ReturnsAsync((FileVersion?)null);
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().ContainKey("FileVersionId");
        result.Errors!["FileVersionId"].Should().Be("completion_already_in_progress");
    }

    [Fact]
    public async Task SuccessfulVerification_PromotesToFinalKeyAndPersistsVerified()
    {
        var claimed = QuarantinedVersion();
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync(QuarantinedFile());
        _versionRepository.Setup(r => r.GetFileVersionAsync(FileId, FileVersionId)).ReturnsAsync(claimed);
        _versionRepository.Setup(r => r.TryClaimCompletionAsync(FileId, FileVersionId, It.IsAny<TimeSpan>())).ReturnsAsync(claimed);
        _uploadVerificationService
            .Setup(v => v.VerifyAsync(_storageService.Object, It.IsAny<StorageConfiguration>(), claimed, FileVersionId, "report.pdf"))
            .ReturnsAsync(new VerificationResult { Status = FileVerificationStatus.Verified, CandidateKey = "Verification/candidate-key" });
        string? promotedCandidateKey = null;
        string? promotedFinalKey = null;
        _storageService
            .Setup(s => s.PromoteCandidateToFinalAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Callback<string, string>((c, f) => { promotedCandidateKey = c; promotedFinalKey = f; })
            .Returns(Task.CompletedTask);
        string? completedFinalKey = null;
        _versionRepository
            .Setup(r => r.CompleteVerificationAsync(FileId, FileVersionId, FileVerificationStatus.Verified, It.IsAny<string>(), null))
            .Callback<string, string, FileVerificationStatus, string?, string?>((_, _, _, finalKey, _) => completedFinalKey = finalKey)
            .ReturnsAsync(true);
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeTrue();
        result.VerificationStatus.Should().Be(FileVerificationStatus.Verified);
        promotedCandidateKey.Should().Be("Verification/candidate-key");
        promotedFinalKey.Should().NotBeNullOrEmpty();
        completedFinalKey.Should().Be(promotedFinalKey);
    }

    [Fact]
    public async Task RejectedVerification_DoesNotPromote_PersistsRejectedWithReason()
    {
        var claimed = QuarantinedVersion();
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(FileId)).ReturnsAsync(QuarantinedFile());
        _versionRepository.Setup(r => r.GetFileVersionAsync(FileId, FileVersionId)).ReturnsAsync(claimed);
        _versionRepository.Setup(r => r.TryClaimCompletionAsync(FileId, FileVersionId, It.IsAny<TimeSpan>())).ReturnsAsync(claimed);
        _uploadVerificationService
            .Setup(v => v.VerifyAsync(_storageService.Object, It.IsAny<StorageConfiguration>(), claimed, FileVersionId, "report.pdf"))
            .ReturnsAsync(new VerificationResult
            {
                Status = FileVerificationStatus.Rejected,
                RejectionReason = "size_exceeds_declared",
                CandidateKey = "Verification/candidate-key",
            });
        var sut = CreateSut();

        var result = await sut.CompleteUploadAsync(new CompleteUploadRequest { FileId = FileId, FileVersionId = FileVersionId });

        result.IsSuccess.Should().BeTrue("the completion call itself succeeded; the outcome is carried in VerificationStatus");
        result.VerificationStatus.Should().Be(FileVerificationStatus.Rejected);
        result.RejectionReason.Should().Be("size_exceeds_declared");
        _storageService.Verify(s => s.PromoteCandidateToFinalAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
        _versionRepository.Verify(
            r => r.CompleteVerificationAsync(FileId, FileVersionId, FileVerificationStatus.Rejected, null, "size_exceeds_declared"),
            Times.Once);
    }
}
