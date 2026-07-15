using System.Text.Json;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Exceptions;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Utilities;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using Moq;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class JsonValueHelperTests
{
    private static JsonElement Json(string j) => JsonDocument.Parse(j).RootElement;

    [Fact]
    public void ToStorableValue_Primitives()
    {
        JsonValueHelper.ToStorableValue(Json("\"s\"")).Should().Be("s");
        JsonValueHelper.ToStorableValue(Json("42")).Should().Be(42L);
        JsonValueHelper.ToStorableValue(Json("1.5")).Should().Be(1.5);
        JsonValueHelper.ToStorableValue(Json("true")).Should().Be(true);
        JsonValueHelper.ToStorableValue(Json("false")).Should().Be(false);
        JsonValueHelper.ToStorableValue(Json("null")).Should().BeNull();
    }

    [Fact]
    public void ToStorableValue_Array()
    {
        var result = JsonValueHelper.ToStorableValue(Json("[1,2]"));
        result.Should().BeOfType<object?[]>();
        ((object?[])result!).Should().HaveCount(2);
    }

    [Fact]
    public void ToStorableValue_Object_ReturnsRawText()
    {
        var result = JsonValueHelper.ToStorableValue(Json("{\"a\":1}"));
        result.Should().BeOfType<string>();
    }

    [Fact]
    public void ToStorableValue_NonJson_ReturnedAsIs()
    {
        JsonValueHelper.ToStorableValue("plain").Should().Be("plain");
    }
}

public class BsonConversionHelperTests
{
    [Fact]
    public void BsonDocumentToDictionary_ConvertsTypes()
    {
        var doc = new BsonDocument
        {
            { "Str", "s" },
            { "Int", 42 },
            { "Bool", true },
            { "Nested", new BsonDocument("Inner", "v") },
            { "Arr", new BsonArray { 1, 2 } }
        };
        var dict = BsonConversionHelper.BsonDocumentToDictionary(doc);
        dict["Str"].Should().Be("s");
        dict["Int"].Should().Be(42);
        dict["Bool"].Should().Be(true);
        dict["Nested"].Should().BeOfType<Dictionary<string, object?>>();
        dict["Arr"].Should().BeAssignableTo<System.Collections.IEnumerable>();
    }

    [Fact]
    public void BsonValueToObject_Null()
    {
        BsonConversionHelper.BsonValueToObject(BsonNull.Value).Should().BeNull();
    }

    [Fact]
    public void BsonValueToObject_ObjectId_ToString()
    {
        var oid = ObjectId.GenerateNewId();
        BsonConversionHelper.BsonValueToObject(new BsonObjectId(oid)).Should().Be(oid.ToString());
    }
}

public class SortStringParserTests
{
    [Fact]
    public void Parse_Empty_ReturnsEmpty()
    {
        SortStringParser.Parse("").Should().BeEmpty();
        SortStringParser.Parse("   ").Should().BeEmpty();
    }

    [Fact]
    public void Parse_MixedDirections()
    {
        var result = SortStringParser.Parse("-created,name,+price");
        result.Should().HaveCount(3);
        result[0]["field"].Should().Be("created");
        result[0]["direction"].Should().Be("DESC");
        result[1]["field"].Should().Be("name");
        result[1]["direction"].Should().Be("ASC");
        result[2]["field"].Should().Be("price");
        result[2]["direction"].Should().Be("ASC");
    }

    [Fact]
    public void Parse_OnlySignSkipped()
    {
        SortStringParser.Parse("-").Should().BeEmpty();
    }
}

public class StringHelperTests
{
    [Theory]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("   ", true)]
    [InlineData("default", true)]
    [InlineData("DEFAULT", true)]
    [InlineData("value", false)]
    public void IsNullOrWhiteSpaceOrDefault(string? input, bool expected)
    {
        input.IsNullOrWhiteSpaceOrDefault().Should().Be(expected);
    }
}

public class StringFormatterServiceTests
{
    [Fact]
    public void Truncate_ShorterThanMax_Unchanged()
    {
        StringFormatterService.Truncate("abc", 10).Should().Be("abc");
    }

    [Fact]
    public void Truncate_LongerThanMax_Cuts()
    {
        StringFormatterService.Truncate("abcdefgh", 4).Should().Be("abcd");
    }

    [Fact]
    public void Truncate_TrimsTrailingDash()
    {
        StringFormatterService.Truncate("abc-def", 4).Should().Be("abc");
    }

    [Fact]
    public void Truncate_NullOrEmpty()
    {
        StringFormatterService.Truncate("", 3).Should().Be("");
        StringFormatterService.Truncate(null!, 3).Should().BeNull();
    }
}

public class SchemaDefinitionFilterHelperTests
{
    [Fact]
    public void GetFilter_Keyword_UsesRegex()
    {
        var req = new GetSchemaDefinitionListRequest { Keyword = "abc" };
        var filter = SchemaDefinitionFilterHelper.GetFilter(req);
        filter.Contains(nameof(SchemaDefinition.SchemaName)).Should().BeTrue();
        filter[nameof(SchemaDefinition.SchemaName)].Should().BeOfType<BsonRegularExpression>();
    }

    [Fact]
    public void GetFilter_SchemaName_Exact()
    {
        var req = new GetSchemaDefinitionListRequest { SchemaName = "Person" };
        var filter = SchemaDefinitionFilterHelper.GetFilter(req);
        filter[nameof(SchemaDefinition.SchemaName)].AsString.Should().Be("Person");
    }

    [Fact]
    public void GetFilter_SchemaType_Added()
    {
        var req = new GetSchemaDefinitionListRequest { SchemaType = SchemaType.Entity };
        var filter = SchemaDefinitionFilterHelper.GetFilter(req);
        filter.Contains(nameof(SchemaDefinition.SchemaType)).Should().BeTrue();
    }

    [Fact]
    public void GetSorting_DefaultAndCustom()
    {
        SchemaDefinitionFilterHelper.GetSorting("", false)
            .Contains(nameof(SchemaDefinition.CreatedDate)).Should().BeTrue();
        var custom = SchemaDefinitionFilterHelper.GetSorting("SchemaName", true);
        custom["SchemaName"].AsInt32.Should().Be(-1);
    }

    [Fact]
    public void BuildAggregationPipeline_HasMatchAndGroup()
    {
        var pipeline = SchemaDefinitionFilterHelper.BuildAggregationPipeline();
        pipeline.Should().HaveCount(2);
        pipeline[0].Contains("$match").Should().BeTrue();
        pipeline[1].Contains("$group").Should().BeTrue();
    }
}

public class KubernetesApiErrorHandlerTests
{
    [Fact]
    public void HandleGeneralError_Timeout()
    {
        var logger = new Mock<ILogger>();
        KubernetesApiErrorHandler.HandleGeneralError(new TaskCanceledException(), logger.Object)
            .Should().Contain("timeout");
    }

    [Fact]
    public void HandleGeneralError_NetworkError()
    {
        var logger = new Mock<ILogger>();
        KubernetesApiErrorHandler.HandleGeneralError(new HttpRequestException("boom"), logger.Object)
            .Should().Contain("Network error");
    }

    [Fact]
    public void HandleGeneralError_Unexpected()
    {
        var logger = new Mock<ILogger>();
        KubernetesApiErrorHandler.HandleGeneralError(new InvalidOperationException("oops"), logger.Object)
            .Should().Contain("Unexpected error");
    }
}

public class ExceptionTests
{
    [Fact]
    public void AccessDeniedException_Defaults()
    {
        var ex = new AccessDeniedException("no access");
        ex.StatusCode.Should().Be(401);
        ex.ErrorCode.Should().Be("AUTH_NOT_AUTHENTICATED");
        ex.Message.Should().Be("no access");
    }

    [Fact]
    public void EntityNotFoundException_Defaults()
    {
        var ex = new EntityNotFoundException("missing");
        ex.StatusCode.Should().Be(404);
        ex.ErrorCode.Should().Be("NOT_FOUND");
    }

    [Fact]
    public void DataValidationException_WrapsResult()
    {
        var result = new DataValidationResult();
        result.AddError("F", "bad", "NotEmpty");
        var ex = new DataValidationException(result);
        ex.StatusCode.Should().Be(400);
        ex.ErrorCode.Should().Be("VALIDATION_ERROR");
        ex.ValidationResult.Should().BeSameAs(result);
    }
}

[Collection("ContextSerial")]
public class DefaultValueInjectionTests
{
    [Fact]
    public void AddDefaultFields_AddsBaseEntityFields()
    {
        var schema = new SchemaDefinition { SchemaName = "X" };
        schema.AddDefaultFields();
        schema.Fields.Should().Contain(f => f.Name == nameof(GraphQlBaseEntity.ItemId));
        schema.Fields.Should().Contain(f => f.Name == nameof(GraphQlBaseEntity.CreatedDate));
    }

    [Fact]
    public void AddDefaultFields_DoesNotDuplicateExisting()
    {
        var schema = new SchemaDefinition { SchemaName = "X" };
        schema.Fields.Add(new FieldDefinition { Name = nameof(GraphQlBaseEntity.ItemId), Type = "ID" });
        schema.AddDefaultFields();
        schema.Fields.Count(f => f.Name == nameof(GraphQlBaseEntity.ItemId)).Should().Be(1);
    }

    [Fact]
    public void InjectDefaultValueOnInsert_AddsSystemFields()
    {
        ClearContext();
        SetContext(userId: "u-1", organizationId: "org-1");
        try
        {
            var input = new Dictionary<string, object?> { ["Name"] = "John" };
            input.InjectDefaultValueOnInsert();
            input.ContainsKey("_id").Should().BeTrue();
            input.ContainsKey(nameof(GraphQlBaseEntity.CreatedDate)).Should().BeTrue();
            input[nameof(GraphQlBaseEntity.CreatedBy)].Should().Be("u-1");
            input[nameof(GraphQlBaseEntity.OrganizationId)].Should().Be("org-1");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void InjectDefaultValueOnInsert_PreservesProvidedItemId()
    {
        ClearContext();
        try
        {
            var input = new Dictionary<string, object?> { [nameof(GraphQlBaseEntity.ItemId)] = "custom-id" };
            input.InjectDefaultValueOnInsert();
            input["_id"].Should().Be("custom-id");
            input.ContainsKey(nameof(GraphQlBaseEntity.ItemId)).Should().BeFalse();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void InjectDefaultValueOnUpdate_AddsLastUpdated()
    {
        ClearContext();
        SetContext(userId: "u-9");
        try
        {
            var input = new Dictionary<string, object?>();
            input.InjectDefaultValueOnUpdate();
            input.ContainsKey(nameof(GraphQlBaseEntity.LastUpdatedDate)).Should().BeTrue();
            input[nameof(GraphQlBaseEntity.LastUpdatedBy)].Should().Be("u-9");
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void InjectDefaultValue_Entity_SetsIdsAndDates()
    {
        ClearContext();
        SetContext(userId: "u-1", organizationId: "org-1");
        try
        {
            var entity = new SchemaDefinition();
            entity.InjectDefaultValue();
            entity.ItemId.Should().NotBeNullOrWhiteSpace();
            entity.CreatedDate.Should().NotBe(default);
            entity.LastUpdatedBy.Should().Be("u-1");
        }
        finally { ClearContext(); }
    }
}
