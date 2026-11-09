using System.Text.Json;
using Api.Controllers;
using DataGateway.Rest;
using DataGateway.Rest.Errors;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace XUnitTest.Api;

/// <summary>
/// <see cref="DataGatewayController"/> is a thin shell: each action hands the request to the REST service and writes
/// its <see cref="RestResult"/> as it is, with the status, the <c>Location</c> header when there is one, and
/// <c>application/problem+json</c> for a problem body.
/// </summary>
public class DataGatewayRestControllerTests
{
    private readonly Mock<IGatewayRestService> _service = new(MockBehavior.Strict);
    private readonly DefaultHttpContext _http = new();
    private readonly DataGatewayController _sut;

    public DataGatewayRestControllerTests()
    {
        _sut = new DataGatewayController(_service.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = _http },
        };
    }

    private static JsonElement Json(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static RestResult Ok() => new(200, new RestItemResponse(true, "i1"));

    private static ObjectResult Written(IActionResult result) => result.Should().BeOfType<ObjectResult>().Subject;

    [Fact]
    public async Task Get_Query_PassesTheRequestAndNoBody()
    {
        var expected = new RestResult(200, new RestListResponse([], 1, 10, false));
        _service.Setup(s => s.GetAsync(_http, "Person", null)).ReturnsAsync(expected);

        var result = Written(await _sut.Get("Person"));

        result.StatusCode.Should().Be(200);
        result.Value.Should().BeSameAs(expected.Body);
        _service.VerifyAll();
    }

    [Fact]
    public async Task Query_PassesTheBody()
    {
        var body = Json("""{"where":{"Name":{"eq":"a"}}}""");
        var expected = new RestResult(200, new RestListResponse([], 1, 10, false));
        _service.Setup(s => s.GetAsync(_http, "Person", It.Is<JsonElement?>(b => b.HasValue && b.Value.ToString() == body.ToString())))
            .ReturnsAsync(expected);

        var result = Written(await _sut.CustomMethod("Person", "query", body));

        result.Value.Should().BeSameAs(expected.Body);
        _service.VerifyAll();
    }

    [Fact]
    public async Task GetById_PassesTheItemId()
    {
        var expected = new RestResult(200, new Dictionary<string, object?> { ["ItemId"] = "i1" });
        _service.Setup(s => s.GetByIdAsync(_http, "Person", "i1")).ReturnsAsync(expected);

        var result = Written(await _sut.GetById("Person", "i1"));

        result.StatusCode.Should().Be(200);
        result.Value.Should().BeSameAs(expected.Body);
    }

    [Fact]
    public async Task Insert_Created_WritesTheLocationHeader()
    {
        var body = Json("""{"Name":"a"}""");
        var expected = new RestResult(201, new RestItemResponse(true, "i1"), "/api/gateway/Person/i1");
        _service.Setup(s => s.InsertAsync(_http, "Person", It.IsAny<JsonElement>())).ReturnsAsync(expected);

        var result = Written(await _sut.Insert("Person", body));

        result.StatusCode.Should().Be(201);
        result.Value.Should().BeSameAs(expected.Body);
        _http.Response.Headers.Location.ToString().Should().Be("/api/gateway/Person/i1");
    }

    [Fact]
    public async Task Insert_WithoutLocation_LeavesTheHeaderOut()
    {
        _service.Setup(s => s.InsertAsync(_http, "Person", It.IsAny<JsonElement>())).ReturnsAsync(Ok());

        await _sut.Insert("Person", Json("{}"));

        _http.Response.Headers.ContainsKey("Location").Should().BeFalse();
    }

    [Fact]
    public async Task InsertMany_PassesTheBody()
    {
        var expected = new RestResult(200, new RestBulkResponse(true, 2, ["a", "b"]));
        _service.Setup(s => s.InsertManyAsync(_http, "Person", It.IsAny<JsonElement>())).ReturnsAsync(expected);

        var result = Written(await _sut.CustomMethod("Person", "insertMany", Json("""[{"Name":"a"},{"Name":"b"}]""")));

        result.Value.Should().BeSameAs(expected.Body);
        _service.VerifyAll();
    }

    [Fact]
    public async Task Update_PassesEntityItemIdAndBody()
    {
        _service.Setup(s => s.UpdateAsync(_http, "Person", "i1", It.IsAny<JsonElement>())).ReturnsAsync(Ok());

        var result = Written(await _sut.Update("Person", "i1", Json("""{"Name":"b"}""")));

        result.StatusCode.Should().Be(200);
        _service.VerifyAll();
    }

    [Fact]
    public async Task UpdateMany_PassesTheBody()
    {
        var expected = new RestResult(200, new RestBulkResponse(true, 3));
        _service.Setup(s => s.UpdateManyAsync(_http, "Person", It.IsAny<JsonElement>())).ReturnsAsync(expected);

        var result = Written(await _sut.CustomMethod("Person", "updateMany", Json("""{"where":{},"input":{}}""")));

        result.Value.Should().BeSameAs(expected.Body);
        _service.VerifyAll();
    }

    [Fact]
    public async Task Upsert_Created_WritesStatusAndLocation()
    {
        var expected = new RestResult(201, new RestItemResponse(true, "i1", true), "/api/gateway/Person/i1");
        _service.Setup(s => s.UpsertAsync(_http, "Person", "i1", It.IsAny<JsonElement>())).ReturnsAsync(expected);

        var result = Written(await _sut.Upsert("Person", "i1", Json("""{"Name":"b"}""")));

        result.StatusCode.Should().Be(201);
        _http.Response.Headers.Location.ToString().Should().Be("/api/gateway/Person/i1");
    }

    [Fact]
    public async Task Upsert_Existing_Is200WithoutLocation()
    {
        _service.Setup(s => s.UpsertAsync(_http, "Person", "i1", It.IsAny<JsonElement>()))
            .ReturnsAsync(new RestResult(200, new RestItemResponse(true, "i1", false)));

        var result = Written(await _sut.Upsert("Person", "i1", Json("{}")));

        result.StatusCode.Should().Be(200);
        _http.Response.Headers.ContainsKey("Location").Should().BeFalse();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Delete_PassesHardDelete(bool hardDelete)
    {
        _service.Setup(s => s.DeleteAsync(_http, "Person", "i1", hardDelete)).ReturnsAsync(Ok());

        var result = Written(await _sut.Delete("Person", "i1", hardDelete));

        result.StatusCode.Should().Be(200);
        _service.VerifyAll();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DeleteMany_PassesBodyAndHardDelete(bool hardDelete)
    {
        var expected = new RestResult(200, new RestBulkResponse(true, 5));
        _service.Setup(s => s.DeleteManyAsync(_http, "Person", It.IsAny<JsonElement>(), hardDelete)).ReturnsAsync(expected);

        _http.Request.QueryString = new QueryString(hardDelete ? "?hardDelete=true" : string.Empty);

        var result = Written(await _sut.CustomMethod("Person", "deleteMany", Json("""{"where":{"Name":{"eq":"a"}}}""")));

        result.Value.Should().BeSameAs(expected.Body);
        _service.VerifyAll();
    }

    [Theory]
    [InlineData("?hardDelete=TRUE", true)]
    [InlineData("?hardDelete=False", false)]
    [InlineData("?hardDelete=true&hardDelete=false", true)]
    [InlineData("?other=zz", false)]
    public async Task DeleteMany_ReadsHardDeleteFromTheQuery_AsABoolDoes(string query, bool hardDelete)
    {
        _http.Request.QueryString = new QueryString(query);
        _service.Setup(s => s.DeleteManyAsync(_http, "Person", It.IsAny<JsonElement>(), hardDelete)).ReturnsAsync(Ok());

        await _sut.CustomMethod("Person", "deleteMany", Json("""{"where":{}}"""));

        _service.VerifyAll();
    }

    [Theory]
    [InlineData("zz")]
    [InlineData("")]
    [InlineData("1")]
    public async Task DeleteMany_WithAHardDeleteThatIsNotABool_Is400Validation_WithoutCallingTheService(string value)
    {
        _http.Request.QueryString = new QueryString($"?hardDelete={value}");

        var result = Written(await _sut.CustomMethod("Person", "deleteMany", Json("""{"where":{}}""")));

        result.StatusCode.Should().Be(400);
        result.ContentTypes.Should().Equal("application/problem+json");
        var problem = result.Value.Should().BeOfType<GatewayProblem>().Subject;
        problem.Code.Should().Be("VALIDATION_ERROR");
        problem.Errors.Should().ContainSingle().Which.Field.Should().Be("hardDelete");
        _service.Invocations.Should().BeEmpty();
    }

    [Theory]
    [InlineData("query")]
    [InlineData("insertMany")]
    [InlineData("updateMany")]
    public async Task OtherVerbs_IgnoreHardDelete(string verb)
    {
        // Review of Task 1 (R-V2-9): only deleteMany takes the flag, so a bad value cannot refuse another verb.
        _http.Request.QueryString = new QueryString("?hardDelete=zz");
        _service.Setup(s => s.GetAsync(_http, "Person", It.IsAny<JsonElement?>())).ReturnsAsync(Ok());
        _service.Setup(s => s.InsertManyAsync(_http, "Person", It.IsAny<JsonElement>())).ReturnsAsync(Ok());
        _service.Setup(s => s.UpdateManyAsync(_http, "Person", It.IsAny<JsonElement>())).ReturnsAsync(Ok());

        var result = Written(await _sut.CustomMethod("Person", verb, Json("{}")));

        result.StatusCode.Should().Be(200);
    }

    [Theory]
    [InlineData("DeleteMany")]
    [InlineData("Query")]
    [InlineData("nope")]
    [InlineData("")]
    public async Task CustomMethod_UnknownVerb_Is400UnknownMethod_WithoutCallingTheService(string verb)
    {
        var result = Written(await _sut.CustomMethod("Person", verb, Json("{}")));

        result.StatusCode.Should().Be(400);
        result.ContentTypes.Should().Equal("application/problem+json");
        var problem = result.Value.Should().BeOfType<GatewayProblem>().Subject;
        problem.Code.Should().Be("UNKNOWN_METHOD");
        problem.Detail.Should().Be($"Unknown method '{verb}'. Use one of: query, insertMany, updateMany, deleteMany.");
        _service.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task Problem_IsWrittenAsProblemJson_WithItsStatus()
    {
        var problem = GatewayProblemMapper.Problem(_http, 404, "NOT_FOUND", "No such record.");
        _service.Setup(s => s.GetByIdAsync(_http, "Person", "i1")).ReturnsAsync(problem);

        var result = Written(await _sut.GetById("Person", "i1"));

        result.StatusCode.Should().Be(404);
        result.Value.Should().BeOfType<GatewayProblem>();
        result.ContentTypes.Should().Equal("application/problem+json");
    }

    [Fact]
    public async Task SuccessBody_IsWrittenAsJson()
    {
        _service.Setup(s => s.GetByIdAsync(_http, "Person", "i1")).ReturnsAsync(Ok());

        var result = Written(await _sut.GetById("Person", "i1"));

        result.ContentTypes.Should().Equal("application/json");
    }

    [Fact]
    public async Task EveryAction_ReachesTheServiceExactlyOnce()
    {
        _service.Setup(s => s.GetAsync(It.IsAny<HttpContext>(), It.IsAny<string>(), It.IsAny<JsonElement?>())).ReturnsAsync(Ok());
        _service.Setup(s => s.GetByIdAsync(It.IsAny<HttpContext>(), It.IsAny<string>(), It.IsAny<string>())).ReturnsAsync(Ok());
        _service.Setup(s => s.InsertAsync(It.IsAny<HttpContext>(), It.IsAny<string>(), It.IsAny<JsonElement>())).ReturnsAsync(Ok());
        _service.Setup(s => s.InsertManyAsync(It.IsAny<HttpContext>(), It.IsAny<string>(), It.IsAny<JsonElement>())).ReturnsAsync(Ok());
        _service.Setup(s => s.UpdateAsync(It.IsAny<HttpContext>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<JsonElement>())).ReturnsAsync(Ok());
        _service.Setup(s => s.UpdateManyAsync(It.IsAny<HttpContext>(), It.IsAny<string>(), It.IsAny<JsonElement>())).ReturnsAsync(Ok());
        _service.Setup(s => s.UpsertAsync(It.IsAny<HttpContext>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<JsonElement>())).ReturnsAsync(Ok());
        _service.Setup(s => s.DeleteAsync(It.IsAny<HttpContext>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>())).ReturnsAsync(Ok());
        _service.Setup(s => s.DeleteManyAsync(It.IsAny<HttpContext>(), It.IsAny<string>(), It.IsAny<JsonElement>(), It.IsAny<bool>())).ReturnsAsync(Ok());
        var body = Json("{}");

        await _sut.Get("E");
        await _sut.CustomMethod("E", "query", body);
        await _sut.GetById("E", "i");
        await _sut.Insert("E", body);
        await _sut.CustomMethod("E", "insertMany", body);
        await _sut.Update("E", "i", body);
        await _sut.CustomMethod("E", "updateMany", body);
        await _sut.Upsert("E", "i", body);
        await _sut.Delete("E", "i");
        await _sut.CustomMethod("E", "deleteMany", body);

        _service.Invocations.Should().HaveCount(10);
    }
}
