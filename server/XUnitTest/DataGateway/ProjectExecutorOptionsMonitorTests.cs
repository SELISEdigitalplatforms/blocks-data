using DataGateway.DomainService.GraphQL;
using FluentAssertions;
using HotChocolate;
using HotChocolate.Execution.Configuration;
using Microsoft.Extensions.Options;
using Moq;

namespace XUnitTest.DataGateway
{
    /// <summary>
    /// Unit tests for <see cref="ProjectExecutorOptionsMonitor"/>. The point of this class is that
    /// every schema name, including project slugs created at runtime, is served from the default
    /// ("template") configuration, and that each name gets a schema hook for the tenant it names.
    /// Both are pinned here.
    /// </summary>
    public class ProjectExecutorOptionsMonitorTests
    {
        private readonly Mock<IOptionsMonitor<RequestExecutorSetup>> _options = new();

        public ProjectExecutorOptionsMonitorTests()
        {
            _options.Setup(o => o.Get(It.IsAny<string>())).Returns(new RequestExecutorSetup());
        }

        private static Mock<IRequestExecutorOptionsProvider> Provider(
            params IConfigureRequestExecutorSetup[] configurations)
        {
            var provider = new Mock<IRequestExecutorOptionsProvider>();
            provider.Setup(p => p.GetOptionsAsync(It.IsAny<CancellationToken>()))
                    .ReturnsAsync(configurations);
            provider.Setup(p => p.OnChange(It.IsAny<Action<IConfigureRequestExecutorSetup>>()))
                    .Returns(Mock.Of<IDisposable>());
            return provider;
        }

        private static Mock<IConfigureRequestExecutorSetup> Configuration(string schemaName)
        {
            var configuration = new Mock<IConfigureRequestExecutorSetup>();
            configuration.SetupGet(c => c.SchemaName).Returns(schemaName);
            return configuration;
        }

        private ProjectExecutorOptionsMonitor Build(params Mock<IRequestExecutorOptionsProvider>[] providers) =>
            new(_options.Object, providers.Select(p => p.Object));

        [Fact]
        public async Task GetAsync_ReadsTheDefaultSchemaConfigurationEvenForAnUnknownProjectSlug()
        {
            var sut = Build(Provider());

            var result = await sut.GetAsync("some-runtime-project-slug");

            result.Should().NotBeNull();
            // The whole purpose: an arbitrary slug is served from the template, not rejected.
            _options.Verify(o => o.Get(Schema.DefaultName), Times.AtLeastOnce);
        }

        [Fact]
        public async Task GetAsync_AppliesTheConfigurationsRegisteredForTheDefaultSchema()
        {
            var configuration = Configuration(Schema.DefaultName);
            var sut = Build(Provider(configuration.Object));

            await sut.GetAsync("project-a");

            configuration.Verify(c => c.Configure(It.IsAny<RequestExecutorSetup>()), Times.Once);
        }

        [Fact]
        public async Task GetAsync_IgnoresConfigurationsRegisteredUnderOtherSchemaNames()
        {
            var other = Configuration("some-other-schema");
            var sut = Build(Provider(other.Object));

            await sut.GetAsync("project-a");

            other.Verify(c => c.Configure(It.IsAny<RequestExecutorSetup>()), Times.Never);
        }

        [Fact]
        public async Task GetAsync_InitialisesTheProvidersOnlyOnce()
        {
            var provider = Provider();
            var sut = Build(provider);

            await sut.GetAsync("project-a");
            await sut.GetAsync("project-b");
            await sut.GetAsync("project-c");

            provider.Verify(p => p.GetOptionsAsync(It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task GetAsync_CombinesConfigurationsFromEveryProvider()
        {
            var first = Configuration(Schema.DefaultName);
            var second = Configuration(Schema.DefaultName);
            var sut = Build(Provider(first.Object), Provider(second.Object));

            await sut.GetAsync("project-a");

            first.Verify(c => c.Configure(It.IsAny<RequestExecutorSetup>()), Times.Once);
            second.Verify(c => c.Configure(It.IsAny<RequestExecutorSetup>()), Times.Once);
        }

        [Fact]
        public async Task GetAsync_ReturnsAFreshSetupPerCall()
        {
            var sut = Build(Provider());

            var first = await sut.GetAsync("project-a");
            var second = await sut.GetAsync("project-a");

            second.Should().NotBeSameAs(first, "each call must not hand back a shared mutable setup");
        }

        private static Mock<IRequestExecutorOptionsProvider> ChangeableProvider(
            Action<Action<IConfigureRequestExecutorSetup>> capture)
        {
            var provider = Provider();
            provider.Setup(p => p.OnChange(It.IsAny<Action<IConfigureRequestExecutorSetup>>()))
                    .Callback(capture)
                    .Returns(Mock.Of<IDisposable>());
            return provider;
        }

        [Fact]
        public async Task OnChange_StopsNotifyingOnceTheSessionIsDisposed()
        {
            Action<IConfigureRequestExecutorSetup>? change = null;
            var sut = Build(ChangeableProvider(a => change = a));
            await sut.GetAsync("project-a");
            var seen = new List<string>();
            var session = sut.OnChange(seen.Add);

            change!(Configuration(Schema.DefaultName).Object);
            session.Dispose();
            change(Configuration(Schema.DefaultName).Object);

            seen.Should().Equal(Schema.DefaultName);
        }

        [Fact]
        public async Task OnChange_RemovesOnlyTheDisposedListener()
        {
            Action<IConfigureRequestExecutorSetup>? change = null;
            var sut = Build(ChangeableProvider(a => change = a));
            await sut.GetAsync("project-a");
            var kept = new List<string>();
            var dropped = new List<string>();
            using var _ = sut.OnChange(kept.Add);
            var session = sut.OnChange(dropped.Add);

            session.Dispose();
            change!(Configuration(Schema.DefaultName).Object);

            kept.Should().Equal(Schema.DefaultName);
            dropped.Should().BeEmpty();
        }

        // ---------------- per-tenant schema hook ----------------

        [Fact]
        public async Task GetAsync_WithoutAConfigurator_AddsNoTenantHooks()
        {
            var sut = Build(Provider());

            var setup = await sut.GetAsync("project-a");

            setup.OnConfigureSchemaBuilderHooks.Should().BeEmpty();
            setup.OnRequestExecutorCreatedHooks.Should().BeEmpty();
        }

        [Fact]
        public async Task GetAsync_BuildsTheSchemaForTheTenantNamedByTheSchemaName()
        {
            var configurator = new Mock<ITenantSchemaConfigurator>();
            var sut = new ProjectExecutorOptionsMonitor(_options.Object, [Provider().Object], configurator.Object);
            var schemaBuilder = SchemaBuilder.New();

            var setup = await sut.GetAsync("project-a");
            var hook = setup.OnConfigureSchemaBuilderHooks.Should().ContainSingle().Subject;
            await hook.ConfigureAsync!(
                new ConfigurationContext("project-a", schemaBuilder, Mock.Of<IServiceProvider>()),
                Mock.Of<IServiceProvider>(),
                CancellationToken.None);

            // No request context is involved: the tenant comes from the executor's name, which is
            // what lets HotChocolate rebuild an evicted executor on its background task.
            configurator.Verify(c => c.ConfigureAsync("project-a", schemaBuilder, It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task GetAsync_ReportsTheCreatedExecutorForTheTenant()
        {
            var configurator = new Mock<ITenantSchemaConfigurator>();
            var sut = new ProjectExecutorOptionsMonitor(_options.Object, [Provider().Object], configurator.Object);

            var setup = await sut.GetAsync("project-b");
            var hook = setup.OnRequestExecutorCreatedHooks.Should().ContainSingle().Subject;
            hook.Created!(
                new ConfigurationContext("project-b", SchemaBuilder.New(), Mock.Of<IServiceProvider>()),
                Mock.Of<HotChocolate.Execution.IRequestExecutor>());

            configurator.Verify(c => c.OnExecutorCreated("project-b"), Times.Once);
        }

        [Fact]
        public async Task AProviderChange_ReinitialisesAndNotifiesUnderTheDefaultName()
        {
            Action<IConfigureRequestExecutorSetup>? onProviderChange = null;
            var provider = Provider();
            provider.Setup(p => p.OnChange(It.IsAny<Action<IConfigureRequestExecutorSetup>>()))
                    .Callback<Action<IConfigureRequestExecutorSetup>>(a => onProviderChange = a)
                    .Returns(Mock.Of<IDisposable>());

            var sut = Build(provider);
            await sut.GetAsync("project-a");

            var seen = new List<string>();
            using var _ = sut.OnChange(seen.Add);

            onProviderChange.Should().NotBeNull();
            onProviderChange!(Configuration(Schema.DefaultName).Object);

            // Listeners hear the template name, because the template backs every project.
            seen.Should().Equal(Schema.DefaultName);

            // The change also clears the initialised flag, so the providers are read again.
            await sut.GetAsync("project-a");
            provider.Verify(p => p.GetOptionsAsync(It.IsAny<CancellationToken>()), Times.Exactly(2));
        }

        [Fact]
        public void Dispose_DisposesTheProviderSubscriptions()
        {
            var subscription = new Mock<IDisposable>();
            var provider = Provider();
            provider.Setup(p => p.OnChange(It.IsAny<Action<IConfigureRequestExecutorSetup>>()))
                    .Returns(subscription.Object);

            var sut = Build(provider);
            sut.GetAsync("project-a").AsTask().GetAwaiter().GetResult();

            sut.Dispose();

            subscription.Verify(d => d.Dispose(), Times.Once);
        }

        [Fact]
        public void Dispose_IsIdempotent()
        {
            var subscription = new Mock<IDisposable>();
            var provider = Provider();
            provider.Setup(p => p.OnChange(It.IsAny<Action<IConfigureRequestExecutorSetup>>()))
                    .Returns(subscription.Object);

            var sut = Build(provider);
            sut.GetAsync("project-a").AsTask().GetAwaiter().GetResult();

            sut.Dispose();
            var act = () => sut.Dispose();

            act.Should().NotThrow();
            subscription.Verify(d => d.Dispose(), Times.Once, "a second Dispose must not run again");
        }
    }
}
