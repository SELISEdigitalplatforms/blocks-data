using System.Security.Cryptography;
using System.Text;
using DomainService.Storage;
using FluentAssertions;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Storage.DomainService.Utilities;

namespace XUnitTest.Storage;

/// <summary>
/// Covers the Phase 1 synchronous verification pipeline: it must operate only on a server-owned
/// candidate (never the quarantine object directly), check size/type/real-file-type/checksum in that
/// order, and produce a safe, non-sensitive rejection reason rather than throwing or leaking detail.
/// </summary>
public class UploadVerificationServiceTests
{
    private const string QuarantineKey = "Private/Quarantine/file-1/version-1/report.pdf";
    private const string UploadSessionId = "version-1";
    private const string FileName = "report.pdf";

    private static readonly byte[] PdfBytes = Encoding.ASCII.GetBytes("%PDF-1.4 rest of file");

    private readonly Mock<IStorageService> _storageService = new();
    private readonly UploadVerificationService _sut = new();

    private static FileVersion NewVersion(FileVersionOptions? options = null) =>
        FileVersion.CreateNew("file-1", 1, options ?? new FileVersionOptions { ItemId = "version-1" });

    private static StorageConfiguration DefaultConfiguration(long maxFileSizeInBytes = 5_242_880) =>
        new() { Name = "Default", MaxFileSizeInBytes = maxFileSizeInBytes };

    /// <summary>Wires the mock so copy/metadata/initial-bytes succeed with plausible defaults; individual tests override what they need to.</summary>
    private void SetUpHappyPathCandidate(string candidateKeyPrefix, StorageObjectMetadata metadata, byte[]? initialBytes = null)
    {
        _storageService
            .Setup(s => s.CopyToVerificationCandidateAsync(QuarantineKey, It.Is<string>(k => k.StartsWith(candidateKeyPrefix))))
            .ReturnsAsync((string quarantineKey, string candidateKey) => candidateKey);

        _storageService
            .Setup(s => s.GetCandidateMetadataAsync(It.IsAny<string>()))
            .ReturnsAsync(metadata);

        _storageService
            .Setup(s => s.ReadCandidateInitialBytesAsync(It.IsAny<string>(), It.IsAny<int>()))
            .ReturnsAsync(initialBytes ?? PdfBytes);
    }

    [Fact]
    public async Task VerifyAsync_MissingStorageKey_RejectsWithoutCallingTheProvider()
    {
        var version = NewVersion();
        version.StorageKey = null;

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeFalse();
        result.RejectionReason.Should().Be("quarantine_key_missing");
        _storageService.Verify(s => s.CopyToVerificationCandidateAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task VerifyAsync_QuarantineObjectMissing_Rejects()
    {
        var version = NewVersion();
        version.StorageKey = QuarantineKey;

        _storageService
            .Setup(s => s.CopyToVerificationCandidateAsync(QuarantineKey, It.IsAny<string>()))
            .ReturnsAsync((string?)null);

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeFalse();
        result.RejectionReason.Should().Be("quarantine_object_not_found");
    }

    [Fact]
    public async Task VerifyAsync_CandidateCopiedButMetadataMissing_Rejects()
    {
        var version = NewVersion();
        version.StorageKey = QuarantineKey;

        _storageService
            .Setup(s => s.CopyToVerificationCandidateAsync(QuarantineKey, It.IsAny<string>()))
            .ReturnsAsync((string quarantineKey, string candidateKey) => candidateKey);
        _storageService
            .Setup(s => s.GetCandidateMetadataAsync(It.IsAny<string>()))
            .ReturnsAsync((StorageObjectMetadata?)null);

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeFalse();
        result.RejectionReason.Should().Be("candidate_object_not_found");
        result.CandidateKey.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task VerifyAsync_ActualSizeDiffersFromDeclaredSize_Rejects()
    {
        var version = NewVersion(new FileVersionOptions { ItemId = "version-1", ExpectedSizeInBytes = 100 });
        version.StorageKey = QuarantineKey;
        SetUpHappyPathCandidate("Verification/", new StorageObjectMetadata { SizeInBytes = 200, ContentType = "application/pdf" });

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeFalse();
        result.RejectionReason.Should().Be("actual_size_does_not_match_declared_size");
    }

    [Fact]
    public async Task VerifyAsync_ActualSizeExceedsConfiguredMaximum_Rejects()
    {
        var version = NewVersion();
        version.StorageKey = QuarantineKey;
        SetUpHappyPathCandidate("Verification/", new StorageObjectMetadata { SizeInBytes = 1000, ContentType = "application/pdf" });

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(maxFileSizeInBytes: 999), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeFalse();
        result.RejectionReason.Should().Be("actual_size_exceeds_maximum_allowed");
    }

    [Fact]
    public async Task VerifyAsync_StoredContentTypeDiffersFromDeclaredContentType_Rejects()
    {
        var version = NewVersion(new FileVersionOptions { ItemId = "version-1", ExpectedContentType = "application/pdf" });
        version.StorageKey = QuarantineKey;
        SetUpHappyPathCandidate("Verification/", new StorageObjectMetadata { SizeInBytes = PdfBytes.Length, ContentType = "image/png" });

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeFalse();
        result.RejectionReason.Should().Be("stored_content_type_does_not_match_declared_content_type");
    }

    [Fact]
    public async Task VerifyAsync_RealBytesDoNotMatchTheDeclaredExtension_Rejects()
    {
        var version = NewVersion();
        version.StorageKey = QuarantineKey;
        SetUpHappyPathCandidate(
            "Verification/",
            new StorageObjectMetadata { SizeInBytes = 10, ContentType = "application/pdf" },
            initialBytes: Encoding.ASCII.GetBytes("MZ-this-is-an-executable"));

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeFalse();
        result.RejectionReason.Should().Be("real_file_type_does_not_match_extension");
    }

    [Fact]
    public async Task VerifyAsync_NoChecksumDeclared_SkipsChecksumCheckAndVerifies()
    {
        var version = NewVersion();
        version.StorageKey = QuarantineKey;
        SetUpHappyPathCandidate("Verification/", new StorageObjectMetadata { SizeInBytes = PdfBytes.Length, ContentType = "application/pdf" });

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeTrue();
        result.Status.Should().Be(FileVerificationStatus.Verified);
        _storageService.Verify(s => s.OpenCandidateReadStreamAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task VerifyAsync_ProviderExposedMd5MatchesDeclaredChecksum_VerifiesWithoutStreaming()
    {
        var version = NewVersion(new FileVersionOptions
        {
            ItemId = "version-1",
            ExpectedChecksum = "ABCDEF12",
            ChecksumAlgorithm = "MD5"
        });
        version.StorageKey = QuarantineKey;
        SetUpHappyPathCandidate("Verification/", new StorageObjectMetadata
        {
            SizeInBytes = PdfBytes.Length,
            ContentType = "application/pdf",
            Checksum = "abcdef12"
        });

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeTrue();
        _storageService.Verify(s => s.OpenCandidateReadStreamAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task VerifyAsync_ProviderExposedMd5DiffersFromDeclaredChecksum_Rejects()
    {
        var version = NewVersion(new FileVersionOptions
        {
            ItemId = "version-1",
            ExpectedChecksum = "11111111",
            ChecksumAlgorithm = "MD5"
        });
        version.StorageKey = QuarantineKey;
        SetUpHappyPathCandidate("Verification/", new StorageObjectMetadata
        {
            SizeInBytes = PdfBytes.Length,
            ContentType = "application/pdf",
            Checksum = "22222222"
        });

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeFalse();
        result.RejectionReason.Should().Be("checksum_mismatch");
    }

    [Fact]
    public async Task VerifyAsync_NonMd5AlgorithmWithNoProviderChecksum_StreamsTheCandidateToCompareTheDeclaredHash()
    {
        using var sha256 = SHA256.Create();
        var expectedHex = Convert.ToHexString(sha256.ComputeHash(PdfBytes));

        var version = NewVersion(new FileVersionOptions
        {
            ItemId = "version-1",
            ExpectedChecksum = expectedHex,
            ChecksumAlgorithm = "SHA256"
        });
        version.StorageKey = QuarantineKey;
        // No Checksum on the metadata: SHA256 always requires the streaming fallback in this
        // implementation, since only MD5 is compared against a provider-exposed value.
        SetUpHappyPathCandidate("Verification/", new StorageObjectMetadata { SizeInBytes = PdfBytes.Length, ContentType = "application/pdf" });
        _storageService
            .Setup(s => s.OpenCandidateReadStreamAsync(It.IsAny<string>()))
            .ReturnsAsync(() => new MemoryStream(PdfBytes));

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeTrue();
        _storageService.Verify(s => s.OpenCandidateReadStreamAsync(It.IsAny<string>()), Times.Once);
    }

    [Fact]
    public async Task VerifyAsync_StreamedChecksumDiffersFromDeclaredChecksum_Rejects()
    {
        var version = NewVersion(new FileVersionOptions
        {
            ItemId = "version-1",
            ExpectedChecksum = "not-the-real-hash",
            ChecksumAlgorithm = "SHA256"
        });
        version.StorageKey = QuarantineKey;
        SetUpHappyPathCandidate("Verification/", new StorageObjectMetadata { SizeInBytes = PdfBytes.Length, ContentType = "application/pdf" });
        _storageService
            .Setup(s => s.OpenCandidateReadStreamAsync(It.IsAny<string>()))
            .ReturnsAsync(() => new MemoryStream(PdfBytes));

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.IsVerified.Should().BeFalse();
        result.RejectionReason.Should().Be("checksum_mismatch");
    }

    [Fact]
    public async Task VerifyAsync_EveryCheckPasses_ReturnsVerifiedWithTheCandidateKey()
    {
        var version = NewVersion(new FileVersionOptions
        {
            ItemId = "version-1",
            ExpectedSizeInBytes = PdfBytes.Length,
            ExpectedContentType = "application/pdf"
        });
        version.StorageKey = QuarantineKey;
        SetUpHappyPathCandidate("Verification/", new StorageObjectMetadata { SizeInBytes = PdfBytes.Length, ContentType = "application/pdf" });

        var result = await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        result.Status.Should().Be(FileVerificationStatus.Verified);
        result.RejectionReason.Should().BeNull();
        result.CandidateKey.Should().StartWith($"Verification/{UploadSessionId}/");
    }

    [Fact]
    public async Task VerifyAsync_CopiesToACandidateBeforeReadingAnyOtherState()
    {
        // The whole point of the candidate is that later changes to the quarantine key cannot affect
        // what gets verified; every read must therefore target the candidate key, not the quarantine key.
        var version = NewVersion();
        version.StorageKey = QuarantineKey;
        SetUpHappyPathCandidate("Verification/", new StorageObjectMetadata { SizeInBytes = PdfBytes.Length, ContentType = "application/pdf" });

        await _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), version, UploadSessionId, FileName);

        _storageService.Verify(s => s.GetCandidateMetadataAsync(QuarantineKey), Times.Never);
        _storageService.Verify(s => s.ReadCandidateInitialBytesAsync(QuarantineKey, It.IsAny<int>()), Times.Never);
    }

    [Fact]
    public async Task VerifyAsync_NullStorageService_Throws()
    {
        var act = () => _sut.VerifyAsync(null!, DefaultConfiguration(), NewVersion(), UploadSessionId, FileName);

        await act.Should().ThrowAsync<ArgumentNullException>();
    }

    [Fact]
    public async Task VerifyAsync_NullConfiguration_Throws()
    {
        var act = () => _sut.VerifyAsync(_storageService.Object, null!, NewVersion(), UploadSessionId, FileName);

        await act.Should().ThrowAsync<ArgumentNullException>();
    }

    [Fact]
    public async Task VerifyAsync_NullVersion_Throws()
    {
        var act = () => _sut.VerifyAsync(_storageService.Object, DefaultConfiguration(), null!, UploadSessionId, FileName);

        await act.Should().ThrowAsync<ArgumentNullException>();
    }
}
