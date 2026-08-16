using Api.Controllers;
using Blocks.Genesis;
using DomainService.Storage;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;

namespace XUnitTest.Api;

/// <summary>
/// Unit tests for the Storage REST controllers. Every action is verified to hand the request to
/// <see cref="IFileManagementService"/> unchanged and to surface what the service returns, plus the
/// null-request and not-found short-circuits that the controllers own themselves.
/// The service is mocked; no host is booted.
/// </summary>
public class StorageControllerTests
{
    private static (FileController Controller, Mock<IFileManagementService> Service) BuildFiles()
    {
        var service = new Mock<IFileManagementService>();
        return (new FileController(service.Object, Mock.Of<IFileService>()), service);
    }

    // ---------------- FilesController: pass-through actions ----------------

    [Fact]
    public async Task GetFile_ReturnsWhatTheServiceReturns()
    {
        var (controller, service) = BuildFiles();
        var request = new GetFileRequest { FileId = "file-1" };
        var expected = new FileResponse { ItemId = "file-1", Url = "https://cdn/file-1" };
        service.Setup(s => s.GetUrlForDownloadFileAsync(request)).ReturnsAsync(expected);

        var result = await controller.GetFile(request);

        result.Should().BeSameAs(expected);
        service.Verify(s => s.GetUrlForDownloadFileAsync(request), Times.Once);
    }

    [Fact]
    public async Task GetFile_PropagatesNullForAMissingFile()
    {
        var (controller, service) = BuildFiles();
        service.Setup(s => s.GetUrlForDownloadFileAsync(It.IsAny<GetFileRequest>()))
            .ReturnsAsync((FileResponse?)null);

        var result = await controller.GetFile(new GetFileRequest { FileId = "missing" });

        result.Should().BeNull();
    }

    [Fact]
    public async Task GetFiles_ReturnsTheServiceList()
    {
        var (controller, service) = BuildFiles();
        var request = new GetFilesRequest { FileIds = ["a", "b"] };
        var expected = new List<FileResponse> { new() { ItemId = "a" }, new() { ItemId = "b" } };
        service.Setup(s => s.GetMultipleUrlsForDownloadFilesAsync(request)).ReturnsAsync(expected);

        var result = await controller.GetFiles(request);

        result.Should().BeEquivalentTo(expected);
    }

    [Fact]
    public async Task GetFiles_PropagatesAnEmptyList()
    {
        var (controller, service) = BuildFiles();
        service.Setup(s => s.GetMultipleUrlsForDownloadFilesAsync(It.IsAny<GetFilesRequest>()))
            .ReturnsAsync([]);

        var result = await controller.GetFiles(new GetFilesRequest { FileIds = [] });

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetFilesInfo_DelegatesToTheService()
    {
        var (controller, service) = BuildFiles();
        var request = new GetFilesInfoRequest();
        var expected = new GetFilesInfoResponse();
        service.Setup(s => s.GetFilesInfoAsync(request)).ReturnsAsync(expected);

        var result = await controller.GetFilesInfo(request);

        result.Should().BeSameAs(expected);
    }

    [Fact]
    public async Task GetPreSignedUrlForUpload_DelegatesToTheService()
    {
        var (controller, service) = BuildFiles();
        var request = new GetPreSignedUrlForUploadRequest { Name = "a.txt" };
        var expected = new GetPreSignedUrlForUploadResponse { UploadUrl = "https://upload", IsSuccess = true };
        service.Setup(s => s.GetPerSignedUrlForUploadAsync(request)).ReturnsAsync(expected);

        var result = await controller.GetPreSignedUrlForUpload(request);

        result.UploadUrl.Should().Be("https://upload");
        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task DeleteFile_DelegatesToTheService()
    {
        var (controller, service) = BuildFiles();
        var request = new DeleteFileRequest { FileId = "file-1" };
        service.Setup(s => s.DeleteFileAsync(request)).ReturnsAsync(new BaseResponse { IsSuccess = true });

        var result = await controller.DeleteFile(request);

        result.IsSuccess.Should().BeTrue();
        service.Verify(s => s.DeleteFileAsync(request), Times.Once);
    }

    [Fact]
    public async Task DeleteFile_SurfacesTheServiceFailure()
    {
        var (controller, service) = BuildFiles();
        service.Setup(s => s.DeleteFileAsync(It.IsAny<DeleteFileRequest>()))
            .ReturnsAsync(new BaseResponse
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string> { ["FileId"] = "not found" }
            });

        var result = await controller.DeleteFile(new DeleteFileRequest { FileId = "gone" });

        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().ContainKey("FileId");
    }

    [Fact]
    public async Task UploadFileToLocalStorage_DelegatesToTheService()
    {
        var (controller, service) = BuildFiles();
        var request = new LocalStorageUploadRequest { Name = "a.txt", File = null! };
        service.Setup(s => s.UploadFileToLocalStorageAsync(request))
            .ReturnsAsync(new LocalStorageUploadResponse { FileId = "file-9", FileVersion = 2, IsSuccess = true });

        var result = await controller.UploadFileToLocalStorage(request);

        result.FileId.Should().Be("file-9");
        result.FileVersion.Should().Be(2);
    }

    // ---------------- FilesController: DownloadFile branches ----------------

    [Fact]
    public async Task DownloadFile_ReturnsAFileResultWhenTheStreamIsPresent()
    {
        var (controller, service) = BuildFiles();
        var bytes = new byte[] { 1, 2, 3 };
        service.Setup(s => s.DownloadFileFromLocalStorageAsync(It.IsAny<DownloadFileRequest>()))
            .ReturnsAsync(new DownloadFileResponse
            {
                FileName = "a.txt",
                FileStream = new MemoryStream(bytes),
                IsSuccess = true
            });

        var result = await controller.DownloadFile(new DownloadFileRequest());

        var file = result.Should().BeOfType<FileStreamResult>().Subject;
        file.ContentType.Should().Be("application/octet-stream");
        file.FileDownloadName.Should().Be("a.txt");
    }

    [Fact]
    public async Task DownloadFile_ReturnsNotFoundWithTheErrorsWhenThereIsNoStream()
    {
        var (controller, service) = BuildFiles();
        var errors = new Dictionary<string, string> { ["FileId"] = "does not exist" };
        service.Setup(s => s.DownloadFileFromLocalStorageAsync(It.IsAny<DownloadFileRequest>()))
            .ReturnsAsync(new DownloadFileResponse { FileStream = null, Errors = errors });

        var result = await controller.DownloadFile(new DownloadFileRequest());

        var notFound = result.Should().BeOfType<NotFoundObjectResult>().Subject;
        notFound.Value.Should().BeSameAs(errors);
    }

    // ---------------- FilesController: UpdateFileAdditionalInfo branches ----------------

    [Fact]
    public async Task UpdateFileAdditionalInfo_ReturnsBadRequestForANullCommand()
    {
        var (controller, service) = BuildFiles();

        var result = await controller.UpdateFileAdditionalInfo(null!);

        result.Should().BeOfType<BadRequestResult>();
        service.Verify(s => s.UpdateFileAsync(It.IsAny<UpdateFileRequest>()), Times.Never);
    }

    [Fact]
    public async Task UpdateFileAdditionalInfo_ReturnsOkWhenTheServiceSucceeds()
    {
        var (controller, service) = BuildFiles();
        var command = new UpdateFileRequest { ItemId = "file-1" };
        service.Setup(s => s.UpdateFileAsync(command))
            .ReturnsAsync(new BaseMutationResponse { IsSuccess = true, ItemId = "file-1" });

        var result = await controller.UpdateFileAdditionalInfo(command);

        result.Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task UpdateFileAdditionalInfo_ReturnsBadRequestWhenTheServiceFails()
    {
        var (controller, service) = BuildFiles();
        service.Setup(s => s.UpdateFileAsync(It.IsAny<UpdateFileRequest>()))
            .ReturnsAsync(new BaseMutationResponse { IsSuccess = false });

        var result = await controller.UpdateFileAdditionalInfo(new UpdateFileRequest());

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task DeprecatedCamelCaseUpdateAlias_BehavesLikeTheRenamedAction()
    {
        var (controller, service) = BuildFiles();
        var command = new UpdateFileRequest { ItemId = "file-1" };
        service.Setup(s => s.UpdateFileAsync(command))
            .ReturnsAsync(new BaseMutationResponse { IsSuccess = true });

#pragma warning disable CS0618 // the alias is deliberately kept for the leaked camelCase URL
        var result = await controller.updateFileAdditionalInfo(command);
#pragma warning restore CS0618

        result.Should().BeOfType<OkObjectResult>();
        service.Verify(s => s.UpdateFileAsync(command), Times.Once);
    }

    // ---------------- CertificateController has been retired; certificate upload
    // moves to the IDP service, where the PFX is owned.
}
