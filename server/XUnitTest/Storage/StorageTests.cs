using DomainService.Storage;
using DomainService.Storage.Validators;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using Storage.DomainService.Utilities;
using StorageStorage = Storage.DomainService.Storage;

namespace XUnitTest.Storage;

public class AesEncryptionHelperTests
{
    [Fact]
    public void EncryptDecrypt_RoundTrips()
    {
        var key = AesEncryptionHelper.GenerateAesKey();
        var cipher = AesEncryptionHelper.Encrypt("secret-message", key);
        cipher.Should().NotBe("secret-message");

        var ok = AesEncryptionHelper.TryDecrypt(cipher, key, out var plain);
        ok.Should().BeTrue();
        plain.Should().Be("secret-message");
    }

    [Fact]
    public void GenerateAesKey_Produces256BitBase64()
    {
        var key = AesEncryptionHelper.GenerateAesKey();
        Convert.FromBase64String(key).Length.Should().Be(32);
    }

    [Fact]
    public void TryDecrypt_WrongKey_ReturnsFalse()
    {
        var key = AesEncryptionHelper.GenerateAesKey();
        var otherKey = AesEncryptionHelper.GenerateAesKey();
        var cipher = AesEncryptionHelper.Encrypt("hello", key);

        var ok = AesEncryptionHelper.TryDecrypt(cipher, otherKey, out var plain);
        // Either fails outright or produces garbage; must not equal the original.
        (ok == false || plain != "hello").Should().BeTrue();
    }

    [Fact]
    public void TryDecrypt_Garbage_ReturnsFalse()
    {
        var key = AesEncryptionHelper.GenerateAesKey();
        AesEncryptionHelper.TryDecrypt("not-base64!!!", key, out var plain).Should().BeFalse();
        plain.Should().BeEmpty();
    }
}

public class StorageConfigurationTests
{
    [Theory]
    [InlineData("", "")]
    [InlineData("ab", "**")]
    [InlineData("us-east-1", "u*******1")]
    public void GetMaskedCloudStorageRegionEndPoint(string input, string expected)
    {
        StorageConfiguration.GetMaskedCloudStorageRegionEndPoint(input).Should().Be(expected);
    }
}

[CollectionDefinition("StorageSerial", DisableParallelization = true)]
public class StorageSerialCollection { }

[Collection("StorageSerial")]
public class StorageServiceFactoryTests
{
    [Fact]
    public void GetStorageService_InvalidProvider_ThrowsAndClearsStatics()
    {
        var factory = new StorageServiceFactory(Mock.Of<IServiceProvider>());
        var config = new StorageConfiguration
        {
            StorageStrategy = "unknown-provider",
            ConnectionString = "cs",
            SecretKey = "sk",
            AccessKey = "ak"
        };

        var act = () => factory.GetStorageService(config);
        act.Should().Throw<ArgumentException>();

        // finally block resets the ambient StorageProvider statics
        StorageProvider.ConnectionString.Should().BeEmpty();
        StorageProvider.SecretKey.Should().BeEmpty();
        StorageProvider.AccessKey.Should().BeEmpty();
    }
}

public class StorageValidatorTests
{
    [Fact]
    public void GetPreSignedUrlForUpload_NameRequired()
    {
        var validator = new GetPreSignedUrlForUploadRequestValidator();
        validator.Validate(new GetPreSignedUrlForUploadRequest { Name = "" }).IsValid.Should().BeFalse();
        validator.Validate(new GetPreSignedUrlForUploadRequest { Name = "file.txt" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void GetPreSignedUrlForUpload_EmptyConfigurationName_Fails()
    {
        var validator = new GetPreSignedUrlForUploadRequestValidator();
        var request = new GetPreSignedUrlForUploadRequest { Name = "file.txt", ConfigurationName = "" };
        validator.Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void LocalStorageUpload_MissingExtension_Fails()
    {
        var validator = new LocalStorageUploadRequestValidator(Mock.Of<IFileDirectoryRepository>());
        var request = new LocalStorageUploadRequest { Name = "noext", File = Mock.Of<IFormFile>() };
        validator.Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void LocalStorageUpload_UnsupportedExtension_Fails()
    {
        var validator = new LocalStorageUploadRequestValidator(Mock.Of<IFileDirectoryRepository>());
        var request = new LocalStorageUploadRequest { Name = "malware.exe", File = Mock.Of<IFormFile>() };
        validator.Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void LocalStorageUpload_Valid_Passes()
    {
        var validator = new LocalStorageUploadRequestValidator(Mock.Of<IFileDirectoryRepository>());
        var request = new LocalStorageUploadRequest { Name = "document.pdf", File = Mock.Of<IFormFile>() };
        validator.Validate(request).IsValid.Should().BeTrue();
    }

    [Fact]
    public void UpdateFileRequest_ItemIdRequired()
    {
        var validator = new StorageStorage.Validators.UpdateFileRequestValidator();
        validator.Validate(new StorageStorage.UpdateFileRequest { ItemId = "" }).IsValid.Should().BeFalse();
        validator.Validate(new StorageStorage.UpdateFileRequest { ItemId = "id-1" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public void UnsupportedFile_Extensions_ContainsExecutables()
    {
        UnsupportedFile.Extensions.Should().Contain(".exe").And.Contain(".bat");
    }
}
