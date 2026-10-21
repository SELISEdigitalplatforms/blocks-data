using DomainService.Storage;
using DomainService.Storage.Validators;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using Storage.DomainService.Utilities;
using Blocks.Genesis.Entities.Data;
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

public class StorageServiceFactoryTests
{
    [Fact]
    public void GetStorageService_InvalidProvider_Throws()
    {
        var factory = new StorageServiceFactory(Mock.Of<IServiceProvider>());
        var config = new StorageConfiguration { StorageStrategy = "unknown-provider", ConnectionString = "cs", SecretKey = "sk", AccessKey = "ak" };

        var act = () => factory.GetStorageService(config);

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public async Task GetStorageService_ParallelTenants_EachServiceGetsOnlyItsOwnConfiguration()
    {
        // The configuration used to pass through static fields, which concurrent requests shared.
        // SFTP is the provider whose constructor makes no network call, so it can be built here.
        var services = new ServiceCollection();
        services.AddSingleton<Microsoft.Extensions.Configuration.IConfiguration>(new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build());
        var factory = new StorageServiceFactory(services.BuildServiceProvider());

        static StorageConfiguration ConfigFor(string tenant) => new()
        {
            StorageStrategy = "SftpStorage",
            Host = $"{tenant}.host",
            Port = "22",
            UserName = $"{tenant}-user",
            Password = $"{tenant}-password",
            RemoteBasePath = $"/{tenant}/",
            SftpSecretKey = $"{tenant}-key"
        };

        static string Field(object service, string name) =>
            (string)service.GetType().GetField(name, System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(service)!;

        var jobs = Enumerable.Range(0, 200).Select(i => i % 2 == 0 ? "tenant-a" : "tenant-b")
            .Select(tenant => Task.Run(() => (tenant, service: factory.GetStorageService(ConfigFor(tenant)))));
        var results = await Task.WhenAll(jobs);

        foreach (var (tenant, service) in results)
        {
            Field(service, "_sftpHost").Should().Be($"{tenant}.host");
            Field(service, "_sftpUsername").Should().Be($"{tenant}-user");
            Field(service, "_sftpPassword").Should().Be($"{tenant}-password");
            Field(service, "_remoteBasePath").Should().Be($"/{tenant}");
            Field(service, "_sftpSecretKey").Should().Be($"{tenant}-key");
        }
    }
}

public class StorageValidatorTests
{
    [Theory]
    [InlineData(nameof(GetPreSignedUrlForUploadRequest.Tags))]
    [InlineData(nameof(GetPreSignedUrlForUploadRequest.MetaData))]
    [InlineData(nameof(GetPreSignedUrlForUploadRequest.ParentDirectoryId))]
    public void GetPreSignedUrlForUpload_OptionalFieldsAreNullable(string propertyName)
    {
        var property = typeof(GetPreSignedUrlForUploadRequest).GetProperty(propertyName)!;

        new System.Reflection.NullabilityInfoContext()
            .Create(property)
            .WriteState.Should().Be(System.Reflection.NullabilityState.Nullable);
    }

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
