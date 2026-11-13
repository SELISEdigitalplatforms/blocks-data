using Blocks.Data.Api.Security;
using FluentAssertions;
using Microsoft.Extensions.Configuration;

namespace XUnitTest.Api.Security;

/// <summary>
/// The SPA's CSP. The host list used to be hardcoded to <c>dev-*</c>, so on stg the browser
/// refused <c>https://stg-iam.blocksdevelopers.com/api/auth/me</c> even though the runtime
/// config pointed the SPA there. These pin that the policy follows configuration, and that
/// <c>&lt;style&gt;</c> elements need the per-response style nonce instead of 'unsafe-inline'.
/// </summary>
public class ContentSecurityPolicyTests
{
    private static IConfiguration Config(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    [Fact]
    public void Build_AllowsTheConfiguredEnvironmentsHosts()
    {
        var policy = ContentSecurityPolicy.Build(Config(new()
        {
            ["FrontendRuntime:BLOCKS_IAM_BASE_URL"] = "https://stg-iam.blocksdevelopers.com",
            ["FrontendRuntime:BLOCKS_OS_BASE_URL"] = "https://stg-os.blocksdevelopers.com",
            ["FrontendRuntime:BLOCKS_DATA_BASE_URL"] = "https://stg-data.blocksdevelopers.com",
        }));

        var connect = Directive(policy, "connect-src");
        connect.Should().Contain("https://stg-iam.blocksdevelopers.com");
        connect.Should().Contain("https://stg-os.blocksdevelopers.com");
        connect.Should().Contain("https://stg-data.blocksdevelopers.com");
    }

    [Fact]
    public void Build_NamesNoEnvironmentItWasNotConfiguredWith()
    {
        var policy = ContentSecurityPolicy.Build(Config(new()
        {
            ["FrontendRuntime:BLOCKS_IAM_BASE_URL"] = "https://stg-iam.blocksdevelopers.com",
            ["FrontendRuntime:BLOCKS_OS_BASE_URL"] = "https://stg-os.blocksdevelopers.com",
        }));

        policy.Should().NotContain("dev-iam.blocksdevelopers.com");
        policy.Should().NotContain("dev-os.blocksdevelopers.com");
    }

    [Fact]
    public void Build_AddsTheWebSocketFormOfTheLogicHost()
    {
        var policy = ContentSecurityPolicy.Build(Config(new()
        {
            ["FrontendRuntime:BLOCKS_LOGIC_BASE_URL"] = "https://stg-logic.blocksdevelopers.com",
        }));

        var connect = Directive(policy, "connect-src");
        connect.Should().Contain("https://stg-logic.blocksdevelopers.com");
        connect.Should().Contain("wss://stg-logic.blocksdevelopers.com");
    }

    [Fact]
    public void Build_ReducesUrlsWithPathsToOrigins()
    {
        var policy = ContentSecurityPolicy.Build(Config(new()
        {
            ["FrontendRuntime:BLOCKS_GRAPHQL_PUBLIC_URL"] = "https://stg-api.blocksdevelopers.com/data/v4/gateway",
        }));

        Directive(policy, "connect-src").Should().Contain("https://stg-api.blocksdevelopers.com");
        policy.Should().NotContain("/data/v4/gateway");
    }

    [Fact]
    public void Build_FormActionIsTheIdentityHostAndThePortal()
    {
        var policy = ContentSecurityPolicy.Build(Config(new()
        {
            ["FrontendRuntime:BLOCKS_IAM_BASE_URL"] = "https://iam.example.com",
            ["FrontendRuntime:BLOCKS_OS_BASE_URL"] = "https://os.example.com",
            ["FrontendRuntime:BLOCKS_DATA_BASE_URL"] = "https://data.example.com",
        }));

        var formAction = Directive(policy, "form-action");
        formAction.Should().Contain("https://iam.example.com");
        formAction.Should().Contain("https://os.example.com");
        formAction.Should().NotContain("https://data.example.com");
    }

    [Fact]
    public void Build_AppendsCspExtrasForHostsNoRuntimeKeyDescribes()
    {
        var policy = ContentSecurityPolicy.Build(Config(new()
        {
            ["Csp:ExtraConnectSrc"] = "https://api.rollbar.com, https://stgstorage.blob.core.windows.net",
            ["Csp:ExtraImgSrc"] = "https://az-cdn.selise.biz",
        }));

        Directive(policy, "connect-src").Should().Contain("https://api.rollbar.com")
            .And.Contain("https://stgstorage.blob.core.windows.net");
        Directive(policy, "img-src").Should().Contain("https://az-cdn.selise.biz");
    }

    [Theory]
    [InlineData("__BLOCKS_IAM_BASE_URL__")]
    [InlineData("not a url")]
    [InlineData("javascript:alert(1)")]
    [InlineData("https://evil.example.com; script-src *")]
    public void Build_IgnoresValuesThatAreNotHttpOrigins(string value)
    {
        var policy = ContentSecurityPolicy.Build(Config(new()
        {
            ["FrontendRuntime:BLOCKS_IAM_BASE_URL"] = value,
        }));

        policy.Should().NotContain("__BLOCKS_");
        policy.Should().NotContain("javascript:");
        policy.Should().NotContain("script-src *");
        Directive(policy, "connect-src").Should().Be("connect-src 'self'");
    }

    [Fact]
    public void Build_KeepsTheExistingDirectives()
    {
        var policy = ContentSecurityPolicy.Build(Config(new()));

        policy.Should().Contain("default-src 'self' blob:;");
        policy.Should().Contain("script-src 'self';");
        policy.Should().Contain("frame-ancestors 'none';");
        policy.Should().Contain("object-src 'none';");
    }

    [Fact]
    public void Build_AllowsStyleElementsOnlyWithTheNonceAndBlocksInlineScripts()
    {
        // ZAP 10055 (CSP: style-src unsafe-inline): <style> elements need the nonce; style
        // attributes stay allowed through style-src-attr only.
        var policy = ContentSecurityPolicy.Build(Config(new()));

        Directive(policy, "style-src").Should().Be($"style-src 'self' 'nonce-{ContentSecurityPolicy.StyleNoncePlaceholder}'");
        Directive(policy, "style-src").Should().NotContain("'unsafe-inline'");
        Directive(policy, "style-src-attr").Should().Be("style-src-attr 'unsafe-inline'");
        Directive(policy, "script-src").Should().Be("script-src 'self'");
    }

    [Fact]
    public void WithStyleNonce_ReplacesThePlaceholderOnly()
    {
        var policy = ContentSecurityPolicy.BuildPolicy([], [], []);

        var withNonce = ContentSecurityPolicy.WithStyleNonce(policy, "abc123==");

        Directive(withNonce, "style-src").Should().Be("style-src 'self' 'nonce-abc123=='");
        withNonce.Should().NotContain(ContentSecurityPolicy.StyleNoncePlaceholder);
        withNonce.Replace("abc123==", ContentSecurityPolicy.StyleNoncePlaceholder, StringComparison.Ordinal).Should().Be(policy);
    }

    [Fact]
    public void WithStyleNonce_RefusesAnEmptyNonce()
    {
        var act = () => ContentSecurityPolicy.WithStyleNonce(ContentSecurityPolicy.BuildPolicy([], [], []), "");

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void WithStyleNonce_RefusesANullPolicy()
    {
        var act = () => ContentSecurityPolicy.WithStyleNonce(null!, "n0nce");

        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void RenderIndex_WritesTheNonceIntoTheShell()
    {
        var template = $"<meta name=\"csp-nonce\" nonce=\"{ContentSecurityPolicy.StyleNoncePlaceholder}\" />";

        ContentSecurityPolicy.RenderIndex(template, "n0nce").Should().Be("<meta name=\"csp-nonce\" nonce=\"n0nce\" />");
    }

    [Fact]
    public void RenderIndex_RefusesAnEmptyNonce()
    {
        var act = () => ContentSecurityPolicy.RenderIndex("<html></html>", "");

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void RenderIndex_RefusesANullTemplate()
    {
        var act = () => ContentSecurityPolicy.RenderIndex(null!, "n0nce");

        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void ShippedIndexHtml_CarriesTheNoncePlaceholderAndTheShim()
    {
        // The server can only stamp the nonce if the built shell has the placeholder, and
        // runtime <style> elements only get it through /csp-nonce.js loaded before the app.
        var indexHtml = File.ReadAllText(Path.Combine(RepoRoot(), "client", "index.html"));

        indexHtml.Should().Contain($"<meta name=\"csp-nonce\" nonce=\"{ContentSecurityPolicy.StyleNoncePlaceholder}\" />");
        indexHtml.IndexOf("/csp-nonce.js", StringComparison.Ordinal).Should()
            .BeLessThan(indexHtml.IndexOf("/app/main.tsx", StringComparison.Ordinal));
        File.Exists(Path.Combine(RepoRoot(), "client", "public", "csp-nonce.js")).Should().BeTrue();
    }

    /// <summary>The repository root: the first directory above the test output with client/index.html.</summary>
    private static string RepoRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (File.Exists(Path.Combine(dir.FullName, "client", "index.html"))) return dir.FullName;
        }

        throw new DirectoryNotFoundException("client/index.html not found above the test output.");
    }

    private static string Directive(string policy, string name) =>
        policy.Split(';', StringSplitOptions.TrimEntries)
            .Single(directive => directive.StartsWith(name + " ", StringComparison.Ordinal)
                                 || directive == name);
}
