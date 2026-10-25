using System.Security.Claims;
using System.Text;
using System.Text.Json;
using DataGateway.DomainService.GraphQL;
using DataGateway.DomainService.Models.Constants;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution.Configuration;
using HotChocolate.Types;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace XUnitTest.DataGateway.GraphQL;

/// <summary>
/// The gateway serves every tenant from an executor created at runtime, and HotChocolate keys
/// validation by executor name, so a rule or switch configured on the template server protects
/// nothing. These tests go through the real per-tenant pipeline (<see cref="ProjectExecutorOptionsMonitor"/>
/// + <see cref="DataGatewayPipelineDispatcher"/>) with the real wiring (<see cref="GatewayValidation"/>)
/// and pin that the rules actually hold there.
/// </summary>
public class TenantExecutorValidationTests
{
    private const string Introspection = "{ __schema { queryType { name } } }";

    private sealed class OneFieldSchema : ITenantSchemaConfigurator
    {
        public ValueTask ConfigureAsync(string schemaName, ISchemaBuilder schemaBuilder, CancellationToken cancellationToken)
        {
            schemaBuilder.AddQueryType(d => d.Name("Query").Field("hello").Type<StringType>().Resolve("hi"));
            return default;
        }

        public void OnExecutorCreated(string schemaName) { }
    }

    [Fact]
    public async Task AnonymousIntrospection_IsRefusedByTheTenantExecutor()
    {
        var (status, body) = await PostAsync(Introspection, authenticated: false);

        status.Should().Be(StatusCodes.Status400BadRequest, "a validation error, like any other");
        ErrorCodes(body).Should().Equal(GraphQlConstant.IntrospectionNotAllowedErrorCode);
        body.Should().NotContain("queryType");
    }

    [Fact]
    public async Task AuthenticatedIntrospection_IsAnswered()
    {
        var (_, body) = await PostAsync(Introspection, authenticated: true);

        ErrorCodes(body).Should().BeEmpty();
        body.Should().Contain("\"name\":\"Query\"");
    }

    [Fact]
    public async Task AnonymousIntrospection_ThroughAFragment_IsRefusedToo()
    {
        var (_, body) = await PostAsync("{ ...F } fragment F on Query { __type(name: \"Query\") { name } }", authenticated: false);

        ErrorCodes(body).Should().Equal(GraphQlConstant.IntrospectionNotAllowedErrorCode);
    }

    [Fact]
    public async Task MetaFields_StayAvailableToEveryone()
    {
        var (_, body) = await PostAsync("{ __typename hello }", authenticated: false);

        ErrorCodes(body).Should().BeEmpty();
        body.Should().Contain("\"hello\":\"hi\"");
    }

    [Fact]
    public async Task TheRootFieldCap_HoldsOnTheTenantExecutor()
    {
        var over = "{ " + string.Join(" ", Enumerable.Range(0, GraphQlConstant.MaxRootFieldsPerOperation + 1).Select(i => $"a{i}: hello")) + " }";
        var within = "{ " + string.Join(" ", Enumerable.Range(0, GraphQlConstant.MaxRootFieldsPerOperation).Select(i => $"a{i}: hello")) + " }";

        var (_, rejected) = await PostAsync(over, authenticated: true);
        var (_, accepted) = await PostAsync(within, authenticated: true);

        ErrorCodes(rejected).Should().Equal(GraphQlConstant.TooManyRootFieldsErrorCode);
        ErrorCodes(accepted).Should().BeEmpty();
    }

    [Fact]
    public async Task TheTemplateExecutor_IsNotWhatProtectsTenants()
    {
        // Configure the template only, the way the old code did: the tenant executor is unaffected.
        var (_, body) = await PostAsync(Introspection, authenticated: false,
            configure: builder => builder.DisableIntrospection(), gatewayValidation: false);

        ErrorCodes(body).Should().BeEmpty();
        body.Should().Contain("\"name\":\"Query\"");
    }

    private static string[] ErrorCodes(string body)
    {
        using var json = JsonDocument.Parse(body);
        return json.RootElement.TryGetProperty("errors", out var errors)
            ? errors.EnumerateArray().Select(e => e.GetProperty("extensions").GetProperty("code").GetString()!).ToArray()
            : [];
    }

    /// <summary>One request through a tenant's pipeline, built from the template exactly as ServiceRegistry builds it.</summary>
    private static async Task<(int status, string body)> PostAsync(
        string query,
        bool authenticated,
        Action<IRequestExecutorBuilder>? configure = null,
        bool gatewayValidation = true)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddRouting();
        services.AddSingleton<ITenantSchemaConfigurator, OneFieldSchema>();
        var builder = services.AddGraphQLServer();
        if (gatewayValidation)
        {
            builder.AddGatewayValidation();
        }
        configure?.Invoke(builder);
        services.RemoveAll<IRequestExecutorOptionsMonitor>();
        services.AddSingleton<ProjectExecutorOptionsMonitor>();
        services.AddSingleton<IRequestExecutorOptionsMonitor>(sp => sp.GetRequiredService<ProjectExecutorOptionsMonitor>());
        services.AddSingleton<DataGatewayPipelineDispatcher>();
        await using var provider = services.BuildServiceProvider();
        var pipeline = provider.GetRequiredService<DataGatewayPipelineDispatcher>().GetPipeline("tenant_1");

        using var scope = provider.CreateScope();
        var context = new DefaultHttpContext { RequestServices = scope.ServiceProvider };
        context.Request.Method = HttpMethods.Post;
        context.Request.Path = "/";
        context.Request.ContentType = "application/json";
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { query })));
        if (authenticated)
        {
            // What DataGatewayGraphQLEndpointExtensions sets after validating the token.
            context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", "user-1")], "Bearer"));
        }
        context.Response.Body = new MemoryStream();

        await pipeline(context);

        context.Response.Body.Position = 0;
        return (context.Response.StatusCode, await new StreamReader(context.Response.Body, Encoding.UTF8).ReadToEndAsync());
    }
}
