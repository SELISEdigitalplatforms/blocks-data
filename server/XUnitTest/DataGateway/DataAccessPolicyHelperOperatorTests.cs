using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

/// <summary>
/// Covers the pure condition-evaluation and Mongo-filter-building branches of
/// <see cref="DataAccessPolicyHelper"/> across operators and value shapes.
/// </summary>
[Collection("ContextSerial")]
public class DataAccessPolicyHelperOperatorTests
{
    // ---------- EvaluateCondition: null handling ----------

    [Fact]
    public void IsNull_TreatsNullAndEmptyStringAsNull()
    {
        DataAccessPolicyHelper.EvaluateCondition(null, PolicyOperator.IS_NULL, null).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("", PolicyOperator.IS_NULL, null).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("x", PolicyOperator.IS_NULL, null).Should().BeFalse();
    }

    [Fact]
    public void IsNotNull_Inverse()
    {
        DataAccessPolicyHelper.EvaluateCondition("x", PolicyOperator.IS_NOT_NULL, null).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(null, PolicyOperator.IS_NOT_NULL, null).Should().BeFalse();
        DataAccessPolicyHelper.EvaluateCondition("", PolicyOperator.IS_NOT_NULL, null).Should().BeFalse();
    }

    [Fact]
    public void NullOperand_NonNullOperator_ReturnsFalse()
    {
        DataAccessPolicyHelper.EvaluateCondition(null, PolicyOperator.EQUAL, "x").Should().BeFalse();
        DataAccessPolicyHelper.EvaluateCondition("x", PolicyOperator.EQUAL, null).Should().BeFalse();
    }

    // ---------- EvaluateCondition: scalar string/numeric ----------

    [Fact]
    public void StringEqual_CaseInsensitive()
    {
        DataAccessPolicyHelper.EvaluateCondition("ABC", PolicyOperator.EQUAL, "abc").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("ABC", PolicyOperator.NOT_EQUAL, "abc").Should().BeFalse();
    }

    [Fact]
    public void Contains_String()
    {
        DataAccessPolicyHelper.EvaluateCondition("hello world", PolicyOperator.CONTAIN, "WORLD").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("hello", PolicyOperator.NOT_CONTAIN, "z").Should().BeTrue();
        // Non-string contains => false
        DataAccessPolicyHelper.EvaluateCondition(5, PolicyOperator.CONTAIN, 3).Should().BeFalse();
    }

    [Fact]
    public void In_ScalarWithinArray()
    {
        DataAccessPolicyHelper.EvaluateCondition("b", PolicyOperator.IN, new object[] { "a", "b", "c" }).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("z", PolicyOperator.NOT_IN, new object[] { "a", "b" }).Should().BeTrue();
    }

    [Fact]
    public void Numeric_Comparisons()
    {
        DataAccessPolicyHelper.EvaluateCondition(5, PolicyOperator.GREATER_THAN, 3).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(5, PolicyOperator.GREATER_THAN_OR_EQUAL, 5).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(2, PolicyOperator.LESS_THAN, 3).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(3, PolicyOperator.LESS_THAN_OR_EQUAL, 3).Should().BeTrue();
    }

    [Fact]
    public void Numeric_NonNumericFallsBackToStringCompare()
    {
        // Convert.ToDouble throws -> string.Compare("b","a") > 0
        DataAccessPolicyHelper.EvaluateCondition("b", PolicyOperator.GREATER_THAN, "a").Should().BeTrue();
    }

    [Fact]
    public void StartEndRegex()
    {
        DataAccessPolicyHelper.EvaluateCondition("hello", PolicyOperator.START_WITH, "he").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("hello", PolicyOperator.END_WITH, "lo").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("abc123", PolicyOperator.REGEX, @"\d+").Should().BeTrue();
    }

    // ---------- EvaluateCondition: array left, string right ----------

    [Fact]
    public void ArrayLeft_StringRight()
    {
        var single = new[] { "admin" };
        var many = new[] { "a", "b" };
        DataAccessPolicyHelper.EvaluateCondition(single, PolicyOperator.EQUAL, "ADMIN").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(many, PolicyOperator.EQUAL, "a").Should().BeFalse();
        DataAccessPolicyHelper.EvaluateCondition(many, PolicyOperator.NOT_EQUAL, "a").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(many, PolicyOperator.CONTAIN, "B").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(many, PolicyOperator.NOT_CONTAIN, "c").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(many, PolicyOperator.IN, "a").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(many, PolicyOperator.START_WITH, "a").Should().BeFalse();
    }

    // ---------- EvaluateCondition: array left, array right ----------

    [Fact]
    public void ArrayLeft_ArrayRight()
    {
        var left = new[] { "a", "b" };
        DataAccessPolicyHelper.EvaluateCondition(left, PolicyOperator.EQUAL, new object[] { "A", "B" }).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(left, PolicyOperator.NOT_EQUAL, new object[] { "a" }).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(new[] { "a", "b", "c" }, PolicyOperator.CONTAIN, new object[] { "a", "b" }).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(left, PolicyOperator.NOT_CONTAIN, new object[] { "x", "y" }).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(new[] { "a", "x" }, PolicyOperator.IN, new object[] { "x", "y" }).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(left, PolicyOperator.START_WITH, new object[] { "b" }).Should().BeFalse();
    }

    [Fact]
    public void ArrayConversion_ListAndEnumerableForms()
    {
        DataAccessPolicyHelper.EvaluateCondition(new List<object> { "a", "b" }, PolicyOperator.CONTAIN, "a").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(new List<string> { "a", "b" }, PolicyOperator.CONTAIN, "b").Should().BeTrue();
        // right side is a non-string enumerable (List<int>) -> converted to string array
        DataAccessPolicyHelper.EvaluateCondition("1", PolicyOperator.IN, new List<int> { 1, 2 }).Should().BeTrue();
    }

    // ---------- BuildConditionFilter: operators ----------

    [Fact]
    public void BuildFilter_Equal_And_Comparisons()
    {
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.EQUAL, "x")["f"].AsString.Should().Be("x");
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.NOT_EQUAL, "x")["f"].AsBsonDocument["$ne"].AsString.Should().Be("x");
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.GREATER_THAN, 1)["f"].AsBsonDocument.Contains("$gt").Should().BeTrue();
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.GREATER_THAN_OR_EQUAL, 1)["f"].AsBsonDocument.Contains("$gte").Should().BeTrue();
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.LESS_THAN, 1)["f"].AsBsonDocument.Contains("$lt").Should().BeTrue();
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.LESS_THAN_OR_EQUAL, 1)["f"].AsBsonDocument.Contains("$lte").Should().BeTrue();
    }

    [Fact]
    public void BuildFilter_RegexLikeOperators()
    {
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.CONTAIN, "a")["f"].AsBsonDocument.Contains("$regex").Should().BeTrue();
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.NOT_CONTAIN, "a")["f"].AsBsonDocument.Contains("$not").Should().BeTrue();
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.START_WITH, "a")["f"].AsBsonDocument["$regex"].AsString.Should().StartWith("^");
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.END_WITH, "a")["f"].AsBsonDocument["$regex"].AsString.Should().EndWith("$");
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.REGEX, "a.*")["f"].AsBsonDocument["$regex"].AsString.Should().Be("a.*");
    }

    [Fact]
    public void BuildFilter_NullOperators()
    {
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.IS_NULL, null)["f"].Should().Be(BsonNull.Value);
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.IS_NOT_NULL, null)["f"].AsBsonDocument["$ne"].Should().Be(BsonNull.Value);
    }

    [Fact]
    public void BuildFilter_InOperators()
    {
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.IN, new object[] { "a", "b" })["f"].AsBsonDocument["$in"].AsBsonArray.Count.Should().Be(2);
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.NOT_IN, new[] { "a" })["f"].AsBsonDocument["$nin"].AsBsonArray.Count.Should().Be(1);
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.IN, "single")["f"].AsBsonDocument["$in"].AsBsonArray.Count.Should().Be(1);
    }

    [Fact]
    public void BuildFilter_ConvertToBsonValue_AllScalarTypes()
    {
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.EQUAL, 5)["f"].Should().Be(new BsonInt32(5));
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.EQUAL, 5L)["f"].Should().Be(new BsonInt64(5));
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.EQUAL, 1.5)["f"].Should().Be(new BsonDouble(1.5));
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.EQUAL, 2.5m)["f"].Should().Be(new BsonDecimal128(2.5m));
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.EQUAL, true)["f"].Should().Be(BsonBoolean.True);
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.EQUAL, new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc))["f"].BsonType.Should().Be(BsonType.DateTime);
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.EQUAL, new[] { "a", "b" })["f"].AsBsonDocument["$in"].AsBsonArray.Count.Should().Be(2);
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.EQUAL, new List<string> { "a" })["f"].AsBsonDocument["$in"].AsBsonArray.Count.Should().Be(1);
        DataAccessPolicyHelper.BuildConditionFilter("f", PolicyOperator.EQUAL, Guid.Empty)["f"].BsonType.Should().Be(BsonType.String);
    }

    // ---------- Token resolution ----------

    [Fact]
    public void GetTokenValue_ResolvesKnownClaims()
    {
        ClearContext();
        SetContext(userId: "u1", userName: "a@b.com", tenantId: "t1", roles: new[] { "admin" }, permissions: new[] { "p1" });
        try
        {
            DataAccessPolicyHelper.GetTokenValue("email").Should().Be("a@b.com");
            DataAccessPolicyHelper.GetTokenValue("userid").Should().Be("u1");
            DataAccessPolicyHelper.GetTokenValue("tenant").Should().Be("t1");
            DataAccessPolicyHelper.GetTokenValue("roles").Should().BeEquivalentTo(new[] { "admin" });
            DataAccessPolicyHelper.GetTokenValue("permissions").Should().BeEquivalentTo(new[] { "p1" });
            DataAccessPolicyHelper.GetTokenValue("unknownClaim").Should().BeNull();
        }
        finally { ClearContext(); }
    }

    [Fact]
    public void GetTokenValue_NoContext_ReturnsNull()
    {
        ClearContext();
        DataAccessPolicyHelper.GetTokenValue("email").Should().BeNull();
    }

    [Fact]
    public void BuildFilter_TokenExpression_Resolved()
    {
        ClearContext();
        SetContext(userId: "u1", userName: "a@b.com", roles: new[] { "admin", "user" });
        try
        {
            DataAccessPolicyHelper.BuildConditionFilter("Email", PolicyOperator.EQUAL, "{{token.Email}}")["Email"].AsString.Should().Be("a@b.com");
            DataAccessPolicyHelper.BuildConditionFilter("UserId", PolicyOperator.EQUAL, "{{auth.UserId}}")["UserId"].AsString.Should().Be("u1");
            DataAccessPolicyHelper.BuildConditionFilter("Role", PolicyOperator.IN, "{{token.Roles}}")["Role"].AsBsonDocument["$in"].AsBsonArray.Count.Should().Be(2);
        }
        finally { ClearContext(); }
    }

    // ---------- Path matching helpers ----------

    [Fact]
    public void IsPathProtectedByCls_MatchesExactAndNested()
    {
        var protectedFields = new HashSet<string> { "Salary", "Contact" };
        DataAccessPolicyHelper.IsPathProtectedByCls("Salary", protectedFields).Should().BeTrue();
        DataAccessPolicyHelper.IsPathProtectedByCls("Contact.Email", protectedFields).Should().BeTrue();
        DataAccessPolicyHelper.IsPathProtectedByCls("Name", protectedFields).Should().BeFalse();
    }

    [Fact]
    public void IsPathAllowed_MatchesExactParentAndChild()
    {
        var allowed = new HashSet<string> { "Contact" };
        DataAccessPolicyHelper.IsPathAllowed("Contact", allowed).Should().BeTrue();
        DataAccessPolicyHelper.IsPathAllowed("Contact.Email", allowed).Should().BeTrue();
        DataAccessPolicyHelper.IsPathAllowed("Name", allowed).Should().BeFalse();
    }
}
