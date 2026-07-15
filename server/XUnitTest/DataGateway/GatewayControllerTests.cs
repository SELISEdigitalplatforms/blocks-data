using Api.Controllers;
using DataGateway.DomainService.Exceptions;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Requests;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

[Collection("ContextSerial")]
public class GatewayControllerTests
{
    private readonly Mock<IGatewayQueryService> _query = new();
    private readonly Mock<IGatewayMutationService> _mutation = new();
    private readonly Mock<ISchemaDefinitionRegistry> _registry = new();
    private readonly GatewayController _controller;

    public GatewayControllerTests()
    {
        var accessControl = new RestAccessControlService();
        _controller = new GatewayController(_query.Object, _mutation.Object, _registry.Object, accessControl);

        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["x-blocks-key"] = "key";
        _controller.ControllerContext = new ControllerContext { HttpContext = ctx };

        _registry.Setup(r => r.GetByNameAsync(It.IsAny<string>()))
            .ReturnsAsync(Schema()); // Public schema by default
    }

    [Fact]
    public async Task List_ReturnsOkWithQueryResponse()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _query.Setup(q => q.QueryAsync(It.IsAny<GatewayQueryRequest>(), It.IsAny<SchemaDefinitionExtended>()))
                .ReturnsAsync(new QueryResponse<Dictionary<string, object>> { TotalCount = 3 });

            var result = await _controller.List("Person", 1, 10, null, null, null);

            result.Should().BeOfType<OkObjectResult>()
                .Which.Value.Should().BeOfType<QueryResponse<Dictionary<string, object>>>()
                .Which.TotalCount.Should().Be(3);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task List_UnknownSchema_ThrowsEntityNotFound()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _registry.Setup(r => r.GetByNameAsync(It.IsAny<string>())).ReturnsAsync((SchemaDefinitionExtended?)null);
            var act = () => _controller.List("Ghost", null, null, null, null, null);
            await act.Should().ThrowAsync<EntityNotFoundException>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task Search_CoercesAndReturnsOk()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _query.Setup(q => q.QueryAsync(It.IsAny<GatewayQueryRequest>(), It.IsAny<SchemaDefinitionExtended>()))
                .ReturnsAsync(new QueryResponse<Dictionary<string, object>>());

            var result = await _controller.Search("Person", new GatewayQueryRequest());
            result.Should().BeOfType<OkObjectResult>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task GetById_Found_ReturnsOk()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _query.Setup(q => q.GetByIdAsync("1", It.IsAny<List<string>?>(), It.IsAny<SchemaDefinitionExtended>()))
                .ReturnsAsync(new Dictionary<string, object> { ["Name"] = "John" });

            var result = await _controller.GetById("Person", "1", null);
            result.Should().BeOfType<OkObjectResult>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task GetById_NotFound_ReturnsNotFound()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _query.Setup(q => q.GetByIdAsync(It.IsAny<string>(), It.IsAny<List<string>?>(), It.IsAny<SchemaDefinitionExtended>()))
                .ReturnsAsync((Dictionary<string, object>?)null);

            var result = await _controller.GetById("Person", "missing", null);
            result.Should().BeOfType<NotFoundObjectResult>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task Create_Returns201()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _mutation.Setup(m => m.InsertAsync(It.IsAny<SchemaDefinitionExtended>(), It.IsAny<Dictionary<string, object?>>()))
                .ReturnsAsync(new ActionResponse { Acknowledged = true, ItemId = "new-id" });

            var result = await _controller.Create("Person", new Dictionary<string, object?> { ["Name"] = "John" });
            result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(StatusCodes.Status201Created);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task Update_Found_ReturnsOk()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _mutation.Setup(m => m.UpdateAsync(It.IsAny<SchemaDefinitionExtended>(), "1", It.IsAny<Dictionary<string, object?>>()))
                .ReturnsAsync(new ActionResponse { Acknowledged = true, ItemId = "1" });

            var result = await _controller.Update("Person", "1", new Dictionary<string, object?> { ["Name"] = "New" });
            result.Should().BeOfType<OkObjectResult>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task Update_NotFound_ReturnsNotFound()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _mutation.Setup(m => m.UpdateAsync(It.IsAny<SchemaDefinitionExtended>(), It.IsAny<string>(), It.IsAny<Dictionary<string, object?>>()))
                .ReturnsAsync(new ActionResponse { Acknowledged = false, Message = "Record not found." });

            var result = await _controller.Update("Person", "missing", new Dictionary<string, object?>());
            result.Should().BeOfType<NotFoundObjectResult>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task Delete_Ack_ReturnsNoContent()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _mutation.Setup(m => m.DeleteAsync(It.IsAny<SchemaDefinitionExtended>(), "1", false))
                .ReturnsAsync(new ActionResponse { Acknowledged = true, ItemId = "1" });

            var result = await _controller.Delete("Person", "1", false);
            result.Should().BeOfType<NoContentResult>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task Delete_NotFound_ReturnsNotFound()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _mutation.Setup(m => m.DeleteAsync(It.IsAny<SchemaDefinitionExtended>(), It.IsAny<string>(), It.IsAny<bool>()))
                .ReturnsAsync(new ActionResponse { Acknowledged = false, Message = "Record not found." });

            var result = await _controller.Delete("Person", "missing", false);
            result.Should().BeOfType<NotFoundObjectResult>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task BulkInsert_Returns201()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _mutation.Setup(m => m.BulkInsertAsync(It.IsAny<SchemaDefinitionExtended>(), It.IsAny<List<Dictionary<string, object?>>>()))
                .ReturnsAsync(new BulkActionResponse { Acknowledged = true, TotalImpactedData = 2 });

            var request = new GatewayBulkInsertRequest
            {
                Items = new List<Dictionary<string, object?>> { new() { ["Name"] = "A" }, new() { ["Name"] = "B" } }
            };
            var result = await _controller.BulkInsert("Person", request);
            result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(StatusCodes.Status201Created);
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task BulkUpdate_ReturnsOk()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _mutation.Setup(m => m.BulkUpdateAsync(It.IsAny<SchemaDefinitionExtended>(), It.IsAny<GatewayBulkUpdateRequest>()))
                .ReturnsAsync(new ActionResponse { Acknowledged = true });

            var result = await _controller.BulkUpdate("Person", new GatewayBulkUpdateRequest { Input = new() { ["Name"] = "x" } });
            result.Should().BeOfType<OkObjectResult>();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public async Task BulkDelete_ReturnsOk()
    {
        ClearContext();
        SetBlocksCloud(true);
        try
        {
            _mutation.Setup(m => m.BulkDeleteAsync(It.IsAny<SchemaDefinitionExtended>(), It.IsAny<GatewayBulkDeleteRequest>()))
                .ReturnsAsync(new ActionResponse { Acknowledged = true });

            var result = await _controller.BulkDelete("Person", new GatewayBulkDeleteRequest());
            result.Should().BeOfType<OkObjectResult>();
        }
        finally { ClearContext(); }
    }
}
