using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using HotChocolate.Resolvers;

namespace DataGateway.DomainService.Services;

public interface IQueryService
{
    Task<QueryResponse<Dictionary<string, object>>> GetDataAsync(
    IResolverContext ctx,
    SchemaDefinitionExtended schema);
}