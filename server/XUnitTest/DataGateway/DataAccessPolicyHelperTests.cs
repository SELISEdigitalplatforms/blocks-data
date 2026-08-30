using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using FluentAssertions;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway;

public class DataAccessPolicyHelperConditionTests
{
    [Theory]
    [InlineData("abc", "abc", true)]
    [InlineData("ABC", "abc", true)]  // case-insensitive
    [InlineData("abc", "abd", false)]
    public void EvaluateCondition_Equal(string left, string right, bool expected)
    {
        DataAccessPolicyHelper.EvaluateCondition(left, PolicyOperator.EQUAL, right).Should().Be(expected);
    }

    [Fact]
    public void EvaluateCondition_NotEqual()
    {
        DataAccessPolicyHelper.EvaluateCondition("a", PolicyOperator.NOT_EQUAL, "b").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("a", PolicyOperator.NOT_EQUAL, "a").Should().BeFalse();
    }

    [Fact]
    public void EvaluateCondition_IsNull_And_IsNotNull()
    {
        DataAccessPolicyHelper.EvaluateCondition(null, PolicyOperator.IS_NULL, null).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("", PolicyOperator.IS_NULL, null).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("x", PolicyOperator.IS_NULL, null).Should().BeFalse();

        DataAccessPolicyHelper.EvaluateCondition("x", PolicyOperator.IS_NOT_NULL, null).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(null, PolicyOperator.IS_NOT_NULL, null).Should().BeFalse();
        DataAccessPolicyHelper.EvaluateCondition("", PolicyOperator.IS_NOT_NULL, null).Should().BeFalse();
    }

    [Fact]
    public void EvaluateCondition_NullOperand_ReturnsFalse()
    {
        DataAccessPolicyHelper.EvaluateCondition(null, PolicyOperator.EQUAL, "a").Should().BeFalse();
        DataAccessPolicyHelper.EvaluateCondition("a", PolicyOperator.EQUAL, null).Should().BeFalse();
    }

    [Fact]
    public void EvaluateCondition_Contains()
    {
        DataAccessPolicyHelper.EvaluateCondition("hello world", PolicyOperator.CONTAIN, "world").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("hello", PolicyOperator.NOT_CONTAIN, "zzz").Should().BeTrue();
    }

    [Theory]
    [InlineData(PolicyOperator.GREATER_THAN, 5, 3, true)]
    [InlineData(PolicyOperator.GREATER_THAN, 3, 5, false)]
    [InlineData(PolicyOperator.GREATER_THAN_OR_EQUAL, 5, 5, true)]
    [InlineData(PolicyOperator.LESS_THAN, 3, 5, true)]
    [InlineData(PolicyOperator.LESS_THAN_OR_EQUAL, 5, 5, true)]
    public void EvaluateCondition_Numeric(PolicyOperator op, int left, int right, bool expected)
    {
        DataAccessPolicyHelper.EvaluateCondition(left, op, right).Should().Be(expected);
    }

    [Fact]
    public void EvaluateCondition_StartWith_EndWith_Regex()
    {
        DataAccessPolicyHelper.EvaluateCondition("hello", PolicyOperator.START_WITH, "he").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("hello", PolicyOperator.END_WITH, "lo").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("abc123", PolicyOperator.REGEX, @"^abc\d+$").Should().BeTrue();
    }

    [Fact]
    public void EvaluateCondition_In_And_NotIn()
    {
        var arr = new object[] { "a", "b", "c" };
        DataAccessPolicyHelper.EvaluateCondition("b", PolicyOperator.IN, arr).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition("z", PolicyOperator.IN, arr).Should().BeFalse();
        DataAccessPolicyHelper.EvaluateCondition("z", PolicyOperator.NOT_IN, arr).Should().BeTrue();
    }

    [Fact]
    public void EvaluateCondition_In_AcceptsCommaDelimitedWireValue()
    {
        DataAccessPolicyHelper.EvaluateCondition(
            "user-2", PolicyOperator.IN, "user-1, user-2").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(
            "user-3", PolicyOperator.IN, "user-1,user-2").Should().BeFalse();
    }

    [Fact]
    public void EvaluateCondition_Equality_AcceptsCommaDelimitedPrincipalAlternatives()
    {
        DataAccessPolicyHelper.EvaluateCondition(
            "user-2", PolicyOperator.EQUAL, "user-1,user-2").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(
            "user-2", PolicyOperator.NOT_EQUAL, "user-1,user-2").Should().BeFalse();
        DataAccessPolicyHelper.EvaluateCondition(
            "user-3", PolicyOperator.NOT_EQUAL, "user-1,user-2").Should().BeTrue();
    }

    [Fact]
    public void EvaluateCondition_ArrayLeft_Contain_All()
    {
        // left roles array CONTAIN right => all right elements exist in left
        var roles = new[] { "admin", "user", "hr" };
        DataAccessPolicyHelper.EvaluateCondition(roles, PolicyOperator.CONTAIN, new[] { "admin", "hr" }).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(roles, PolicyOperator.CONTAIN, new[] { "admin", "missing" }).Should().BeFalse();
    }

    [Fact]
    public void EvaluateCondition_ArrayLeft_In_Intersection()
    {
        var roles = new[] { "user", "hr-admin" };
        DataAccessPolicyHelper.EvaluateCondition(roles, PolicyOperator.IN, new[] { "admin", "hr-admin", "manager" }).Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(roles, PolicyOperator.IN, new[] { "admin", "manager" }).Should().BeFalse();
    }

    [Fact]
    public void EvaluateCondition_ArrayLeft_SingleStringRight()
    {
        var roles = new[] { "admin", "user" };
        DataAccessPolicyHelper.EvaluateCondition(roles, PolicyOperator.CONTAIN, "admin").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(roles, PolicyOperator.NOT_CONTAIN, "root").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(new[] { "admin" }, PolicyOperator.EQUAL, "admin").Should().BeTrue();
        DataAccessPolicyHelper.EvaluateCondition(roles, PolicyOperator.EQUAL, "admin").Should().BeFalse();
    }
}

public class DataAccessPolicyHelperFilterTests
{
    [Fact]
    public void BuildConditionFilter_Equal()
    {
        var filter = DataAccessPolicyHelper.BuildConditionFilter("Age", PolicyOperator.EQUAL, 30);
        Assert.Equal(new BsonDocument("Age", 30), filter);
    }

    [Fact]
    public void BuildConditionFilter_NotEqual_Gt_Lt()
    {
        Assert.Equal(new BsonDocument("Age", new BsonDocument("$ne", 30)),
            DataAccessPolicyHelper.BuildConditionFilter("Age", PolicyOperator.NOT_EQUAL, 30));
        Assert.Equal(new BsonDocument("Age", new BsonDocument("$gt", 30)),
            DataAccessPolicyHelper.BuildConditionFilter("Age", PolicyOperator.GREATER_THAN, 30));
        Assert.Equal(new BsonDocument("Age", new BsonDocument("$lte", 30)),
            DataAccessPolicyHelper.BuildConditionFilter("Age", PolicyOperator.LESS_THAN_OR_EQUAL, 30));
    }

    [Fact]
    public void BuildConditionFilter_In_NotIn()
    {
        var inFilter = DataAccessPolicyHelper.BuildConditionFilter("Status", PolicyOperator.IN, new object[] { "a", "b" });
        inFilter["Status"].AsBsonDocument.Contains("$in").Should().BeTrue();

        var ninFilter = DataAccessPolicyHelper.BuildConditionFilter("Status", PolicyOperator.NOT_IN, new object[] { "a" });
        ninFilter["Status"].AsBsonDocument.Contains("$nin").Should().BeTrue();
    }

    [Fact]
    public void BuildConditionFilter_Equality_ExpandsCommaDelimitedPrincipalAlternatives()
    {
        Assert.Equal(
            new BsonDocument("OwnerId", new BsonDocument("$in", new BsonArray { "u1", "u2" })),
            DataAccessPolicyHelper.BuildConditionFilter("OwnerId", PolicyOperator.EQUAL, "u1,u2"));
        Assert.Equal(
            new BsonDocument("OwnerId", new BsonDocument("$nin", new BsonArray { "u1", "u2" })),
            DataAccessPolicyHelper.BuildConditionFilter("OwnerId", PolicyOperator.NOT_EQUAL, "u1,u2"));
    }

    [Fact]
    public void BuildConditionFilter_StartWith_UsesRegex()
    {
        var filter = DataAccessPolicyHelper.BuildConditionFilter("Name", PolicyOperator.START_WITH, "Jo");
        var inner = filter["Name"].AsBsonDocument;
        inner["$regex"].AsString.Should().StartWith("^");
        inner["$options"].AsString.Should().Be("i");
    }

    [Fact]
    public void BuildConditionFilter_IsNull_IsNotNull()
    {
        Assert.Equal(new BsonDocument("X", BsonNull.Value),
            DataAccessPolicyHelper.BuildConditionFilter("X", PolicyOperator.IS_NULL, null));
        Assert.Equal(new BsonDocument("X", new BsonDocument("$ne", BsonNull.Value)),
            DataAccessPolicyHelper.BuildConditionFilter("X", PolicyOperator.IS_NOT_NULL, null));
    }
}

public class DataAccessPolicyHelperPathTests
{
    [Theory]
    [InlineData("Courses.Description", "Courses.0.Description", true)]
    [InlineData("Skills", "Skills.0", true)]
    [InlineData("Courses.Title", "Courses.0.Title", true)]
    [InlineData("Contact", "Contact.Email", false)] // extra non-numeric segment => no match
    [InlineData("A.B", "A.B", true)]
    [InlineData("A.B", "A.C", false)]
    public void RowPathMatchesSchemaPath(string schemaPath, string rowPath, bool expected)
    {
        DataAccessPolicyHelper.RowPathMatchesSchemaPath(schemaPath, rowPath).Should().Be(expected);
    }

    [Fact]
    public void RowPathMatchesSchemaPath_EmptyInputs()
    {
        DataAccessPolicyHelper.RowPathMatchesSchemaPath("", "x").Should().BeFalse();
        DataAccessPolicyHelper.RowPathMatchesSchemaPath("x", "").Should().BeFalse();
    }

    [Fact]
    public void IsPathCoveredByClsFieldNames()
    {
        var names = new HashSet<string> { "Courses.Title" };
        DataAccessPolicyHelper.IsPathCoveredByClsFieldNames("Courses.Title", names).Should().BeTrue();
        DataAccessPolicyHelper.IsPathCoveredByClsFieldNames("Courses", names).Should().BeTrue(); // container of listed leaf
        DataAccessPolicyHelper.IsPathCoveredByClsFieldNames("Courses.Title.Sub", names).Should().BeTrue();
        DataAccessPolicyHelper.IsPathCoveredByClsFieldNames("Other", names).Should().BeFalse();
        DataAccessPolicyHelper.IsPathCoveredByClsFieldNames("", names).Should().BeFalse();
    }

    [Fact]
    public void IsPathProtectedByCls()
    {
        var names = new HashSet<string> { "Salary", "Contact.Email" };
        DataAccessPolicyHelper.IsPathProtectedByCls("Salary", names).Should().BeTrue();
        DataAccessPolicyHelper.IsPathProtectedByCls("Contact.Email", names).Should().BeTrue();
        DataAccessPolicyHelper.IsPathProtectedByCls("Contact", names).Should().BeTrue(); // ancestor of protected leaf
        DataAccessPolicyHelper.IsPathProtectedByCls("Name", names).Should().BeFalse();
        DataAccessPolicyHelper.IsPathProtectedByCls("Salary", new HashSet<string>()).Should().BeFalse();
    }

    [Fact]
    public void IsPathAllowed_Basic()
    {
        var allowed = new HashSet<string> { "Name", "Contact.Email" };
        DataAccessPolicyHelper.IsPathAllowed("Name", allowed).Should().BeTrue();
        DataAccessPolicyHelper.IsPathAllowed("Contact.Email", allowed).Should().BeTrue();
        DataAccessPolicyHelper.IsPathAllowed("Contact", allowed).Should().BeTrue(); // ancestor of allowed leaf
        DataAccessPolicyHelper.IsPathAllowed("Secret", allowed).Should().BeFalse();
        DataAccessPolicyHelper.IsPathAllowed("Name", new HashSet<string>()).Should().BeFalse();
    }

    [Fact]
    public void IsPathAllowed_Protected_RequiresExplicitAllow()
    {
        var allowed = new HashSet<string> { "Salary" };
        var protectedByCls = new HashSet<string> { "Salary" };
        DataAccessPolicyHelper.IsPathAllowed("Salary", allowed, protectedByCls).Should().BeTrue();

        var deniedAllowed = new HashSet<string>();
        DataAccessPolicyHelper.IsPathAllowed("Salary", deniedAllowed, protectedByCls).Should().BeFalse();
    }
}

public class DataAccessPolicyHelperEvaluatePoliciesTests
{
    [Fact]
    public void EvaluatePolicies_EmptyList_DeniesAccess()
    {
        var result = new List<DataAccessPolicy>().EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);
        result.IsAccessGranted.Should().BeFalse();
    }

    [Fact]
    public void EvaluatePolicies_NoApplicablePolicies_Denies()
    {
        // Policy is for WRITE, we ask for READ
        var policy = Policy(PolicyType.RLS, PolicyOperation.WRITE, Array.Empty<string>(),
            Group(PolicyLogicalOperator.AND, Rule(ConditionSource.STATIC_VALUE, "x", PolicyOperator.EQUAL, staticValue: "x")));
        var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);
        result.IsAccessGranted.Should().BeFalse();
    }

    [Fact]
    public void EvaluatePolicies_EmptyRuleGroup_Denies()
    {
        var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
            Group(PolicyLogicalOperator.AND)); // no rules
        var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);
        result.IsAccessGranted.Should().BeFalse();
        result.ErrorMessage.Should().NotBeNull();
    }

    [Fact]
    public void EvaluatePolicies_SchemaFieldRule_GrantsWithDataFilter()
    {
        // CreatedBy == static "abc" => grants with data filter
        var rule = Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, staticValue: "abc");
        var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
            Group(PolicyLogicalOperator.AND, rule));

        var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

        result.IsAccessGranted.Should().BeTrue();
        result.RequiresDataFilter.Should().BeTrue();
        result.DataFilter.Contains("CreatedBy").Should().BeTrue();
    }

    [Fact]
    public void EvaluatePolicies_DenyPolicy_WhenConditionMatches_Denies()
    {
        // Deny policy with a token-only always-true rule => access denied when matched.
        var denyRule = Rule(ConditionSource.AUTH, "userid", PolicyOperator.IS_NOT_NULL);
        TestSupport.SetContext(userId: "u1");
        try
        {
            var deny = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
                Group(PolicyLogicalOperator.AND, denyRule), isAllow: false);
            var result = new List<DataAccessPolicy> { deny }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);
            result.IsAccessGranted.Should().BeFalse();
            result.ErrorMessage.Should().Contain("Access denied by policy");
        }
        finally
        {
            TestSupport.ClearContext();
        }
    }

    [Fact]
    public void EvaluatePolicy_NullRuleGroup_Denies()
    {
        var policy = new DataAccessPolicy { RuleGroup = null! };
        policy.EvaluatePolicy().IsAccessGranted.Should().BeFalse();
    }
}

[Collection("ContextSerial")]
public class DataAccessPolicyHelperTokenTests
{
    [Fact]
    public void GetTokenValue_NoContext_ReturnsNull()
    {
        TestSupport.ClearContext();
        DataAccessPolicyHelper.GetTokenValue("userid").Should().BeNull();
    }

    [Fact]
    public void GetTokenValue_MapsKnownClaims()
    {
        TestSupport.SetContext(userId: "u-1", userName: "e@x.com", tenantId: "t-1",
            roles: new[] { "admin" }, permissions: new[] { "READ" });
        try
        {
            DataAccessPolicyHelper.GetTokenValue("userid").Should().Be("u-1");
            DataAccessPolicyHelper.GetTokenValue("sub").Should().Be("u-1");
            DataAccessPolicyHelper.GetTokenValue("email").Should().Be("e@x.com");
            DataAccessPolicyHelper.GetTokenValue("tenantid").Should().Be("t-1");
            DataAccessPolicyHelper.GetTokenValue("roles").Should().BeEquivalentTo(new[] { "admin" });
            DataAccessPolicyHelper.GetTokenValue("permissions").Should().BeEquivalentTo(new[] { "READ" });
            DataAccessPolicyHelper.GetTokenValue("unknownclaim").Should().BeNull();
        }
        finally
        {
            TestSupport.ClearContext();
        }
    }

    [Fact]
    public void EvaluatePolicies_TokenRule_GrantsFullAccess_NoFilter()
    {
        TestSupport.SetContext(userId: "u-1", roles: new[] { "hr-admin" });
        try
        {
            // token roles CONTAIN static "hr-admin" => token-only validation grants full access
            var rule = Rule(ConditionSource.AUTH, "roles", PolicyOperator.CONTAIN, staticValue: "hr-admin");
            var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
                Group(PolicyLogicalOperator.AND, rule));

            var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

            result.IsAccessGranted.Should().BeTrue();
            result.RequiresDataFilter.Should().BeFalse();
        }
        finally
        {
            TestSupport.ClearContext();
        }
    }

    [Fact]
    public void EvaluatePolicies_TokenVsSchemaField_BuildsFilterFromTokenValue()
    {
        TestSupport.SetContext(userId: "owner-42");
        try
        {
            // token.userid == CreatedBy => filter { CreatedBy: "owner-42" }
            var rule = Rule(ConditionSource.AUTH, "userid", PolicyOperator.EQUAL,
                ConditionSource.SCHEMA_FIELD, rightOperand: "CreatedBy");
            var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
                Group(PolicyLogicalOperator.AND, rule));

            var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

            result.IsAccessGranted.Should().BeTrue();
            result.RequiresDataFilter.Should().BeTrue();
            result.DataFilter.Contains("CreatedBy").Should().BeTrue();
            result.DataFilter["CreatedBy"].AsString.Should().Be("owner-42");
        }
        finally
        {
            TestSupport.ClearContext();
        }
    }

    [Fact]
    public void EvaluatePolicies_TokenVsSchemaField_NullToken_Denies()
    {
        TestSupport.SetContext(userId: "");
        try
        {
            var rule = Rule(ConditionSource.AUTH, "userid", PolicyOperator.EQUAL,
                ConditionSource.SCHEMA_FIELD, rightOperand: "CreatedBy");
            var policy = Policy(PolicyType.RLS, PolicyOperation.READ, Array.Empty<string>(),
                Group(PolicyLogicalOperator.AND, rule));

            var result = new List<DataAccessPolicy> { policy }.EvaluatePolicies(PolicyOperation.READ, PolicyType.RLS);

            result.IsAccessGranted.Should().BeFalse();
        }
        finally
        {
            TestSupport.ClearContext();
        }
    }
}
