# Blocks.DataAccess

The data entities of the Data Gateway and the resolver that evaluates `DataAccessPolicy` (row- and
column-level rules), as a class library with no GraphQL dependency. It is the first step of giving
every Blocks service one access-policy engine.

## What is in here

| Folder | Contents |
|---|---|
| `Entities/` | The gateway's Mongo entities, moved unchanged: `SchemaDefinition`, `FieldDefinition`, `DataAccessPolicy`, `DataValidation`, snapshot and publish-state entities, and so on. Class names and Bson attributes are untouched, so collection names (`typeof(T).Name + "s"`) and published snapshots keep working. |
| `Models/` | The enums (`PolicyOperation`, `SchemaAccessLevel`, ...), `SchemaDefinitionExtended` (schema + assembled policies) and `FieldDefinitionResponse`. |
| `Policies/` | The resolver and the evaluation code. |

## The resolver

```csharp
services.AddBlocksDataAccess();                                     // IAccessPolicySource + IDataAccessPolicyResolver
services.AddSingleton<IAccessPrincipalAccessor, MyPrincipalAccessor>(); // the host says who the caller is

var request = new SchemaAccessRequest(principals.Current, schema, PolicyOperation.READ);
var rls = resolver.Check(request);                                  // RLS gate: allow/deny + data filter
var filter = resolver.BuildReadFilter(request, userFilter, rls);    // Mongo filter for the query
var projection = resolver.BuildReadProjection(request, requestedFields);
var row = resolver.MaskRow(request, document.ToDictionary(), projection);   // CLS on the way out
var restriction = resolver.RestrictInput(request, input);           // CLS on the way in
var allowed = resolver.ListAllowed(principals.Current, schema);     // for menus and buttons
```

By schema name, with the schema, its policies and its validations read from the caller's tenant database
(`IDataAccessResolver`, registered by `AddBlocksDataAccess()`, needs Genesis' `IDbContextProvider`):

```csharp
var resolved = await dataAccess.ResolveReadFilterAsync("Order", userFilter);
var edit = await dataAccess.ResolveMutationFilterAsync("Order", PolicyOperation.EDIT, baseFilter);

var read = await dataAccess.ResolveReadAsync("Order", userFilter, ["Status", "Amount"]);   // Filter + Projection + Mask(row)
var projection = await dataAccess.ResolveProjectionAsync("Order", ["Status"]);              // Projection + Mask(row)
var insert = await dataAccess.ResolveInsertAsync("Order", input);                           // input with disallowed fields removed
var restricted = await dataAccess.ResolveInputAsync("Order", PolicyOperation.EDIT, input);
var update = await dataAccess.ResolveUpdateAsync("Order", baseFilter, input);               // Filter + restricted Input
var delete = await dataAccess.ResolveDeleteAsync("Order", baseFilter);                      // Filter
```

The schema is loaded from the caller's tenant collections (`SchemaDefinitions`, `DataAccessPolicys`,
`DataValidations`) and assembled the way the gateway assembles it at publish time: `FieldDefinitionMapper`
builds the field tree and `SchemaPolicyDerivation` adds the inherited column policies and drops the
irrelevant ones. Those two, plus `SchemaTypeHelper.IsScalar`, are the gateway's former private methods;
the gateway now forwards to them.

Every result has `IsAccessGranted`; its filter, projection or input is null when it is false, so the caller
raises its own error and never sees a policy. The caller still runs Mongo itself and still owns what is not
policy: validation rules, uniqueness, default values and change events.

```csharp
```

`AccessPrincipal` is the caller as the evaluator sees it: user id, user name, tenant, organization,
roles, permissions, `IsAuthenticated` and `IsRootTenant`. `AccessPrincipal.From(BlocksContext, isRootTenant)`
builds it with the same field mapping the evaluator always used. Capturing it once per request is the
only change from the gateway's original code, which read `BlocksContext` and its request context ambiently.

Policies come from `IAccessPolicySource`; the only implementation today returns the list the schema
builder attached to `SchemaDefinitionExtended.Policies` from the published snapshot. Other sources plug in there.

## Behaviour kept on purpose

This extraction changes no rule. Two gateway quirks are therefore still here and are pinned by
`XUnitTest/DataAccess/DataAccessPolicyResolverTests.cs`:

- The READ gate uses the schema's read level and honours `ALL` policies; the WRITE/EDIT/DELETE gate
  uses the operation's level and only policies declared for exactly that operation.
- The root tenant bypasses RLS and CLS everywhere.

Known evaluator defects (CLS ignores `IsAllowPolicy`, `email` resolves to the user name, custom claims
are unsupported, `CONTAIN` builds an unescaped regex) are also unchanged; they are tracked as follow-ups.
