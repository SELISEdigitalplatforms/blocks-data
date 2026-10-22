using Api.Controllers;
using Blocks.Genesis.Entities.Data;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Events;
using DataGateway.DomainService.Notifications;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using Storage.DomainService.Entities;
using Storage.DomainService.Enums;
using Storage.DomainService.Services;
using Storage.DomainService.Storage;
using DomainService.Storage.Dms;
using Worker.Consumers;
using XUnitTest.Infrastructure;

namespace XUnitTest.Notifications;

/// <summary>Each action sends its built-in config once, to the right user, and a sender that fails changes nothing.</summary>
[Collection("ContextSerial")]
public class BuiltInNotificationCallSiteTests
{
    private readonly Mock<IBuiltInNotificationSender> _sender = new();
    private readonly List<BuiltInNotification> _sent = [];

    public BuiltInNotificationCallSiteTests()
    {
        BlocksTestContext.Set(userId: "user-1", tenantId: "tenant-1");
        _sender.Setup(s => s.SendAsync(It.IsAny<BuiltInNotification>()))
            .Callback<BuiltInNotification>(_sent.Add).ReturnsAsync(true);
    }

    // data-access-policy-changed
    private DataAccessService PolicyService(Mock<IDbRepository> repo)
    {
        var validator = new Mock<IRequestValidator>();
        validator.Setup(v => v.ValidateAsync(It.IsAny<CreateDataAccessPolicyRequest>())).ReturnsAsync(new ValidationResult());
        repo.Setup(r => r.InsertAsync(It.IsAny<DataAccessPolicy>(), "")).ReturnsAsync((DataAccessPolicy p, string _) => p);
        repo.Setup(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });
        repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(new SchemaDefinition
        {
            ItemId = "schema-1", SchemaName = "Person", Fields = new List<FieldDefinition> { new() { Name = "Email", Type = "String" } }
        });
        return new DataAccessService(repo.Object, validator.Object, Mock.Of<ISchemaChangeLogService>(), _sender.Object);
    }

    private static CreateDataAccessPolicyRequest PolicyRequest() => new()
    {
        SchemaId = "schema-1", PolicyName = "P1", PolicyType = PolicyType.RLS,
        Operation = PolicyOperation.READ, FieldNames = Array.Empty<string>()
    };

    [Fact]
    public async Task PolicyCreate_NotifiesTheActingUserInTheirTenant()
    {
        await PolicyService(new Mock<IDbRepository>()).CreateDataAccessPolicyAsync(PolicyRequest());

        var n = _sent.Single();
        n.ConfigurationName.Should().Be("data-access-policy-changed");
        n.TenantId.Should().Be("tenant-1");
        n.UserIds.Should().Equal("user-1");
    }

    [Fact]
    public async Task PolicyDelete_NotifiesOnlyAfterTheDelete()
    {
        var repo = new Mock<IDbRepository>();
        var service = PolicyService(repo);
        repo.Setup(r => r.GetItemAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<DataAccessPolicy>>(), "")).ReturnsAsync((DataAccessPolicy?)null);

        await service.DeleteDataAccessPolicyAsync("missing");

        _sent.Should().BeEmpty();
    }

    [Fact]
    public async Task PolicyCreate_SucceedsWhenTheSenderFails()
    {
        _sender.Setup(s => s.SendAsync(It.IsAny<BuiltInNotification>())).ReturnsAsync(false);

        var result = await PolicyService(new Mock<IDbRepository>()).CreateDataAccessPolicyAsync(PolicyRequest());

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task PolicyCreate_PayloadHasNoSecretFields()
    {
        await PolicyService(new Mock<IDbRepository>()).CreateDataAccessPolicyAsync(PolicyRequest());

        var json = System.Text.Json.JsonSerializer.Serialize(_sent.Single().Payload).ToLowerInvariant();
        json.Should().NotContain("password").And.NotContain("token").And.NotContain("secret");
    }

    // data-project-migration-failed
    private MigrationCompletionEventConsumer MigrationConsumer(Mock<IDbRepository> repo, bool schemasAcknowledged = true)
    {
        repo.Setup(r => r.GetItemAsync("MigrationTrackers", It.IsAny<FilterDefinition<BsonDocument>>(), It.IsAny<string>()))
            .ReturnsAsync(new BsonDocument { { "_id", "t1" }, { "ProjectKey", "old" }, { "TargetedProjectKey", "new" }, { "CreatedBy", "mover-1" } });
        repo.Setup(r => r.UpdateManyAsync("SchemaDefinitions", It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = schemasAcknowledged });
        repo.Setup(r => r.UpdateManyAsync("DataServiceConfigurations", It.IsAny<BsonDocument>(), It.IsAny<BsonDocument>(), It.IsAny<string>()))
            .ReturnsAsync(new ActionResponse { Acknowledged = true });
        return new MigrationCompletionEventConsumer(NullLogger<MigrationCompletionEventConsumer>.Instance, repo.Object, _sender.Object);
    }

    [Fact]
    public async Task Migration_FailureNotifiesTheStarterInTheSourceTenant()
    {
        await MigrationConsumer(new Mock<IDbRepository>(), schemasAcknowledged: false)
            .Consume(new MigrationCompletionEvent { TrackerId = "t1", ServiceName = "blocks-data", IsSuccess = true });

        var n = _sent.Single();
        n.ConfigurationName.Should().Be("data-project-migration-failed");
        n.TenantId.Should().Be("old");
        n.UserIds.Should().Equal("mover-1");
    }

    [Fact]
    public async Task Migration_ReportedFailureSendsOnce()
    {
        await MigrationConsumer(new Mock<IDbRepository>(), schemasAcknowledged: false)
            .Consume(new MigrationCompletionEvent { TrackerId = "t1", ServiceName = "blocks-data", IsSuccess = false });

        _sent.Should().ContainSingle();
    }

    [Fact]
    public async Task Migration_SuccessSendsNothing()
    {
        await MigrationConsumer(new Mock<IDbRepository>())
            .Consume(new MigrationCompletionEvent { TrackerId = "t1", ServiceName = "blocks-data", IsSuccess = true });

        _sent.Should().BeEmpty();
    }

    // data-storage-directories-failed
    [Fact]
    public async Task DefaultDirectories_FailureNotifiesTheContextUser()
    {
        var repo = new Mock<IFileDirectoryRepository>();
        repo.Setup(r => r.GetByConfigurationNameAsync("Azure", It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException("db down"));
        var consumer = new CreateDefaultDirectoryEventConsumer(NullLogger<CreateDefaultDirectoryEventConsumer>.Instance, repo.Object, _sender.Object);

        var act = () => consumer.Consume(new CreateDefaultDirectoryEvent { ItemId = "i1", ConfigurationName = "Azure", StorageStrategy = "S", ProjectKey = "p1" });

        await act.Should().NotThrowAsync();
        var n = _sent.Single();
        n.ConfigurationName.Should().Be("data-storage-directories-failed");
        n.TenantId.Should().Be("tenant-1");
        n.UserIds.Should().Equal("user-1");
    }

    [Fact]
    public async Task DefaultDirectories_SuccessSendsNothing()
    {
        var repo = new Mock<IFileDirectoryRepository>();
        repo.Setup(r => r.GetByConfigurationNameAsync("Azure", It.IsAny<CancellationToken>())).ReturnsAsync(new List<FileDirectory>());
        var consumer = new CreateDefaultDirectoryEventConsumer(NullLogger<CreateDefaultDirectoryEventConsumer>.Instance, repo.Object, _sender.Object);

        await consumer.Consume(new CreateDefaultDirectoryEvent { ItemId = "i1", ConfigurationName = "Azure", StorageStrategy = "S", ProjectKey = "p1" });

        _sent.Should().BeEmpty();
    }

    // data-storage-object-shared
    private ObjectController Controller(Mock<IObjectManagementService> management) =>
        new(management.Object, Mock.Of<IObjectDiscoveryService>(), Mock.Of<IFileDirectoryManagementService>(), _sender.Object);

    private static ShareObjectRequest Share(string principalId, ObjectPrincipalType type = ObjectPrincipalType.User) => new()
    {
        ResourceId = "res-1", ResourceType = ObjectResourceType.File, PrincipalType = type,
        PrincipalId = principalId, Permission = ObjectPermission.View,
    };

    private static Mock<IObjectManagementService> ShareSucceeds()
    {
        var management = new Mock<IObjectManagementService>();
        management.Setup(m => m.ShareObjectAsync(It.IsAny<string>(), It.IsAny<ObjectResourceType>(), It.IsAny<ObjectPrincipalType>(),
                It.IsAny<string?>(), It.IsAny<ObjectPermission>(), It.IsAny<DateTime?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(ObjectAccessOperationResult.Success("policy-1"));
        return management;
    }

    [Fact]
    public async Task Share_NotifiesTheAffectedUser()
    {
        await Controller(ShareSucceeds()).ShareObject(Share("friend-1"));

        var n = _sent.Single();
        n.ConfigurationName.Should().Be("data-storage-object-shared");
        n.UserIds.Should().Equal("friend-1");
        n.TenantId.Should().Be("tenant-1");
    }

    [Fact]
    public async Task Share_ToARoleSendsNothing()
    {
        await Controller(ShareSucceeds()).ShareObject(Share("editors", ObjectPrincipalType.Role));

        _sent.Should().BeEmpty();
    }

    [Fact]
    public async Task Share_ToTheActingUserSendsNothing()
    {
        await Controller(ShareSucceeds()).ShareObject(Share("user-1"));

        _sent.Should().BeEmpty();
    }

    [Fact]
    public async Task Share_RefusedSendsNothing()
    {
        var management = new Mock<IObjectManagementService>();
        management.Setup(m => m.ShareObjectAsync(It.IsAny<string>(), It.IsAny<ObjectResourceType>(), It.IsAny<ObjectPrincipalType>(),
                It.IsAny<string?>(), It.IsAny<ObjectPermission>(), It.IsAny<DateTime?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(ObjectAccessOperationResult.Failure(ObjectAccessOperationStatus.NotPermitted));

        await Controller(management).ShareObject(Share("friend-1"));

        _sent.Should().BeEmpty();
    }

    [Fact]
    public async Task Revoke_NotifiesTheUserWhoLostAccess()
    {
        var management = new Mock<IObjectManagementService>();
        management.Setup(m => m.GetAccessAsync("res-1", It.IsAny<CancellationToken>())).ReturnsAsync(new List<ObjectAccessPolicy>
        {
            new() { ItemId = "policy-1", ResourceId = "res-1", ResourceType = ObjectResourceType.File, PrincipalType = ObjectPrincipalType.User, PrincipalId = "friend-1" }
        });
        management.Setup(m => m.RevokeAccessAsync("res-1", "policy-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(ObjectAccessOperationResult.Success("policy-1"));

        await Controller(management).RevokeAccessPolicy(new RevokeAccessRequest { ResourceId = "res-1", PolicyItemId = "policy-1" });

        _sent.Single().UserIds.Should().Equal("friend-1");
    }

    [Fact]
    public async Task Share_StillSucceedsWhenTheSenderFails()
    {
        _sender.Setup(s => s.SendAsync(It.IsAny<BuiltInNotification>())).ReturnsAsync(false);

        var result = await Controller(ShareSucceeds()).ShareObject(Share("friend-1"));

        result.Should().BeOfType<Microsoft.AspNetCore.Mvc.CreatedResult>();
    }
}
