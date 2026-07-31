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
    private static (FilesController Controller, Mock<IFileManagementService> Service) BuildFiles()
    {
        var service = new Mock<IFileManagementService>();
        return (new FilesController(service.Object), service);
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

    [Fact]
    public async Task DeleteFolder_DelegatesToTheService()
    {
        var (controller, service) = BuildFiles();
        var request = new DeleteFolderRequest { FolderId = "folder-1" };
        service.Setup(s => s.DeleteFolderAsync(request)).ReturnsAsync(new BaseResponse { IsSuccess = true });

        var result = await controller.DeleteFolder(request);

        result.IsSuccess.Should().BeTrue();
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

    // ---------------- FilesController: null-command short circuits ----------------

    [Fact]
    public async Task GetDmsFileAndFolder_ReturnsAnEmptyResponseForANullCommand()
    {
        var (controller, service) = BuildFiles();

        var result = await controller.GetDmsFileAndFolder(null!);

        result.DmsFileAndFolderInfos.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
        service.Verify(s => s.GetDmsFileAndFolder(It.IsAny<GetDmsFileAndFolderRequest>()), Times.Never);
    }

    [Fact]
    public async Task GetDmsFileAndFolder_DelegatesWhenTheCommandIsPresent()
    {
        var (controller, service) = BuildFiles();
        var command = new GetDmsFileAndFolderRequest { ParentId = "root" };
        service.Setup(s => s.GetDmsFileAndFolder(command))
            .ReturnsAsync(new GetDmsFileAndFolderResponse
            {
                TotalCount = 1,
                DmsFileAndFolderInfos = [new DmsFileAndFolderInfo { ItemId = "a", Name = "a.txt" }]
            });

        var result = await controller.GetDmsFileAndFolder(command);

        result.TotalCount.Should().Be(1);
        result.DmsFileAndFolderInfos.Should().ContainSingle(info => info.ItemId == "a");
    }

    [Fact]
    public async Task UploadFile_ReturnsNullForANullCommand()
    {
        var (controller, service) = BuildFiles();

        var result = await controller.UploadFile(null!);

        result.Should().BeNull();
        service.Verify(s => s.UploadFilesAsync(It.IsAny<UploadFilesRequest>()), Times.Never);
    }

    [Fact]
    public async Task UploadFile_DelegatesWhenTheCommandIsPresent()
    {
        var (controller, service) = BuildFiles();
        var command = new UploadFilesRequest { Upload = [] };
        service.Setup(s => s.UploadFilesAsync(command))
            .ReturnsAsync(Response.Build().WithMessage("uploaded").WithStatusCode(System.Net.HttpStatusCode.OK));

        var result = await controller.UploadFile(command);

        result.Message.Should().Be("uploaded");
        result.HttpStatusCode.Should().Be(System.Net.HttpStatusCode.OK);
    }

    [Fact]
    public async Task CreateFolder_ReturnsNullForANullCommand()
    {
        var (controller, service) = BuildFiles();

        var result = await controller.CreateFolder(null!);

        result.Should().BeNull();
        service.Verify(s => s.CreateFolderAsync(It.IsAny<CreateFolderRequest>()), Times.Never);
    }

    [Fact]
    public async Task CreateFolder_DelegatesWhenTheCommandIsPresent()
    {
        var (controller, service) = BuildFiles();
        var command = new CreateFolderRequest { ArtifactName = "docs" };
        service.Setup(s => s.CreateFolderAsync(command))
            .ReturnsAsync(Response.Build().WithResult(new { Id = "folder-1" }));

        var result = await controller.CreateFolder(command);

        ((object)result.Result).Should().NotBeNull();
    }

    // ---------------- CertificateController ----------------

    [Fact]
    public async Task UploadCertificate_ReturnsTheDownloadUrlFromTheService()
    {
        var service = new Mock<IFileManagementService>();
        var request = new UploadCertificateRequest { TenantId = "t1" };
        service.Setup(s => s.UploadPublicCertificateAsync(request)).ReturnsAsync("https://cdn/cert.pfx");
        var controller = new CertificateController(service.Object);

        var result = await controller.UploadCertificate(request);

        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        ok.Value.Should().NotBeNull();
        ok.Value!.GetType().GetProperty("DownloadUrl")!.GetValue(ok.Value)
            .Should().Be("https://cdn/cert.pfx");
    }
}
