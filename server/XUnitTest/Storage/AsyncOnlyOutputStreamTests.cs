using FluentAssertions;
using Storage.DomainService.Storage.ZipDownload;

namespace XUnitTest.Storage;

/// <summary>
/// The adapter that keeps a zip write fully asynchronous: synchronous writes are queued and sent, in order, ahead of
/// the next asynchronous write or flush, so an output that rejects synchronous IO never sees one.
/// </summary>
public class AsyncOnlyOutputStreamTests
{
    [Fact]
    public async Task Sync_writes_are_queued_not_forwarded()
    {
        var output = new StrictAsyncStream();
        await using var sut = new AsyncOnlyOutputStream(output);

        sut.Write([1, 2], 0, 2);
        sut.Write(new ReadOnlySpan<byte>([3]));
        sut.WriteByte(4);
        sut.Flush();

        output.Writes.Should().BeEmpty();
        output.Flushes.Should().Be(0);
        sut.PendingCount.Should().Be(4);
    }

    [Fact]
    public async Task Next_async_write_sends_queued_bytes_first_and_in_order()
    {
        var output = new StrictAsyncStream();
        await using var sut = new AsyncOnlyOutputStream(output);

        sut.Write([1, 2], 0, 2);
        sut.WriteByte(3);
        await sut.WriteAsync(new byte[] { 4, 5 });
        await sut.WriteAsync(new byte[] { 6 });

        output.Writes.Should().HaveCount(3);
        output.Writes[0].Should().Equal(1, 2, 3);
        output.Writes[1].Should().Equal(4, 5);
        output.Writes[2].Should().Equal(6);
        sut.PendingCount.Should().Be(0);
    }

    [Fact]
    public async Task Array_overload_of_async_write_also_sends_the_queue_first()
    {
        var output = new StrictAsyncStream();
        await using var sut = new AsyncOnlyOutputStream(output);

        sut.WriteByte(1);
        await sut.WriteAsync([0, 2, 3], 1, 2, CancellationToken.None);

        output.Bytes.Should().Equal(1, 2, 3);
    }

    [Fact]
    public async Task Async_flush_drains_the_queue_then_flushes_the_output()
    {
        var output = new StrictAsyncStream();
        await using var sut = new AsyncOnlyOutputStream(output);

        sut.Write([7, 8, 9], 0, 3);
        await sut.FlushAsync(CancellationToken.None);

        output.Bytes.Should().Equal(7, 8, 9);
        output.Flushes.Should().Be(1);
        sut.PendingCount.Should().Be(0);
    }

    [Fact]
    public async Task Queue_grows_past_its_initial_size_and_keeps_order()
    {
        var output = new StrictAsyncStream();
        await using var sut = new AsyncOnlyOutputStream(output);
        var data = Enumerable.Range(0, 2_000).Select(i => (byte)i).ToArray();

        sut.Write(data, 0, 1_000);
        sut.Write(data, 1_000, 1_000);
        await sut.FlushAsync(CancellationToken.None);

        output.Bytes.Should().Equal(data);
    }

    [Fact]
    public async Task Disposing_does_not_send_queued_bytes_or_dispose_the_output()
    {
        var output = new StrictAsyncStream();
        var sut = new AsyncOnlyOutputStream(output);

        sut.WriteByte(1);
        await sut.DisposeAsync();

        output.Writes.Should().BeEmpty();
        output.Disposed.Should().BeFalse();
    }

    [Fact]
    public async Task Is_write_only_and_not_seekable()
    {
        await using var sut = new AsyncOnlyOutputStream(new StrictAsyncStream());

        sut.CanRead.Should().BeFalse();
        sut.CanSeek.Should().BeFalse();
        sut.CanWrite.Should().BeTrue();
        FluentActions.Invoking(() => sut.Length).Should().Throw<NotSupportedException>();
        FluentActions.Invoking(() => sut.Position).Should().Throw<NotSupportedException>();
        FluentActions.Invoking(() => sut.Seek(0, SeekOrigin.Begin)).Should().Throw<NotSupportedException>();
        FluentActions.Invoking(() => sut.Read(new byte[1], 0, 1)).Should().Throw<NotSupportedException>();
    }

    /// <summary>Records each asynchronous write and flush; throws on any synchronous write or flush, like Kestrel.</summary>
    private sealed class StrictAsyncStream : Stream
    {
        public List<byte[]> Writes { get; } = new();
        public int Flushes { get; private set; }
        public bool Disposed { get; private set; }
        public byte[] Bytes => Writes.SelectMany(w => w).ToArray();

        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => true;
        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override void Flush() => throw new InvalidOperationException("sync flush");

        public override Task FlushAsync(CancellationToken cancellationToken)
        {
            Flushes++;
            return Task.CompletedTask;
        }

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            Writes.Add(buffer.ToArray());
            return ValueTask.CompletedTask;
        }

        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
            => WriteAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

        public override void Write(byte[] buffer, int offset, int count) => throw new InvalidOperationException("sync write");
        public override void Write(ReadOnlySpan<byte> buffer) => throw new InvalidOperationException("sync write");
        public override void WriteByte(byte value) => throw new InvalidOperationException("sync write");
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            Disposed = true;
            base.Dispose(disposing);
        }
    }
}
