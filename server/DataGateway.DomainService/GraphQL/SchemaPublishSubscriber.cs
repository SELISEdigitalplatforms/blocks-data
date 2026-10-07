using System.Text.Json;
using Blocks.Genesis;
using DataGateway.DomainService.Services;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace DataGateway.DomainService.GraphQL;

/// <summary>
/// Listens for schema publishes announced by any pod (<see cref="SchemaVersionStore.ChannelName"/>)
/// and has this pod catch up straight away instead of on its next poll.
///
/// The subscription is a speed-up only: if Redis is unavailable at startup the pod keeps retrying
/// in the background and, meanwhile, still catches up through the poll in
/// <see cref="SchemaVersionTracker.EnsureCurrentAsync"/>. It never stops the host.
/// </summary>
public sealed class SchemaPublishSubscriber : BackgroundService
{
    public static readonly TimeSpan DefaultRetryDelay = TimeSpan.FromSeconds(30);

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private readonly ICacheClient _cacheClient;
    private readonly SchemaVersionTracker _versionTracker;
    private readonly ILogger<SchemaPublishSubscriber> _logger;
    private readonly TimeSpan _retryDelay;
    private bool _subscribed;

    public SchemaPublishSubscriber(ICacheClient cacheClient, SchemaVersionTracker versionTracker, ILogger<SchemaPublishSubscriber> logger)
        : this(cacheClient, versionTracker, logger, DefaultRetryDelay)
    {
    }

    public SchemaPublishSubscriber(ICacheClient cacheClient, SchemaVersionTracker versionTracker, ILogger<SchemaPublishSubscriber> logger, TimeSpan retryDelay)
    {
        _cacheClient = cacheClient ?? throw new ArgumentNullException(nameof(cacheClient));
        _versionTracker = versionTracker ?? throw new ArgumentNullException(nameof(versionTracker));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _retryDelay = retryDelay;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _cacheClient.SubscribeAsync(SchemaVersionStore.ChannelName, OnMessage);
                _subscribed = true;
                _logger.LogInformation("Subscribed to schema publish messages on {Channel}", SchemaVersionStore.ChannelName);
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not subscribe to schema publish messages; retrying in {Delay}", _retryDelay);
            }

            try
            {
                await Task.Delay(_retryDelay, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_subscribed)
        {
            try
            {
                await _cacheClient.UnsubscribeAsync(SchemaVersionStore.ChannelName);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not unsubscribe from schema publish messages");
            }
        }

        await base.StopAsync(cancellationToken);
    }

    /// <summary>Handles one message. Runs on the Redis client's thread, so the check runs separately.</summary>
    internal void OnMessage(RedisChannel channel, RedisValue message)
    {
        SchemaVersionPublished? published;
        try
        {
            published = JsonSerializer.Deserialize<SchemaVersionPublished>(message.ToString(), JsonOptions);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Ignoring a malformed schema publish message");
            return;
        }

        if (published is null || string.IsNullOrWhiteSpace(published.TenantId))
        {
            _logger.LogWarning("Ignoring a schema publish message without a tenant");
            return;
        }

        // OnVersionPublishedAsync handles its own failures.
        _ = Task.Run(() => _versionTracker.OnVersionPublishedAsync(published.TenantId, published.Version));
    }
}
