using System.Security.Cryptography;
using System.Text;
using Blocks.Genesis;
using DomainService.Configuration;
using DomainService.Storage;
using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.Logging;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using XUnitTest.Infrastructure;
using Blocks.Genesis.Entities.Data;
using File = Blocks.Genesis.Entities.Data.File;

namespace XUnitTest.Storage;

/// <summary>
/// Permanent file deletion (blocks-data#418): every cloud blob is deleted by the key it was stored under,
/// never by a path rebuilt from the file's current name; keys another file still references are kept; per-key
/// 400/404/409 answers let the delete finish, while anything else fails it and keeps the database record.
/// Storage and repositories are mocked, so the provider calls and queries are counted exactly.
/// </summary>
public sealed class FileManagementServiceDeleteTests : IDisposable
{
    private const string FileId = "F1";
    private const string TenantId = "tenant-1";

    private readonly Mock<IFileRepository> _fileRepository = new();
    private readonly Mock<IStorageServiceFactory> _storageServiceFactory = new();
    private readonly Mock<IFileVersionRepository> _versionRepository = new();
    private readonly Mock<IStorageConfigurationProvider> _configurationProvider = new();
    private readonly Mock<IObjectAccessResolver> _accessResolver = new();
    private readonly Mock<IObjectAccessRepository> _accessRepository = new();
    private readonly Mock<IObjectItemWriter> _objectItems = new();
    private readonly Mock<IStorageService> _storageService = new();
    private readonly RecordingLoggerProvider _logs = new();

    private readonly List<string> _deletedKeys = new();
    private readonly Dictionary<string, Func<BlobDeleteOutcome>> _outcomes = new(StringComparer.Ordinal);
    private IReadOnlyList<FileVersion> _versions = Array.Empty<FileVersion>();
    private IReadOnlyCollection<string> _sharedKeys = Array.Empty<string>();
    private IReadOnlyCollection<string>? _sharedQueryKeys;
    private string _storageStrategy = "Azure";

    public FileManagementServiceDeleteTests()
    {
        BlocksTestContext.Set(tenantId: TenantId);

        _accessResolver
            .Setup(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), It.IsAny<ObjectPermission>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _accessRepository
            .Setup(r => r.WriteAuditAsync(It.IsAny<ObjectAuditLog>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _storageServiceFactory.Setup(f => f.GetStorageService(It.IsAny<StorageConfiguration>())).Returns(_storageService.Object);
        _configurationProvider
            .Setup(r => r.GetByNameAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => new StorageConfiguration { Name = "Default", StorageStrategy = _storageStrategy });

        _versionRepository.Setup(r => r.GetVersionKeysAsync(It.IsAny<string>())).ReturnsAsync(() => _versions);
        _versionRepository
            .Setup(r => r.GetKeysReferencedByOtherFilesAsync(It.IsAny<string>(), It.IsAny<IReadOnlyCollection<string>>()))
            .ReturnsAsync((string _, IReadOnlyCollection<string> keys) =>
            {
                _sharedQueryKeys = keys.ToList();
                return _sharedKeys.Where(keys.Contains).ToList();
            });

        _storageService
            .Setup(s => s.TryDeleteFileAsync(It.IsAny<string>()))
            .ReturnsAsync((string key) =>
            {
                _deletedKeys.Add(key);
                return _outcomes.TryGetValue(key, out var outcome) ? outcome() : BlobDeleteOutcome.Deleted;
            });
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        _logs.Dispose();
    }

    // Construction and helpers

    private FileManagementService CreateSut() => new(
        _fileRepository.Object,
        _storageServiceFactory.Object,
        _versionRepository.Object,
        _configurationProvider.Object,
        Mock.Of<IFileDirectoryRepository>(),
        Mock.Of<IValidator<GetPreSignedUrlForUploadRequest>>(),
        Mock.Of<IValidator<LocalStorageUploadRequest>>(),
        Mock.Of<IValidator<UpdateFileRequest>>(),
        Mock.Of<Blocks.Genesis.IMessageClient>(),
        _accessResolver.Object,
        _accessRepository.Object,
        Mock.Of<IUploadKeyRouter>(),
        Mock.Of<IUploadVerificationService>(),
        _logs.CreateLogger<FileManagementService>(),
        _objectItems.Object);

    private File GivenFile(string name, AccessModifier access = AccessModifier.Private, string id = FileId)
    {
        var file = new File { ItemId = id, Name = name, AccessModifier = access, ConfigurationName = "Default", IsArchived = true };
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(id)).ReturnsAsync(file);
        return file;
    }

    private static FileVersion Version(string versionId, long no, string? storageKey, string fileId = FileId) =>
        FileVersion.CreateNew(fileId, no, new FileVersionOptions { ItemId = versionId, StorageKey = storageKey });

    private void GivenVersions(params FileVersion[] versions) => _versions = versions;

    private Task<BaseResponse> DeletePermanently() =>
        CreateSut().DeleteFileAsync(new DeleteFileRequest { FileId = FileId, Permanent = true });

    private static string Sha256(string key) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(key)));

    private List<RecordedLog> DeleteLogs => _logs.Logs.Where(l => l.Category.EndsWith(nameof(FileManagementService), StringComparison.Ordinal)).ToList();

    private void ShouldHaveCleanedUp(File file)
    {
        _versionRepository.Verify(r => r.DeleteFileVersionsAsync(file.ItemId), Times.Once);
        _fileRepository.Verify(r => r.DeleteFileAsync(file), Times.Once);
        _accessRepository.Verify(r => r.RevokeAllForResourceAsync(file.ItemId, It.IsAny<CancellationToken>()), Times.Once);
        _objectItems.Verify(o => o.DeleteAsync(file.ItemId, It.IsAny<CancellationToken>()), Times.Once);
    }

    private void ShouldNotHaveCleanedUp()
    {
        _versionRepository.Verify(r => r.DeleteFileVersionsAsync(It.IsAny<string>()), Times.Never);
        _fileRepository.Verify(r => r.DeleteFileAsync(It.IsAny<File>()), Times.Never);
        _accessRepository.Verify(r => r.RevokeAllForResourceAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _objectItems.Verify(o => o.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // H1, H2, E1

    [Fact]
    public async Task H1_E1_deletes_only_the_stored_key_never_a_path_built_from_the_raw_name()
    {
        var file = GivenFile("Icon\r");
        GivenVersions(Version("V1", 1, "Private/F1/V1/Icon_"));

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        _deletedKeys.Should().Equal("Private/F1/V1/Icon_");
        _storageService.Verify(s => s.DeleteFileAsync(It.IsAny<string>()), Times.Never);
        ShouldHaveCleanedUp(file);
    }

    [Fact]
    public async Task H1_stored_keys_are_used_even_when_the_file_was_renamed_and_duplicates_are_deleted_once()
    {
        GivenFile("renamed.pdf");
        GivenVersions(
            Version("V1", 1, "Private/F1/V1/report.pdf"),
            Version("V2", 2, "Private/F1/V2/report.pdf"),
            Version("V3", 3, "Private/F1/V1/report.pdf"));

        await DeletePermanently();

        _deletedKeys.Should().Equal("Private/F1/V1/report.pdf", "Private/F1/V2/report.pdf");
        _deletedKeys.Should().NotContain(k => k.Contains("renamed.pdf"));
    }

    [Fact]
    public async Task H2_cleans_up_when_every_key_is_deleted_missing_skipped_or_shared()
    {
        var file = GivenFile("mix.pdf");
        GivenVersions(
            Version("V1", 1, "Private/F1/V1/a"),
            Version("V2", 2, "Private/F1/V2/b"),
            Version("V3", 3, "Private/F1/V3/c"),
            Version("V4", 4, "Private/F0/V0/shared"));
        _outcomes["Private/F1/V2/b"] = () => BlobDeleteOutcome.NotFound;
        _outcomes["Private/F1/V3/c"] = () => BlobDeleteOutcome.Skipped(400, "InvalidUri");
        _sharedKeys = new[] { "Private/F0/V0/shared" };

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        response.Errors.Should().BeNullOrEmpty();
        _deletedKeys.Should().Equal("Private/F1/V1/a", "Private/F1/V2/b", "Private/F1/V3/c");
        ShouldHaveCleanedUp(file);
    }

    // H3

    [Fact]
    public async Task H3_a_renamed_file_whose_versions_share_an_older_key_deletes_that_key_once_and_succeeds()
    {
        var file = GivenFile("new-name.pdf");
        GivenVersions(
            Version("V1", 1, "Private/F1/V1/old-name.pdf"),
            Version("V2", 2, "Private/F1/V1/old-name.pdf"));

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        _deletedKeys.Should().Equal("Private/F1/V1/old-name.pdf");
        ShouldHaveCleanedUp(file);
    }

    // H4, E3

    [Fact]
    public async Task H4_E3_a_legacy_version_tries_its_raw_name_path_and_drops_an_identical_sanitized_form()
    {
        GivenFile("old.txt");
        GivenVersions(Version("V9", 1, null));

        await DeletePermanently();

        _deletedKeys.Should().Equal("Private/F1/V9/old.txt");
    }

    [Fact]
    public async Task H4_a_legacy_version_with_a_control_character_also_tries_the_sanitized_form_under_its_own_prefix()
    {
        GivenFile("Icon\r", AccessModifier.Public);
        GivenVersions(Version("V1", 1, ""));

        await DeletePermanently();

        _deletedKeys.Should().Equal("Public/F1/V1/Icon\r", "Public/F1/V1/Icon_");
        _deletedKeys.Should().OnlyContain(k => k.StartsWith("Public/F1/V1/", StringComparison.Ordinal));
    }

    [Fact]
    public async Task E3_a_legacy_blob_already_missing_is_logged_at_information_and_the_delete_succeeds()
    {
        var file = GivenFile("old.txt");
        GivenVersions(Version("V9", 1, null));
        _outcomes["Private/F1/V9/old.txt"] = () => BlobDeleteOutcome.NotFound;

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        DeleteLogs.Should().ContainSingle();
        DeleteLogs[0].Level.Should().Be(LogLevel.Information);
        DeleteLogs[0].Field("KeyHash").Should().Be(Sha256("Private/F1/V9/old.txt"));
        ShouldHaveCleanedUp(file);
    }

    // H5, C1, E2

    [Fact]
    public async Task H5_C1_E2_a_key_another_file_still_references_is_kept_and_logged_once_at_information()
    {
        var file = GivenFile("report.pdf");
        GivenVersions(Version("V1", 1, "Private/F0/V1/report.pdf"), Version("V2", 2, "Private/F1/V2/report.pdf"));
        _sharedKeys = new[] { "Private/F0/V1/report.pdf" };

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        _deletedKeys.Should().Equal("Private/F1/V2/report.pdf");
        var kept = DeleteLogs.Should().ContainSingle().Subject;
        kept.Level.Should().Be(LogLevel.Information);
        kept.Field("VersionId").Should().Be("V1");
        kept.Field("KeyHash").Should().Be(Sha256("Private/F0/V1/report.pdf"));
        ShouldHaveCleanedUp(file);
    }

    [Fact]
    public async Task C1_legacy_fallback_candidates_are_also_subject_to_the_shared_key_check()
    {
        GivenFile("Icon\r");
        GivenVersions(Version("V1", 1, null));
        _sharedKeys = new[] { "Private/F1/V1/Icon_" };

        await DeletePermanently();

        _sharedQueryKeys.Should().BeEquivalentTo("Private/F1/V1/Icon\r", "Private/F1/V1/Icon_");
        _deletedKeys.Should().Equal("Private/F1/V1/Icon\r");
    }

    // H6

    [Fact]
    public async Task H6_the_directory_cascade_deletes_by_stored_key_and_keeps_shared_keys()
    {
        var file = GivenFile("in-folder.pdf");
        GivenVersions(Version("V1", 1, "Private/F0/V1/in-folder.pdf"), Version("V2", 2, "Private/F1/V2/in-folder.pdf"));
        _sharedKeys = new[] { "Private/F0/V1/in-folder.pdf" };

        var response = await CreateSut().DeleteFileForDirectoryCascadeAsync(new DeleteFileRequest { FileId = FileId, ConfigurationName = "Default" });

        response.IsSuccess.Should().BeTrue();
        _deletedKeys.Should().Equal("Private/F1/V2/in-folder.pdf");
        ShouldHaveCleanedUp(file);
        _accessResolver.Verify(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), It.IsAny<ObjectPermission>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task H6_a_500_file_cascade_runs_one_versions_read_and_one_shared_key_query_per_file()
    {
        var sut = CreateSut();
        for (var i = 0; i < 500; i++)
        {
            var id = $"F{i:000}";
            GivenFile($"doc{i}.txt", id: id);
            _versions = new[] { Version($"V{i}", 1, $"Private/{id}/V{i}/doc{i}.txt", id) };
            await sut.DeleteFileForDirectoryCascadeAsync(new DeleteFileRequest { FileId = id });
        }

        _versionRepository.Verify(r => r.GetVersionKeysAsync(It.IsAny<string>()), Times.Exactly(500));
        _versionRepository.Verify(r => r.GetKeysReferencedByOtherFilesAsync(It.IsAny<string>(), It.IsAny<IReadOnlyCollection<string>>()), Times.Exactly(500));
        _deletedKeys.Should().HaveCount(500);
    }

    // C2, E4

    [Theory]
    [InlineData(400, "InvalidUri")]
    [InlineData(409, "LeaseIdMissing")]
    public async Task C2_E4_a_400_or_409_logs_one_warning_with_hash_only_and_the_next_key_is_still_deleted(int status, string errorCode)
    {
        var file = GivenFile("two.pdf");
        GivenVersions(Version("V1", 1, "Private/F1/V1/two.pdf"), Version("V2", 2, "Private/F1/V2/two.pdf"));
        _outcomes["Private/F1/V1/two.pdf"] = () => BlobDeleteOutcome.Skipped(status, errorCode);

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        _deletedKeys.Should().Equal("Private/F1/V1/two.pdf", "Private/F1/V2/two.pdf");
        var warning = DeleteLogs.Should().ContainSingle(l => l.Level == LogLevel.Warning).Subject;
        warning.Field("TenantId").Should().Be(TenantId);
        warning.Field("FileId").Should().Be(FileId);
        warning.Field("VersionId").Should().Be("V1");
        warning.Field("StatusCode").Should().Be(status);
        warning.Field("ErrorCode").Should().Be(errorCode);
        warning.Field("KeyHash").Should().Be(Sha256("Private/F1/V1/two.pdf"));
        ShouldHaveCleanedUp(file);
    }

    [Fact]
    public async Task C2_a_key_shared_by_several_versions_is_logged_with_the_lowest_numbered_version()
    {
        GivenFile("r.pdf");
        GivenVersions(Version("V3", 3, "Private/F1/V1/r.pdf"), Version("V1", 1, "Private/F1/V1/r.pdf"));
        _outcomes["Private/F1/V1/r.pdf"] = () => BlobDeleteOutcome.Skipped(400, "InvalidUri");

        await DeletePermanently();

        DeleteLogs.Should().ContainSingle().Which.Field("VersionId").Should().Be("V1");
    }

    // C3, E5

    public static TheoryData<Exception> FatalErrors => new()
    {
        new InvalidOperationException("403 expired credentials"),
        new TaskCanceledException("timeout"),
        new OperationCanceledException(),
        new HttpRequestException("network"),
    };

    [Theory]
    [MemberData(nameof(FatalErrors))]
    public async Task C3_E5_a_fatal_provider_error_stops_skips_cleanup_and_propagates(Exception error)
    {
        GivenFile("f5.pdf");
        GivenVersions(Version("V1", 1, "Private/F1/V1/f5.pdf"), Version("V2", 2, "Private/F1/V2/f5.pdf"));
        _outcomes["Private/F1/V1/f5.pdf"] = () => throw error;

        var act = DeletePermanently;

        (await act.Should().ThrowAsync<Exception>()).Which.Should().BeSameAs(error);
        _deletedKeys.Should().Equal("Private/F1/V1/f5.pdf");
        ShouldNotHaveCleanedUp();
    }

    [Fact]
    public async Task C3_a_provider_that_returns_Fatal_instead_of_throwing_still_stops_before_cleanup()
    {
        GivenFile("f6.pdf");
        GivenVersions(Version("V1", 1, "Private/F1/V1/f6.pdf"));
        _outcomes["Private/F1/V1/f6.pdf"] = () => BlobDeleteOutcome.Fatal;

        var act = DeletePermanently;

        await act.Should().ThrowAsync<InvalidOperationException>();
        ShouldNotHaveCleanedUp();
    }

    // C4, C12

    [Fact]
    public async Task C4_C12_a_retry_after_a_fatal_error_sees_already_deleted_blobs_as_not_found_and_completes_without_warnings()
    {
        var file = GivenFile("retry.pdf");
        GivenVersions(Version("V1", 1, "Private/F1/V1/retry.pdf"), Version("V2", 2, "Private/F1/V2/retry.pdf"));
        _outcomes["Private/F1/V1/retry.pdf"] = () => BlobDeleteOutcome.NotFound;
        _outcomes["Private/F1/V2/retry.pdf"] = () => BlobDeleteOutcome.NotFound;

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        _deletedKeys.Should().Equal("Private/F1/V1/retry.pdf", "Private/F1/V2/retry.pdf");
        DeleteLogs.Should().HaveCount(2).And.OnlyContain(l => l.Level == LogLevel.Information);
        ShouldHaveCleanedUp(file);
    }

    // C5

    [Fact]
    public async Task C5_logs_never_contain_the_raw_key_the_file_name_or_a_provider_message()
    {
        const string name = "Secret Plan\u0007.pdf";
        GivenFile(name);
        GivenVersions(
            Version("V1", 1, "Private/F1/V1/Secret Plan_.pdf"),
            Version("V2", 2, "Private/F0/V2/Secret Plan_.pdf"),
            Version("V3", 3, "Private/F1/V3/Secret Plan_.pdf"),
            Version("V4", 4, "Private/F1/V4/../../F9/V9/Secret Plan.pdf"));
        _outcomes["Private/F1/V1/Secret Plan_.pdf"] = () => BlobDeleteOutcome.Skipped(400, "InvalidUri");
        _outcomes["Private/F1/V3/Secret Plan_.pdf"] = () => BlobDeleteOutcome.NotFound;
        _sharedKeys = new[] { "Private/F0/V2/Secret Plan_.pdf" };

        await DeletePermanently();

        DeleteLogs.Should().HaveCount(4);
        foreach (var log in DeleteLogs)
        {
            var text = log.AllText();
            text.Should().NotContain("Secret Plan");
            text.Should().NotContain("Private/");
            text.Should().NotContain("http");
        }
    }

    // Q1 (answered A): keys with "." or ".." segments are never sent to the provider

    [Theory]
    [InlineData("Private/F1/V1/../../F9/V9/doc.pdf")]
    [InlineData("Private/F1/V1/./doc.pdf")]
    [InlineData("Private/F1/V1/..")]
    public async Task Q1_a_stored_key_with_dot_segments_is_skipped_with_a_warning_and_never_deleted(string key)
    {
        var file = GivenFile("doc.pdf");
        GivenVersions(Version("V1", 1, key), Version("V2", 2, "Private/F1/V2/doc.pdf"));

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        _deletedKeys.Should().Equal("Private/F1/V2/doc.pdf");
        _sharedQueryKeys.Should().NotContain(key);
        var warning = DeleteLogs.Should().ContainSingle(l => l.Level == LogLevel.Warning).Subject;
        warning.Field("StatusCode").Should().Be(0);
        warning.Field("ErrorCode").Should().Be("unsafe_key");
        warning.Field("KeyHash").Should().Be(Sha256(key));
        ShouldHaveCleanedUp(file);
    }

    [Theory]
    [InlineData("Azure")]
    [InlineData("Aws")]
    public async Task Q1_the_dot_segment_skip_applies_to_both_cloud_providers(string strategy)
    {
        _storageStrategy = strategy;
        GivenFile("doc.pdf");
        GivenVersions(Version("V1", 1, "Private/F1/V1/../../F9/V9/doc.pdf"));

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        _deletedKeys.Should().BeEmpty();
        DeleteLogs.Should().ContainSingle(l => l.Level == LogLevel.Warning).Which.Field("ErrorCode").Should().Be("unsafe_key");
    }

    [Fact]
    public async Task Q1_a_legacy_name_with_dot_segments_skips_the_raw_path_but_still_tries_its_sanitized_form()
    {
        GivenFile("../../F9/V9/doc.pdf");
        GivenVersions(Version("V1", 1, null));

        await DeletePermanently();

        _deletedKeys.Should().Equal("Private/F1/V1/.._.._F9_V9_doc.pdf");
        DeleteLogs.Should().ContainSingle(l => l.Level == LogLevel.Warning)
            .Which.Field("KeyHash").Should().Be(Sha256("Private/F1/V1/../../F9/V9/doc.pdf"));
    }

    [Fact]
    public async Task Q1_dots_inside_a_segment_and_backslashes_are_not_dot_segments()
    {
        GivenFile("a..b.txt");
        GivenVersions(Version("V1", 1, "Private/F1/V1/a..b.txt"), Version("V2", 2, "Private/F1/V2/..\\x.txt"));

        await DeletePermanently();

        _deletedKeys.Should().Equal("Private/F1/V1/a..b.txt", "Private/F1/V2/..\\x.txt");
        DeleteLogs.Should().NotContain(l => l.Level == LogLevel.Warning);
    }

    // C9

    [Fact]
    public async Task C9_a_caller_without_delete_permission_gets_the_existing_forbidden_response_and_nothing_is_deleted()
    {
        GivenFile("private.pdf");
        GivenVersions(Version("V1", 1, "Private/F1/V1/private.pdf"));
        _accessResolver
            .Setup(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), ObjectPermission.Delete, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeFalse();
        response.Errors.Should().ContainKey("access").WhoseValue.Should().Be("forbidden");
        _deletedKeys.Should().BeEmpty();
        _versionRepository.Verify(r => r.GetVersionKeysAsync(It.IsAny<string>()), Times.Never);
        ShouldNotHaveCleanedUp();
    }

    [Fact]
    public async Task C9_a_missing_file_gets_the_existing_not_found_response()
    {
        var response = await CreateSut().DeleteFileAsync(new DeleteFileRequest { FileId = "missing", Permanent = true });

        response.IsSuccess.Should().BeFalse();
        response.Errors.Should().ContainKey("file_not_found");
        _deletedKeys.Should().BeEmpty();
    }

    // C10

    [Fact]
    public async Task C10_the_local_sftp_category_keeps_its_existing_folder_delete()
    {
        _storageStrategy = "SftpStorage";
        var file = GivenFile("local.txt");
        _storageService.Setup(s => s.DeleteFileAsync($"{TenantId}/{FileId}")).ReturnsAsync(true);

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        _storageService.Verify(s => s.DeleteFileAsync($"{TenantId}/{FileId}"), Times.Once);
        _storageService.Verify(s => s.TryDeleteFileAsync(It.IsAny<string>()), Times.Never);
        _versionRepository.Verify(r => r.GetVersionKeysAsync(It.IsAny<string>()), Times.Never);
        ShouldHaveCleanedUp(file);
    }

    // C11

    [Fact]
    public async Task C11_two_hundred_versions_need_one_versions_read_and_one_batched_shared_key_query()
    {
        GivenFile("big.bin");
        GivenVersions(Enumerable.Range(1, 200).Select(i => Version($"V{i}", i, $"Private/F1/V{i}/big.bin")).ToArray());

        await DeletePermanently();

        _versionRepository.Verify(r => r.GetVersionKeysAsync(FileId), Times.Once);
        _versionRepository.Verify(r => r.GetKeysReferencedByOtherFilesAsync(FileId, It.IsAny<IReadOnlyCollection<string>>()), Times.Once);
        _versionRepository.Verify(r => r.GetFileVersionIds(It.IsAny<string>()), Times.Never);
        _sharedQueryKeys.Should().HaveCount(200);
        _deletedKeys.Should().HaveCount(200).And.OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task C11_a_file_without_versions_runs_no_shared_key_query_and_no_storage_delete()
    {
        var file = GivenFile("empty.txt");

        var response = await DeletePermanently();

        response.IsSuccess.Should().BeTrue();
        _versionRepository.Verify(r => r.GetKeysReferencedByOtherFilesAsync(It.IsAny<string>(), It.IsAny<IReadOnlyCollection<string>>()), Times.Never);
        _deletedKeys.Should().BeEmpty();
        ShouldHaveCleanedUp(file);
    }
}
