using System.Security.Claims;
using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using MongoDB.Bson;
using static XUnitTest.DataGateway.TestSupport;

namespace XUnitTest.DataGateway.Golden;

/// <summary>
/// The masking the gateway serves must be exactly the masking the plain evaluation gives. The
/// schema mixes every kind of read policy (inherited copies of row-level policies, explicit
/// column policies over several fields, deny policies, ALL policies, OR and nested groups, token
/// and row operands), Custom fields without a policy, User fields, nested objects and arrays, and
/// is assembled the way a published schema is, so the inherited copies are the real ones.
/// </summary>
[Collection("ContextSerial")]
public class ClsMaskingEquivalenceTests
{
    private const string SchemaId = "schema-case";
    private const string ContactSchemaId = "schema-contact";

    [Theory]
    [MemberData(nameof(Callers))]
    public void ServedMasking_MatchesPlainEvaluation(string caller)
    {
        var schema = AssembleCaseSchema();
        var clsPolicies = schema.Policies
            .Where(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.READ)
            .ToList();
        clsPolicies.Should().HaveCountGreaterThan(20, "the inherited copies must be in place for this test to mean anything");

        ClearContext();
        SetBlocksCloud(false);
        ApplyCaller(caller);
        try
        {
            var documents = Rows();
            var plain = documents
                .Select(doc => QueryClsRowMaskingHelper.MaskRowByClsPolicies(
                    doc.ToDictionary(), schema, clsPolicies, ["Status"], QueryPolicyRuleEvaluator.RowSatisfiesPolicy))
                .Select(row => new BsonDocument(row).ToJson())
                .ToList();

            var served = QueryService.BuildResultItems(documents, schema, ["Status"])
                .Select(row => new BsonDocument(row).ToJson())
                .ToList();

            served.Should().Equal(plain);
        }
        finally
        {
            ClearContext();
        }
    }

    [Fact]
    public void ServedMasking_ForARootTenantRequest_IsUnmasked()
    {
        var schema = AssembleCaseSchema();
        SetBlocksCloud(true);
        try
        {
            var documents = Rows();
            QueryService.BuildResultItems(documents, schema, [])
                .Select(row => new BsonDocument(row).ToJson())
                .Should().Equal(documents.Select(doc => new BsonDocument(doc.ToDictionary()).ToJson()));
        }
        finally
        {
            ClearContext();
        }
    }

    [Fact]
    public void OncePerRuleGroup_EvaluatesASharedRuleGroupOncePerRow()
    {
        ClearContext();
        SetContext(userId: "u-1", roles: ["lawyer"]);
        try
        {
            var shared = Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, ConditionSource.AUTH, "userId"));
            var policies = Enumerable.Range(0, 30)
                .Select(i => Policy(PolicyType.CLS, PolicyOperation.READ, [$"F{i}"], shared))
                .ToList();
            var evaluate = QueryPolicyRuleEvaluator.OncePerRuleGroup();
            var row = new CountingRow { ["CreatedBy"] = "u-1" };

            policies.Select(p => evaluate(p, row)).Should().AllSatisfy(r => r.Should().BeTrue());
            row.Lookups.Should().Be(1);

            var otherRow = new CountingRow { ["CreatedBy"] = "u-2" };
            policies.Select(p => evaluate(p, otherRow)).Should().AllSatisfy(r => r.Should().BeFalse());
            otherRow.Lookups.Should().Be(1, "another row is evaluated afresh");
        }
        finally
        {
            ClearContext();
        }
    }

    [Fact]
    public void OncePerRuleGroup_KeepsDistinctRuleGroupsApart()
    {
        ClearContext();
        SetContext(userId: "u-1", roles: ["lawyer"]);
        try
        {
            var owner = Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, ConditionSource.AUTH, "userId"));
            var sameRulesOtherGroup = Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, ConditionSource.STATIC_VALUE, staticValue: "u-2"));
            var evaluate = QueryPolicyRuleEvaluator.OncePerRuleGroup();
            var row = new Dictionary<string, object> { ["CreatedBy"] = "u-1" };

            evaluate(Policy(PolicyType.CLS, PolicyOperation.READ, ["A"], owner), row).Should().BeTrue();
            evaluate(Policy(PolicyType.CLS, PolicyOperation.READ, ["B"], sameRulesOtherGroup), row).Should().BeFalse();
            evaluate(new DataAccessPolicy { RuleGroup = null!, FieldNames = ["C"] }, row).Should().BeFalse();
        }
        finally
        {
            ClearContext();
        }
    }

    [Fact]
    public void OncePerRuleGroup_DoesNotKeepAFailedEvaluation()
    {
        ClearContext();
        SetContext(userId: "u-1");
        try
        {
            var invalidRegex = Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "Name", PolicyOperator.REGEX, ConditionSource.STATIC_VALUE, staticValue: "(unclosed"));
            var policy = Policy(PolicyType.CLS, PolicyOperation.READ, ["Name"], invalidRegex);
            var evaluate = QueryPolicyRuleEvaluator.OncePerRuleGroup();
            var row = new Dictionary<string, object> { ["Name"] = "x" };

            Action plain = () => QueryPolicyRuleEvaluator.RowSatisfiesPolicy(policy, row);
            Action served = () => evaluate(policy, row);
            var plainFailure = Record.Exception(plain);
            var servedFailure = Record.Exception(served);
            var servedAgain = Record.Exception(served);

            servedFailure?.GetType().Should().Be(plainFailure?.GetType());
            servedAgain?.GetType().Should().Be(plainFailure?.GetType());
        }
        finally
        {
            ClearContext();
        }
    }

    [Fact]
    public void RequestBlocksContext_ReadsTheTokenOncePerRequest()
    {
        var previousAccessor = BlocksHttpContextAccessor.Instance;
        ClearContext();
        try
        {
            var identity = TokenIdentity("u-1", "lawyer", "org-1");
            var accessor = new HttpContextAccessor { HttpContext = RequestWith(identity) };
            BlocksHttpContextAccessor.Instance = accessor;

            var first = RequestBlocksContext.Get();
            var second = RequestBlocksContext.Get();
            var fromClaims = BlocksContext.GetContext();

            second.Should().BeSameAs(first);
            first.Should().BeEquivalentTo(fromClaims, "the kept context is the one GetContext builds from the token");

            accessor.HttpContext = RequestWith(TokenIdentity("u-2", "assistant", "org-2"));
            var nextRequest = RequestBlocksContext.Get();
            nextRequest!.UserId.Should().Be("u-2");
            nextRequest.Roles.Should().Equal("assistant");
            nextRequest.OrganizationId.Should().Be("org-2");
        }
        finally
        {
            BlocksHttpContextAccessor.Instance = previousAccessor;
            ClearContext();
        }
    }

    [Fact]
    public void RequestBlocksContext_WithoutAToken_ReadsTheContextEveryTime()
    {
        var previousAccessor = BlocksHttpContextAccessor.Instance;
        ClearContext();
        try
        {
            BlocksHttpContextAccessor.Instance = new HttpContextAccessor { HttpContext = new DefaultHttpContext() };

            SetContext(userId: "u-1", isAuthenticated: false);
            RequestBlocksContext.Get()!.UserId.Should().Be("u-1");

            SetContext(userId: "u-2", isAuthenticated: false);
            RequestBlocksContext.Get()!.UserId.Should().Be("u-2");
        }
        finally
        {
            BlocksHttpContextAccessor.Instance = previousAccessor;
            ClearContext();
        }
    }

    [Fact]
    public void ServedMasking_WithATokenOnTheRequest_MatchesPlainEvaluation()
    {
        var previousAccessor = BlocksHttpContextAccessor.Instance;
        ClearContext();
        SetBlocksCloud(false);
        try
        {
            BlocksHttpContextAccessor.Instance = new HttpContextAccessor
            {
                HttpContext = RequestWith(TokenIdentity("u-1", "lawyer", "org-1")),
            };
            var schema = AssembleCaseSchema();
            var clsPolicies = schema.Policies
                .Where(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.READ)
                .ToList();
            var documents = Rows();

            var plain = documents
                .Select(doc => QueryClsRowMaskingHelper.MaskRowByClsPolicies(
                    doc.ToDictionary(), schema, clsPolicies, [], QueryPolicyRuleEvaluator.RowSatisfiesPolicy))
                .Select(row => new BsonDocument(row).ToJson())
                .ToList();
            var served = QueryService.BuildResultItems(documents, schema, [])
                .Select(row => new BsonDocument(row).ToJson())
                .ToList();

            served.Should().Equal(plain);
            served.Should().Contain(json => json.Contains("\"Title\" : \"own case\""), "the owner rule must still grant the owner's row");
        }
        finally
        {
            BlocksHttpContextAccessor.Instance = previousAccessor;
            ClearContext();
        }
    }

    public static TheoryData<string> Callers() => new()
    {
        "firmadmin", "lawyer owner", "lawyer assigned", "lawyer stranger", "assistant", "auditor",
        "no permission", "other organization", "no roles", "anonymous",
    };

    private static void ApplyCaller(string caller)
    {
        switch (caller)
        {
            case "firmadmin": SetContext(userId: "admin", roles: ["firmadmin"], permissions: ["fe::cases"]); break;
            case "lawyer owner": SetContext(userId: "u-1", roles: ["lawyer"], permissions: ["fe::cases"]); break;
            case "lawyer assigned": SetContext(userId: "u-3", roles: ["lawyer"], permissions: ["fe::cases"]); break;
            case "lawyer stranger": SetContext(userId: "u-9", roles: ["lawyer"], permissions: ["fe::cases"]); break;
            case "assistant": SetContext(userId: "u-2", roles: ["assistant", "u-1"], permissions: ["fe::cases"]); break;
            case "auditor": SetContext(userId: "aud", roles: ["auditor"], permissions: ["fe::cases", "audit::read"]); break;
            case "no permission": SetContext(userId: "u-1", roles: ["lawyer"], permissions: []); break;
            case "other organization": SetContext(userId: "admin", roles: ["firmadmin"], permissions: ["fe::cases"], organizationId: "org-2"); break;
            case "no roles": SetContext(userId: "u-1", roles: [], permissions: []); break;
            case "anonymous": SetContext(userId: "", roles: [], permissions: [], organizationId: "", isAuthenticated: false); break;
            default: throw new ArgumentOutOfRangeException(nameof(caller), caller, null);
        }
    }

    private static SchemaDefinitionExtended AssembleCaseSchema()
    {
        FieldDefinition F(string name, string type = "String", bool isArray = false,
            SchemaAccessLevel read = SchemaAccessLevel.Inherited, bool reference = false, string referenceType = "") => new()
        {
            Name = name,
            Type = type,
            IsArray = isArray,
            ReadAccessLevel = read,
            IsReferenceField = reference,
            ReferenceFieldType = referenceType,
        };

        var caseSchema = new SchemaDefinition
        {
            ItemId = SchemaId,
            SchemaName = "Case",
            CollectionName = "Cases",
            SchemaType = SchemaType.Entity,
            ReadAccessLevel = SchemaAccessLevel.Custom,
            Fields =
            [
                F("Title"), F("Status"), F("CreatedBy"), F("OrganizationId"), F("LawyerIds", isArray: true),
                F("Tags", isArray: true), F("Amount", "Float"), F("OpenedAt", "DateTime"),
                F("Secret", read: SchemaAccessLevel.Custom), F("Unguarded", read: SchemaAccessLevel.Custom),
                F("PublicNote", read: SchemaAccessLevel.Public), F("MemberNote", read: SchemaAccessLevel.User),
                F("Contact", "Contact"), F("Contact.Email", reference: true, referenceType: "Contact"),
                F("Contact.Phone", reference: true, referenceType: "Contact"),
                F("Parties", "Contact", isArray: true), F("Parties.Email", reference: true, referenceType: "Contact"),
                F("Parties.Phone", reference: true, referenceType: "Contact"),
            ],
        };
        var contactSchema = new SchemaDefinition
        {
            ItemId = ContactSchemaId,
            SchemaName = "Contact",
            CollectionName = "Contacts",
            SchemaType = SchemaType.Dto,
            ReadAccessLevel = SchemaAccessLevel.Custom,
            Fields = [F("Email"), F("Phone")],
        };

        PolicyRule Auth(string claim, PolicyOperator op, string value) =>
            Rule(ConditionSource.AUTH, claim, op, ConditionSource.STATIC_VALUE, staticValue: value);
        PolicyRule SameOrganization() =>
            Rule(ConditionSource.AUTH, "organizationId", PolicyOperator.EQUAL, ConditionSource.SCHEMA_FIELD, "OrganizationId");

        DataAccessPolicy Rls(string name, PolicyRuleGroup group, PolicyOperation operation = PolicyOperation.READ, bool allow = true) =>
            Stamp(Policy(PolicyType.RLS, operation, [], group, isAllow: allow, name: name));
        DataAccessPolicy Cls(string name, string[] fields, PolicyRuleGroup group, bool allow = true) =>
            Stamp(Policy(PolicyType.CLS, PolicyOperation.READ, fields, group, isAllow: allow, name: name));

        var policies = new List<DataAccessPolicy>
        {
            Rls("organization", Group(PolicyLogicalOperator.AND,
                SameOrganization(), Auth("roles", PolicyOperator.IN, "firmadmin,auditor"), Auth("permissions", PolicyOperator.CONTAIN, "fe::cases"))),
            Rls("owner", Group(PolicyLogicalOperator.AND,
                SameOrganization(), Auth("roles", PolicyOperator.CONTAIN, "lawyer"),
                Rule(ConditionSource.AUTH, "userId", PolicyOperator.EQUAL, ConditionSource.SCHEMA_FIELD, "CreatedBy"),
                Auth("permissions", PolicyOperator.CONTAIN, "fe::cases"))),
            Rls("assigned", Group(PolicyLogicalOperator.AND,
                SameOrganization(),
                Rule(ConditionSource.SCHEMA_FIELD, "LawyerIds", PolicyOperator.CONTAIN, ConditionSource.AUTH, "userId"))),
            Rls("assistant of creator", Group(PolicyLogicalOperator.AND,
                Auth("roles", PolicyOperator.CONTAIN, "assistant"),
                Rule(ConditionSource.AUTH, "roles", PolicyOperator.CONTAIN, ConditionSource.SCHEMA_FIELD, "CreatedBy"))),
            Rls("open or audited", new PolicyRuleGroup
            {
                LogicalOperator = PolicyLogicalOperator.OR,
                Rules = [Rule(ConditionSource.SCHEMA_FIELD, "Status", PolicyOperator.EQUAL, ConditionSource.STATIC_VALUE, staticValue: "open")],
                NestedGroups =
                [
                    Group(PolicyLogicalOperator.AND,
                        Auth("roles", PolicyOperator.CONTAIN, "auditor"),
                        Rule(ConditionSource.SCHEMA_FIELD, "Amount", PolicyOperator.GREATER_THAN, ConditionSource.STATIC_VALUE, staticValue: 100)),
                ],
            }),
            Rls("everyone, any operation", Group(PolicyLogicalOperator.AND, Auth("roles", PolicyOperator.CONTAIN, "systemadmin")), PolicyOperation.ALL),
            Rls("not archived", Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "Status", PolicyOperator.EQUAL, ConditionSource.STATIC_VALUE, staticValue: "archived")), allow: false),
            Rls("edit only", Group(PolicyLogicalOperator.AND, Auth("roles", PolicyOperator.CONTAIN, "firmadmin")), PolicyOperation.EDIT),
            Cls("secret for owners of open cases", ["Secret", "Contact.Phone"], Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "Status", PolicyOperator.EQUAL, ConditionSource.STATIC_VALUE, staticValue: "open"),
                Rule(ConditionSource.SCHEMA_FIELD, "CreatedBy", PolicyOperator.EQUAL, ConditionSource.AUTH, "userId"))),
            Cls("secret denied to auditors", ["Secret"], Group(PolicyLogicalOperator.AND, Auth("roles", PolicyOperator.CONTAIN, "auditor")), allow: false),
            Cls("tagged parties", ["Parties"], Group(PolicyLogicalOperator.AND,
                Rule(ConditionSource.SCHEMA_FIELD, "Tags", PolicyOperator.CONTAIN, ConditionSource.STATIC_VALUE, staticValue: "shared"))),
        };

        var schemas = GraphqlSchemaBuilder.Assemble(new SchemaSource
        {
            SchemaDefinitions = [caseSchema, contactSchema],
            DataAccessPolicies = policies,
        });
        return schemas.Single(s => s.ItemId == SchemaId);
    }

    private static DataAccessPolicy Stamp(DataAccessPolicy policy)
    {
        policy.ItemId = Guid.NewGuid().ToString();
        policy.SchemaId = SchemaId;
        policy.SchemaName = "Case";
        return policy;
    }

    private static List<BsonDocument> Rows()
    {
        BsonDocument Contact(string email, string phone) => new() { { "Email", email }, { "Phone", phone } };

        return
        [
            new BsonDocument
            {
                { "_id", "c-1" }, { "Title", "own case" }, { "Status", "open" }, { "CreatedBy", "u-1" },
                { "OrganizationId", "org-1" }, { "LawyerIds", new BsonArray { "u-3" } }, { "Tags", new BsonArray { "shared", "vip" } },
                { "Amount", 250.5 }, { "OpenedAt", new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc) },
                { "Secret", "s-1" }, { "Unguarded", "u" }, { "PublicNote", "p" }, { "MemberNote", "m" },
                { "Contact", Contact("a@x.com", "111") },
                { "Parties", new BsonArray { Contact("b@x.com", "222"), Contact("c@x.com", "333") } },
            },
            new BsonDocument
            {
                { "_id", "c-2" }, { "Title", "closed case" }, { "Status", "closed" }, { "CreatedBy", "u-2" },
                { "OrganizationId", "org-1" }, { "LawyerIds", new BsonArray() }, { "Tags", new BsonArray { "internal" } },
                { "Amount", 50 }, { "Secret", "s-2" }, { "PublicNote", BsonNull.Value },
                { "Contact", Contact("d@x.com", "444") },
            },
            new BsonDocument
            {
                { "_id", "c-3" }, { "Title", "other firm" }, { "Status", "open" }, { "CreatedBy", "u-9" },
                { "OrganizationId", "org-2" }, { "Amount", 500L }, { "Secret", "s-3" }, { "MemberNote", "m-3" },
                { "Parties", new BsonArray { Contact("e@x.com", "555") } },
            },
            new BsonDocument
            {
                { "_id", "c-4" }, { "Title", "archived" }, { "Status", "archived" }, { "CreatedBy", "u-1" },
                { "OrganizationId", "org-1" }, { "LawyerIds", new BsonArray { "u-1", "u-3" } }, { "Amount", 150 },
            },
            new BsonDocument { { "_id", "c-5" }, { "Title", "bare" } },
        ];
    }

    private static ClaimsIdentity TokenIdentity(string userId, string role, string organizationId)
    {
        var claims = new List<Claim>
        {
            new(BlocksContext.TENANT_ID_CLAIM, "tenant-1"),
            new(BlocksContext.USER_ID_CLAIM, userId),
            new(BlocksContext.ORGANIZATION_ID_CLAIM, organizationId),
            new(BlocksContext.ROLES_CLAIM, role),
            new(BlocksContext.PERMISSION_CLAIM, "fe::cases"),
        };
        return new ClaimsIdentity(claims, "Bearer", BlocksContext.USER_NAME_CLAIM, BlocksContext.ROLES_CLAIM);
    }

    private static DefaultHttpContext RequestWith(ClaimsIdentity identity)
    {
        var httpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) };
        httpContext.Request.Headers["x-blocks-key"] = "tenant-1";
        return httpContext;
    }

    /// <summary>A row that counts how often the evaluator reads a value from it.</summary>
    private sealed class CountingRow : Dictionary<string, object>, IDictionary<string, object>
    {
        public int Lookups { get; private set; }

        bool IDictionary<string, object>.TryGetValue(string key, out object value)
        {
            Lookups++;
            return TryGetValue(key, out value!);
        }
    }
}
