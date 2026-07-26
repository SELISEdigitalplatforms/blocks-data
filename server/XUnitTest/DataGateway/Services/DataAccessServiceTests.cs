using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;
using MongoDB.Driver;
using Moq;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

[Collection("ContextSerial")]
public class DataAccessServiceTests
{
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<IRequestValidator> _validator = new();
    private readonly Mock<ISchemaChangeLogService> _changeLog = new();
    private readonly DataAccessService _service;

    public DataAccessServiceTests()
    {
        BlocksTestContext.Set();
        _validator.Setup(v => v.ValidateAsync(It.IsAny<ConfigureSchemaSecurityRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateDataAccessPolicyRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateDataAccessPolicyRequest>())).ReturnsAsync(new ValidationResult());
        _repo.Setup(r => r.UpdateAsync(It.IsAny<SchemaDefinition>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });
        _repo.Setup(r => r.InsertAsync(It.IsAny<DataAccessPolicy>(), "")).ReturnsAsync((DataAccessPolicy p, string _) => p);
        _service = new DataAccessService(_repo.Object, _validator.Object, _changeLog.Object);
    }

    private static SchemaDefinition Schema() => new()
    {
        ItemId = "schema-1",
        SchemaName = "Person",
        Fields = new List<FieldDefinition>
        {
            new() { Name = "Email", Type = "String" },
            new() { Name = "Age", Type = "Int" }
        }
    };

    [Fact]
    public async Task ConfigureSecurity_InvalidRequest_ReturnsErrors()
    {
        _validator.Setup(v => v.ValidateAsync(It.IsAny<ConfigureSchemaSecurityRequest>()))
            .ReturnsAsync(new ValidationResult(new[] { new ValidationFailure("SchemaId", "req") }));

        var result = await _service.ConfigureSecurityAsync(new ConfigureSchemaSecurityRequest());

        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().ContainSingle();
    }

    [Fact]
    public async Task ConfigureSecurity_SchemaNotFound_Returns400()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync((SchemaDefinition?)null);

        var result = await _service.ConfigureSecurityAsync(new ConfigureSchemaSecurityRequest { SchemaId = "x", PolicyType = PolicyType.RLS });

        result.IsSuccess.Should().BeFalse();
        result.Message.Should().Be("INVALID_SCHEMA_ID");
        result.HttpStatusCode.Should().Be(400);
    }

    [Fact]
    public async Task ConfigureSecurity_RlsWithFieldNames_Rejected()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(Schema());

        var result = await _service.ConfigureSecurityAsync(new ConfigureSchemaSecurityRequest
        {
            SchemaId = "schema-1",
            PolicyType = PolicyType.RLS,
            FieldNames = new[] { "Email" }
        });

        result.Message.Should().Be("FIELD_NAMES_ARE_NOT_ALLOWED_FOR_ROW_LEVEL_SECURITY");
    }

    [Theory]
    [InlineData(PolicyOperation.READ)]
    [InlineData(PolicyOperation.WRITE)]
    [InlineData(PolicyOperation.EDIT)]
    [InlineData(PolicyOperation.DELETE)]
    public async Task ConfigureSecurity_Rls_SetsSchemaAccessLevel(PolicyOperation op)
    {
        var schema = Schema();
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);

        var result = await _service.ConfigureSecurityAsync(new ConfigureSchemaSecurityRequest
        {
            SchemaId = "schema-1",
            PolicyType = PolicyType.RLS,
            Operation = op,
            AccessLevel = SchemaAccessLevel.Custom,
            FieldNames = Array.Empty<string>()
        });

        result.IsSuccess.Should().BeTrue();
        result.Message.Should().Be("CONFIGURATION_SAVED");
        var level = op switch
        {
            PolicyOperation.READ => schema.ReadAccessLevel,
            PolicyOperation.WRITE => schema.WriteAccessLevel,
            PolicyOperation.EDIT => schema.EditAccessLevel,
            _ => schema.DeleteAccessLevel
        };
        level.Should().Be(SchemaAccessLevel.Custom);
    }

    [Fact]
    public async Task ConfigureSecurity_Cls_SetsFieldAccessLevel()
    {
        var schema = Schema();
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);

        var result = await _service.ConfigureSecurityAsync(new ConfigureSchemaSecurityRequest
        {
            SchemaId = "schema-1",
            PolicyType = PolicyType.CLS,
            Operation = PolicyOperation.READ,
            AccessLevel = SchemaAccessLevel.Custom,
            FieldNames = new[] { "Email" }
        });

        result.IsSuccess.Should().BeTrue();
        schema.Fields.First(f => f.Name == "Email").ReadAccessLevel.Should().Be(SchemaAccessLevel.Custom);
    }

    [Fact]
    public async Task ConfigureSecurity_ClsNullFieldNames_Rejected()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(Schema());

        var result = await _service.ConfigureSecurityAsync(new ConfigureSchemaSecurityRequest
        {
            SchemaId = "schema-1",
            PolicyType = PolicyType.CLS,
            FieldNames = null!
        });

        result.Message.Should().Be("FIELD_NAMES_ARE_REQUIRED_FOR_COLUMN_LEVEL_SECURITY");
    }

    [Fact]
    public async Task ConfigureSecurity_ClsInvalidField_Rejected()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(Schema());

        var result = await _service.ConfigureSecurityAsync(new ConfigureSchemaSecurityRequest
        {
            SchemaId = "schema-1",
            PolicyType = PolicyType.CLS,
            FieldNames = new[] { "DoesNotExist" }
        });

        result.Message.Should().Be("INVALID_FIELD_NAMES");
    }

    [Fact]
    public async Task CreatePolicy_Rls_InsertsAndLogs()
    {
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(Schema());

        var result = await _service.CreateDataAccessPolicyAsync(new CreateDataAccessPolicyRequest
        {
            SchemaId = "schema-1",
            PolicyName = "P1",
            PolicyType = PolicyType.RLS,
            Operation = PolicyOperation.READ,
            FieldNames = Array.Empty<string>()
        });

        result.IsSuccess.Should().BeTrue();
        result.Data!.TotalImpactedData.Should().Be(1);
        _repo.Verify(r => r.InsertAsync(It.Is<DataAccessPolicy>(p => p.SchemaName == "Person"), ""), Times.Once);
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync("schema-1", SchemaChangeType.SchemaPolicyCreate, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreatePolicy_Cls_ChangesFieldLevelToCustom()
    {
        var schema = Schema();
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(schema);

        var result = await _service.CreateDataAccessPolicyAsync(new CreateDataAccessPolicyRequest
        {
            SchemaId = "schema-1",
            PolicyName = "P1",
            PolicyType = PolicyType.CLS,
            Operation = PolicyOperation.WRITE,
            FieldNames = new[] { "Email" }
        });

        result.IsSuccess.Should().BeTrue();
        schema.Fields.First(f => f.Name == "Email").WriteAccessLevel.Should().Be(SchemaAccessLevel.Custom);
    }

    [Fact]
    public async Task CreatePolicy_InvalidRequest_ReturnsErrors()
    {
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateDataAccessPolicyRequest>()))
            .ReturnsAsync(new ValidationResult(new[] { new ValidationFailure("PolicyName", "req") }));

        var result = await _service.CreateDataAccessPolicyAsync(new CreateDataAccessPolicyRequest());

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task UpdatePolicy_NotFound_Returns400()
    {
        _repo.Setup(r => r.GetItemAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<DataAccessPolicy>>(), "")).ReturnsAsync((DataAccessPolicy?)null);

        var result = await _service.UpdateDataAccessPolicyAsync(new UpdateDataAccessPolicyRequest { ItemId = "x" });

        result.Message.Should().Be("Data_Access_Policy_Not_Found");
        result.HttpStatusCode.Should().Be(400);
    }

    [Fact]
    public async Task UpdatePolicy_Valid_Updates()
    {
        var policy = new DataAccessPolicy { ItemId = "p1", SchemaId = "schema-1", PolicyType = PolicyType.RLS, PolicyName = "old" };
        _repo.Setup(r => r.GetItemAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<DataAccessPolicy>>(), "")).ReturnsAsync(policy);
        _repo.Setup(r => r.GetItemAsync<SchemaDefinition>(It.IsAny<string>(), "")).ReturnsAsync(Schema());
        _repo.Setup(r => r.UpdateAsync(It.IsAny<FilterDefinition<DataAccessPolicy>>(), It.IsAny<DataAccessPolicy>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });

        var result = await _service.UpdateDataAccessPolicyAsync(new UpdateDataAccessPolicyRequest
        {
            ItemId = "p1",
            PolicyName = "new",
            FieldNames = Array.Empty<string>()
        });

        result.IsSuccess.Should().BeTrue();
        policy.PolicyName.Should().Be("new");
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync("p1", SchemaChangeType.SchemaPolicyUpdate, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task DeletePolicy_NotFound_Returns404()
    {
        _repo.Setup(r => r.GetItemAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<DataAccessPolicy>>(), "")).ReturnsAsync((DataAccessPolicy?)null);

        var result = await _service.DeleteDataAccessPolicyAsync("x");

        result.HttpStatusCode.Should().Be(404);
    }

    [Fact]
    public async Task DeletePolicy_Found_Deletes()
    {
        _repo.Setup(r => r.GetItemAsync<DataAccessPolicy>(It.IsAny<FilterDefinition<DataAccessPolicy>>(), "")).ReturnsAsync(new DataAccessPolicy { ItemId = "p1" });
        _repo.Setup(r => r.DeleteAsync(It.IsAny<FilterDefinition<DataAccessPolicy>>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true });

        var result = await _service.DeleteDataAccessPolicyAsync("p1");

        result.IsSuccess.Should().BeTrue();
        result.Data!.ItemId.Should().Be("p1");
    }

    [Fact]
    public async Task GetEntityPolicies_ReturnsList()
    {
        _repo.Setup(r => r.GetItemsAsync<DataAccessPolicy, DataAccessPolicyResponse>(
                It.IsAny<FilterDefinition<DataAccessPolicy>>(), null, ""))
            .ReturnsAsync(new List<DataAccessPolicyResponse> { new() { ItemId = "1" } });

        var result = await _service.GetEntityDataAccessPolicyAsync("Person");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Should().ContainSingle();
    }
}
