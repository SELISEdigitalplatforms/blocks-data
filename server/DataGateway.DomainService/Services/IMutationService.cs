using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using HotChocolate.Resolvers;

namespace DataGateway.DomainService.Services;

public interface IMutationService
{

    Task<ActionResponse> InsertAsync(
SchemaDefinitionExtended schema,
IResolverContext context,
InputObjectType inputType);


    Task<ActionResponse> UpdateAsync(
    SchemaDefinitionExtended schema,
    IResolverContext context,
    InputObjectType inputType);


    Task<ActionResponse> DeleteAsync(
    SchemaDefinitionExtended schema,
    IResolverContext context,
    InputObjectType inputType);

    Task<ActionResponse> BulkDeleteAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType);

    Task<BulkActionResponse> BulkInsertAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType);

    Task<ActionResponse> BulkUpdateAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType);
}