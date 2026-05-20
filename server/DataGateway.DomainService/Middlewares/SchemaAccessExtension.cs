using System;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using StackExchange.Redis;

namespace DataGateway.DomainService.Middlewares;

public static class SchemaAccessExtension
{

    public static IObjectFieldDescriptor UseReadSchemaAccess(
        this IObjectFieldDescriptor descriptor, SchemaDefinitionExtended schema)
    {
        return descriptor.Use(next => context => new ValueTask(new ReadSchemaAccessMiddleware(next, schema).InvokeAsync(context)));
    }
    public static IObjectFieldDescriptor UseWriteSchemaAccess(
        this IObjectFieldDescriptor descriptor, SchemaDefinitionExtended schema)
    {
        return descriptor.Use(next => context => new ValueTask(new WriteSchemaAccessMiddleware(next, schema).InvokeAsync(context)));
    }
    public static IObjectFieldDescriptor UseEditSchemaAccess(
        this IObjectFieldDescriptor descriptor, SchemaDefinitionExtended schema)
    {
        return descriptor.Use(next => context => new ValueTask(new EditSchemaAccessMiddleware(next, schema).InvokeAsync(context)));
    }
    public static IObjectFieldDescriptor UseDeleteSchemaAccess(
        this IObjectFieldDescriptor descriptor, SchemaDefinitionExtended schema)
    {
        return descriptor.Use(next => context => new ValueTask(new DeleteSchemaAccessMiddleware(next, schema).InvokeAsync(context)));
    }

}
