using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Mappers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Repositories;
using DataGateway.DomainService.Services;
using DataGateway.DomainService.Validators;
using FluentAssertions;
using FluentValidation.Results;
using MongoDB.Bson;
using MongoDB.Driver;
using Moq;
using System.Reflection;
using XUnitTest.Infrastructure;

namespace XUnitTest.DataGateway.Services;

[Collection("ContextSerial")]
public class DataValidationServiceTests
{
    private readonly Mock<IDbRepository> _repo = new();
    private readonly Mock<IRequestValidator> _validator = new();
    private readonly Mock<ISchemaChangeLogService> _changeLog = new();
    private readonly DataValidationService _service;

    public DataValidationServiceTests()
    {
        BlocksTestContext.Set();
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateDataValidationRequest>())).ReturnsAsync(new ValidationResult());
        _validator.Setup(v => v.ValidateAsync(It.IsAny<UpdateDataValidationRequest>())).ReturnsAsync(new ValidationResult());
        _service = new DataValidationService(_repo.Object, _validator.Object, _changeLog.Object);
    }

    [Fact]
    public void Constructor_NullArgs_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => new DataValidationService(null!, _validator.Object, _changeLog.Object));
        Assert.Throws<ArgumentNullException>(() => new DataValidationService(_repo.Object, null!, _changeLog.Object));
        Assert.Throws<ArgumentNullException>(() => new DataValidationService(_repo.Object, _validator.Object, null!));
    }

    [Fact]
    public async Task Create_InvalidRequest_ReturnsErrors()
    {
        _validator.Setup(v => v.ValidateAsync(It.IsAny<CreateDataValidationRequest>()))
            .ReturnsAsync(new ValidationResult(new[] { new ValidationFailure("FieldName", "required") }));

        var result = await _service.CreateDataValidationAsync(new CreateDataValidationRequest());

        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().ContainSingle();
    }

    [Fact]
    public async Task Create_WhenValidationAlreadyExists_ReturnsMessage()
    {
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<DataValidation>>(), ""))
            .ReturnsAsync(new DataValidation());

        var result = await _service.CreateDataValidationAsync(new CreateDataValidationRequest { SchemaId = "s", FieldName = "f" });

        result.IsSuccess.Should().BeFalse();
        result.Message.Should().Be("Validation already exists for this schema field");
        result.HttpStatusCode.Should().Be(200);
    }

    [Fact]
    public async Task Create_Valid_InsertsAndLogs()
    {
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<DataValidation>>(), ""))
            .ReturnsAsync((DataValidation?)null);
        _repo.Setup(r => r.InsertAsync(It.IsAny<DataValidation>(), ""))
            .ReturnsAsync((DataValidation d, string _) => d);

        var request = new CreateDataValidationRequest
        {
            SchemaId = "s1",
            FieldName = "Email",
            Validations = new List<ValidationRuleRequest>
            {
                new() { Type = ValidationType.NotEmpty, IsActive = true },
                new() { Type = ValidationType.Regex, Value = "^a$" }
            }
        };

        var result = await _service.CreateDataValidationAsync(request);

        result.IsSuccess.Should().BeTrue();
        result.Data!.Acknowledged.Should().BeTrue();
        _repo.Verify(r => r.InsertAsync(It.Is<DataValidation>(d => d.SchemaId == "s1" && d.Validations.Count == 2), ""), Times.Once);
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync("s1", SchemaChangeType.SchemaFieldValidationCreate, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Update_NotFound_ReturnsMessage()
    {
        _repo.Setup(r => r.GetItemAsync<DataValidation>(It.IsAny<string>(), "")).ReturnsAsync((DataValidation?)null);

        var result = await _service.UpdateDataValidationAsync(new UpdateDataValidationRequest { ItemId = "x" });

        result.IsSuccess.Should().BeFalse();
        result.Message.Should().Be("Data validation not found");
    }

    [Fact]
    public async Task Update_ChangingToExistingField_ReturnsMessage()
    {
        _repo.Setup(r => r.GetItemAsync<DataValidation>("id", "")).ReturnsAsync(new DataValidation { SchemaId = "s", FieldName = "old" });
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<DataValidation>>(), "")).ReturnsAsync(new DataValidation());

        var result = await _service.UpdateDataValidationAsync(new UpdateDataValidationRequest { ItemId = "id", SchemaId = "s", FieldName = "new" });

        result.Message.Should().Be("Validation already exists for this schema field");
    }

    [Fact]
    public async Task Update_Valid_UpdatesAndLogs()
    {
        _repo.Setup(r => r.GetItemAsync<DataValidation>("id", "")).ReturnsAsync(new DataValidation { SchemaId = "s", FieldName = "f", ItemId = "id" });
        _repo.Setup(r => r.UpdateAsync(It.IsAny<DataValidation>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true, ItemId = "id" });

        var result = await _service.UpdateDataValidationAsync(new UpdateDataValidationRequest
        {
            ItemId = "id",
            SchemaId = "s",
            FieldName = "f",
            Validations = new List<ValidationRuleRequest> { new() { Type = ValidationType.MaxLength, Value = 10 } }
        });

        result.IsSuccess.Should().BeTrue();
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync("s", SchemaChangeType.SchemaFieldValidationUpdate, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Delete_NotFound_ReturnsMessage()
    {
        _repo.Setup(r => r.GetItemAsync<DataValidation>("id", "")).ReturnsAsync((DataValidation?)null);

        var result = await _service.DeleteDataValidationAsync("id");

        result.IsSuccess.Should().BeFalse();
        result.Message.Should().Be("Data validation not found");
    }

    [Fact]
    public async Task Delete_Found_DeletesAndLogs()
    {
        _repo.Setup(r => r.GetItemAsync<DataValidation>("id", "")).ReturnsAsync(new DataValidation { SchemaId = "s", ItemId = "id" });
        _repo.Setup(r => r.DeleteAsync(It.IsAny<FilterDefinition<DataValidation>>(), "")).ReturnsAsync(new ActionResponse { Acknowledged = true, ItemId = "id" });

        var result = await _service.DeleteDataValidationAsync("id");

        result.IsSuccess.Should().BeTrue();
        _changeLog.Verify(c => c.CreateSchemaChangeLogAsync("s", SchemaChangeType.SchemaFieldValidationDelete, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetById_NotFound_ReturnsMessage()
    {
        _repo.Setup(r => r.GetItemAsync<DataValidation>("id", "")).ReturnsAsync((DataValidation?)null);

        var result = await _service.GetDataValidationByIdAsync("id");

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task GetById_Found_ReturnsResponse()
    {
        _repo.Setup(r => r.GetItemAsync<DataValidation>("id", "")).ReturnsAsync(new DataValidation { SchemaId = "s", FieldName = "f", ItemId = "id" });

        var result = await _service.GetDataValidationByIdAsync("id");

        result.IsSuccess.Should().BeTrue();
        result.Data!.ItemId.Should().Be("id");
    }

    [Fact]
    public async Task GetAll_ReturnsPaged()
    {
        _repo.Setup(r => r.GetItemsWithCountAsync<DataValidation>(
                It.IsAny<FilterDefinition<MongoDB.Bson.BsonDocument>>(),
                It.IsAny<SortDefinition<MongoDB.Bson.BsonDocument>>(),
                It.IsAny<ProjectionDefinition<MongoDB.Bson.BsonDocument>>(),
                It.IsAny<int>(), It.IsAny<int>(), ""))
            .ReturnsAsync((new List<DataValidation> { new() { ItemId = "1" } }, 1));

        var result = await _service.GetAllDataValidationsAsync(new GetDataValidationListRequest
        {
            SchemaId = "s",
            FieldName = "f",
            SortBy = "FieldName",
            SortDescending = true,
            PageNo = 1,
            PageSize = 10
        });

        result.IsSuccess.Should().BeTrue();
        result.Data!.TotalCount.Should().Be(1);
    }

    [Fact]
    public async Task GetAll_Keyword_UsesRegexFilter()
    {
        _repo.Setup(r => r.GetItemsWithCountAsync<DataValidation>(
                It.IsAny<FilterDefinition<MongoDB.Bson.BsonDocument>>(),
                It.IsAny<SortDefinition<MongoDB.Bson.BsonDocument>>(),
                It.IsAny<ProjectionDefinition<MongoDB.Bson.BsonDocument>>(),
                It.IsAny<int>(), It.IsAny<int>(), ""))
            .ReturnsAsync((new List<DataValidation> { new() { ItemId = "1" } }, 1));

        var result = await _service.GetAllDataValidationsAsync(new GetDataValidationListRequest
        {
            SchemaId = "s",
            Keyword = "kw",
            PageNo = 1,
            PageSize = 10
        });

        result.IsSuccess.Should().BeTrue();
        result.Data!.TotalCount.Should().Be(1);
    }

    [Fact]
    public async Task GetBySchemaId_ReturnsList()
    {
        _repo.Setup(r => r.GetItemsAsync<DataValidation>(
                It.IsAny<FilterDefinition<MongoDB.Bson.BsonDocument>>(), null, null, 0, 1000, ""))
            .ReturnsAsync(new List<DataValidation> { new() { ItemId = "1" }, new() { ItemId = "2" } });

        var result = await _service.GetValidationsBySchemaIdAsync("s");

        result.Data!.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetBySchemaAndField_NotFound_ReturnsMessage()
    {
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<DataValidation>>(), "")).ReturnsAsync((DataValidation?)null);

        var result = await _service.GetValidationBySchemaAndFieldAsync("s", "f");

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task GetBySchemaAndField_Found_ReturnsResponse()
    {
        _repo.Setup(r => r.GetItemAsync(It.IsAny<FilterDefinition<DataValidation>>(), "")).ReturnsAsync(new DataValidation { ItemId = "1", FieldName = "f" });

        var result = await _service.GetValidationBySchemaAndFieldAsync("s", "f");

        result.IsSuccess.Should().BeTrue();
        result.Data!.FieldName.Should().Be("f");
    }

    private static BsonDocument InvokeGetFilter(GetDataValidationListRequest request)
    {
        var method = typeof(DataValidationService).GetMethod("GetFilter", BindingFlags.NonPublic | BindingFlags.Static)!;
        return (BsonDocument)method.Invoke(null, new object[] { request })!;
    }

    [Fact]
    public void GetFilter_FieldNameOnly_UsesExactMatch()
    {
        var filter = InvokeGetFilter(new GetDataValidationListRequest { FieldName = "f" });

        filter[nameof(DataValidation.FieldName)].BsonType.Should().Be(BsonType.String);
        filter[nameof(DataValidation.FieldName)].AsString.Should().Be("f");
    }

    [Fact]
    public void GetFilter_KeywordOnly_UsesRegex()
    {
        var filter = InvokeGetFilter(new GetDataValidationListRequest { Keyword = "kw" });

        filter[nameof(DataValidation.FieldName)].BsonType.Should().Be(BsonType.RegularExpression);
        filter[nameof(DataValidation.FieldName)].AsBsonRegularExpression.Pattern.Should().Be("kw");
    }

    [Fact]
    public void GetFilter_FieldNameAndKeyword_ExactMatchWins_NoDuplicate()
    {
        var filter = InvokeGetFilter(new GetDataValidationListRequest { FieldName = "f", Keyword = "kw" });

        filter.ElementCount.Should().Be(1);
        filter[nameof(DataValidation.FieldName)].BsonType.Should().Be(BsonType.String);
        filter[nameof(DataValidation.FieldName)].AsString.Should().Be("f");
    }

    [Fact]
    public async Task GetAll_FieldNameAndKeyword_DoesNotThrow()
    {
        _repo.Setup(r => r.GetItemsWithCountAsync<DataValidation>(
                It.IsAny<FilterDefinition<MongoDB.Bson.BsonDocument>>(),
                It.IsAny<SortDefinition<MongoDB.Bson.BsonDocument>>(),
                It.IsAny<ProjectionDefinition<MongoDB.Bson.BsonDocument>>(),
                It.IsAny<int>(), It.IsAny<int>(), ""))
            .ReturnsAsync((new List<DataValidation> { new() { ItemId = "1", FieldName = "f" } }, 1));

        var result = await _service.GetAllDataValidationsAsync(new GetDataValidationListRequest
        {
            SchemaId = "s",
            FieldName = "f",
            Keyword = "kw",
            PageNo = 1,
            PageSize = 10
        });

        result.IsSuccess.Should().BeTrue();
        result.Data!.TotalCount.Should().Be(1);
    }
}
