using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Blocks.Genesis;
using StackExchange.Redis;

namespace Storage.DomainService.Storage.ZipDownload;

/// <summary>Holds the resolved download behind an unguessable, single-use ticket.</summary>
public interface IZipTicketStore
{
    /// <summary>
    /// Stores the ticket for <see cref="ZipDownloadLimits.TicketTtlSeconds"/> seconds and returns its id.
    /// </summary>
    /// <exception cref="InvalidOperationException">The ticket was not stored.</exception>
    Task<string> SaveAsync(ZipTicket ticket);

    /// <summary>Atomically reads and removes the ticket; null when unknown, expired, already used or malformed.</summary>
    Task<ZipTicket?> TakeAsync(string ticket);
}

public sealed partial class ZipTicketStore : IZipTicketStore
{
    private const string KeyPrefix = "zipdl:";

    private static readonly JsonSerializerOptions JsonOptions = new();

    private readonly ICacheClient _cache;

    public ZipTicketStore(ICacheClient cache)
    {
        _cache = cache;
    }

    [GeneratedRegex("^[A-Za-z0-9_-]{22}$")]
    private static partial Regex TicketPattern();

    public async Task<string> SaveAsync(ZipTicket ticket)
    {
        var id = Base64Url(RandomNumberGenerator.GetBytes(16));
        var json = JsonSerializer.Serialize(ticket, JsonOptions);

        // One SET with the expiry (SET then a separate EXPIRE could leave a ticket that never expires), and only
        // when the key is new, so a stored ticket is never silently overwritten.
        var stored = await _cache.CacheDatabase()
            .StringSetAsync(KeyPrefix + id, json, TimeSpan.FromSeconds(ZipDownloadLimits.TicketTtlSeconds), When.NotExists, CommandFlags.None)
            .ConfigureAwait(false);
        if (!stored)
        {
            throw new InvalidOperationException("zip ticket could not be stored");
        }

        return id;
    }

    public async Task<ZipTicket?> TakeAsync(string ticket)
    {
        if (string.IsNullOrEmpty(ticket) || !TicketPattern().IsMatch(ticket))
        {
            return null;
        }

        // GETDEL is atomic, so two concurrent requests can never both receive the ticket.
        var value = await _cache.CacheDatabase()
            .StringGetDeleteAsync(KeyPrefix + ticket, CommandFlags.None)
            .ConfigureAwait(false);

        if (value.IsNullOrEmpty)
        {
            return null;
        }

        return JsonSerializer.Deserialize<ZipTicket>(value.ToString(), JsonOptions);
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
