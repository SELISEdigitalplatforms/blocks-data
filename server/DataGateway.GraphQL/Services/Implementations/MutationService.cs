using Blocks.Genesis.DataAccess;
using Blocks.Genesis.DataAccess.Evaluation;
using Blocks.Genesis.DataAccess.Rules;
using DataGateway.DomainService.Gateway;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Notifications;
using DataGateway.DomainService.Repositories;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;

namespace DataGateway.DomainService.Services;

/// <summary>
/// The GraphQL adapter for mutations (insert, update, delete): turns a resolver context into a command, runs it
/// through the gateway engine (which owns the access checks, RLS/CLS, validation, the Mongo write, change events
/// and notifications) and turns a <see cref="GatewayException"/> into the GraphQL error the gateway has always
/// returned. The mutation input is parsed lazily, when the engine reads it, so the engine's checks still run first.
/// </summary>
public class MutationService : IMutationService
{
    /// <inheritdoc cref="MongoGatewayDataEngine.BulkDeleteMaxDocs" />
    public const int BulkDeleteMaxDocs = MongoGatewayDataEngine.BulkDeleteMaxDocs;

    /// <inheritdoc cref="MongoGatewayDataEngine.BulkDeleteMaxBatchBytes" />
    public const long BulkDeleteMaxBatchBytes = MongoGatewayDataEngine.BulkDeleteMaxBatchBytes;

    private readonly MongoGatewayDataEngine _engine;

    public MutationService(
        IGqlDbRepository repository,
        IDataChangeEventPublisher eventPublisher,
        IDataAccessPolicyResolutionService resolver,
        IAccessPrincipalAccessor principals,
        ILogger<MutationService> logger,
        IMutationNotifier? notifier = null,
        IAfterWriteQueue? afterWrite = null)
    {
        _engine = new MongoGatewayDataEngine(
            repository, resolver, principals, logger,
            eventPublisher: eventPublisher, notifier: notifier, afterWrite: afterWrite);
    }

    /// <inheritdoc />
    public async Task<ActionResponse> InsertAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType,
        ReferenceTargets? references = null)
    {
        var command = BuildInsertCommand(context, inputType);
        return await GatewayExceptionTranslation.TranslateAsync(
            () => _engine.InsertAsync(new EntityModel(schema, references), command));
    }

    /// <inheritdoc />
    public async Task<ActionResponse> UpdateAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType,
        ReferenceTargets? references = null)
    {
        var command = BuildUpdateCommand(context, inputType);
        return await GatewayExceptionTranslation.TranslateAsync(
            () => _engine.UpdateAsync(new EntityModel(schema, references), command));
    }

    /// <inheritdoc />
    public async Task<ActionResponse> DeleteAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType)
    {
        var command = BuildDeleteCommand(context, inputType);
        return await GatewayExceptionTranslation.TranslateAsync(
            () => _engine.DeleteAsync(new EntityModel(schema, null), command));
    }

    /// <inheritdoc />
    public async Task<ActionResponse> BulkDeleteAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType)
    {
        var command = BuildDeleteManyCommand(context, inputType);
        return await GatewayExceptionTranslation.TranslateAsync(
            () => _engine.DeleteManyAsync(new EntityModel(schema, null), command));
    }

    /// <inheritdoc />
    public async Task<BulkActionResponse> BulkInsertAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType,
        ReferenceTargets? references = null)
    {
        var command = BuildInsertManyCommand(context, inputType);
        return await GatewayExceptionTranslation.TranslateAsync(
            () => _engine.InsertManyAsync(new EntityModel(schema, references), command));
    }

    /// <inheritdoc />
    public async Task<ActionResponse> BulkUpdateAsync(
        SchemaDefinitionExtended schema,
        IResolverContext context,
        InputObjectType inputType,
        ReferenceTargets? references = null)
    {
        var command = BuildUpdateManyCommand(context, inputType);
        return await GatewayExceptionTranslation.TranslateAsync(
            () => _engine.UpdateManyAsync(new EntityModel(schema, references), command));
    }

    /// <summary>The <c>input</c> object, parsed when the engine first reads it.</summary>
    internal static InsertCommand BuildInsertCommand(IResolverContext ctx, InputObjectType inputType) =>
        new(ctx.Selection.Field.Name, ParseInputLazily(ctx, inputType));

    /// <summary>The <c>input</c> list, parsed when the engine first reads it.</summary>
    internal static InsertManyCommand BuildInsertManyCommand(IResolverContext ctx, InputObjectType inputType) =>
        new(
            ctx.Selection.Field.Name,
            new Lazy<List<Dictionary<string, object?>>>(() => GraphQlTypeHelper.MapBulkMutationInput(
                ctx.ArgumentLiteral<IValueNode>(GraphQlConstant.InputFieldName) as ListValueNode, inputType)));

    internal static UpdateCommand BuildUpdateCommand(IResolverContext ctx, InputObjectType inputType) =>
        new(
            ctx.Selection.Field.Name,
            ReadWhere(ctx),
            ParseInputLazily(ctx, inputType),
            ReadLegacyFilter(ctx),
            IsOwnerCheckRequested(ctx));

    internal static UpdateManyCommand BuildUpdateManyCommand(IResolverContext ctx, InputObjectType inputType) =>
        new(
            ctx.Selection.Field.Name,
            ReadWhere(ctx),
            ParseInputLazily(ctx, inputType),
            ReadLegacyFilter(ctx),
            IsOwnerCheckRequested(ctx));

    internal static DeleteCommand BuildDeleteCommand(IResolverContext ctx, InputObjectType inputType) =>
        new(
            ctx.Selection.Field.Name,
            ReadWhere(ctx),
            GraphQLMutationInputHelper.IsHardDeleteRequested(ctx, inputType),
            ReadLegacyFilter(ctx),
            IsOwnerCheckRequested(ctx));

    internal static DeleteManyCommand BuildDeleteManyCommand(IResolverContext ctx, InputObjectType inputType) =>
        new(
            ctx.Selection.Field.Name,
            ReadWhere(ctx),
            GraphQLMutationInputHelper.IsHardDeleteRequested(ctx, inputType),
            ReadLegacyFilter(ctx),
            IsOwnerCheckRequested(ctx));

    private static Lazy<Dictionary<string, object?>> ParseInputLazily(IResolverContext ctx, InputObjectType inputType) =>
        new(() => GraphQLMutationInputHelper.ParseMutationInput(ctx, inputType));

    private static WhereNode? ReadWhere(IResolverContext ctx) =>
        GraphQLArgumentNormalizer.ToWhere(ctx.ArgumentValue<object?>(GraphQlConstant.WhereFieldName));

    private static string? ReadLegacyFilter(IResolverContext ctx) =>
        ctx.ArgumentValue<string?>(GraphQlConstant.FilterFieldName);

    /// <summary>
    /// The owner check is on only when the key holds <c>true</c>. Read with TryGetValue, as the filter helper read it
    /// before: the key is usually absent, and the dictionary's indexer would throw for a missing key.
    /// </summary>
    private static bool IsOwnerCheckRequested(IResolverContext ctx) =>
        ctx.ScopedContextData is { } scoped
        && scoped.TryGetValue(GraphQlConstant.CheckForOwnerContextKey, out var value)
        && value is true;

    // ---- Forwarders kept for existing tests (ruling R2) -------------------------------------------

    /// <inheritdoc cref="MongoGatewayDataEngine.BuildBatchDeleteFilter" />
    internal static BsonDocument BuildBatchDeleteFilter(BsonDocument filter, BsonArray ids) =>
        MongoGatewayDataEngine.BuildBatchDeleteFilter(filter, ids);

    /// <inheritdoc cref="MongoGatewayDataEngine.NextBulkDeleteBatchSize" />
    internal static int NextBulkDeleteBatchSize(long batchBytes, int batchCount) =>
        MongoGatewayDataEngine.NextBulkDeleteBatchSize(batchBytes, batchCount);

    /// <summary>
    /// The engine's required-field check, failing with the GraphQL error it always threw. RequiredFieldValidationTests
    /// call this through reflection by name.
    /// </summary>
    private static void ValidateRequiredFieldsOrThrow(
        Dictionary<string, object?> input,
        SchemaDefinitionExtended schema,
        string operationLabel)
    {
        try
        {
            MongoGatewayDataEngine.ValidateRequiredFieldsOrThrow(input, schema, operationLabel);
        }
        catch (GatewayException ex)
        {
            throw ex.ToGraphQLException();
        }
    }
}
