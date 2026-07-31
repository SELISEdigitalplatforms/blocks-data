using Api.Controllers;
using Blocks.Genesis;
using DomainService.Storage;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using System.Text;

namespace XUnitTest.Api
{
    /// <summary>
    /// Unit tests for <see cref="FilesController"/>. Most actions are thin pass-throughs to
    /// <see cref="IFileManagementService"/>, so those assert the forwarding and the returned value.
    /// The interesting cases are the ones with logic of their own: DownloadFile choosing between
    /// NotFound and a file result, UpdateFileAdditionalInfo mapping success onto Ok or BadRequest,
    /// and the null-command guards.
    /// </summary>
    public class FilesControllerTests
    {
        private readonly Mock<IFileManagementService> _files = new();
        private readonly FilesController _sut;

        public FilesControllerTests() => _sut = new FilesController(_files.Object);

        [Fact]
        public async Task GetFile_ForwardsTheRequestAndReturnsTheResponse()
        {
            var request = new GetFileRequest { FileId = "f1" };
            var expected = new FileResponse { Url = "https://blobs/f1", Name = "a.txt" };
            _files.Setup(f => f.GetUrlForDownloadFileAsync(request)).ReturnsAsync(expected);

            (await _sut.GetFile(request)).Should().BeSameAs(expected);
        }

        [Fact]
        public async Task GetFile_PassesThroughANullResponse()
        {
            _files.Setup(f => f.GetUrlForDownloadFileAsync(It.IsAny<GetFileRequest>()))
                  .ReturnsAsync((FileResponse?)null);

            (await _sut.GetFile(new GetFileRequest { FileId = "missing" })).Should().BeNull();
        }

        [Fact]
        public async Task GetFiles_ForwardsTheBatchRequest()
        {
            var request = new GetFilesRequest { FileIds = ["f1", "f2"] };
            var expected = new List<FileResponse> { new() { Name = "a" }, new() { Name = "b" } };
            _files.Setup(f => f.GetMultipleUrlsForDownloadFilesAsync(request)).ReturnsAsync(expected);

            (await _sut.GetFiles(request)).Should().BeSameAs(expected);
        }

        [Fact]
        public async Task GetFilesInfo_ForwardsTheQuery()
        {
            var request = new GetFilesInfoRequest();
            var expected = new GetFilesInfoResponse();
            _files.Setup(f => f.GetFilesInfoAsync(request)).ReturnsAsync(expected);

            (await _sut.GetFilesInfo(request)).Should().BeSameAs(expected);
        }

        [Fact]
        public async Task GetPreSignedUrlForUpload_ForwardsTheRequest()
        {
            var request = new GetPreSignedUrlForUploadRequest { Name = "a.txt" };
            var expected = new GetPreSignedUrlForUploadResponse { UploadUrl = "https://blobs/put" };
            _files.Setup(f => f.GetPerSignedUrlForUploadAsync(request)).ReturnsAsync(expected);

            (await _sut.GetPreSignedUrlForUpload(request)).Should().BeSameAs(expected);
        }

        [Fact]
        public async Task DeleteFile_ForwardsTheRequest()
        {
            var request = new DeleteFileRequest { FileId = "f1" };
            var expected = new BaseResponse { IsSuccess = true };
            _files.Setup(f => f.DeleteFileAsync(request)).ReturnsAsync(expected);

            (await _sut.DeleteFile(request)).Should().BeSameAs(expected);
        }

        [Fact]
        public async Task DeleteFolder_ForwardsTheRequest()
        {
            var request = new DeleteFolderRequest { FolderId = "folder-1" };
            var expected = new BaseResponse { IsSuccess = true };
            _files.Setup(f => f.DeleteFolderAsync(request)).ReturnsAsync(expected);

            (await _sut.DeleteFolder(request)).Should().BeSameAs(expected);
        }

        [Fact]
        public async Task UploadFileToLocalStorage_ForwardsTheFormRequest()
        {
            var request = new LocalStorageUploadRequest { File = new Mock<IFormFile>().Object };
            var expected = new LocalStorageUploadResponse();
            _files.Setup(f => f.UploadFileToLocalStorageAsync(request)).ReturnsAsync(expected);

            (await _sut.UploadFileToLocalStorage(request)).Should().BeSameAs(expected);
        }

        [Fact]
        public async Task DownloadFile_ReturnsAFileResultWhenAStreamComesBack()
        {
            var stream = new MemoryStream(Encoding.UTF8.GetBytes("payload"));
            _files.Setup(f => f.DownloadFileFromLocalStorageAsync(It.IsAny<DownloadFileRequest>()))
                  .ReturnsAsync(new DownloadFileResponse { FileStream = stream, FileName = "report.pdf" });

            var result = await _sut.DownloadFile(new DownloadFileRequest());

            var file = result.Should().BeOfType<FileStreamResult>().Subject;
            file.ContentType.Should().Be("application/octet-stream");
            file.FileDownloadName.Should().Be("report.pdf");
        }

        [Fact]
        public async Task DownloadFile_ReturnsNotFoundWithTheErrorsWhenThereIsNoStream()
        {
            var errors = new Dictionary<string, string> { ["message"] = "file_not_found" };
            _files.Setup(f => f.DownloadFileFromLocalStorageAsync(It.IsAny<DownloadFileRequest>()))
                  .ReturnsAsync(new DownloadFileResponse { FileStream = null, Errors = errors });

            var result = await _sut.DownloadFile(new DownloadFileRequest());

            result.Should().BeOfType<NotFoundObjectResult>()
                  .Which.Value.Should().BeSameAs(errors);
        }

        [Fact]
        public async Task UpdateFileAdditionalInfo_ReturnsOkOnSuccess()
        {
            var command = new UpdateFileRequest { ItemId = "f1" };
            var response = new BaseMutationResponse { IsSuccess = true };
            _files.Setup(f => f.UpdateFileAsync(command)).ReturnsAsync(response);

            var result = await _sut.UpdateFileAdditionalInfo(command);

            result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeSameAs(response);
        }

        [Fact]
        public async Task UpdateFileAdditionalInfo_ReturnsBadRequestWhenTheUpdateFails()
        {
            var command = new UpdateFileRequest { ItemId = "f1" };
            var response = new BaseMutationResponse { IsSuccess = false };
            _files.Setup(f => f.UpdateFileAsync(command)).ReturnsAsync(response);

            var result = await _sut.UpdateFileAdditionalInfo(command);

            result.Should().BeOfType<BadRequestObjectResult>().Which.Value.Should().BeSameAs(response);
        }

        [Fact]
        public async Task UpdateFileAdditionalInfo_RejectsANullCommandWithoutCallingTheService()
        {
            var result = await _sut.UpdateFileAdditionalInfo(null!);

            result.Should().BeOfType<BadRequestResult>();
            _files.Verify(f => f.UpdateFileAsync(It.IsAny<UpdateFileRequest>()), Times.Never);
        }

        [Fact]
        public async Task DeprecatedCamelCaseAlias_BehavesExactlyLikeTheRenamedAction()
        {
            // The lower-case alias exists only so a leaked URL keeps working; it must not drift.
            var command = new UpdateFileRequest { ItemId = "f1" };
            _files.Setup(f => f.UpdateFileAsync(command)).ReturnsAsync(new BaseMutationResponse { IsSuccess = true });

#pragma warning disable CS0618 // deliberately exercising the obsolete alias
            var alias = await _sut.updateFileAdditionalInfo(command);
#pragma warning restore CS0618

            alias.Should().BeOfType<OkObjectResult>();
            _files.Verify(f => f.UpdateFileAsync(command), Times.Once);
        }

        [Fact]
        public async Task GetDmsFileAndFolder_ForwardsTheCommand()
        {
            var command = new GetDmsFileAndFolderRequest();
            var expected = new GetDmsFileAndFolderResponse();
            _files.Setup(f => f.GetDmsFileAndFolder(command)).ReturnsAsync(expected);

            (await _sut.GetDmsFileAndFolder(command)).Should().BeSameAs(expected);
        }

        [Fact]
        public async Task GetDmsFileAndFolder_ReturnsAnEmptyResponseForANullCommand()
        {
            var result = await _sut.GetDmsFileAndFolder(null!);

            result.Should().NotBeNull();
            _files.Verify(f => f.GetDmsFileAndFolder(It.IsAny<GetDmsFileAndFolderRequest>()), Times.Never);
        }

        [Fact]
        public async Task UploadFile_ForwardsTheCommand()
        {
            var command = new UploadFilesRequest();
            var expected = new DmsResponse();
            _files.Setup(f => f.UploadFilesAsync(command)).ReturnsAsync(expected);

            (await _sut.UploadFile(command)).Should().BeSameAs(expected);
        }

        [Fact]
        public async Task UploadFile_ReturnsNullForANullCommand()
        {
            (await _sut.UploadFile(null!)).Should().BeNull();
            _files.Verify(f => f.UploadFilesAsync(It.IsAny<UploadFilesRequest>()), Times.Never);
        }

        [Fact]
        public async Task CreateFolder_ForwardsTheCommand()
        {
            var command = new CreateFolderRequest();
            var expected = new DmsResponse();
            _files.Setup(f => f.CreateFolderAsync(command)).ReturnsAsync(expected);

            (await _sut.CreateFolder(command)).Should().BeSameAs(expected);
        }

        [Fact]
        public async Task CreateFolder_ReturnsNullForANullCommand()
        {
            (await _sut.CreateFolder(null!)).Should().BeNull();
            _files.Verify(f => f.CreateFolderAsync(It.IsAny<CreateFolderRequest>()), Times.Never);
        }
    }
}
