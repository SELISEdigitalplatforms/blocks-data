using System;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using HotChocolate.Resolvers;

namespace DataGateway.DomainService.Middlewares;

public class WriteSchemaAccessMiddleware
{

    private readonly FieldDelegate _next;
    private readonly SchemaDefinitionExtended _schema;

    public WriteSchemaAccessMiddleware(FieldDelegate next, SchemaDefinitionExtended schema)
    {
        _next = next ?? throw new ArgumentNullException(nameof(next));
        _schema = schema ?? throw new ArgumentNullException(nameof(schema));
    }

    public Task InvokeAsync(IMiddlewareContext context)
    {
        return SchemaAccessMiddlewareHelper.InvokeAsync(
            context,
            _next,
            _schema.WriteAccessLevel,
            nameof(WriteSchemaAccessMiddleware));
    }

}


