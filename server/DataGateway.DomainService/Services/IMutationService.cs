using Blocks.Genesis.DataAccess.Evaluation;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using HotChocolate.Resolvers;

namespace DataGateway.DomainService.Services;

public interface IMutationService
{

    /// <param name="references">Reference rule targets of the schema build; null skips the reference check.</param>
    Task<ActionResponse> InsertAsync(
SchemaDefinitionExtended schema,
IResolverContext context,
InputObjectType inputType,
ReferenceTargets? references = null);


    Task<ActionResponse> UpdateAsync(
    SchemaDefinitionExtended schema,
    IResolverContext context,
    InputObjectType inputType,
    ReferenceTargets? references = null);


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
        InputObjectType inputType,
        ReferenceTargets? references = null);

    Task<ActionResponse> BulkUpdateAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType,
        ReferenceTargets? references = null);
}