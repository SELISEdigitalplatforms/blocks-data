using System.Text.Json;
using System.Text.RegularExpressions;
using Blocks.Genesis;
using Blocks.Genesis.Entities.Data;
using FluentAssertions;
using Moq;
using StackExchange.Redis;
using Storage.DomainService.Storage.ZipDownload;

namespace XUnitTest.Storage;

public class ZipTicketStoreTests
{
    // A well-formed ticket id: 22 base64url characters.
    private const string TicketId = "AAAAAAAAAAAAAAAAAAAAAA";

    private readonly Mock<ICacheClient> _cache = new();
    private readonly Mock<IDatabase> _database = new();
    private readonly ZipTicketStore _store;

    public ZipTicketStoreTests()
    {
        _cache.Setup(c => c.CacheDatabase()).Returns(_database.Object);
        SetupStringSet(true);
        _store = new ZipTicketStore(_cache.Object);
    }

    private void SetupStringSet(bool stored, Action<RedisValue>? onSet = null) =>
        _database
            .Setup(d => d.StringSetAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan?>(), It.IsAny<When>(), It.IsAny<CommandFlags>()))
            .Callback<RedisKey, RedisValue, TimeSpan?, When, CommandFlags>((_, v, _, _, _) => onSet?.Invoke(v))
            .ReturnsAsync(stored);

    private static ZipTicket SampleTicket() => new()
    {
        TenantId = "tenant-1",
        ConfigurationName = "default",
        UserId = "user-1",
        ZipName = "archive.zip",
        Entries =
        {
            new ZipTicketEntry { Kind = ZipEntryKind.Folder, ZipPath = "docs/" },
            new ZipTicketEntry
            {
                Kind = ZipEntryKind.File,
                ZipPath = "docs/a.txt",
                Source = new ZipSourceFile
                {
                    FileId = "file-1",
                    Name = "a.txt",
                    VersionId = "ver-1",
                    VersionNo = 3,
                    StorageKey = "k/a.txt",
                    AccessModifier = AccessModifier.Private,
                    SizeInBytes = 42,
                    TenantId = "tenant-1"
                }
            }
        }
    };

    [Fact]
    public async Task Save_stores_json_under_prefixed_key_with_120s_ttl_in_one_atomic_set()
    {
        var id = await _store.SaveAsync(SampleTicket());

        Regex.IsMatch(id, "^[A-Za-z0-9_-]{22}$").Should().BeTrue();
        // One SET carrying the expiry (never SET then a separate EXPIRE), and only if the key is new.
        _database.Verify(d => d.StringSetAsync(
            It.Is<RedisKey>(k => k == (RedisKey)("zipdl:" + id)),
            It.Is<RedisValue>(v => v.ToString().Contains("tenant-1")),
            TimeSpan.FromSeconds(120),
            When.NotExists,
            It.IsAny<CommandFlags>()), Times.Once);
        _cache.Verify(c => c.AddStringValueAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<long>()), Times.Never);
    }

    [Fact]
    public async Task Save_throws_when_the_ticket_was_not_stored()
    {
        SetupStringSet(false);

        var act = () => _store.SaveAsync(SampleTicket());

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("zip ticket could not be stored");
    }

    [Fact]
    public async Task Save_generates_distinct_ids()
    {
        var a = await _store.SaveAsync(SampleTicket());
        var b = await _store.SaveAsync(SampleTicket());
        a.Should().NotBe(b);
    }

    [Fact]
    public async Task Take_reads_and_deletes_in_one_call()
    {
        RedisValue saved = RedisValue.Null;
        SetupStringSet(true, v => saved = v);
        await _store.SaveAsync(SampleTicket());
        _database.Setup(d => d.StringGetDeleteAsync("zipdl:" + TicketId, CommandFlags.None))
            .ReturnsAsync(saved);

        var ticket = await _store.TakeAsync(TicketId);

        ticket.Should().NotBeNull();
        ticket!.TenantId.Should().Be("tenant-1");
        ticket.ZipName.Should().Be("archive.zip");
        ticket.Entries.Should().HaveCount(2);
        ticket.Entries[0].Kind.Should().Be(ZipEntryKind.Folder);
        ticket.Entries[1].Source!.FileId.Should().Be("file-1");
        ticket.Entries[1].Source!.AccessModifier.Should().Be(AccessModifier.Private);
        ticket.Entries[1].Source!.VersionNo.Should().Be(3);
        _database.Verify(d => d.StringGetDeleteAsync("zipdl:" + TicketId, CommandFlags.None), Times.Once);
    }

    [Fact]
    public async Task Take_returns_null_for_unknown_ticket()
    {
        _database.Setup(d => d.StringGetDeleteAsync(It.IsAny<RedisKey>(), CommandFlags.None))
            .ReturnsAsync(RedisValue.Null);

        (await _store.TakeAsync(TicketId)).Should().BeNull();
    }

    [Theory]
    [InlineData("../x")]
    [InlineData("")]
    public async Task Take_returns_null_for_malformed_ticket_without_calling_redis(string ticket)
    {
        (await _store.TakeAsync(ticket)).Should().BeNull();
        _cache.Verify(c => c.CacheDatabase(), Times.Never);
        _database.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Take_returns_null_for_overlong_ticket_without_calling_redis()
    {
        (await _store.TakeAsync(new string('a', 300))).Should().BeNull();
        _cache.Verify(c => c.CacheDatabase(), Times.Never);
        _database.VerifyNoOtherCalls();
    }
}
