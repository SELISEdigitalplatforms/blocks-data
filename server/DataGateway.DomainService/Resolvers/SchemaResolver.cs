using DataGateway.DomainService.GraphTypes;
using DataGateway.DomainService.Middlewares;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using DataGateway.DomainService.Services;
using HotChocolate.Language;
using HotChocolate.Resolvers;
using Microsoft.Extensions.Logging;

namespace DataGateway.DomainService.Resolvers;

public class SchemaResolver
{
    private readonly IMutationService _mutationService;
    private readonly IQueryService _queryService;

    public SchemaResolver(IMutationService mutationService,
        IQueryService queryService)
    {
        _mutationService = mutationService;
        _queryService = queryService;
    }

    public void ResolveQuerySchema(
        IObjectTypeDescriptor descriptor,
        SchemaDefinitionExtended schema,
        Dictionary<string, QueryOutputType> dynamicTypes,
        EntityFilterInputType filterInputType)
    {
        var schemaName = schema.GetSchemaNameForProject();
        var fieldName = $"get{schemaName}s";
        var responseType = new QueryResponseType(schemaName, dynamicTypes[schemaName]);

        descriptor.Field(fieldName)
            .UseReadSchemaAccess(schema)
            .Argument(GraphQlConstant.InputFieldName, a => a.Type<QueryInputType>().Description("Use where, order, and paging instead"))
            .Argument(GraphQlConstant.WhereFieldName, a => a.Type(filterInputType).Description("Filter the results by a MongoDB filter document."))
            .Argument(GraphQlConstant.OrderFieldName, a => a.Type(new ListTypeNode(new NonNullTypeNode(new NamedTypeNode("DynamicSortInput")))).Description("Sort the results by a list of dynamic sort input."))
            .Argument(GraphQlConstant.PagingFieldName, a => a.Type<PaginationInputType>().Description("Paginate the results by a page number and page size."))
            .Type(responseType)
            .Resolve(async (IResolverContext ctx) =>
                await _queryService.GetDataAsync(ctx, schema));
    }

    public void ResolveInsertSchema(
        IObjectTypeDescriptor descriptor,
        SchemaDefinitionExtended schema,
        InputObjectType inputType)
    {
        var schemaName = schema.GetSchemaNameForProject();
        var fieldName = $"insert{schemaName}";

        descriptor.Field(fieldName)
            .UseWriteSchemaAccess(schema)
            .Argument(GraphQlConstant.InputFieldName, a => a.Type(inputType).Description("The input data to insert."))
            .Type<ObjectType<ActionResponse>>()
            .Resolve(async ctx => await _mutationService.InsertAsync(schema, ctx, inputType));
    }

    public void ResolveUpdateSchema(
        IObjectTypeDescriptor descriptor,
        SchemaDefinitionExtended schema,
        InputObjectType inputType,
        EntityFilterInputType filterInputType)
    {
        var schemaName = schema.GetSchemaNameForProject();
        var fieldName = $"update{schemaName}";

        descriptor.Field(fieldName)
            .UseEditSchemaAccess(schema)
            .Argument(GraphQlConstant.FilterFieldName, a => a.Type<StringType>().Description("Use where instead"))
            .Argument(GraphQlConstant.WhereFieldName, a => a.Type(filterInputType).Description("Filter the results by a MongoDB filter document."))
            .Argument(GraphQlConstant.InputFieldName, a => a.Type(inputType).Description("The input data to update."))
            .Type<ObjectType<ActionResponse>>()
            .Resolve(async ctx => await _mutationService.UpdateAsync(schema, ctx, inputType));
    }

    public void ResolveDeleteSchema(
        IObjectTypeDescriptor descriptor,
        SchemaDefinitionExtended schema,
        InputObjectType inputType,
        EntityFilterInputType filterInputType)
    {
        var schemaName = schema.GetSchemaNameForProject();
        var fieldName = $"delete{schemaName}";

        descriptor.Field(fieldName)
            .UseDeleteSchemaAccess(schema)
            .Argument(GraphQlConstant.FilterFieldName, a => a.Type<StringType>().Description("Use where instead"))
            .Argument(GraphQlConstant.WhereFieldName, a => a.Type(filterInputType).Description("Filter the results by a MongoDB filter document."))
            .Argument(GraphQlConstant.InputFieldName, a => a.Type(inputType).Description("The input data to delete."))
            .Description($"Delete {schemaName} items.")
            .Type<ObjectType<ActionResponse>>()
            .Resolve(async ctx => await _mutationService.DeleteAsync(schema, ctx, inputType));
    }

    public void ResolveBulkDeleteSchema(
        IObjectTypeDescriptor descriptor,
        SchemaDefinitionExtended schema,
        InputObjectType inputType,
        EntityFilterInputType filterInputType)
    {
        var schemaName = schema.GetSchemaNameForProject();
        var fieldName = $"deleteMany{schemaName}";

        descriptor.Field(fieldName)
            .UseDeleteSchemaAccess(schema)
            .Argument(GraphQlConstant.FilterFieldName, a => a.Type<StringType>().Description("Use where instead"))
            .Argument(GraphQlConstant.WhereFieldName, a => a.Type(filterInputType).Description("Filter the results by a MongoDB filter document."))
            .Argument(GraphQlConstant.InputFieldName, a => a.Type(inputType).Description("The input data to delete."))
            .Description($"Delete {schemaName} items.")
            .Type<ObjectType<ActionResponse>>()
            .Resolve(async ctx => await _mutationService.BulkDeleteAsync(schema, ctx, inputType));
    }

    public void ResolveBulkInsertSchema(
        IObjectTypeDescriptor descriptor,
        SchemaDefinitionExtended schema,
        InputObjectType inputType)
    {
        var schemaName = schema.GetSchemaNameForProject();
        var fieldName = $"insertMany{schemaName}";

        descriptor.Field(fieldName)
            .UseWriteSchemaAccess(schema)
            .Argument(GraphQlConstant.InputFieldName, a => a.Type(new ListTypeNode(new NamedTypeNode($"{schemaName}InsertInput"))).Description("The input data to bulk insert."))
            .Description($"Bulk insert {schemaName} items.")
            .Type<ObjectType<BulkActionResponse>>()
            .Resolve(async ctx => await _mutationService.BulkInsertAsync(schema, ctx, inputType));
    }

    public void ResolveBulkUpdateSchema(
        IObjectTypeDescriptor descriptor,
        SchemaDefinitionExtended schema,
        InputObjectType inputType,
        EntityFilterInputType filterInputType)
    {
        var schemaName = schema.GetSchemaNameForProject();
        var fieldName = $"updateMany{schemaName}";

        descriptor.Field(fieldName)
            .UseEditSchemaAccess(schema)
            .Argument(GraphQlConstant.FilterFieldName, a => a.Type<StringType>().Description("Use where instead"))
            .Argument(GraphQlConstant.WhereFieldName, a => a.Type(filterInputType).Description("Filter the results by a MongoDB filter document."))
            .Argument(GraphQlConstant.InputFieldName, a => a.Type(inputType).Description("The input data to bulk update."))
            .Description($"Bulk update {schemaName} items matching the filter.")
            .Type<ObjectType<ActionResponse>>()
            .Resolve(async ctx => await _mutationService.BulkUpdateAsync(schema, ctx, inputType));
    }
}