using Api.Controllers.DataGateway;
using BlocksTemplate.Api.Controllers;
using DataGateway.Api.Controllers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Services.RegexAssistant;
using FluentAssertions;
using FluentValidation.Results;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.Api;

/// <summary>
/// Unit tests for the DataGateway REST controllers that were not already exercised by
/// <see cref="DataGatewayControllerTests"/>: regex assistance, schema import/export, schema reload,
/// mock data and the constructor guards. Services are mocked; no host is booted.
/// </summary>
[Collection("ContextSerial")]
public class DataGatewayControllerExtraTests
{
    private static int Status(IActionResult r) => ((ObjectResult)r).StatusCode!.Value;

    private static ServiceResponse<ActionResponse> Ok() =>
        new ServiceResponse<ActionResponse>().SetSuccess(new ActionResponse { Acknowledged = true });

    private static ServiceResponse<ActionResponse> Failed(int statusCode = 400) =>
        new ServiceResponse<ActionResponse>().SetErrors(
            new List<ValidationFailure> { new("FileId", "required") }, statusCode);

    private static object? Read(object? value, string propertyName)
        => value?.GetType().GetProperty(propertyName)?.GetValue(value);

    // ---------------- RegexAssistantController ----------------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Regex_GenerateRegex_RejectsAMissingDescription(string? description)
    {
        var svc = new Mock<IRegexAssistantService>();
        var controller = new RegexAssistantController(svc.Object);

        var result = await controller.GenerateRegex(new RegexAssistantRequest { Description = description! });

        result.Should().BeOfType<BadRequestObjectResult>();
        svc.Verify(s => s.GenerateRegexPattern(It.IsAny<RegexAssistantRequest>()), Times.Never);
    }

    [Fact]
    public async Task Regex_GenerateRegex_RejectsANullRequestBody()
    {
        var svc = new Mock<IRegexAssistantService>();
        var controller = new RegexAssistantController(svc.Object);

        var result = await controller.GenerateRegex(null!);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Regex_GenerateRegex_ReturnsThePatternAndTheLastErrorMessage()
    {
        var svc = new Mock<IRegexAssistantService>();
        svc.Setup(s => s.GenerateRegexPattern(It.IsAny<RegexAssistantRequest>())).ReturnsAsync("^a+$");
        svc.Setup(s => s.GetLastErrorMessage()).Returns("fell back to the default pattern");
        var controller = new RegexAssistantController(svc.Object);

        var result = await controller.GenerateRegex(new RegexAssistantRequest { Description = "one or more a" });

        var payload = result.Should().BeOfType<ObjectResult>().Subject;
        payload.StatusCode.Should().Be(200);
        Read(payload.Value, "pattern").Should().Be("^a+$");
        Read(payload.Value, "errorMessage").Should().Be("fell back to the default pattern");
    }

    // ---------------- SchemaExchangeController ----------------

    [Fact]
    public async Task SchemaExchange_Export_SurfacesTheServiceStatusCode()
    {
        var export = new Mock<ISchemaExportService>();
        var import = new Mock<ISchemaImportService>();
        var request = new ExportSchemaRequest { ExportOption = SchemaExportOption.All };
        export.Setup(s => s.InitiateExportAsync(request)).ReturnsAsync(Ok());
        var controller = new SchemaExchangeController(export.Object, import.Object);

        Status(await controller.ExportSchemas(request)).Should().Be(200);
        export.Verify(s => s.InitiateExportAsync(request), Times.Once);
    }

    [Fact]
    public async Task SchemaExchange_Export_SurfacesTheServiceFailureStatusCode()
    {
        var export = new Mock<ISchemaExportService>();
        export.Setup(s => s.InitiateExportAsync(It.IsAny<ExportSchemaRequest>())).ReturnsAsync(Failed(500));
        var controller = new SchemaExchangeController(export.Object, new Mock<ISchemaImportService>().Object);

        Status(await controller.ExportSchemas(new ExportSchemaRequest())).Should().Be(500);
    }

    [Fact]
    public async Task SchemaExchange_Import_SurfacesTheServiceStatusCode()
    {
        var import = new Mock<ISchemaImportService>();
        var request = new ImportSchemaRequest { FileId = "file-1" };
        import.Setup(s => s.InitiateImportAsync(request)).ReturnsAsync(Ok());
        var controller = new SchemaExchangeController(new Mock<ISchemaExportService>().Object, import.Object);

        Status(await controller.ImportSchemas(request)).Should().Be(200);
        import.Verify(s => s.InitiateImportAsync(request), Times.Once);
    }

    [Fact]
    public async Task SchemaExchange_Import_SurfacesTheServiceFailureStatusCode()
    {
        var import = new Mock<ISchemaImportService>();
        import.Setup(s => s.InitiateImportAsync(It.IsAny<ImportSchemaRequest>())).ReturnsAsync(Failed());
        var controller = new SchemaExchangeController(new Mock<ISchemaExportService>().Object, import.Object);

        Status(await controller.ImportSchemas(new ImportSchemaRequest { FileId = "" })).Should().Be(400);
    }

    // ---------------- SchemaConfigurationController ----------------

    [Fact]
    public async Task SchemaConfiguration_Reload_ReloadsForTheAmbientTenant()
    {
        ClearContext();
        SetContext(tenantId: "t-reload");
        try
        {
            var svc = new Mock<ISchemaConfigurationService>();
            var controller = new SchemaConfigurationController(svc.Object, NullLogger<SchemaConfigurationController>.Instance);

            var result = await controller.ReloadDataGatewayServerAsync();

            result.Should().BeOfType<OkObjectResult>();
            svc.Verify(s => s.ReloadAsync("t-reload", It.IsAny<CancellationToken>()), Times.Once);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task SchemaConfiguration_Reload_Returns500WhenTheServiceThrows()
    {
        ClearContext();
        SetContext(tenantId: "t-reload");
        try
        {
            var svc = new Mock<ISchemaConfigurationService>();
            svc.Setup(s => s.ReloadAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ThrowsAsync(new InvalidOperationException("boom"));
            var controller = new SchemaConfigurationController(svc.Object, NullLogger<SchemaConfigurationController>.Instance);

            var result = await controller.ReloadDataGatewayServerAsync();

            Status(result).Should().Be(500);
            Read(((ObjectResult)result).Value, "message").Should().Be("boom");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void SchemaConfiguration_Constructor_RejectsNullDependencies()
    {
        var svc = new Mock<ISchemaConfigurationService>().Object;

        Assert.Throws<ArgumentNullException>(() =>
            new SchemaConfigurationController(null!, NullLogger<SchemaConfigurationController>.Instance));
        Assert.Throws<ArgumentNullException>(() => new SchemaConfigurationController(svc, null!));
    }

    // ---------------- MockDataController ----------------

    [Fact]
    public async Task MockData_Get_ReturnsOkWithTheServiceResponse()
    {
        var svc = new Mock<IMockDataService>();
        var response = new ServiceResponse<MockDataResponse>().SetSuccess(new MockDataResponse());
        svc.Setup(s => s.GetMockData()).ReturnsAsync(response);
        var controller = new MockDataController(svc.Object);

        var result = await controller.GetMockDataAsync();

        result.Should().BeOfType<OkObjectResult>().Which.Value.Should().BeSameAs(response);
    }

    [Fact]
    public async Task MockData_Delete_RejectsANullSchemaNameList()
    {
        var svc = new Mock<IMockDataService>();
        var controller = new MockDataController(svc.Object);

        var result = await controller.DeleteMockData(new DeleteMockDataRequest { SchemaNames = null! });

        result.Should().BeOfType<BadRequestObjectResult>();
        svc.Verify(s => s.DeleteMockData(It.IsAny<DeleteMockDataRequest>()), Times.Never);
    }

    [Fact]
    public async Task MockData_Delete_RejectsAnEmptySchemaNameList()
    {
        var svc = new Mock<IMockDataService>();
        var controller = new MockDataController(svc.Object);

        var result = await controller.DeleteMockData(new DeleteMockDataRequest { SchemaNames = [] });

        result.Should().BeOfType<BadRequestObjectResult>();
        svc.Verify(s => s.DeleteMockData(It.IsAny<DeleteMockDataRequest>()), Times.Never);
    }

    [Fact]
    public async Task MockData_Delete_SurfacesTheServiceStatusCode()
    {
        var svc = new Mock<IMockDataService>();
        var request = new DeleteMockDataRequest { SchemaNames = ["Person"] };
        svc.Setup(s => s.DeleteMockData(request)).ReturnsAsync(Ok());
        var controller = new MockDataController(svc.Object);

        Status(await controller.DeleteMockData(request)).Should().Be(200);
        svc.Verify(s => s.DeleteMockData(request), Times.Once);
    }

    [Fact]
    public void MockData_Constructor_RejectsANullService()
        => Assert.Throws<ArgumentException>(() => new MockDataController(null!));

    // ---------------- ConfigurationController error branches ----------------

    [Fact]
    public async Task Configuration_Insert_Returns500WhenTheServiceThrows()
    {
        var svc = new Mock<IDataGatewayConfigurationService>();
        svc.Setup(s => s.InsertConfiguration(It.IsAny<CreateDataGatewayConfigurationRequest>()))
            .ThrowsAsync(new InvalidOperationException("insert failed"));
        var controller = new ConfigurationController(svc.Object, NullLogger<ConfigurationController>.Instance);

        var result = await controller.InsertDataSourceAsync(new CreateDataGatewayConfigurationRequest());

        Status(result).Should().Be(500);
        Read(((ObjectResult)result).Value, "message").Should().Be("insert failed");
    }

    [Fact]
    public async Task Configuration_Update_Returns500WhenTheServiceThrows()
    {
        var svc = new Mock<IDataGatewayConfigurationService>();
        svc.Setup(s => s.UpdateConfiguration(It.IsAny<UpdateDataGatewayConfigurationRequest>()))
            .ThrowsAsync(new InvalidOperationException("update failed"));
        var controller = new ConfigurationController(svc.Object, NullLogger<ConfigurationController>.Instance);

        var result = await controller.UpdateDataSourceAsync(new UpdateDataGatewayConfigurationRequest());

        Status(result).Should().Be(500);
        Read(((ObjectResult)result).Value, "message").Should().Be("update failed");
    }

    [Fact]
    public void Configuration_Constructor_RejectsNullDependencies()
    {
        var svc = new Mock<IDataGatewayConfigurationService>().Object;

        Assert.Throws<ArgumentNullException>(() =>
            new ConfigurationController(null!, NullLogger<ConfigurationController>.Instance));
        Assert.Throws<ArgumentNullException>(() => new ConfigurationController(svc, null!));
    }
}
