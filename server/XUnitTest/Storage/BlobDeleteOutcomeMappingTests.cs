using System.Net;
using Amazon.Runtime;
using Amazon.S3;
using Azure;
using DomainService.Storage;
using FluentAssertions;

namespace XUnitTest.Storage;

/// <summary>
/// The per-provider status-to-outcome mapping for permanent blob deletes (blocks-data#418, spec §6.2). Both
/// providers are excluded from coverage and build their SDK clients internally, so the mapping is a static
/// pure function tested here directly.
/// </summary>
public class BlobDeleteOutcomeMappingTests
{
    // Azure

    [Fact]
    public void Azure_DeleteIfExists_true_is_Deleted_and_false_is_NotFound()
    {
        AzureBlobStorageService.MapDeleteResult(true).Should().Be(BlobDeleteOutcome.Deleted);
        AzureBlobStorageService.MapDeleteResult(false).Should().Be(BlobDeleteOutcome.NotFound);
    }

    [Fact]
    public void Azure_404_is_NotFound()
    {
        AzureBlobStorageService.MapDeleteException(new RequestFailedException(404, "gone", "BlobNotFound", null))
            .Should().Be(BlobDeleteOutcome.NotFound);
    }

    [Theory]
    [InlineData(400, "InvalidUri")]
    [InlineData(409, "LeaseIdMissing")]
    public void Azure_400_and_409_are_Skipped_with_status_and_error_code(int status, string errorCode)
    {
        AzureBlobStorageService.MapDeleteException(new RequestFailedException(status, "<html>body</html>", errorCode, null))
            .Should().Be(BlobDeleteOutcome.Skipped(status, errorCode));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(401)]
    [InlineData(403)]
    [InlineData(500)]
    [InlineData(503)]
    public void Azure_auth_server_and_network_statuses_are_Fatal(int status)
    {
        AzureBlobStorageService.MapDeleteException(new RequestFailedException(status, "failure", null, null))
            .Status.Should().Be(BlobDeleteStatus.Fatal);
    }

    [Fact]
    public void Azure_timeout_cancellation_and_other_exceptions_are_Fatal()
    {
        AzureBlobStorageService.MapDeleteException(new TaskCanceledException()).Status.Should().Be(BlobDeleteStatus.Fatal);
        AzureBlobStorageService.MapDeleteException(new OperationCanceledException()).Status.Should().Be(BlobDeleteStatus.Fatal);
        AzureBlobStorageService.MapDeleteException(new TimeoutException()).Status.Should().Be(BlobDeleteStatus.Fatal);
        AzureBlobStorageService.MapDeleteException(new InvalidOperationException()).Status.Should().Be(BlobDeleteStatus.Fatal);
    }

    // S3

    private static AmazonS3Exception S3Error(HttpStatusCode status, string errorCode = "Code") =>
        new("failure", ErrorType.Sender, errorCode, "request-1", status);

    [Fact]
    public void S3_404_is_NotFound()
    {
        AwsS3StorageService.MapDeleteException(S3Error(HttpStatusCode.NotFound, "NoSuchKey")).Should().Be(BlobDeleteOutcome.NotFound);
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest, "InvalidArgument")]
    [InlineData(HttpStatusCode.Conflict, "OperationAborted")]
    public void S3_400_and_409_are_Skipped_with_status_and_error_code(HttpStatusCode status, string errorCode)
    {
        AwsS3StorageService.MapDeleteException(S3Error(status, errorCode)).Should().Be(BlobDeleteOutcome.Skipped((int)status, errorCode));
    }

    [Theory]
    [InlineData((HttpStatusCode)0)]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    public void S3_auth_server_and_network_statuses_are_Fatal(HttpStatusCode status)
    {
        AwsS3StorageService.MapDeleteException(S3Error(status)).Status.Should().Be(BlobDeleteStatus.Fatal);
    }

    [Fact]
    public void S3_timeout_cancellation_and_other_exceptions_are_Fatal()
    {
        AwsS3StorageService.MapDeleteException(new TaskCanceledException()).Status.Should().Be(BlobDeleteStatus.Fatal);
        AwsS3StorageService.MapDeleteException(new OperationCanceledException()).Status.Should().Be(BlobDeleteStatus.Fatal);
        AwsS3StorageService.MapDeleteException(new TimeoutException()).Status.Should().Be(BlobDeleteStatus.Fatal);
        AwsS3StorageService.MapDeleteException(new AmazonServiceException("network")).Status.Should().Be(BlobDeleteStatus.Fatal);
    }

    // Q1 evidence: why keys with dot segments must not reach Azure, while S3 keys are sent literally

    [Fact]
    public void Q1_the_Azure_client_resolves_dot_segments_so_such_a_key_would_address_another_files_blob()
    {
        var container = new Azure.Storage.Blobs.BlobContainerClient(new Uri("https://account.blob.core.windows.net/tenant"));

        container.GetBlobClient("Private/F3/V9/../../G1/V1/doc.pdf").Name.Should().Be("Private/G1/V1/doc.pdf");
        container.GetBlobClient("Private/F3/V9/..\\..\\G1\\V1\\doc.pdf").Uri.AbsolutePath
            .Should().Be("/tenant/Private/F3/V9/..%5C..%5CG1%5CV1%5Cdoc.pdf");
    }

    [Fact]
    public async Task Q1_the_S3_client_sends_a_dot_segment_key_literally()
    {
        var requestLine = await CaptureOneRequestLineAsync(async port =>
        {
            using var client = new AmazonS3Client(new BasicAWSCredentials("key", "secret"), new AmazonS3Config
            {
                ServiceURL = $"http://127.0.0.1:{port}",
                ForcePathStyle = true,
                MaxErrorRetry = 0,
                Timeout = TimeSpan.FromSeconds(10),
            });
            await client.DeleteObjectAsync("bucket", "Private/F3/V9/../../G1/V1/doc.pdf");
        });

        requestLine.Should().StartWith("DELETE /bucket/Private/F3/V9/../../G1/V1/doc.pdf ");
    }

    /// <summary>Serves one HTTP request on a loopback port with 204 and returns its request line.</summary>
    private static async Task<string> CaptureOneRequestLineAsync(Func<int, Task> sendRequest)
    {
        using var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        // CA2025 is a false positive here: `served` is awaited below, before the listener is disposed.
#pragma warning disable CA2025
        var served = ServeOneRequestAsync(listener);
#pragma warning restore CA2025
        await sendRequest(((IPEndPoint)listener.LocalEndpoint).Port);
        return await served.WaitAsync(TimeSpan.FromSeconds(10));
    }

    private static async Task<string> ServeOneRequestAsync(System.Net.Sockets.TcpListener listener)
    {
        using var socket = await listener.AcceptTcpClientAsync();
        var stream = socket.GetStream();
        using var reader = new StreamReader(stream, leaveOpen: true);
        var requestLine = await reader.ReadLineAsync() ?? string.Empty;
        while (!string.IsNullOrEmpty(await reader.ReadLineAsync()))
        {
        }

        var response = "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"u8.ToArray();
        await stream.WriteAsync(response);
        await stream.FlushAsync();
        return requestLine;
    }
}
