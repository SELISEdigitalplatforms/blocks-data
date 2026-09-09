using Api.Controllers;
using Api.Controllers.DataGateway;
using DataGateway.Api.Controllers;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.Api;

/// <summary>
/// Unit tests for the DataGateway REST controllers: each action is verified to delegate to its
/// service and to surface the service status code, plus the input-validation short-circuits.
/// Services are mocked; no host is booted.
/// </summary>
public class DataGatewayControllerTests
{
    private static int Status(IActionResult r) => ((ObjectResult)r).StatusCode!.Value;

    private static ServiceResponse<ActionResponse> Ok() =>
        new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true });

    // ---------------- SchemaController ----------------

    [Fact]
    public async Task Schema_GetDefinitions_ReturnsOk()
    {
        var svc = new Mock<ISchemaDefinitionService>();
        svc.Setup(s => s.GetAllSchemasAsync(It.IsAny<GetSchemaDefinitionListRequest>()))
            .ReturnsAsync(new PaginationResponse<SchemaDefinitionResponse>(0, new List<SchemaDefinitionResponse>()));
        var controller = new SchemaController(svc.Object, new Mock<ISchemaChangeLogService>().Object);

        var result = await controller.GetSchemaDefinitions(new GetSchemaDefinitionListRequest());

        result.Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task Schema_GetSummary_ReturnsOk()
    {
        var svc = new Mock<ISchemaDefinitionService>();
        svc.Setup(s => s.GetAllSchemasAsync(It.IsAny<GetSchemaDefinitionListRequest>()))
            .ReturnsAsync(new PaginationResponse<SchemaDefinitionResponse>(0, new List<SchemaDefinitionResponse>()));
        svc.Setup(s => s.GetSchemaAggregationAsync())
            .ReturnsAsync(new ServiceResponse<SchemaAggregationResponse>().SetSuccess(new SchemaAggregationResponse()));
        var controller = new SchemaController(svc.Object, new Mock<ISchemaChangeLogService>().Object);

        var result = await controller.GetSchemaDefinitionsSummary(new GetSchemaDefinitionListRequest());

        result.Should().BeOfType<OkObjectResult>();
    }

    [Theory]
    [InlineData("", 400)]
    [InlineData("id-1", 200)]
    public async Task Schema_GetById_ValidatesAndDelegates(string id, int expected)
    {
        var svc = new Mock<ISchemaDefinitionService>();
        svc.Setup(s => s.GetSchemaByIdAsync("id-1"))
            .ReturnsAsync(new ServiceResponse<SchemaDefinitionResponse>().SetSuccess(new SchemaDefinitionResponse()));
        var controller = new SchemaController(svc.Object, new Mock<ISchemaChangeLogService>().Object);

        Status(await controller.GetSchemaDefinitionByIdAsync(id)).Should().Be(expected);
    }

    [Fact]
    public async Task Schema_UnadaptedChangeLogs_Delegates()
    {
        var log = new Mock<ISchemaChangeLogService>();
        log.Setup(s => s.GetUnadaptedSchemaChangeLogsAsync(default))
            .ReturnsAsync(new ServiceResponse<List<SchemaChangeLog>>().SetSuccess(new List<SchemaChangeLog>()));
        var controller = new SchemaController(new Mock<ISchemaDefinitionService>().Object, log.Object);

        Status(await controller.GetUnadaptedSchemaChangeLogs()).Should().Be(200);
    }

    [Theory]
    [InlineData("", 400)]
    [InlineData("pk", 200)]
    public async Task Schema_GetEntityCollections_Validates(string projectKey, int expected)
    {
        var svc = new Mock<ISchemaDefinitionService>();
        svc.Setup(s => s.GetEntityCollectionsAsync())
            .ReturnsAsync(new ServiceResponse<CollectionListResponse>().SetSuccess(new CollectionListResponse()));
        var controller = new SchemaController(svc.Object, new Mock<ISchemaChangeLogService>().Object);

        Status(await controller.GetEntityCollections(projectKey)).Should().Be(expected);
    }

    [Theory]
    [InlineData("", 400)]
    [InlineData("Person", 200)]
    public async Task Schema_GetEntityCollectionByName_Validates(string name, int expected)
    {
        var svc = new Mock<ISchemaDefinitionService>();
        svc.Setup(s => s.GetEntityCollectionByNameAsync("Person"))
            .ReturnsAsync(new ServiceResponse<CollectionDetailResponse>().SetSuccess(new CollectionDetailResponse()));
        var controller = new SchemaController(svc.Object, new Mock<ISchemaChangeLogService>().Object);

        Status(await controller.GetEntityCollectionByNameAsync(name)).Should().Be(expected);
    }

    [Fact]
    public async Task Schema_WriteEndpoints_Delegate()
    {
        var svc = new Mock<ISchemaDefinitionService>();
        svc.Setup(s => s.CreateSchemaDefinitionAsync(It.IsAny<CreateSchemaDefinitionRequest>())).ReturnsAsync(Ok());
        svc.Setup(s => s.CreateSchemaAsync(It.IsAny<CreateSchemaRequest>())).ReturnsAsync(Ok());
        svc.Setup(s => s.SaveFieldDefinitionAsync(It.IsAny<SaveFieldDefinitionRequest>())).ReturnsAsync(Ok());
        svc.Setup(s => s.UpdateSchemaDefinitionAsync(It.IsAny<UpdateSchemaDefinitionRequest>())).ReturnsAsync(Ok());
        svc.Setup(s => s.UpdateSchemaAsync(It.IsAny<UpdateSchemaRequest>())).ReturnsAsync(Ok());
        svc.Setup(s => s.DeleteSchemaAsync("id-1")).ReturnsAsync(Ok());
        var controller = new SchemaController(svc.Object, new Mock<ISchemaChangeLogService>().Object);

        Status(await controller.CreateSchemaDefinition(new CreateSchemaDefinitionRequest())).Should().Be(200);
        Status(await controller.CreateSchema(new CreateSchemaRequest())).Should().Be(200);
        Status(await controller.SaveSchemaFields(new SaveFieldDefinitionRequest())).Should().Be(200);
        Status(await controller.UpdateSchemaDefinition(new UpdateSchemaDefinitionRequest())).Should().Be(200);
        Status(await controller.UpdateSchema(new UpdateSchemaRequest())).Should().Be(200);
        Status(await controller.DeleteSchemaDefinitionAsync("id-1")).Should().Be(200);
        Status(await controller.DeleteSchemaDefinitionAsync("")).Should().Be(400);
    }

    // ---------------- SchemaIndexController ----------------

    [Fact]
    public async Task SchemaIndex_Get_ValidatesAndDelegates()
    {
        var svc = new Mock<ISchemaIndexService>();
        svc.Setup(s => s.GetIndexesAsync("schema-1"))
            .ReturnsAsync(new ServiceResponse<SchemaIndexListResponse>().SetSuccess(new SchemaIndexListResponse()));
        var controller = new SchemaIndexController(svc.Object);

        Status(await controller.GetSchemaIndexes("schema-1")).Should().Be(200);
        Status(await controller.GetSchemaIndexes("")).Should().Be(400);
    }

    [Fact]
    public async Task SchemaIndex_Create_Delegates()
    {
        var svc = new Mock<ISchemaIndexService>();
        svc.Setup(s => s.CreateIndexAsync(It.IsAny<CreateSchemaIndexRequest>())).ReturnsAsync(Ok());
        var controller = new SchemaIndexController(svc.Object);

        Status(await controller.CreateSchemaIndex(new CreateSchemaIndexRequest())).Should().Be(200);
    }

    [Fact]
    public async Task SchemaIndex_Delete_ValidatesAndDelegates()
    {
        var svc = new Mock<ISchemaIndexService>();
        svc.Setup(s => s.DeleteIndexAsync("idx-1")).ReturnsAsync(Ok());
        var controller = new SchemaIndexController(svc.Object);

        Status(await controller.DeleteSchemaIndex("idx-1")).Should().Be(200);
        Status(await controller.DeleteSchemaIndex("")).Should().Be(400);
    }

    // ---------------- DataValidationController ----------------

    [Fact]
    public async Task DataValidation_AllActions()
    {
        var svc = new Mock<IDataValidationService>();
        svc.Setup(s => s.GetAllDataValidationsAsync(It.IsAny<GetDataValidationListRequest>()))
            .ReturnsAsync(new ServiceResponse<PaginationResponse<DataValidationResponse>>()
                .SetSuccess(new PaginationResponse<DataValidationResponse>(0, new List<DataValidationResponse>())));
        svc.Setup(s => s.GetDataValidationByIdAsync("v1"))
            .ReturnsAsync(new ServiceResponse<DataValidationResponse>().SetSuccess(new DataValidationResponse()));
        svc.Setup(s => s.GetValidationsBySchemaIdAsync("s1"))
            .ReturnsAsync(new ServiceResponse<List<DataValidationResponse>>().SetSuccess(new List<DataValidationResponse>()));
        svc.Setup(s => s.GetValidationBySchemaAndFieldAsync("s1", "f1"))
            .ReturnsAsync(new ServiceResponse<DataValidationResponse>().SetSuccess(new DataValidationResponse()));
        svc.Setup(s => s.CreateDataValidationAsync(It.IsAny<CreateDataValidationRequest>())).ReturnsAsync(Ok());
        svc.Setup(s => s.UpdateDataValidationAsync(It.IsAny<UpdateDataValidationRequest>())).ReturnsAsync(Ok());
        svc.Setup(s => s.DeleteDataValidationAsync("v1")).ReturnsAsync(Ok());
        var c = new DataValidationController(svc.Object);

        Status(await c.GetDataValidations(new GetDataValidationListRequest())).Should().Be(200);
        Status(await c.GetDataValidationByIdAsync("")).Should().Be(400);
        Status(await c.GetDataValidationByIdAsync("v1")).Should().Be(200);
        Status(await c.GetValidationsBySchemaIdAsync("")).Should().Be(400);
        Status(await c.GetValidationsBySchemaIdAsync("s1")).Should().Be(200);
        Status(await c.GetValidationBySchemaAndFieldAsync("", "f1")).Should().Be(400);
        Status(await c.GetValidationBySchemaAndFieldAsync("s1", "f1")).Should().Be(200);
        Status(await c.CreateDataValidation(new CreateDataValidationRequest())).Should().Be(200);
        Status(await c.UpdateDataValidation(new UpdateDataValidationRequest())).Should().Be(200);
        Status(await c.DeleteDataValidationAsync("")).Should().Be(400);
        Status(await c.DeleteDataValidationAsync("v1")).Should().Be(200);
    }

    // ---------------- DataAccessController ----------------

    [Fact]
    public async Task DataAccess_AllActions()
    {
        var svc = new Mock<IDataAccessService>();
        svc.Setup(s => s.ConfigureSecurityAsync(It.IsAny<ConfigureSchemaSecurityRequest>())).ReturnsAsync(Ok());
        svc.Setup(s => s.CreateDataAccessPolicyAsync(It.IsAny<CreateDataAccessPolicyRequest>())).ReturnsAsync(Ok());
        svc.Setup(s => s.UpdateDataAccessPolicyAsync(It.IsAny<UpdateDataAccessPolicyRequest>())).ReturnsAsync(Ok());
        svc.Setup(s => s.DeleteDataAccessPolicyAsync("i1")).ReturnsAsync(Ok());
        svc.Setup(s => s.GetEntityDataAccessPolicyAsync("Person"))
            .ReturnsAsync(new ServiceResponse<List<DataAccessPolicyResponse>>().SetSuccess(new List<DataAccessPolicyResponse>()));
        var c = new DataAccessController(svc.Object);

        Status(await c.ConfigureSecurity(new ConfigureSchemaSecurityRequest())).Should().Be(200);
        Status(await c.CreateDataAccessPolicy(new CreateDataAccessPolicyRequest())).Should().Be(200);
        Status(await c.UpdateDataAccessPolicy(new UpdateDataAccessPolicyRequest())).Should().Be(200);
        Status(await c.DeleteDataAccessPolicy("")).Should().Be(400);
        Status(await c.DeleteDataAccessPolicy("i1")).Should().Be(200);
        Status(await c.GetDataAccessPolicy("")).Should().Be(400);
        Status(await c.GetDataAccessPolicy("Person")).Should().Be(200);
    }

    // ---------------- ConfigurationController ----------------

    [Fact]
    public async Task Configuration_Get_Insert_Update_HappyPaths()
    {
        ClearContext();
        SetContext(tenantId: "t1");
        try
        {
            var svc = new Mock<IDataGatewayConfigurationService>();
            svc.Setup(s => s.GetConfiguration(It.IsAny<string>()))
                .ReturnsAsync(new ServiceResponse<DataGatewayConfigurationResponse>().SetSuccess(new DataGatewayConfigurationResponse()));
            svc.Setup(s => s.InsertConfiguration(It.IsAny<CreateDataGatewayConfigurationRequest>())).ReturnsAsync(Ok());
            svc.Setup(s => s.UpdateConfiguration(It.IsAny<UpdateDataGatewayConfigurationRequest>())).ReturnsAsync(Ok());
            var c = new ConfigurationController(svc.Object, NullLogger<ConfigurationController>.Instance);

            (await c.GetConfigurationAsync()).Should().BeOfType<OkObjectResult>();
            Status(await c.InsertDataSourceAsync(new CreateDataGatewayConfigurationRequest())).Should().Be(200);
            Status(await c.UpdateDataSourceAsync(new UpdateDataGatewayConfigurationRequest())).Should().Be(200);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task Configuration_Get_OnException_Returns500()
    {
        ClearContext();
        SetContext(tenantId: "t1");
        try
        {
            var svc = new Mock<IDataGatewayConfigurationService>();
            svc.Setup(s => s.GetConfiguration(It.IsAny<string>())).ThrowsAsync(new InvalidOperationException("boom"));
            var c = new ConfigurationController(svc.Object, NullLogger<ConfigurationController>.Instance);

            Status(await c.GetConfigurationAsync()).Should().Be(500);
        }
        finally { ClearContext(); }
    }
}
