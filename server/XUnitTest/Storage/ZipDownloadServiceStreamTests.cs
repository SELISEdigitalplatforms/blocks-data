using System.IO.Compression;
using System.Text.Json;
using Blocks.Genesis.Entities.Data;
using DomainService.Configuration;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;
using Storage.DomainService.Services;
using Storage.DomainService.Storage.ZipDownload;
using XUnitTest.Infrastructure;

namespace XUnitTest.Storage;

/// <summary>
/// The stream half of the zip download: taking the single-use ticket and writing its entries as a zip
/// straight into a non-seekable output, one provider stream at a time.
/// </summary>
public class ZipDownloadServiceStreamTests : IDisposable
{
    private readonly Mock<IFileManagementService> _files = new();
    private readonly Mock<IZipTicketStore> _store = new();
    private readonly Mock<IStorageConfigurationProvider> _configurations = new();
    private readonly RecordingLoggerProvider _logs = new();
    private readonly StorageConfiguration _configuration = new() { StorageStrategy = "AWS" };

    public ZipDownloadServiceStreamTests()
    {
        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1");

        _configurations
            .Setup(c => c.GetByNameAsync("Default", It.IsAny<CancellationToken>()))
            .ReturnsAsync(_configuration);
    }

    public void Dispose()
    {
        BlocksTestContext.Clear();
        _logs.Dispose();
        GC.SuppressFinalize(this);
    }

    private ZipDownloadService CreateSut() => new(
        Mock.Of<IFileDirectoryRepository>(),
        Mock.Of<IObjectAccessResolver>(),
        Mock.Of<IObjectListingService>(),
        _files.Object,
        _store.Object,
        _configurations.Object,
        _logs.CreateLogger<ZipDownloadService>());

    private static ZipSourceFile Source(string id, string name) => new()
    {
        FileId = id,
        Name = name,
        VersionId = "v-" + id,
        VersionNo = 1,
        SizeInBytes = 10,
        TenantId = "tenant-1",
    };

    private static ZipTicket Ticket(string tenantId = "tenant-1") => new()
    {
        TenantId = tenantId,
        ConfigurationName = "Default",
        UserId = "user-1",
        ZipName = "Docs.zip",
        Entries =
        [
            new ZipTicketEntry { Kind = ZipEntryKind.Folder, ZipPath = "Docs/" },
            new ZipTicketEntry { Kind = ZipEntryKind.File, ZipPath = "Docs/x.txt", Source = Source("f1", "x.txt") },
            new ZipTicketEntry { Kind = ZipEntryKind.File, ZipPath = "a.pdf", Source = Source("f2", "a.pdf") },
        ],
    };

    private void SetSource(string fileId, Stream? stream)
        => _files
            .Setup(f => f.OpenZipSourceAsync(It.Is<ZipSourceFile>(s => s.FileId == fileId), _configuration, It.IsAny<CancellationToken>()))
            .ReturnsAsync(stream);

    private static byte[] Bytes(int length, int seed)
    {
        var bytes = new byte[length];
        new Random(seed).NextBytes(bytes);
        return bytes;
    }

    private static byte[] ReadEntry(ZipArchiveEntry entry)
    {
        using var stream = entry.Open();
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return copy.ToArray();
    }

    [Fact]
    public async Task Take_returns_the_ticket_of_the_request_tenant()
    {
        var ticket = Ticket();
        _store.Setup(s => s.TakeAsync("t-1")).ReturnsAsync(ticket);

        var result = await CreateSut().TakeTicketAsync("t-1", CancellationToken.None);

        result.Should().BeSameAs(ticket);
    }

    [Fact]
    public async Task Take_rejects_a_ticket_from_another_tenant()
    {
        _store.Setup(s => s.TakeAsync("t-1")).ReturnsAsync(Ticket(tenantId: "tenant-2"));

        var result = await CreateSut().TakeTicketAsync("t-1", CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Take_rejects_a_ticket_when_the_request_has_no_tenant()
    {
        BlocksTestContext.Clear();
        _store.Setup(s => s.TakeAsync("t-1")).ReturnsAsync(Ticket(tenantId: string.Empty));

        var result = await CreateSut().TakeTicketAsync("t-1", CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Take_returns_null_for_a_missing_ticket()
    {
        _store.Setup(s => s.TakeAsync(It.IsAny<string>())).ReturnsAsync((ZipTicket?)null);

        var result = await CreateSut().TakeTicketAsync("t-1", CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Take_treats_a_corrupt_stored_ticket_as_missing()
    {
        _store.Setup(s => s.TakeAsync("t-1")).ThrowsAsync(new JsonException("bad json"));

        var result = await CreateSut().TakeTicketAsync("t-1", CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Writes_folders_and_files_into_a_non_seekable_stream()
    {
        var x = Bytes(200_000, seed: 1);
        var a = Bytes(1_234, seed: 2);
        SetSource("f1", new TrackingStream(x));
        SetSource("f2", new TrackingStream(a));
        using var inner = new MemoryStream();

        var result = await CreateSut().WriteZipAsync(Ticket(), new NonSeekableStream(inner), CancellationToken.None);

        result.Should().Be(new ZipWriteResult(3, 0));
        inner.Position = 0;
        using var zip = new ZipArchive(inner, ZipArchiveMode.Read);
        zip.Entries.Select(e => e.FullName).Should().Equal("Docs/", "Docs/x.txt", "a.pdf");
        ReadEntry(zip.GetEntry("Docs/x.txt")!).Should().Equal(x);
        ReadEntry(zip.GetEntry("a.pdf")!).Should().Equal(a);
        zip.Entries.Should().OnlyContain(e => e.CompressedLength == e.Length);
        _files.Verify(f => f.OpenZipSourceAsync(It.IsAny<ZipSourceFile>(), _configuration, It.IsAny<CancellationToken>()), Times.Exactly(2));

        var summary = _logs.Logs.Should().ContainSingle(l => l.Level == LogLevel.Information).Subject;
        summary.Field("EntriesWritten").Should().Be(3);
        summary.Field("EntriesSkipped").Should().Be(0);
        summary.Fields.Should().ContainKey("ElapsedMs");
    }

    [Fact]
    public async Task Writes_and_disposes_every_source()
    {
        var first = new TrackingStream(Bytes(10, seed: 1));
        var second = new TrackingStream(Bytes(10, seed: 2));
        SetSource("f1", first);
        SetSource("f2", second);

        await CreateSut().WriteZipAsync(Ticket(), new NonSeekableStream(new MemoryStream()), CancellationToken.None);

        first.Disposed.Should().BeTrue();
        second.Disposed.Should().BeTrue();
    }

    [Fact]
    public async Task Source_that_cannot_be_opened_is_skipped()
    {
        SetSource("f1", new TrackingStream(Bytes(10, seed: 1)));
        SetSource("f2", null);
        using var inner = new MemoryStream();

        var result = await CreateSut().WriteZipAsync(Ticket(), new NonSeekableStream(inner), CancellationToken.None);

        result.Should().Be(new ZipWriteResult(2, 1));
        inner.Position = 0;
        using var zip = new ZipArchive(inner, ZipArchiveMode.Read);
        zip.Entries.Select(e => e.FullName).Should().Equal("Docs/", "Docs/x.txt");

        var warning = _logs.Logs.Should().ContainSingle(l => l.Level == LogLevel.Warning).Subject;
        warning.Field("FileId").Should().Be("f2");
        warning.Fields.Should().ContainKey("Reason");
        warning.AllText().Should().NotContain("a.pdf");
    }

    [Fact]
    public async Task Source_failing_before_its_first_byte_is_skipped()
    {
        var failing = new TrackingStream(Bytes(10, seed: 1), failAfterBytes: 0);
        SetSource("f1", failing);
        SetSource("f2", new TrackingStream(Bytes(10, seed: 2)));
        using var inner = new MemoryStream();

        var result = await CreateSut().WriteZipAsync(Ticket(), new NonSeekableStream(inner), CancellationToken.None);

        result.Should().Be(new ZipWriteResult(2, 1));
        failing.Disposed.Should().BeTrue();
        inner.Position = 0;
        using var zip = new ZipArchive(inner, ZipArchiveMode.Read);
        zip.Entries.Select(e => e.FullName).Should().Equal("Docs/", "a.pdf");
    }

    [Fact]
    public async Task Source_failing_mid_copy_throws_ZipEntryCopyException()
    {
        var failing = new TrackingStream(Bytes(100, seed: 1), failAfterBytes: 10);
        SetSource("f1", failing);
        SetSource("f2", new TrackingStream(Bytes(10, seed: 2)));
        using var inner = new MemoryStream();

        var act = () => CreateSut().WriteZipAsync(Ticket(), new NonSeekableStream(inner), CancellationToken.None);

        var thrown = await act.Should().ThrowAsync<ZipEntryCopyException>();
        thrown.Which.FileId.Should().Be("f1");
        thrown.Which.InnerException.Should().BeOfType<IOException>();
        failing.Disposed.Should().BeTrue();
        _files.Verify(f => f.OpenZipSourceAsync(It.Is<ZipSourceFile>(s => s.FileId == "f2"), It.IsAny<StorageConfiguration>(), It.IsAny<CancellationToken>()), Times.Never);

        // The archive is abandoned, never finished: no central directory, so it is not a silently truncated valid zip.
        inner.Position = 0;
        var read = () => new ZipArchive(inner, ZipArchiveMode.Read, leaveOpen: true);
        read.Should().Throw<InvalidDataException>();
    }

    [Fact]
    public async Task Cancellation_stops_writing_and_disposes_the_open_source()
    {
        using var cts = new CancellationTokenSource();
        var first = new TrackingStream(Bytes(200_000, seed: 1), onRead: () => cts.Cancel());
        SetSource("f1", first);
        SetSource("f2", new TrackingStream(Bytes(10, seed: 2)));

        var act = () => CreateSut().WriteZipAsync(Ticket(), new NonSeekableStream(new MemoryStream()), cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
        first.Disposed.Should().BeTrue();
        _files.Verify(f => f.OpenZipSourceAsync(It.Is<ZipSourceFile>(s => s.FileId == "f2"), It.IsAny<StorageConfiguration>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Source_failing_mid_copy_because_the_client_left_is_a_cancellation()
    {
        // Providers often surface a cancelled read as their own exception (here IOException), not as an OCE.
        using var cts = new CancellationTokenSource();
        var reads = 0;
        var failing = new TrackingStream(Bytes(100, seed: 1), failAfterBytes: 10, onRead: () =>
        {
            if (++reads == 2) cts.Cancel();
        });
        SetSource("f1", failing);
        SetSource("f2", new TrackingStream(Bytes(10, seed: 2)));

        var act = () => CreateSut().WriteZipAsync(Ticket(), new NonSeekableStream(new MemoryStream()), cts.Token);

        var thrown = await act.Should().ThrowAsync<OperationCanceledException>();
        thrown.Which.Should().NotBeOfType<ZipEntryCopyException>();
        failing.Disposed.Should().BeTrue();
    }

    [Fact]
    public async Task Source_failing_before_its_first_byte_because_the_client_left_is_a_cancellation_not_a_skip()
    {
        using var cts = new CancellationTokenSource();
        var failing = new TrackingStream(Bytes(10, seed: 1), failAfterBytes: 0, onRead: () => cts.Cancel());
        SetSource("f1", failing);
        SetSource("f2", new TrackingStream(Bytes(10, seed: 2)));

        var act = () => CreateSut().WriteZipAsync(Ticket(), new NonSeekableStream(new MemoryStream()), cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
        _logs.Logs.Should().NotContain(l => l.Message.Contains("entry-skipped"));
    }

    [Fact]
    public async Task Missing_configuration_throws_before_writing_anything()
    {
        _configurations
            .Setup(c => c.GetByNameAsync("Default", It.IsAny<CancellationToken>()))
            .ReturnsAsync((StorageConfiguration?)null);
        using var inner = new MemoryStream();

        var act = () => CreateSut().WriteZipAsync(Ticket(), new NonSeekableStream(inner), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>();
        inner.Length.Should().Be(0);
        _files.Verify(f => f.OpenZipSourceAsync(It.IsAny<ZipSourceFile>(), It.IsAny<StorageConfiguration>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// A write-only stream that, like Kestrel's response body without AllowSynchronousIO, cannot seek or report its
    /// position or length and rejects every synchronous write or flush.
    /// </summary>
    private sealed class NonSeekableStream(Stream inner) : Stream
    {
        private const string SyncIoMessage = "Synchronous operations are disallowed.";

        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => true;
        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override void Flush() => throw new InvalidOperationException(SyncIoMessage);
        public override Task FlushAsync(CancellationToken cancellationToken) => inner.FlushAsync(cancellationToken);
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new InvalidOperationException(SyncIoMessage);
        public override void Write(ReadOnlySpan<byte> buffer) => throw new InvalidOperationException(SyncIoMessage);
        public override void WriteByte(byte value) => throw new InvalidOperationException(SyncIoMessage);

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
            => inner.WriteAsync(buffer, cancellationToken);

        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
            => inner.WriteAsync(buffer, offset, count, cancellationToken);
    }

    /// <summary>
    /// A provider stream stand-in: serves <c>data</c>, records disposal, can throw <see cref="IOException"/> once
    /// <c>failAfterBytes</c> bytes were served, and can run a callback before every read.
    /// </summary>
    private sealed class TrackingStream(byte[] data, int? failAfterBytes = null, Action? onRead = null) : Stream
    {
        private int _position;

        public bool Disposed { get; private set; }

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override void Flush()
        {
        }

        public override int Read(byte[] buffer, int offset, int count) => Read(buffer.AsSpan(offset, count));

        public override int Read(Span<byte> buffer)
        {
            onRead?.Invoke();
            if (failAfterBytes is { } limit && _position >= limit)
            {
                throw new IOException("connection reset");
            }

            var available = data.Length - _position;
            if (failAfterBytes is { } cap) available = Math.Min(available, cap - _position);
            var count = Math.Min(Math.Min(buffer.Length, available), 4_096);
            data.AsSpan(_position, count).CopyTo(buffer);
            _position += count;
            return count;
        }

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return ValueTask.FromResult(Read(buffer.Span));
        }

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
            => ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            Disposed = true;
            base.Dispose(disposing);
        }
    }
}
