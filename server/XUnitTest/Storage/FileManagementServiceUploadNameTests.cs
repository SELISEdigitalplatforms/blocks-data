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
/// The new-file name rule on both upload paths (blocks-data#418, spec §6.5): it applies only when no file exists
/// for the request's ItemId, runs before the parent-directory authorization, and answers in the existing
/// validation response shape with one message per property.
/// </summary>
public sealed class FileManagementServiceUploadNameTests : IDisposable
{
    private const string NameError =
        "Name must not be blank, contain a path separator or control characters, or have leading or trailing whitespace.";

    private readonly Mock<IFileRepository> _fileRepository = new();
    private readonly Mock<IObjectAccessResolver> _accessResolver = new();
    private readonly Mock<IObjectAccessRepository> _accessRepository = new();
    private readonly Mock<IFileDirectoryRepository> _directoryRepository = new();

    public FileManagementServiceUploadNameTests()
    {
        BlocksTestContext.Set();
        // Authorization is denied, so a request that passes the name rule stops there with the existing
        // access response; that response proves the rule did not reject it.
        _accessResolver
            .Setup(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), It.IsAny<ObjectPermission>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        _accessRepository
            .Setup(r => r.WriteAuditAsync(It.IsAny<ObjectAuditLog>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        // A real parent directory, so the parent-edit check reaches the access resolver.
        _directoryRepository
            .Setup(r => r.GetDirectoryByItemIDAsync("dir-1"))
            .ReturnsAsync(new FileDirectory { ItemId = "dir-1" });
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
    }

    private FileManagementService CreateSut(
        IValidator<GetPreSignedUrlForUploadRequest>? preSignedValidator = null,
        IValidator<LocalStorageUploadRequest>? localValidator = null) => new(
        _fileRepository.Object,
        Mock.Of<IStorageServiceFactory>(),
        Mock.Of<IFileVersionRepository>(),
        Mock.Of<IStorageConfigurationProvider>(),
        _directoryRepository.Object,
        preSignedValidator ?? new GetPreSignedUrlForUploadRequestValidator(),
        localValidator ?? new LocalStorageUploadRequestValidator(Mock.Of<IFileDirectoryRepository>()),
        Mock.Of<IValidator<UpdateFileRequest>>(),
        Mock.Of<Blocks.Genesis.IMessageClient>(),
        _accessResolver.Object,
        _accessRepository.Object,
        Mock.Of<IUploadKeyRouter>(),
        Mock.Of<IUploadVerificationService>(),
        NullLogger<FileManagementService>.Instance);

    private static GetPreSignedUrlForUploadRequest PreSigned(string name, string? itemId = null) =>
        new() { Name = name, ItemId = itemId, ParentDirectoryId = "dir-1" };

    private static LocalStorageUploadRequest Local(string name, string? itemId = null) =>
        new() { Name = name, ItemId = itemId, ParentDirectoryId = "dir-1", File = Mock.Of<IFormFile>() };

    private void GivenExistingFile(string itemId, string storedName) =>
        _fileRepository.Setup(r => r.GetFileByItemIdAsync(itemId)).ReturnsAsync(new File { ItemId = itemId, Name = storedName });

    private void ParentAuthorizationShouldNotHaveRun() =>
        _accessResolver.Verify(r => r.ResolveAsync(It.IsAny<ObjectResourceDescriptor>(), It.IsAny<ObjectPermission>(), It.IsAny<CancellationToken>()), Times.Never);

    // E6, C6, C7

    [Theory]
    [InlineData("a\\b.txt")]
    [InlineData("Icon\r.png")]
    [InlineData(" lead.txt")]
    public async Task E6_C6_C7_a_new_pre_signed_upload_with_an_unusable_name_is_rejected_before_authorization(string name)
    {
        var response = await CreateSut().GetPerSignedUrlForUploadAsync(PreSigned(name));

        response.IsSuccess.Should().BeFalse();
        response.Errors.Should().Equal(new Dictionary<string, string> { ["Name"] = NameError });
        ParentAuthorizationShouldNotHaveRun();
    }

    [Theory]
    [InlineData("a/b.txt")]
    [InlineData("tab\t.txt")]
    public async Task C6_C7_a_new_local_upload_with_an_unusable_name_is_rejected_before_authorization(string name)
    {
        var response = await CreateSut().UploadFileToLocalStorageAsync(Local(name));

        response.IsSuccess.Should().BeFalse();
        response.Errors.Should().Equal(new Dictionary<string, string> { ["Name"] = NameError });
        ParentAuthorizationShouldNotHaveRun();
    }

    // C8

    [Fact]
    public async Task C8_a_new_upload_name_longer_than_255_characters_is_rejected_with_a_length_error()
    {
        var longName = new string('a', 300) + ".txt";

        var preSigned = await CreateSut().GetPerSignedUrlForUploadAsync(PreSigned(longName));
        var local = await CreateSut().UploadFileToLocalStorageAsync(Local(longName));

        preSigned.Errors.Should().ContainSingle().Which.Value.Should().Contain("255");
        local.Errors.Should().ContainSingle().Which.Value.Should().Contain("255");
        ParentAuthorizationShouldNotHaveRun();
    }

    // E9, H7

    [Fact]
    public async Task E9_a_new_version_of_an_existing_file_with_a_bad_stored_name_is_not_checked_against_the_new_rule()
    {
        GivenExistingFile("existing", "Icon\r");

        var preSigned = await CreateSut().GetPerSignedUrlForUploadAsync(PreSigned("Icon\r.png", "existing"));
        var local = await CreateSut().UploadFileToLocalStorageAsync(Local("Icon\r.png", "existing"));

        preSigned.Errors.Should().Equal(new Dictionary<string, string> { ["access"] = "forbidden" });
        local.Errors.Should().Equal(new Dictionary<string, string> { ["access"] = "forbidden" });
    }

    [Fact]
    public async Task H7_a_valid_new_file_name_passes_the_rule_and_reaches_authorization_as_before()
    {
        var response = await CreateSut().GetPerSignedUrlForUploadAsync(PreSigned(new string('a', 251) + ".txt"));

        response.Errors.Should().Equal(new Dictionary<string, string> { ["access"] = "forbidden" });
    }

    // E10, C7

    [Fact]
    public async Task E10_a_blank_pre_signed_name_gets_one_required_message()
    {
        var response = await CreateSut().GetPerSignedUrlForUploadAsync(PreSigned(""));

        response.IsSuccess.Should().BeFalse();
        response.Errors.Should().Equal(new Dictionary<string, string> { ["Name"] = "Name is required." });
    }

    [Fact]
    public async Task C7_a_blank_local_name_gets_one_required_message_instead_of_a_500()
    {
        var response = await CreateSut().UploadFileToLocalStorageAsync(Local(""));

        response.IsSuccess.Should().BeFalse();
        response.Errors.Should().Equal(new Dictionary<string, string> { ["Name"] = "Name is required." });
    }

    // §6.5: whatever the validators report, both upload paths keep the first message per property instead of throwing

    private static InlineValidator<T> TwoNameFailures<T>()
    {
        var validator = new InlineValidator<T>();
        validator.RuleFor(_ => "x").Must(_ => false).WithName("Name").OverridePropertyName("Name").WithMessage("first");
        validator.RuleFor(_ => "y").Must(_ => false).OverridePropertyName("Name").WithMessage("second");
        return validator;
    }

    [Fact]
    public async Task A_repeated_property_keeps_its_first_message_on_both_upload_paths()
    {
        var preSigned = await CreateSut(preSignedValidator: TwoNameFailures<GetPreSignedUrlForUploadRequest>())
            .GetPerSignedUrlForUploadAsync(PreSigned("ok.txt"));
        var local = await CreateSut(localValidator: TwoNameFailures<LocalStorageUploadRequest>())
            .UploadFileToLocalStorageAsync(Local("ok.txt"));

        preSigned.Errors.Should().Equal(new Dictionary<string, string> { ["Name"] = "first" });
        local.Errors.Should().Equal(new Dictionary<string, string> { ["Name"] = "first" });
    }
}
