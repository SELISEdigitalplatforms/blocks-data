using System.Runtime.CompilerServices;

[assembly: InternalsVisibleTo("XUnitTest")]

namespace Storage.DomainService.Storage.ZipDownload;

/// <summary>
/// Keeps a zip write fully asynchronous over an output that rejects synchronous IO, such as Kestrel's response body.
/// <see cref="System.IO.Compression.ZipArchive"/> still writes a few small records synchronously even through its
/// async API: an entry's data descriptor when its stream is disposed, and an unopened entry's local header when the
/// next entry is created. Those synchronous writes are queued here and sent, in order, ahead of the next
/// <see cref="WriteAsync(ReadOnlyMemory{byte}, CancellationToken)"/> or <see cref="FlushAsync(CancellationToken)"/>.
/// The queue only ever holds local headers and data descriptors, but folder entries are never opened, so the local
/// headers of a run of folders pile up here until the next file's data is written. It is therefore bounded by the
/// folder cap (<see cref="ZipDownloadLimits.MaxFolders"/>), at roughly 30 bytes plus the entry path per folder. The
/// output is never disposed by this wrapper.
/// </summary>
internal sealed class AsyncOnlyOutputStream : Stream
{
    private readonly Stream _output;
    private byte[] _pending = new byte[512];
    private int _pendingCount;

    public AsyncOnlyOutputStream(Stream output)
    {
        ArgumentNullException.ThrowIfNull(output);
        _output = output;
    }

    /// <summary>Bytes written synchronously and not yet sent to the output.</summary>
    internal int PendingCount => _pendingCount;

    public override bool CanRead => false;
    public override bool CanSeek => false;
    public override bool CanWrite => true;
    public override long Length => throw new NotSupportedException();

    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    public override void Write(byte[] buffer, int offset, int count)
    {
        ValidateBufferArguments(buffer, offset, count);
        Write(buffer.AsSpan(offset, count));
    }

    public override void Write(ReadOnlySpan<byte> buffer)
    {
        EnsurePendingCapacity(buffer.Length);
        buffer.CopyTo(_pending.AsSpan(_pendingCount));
        _pendingCount += buffer.Length;
    }

    public override void WriteByte(byte value)
    {
        EnsurePendingCapacity(1);
        _pending[_pendingCount++] = value;
    }

    /// <summary>A no-op: queued bytes are sent by the next asynchronous write or flush.</summary>
    public override void Flush()
    {
    }

    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        await DrainAsync(cancellationToken).ConfigureAwait(false);
        await _output.WriteAsync(buffer, cancellationToken).ConfigureAwait(false);
    }

    public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        ValidateBufferArguments(buffer, offset, count);
        return WriteAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
    }

    public override async Task FlushAsync(CancellationToken cancellationToken)
    {
        await DrainAsync(cancellationToken).ConfigureAwait(false);
        await _output.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();

    private async ValueTask DrainAsync(CancellationToken cancellationToken)
    {
        if (_pendingCount == 0)
        {
            return;
        }

        await _output.WriteAsync(_pending.AsMemory(0, _pendingCount), cancellationToken).ConfigureAwait(false);
        _pendingCount = 0;
    }

    private void EnsurePendingCapacity(int additional)
    {
        var required = _pendingCount + additional;
        if (required <= _pending.Length)
        {
            return;
        }

        Array.Resize(ref _pending, Math.Max(required, _pending.Length * 2));
    }
}
