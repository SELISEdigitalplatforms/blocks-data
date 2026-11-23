using System.Net;
using Amazon.Runtime;
using Amazon.S3;
using Azure;
using Blocks.Genesis.Entities.Data;
using DomainService.Storage;
using FluentAssertions;
using FluentValidation;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using StorageDriver;
using XUnitTest.Infrastructure;
using DomainConfiguration = DomainService.Configuration;

namespace XUnitTest.Storage;

/// <summary>
/// How the file service and the driver facade reach a provider's public-object methods (I02-WP9): validation before any
/// provider call, the Default configuration, and the mapping of provider errors to one exception type.
/// </summary>
public class PublicObjectServiceTests
{

    private sealed class ServiceFixture : IDisposable
    {
        public Mock<IStorageService> Provider { get; } = new();
        public Mock<IStorageServiceFactory> Factory { get; } = new();
        public Mock<DomainConfiguration.IStorageConfigurationProvider> Configurations { get; } = new();
        public StorageConfiguration? Configuration { get; set; } = new() { Name = "Default", StorageStrategy = "azure" };

        public ServiceFixture()
        {
            BlocksTestContext.Set(tenantId: "tenant-1");
            Factory.Setup(f => f.GetStorageService(It.IsAny<StorageConfiguration>())).Returns(Provider.Object);
            Configurations.Setup(c => c.GetByNameAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(() => Configuration);
        }

        public void Dispose() => BlocksTestContext.Clear();

        public FileManagementService Sut() => new(
            Mock.Of<IFileRepository>(),
            Factory.Object,
            Mock.Of<IFileVersionRepository>(),
            Configurations.Object,
            Mock.Of<IFileDirectoryRepository>(),
            Mock.Of<IValidator<GetPreSignedUrlForUploadRequest>>(),
            Mock.Of<IValidator<LocalStorageUploadRequest>>(),
            Mock.Of<IValidator<UpdateFileRequest>>(),
            Mock.Of<Blocks.Genesis.IMessageClient>(),
            Mock.Of<IObjectAccessResolver>(),
            Mock.Of<IObjectAccessRepository>(),
            Mock.Of<IUploadKeyRouter>(),
            Mock.Of<IUploadVerificationService>(),
            new Microsoft.Extensions.Logging.Abstractions.NullLogger<FileManagementService>());
    }

    [Fact]
    public async Task The_file_service_uploads_through_the_Default_configurations_provider()
    {
        using var fixture = new ServiceFixture();
        fixture.Provider.Setup(p => p.UploadPublicObjectAsync("certificates", "tenant-1", It.IsAny<Stream>(), "application/x-pkcs12"))
            .ReturnsAsync("http://s3:8333/certificates/tenant-1");

        var url = await fixture.Sut().UploadPublicObjectAsync("certificates", "tenant-1", new MemoryStream(), "application/x-pkcs12");

        url.Should().Be("http://s3:8333/certificates/tenant-1");
        fixture.Configurations.Verify(c => c.GetByNameAsync("Default", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task A_blank_content_type_is_served_as_octet_stream()
    {
        using var fixture = new ServiceFixture();
        fixture.Provider.Setup(p => p.UploadPublicObjectAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>(), It.IsAny<string>())).ReturnsAsync("u");

        await fixture.Sut().UploadPublicObjectAsync("certificates", "tenant-1", new MemoryStream(), " ");

        fixture.Provider.Verify(p => p.UploadPublicObjectAsync("certificates", "tenant-1", It.IsAny<Stream>(), "application/octet-stream"), Times.Once);
    }

    [Fact]
    public async Task An_invalid_container_or_key_never_reaches_a_provider()
    {
        using var fixture = new ServiceFixture();

        Func<Task> badContainer = () => fixture.Sut().UploadPublicObjectAsync("Not Valid", "k", new MemoryStream(), "text/plain");
        Func<Task> badKey = () => fixture.Sut().OpenReadAsync("certificates", "../other");

        (await badContainer.Should().ThrowAsync<PublicObjectStorageException>()).Which.ErrorCode.Should().Be(PublicObjectStorageException.InvalidContainerCode);
        (await badKey.Should().ThrowAsync<PublicObjectStorageException>()).Which.ErrorCode.Should().Be(PublicObjectStorageException.InvalidKeyCode);
        fixture.Factory.Verify(f => f.GetStorageService(It.IsAny<StorageConfiguration>()), Times.Never);
    }

    [Fact]
    public async Task A_tenant_without_a_Default_configuration_gets_a_clear_error()
    {
        using var fixture = new ServiceFixture { Configuration = null };

        Func<Task> act = () => fixture.Sut().UploadPublicObjectAsync("certificates", "k", new MemoryStream(), "text/plain");

        (await act.Should().ThrowAsync<PublicObjectStorageException>()).Which.ErrorCode.Should().Be(PublicObjectStorageException.ConfigurationMissingCode);
    }

    [Fact]
    public async Task A_provider_without_public_read_is_reported_as_not_supported()
    {
        using var fixture = new ServiceFixture();
        fixture.Provider.Setup(p => p.UploadPublicObjectAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>(), It.IsAny<string>()))
            .ThrowsAsync(new NotSupportedException("sftp"));

        Func<Task> act = () => fixture.Sut().UploadPublicObjectAsync("certificates", "k", new MemoryStream(), "text/plain");

        (await act.Should().ThrowAsync<PublicObjectStorageException>()).Which.ErrorCode.Should().Be(PublicObjectStorageException.NotSupportedCode);
    }

    [Fact]
    public async Task A_provider_refusal_carries_the_providers_own_error_code()
    {
        using var fixture = new ServiceFixture();
        fixture.Provider.SetupSequence(p => p.UploadPublicObjectAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>(), It.IsAny<string>()))
            .ThrowsAsync(new RequestFailedException(403, "no", "PublicAccessNotPermitted", null))
            .ThrowsAsync(S3Error(HttpStatusCode.Forbidden, "AccessDenied"))
            .ThrowsAsync(new AmazonS3Exception("blank"));
        var sut = fixture.Sut();

        Func<Task> upload = () => sut.UploadPublicObjectAsync("certificates", "k", new MemoryStream(), "text/plain");

        (await upload.Should().ThrowAsync<PublicObjectStorageException>()).Which.ErrorCode.Should().Be("PublicAccessNotPermitted");
        (await upload.Should().ThrowAsync<PublicObjectStorageException>()).Which.ErrorCode.Should().Be("AccessDenied");
        (await upload.Should().ThrowAsync<PublicObjectStorageException>()).Which.ErrorCode.Should().Be(PublicObjectStorageException.FailedCode);
    }

    [Fact]
    public async Task Open_read_goes_through_the_provider_and_the_driver_facade_delegates_both_methods()
    {
        using var fixture = new ServiceFixture();
        fixture.Provider.Setup(p => p.OpenReadAsync("certificates", "tenant-1")).ReturnsAsync(new MemoryStream(new byte[] { 7 }));
        fixture.Provider.Setup(p => p.UploadPublicObjectAsync("certificates", "tenant-1", It.IsAny<Stream>(), "text/plain")).ReturnsAsync("url");
        IStorageDriverService facade = new StorageDriverService(fixture.Sut());

        await using var read = await facade.OpenReadAsync("certificates", "tenant-1");
        var url = await facade.UploadPublicObjectAsync("certificates", "tenant-1", new MemoryStream(), "text/plain");

        read!.Length.Should().Be(1);
        url.Should().Be("url");
    }

    [Fact]
    public void The_azure_only_blob_client_method_is_marked_obsolete()
    {
        typeof(IStorageDriverService).GetMethod(nameof(IStorageDriverService.GetBlobClientAsync))!
            .GetCustomAttributes(typeof(ObsoleteAttribute), inherit: false).Should().HaveCount(1);
    }

    private static AmazonS3Exception S3Error(HttpStatusCode status, string code) =>
        new("failure", ErrorType.Sender, code, "request-1", status);
}
