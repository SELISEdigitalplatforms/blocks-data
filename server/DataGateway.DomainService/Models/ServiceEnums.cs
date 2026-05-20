namespace DataGateway.DomainService.Models;

public enum SchemaType
{
    Entity = 1,
    Dto = 2
}

public enum ScalarType
{
    String = 1,
    Int = 2,
    Long = 3,
    Float = 4,
    Boolean = 5,
    DateTime = 6,
    ID = 7
}
public enum SchemaChangeType
{
    SchemaCreate,
    SchemaUpdate,
    SchemaDelete,
    SchemaFieldCreate,
    SchemaFieldUpdate,
    SchemaAccessLevelUpdate,
    SchemaPolicyCreate,
    SchemaPolicyUpdate,
    SchemaFieldValidationCreate,
    SchemaFieldValidationUpdate,
    SchemaFieldValidationDelete
}

public enum SchemaAccessLevel
{
    Inherited = 0,
    User = 1,
    Public = 2,
    Custom = 3
}


/// <summary>
/// Specifies the source of a condition operand.
/// </summary>
public enum ConditionSource
{
    /// <summary>
    /// Value comes from the user's authentication token (JWT claims).
    /// Available properties: UserId, Email, Roles, Permissions, TenantId, and custom claims.
    /// </summary>
    AUTH,

    /// <summary>
    /// Value comes from a field in the schema/database record.
    /// </summary>
    SCHEMA_FIELD,

    /// <summary>
    /// A static/literal value provided in the policy definition.
    /// </summary>
    STATIC_VALUE
}

/// <summary>
/// Logical operators for combining rules.
/// </summary>
public enum PolicyLogicalOperator
{
    AND,
    OR
}

/// <summary>
/// Comparison operators for policy rules.
/// </summary>
public enum PolicyOperator
{
    EQUAL,
    NOT_EQUAL,
    GREATER_THAN,
    GREATER_THAN_OR_EQUAL,
    LESS_THAN,
    LESS_THAN_OR_EQUAL,
    CONTAIN,
    NOT_CONTAIN,
    IN,
    NOT_IN,
    START_WITH,
    END_WITH,
    IS_NULL,
    IS_NOT_NULL,
    REGEX
}

/// <summary>
/// CRUD operations that policies can apply to.
/// </summary>
public enum PolicyOperation
{
    READ,
    WRITE,
    EDIT,
    DELETE,
    ALL
}

/// <summary>
/// Type of security policy.
/// </summary>
public enum PolicyType
{
    /// <summary>
    /// Row-Level Security: Controls which records a user can access.
    /// </summary>
    RLS,

    /// <summary>
    /// Column-Level Security: Controls which fields a user can access.
    /// </summary>
    CLS
}


/// <summary>
/// Sort direction for typed order clauses.
/// </summary>
public enum SortDirection
{
    ASC,
    DESC
}

/// <summary>
/// Types of validations available
/// </summary>
public enum ValidationType
{
    // Common validations for all types
    NotEmpty,
    Regex,

    // String specific validations
    MinLength,
    MaxLength,
    LengthRange,

    // Numeric and DateTime validations
    Equal,
    NotEqual,
    GreaterThan,
    LessThan,
    GreaterThanOrEqual,
    LessThanOrEqual,
    Range
}

public enum PipelineTypes
{
    DataGatewayPipeline = 1,
    BuildPipeline = 2
}

public enum PipelineEventTypes
{
    RetrieveLog = 1,
    TriggerNext = 2,
    DeletePipeLine = 3
}
