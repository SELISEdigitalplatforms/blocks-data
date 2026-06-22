# blocks-datagateway-next-sub

A submodule of the [Blocks](https://github.com/SELISEdigitalplatforms/blocks-datagateway-next-sub) platform that provides **data source configuration**, **schema management**, **access control**, **field validation**, and a **GraphQL playground** for Next.js applications.

> This module is part of an open-source initiative. Contributions, issues, and feedback are welcome.

---

## Table of Contents

- [Overview](#overview)
- [Module Architecture](#module-architecture)
- [Features](#features)
- [Key Concepts & Patterns](#key-concepts--patterns)
- [Services Reference](#services-reference)
- [Hooks Reference](#hooks-reference)
- [Models & Types](#models--types)
- [Constants & Endpoints](#constants--endpoints)
- [Utility Functions](#utility-functions)
- [Environment Variables](#environment-variables)
- [Running Tests](#running-tests)

---

## Overview

The `data-gateway` submodule is the management layer for the Blocks platform's **Unified Data Service (UDS)**. It allows teams to connect a MongoDB database, define schemas (Entities and DTOs), control read/write/delete access at both the row (RLS) and column (CLS) level, define declarative access policies with rule groups, add per-field validation rules, and interact with the live GraphQL API through a built-in playground.

| Domain                 | Status     | Description                                                                                        |
| ---------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| **Data Source**        | Production | Connect and manage MongoDB data source configurations per project                                  |
| **Schema Management**  | Production | Create, update, and delete Entity and DTO schemas with typed field definitions                     |
| **Access Control**     | Production | Row-Level Security (RLS) and Column-Level Security (CLS) with role/user/permission-based rule sets |
| **Policy Engine**      | Production | Declarative allow/deny policies with nested rule groups for fine-grained data access               |
| **Field Validation**   | Production | Per-field validation rules (e.g., min/max, regex, required) with custom error messages             |
| **Mock Data**          | Production | View and delete seeded mock data per collection                                                    |
| **GraphQL Playground** | Production | Live query editor that executes against the project's running data gateway pod                     |
| **Pipeline**           | Production | Trigger CI/CD pipeline to build and deploy the data gateway service                                |

---

## Module Architecture

```
data-gateway/
├── components/
│   ├── add-edit-schema.tsx                    # Create / edit schema modal (name, type, collection)
│   ├── configure-data-source.tsx              # Data source connection form (connection string, DB name)
│   ├── data-service-instructions.tsx          # Contextual help / instructions panel
│   ├── data-service.tsx                       # Top-level data service page wrapper
│   ├── info-card.tsx                          # Summary info card component
│   ├── schema-access-control-drawer.tsx       # Drawer for managing row/column access on a schema
│   ├── schema-access-drawer.tsx               # Drawer for setting field-level access rules
│   ├── schema-access-list.tsx                 # List view of access rules for a schema
│   ├── schema-access-toolbar.tsx              # Toolbar (search, bulk actions) for access list
│   ├── schema-basic-info.tsx                  # Schema name, type, and collection display
│   ├── schema-basic-info-skeleton.tsx         # Loading skeleton for schema basic info
│   ├── schema-cls-toggle.tsx                  # Toggle to enable/disable Column-Level Security
│   ├── schema-details-page.tsx                # Full detail page for a single schema
│   ├── schema-preview-drawer.tsx              # Drawer showing JSON structure preview
│   ├── schema-rls-toggle.tsx                  # Toggle to enable/disable Row-Level Security
│   ├── schema-side-bar.tsx                    # Sidebar navigation for schema sections
│   ├── schema-structure.tsx                   # Schema fields editor (add, edit, delete, reorder)
│   ├── schema-structure-table-skeleton.tsx    # Loading skeleton for the fields table
│   ├── graphql-playground/
│   │   ├── graphql-playground.tsx             # Monaco editor + response pane
│   │   ├── graphql-playground-page.tsx        # Page wrapper for the GraphQL playground
│   │   ├── clean-test-data-modal.tsx          # Confirmation modal for deleting mock data
│   │   └── index.ts
│   ├── schema-access-control/
│   │   ├── rule-set-form.tsx                  # Form for building a policy rule group
│   │   ├── schema-access-control-accordion.tsx
│   │   └── schema-access-control-view.tsx     # Read-only view of existing policies
│   ├── schema-fields-validation/
│   │   └── schema-field-validation-drawer.tsx # Drawer for managing per-field validation rules
│   └── schema-structure/
│       ├── property-type-selector.tsx         # Dropdown for selecting field type (String, Int, DTO, …)
│       ├── schema-desktop-row.tsx             # Table row for a single field (desktop)
│       ├── schema-mobile-card.tsx             # Card for a single field (mobile)
│       └── schema-structure-header.tsx        # Column headers for the fields table
│
├── constant/
│   ├── endpoint.constant.ts                   # All API endpoint paths grouped by domain
│   ├── access-icons.constants.tsx             # Icon mappings for access entry types
│   ├── input-restrictions.ts                  # Regex / length rules for form inputs
│   ├── instructions.ts                        # Help text strings for the instructions panel
│   └── schema-access-control.ts              # Enum-like constants for access control options
│
├── hooks/
│   ├── use-configuration.ts                   # All TanStack Query hooks (16 queries + mutations)
│   ├── use-configuration.test.ts
│   ├── use-bulk-operations.ts                 # Multi-row select, bulk duplicate, bulk delete for schema fields
│   ├── use-dto-preview-map.ts                 # Builds type→shape map for DTO field previews
│   ├── use-dto-preview-map.test.ts
│   ├── use-readonly-expanded.ts               # Manages expand/collapse state for read-only field rows
│   ├── use-readonly-expanded.test.ts
│   ├── use-schema-preview.ts                  # Derives JSON preview and template fields from PropertyRow[]
│   └── use-schema-preview.test.ts
│
├── models/
│   ├── data-service.ts                        # All API payload/response interfaces and core entities
│   ├── schema-access.types.ts                 # FieldAccessTarget, AccessEntry, PermissionOption
│   ├── schema-preview.types.ts                # Types for JSON preview rendering
│   └── schema-structure.types.ts             # PropertyRow, PREVIEW_TYPE_MAP, defaultProperty
│
├── pages/
│   └── logs/
│       ├── data-service-logs.tsx              # Service log viewer (LMT integration)
│       └── index.ts
│
├── services/
│   ├── configuration.service.ts              # ConfigurationService class + singleton export
│   └── configuration.service.test.ts
│
├── test-utils/
│   ├── __mocks__/
│   │   ├── data.mock.ts                       # Typed fixture data for all entities
│   │   ├── mock-factories.ts                  # vi.fn() service mock factories
│   │   └── index.ts
│   └── msw/
│       └── dataGatewayHandler.ts              # MSW request handlers (default + per-test factories)
│
└── utils/
    ├── graphql-template.utils.ts              # Generates GraphQL query/mutation templates from schema fields
    ├── graphql-template.utils.test.ts
    ├── input-restriction.util.ts              # Applies input-restriction rules to form values
    ├── input-restriction.util.test.ts
    ├── schema-access-control.utils.ts         # Helpers for building policy rule payloads
    ├── schema-access-control.utils.test.ts
    ├── schema-access.utils.ts                 # Sanitize and transform access rule sets
    ├── schema-access.utils.test.ts
    ├── schema-structure.utils.ts              # Field type mapping, preview type derivation
    └── schema-structure.utils.test.ts
```

---

## Features

### Data Source Configuration

- **Connect a database** — Provide a MongoDB connection string and database name to register a data source for a project.
- **Reload schemas** — Refresh schema definitions from the live database; triggers invalidation of the schema list and unadapted change log.

### Schema Management

- **Entity schemas** — Define named collections with fully typed fields. Supports scalar types (`String`, `Int`, `Long`, `Float`, `Boolean`, `DateTime`) and references to DTO schemas.
- **DTO schemas** — Define reusable object shapes that can be embedded as field types in Entity schemas.
- **Field arrays** — Any field can be marked `isArray` to represent a list of values.
- **Unadapted change logs** — Track schema changes that have not yet been applied to the live gateway configuration — visible as a badge alerting the user to deploy.

### Access Control

- **Row-Level Security (RLS)** — Toggle to gate which rows a user/role/permission can read, write, or delete at the schema level.
- **Column-Level Security (CLS)** — Toggle to gate which fields a user/role/permission can access.
- **Field-level access** — Per-field `readAccess`, `writeAccess`, `deleteAccess` rule sets specifying allowed roles, users, and permissions.
- **Bulk access management** — Select multiple fields and apply access changes in one operation via `useBulkOperations`.

### Policy Engine

- **Allow/Deny policies** — Create declarative access policies with `isAllowPolicy` flag, priority ordering, and nested rule groups (`IPolicyRuleGroup`).
- **Rule groups** — Combine conditions with logical operators (`AND`/`OR`) and support unlimited nesting via `nestedGroups`.
- **Policy CRUD** — Full create, read (by entity name), update, and delete lifecycle.

### Field Validation

- **Per-field rules** — Attach validation rules to any schema field (e.g., min/max length, regex pattern, required) with a custom `errorMessage` and `isActive` toggle.
- **Full lifecycle** — Get, create, update, and delete field validation rule sets.

### GraphQL Playground

- **Live query execution** — Submit GraphQL queries/mutations directly against the project's running gateway pod via `executeGraphQLOperation`.
- **Template generation** — `graphql-template.utils.ts` auto-generates query/mutation templates from schema field definitions.
- **Mock data management** — View the count of mock documents per collection and delete them via the playground's clean-test-data modal.

### Pipeline & Pod Management

- **Initiate pipeline** — Trigger the CI/CD pipeline to build and deploy the data gateway service via `API_BASES.CLOUD_BUILD`.
- **Pod health check** — Poll the pod's `/ping` endpoint to determine readiness before allowing GraphQL execution (`useGetPodActiveStatus` with configurable `refetchInterval`).

---

## Key Concepts & Patterns

### Layered Architecture

All features follow the same three-layer pattern:

```
Service  →  Hook  →  Component
```

1. **Service** — `ConfigurationService` is a plain TypeScript class using the shared `http` client. No React dependency; fully unit-testable in isolation.
2. **Hook** — TanStack Query (`useQuery` / `useMutation`) wrappers in `hooks/use-configuration.ts`. The hooks own caching, invalidation, and loading/error state.
3. **Component / Page** — Consumes hooks only. Contains no direct API calls.

### Single Service Singleton

All API calls go through the single exported singleton:

```typescript
import { configurationService } from "@blocks-data-gateway/services/configuration.service";
```

### Unadapted Change Log as Deployment Signal

After any schema, access, policy, or validation mutation, the `unadapted-change-logs` query is invalidated. The UI uses the response — a list of `{ changeType: number }` items — to show a badge indicating undeployed changes. When the user reloads schemas, the badge clears.

### Environment Variables

| Variable                   | Used by                                                | Purpose                                                                                       |
| -------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | `constant/endpoint.constant.ts` (via shared constants) | Derives `API_BASES.UDS` (Unified Data Service) and `API_BASES.CLOUD_BUILD` (pipeline trigger) |

---

## Services Reference

### `ConfigurationService` (`services/configuration.service.ts`)

Singleton exported as `configurationService`. All calls use the shared `http` client.

| Method                                          | HTTP   | Description                                                                     |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `createDataSource(payload)`                     | POST   | Register a new MongoDB data source for a project                                |
| `updateDataSource(payload)`                     | PUT    | Update an existing data source connection string or database name               |
| `getDataServiceDetails(payload)`                | GET    | Fetch the data source configuration for a project                               |
| `reloadSchemas(payload)`                        | POST   | Reload schema definitions from the live database                                |
| `getSchemaList(payload)`                        | GET    | Paginated, filtered list of schemas (`keyword`, `schemaType`, sort, pagination) |
| `getSchemaDetails(id, projectKey)`              | GET    | Full schema detail including all fields and access rules                        |
| `createSchema(payload)`                         | POST   | Create a new Entity or DTO schema (name, collection, type)                      |
| `updateSchema(payload)`                         | PUT    | Update schema basic info (name, collection)                                     |
| `updateSchemaStructure(payload)`                | POST   | Add, edit, or delete fields on a schema                                         |
| `deleteSchema(payload)`                         | DELETE | Delete a schema by ID                                                           |
| `setDataAccess(payload)`                        | POST   | Set row-level and field-level access rule sets for a schema                     |
| `setRowColumnPermissions(payload)`              | POST   | Set RLS/CLS permission level and affected field names                           |
| `executeGraphQLOperation(shortKey, key, query)` | POST   | Execute a GraphQL query/mutation against the live gateway pod                   |
| `getMockData(projectKey)`                       | GET    | List mock document counts per collection                                        |
| `deleteMockData(payload)`                       | POST   | Delete mock data for selected schema collections                                |
| `getPolicy(entityName, projectKey)`             | GET    | Fetch all access policies for a given entity                                    |
| `createPolicy(payload)`                         | POST   | Create a new access policy with rule groups                                     |
| `updatePolicy(payload)`                         | POST   | Update an existing access policy                                                |
| `deletePolicy(payload)`                         | DELETE | Delete an access policy by ID                                                   |
| `getUnadaptedChangeLogs(payload)`               | GET    | Fetch unadapted change log entries for the project                              |
| `getPodActiveStatus(slug)`                      | GET    | Ping the gateway pod to check readiness                                         |
| `initiateDataGatewayPipeline(payload)`          | GET    | Trigger CI/CD pipeline build for the data gateway                               |
| `getSchemaFieldValidation(payload)`             | GET    | Fetch validation rules for a specific schema field                              |
| `createSchemaFieldValidation(payload)`          | POST   | Create validation rules for a field                                             |
| `updateSchemaFieldValidation(payload)`          | PUT    | Update validation rules for a field                                             |
| `deleteSchemaFieldValidation(payload)`          | DELETE | Delete a field validation rule set                                              |

---

## Hooks Reference

### Configuration Hooks (`hooks/use-configuration.ts`)

#### Query Hooks

| Hook                                     | Query Key                                                      | Description                                                     |
| ---------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| `useGetDataServiceConfiguration(option)` | `["data-service-config", "get", option]`                       | Fetch the data source config for a project                      |
| `useSchemaList(payload)`                 | `["schema-list", ...filters]`                                  | Paginated, filtered schema list                                 |
| `useSchemaDetails(id, projectKey)`       | `["schema-details", id]`                                       | Full schema details; disabled when `id` is falsy                |
| `useGetMockData(option)`                 | `["mock-data"]`                                                | Mock document counts per collection                             |
| `useGetPolicyData(option)`               | `["get-policy-data", entityName, projectKey]`                  | All policies for an entity; disabled when either param is falsy |
| `useGetUnadaptedChangeLogs(option)`      | `["unadapted-change-logs", projectKey]`                        | Unadapted change log entries                                    |
| `useGetPodActiveStatus(option)`          | `["ping-pod", slug]`                                           | Pod readiness; supports configurable `refetchInterval`          |
| `useInitiateDataGatewayPipeline(option)` | `["initiate-pod", projectKey]`                                 | Trigger pipeline; supports `enabled` flag                       |
| `useGetSchemaFieldValidation(option)`    | `["schema-field-validation", schemaId, fieldName, projectKey]` | Field validation rules; disabled until all params present       |

#### Mutation Hooks

| Hook                                 | Invalidates                                                          | Description                                         |
| ------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------- |
| `useCreateDataSourceConfiguration()` | `data-service-config`                                                | Create a data source                                |
| `useUpdateDataSourceConfiguration()` | `data-service-config`, `unadapted-change-logs`                       | Update a data source                                |
| `useSchemasReload()`                 | `schema-list`, `unadapted-change-logs`                               | Reload schemas from the live database               |
| `useCreateSchema()`                  | `schema-list`, `unadapted-change-logs`                               | Create a new schema                                 |
| `useUpdateSchema()`                  | `schema-list`, `schema-details`, `unadapted-change-logs`             | Update schema basic info                            |
| `useUpdateSchemaStructure()`         | `schema-details`, `unadapted-change-logs`                            | Add/edit/delete fields                              |
| `useDeleteSchema()`                  | `schema-list`, `unadapted-change-logs`                               | Delete a schema                                     |
| `useSetDataAccess()`                 | `schema-list`, `schema-details`, `unadapted-change-logs`             | Set row/field-level access rules                    |
| `useSetRowColumnPermission()`        | `schema-list`, `schema-details`, `unadapted-change-logs`             | Set RLS/CLS permission levels                       |
| `useExecuteGraphQL()`                | —                                                                    | Execute a GraphQL operation (no cache invalidation) |
| `useDeleteMockData()`                | —                                                                    | Delete mock data for selected collections           |
| `useCreatePolicy()`                  | `get-policy-data`, `unadapted-change-logs`                           | Create an access policy                             |
| `useUpdatePolicy()`                  | `get-policy-data`, `unadapted-change-logs`                           | Update an access policy                             |
| `useDeletePolicy()`                  | `get-policy-data`, `unadapted-change-logs`                           | Delete an access policy                             |
| `useCreateSchemaFieldValidation()`   | `schema-field-validation`, `schema-details`, `unadapted-change-logs` | Create field validation rules                       |
| `useUpdateSchemaFieldValidation()`   | `schema-field-validation`, `schema-details`, `unadapted-change-logs` | Update field validation rules                       |
| `useDeleteSchemaFieldValidation()`   | `schema-field-validation`, `schema-details`, `unadapted-change-logs` | Delete field validation rules                       |

### Utility Hooks

| Hook                                          | Description                                                                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useBulkOperations(props)`                    | Manages multi-row selection state and bulk duplicate/delete operations for the schema fields editor (integrates with `react-hook-form` field arrays)  |
| `useSchemaPreview(properties, dtoPreviewMap)` | Derives a JSON preview object and a `templateFields` array from `PropertyRow[]`; memoized                                                             |
| `useDtoPreviewMap(schemaList, projectKey)`    | Builds a `Map<string, Record<string, unknown>>` mapping DTO schema names to their preview shapes; used to render nested previews for DTO-typed fields |
| `useReadonlyExpanded()`                       | Manages an expand/collapse set for read-only field rows in the schema structure table                                                                 |

---

## Models & Types

### `models/data-service.ts`

Core API contracts for all service methods. Key types:

| Type / Interface                 | Description                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `IDataServiceConfiguration`      | Data source input: `projectKey`, `databaseName`, `connectionString`, optional `itemId`                      |
| `ISchemaDetails`                 | Full schema entity with `fields`, RLS/CLS flags, access rule sets, and access level numbers                 |
| `IField`                         | A schema field: `name`, `type`, `isArray`, optional access rule sets and level numbers                      |
| `IGetSchemaListPayload`          | Query params: `pageNo`, `pageSize`, `keyword`, `sortBy`, `sortDescending`, `schemaType`, `projectKey`       |
| `ICreateSchemaPayload`           | Create/update schema: `schemaName`, `collectionName`, `schemaType` (0=Entity, 1=DTO), `projectKey`          |
| `IUpdateSchemaStructure`         | Update fields: `schemaDefinitionItemId`, `fields`, optional `deletableFieldNames`, `projectKey`             |
| `ISetDataAccessPayload`          | Row + field-level access: `readAccess`, `writeAccess`, `deleteAccess`, `fields[]`, `schemaId`, `projectKey` |
| `ISetRowColumnPermissionPayload` | RLS/CLS: `operation`, `policyType`, `fieldNames`, `accessLevel`, `schemaId`, `projectKey`                   |
| `ICreatePolicyPayload`           | Policy: `policyName`, `policyType`, `operation`, `ruleGroup`, `priority`, `isAllowPolicy`, `fieldNames`     |
| `IPolicyRuleGroup`               | Nested rule group: `logicalOperator`, `rules[]`, `nestedGroups[]`                                           |
| `IPolicyRule`                    | A single condition: left/right operands, operator, sources, staticValue                                     |
| `ISchemaFieldValidation`         | A validation entry: `type`, `value`, `secondaryValue`, `errorMessage`, `isActive`                           |
| `IUnadaptedChangeLogsResponse`   | List of `{ changeType: number }` representing undeployed changes                                            |

### `models/schema-structure.types.ts`

| Export             | Description                                                                       |
| ------------------ | --------------------------------------------------------------------------------- |
| `PropertyRow`      | Local UI representation of a schema field row (name, type, isArray, access rules) |
| `PREVIEW_TYPE_MAP` | Maps schema types (`String`, `Int`, etc.) to JSON preview value strings           |
| `defaultProperty`  | Default `PropertyRow` used when adding a new field                                |

### `models/schema-access.types.ts`

| Export              | Description                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| `FieldAccessTarget` | Field name + read/write/delete access rule sets; used for bulk access operations |
| `AccessEntry`       | A single access entry (Role, User, or Permission) with display/lookup metadata   |
| `PermissionOption`  | A permission resource option for the access rule set picker                      |

---

## Constants & Endpoints

All paths are defined in `constant/endpoint.constant.ts` and composed from the shared app constants `API_BASES.UDS` and `API_BASES.CLOUD_BUILD`.

| Group                       | Key                     | Path                                                |
| --------------------------- | ----------------------- | --------------------------------------------------- |
| `DATA_SOURCE_ENDPOINTS`     | `ADD`                   | `UDS/data-sources/add`                              |
|                             | `UPDATE`                | `UDS/data-sources/update`                           |
|                             | `GET`                   | `UDS/data-sources/{projectKey}/get`                 |
| `SCHEMA_ENDPOINTS`          | `LIST`                  | `UDS/schemas`                                       |
|                             | `DETAILS`               | `UDS/schemas/{id}`                                  |
|                             | `CREATE_INFO`           | `UDS/schemas/info`                                  |
|                             | `UPDATE_INFO`           | `UDS/schemas/info`                                  |
|                             | `UPDATE_FIELDS`         | `UDS/schemas/fields`                                |
|                             | `DELETE`                | `UDS/schemas/{id}`                                  |
|                             | `UNADAPTED_CHANGE_LOGS` | `UDS/schemas/unadapted-change-logs`                 |
| `DATA_ACCESS_ENDPOINTS`     | `MANAGE`                | `UDS/data-access/manage`                            |
|                             | `SECURITY_CHANGE`       | `UDS/data-access/security/change`                   |
|                             | `POLICY_GET`            | `UDS/data-access/policy/{entityName}/get`           |
|                             | `POLICY_CREATE`         | `UDS/data-access/policy/create`                     |
|                             | `POLICY_UPDATE`         | `UDS/data-access/policy/update`                     |
|                             | `POLICY_DELETE`         | `UDS/data-access/policy/{id}/delete`                |
| `DATA_MANAGE_ENDPOINTS`     | `GET_MOCK_DATA`         | `UDS/data-manage/{projectKey}/mock-data`            |
|                             | `DELETE_MOCK_DATA`      | `UDS/data-manage/mock-data`                         |
| `DATA_VALIDATION_ENDPOINTS` | `GET`                   | `UDS/data-validations/schema/{id}/field/{name}`     |
|                             | `CREATE`                | `UDS/data-validations`                              |
|                             | `UPDATE`                | `UDS/data-validations`                              |
|                             | `DELETE`                | `UDS/data-validations/{id}`                         |
| `GATEWAY_ENDPOINTS`         | `EXECUTE`               | `UDS/{shortKey}/gateway`                            |
|                             | `RELOAD`                | `UDS/{shortKey}/configurations/reload` |
|                             | `PING`                  | `UDS/{slug}/ping`                                   |
| `PIPELINE_ENDPOINTS`        | `INITIATE`              | `CLOUD_BUILD/build/DatagatewayPipelineInitiate`     |

---

## Utility Functions

### `utils/graphql-template.utils.ts`

Generates GraphQL query and mutation templates from a schema's field definitions. Used by the GraphQL playground to pre-populate the editor with a starting template.

### `utils/schema-structure.utils.ts`

Maps schema property types to their JSON preview representations (`getPreviewFieldType`). Used by `useSchemaPreview` to render the live JSON preview pane as fields are added or edited.

### `utils/schema-access.utils.ts`

Sanitizes and transforms `IDataAccessRuleSet` objects — removing empty arrays, normalizing null values — before they are submitted to the access control API.

### `utils/schema-access-control.utils.ts`

Builds `ICreatePolicyPayload` / `IUpdatePolicyPayload` objects from the policy rule form state, including serializing nested `IPolicyRuleGroup` trees.

### `utils/input-restriction.util.ts`

Applies input restriction rules (from `constant/input-restrictions.ts`) to form field values — for example, blocking special characters in schema names or collection names.

---

## Environment Variables

| Variable                   | Purpose                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Root URL from which `API_BASES.UDS` (Unified Data Service) and `API_BASES.CLOUD_BUILD` (pipeline trigger) are derived |

---

## Running Tests

Tests are written with **Vitest** and **React Testing Library**. MSW (Mock Service Worker) is used for API mocking.

Run all tests for this submodule from the **repo root**:

```bash
npm run test:data-gateway
```

Or run directly:

```bash
npx vitest run data-gateway/ --reporter=verbose
```

To run in watch mode:

```bash
npx vitest --watch --project data-gateway
```

Test files live alongside the code they test (e.g. `configuration.service.test.ts` next to `configuration.service.ts`) and share helpers from the `test-utils/` folder.
