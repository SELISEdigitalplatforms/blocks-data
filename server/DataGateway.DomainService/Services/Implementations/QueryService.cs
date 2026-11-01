using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Repositories;
using HotChocolate.Resolvers;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Services;

/// <summary>
/// The GraphQL adapter for queries: turns a resolver context into a <see cref="QueryCommand"/>, runs it
/// through the gateway engine (which owns the access checks, RLS/CLS and the Mongo read) and turns a
/// <see cref="GatewayException"/> into the GraphQL error the gateway has always returned.
/// </summary>
public class QueryService : IQueryService
{
    /// <inheritdoc cref="MongoGatewayDataEngine.MaxPageSizeKey" />
    public const string MaxPageSizeKey = MongoGatewayDataEngine.MaxPageSizeKey;

    private readonly IDataAccessPolicyResolutionService _resolver;
    private readonly IAccessPrincipalAccessor _principals;
    private readonly MongoGatewayDataEngine _engine;

    public QueryService(
        IGqlDbRepository repository,
        IDataAccessPolicyResolutionService resolver,
        IAccessPrincipalAccessor principals,
        ILogger<QueryService> logger,
        IConfiguration configuration)
        : this(repository, resolver, principals, logger, ReadMaxPageSize(configuration))
    {
    }

    internal QueryService(
        IGqlDbRepository repository,
        IDataAccessPolicyResolutionService resolver,
        IAccessPrincipalAccessor principals,
        ILogger<QueryService> logger,
        int? maxPageSize = null)
    {
        _resolver = resolver;
        _principals = principals;
        _engine = new MongoGatewayDataEngine(repository, resolver, principals, logger, maxPageSize);
    }

    private static int? ReadMaxPageSize(IConfiguration? configuration) =>
        configuration?.GetValue<int?>(MaxPageSizeKey);

    /// <inheritdoc />
    public async Task<QueryResponse<Dictionary<string, object>>> GetDataAsync(
        IResolverContext ctx,
        SchemaDefinitionExtended schema)
    {
        var command = BuildQueryCommand(ctx);
        return await GatewayExceptionTranslation.TranslateAsync(
            () => _engine.QueryAsync(new EntityModel(schema, null), command));
    }

    /// <summary>
    /// Reads <c>input</c> (<see cref="DynamicQueryInput"/>), optional <c>paging</c> (<see cref="PaginationInput"/>),
    /// and optional <c>where</c> / <c>order</c> from the resolver context. Per-field values in <c>paging</c>
    /// override pagination from <c>input</c>.
    /// </summary>
    internal static QueryCommand BuildQueryCommand(IResolverContext ctx)
    {
        var queryInput = GetQueryInputFromContext(ctx);
        return new QueryCommand(
            ctx.Selection.Field.Name,
            GraphQLArgumentNormalizer.ToWhere(queryInput.Where),
            GraphQLArgumentNormalizer.ToOrder(queryInput.Order),
            queryInput.PageNo,
            queryInput.PageSize,
            ctx.GetQueryProperties(),
            queryInput.Filter,
            queryInput.Sort);
    }

    private static QueryInputValues GetQueryInputFromContext(IResolverContext resolverContext)
    {
        var values = new QueryInputValues { Filter = "{}", Sort = "{}" };

        var input = resolverContext.ArgumentValue<DynamicQueryInput?>(GraphQlConstant.InputFieldName);
        if (input is not null)
        {
            if (!string.IsNullOrEmpty(input.Filter))
                values.Filter = input.Filter;
            if (!string.IsNullOrEmpty(input.Sort))
                values.Sort = input.Sort;
            if (input.PageNo.HasValue)
                values.PageNo = input.PageNo;
            if (input.PageSize.HasValue)
                values.PageSize = input.PageSize;
        }

        values.Where = resolverContext.ArgumentValue<object?>(GraphQlConstant.WhereFieldName);
        values.Order = resolverContext.ArgumentValue<object?>(GraphQlConstant.OrderFieldName);

        ApplyPagingArgument(values, resolverContext);

        return values;
    }

    private static void ApplyPagingArgument(QueryInputValues values, IResolverContext resolverContext)
    {
        var paging = resolverContext.ArgumentValue<PaginationInput?>(GraphQlConstant.PagingFieldName);
        if (paging is null)
            return;
        if (paging.PageNo.HasValue)
            values.PageNo = paging.PageNo;
        if (paging.PageSize.HasValue)
            values.PageSize = paging.PageSize;
    }

    /// <summary>
    /// Evaluates RLS policies for the schema and operation through the resolver. When schema access is Custom and no RLS policy exists, access is denied.
    /// </summary>
    public PolicyEvaluationResult EvaluateRlsPolicies(SchemaDefinitionExtended schema, PolicyOperation operation) =>
        _resolver.Check(new SchemaAccessRequest(_principals.Current, schema, operation));
}
