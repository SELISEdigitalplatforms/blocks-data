using System.Net;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text.Json;
using Api.Controllers;
using Blocks.Data.Api.Filters;
using DataGateway.Rest;
using DomainService.Storage;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit.Abstractions;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using Storage.DomainService.Utilities;

namespace XUnitTest.Api;

/// <summary>
/// The request limits of <c>POST /files/upload-file-to-local-storage</c> (blocks-data#441, spec §6.5, E8, A3–A5) on a real
/// Kestrel loopback host: a body up to 101 MiB reaches the service with the file's full length, a larger body is answered
/// 413 with the upload error envelope before the service runs, a refused permission wins before the form is read, and an
/// aborted upload never reaches the service. Bodies are generated while they stream; no test allocates a whole file.
/// </summary>
/// <remarks>Serial: <see cref="GC.GetTotalAllocatedBytes(bool)"/> counts the whole process, so no other test may run beside the allocation check.</remarks>
[Collection(LocalUploadHostCollection.Name)]
public sealed class LocalUploadRequestLimitTests : IClassFixture<LocalUploadRequestLimitTests.Host>
{
    private const long MiB = 1024 * 1024;
    private const string Route = "/files/upload-file-to-local-storage";
    private readonly Host _host;
    private readonly ITestOutputHelper _output;

    public LocalUploadRequestLimitTests(Host host, ITestOutputHelper output)
    {
        _host = host;
        _output = output;
        _host.Reset();
    }

    [Fact]
    public async Task H10_a_20_MiB_file_reaches_the_service()
    {
        using var response = await _host.Client.PostAsync(Route, Form(20 * MiB));

        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        _host.ReceivedLengths.Should().Equal(20 * MiB);
    }

    [Fact]
    public async Task H9_C16_a_100_MiB_file_reaches_the_service_with_its_full_length_and_bounded_allocations()
    {
        // Warm the pipeline so one-time JIT and pool allocations are not counted.
        (await _host.Client.PostAsync(Route, Form(1 * MiB))).Dispose();
        _host.Reset();

        var before = GC.GetTotalAllocatedBytes(precise: true);
        using var response = await _host.Client.PostAsync(Route, Form(Constants.MaxUploadSizeInBytes));
        var allocated = GC.GetTotalAllocatedBytes(precise: true) - before;

        _output.WriteLine($"Allocated for one 100 MiB local upload: {allocated} bytes");
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        (await Body(response)).GetProperty("isSuccess").GetBoolean().Should().BeTrue();
        _host.ReceivedLengths.Should().Equal(Constants.MaxUploadSizeInBytes);
        // A9 (b): the whole process (server and the streaming client) allocates at most 16 MiB for one 100 MiB upload.
        allocated.Should().BeLessThanOrEqualTo(16 * MiB, "the form reader spills the file to disk instead of buffering it in memory");
    }

    [Fact]
    public async Task C9_a_body_over_101_MiB_is_refused_with_413_and_the_upload_envelope_before_the_service_runs()
    {
        // With Expect: 100-continue the client waits for the server's answer before sending the body, as a well-behaved
        // client does; Kestrel refuses the declared length without asking for the body.
        using var request = new HttpRequestMessage(HttpMethod.Post, Route) { Content = Form(105 * MiB) };
        request.Headers.ExpectContinue = true;

        using var response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
        var body = await Body(response);
        body.GetProperty("isSuccess").GetBoolean().Should().BeFalse();
        body.GetProperty("errors").GetProperty("File").GetString().Should().Be("request_body_exceeds_maximum_allowed");
        _host.ServiceCalls.Should().Be(0);
    }

    [Fact]
    public async Task C9_a_chunked_body_over_the_limit_never_reaches_the_service()
    {
        var content = Form(105 * MiB);
        content.Headers.ContentLength = null;
        using var request = new HttpRequestMessage(HttpMethod.Post, Route) { Content = content };
        request.Headers.TransferEncodingChunked = true;

        // Without a declared length Kestrel can only refuse once the limit is crossed mid-stream; it answers 413 and closes
        // the connection, so the still-writing client sees either that answer or a broken pipe, depending on timing.
        HttpResponseMessage? response = null;
        try
        {
            response = await _host.Client.SendAsync(request);
        }
        catch (HttpRequestException)
        {
            // The connection closed while the client was still sending: the server refused the body.
        }

        using (response)
        {
            if (response is not null)
            {
                response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
                (await Body(response)).GetProperty("errors").GetProperty("File").GetString().Should().Be("request_body_exceeds_maximum_allowed");
            }
        }
        _host.ServiceCalls.Should().Be(0);
    }

    [Fact]
    public async Task Other_binding_failures_keep_the_automatic_400()
    {
        using var response = await _host.Client.PostAsync(Route, new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));

        response.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.UnsupportedMediaType);
        _host.ServiceCalls.Should().Be(0);
    }

    [Fact]
    public async Task C11_a_refused_permission_answers_before_the_form_is_read_even_over_the_limit()
    {
        _host.DenyPermission = true;
        using var request = new HttpRequestMessage(HttpMethod.Post, Route) { Content = Form(105 * MiB) };
        request.Headers.ExpectContinue = true;

        using var response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.ServiceCalls.Should().Be(0);
        _host.PermissionChecks.Should().Be(1);
    }

    [Fact]
    public async Task C19_an_upload_aborted_halfway_never_reaches_the_service()
    {
        using var cancel = new CancellationTokenSource();
        var content = Form(50 * MiB, afterBytes: 25 * MiB, onReached: cancel.Cancel);

        var send = () => _host.Client.PostAsync(Route, content, cancel.Token);

        await send.Should().ThrowAsync<OperationCanceledException>();
        // Give the server time to observe the aborted connection and finish the request.
        await Task.Delay(500);
        _host.ServiceCalls.Should().Be(0);
    }

    [Fact]
    public void C13_the_limits_sit_on_the_local_upload_action_only()
    {
        var action = typeof(FileController).GetMethod(nameof(FileController.UploadFileToLocalStorage))!;

        action.GetCustomAttribute<RequestSizeLimitAttribute>().Should().NotBeNull();
        RequestSizeLimitOf(action).Should().Be(Constants.LocalUploadMaxRequestBodyInBytes);
        action.GetCustomAttribute<RequestFormLimitsAttribute>()!.MultipartBodyLengthLimit.Should().Be(Constants.LocalUploadMaxRequestBodyInBytes);
        action.GetCustomAttribute<RequestBodyTooLargeFilterAttribute>().Should().NotBeNull();

        var limited = typeof(FileController).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t))
            .SelectMany(t => t.GetMethods().Cast<MemberInfo>().Append(t))
            .Where(m => m.GetCustomAttribute<RequestSizeLimitAttribute>() is not null
                        || m.GetCustomAttribute<RequestFormLimitsAttribute>() is not null
                        || m.GetCustomAttribute<DisableRequestSizeLimitAttribute>() is not null)
            .Select(m => m.Name);
        limited.Should().Equal(nameof(FileController.UploadFileToLocalStorage));

        typeof(DataGatewayController).GetCustomAttribute<RestRequestSizeLimitAttribute>().Should().NotBeNull();
    }

    private static long RequestSizeLimitOf(MethodInfo action)
    {
        // The attribute keeps its limit in a private field; reading it pins the constructor argument.
        var field = typeof(RequestSizeLimitAttribute).GetField("_bytes", BindingFlags.Instance | BindingFlags.NonPublic)!;
        return (long)field.GetValue(action.GetCustomAttribute<RequestSizeLimitAttribute>())!;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.Clone();
    }

    private static MultipartFormDataContent Form(long fileLength, long afterBytes = -1, Action? onReached = null)
    {
        var file = new GeneratedContent(fileLength, afterBytes, onReached);
        file.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        return new MultipartFormDataContent
        {
            { new StringContent("report.txt"), "Name" },
            { new StringContent("dir-1"), "ParentDirectoryId" },
            { new StringContent("[]"), "Tags" },
            { new StringContent("{}"), "MetaData" },
            { file, "File", "report.txt" },
        };
    }

    /// <summary>Streams <c>length</c> bytes from one reused buffer, optionally running a callback once <c>afterBytes</c> were sent.</summary>
    private sealed class GeneratedContent(long length, long afterBytes, Action? onReached) : HttpContent
    {
        protected override async Task SerializeToStreamAsync(Stream stream, TransportContext? context) =>
            await SerializeToStreamAsync(stream, context, CancellationToken.None);

        protected override async Task SerializeToStreamAsync(Stream stream, TransportContext? context, CancellationToken cancellationToken)
        {
            var buffer = new byte[81_920];
            Array.Fill(buffer, (byte)'a');
            for (long sent = 0; sent < length;)
            {
                if (afterBytes >= 0 && sent >= afterBytes)
                {
                    onReached?.Invoke();
                    cancellationToken.ThrowIfCancellationRequested();
                }
                var count = (int)Math.Min(buffer.Length, length - sent);
                await stream.WriteAsync(buffer.AsMemory(0, count), cancellationToken);
                sent += count;
            }
        }

        protected override bool TryComputeLength(out long computed)
        {
            computed = length;
            return true;
        }
    }

    /// <summary>A Kestrel host on a loopback port with <see cref="FileController"/> and a recording service.</summary>
    public sealed class Host : IAsyncLifetime
    {
        private WebApplication? _app;
        private int _serviceCalls;
        private int _permissionChecks;
        private readonly List<long> _receivedLengths = [];

        public HttpClient Client { get; private set; } = null!;
        public bool DenyPermission { get; set; }
        public int ServiceCalls => Volatile.Read(ref _serviceCalls);
        public int PermissionChecks => Volatile.Read(ref _permissionChecks);
        public IReadOnlyList<long> ReceivedLengths { get { lock (_receivedLengths) return _receivedLengths.ToList(); } }

        public void Reset()
        {
            DenyPermission = false;
            Interlocked.Exchange(ref _serviceCalls, 0);
            Interlocked.Exchange(ref _permissionChecks, 0);
            lock (_receivedLengths) _receivedLengths.Clear();
        }

        public async Task InitializeAsync()
        {
            var service = new Mock<IFileManagementService>();
            service
                .Setup(s => s.UploadFileToLocalStorageAsync(It.IsAny<LocalStorageUploadRequest>()))
                .ReturnsAsync((LocalStorageUploadRequest request) =>
                {
                    Interlocked.Increment(ref _serviceCalls);
                    lock (_receivedLengths) _receivedLengths.Add(request.File.Length);
                    return new LocalStorageUploadResponse { IsSuccess = true, FileId = "file-1", FileVersion = 1 };
                });

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = Environments.Production });
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            builder.Logging.ClearProviders();
            builder.Services.AddSingleton(service.Object);
            builder.Services.AddSingleton(Mock.Of<IFileService>());
            // [ProtectedEndPoint] names Genesis' "Protected" policy; the permission itself is the resource filter's job below.
            builder.Services.AddAuthorization(options => options.AddPolicy("Protected", policy => policy.RequireAssertion(_ => true)));
            // Stands in for Genesis' global ProtectedEndPointResourceFilter: a global resource filter, so it runs before binding.
            builder.Services.AddControllers(options => options.Filters.Add(new PermissionStandIn(this)))
                .AddApplicationPart(typeof(FileController).Assembly);
            // Every Api controller is routed; the gateway routes need their constraint even though these tests never call them.
            builder.Services.Configure<RouteOptions>(options =>
                options.ConstraintMap[SchemaNameRouteConstraint.Name] = typeof(SchemaNameRouteConstraint));

            _app = builder.Build();
            _app.MapControllers();
            await _app.StartAsync();

            Client = new HttpClient { BaseAddress = new Uri(_app.Urls.First()), Timeout = TimeSpan.FromMinutes(2) };
        }

        public async Task DisposeAsync()
        {
            Client.Dispose();
            if (_app is not null)
                await _app.DisposeAsync();
        }

        private sealed class PermissionStandIn(Host host) : IResourceFilter
        {
            public void OnResourceExecuting(ResourceExecutingContext context)
            {
                Interlocked.Increment(ref host._permissionChecks);
                if (host.DenyPermission)
                    context.Result = new StatusCodeResult(StatusCodes.Status403Forbidden);
            }

            public void OnResourceExecuted(ResourceExecutedContext context)
            {
            }
        }
    }
}

/// <summary>Runs <see cref="LocalUploadRequestLimitTests"/> alone, so its process-wide allocation count sees only its own upload.</summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class LocalUploadHostCollection
{
    public const string Name = "LocalUploadHost";
}
