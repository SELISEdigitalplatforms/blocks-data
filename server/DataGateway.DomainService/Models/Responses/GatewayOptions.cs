using DataGateway.DomainService.Entities;

namespace DataGateway.DomainService.Models.Responses;

/// <summary>Read-only UI options. Contains no database routing or secret fields.</summary>
public sealed record GatewayOptions(
    bool IsCollectionNameEditable,
    string CollectionNamePattern,
    AnalyticsConfiguration? AnalyticsConfiguration);
