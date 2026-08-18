using System.Security.Claims;
using DataGateway.DomainService.Middlewares;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Constants;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Resolvers;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

/// <summary>
/// Covers the read/write/edit/delete field middlewares and the access check they share. The four
/// middlewares differ only in which access level they read off the schema, so the shared decision
/// table is exercised once through the read middleware and each middleware is then checked to be
/// wired to its own level.
/// </summary>
[Collection("ContextSerial")]
public class SchemaAccessMiddlewareTests : IDisposable
{
    public void Dispose()
    {
        ClearContext();
        GC.SuppressFinalize(this);
    }

    private static DefaultHttpContext HttpContext(
        string? blocksKey = "tenant-1",
        string? authorization = null,
        bool authenticatedUser = false)
    {
        var httpContext = new DefaultHttpContext();
        if (blocksKey is not null)
        {
            httpContext.Request.Headers[GraphQlConstant.BlocksKeyHeaderKey] = blocksKey;
        }

        if (authorization is not null)
        {
            httpContext.Request.Headers.Authorization = authorization;
        }

        if (authenticatedUser)
        {
            httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(authenticationType: "Test"));
        }

        return httpContext;
    }

    private static Mock<IMiddlewareContext> MiddlewareContext(HttpContext? httpContext)
    {
        var services = new ServiceCollection();
        var accessor = new HttpContextAccessor { HttpContext = httpContext };
        services.AddSingleton<IHttpContextAccessor>(accessor);

        var context = new Mock<IMiddlewareContext>();
        context.SetupGet(c => c.Services).Returns(services.BuildServiceProvider());
        return context;
    }

    private sealed class NextSpy
    {
        public int Calls { get; private set; }

        public FieldDelegate Delegate => _ =>
        {
            Calls++;
            return default;
        };
    }

    private static SchemaDefinitionExtended SchemaWith(
        SchemaAccessLevel read = SchemaAccessLevel.Public,
        SchemaAccessLevel write = SchemaAccessLevel.Public,
        SchemaAccessLevel edit = SchemaAccessLevel.Public,
        SchemaAccessLevel delete = SchemaAccessLevel.Public)
        => Schema(read: read, write: write, edit: edit, delete: delete);

    // ---------------- tenant validation ----------------

    [Fact]
    public async Task RejectsARequestWithNoBlocksKeyHeader()
    {
        SetContext(tenantId: "tenant-1");
        var next = new NextSpy();
        var middleware = new ReadSchemaAccessMiddleware(next.Delegate, SchemaWith());

        var act = () => middleware.InvokeAsync(MiddlewareContext(HttpContext(blocksKey: null)).Object);

        var error = (await act.Should().ThrowAsync<GraphQLException>()).Which.Errors[0];
        error.Message.Should().Be("Tenant is not valid.");
        error.Code.Should().Be(GraphQlConstant.UnauthorizedErrorCode);
        next.Calls.Should().Be(0);
    }

    [Fact]
    public async Task RejectsARequestWithNoHttpContextAtAll()
    {
        SetContext(tenantId: "tenant-1");
        var next = new NextSpy();
        var middleware = new ReadSchemaAccessMiddleware(next.Delegate, SchemaWith());

        var act = () => middleware.InvokeAsync(MiddlewareContext(null).Object);

        await act.Should().ThrowAsync<GraphQLException>();
        next.Calls.Should().Be(0);
    }

    [Fact]
    public async Task RejectsABlocksKeyThatDoesNotMatchTheResolvedTenant()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(false);
        var next = new NextSpy();
        var middleware = new ReadSchemaAccessMiddleware(next.Delegate, SchemaWith());

        var act = () => middleware.InvokeAsync(MiddlewareContext(HttpContext(blocksKey: "other-tenant")).Object);

        await act.Should().ThrowAsync<GraphQLException>();
        next.Calls.Should().Be(0);
    }

    [Fact]
    public async Task AcceptsAMismatchedBlocksKeyWhenTheRequestComesFromBlocksCloud()
    {
        SetContext(tenantId: "tenant-1");
        SetBlocksCloud(true);
        var next = new NextSpy();
        var middleware = new ReadSchemaAccessMiddleware(next.Delegate, SchemaWith());

        await middleware.InvokeAsync(MiddlewareContext(HttpContext(blocksKey: "other-tenant")).Object);

        next.Calls.Should().Be(1);
    }

    // ---------------- access level branches ----------------

    [Fact]
    public async Task LetsAPublicSchemaThroughWithoutAuthentication()
    {
        SetContext(tenantId: "tenant-1");
        var next = new NextSpy();
        var middleware = new ReadSchemaAccessMiddleware(next.Delegate, SchemaWith(read: SchemaAccessLevel.Public));

        await middleware.InvokeAsync(MiddlewareContext(HttpContext()).Object);

        next.Calls.Should().Be(1);
    }

    [Fact]
    public async Task RejectsANonPublicSchemaWhenTheUserIdentityIsNotAuthenticated()
    {
        SetContext(tenantId: "tenant-1");
        var next = new NextSpy();
        var middleware = new ReadSchemaAccessMiddleware(next.Delegate, SchemaWith(read: SchemaAccessLevel.User));

        var act = () => middleware.InvokeAsync(
            MiddlewareContext(HttpContext(authorization: "Bearer token", authenticatedUser: false)).Object);

        var error = (await act.Should().ThrowAsync<GraphQLException>()).Which.Errors[0];
        error.Message.Should().Be("User is not authenticated.");
        error.Code.Should().Be(GraphQlConstant.UnauthorizedErrorCode);
        next.Calls.Should().Be(0);
    }

    [Fact]
    public async Task AllowsANonPublicSchemaWhenTheAuthorizationHeaderAndIdentityAreBothPresent()
    {
        SetContext(tenantId: "tenant-1");
        var next = new NextSpy();
        var middleware = new ReadSchemaAccessMiddleware(next.Delegate, SchemaWith(read: SchemaAccessLevel.User));

        await middleware.InvokeAsync(
            MiddlewareContext(HttpContext(authorization: "Bearer token", authenticatedUser: true)).Object);

        next.Calls.Should().Be(1);
    }

    [Fact]
    public async Task AllowsANonPublicSchemaOnTheCookiePathWithNoAuthorizationHeader()
    {
        // Pinned behaviour: HasAuthCookie only checks that the x-blocks-key header is present, it
        // never looks at Request.Cookies. Any authenticated identity carrying a blocks key therefore
        // passes without an Authorization header. Tightening that has to update this test.
        SetContext(tenantId: "tenant-1");
        var next = new NextSpy();
        var middleware = new ReadSchemaAccessMiddleware(next.Delegate, SchemaWith(read: SchemaAccessLevel.User));

        await middleware.InvokeAsync(
            MiddlewareContext(HttpContext(authorization: null, authenticatedUser: true)).Object);

        next.Calls.Should().Be(1);
    }

    // ---------------- each middleware reads its own access level ----------------

    [Fact]
    public async Task WriteMiddlewareReadsTheWriteAccessLevel()
    {
        SetContext(tenantId: "tenant-1");
        var blocked = new NextSpy();
        var allowed = new NextSpy();

        var deny = new WriteSchemaAccessMiddleware(
            blocked.Delegate,
            SchemaWith(read: SchemaAccessLevel.Public, write: SchemaAccessLevel.User));
        var act = () => deny.InvokeAsync(MiddlewareContext(HttpContext()).Object);
        await act.Should().ThrowAsync<GraphQLException>();
        blocked.Calls.Should().Be(0);

        var allow = new WriteSchemaAccessMiddleware(
            allowed.Delegate,
            SchemaWith(read: SchemaAccessLevel.User, write: SchemaAccessLevel.Public));
        await allow.InvokeAsync(MiddlewareContext(HttpContext()).Object);
        allowed.Calls.Should().Be(1);
    }

    [Fact]
    public async Task EditMiddlewareReadsTheEditAccessLevel()
    {
        SetContext(tenantId: "tenant-1");
        var blocked = new NextSpy();
        var allowed = new NextSpy();

        var deny = new EditSchemaAccessMiddleware(
            blocked.Delegate,
            SchemaWith(read: SchemaAccessLevel.Public, edit: SchemaAccessLevel.User));
        var act = () => deny.InvokeAsync(MiddlewareContext(HttpContext()).Object);
        await act.Should().ThrowAsync<GraphQLException>();
        blocked.Calls.Should().Be(0);

        var allow = new EditSchemaAccessMiddleware(
            allowed.Delegate,
            SchemaWith(read: SchemaAccessLevel.User, edit: SchemaAccessLevel.Public));
        await allow.InvokeAsync(MiddlewareContext(HttpContext()).Object);
        allowed.Calls.Should().Be(1);
    }

    [Fact]
    public async Task DeleteMiddlewareReadsTheDeleteAccessLevel()
    {
        SetContext(tenantId: "tenant-1");
        var blocked = new NextSpy();
        var allowed = new NextSpy();

        var deny = new DeleteSchemaAccessMiddleware(
            blocked.Delegate,
            SchemaWith(read: SchemaAccessLevel.Public, delete: SchemaAccessLevel.User));
        var act = () => deny.InvokeAsync(MiddlewareContext(HttpContext()).Object);
        await act.Should().ThrowAsync<GraphQLException>();
        blocked.Calls.Should().Be(0);

        var allow = new DeleteSchemaAccessMiddleware(
            allowed.Delegate,
            SchemaWith(read: SchemaAccessLevel.User, delete: SchemaAccessLevel.Public));
        await allow.InvokeAsync(MiddlewareContext(HttpContext()).Object);
        allowed.Calls.Should().Be(1);
    }

    // ---------------- constructor guards ----------------

    [Fact]
    public void EveryMiddlewareRejectsNullConstructorArguments()
    {
        var next = new NextSpy().Delegate;
        var schema = SchemaWith();

        Assert.Throws<ArgumentNullException>(() => new ReadSchemaAccessMiddleware(null!, schema));
        Assert.Throws<ArgumentNullException>(() => new ReadSchemaAccessMiddleware(next, null!));
        Assert.Throws<ArgumentNullException>(() => new WriteSchemaAccessMiddleware(null!, schema));
        Assert.Throws<ArgumentNullException>(() => new WriteSchemaAccessMiddleware(next, null!));
        Assert.Throws<ArgumentNullException>(() => new EditSchemaAccessMiddleware(null!, schema));
        Assert.Throws<ArgumentNullException>(() => new EditSchemaAccessMiddleware(next, null!));
        Assert.Throws<ArgumentNullException>(() => new DeleteSchemaAccessMiddleware(null!, schema));
        Assert.Throws<ArgumentNullException>(() => new DeleteSchemaAccessMiddleware(next, null!));
    }
}
