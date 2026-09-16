using System.Reflection;
using System.Runtime.CompilerServices;
using DomainService.Storage;
using FluentAssertions;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using Storage.DomainService.Utilities;

namespace XUnitTest.Storage;

/// <summary>
/// Pins the documented 5 MiB default and exercises the exact accept/reject boundary of
/// <c>FileManagementService.ValidateDeclaredSize</c>, both at the default and at a custom
/// configured maximum. The method is a pure, side-effect-free private helper, so it is invoked
/// via reflection rather than standing up the full <c>GetPerSignedUrlForUploadAsync</c> orchestration.
/// </summary>
public class DeclaredSizeValidationTests
{
    private static readonly MethodInfo ValidateDeclaredSizeMethod =
        typeof(FileManagementService).GetMethod("ValidateDeclaredSize", BindingFlags.NonPublic | BindingFlags.Instance)!;

    [Fact]
    public void DefaultMaxFileSizeInBytes_IsExactlyFiveMebibytes()
    {
        Constants.DefaultMaxFileSizeInBytes.Should().Be(5 * 1024 * 1024);
    }

    private static GetPreSignedUrlForUploadResponse? ValidateDeclaredSize(long? sizeInBytes, StorageConfiguration configuration) =>
        (GetPreSignedUrlForUploadResponse?)ValidateDeclaredSizeMethod.Invoke(
            RuntimeHelpers.GetUninitializedObject(typeof(FileManagementService)),
            new object?[] { new GetPreSignedUrlForUploadRequest { SizeInBytes = sizeInBytes }, configuration });

    [Fact]
    public void DeclaredSize_AtTheDefaultMaximum_IsAccepted()
    {
        var configuration = new StorageConfiguration { Name = "Default" };

        var result = ValidateDeclaredSize(Constants.DefaultMaxFileSizeInBytes, configuration);

        result.Should().BeNull();
    }

    [Fact]
    public void DeclaredSize_OneByteOverTheDefaultMaximum_IsRejected()
    {
        var configuration = new StorageConfiguration { Name = "Default" };

        var result = ValidateDeclaredSize(Constants.DefaultMaxFileSizeInBytes + 1, configuration);

        result.Should().NotBeNull();
        result!.IsSuccess.Should().BeFalse();
        result.Errors.Should().ContainKey("SizeInBytes");
        result.Errors!["SizeInBytes"].Should().Be("declared_size_exceeds_maximum_allowed");
    }

    [Fact]
    public void DeclaredSize_AtACustomConfiguredMaximum_IsAccepted()
    {
        var configuration = new StorageConfiguration { Name = "Default", MaxFileSizeInBytes = 10_485_760 };

        var result = ValidateDeclaredSize(10_485_760, configuration);

        result.Should().BeNull();
    }

    [Fact]
    public void DeclaredSize_OneByteOverACustomConfiguredMaximum_IsRejected()
    {
        var configuration = new StorageConfiguration { Name = "Default", MaxFileSizeInBytes = 10_485_760 };

        var result = ValidateDeclaredSize(10_485_761, configuration);

        result.Should().NotBeNull();
        result!.Errors!["SizeInBytes"].Should().Be("declared_size_exceeds_maximum_allowed");
    }

    [Fact]
    public void MissingOrNonPositiveDeclaredSize_IsNotRejected_ServerCannotPreCheckWhatWasNotDeclared()
    {
        var configuration = new StorageConfiguration { Name = "Default" };

        ValidateDeclaredSize(null, configuration).Should().BeNull();
        ValidateDeclaredSize(0, configuration).Should().BeNull();
        ValidateDeclaredSize(-1, configuration).Should().BeNull();
    }
}
