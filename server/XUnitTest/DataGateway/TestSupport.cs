using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;

namespace XUnitTest.DataGateway;

/// <summary>
/// Shared builders and context helpers for DataGateway tests.
/// </summary>
internal static class TestSupport
{
    public static FieldDefinitionResponse Field(
        string name,
        string type = "String",
        bool isArray = false,
        SchemaAccessLevel read = SchemaAccessLevel.Inherited,
        SchemaAccessLevel write = SchemaAccessLevel.Inherited,
        SchemaAccessLevel edit = SchemaAccessLevel.Inherited,
        List<FieldDefinitionResponse>? children = null,
        bool isUnique = false)
    {
        return new FieldDefinitionResponse
        {
            Name = name,
            Type = type,
            IsArray = isArray,
            ReadAccessLevel = read,
            WriteAccessLevel = write,
            EditAccessLevel = edit,
            IsUniqueData = isUnique,
            Fields = children ?? new List<FieldDefinitionResponse>()
        };
    }

    public static SchemaDefinitionExtended Schema(
        string schemaName = "Person",
        string collectionName = "Persons",
        SchemaAccessLevel read = SchemaAccessLevel.Public,
        SchemaAccessLevel write = SchemaAccessLevel.Public,
        SchemaAccessLevel edit = SchemaAccessLevel.Public,
        SchemaAccessLevel delete = SchemaAccessLevel.Public,
        List<FieldDefinitionResponse>? fields = null,
        List<DataAccessPolicy>? policies = null)
    {
        return new SchemaDefinitionExtended
        {
            SchemaName = schemaName,
            CollectionName = collectionName,
            SchemaType = SchemaType.Entity,
            ReadAccessLevel = read,
            WriteAccessLevel = write,
            EditAccessLevel = edit,
            DeleteAccessLevel = delete,
            Fields = fields ?? new List<FieldDefinitionResponse>(),
            Policies = policies ?? new List<DataAccessPolicy>()
        };
    }

    public static PolicyRule Rule(
        ConditionSource leftSource,
        string leftOperand,
        PolicyOperator op,
        ConditionSource rightSource = ConditionSource.STATIC_VALUE,
        string rightOperand = "",
        object? staticValue = null)
    {
        return new PolicyRule
        {
            LeftSource = leftSource,
            LeftOperand = leftOperand,
            Operator = op,
            RightSource = rightSource,
            RightOperand = rightOperand,
            StaticValue = staticValue
        };
    }

    public static DataAccessPolicy Policy(
        PolicyType type,
        PolicyOperation operation,
        string[] fieldNames,
        PolicyRuleGroup ruleGroup,
        bool isAllow = true,
        int priority = 0,
        string name = "policy")
    {
        return new DataAccessPolicy
        {
            PolicyType = type,
            Operation = operation,
            FieldNames = fieldNames,
            RuleGroup = ruleGroup,
            IsAllowPolicy = isAllow,
            Priority = priority,
            PolicyName = name
        };
    }

    public static PolicyRuleGroup Group(PolicyLogicalOperator op, params PolicyRule[] rules)
    {
        return new PolicyRuleGroup
        {
            LogicalOperator = op,
            Rules = rules.ToList(),
            NestedGroups = new List<PolicyRuleGroup>()
        };
    }

    /// <summary>Sets the BlocksContext for the current async flow.</summary>
    public static void SetContext(
        string userId = "user-1",
        string userName = "user@x.com",
        string tenantId = "tenant-1",
        bool isAuthenticated = true,
        string[]? roles = null,
        string[]? permissions = null,
        string organizationId = "org-1")
    {
        var ctx = BlocksContext.Create(
            tenantId: tenantId,
            roles: roles ?? Array.Empty<string>(),
            userId: userId,
            isAuthenticated: isAuthenticated,
            requestUri: "http://test",
            organizationId: organizationId,
            expireOn: DateTime.UtcNow.AddHours(1),
            email: userName,
            permissions: permissions ?? Array.Empty<string>(),
            userName: userName,
            phoneNumber: string.Empty,
            displayName: string.Empty,
            oauthToken: string.Empty,
            originalTenantId: tenantId,
            applicationDomain: string.Empty,
            impersonated: false,
            impersonationSessionId: string.Empty);
        BlocksContext.SetContext(ctx);
    }

    public static void ClearContext()
    {
        BlocksContext.ClearContext();
        RequestContextAccessor.Clear();
    }

    public static void SetBlocksCloud(bool isFromCloud)
    {
        RequestContextAccessor.Current = new RequestContext { IsRequestFromBlocksCloud = isFromCloud };
    }
}
