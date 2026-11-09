using DataGateway.DomainService;
using DataGateway.DomainService.GraphQL;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace XUnitTest.DataGateway.GraphQL;

/// <summary>
/// GraphQL at /api/gateway is deprecated in favour of REST. Once configured, every response of the endpoint
/// carries the deprecation headers; unconfigured, responses are untouched. The requests here carry no tenant,
/// so they end in the endpoint's own early 400 rejection, which must carry the headers too.
/// </summary>
public class GraphQLDeprecationHeaderTests
{
    private static readonly DateTimeOffset DeprecatedSince = new(2026, 11, 1, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task NoConfig_NoHeaders()
    {
        var response = await RequestAsync(options: null);

        response.Headers.Should().NotContainKey("Deprecation");
        response.Headers.Should().NotContainKey("Link");
        response.Headers.Should().NotContainKey("Sunset");
    }

    [Fact]
    public async Task EmptyOptions_NoHeaders()
    {
        var response = await RequestAsync(new GraphQLDeprecationOptions());

        response.Headers.Should().NotContainKey("Deprecation");
        response.Headers.Should().NotContainKey("Link");
        response.Headers.Should().NotContainKey("Sunset");
    }

    [Fact]
    public async Task DeprecatedSince_AddsDeprecationHeader()
    {
        var response = await RequestAsync(new GraphQLDeprecationOptions { DeprecatedSince = DeprecatedSince });

        response.Headers["Deprecation"].ToString().Should().Be("@1793491200");
        response.Headers.Should().NotContainKey("Link");
        response.Headers.Should().NotContainKey("Sunset");
    }

    [Fact]
    public async Task DeprecatedSince_InAnotherOffset_IsStillUnixSeconds()
    {
        var response = await RequestAsync(new GraphQLDeprecationOptions
        {
            DeprecatedSince = new DateTimeOffset(2026, 11, 1, 6, 0, 0, TimeSpan.FromHours(6))
        });

        response.Headers["Deprecation"].ToString().Should().Be("@1793491200");
    }

    [Fact]
    public async Task Link_OnlyWhenUrlSet()
    {
        var without = await RequestAsync(new GraphQLDeprecationOptions { DeprecatedSince = DeprecatedSince });
        var with = await RequestAsync(new GraphQLDeprecationOptions
        {
            DeprecatedSince = DeprecatedSince,
            MigrationGuideUrl = "https://docs.example.com/gateway-rest-migration"
        });

        without.Headers.Should().NotContainKey("Link");
        with.Headers["Link"].ToString().Should().Be("<https://docs.example.com/gateway-rest-migration>; rel=\"deprecation\"");
    }

    [Fact]
    public async Task Sunset_Rfc1123()
    {
        var response = await RequestAsync(new GraphQLDeprecationOptions
        {
            DeprecatedSince = DeprecatedSince,
            SunsetDate = new DateTimeOffset(2027, 5, 1, 2, 0, 0, TimeSpan.FromHours(2))
        });

        response.Headers["Sunset"].ToString().Should().Be("Sat, 01 May 2027 00:00:00 GMT");
    }

    [Fact]
    public async Task SunsetOrLinkAlone_WithoutDeprecatedSince_AddsNothing()
    {
        var response = await RequestAsync(new GraphQLDeprecationOptions
        {
            SunsetDate = new DateTimeOffset(2027, 5, 1, 0, 0, 0, TimeSpan.Zero),
            MigrationGuideUrl = "https://docs.example.com/gateway-rest-migration"
        });

        response.Headers.Should().NotContainKey("Deprecation");
        response.Headers.Should().NotContainKey("Link");
        response.Headers.Should().NotContainKey("Sunset");
    }

    [Fact]
    public async Task EarlyRejection_StillHasHeaders()
    {
        var response = await RequestAsync(new GraphQLDeprecationOptions
        {
            DeprecatedSince = DeprecatedSince,
            MigrationGuideUrl = "https://docs.example.com/gateway-rest-migration",
            SunsetDate = new DateTimeOffset(2027, 5, 1, 0, 0, 0, TimeSpan.Zero)
        });

        response.StatusCode.Should().Be(StatusCodes.Status400BadRequest, "no x-blocks-key and no token: the endpoint's own rejection");
        response.Headers["Deprecation"].ToString().Should().Be("@1793491200");
        response.Headers["Link"].ToString().Should().Contain("rel=\"deprecation\"");
        response.Headers["Sunset"].ToString().Should().Be("Sat, 01 May 2027 00:00:00 GMT");
    }

    [Fact]
    public void Options_AreBoundFromTheDataGatewayGraphQLSection()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DataGateway:GraphQL:DeprecatedSince"] = "2026-11-01T00:00:00Z",
            ["DataGateway:GraphQL:SunsetDate"] = "2027-05-01T00:00:00Z",
            ["DataGateway:GraphQL:MigrationGuideUrl"] = "https://docs.example.com/gateway-rest-migration"
        }).Build();
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddDataGatewayGraphQL();
        using var provider = services.BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<GraphQLDeprecationOptions>>().Value;

        options.DeprecatedSince.Should().Be(DeprecatedSince);
        options.SunsetDate.Should().Be(new DateTimeOffset(2027, 5, 1, 0, 0, 0, TimeSpan.Zero));
        options.MigrationGuideUrl.Should().Be("https://docs.example.com/gateway-rest-migration");
    }

    [Fact]
    public void Options_WithoutConfiguration_AreEmpty()
    {
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddDataGatewayGraphQL();
        using var provider = services.BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<GraphQLDeprecationOptions>>().Value;

        options.DeprecatedSince.Should().BeNull();
        options.SunsetDate.Should().BeNull();
        options.MigrationGuideUrl.Should().BeNull();
    }

    // ---- start-up validation (R35) ----

    private static ServiceProvider Registered(Dictionary<string, string?> settings)
    {
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().AddInMemoryCollection(settings).Build());
        services.AddDataGatewayGraphQL();
        return services.BuildServiceProvider();
    }

    private static Action StartupValidation(ServiceProvider provider) =>
        () => provider.GetRequiredService<IStartupValidator>().Validate();

    [Fact]
    public void Options_SunsetBeforeDeprecated_FailsValidation()
    {
        using var sunsetBefore = Registered(new()
        {
            ["DataGateway:GraphQL:DeprecatedSince"] = "2026-11-01T00:00:00Z",
            ["DataGateway:GraphQL:SunsetDate"] = "2026-10-01T00:00:00Z"
        });
        using var sunsetSame = Registered(new()
        {
            ["DataGateway:GraphQL:DeprecatedSince"] = "2026-11-01T00:00:00Z",
            ["DataGateway:GraphQL:SunsetDate"] = "2026-11-01T00:00:00Z"
        });
        using var sunsetAfter = Registered(new()
        {
            ["DataGateway:GraphQL:DeprecatedSince"] = "2026-11-01T00:00:00Z",
            ["DataGateway:GraphQL:SunsetDate"] = "2027-05-01T00:00:00Z"
        });

        StartupValidation(sunsetBefore).Should().Throw<OptionsValidationException>()
            .Which.Failures.Should().ContainSingle()
            .Which.Should().Be("DataGateway:GraphQL:SunsetDate must be after DataGateway:GraphQL:DeprecatedSince.");
        StartupValidation(sunsetSame).Should().Throw<OptionsValidationException>();
        StartupValidation(sunsetAfter).Should().NotThrow();
    }

    [Theory]
    [InlineData("docs/migration.md")]
    [InlineData("ftp://docs.example.com/migration")]
    [InlineData("not a url")]
    public void Options_InvalidUrl_FailsValidation(string url)
    {
        using var provider = Registered(new()
        {
            ["DataGateway:GraphQL:DeprecatedSince"] = "2026-11-01T00:00:00Z",
            ["DataGateway:GraphQL:MigrationGuideUrl"] = url
        });

        StartupValidation(provider).Should().Throw<OptionsValidationException>()
            .Which.Failures.Should().ContainSingle()
            .Which.Should().Be("DataGateway:GraphQL:MigrationGuideUrl must be an absolute http or https URL.");
    }

    [Fact]
    public void Options_UnparseableDate_FailsAtStartup()
    {
        // Binding fails when the options are first built, which start-up validation does: the host does not start,
        // instead of every GraphQL request failing.
        using var provider = Registered(new() { ["DataGateway:GraphQL:DeprecatedSince"] = "garbage" });

        StartupValidation(provider).Should().Throw<InvalidOperationException>()
            .WithMessage("*DeprecatedSince*");
    }

    [Fact]
    public void Options_Valid_PassStartupValidation()
    {
        using var empty = Registered([]);
        using var full = Registered(new()
        {
            ["DataGateway:GraphQL:DeprecatedSince"] = "2026-11-01T00:00:00Z",
            ["DataGateway:GraphQL:SunsetDate"] = "2027-05-01T00:00:00Z",
            ["DataGateway:GraphQL:MigrationGuideUrl"] = "https://docs.example.com/gateway-rest-migration"
        });

        StartupValidation(empty).Should().NotThrow();
        StartupValidation(full).Should().NotThrow();
    }

    private static async Task<HttpResponse> RequestAsync(GraphQLDeprecationOptions? options)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        if (options is not null)
        {
            services.AddSingleton(Options.Create(options));
        }
        await using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();

        var context = new DefaultHttpContext { RequestServices = scope.ServiceProvider };
        var responseFeature = new StartingCallbacksResponseFeature();
        context.Features.Set<IHttpResponseFeature>(responseFeature);
        context.Request.Method = HttpMethods.Post;
        context.Request.Path = "/api/gateway";
        context.Response.Body = new MemoryStream();

        await DataGatewayGraphQLEndpointExtensions.HandleDataGatewayRequestAsync(context);
        await responseFeature.StartAsync();

        return context.Response;
    }

    /// <summary>
    /// DefaultHttpContext ignores <c>OnStarting</c>; a real server runs the callbacks when the response starts.
    /// This feature keeps them and runs them on <see cref="StartAsync"/>, as the server would.
    /// </summary>
    private sealed class StartingCallbacksResponseFeature : HttpResponseFeature
    {
        private readonly List<(Func<object, Task> Callback, object State)> _callbacks = [];

        public override void OnStarting(Func<object, Task> callback, object state) => _callbacks.Add((callback, state));

        public async Task StartAsync()
        {
            for (var i = _callbacks.Count - 1; i >= 0; i--)
            {
                await _callbacks[i].Callback(_callbacks[i].State);
            }
        }
    }
}
