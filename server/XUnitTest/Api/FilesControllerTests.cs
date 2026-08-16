using Api.Controllers;
using Blocks.Genesis;
using DomainService.Storage;
using DomainService.Storage.Dms;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using System.Text;

namespace XUnitTest.Api
{
    /// <summary>
    /// Unit tests for <see cref="FileController"/>. Most actions are thin pass-throughs to
    /// <see cref="IFileManagementService"/>, so those assert the forwarding and the returned value.
    /// The interesting cases are the ones with logic of their own: DownloadFile choosing between
    /// NotFound and a file result, UpdateFileAdditionalInfo mapping success onto Ok or BadRequest,
    /// and the null-command guards.
    /// </summary>
    public class FilesControllerTests
    {
        private readonly Mock<IFileManagementService> _files = new();
        private readonly Mock<IFileService> _fileService = new();
        private readonly FileController _sut;

        public FilesControllerTests() => _sut = new FileController(_files.Object, _fileService.Object);

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
            request.Permanent.Should().BeTrue();
            var expected = new BaseResponse { IsSuccess = true };
            _files.Setup(f => f.DeleteFileAsync(request)).ReturnsAsync(expected);

            (await _sut.DeleteFile(request)).Should().BeSameAs(expected);
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

        // ---------------- DMS file endpoints (move / copy / versions / create-version) ----------------

        [Fact]
        public async Task MoveFile_ReturnsOkAndTheFileIdOnSuccess()
        {
            var request = new MoveFileRequest { FileId = "f1", TargetDirectoryId = "dir-1" };
            _fileService.Setup(c => c.MoveFileAsync("f1", "dir-1", It.IsAny<CancellationToken>()))
                .ReturnsAsync(new FileOperationResult { Status = FileOperationStatus.Succeeded });

            var result = await _sut.MoveFile(request);

            var ok = result.Should().BeOfType<OkObjectResult>().Subject;
            ok.Value.Should().BeEquivalentTo(new { fileId = "f1" });
        }

        [Fact]
        public async Task MoveFile_ReturnsNotFoundWhenTheFileIsMissing()
        {
            _fileService.Setup(c => c.MoveFileAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(FileOperationResult.Failure(FileOperationStatus.FileNotFound));

            var result = await _sut.MoveFile(new MoveFileRequest { FileId = "x", TargetDirectoryId = "dir-1" });

            result.Should().BeOfType<NotFoundObjectResult>();
        }

        [Fact]
        public async Task RenameFile_ReturnsTheFileIdOnSuccess()
        {
            var request = new RenameFileRequest { FileId = "f1", Name = "renamed.txt" };
            _fileService.Setup(c => c.RenameFileAsync("f1", "renamed.txt", It.IsAny<CancellationToken>()))
                .ReturnsAsync(new FileOperationResult { Status = FileOperationStatus.Succeeded });

            var result = await _sut.RenameFile(request);

            result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeEquivalentTo(new { fileId = "f1" });
        }

        [Fact]
        public async Task RenameFile_ReturnsConflictWhenTheNameAlreadyExists()
        {
            _fileService.Setup(c => c.RenameFileAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(FileOperationResult.Failure(FileOperationStatus.NameConflict));

            (await _sut.RenameFile(new RenameFileRequest { FileId = "f1", Name = "existing.txt" }))
                .Should().BeOfType<ConflictObjectResult>();
        }

        [Fact]
        public async Task CopyFile_ReturnsTheNewFileIdOnSuccess()
        {
            var request = new CopyFileRequest { FileId = "f1", TargetDirectoryId = "dir-1", CopyAccessPolicies = true };
            _fileService.Setup(c => c.CopyFileAsync("f1", "dir-1", true, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new FileOperationResult { Status = FileOperationStatus.Succeeded, NewFileId = "copy-1" });

            var result = await _sut.CopyFile(request);

            var ok = result.Should().BeOfType<OkObjectResult>().Subject;
            ok.Value.Should().BeEquivalentTo(new { fileId = "copy-1" });
        }

        [Fact]
        public async Task CopyFile_ReturnsConflictOnANameClash()
        {
            _fileService.Setup(c => c.CopyFileAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(FileOperationResult.Failure(FileOperationStatus.NameConflict));

            var result = await _sut.CopyFile(new CopyFileRequest { FileId = "f1", TargetDirectoryId = "dir-1" });

            result.Should().BeOfType<ConflictObjectResult>();
        }

        [Fact]
        public async Task GetFileVersions_ForwardsTheQueryAndMapsThePage()
        {
            var page = new FileVersionPage
            {
                Items = [FileVersion.CreateNew("f1", 2, new FileVersionOptions { ItemId = "v1" })],
                NextCursor = "1",
                HasMore = true,
            };
            _fileService.Setup(c => c.GetVersionsAsync("f1", "5", 10, It.IsAny<CancellationToken>()))
                .ReturnsAsync(page);

            var result = await _sut.GetFileVersions(new GetFileVersionsRequest { FileId = "f1", Cursor = "5", Limit = 10 });

            var body = result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<FileVersionsResponse>().Subject;
            body.HasMore.Should().BeTrue();
            body.NextCursor.Should().Be("1");
            body.Items.Should().ContainSingle().Which.No.Should().Be(2);
        }

        [Fact]
        public async Task CreateFileVersion_ReturnsOkWithTheVersionAndUrl()
        {
            var response = new CreateFileVersionResponse { VersionNo = 3, UploadUrl = "https://upload", IsSuccess = true };
            _files.Setup(f => f.CreateFileVersionAsync(It.IsAny<CreateFileVersionRequest>()))
                .ReturnsAsync(response);

            var result = await _sut.CreateFileVersion(new CreateFileVersionRequest { FileId = "f1" });

            var ok = result.Should().BeOfType<OkObjectResult>().Subject;
            ok.Value.Should().BeSameAs(response);
        }

        [Fact]
        public async Task CreateFileVersion_ReturnsBadRequestWhenTheFileIsMissing()
        {
            var response = new CreateFileVersionResponse { Errors = new() { ["FileId"] = "not_found" } };
            _files.Setup(f => f.CreateFileVersionAsync(It.IsAny<CreateFileVersionRequest>()))
                .ReturnsAsync(response);

            var result = await _sut.CreateFileVersion(new CreateFileVersionRequest { FileId = "x" });

            result.Should().BeOfType<BadRequestObjectResult>();
        }
    }
}
