using MongoDB.Bson;
using MongoDB.Bson.IO;
using MongoDB.Bson.Serialization;

namespace DataGateway.DomainService.Helpers;

/// <summary>
/// The encoded size of a document, as recorded in the request log. Serializes the document exactly
/// as <c>document.ToBson()</c> does (same serializer, same writer settings) but into a stream that
/// only counts, so a large response is not copied into a byte array just to be measured.
/// </summary>
internal static class BsonSize
{
    public static int Of(BsonDocument document)
    {
        using var stream = new CountingStream();
        using (var writer = new BsonBinaryWriter(stream, BsonBinaryWriterSettings.Defaults))
        {
            var serializer = BsonSerializer.LookupSerializer(typeof(BsonDocument));
            var context = BsonSerializationContext.CreateRoot(writer);
            serializer.Serialize(context, new BsonSerializationArgs { NominalType = typeof(BsonDocument) }, document);
        }
        return checked((int)stream.Length);
    }

    /// <summary>
    /// A seekable stream that keeps no bytes. The BSON writer seeks back to fill in each document's
    /// length once it is known, so overwrites must not count twice: the length is the furthest
    /// position written.
    /// </summary>
    private sealed class CountingStream : Stream
    {
        private long _length;
        private long _position;

        public override bool CanRead => false;
        public override bool CanSeek => true;
        public override bool CanWrite => true;
        public override long Length => _length;

        public override long Position
        {
            get => _position;
            set => _position = value;
        }

        public override void Write(byte[] buffer, int offset, int count) => Advance(count);

        public override void Write(ReadOnlySpan<byte> buffer) => Advance(buffer.Length);

        public override void WriteByte(byte value) => Advance(1);

        public override long Seek(long offset, SeekOrigin origin)
        {
            _position = origin switch
            {
                SeekOrigin.Begin => offset,
                SeekOrigin.Current => _position + offset,
                SeekOrigin.End => _length + offset,
                _ => throw new ArgumentOutOfRangeException(nameof(origin)),
            };
            return _position;
        }

        public override void SetLength(long value)
        {
            _length = value;
            _position = Math.Min(_position, value);
        }

        public override void Flush()
        {
        }

        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        private void Advance(int count)
        {
            _position += count;
            _length = Math.Max(_length, _position);
        }
    }
}
