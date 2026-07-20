# Blocks Data — Technical Specification

> Scope: the `blocks-data` service (repo `blocks-data`, branch `inception`). Customer-facing product name: **Blocks Data** (decision #216). "Data Gateway" / `DataGateway` is retained as the name of the structured-data domain and its GraphQL runtime; **Storage** is the second, unstructured-data domain. The legacy names "Unified Data Service (UDS)" and "Data service" are deprecated and being replaced by "Blocks Data" (decision #216).
>
> This document reflects the ACTUAL code as of the GraphQL-only refactor, and calls out the AUTHORITATIVE decisions (ticket numbers in parentheses) as the TARGET state wherever the current code has not yet caught up. Those gaps are labelled **Gap**.

---

## 1. Technology Stack

**Backend (`server/`)** — .NET (ASP.NET Core Web API), C#. Key building blocks:
- **HotChocolate** (`HotChocolate.AspNetCore`, `HotChocolate.Types`) — the dynamic GraphQL server; one GraphQL schema/executor is built per tenant at request time.
- **MongoDB** (`MongoDB.Driver`) — the data store, both for the platform's own metadata (schema definitions, policies, validations, change logs) and for the tenant record collections the gateway serves.
- **SeliseBlocks.Genesis / Blocks.Genesis** — the shared platform framework: authentication (`ProtectedEndPoint`, token principal), tenant context (`TenantContext`, `RequestContextAccessor`), `BaseEntity`, messaging (`IMessageClient`), logging/tracing (LMT), and secret/vault resolution.
- **SeliseBlocks.ConfigurationDriver** — MongoDB-backed configuration/secrets provider.
- **FluentValidation** (+ `FluentValidation.AspNetCore`, DI extensions) — request and schema validation.
- **KubernetesClient / k8s** — used by the data-gateway runtime (in-cluster config, pod interaction).
- **YamlDotNet**, **Newtonsoft.Json** — serialization helpers.
- **Swashbuckle.AspNetCore** — Swagger ("Blocks Data API", service name `blocks-data`).

**Frontend (`client/`)** — React + Vite + TypeScript SPA (`blocks-data-client`). Key libraries:
- **@seliseblocks/blocks-kit** — shared console shell (layout, login, OIDC, project switching) reused across all Blocks services.
- **react-router-dom**, **@tanstack/react-query** (+ devtools), **@tanstack/react-table**, **zustand**, **nuqs** — routing, server-state, tables, local state, URL state.
- **GraphiQL / graphql / graphql-ws / monaco-graphql / @monaco-editor/react** — the in-console GraphQL Playground.
- **@microsoft/signalr** — real-time notifications (e.g. async schema import/export results).
- **Radix UI**, **tailwindcss** (+ animate/merge), **class-variance-authority**, **lucide-react**, **framer-motion** — design system.
- **react-hook-form + zod + @hookform/resolvers** — forms and validation.
- (Several deps — `@beefree.io/sdk`, `@mailupinc/bee-plugin`, hCaptcha — are inherited from the shared client template and not core to Blocks Data.)

**Infrastructure** — Dockerized API (`Dockerfile`) and Worker (`Dockerfile.worker`); GitHub Actions CI (`ci-dev.yml`, `ci-stg.yml`, `ci_prod.yml`); AKS (Kubernetes) deployment (`DatagatewayClusterNames: aks-blocks-prod`). The API serves the built SPA as static files and injects runtime env (`__BLOCKS_*__` token replacement in `Program.cs`).

---

## 2. Solution / Module Structure

Server projects under `server/`:

| Project | Responsibility |
| --- | --- |
| **Api** | HTTP host. Controllers, `Program.cs`, middleware wiring, SPA hosting, GraphQL endpoint mapping (`/api/gateway`). References both domain-service projects. |
| **DataGateway.DomainService** | Core of Blocks Data. Schema definitions, fields, access policies, validations, change logs, the dynamic GraphQL schema builder (`GraphTypes/`, `Resolvers/`, `GraphQL/`), query/mutation services, RLS/CLS engine (`Helpers/`), tenant-executor dispatch, and DI registration (`ServiceRegistry.cs`). |
| **DataGateway.Driver** | Lower-level data-access/driver support for the gateway. |
| **Storage.DomainService** | The **Storage** (unstructured/file) domain — DMS, upload/download, folders, pre-signed URLs, certificates. |
| **Storage.Driver** | Object-storage driver support. |
| **Worker** | Background message consumers (async schema export/import, default-folder creation, migration completion) + periodic ping background service. |
| **XUnitTest** | Unit tests for both domains and the Worker. |

Key `DataGateway.DomainService` folders: `Entities/` (persisted models), `Models/` (enums, constants, request/response DTOs), `GraphTypes/` (dynamic GraphQL input/output types), `Resolvers/` (`SchemaResolver`), `GraphQL/` (per-tenant endpoint + dispatcher), `Helpers/` (policy evaluation, Mongo filter/sort conversion, CLS masking, projection), `Middlewares/` (per-operation schema-access middleware), `Services/` + `Services/Implementations`, `Repositories/`, `Validators/`.

**Naming decisions (Gaps to apply):**
- Sibling model classes should share the namespace `DataGateway.DomainService.Models` (#220).
- `*Input` DTOs for GraphQL CRUD are kept but move to a `GraphModels` folder; controller request DTOs get a `Request` suffix; shared DTOs get no verb/suffix (e.g. `GetFile`→`FileInfo`, `GetFilesInfoFilter`→`FilesInfoFilter`) (#220).
- `DataGatewayDriverServiceExtention`→`DataGatewayDriverServiceExtension`; `'registery'`→`'registry'`; rename `Storage/Certificate.cs`→`CertificateController.cs` (#219). *(The class is already `CertificateController`; the file is still `Certificate.cs` — Gap.)*
- `TokenRepository`/`ITokenRepository` under `Services/` are unused → remove (#220). *(`ITokenRepository.cs` is still present — Gap.)*
- All 8 offending client files rename to kebab-case (#221); fix the `enviroment`→`environment` misspelling everywhere (#222).

---

## 3. API Surface

All controllers are prefixed `/api` (global route convention in `Program.cs`) and every action is guarded by `[ProtectedEndPoint("...")]` (see §5), except one anonymous endpoint noted below. There are **45** distinct permission scopes across the controllers.

### 3.1 Scope grammar (decided target)

**Current:** 2-segment scopes, `blocks-data::<action>` (e.g. `blocks-data::get-configuration`).
**Decided target (#217):** 3-segment scopes `<ApiServiceName>::<controller_route_name>::<action>` — e.g. `blocks-data::configurations::get-configuration`. `ApiServiceName` = `blocks-data` (`GraphQlConstant`). **Gap:** all 45 scopes are still 2-segment.

### 3.2 Return-type / envelope convention (decided target)

**Decided (#218):** every action returns `IActionResult` / `Task<IActionResult>`; replace `BaseResponse` and `DmsResponse` with `ServiceResponse<T>` (already defined in `Models/Responses/ServiceResponse.cs`) and make the frontend compatible. **Current:** DataGateway controllers already return `IActionResult`; **Storage `FilesController` still returns raw typed/`BaseResponse`/`DmsResponse` values** (e.g. `Task<DmsResponse>`, `Task<BaseResponse>`, `Task<FileResponse?>`) — Gap.

### 3.3 Structured-data (Data Gateway) management endpoints

Routes use kebab-case resource style and are kept as-is (#218).

**`SchemaController` — `/api/schemas`**
| Verb | Route | Scope (current) | Request → Response |
| --- | --- | --- | --- |
| GET | `/schemas` | `get-schema-definitions` | `GetSchemaDefinitionListRequest` → list |
| GET | `/schemas/aggregation` | `get-schema-definitions-summary` | `GetSchemaDefinitionListRequest` → summary |
| GET | `/schemas/get-by-id` | `get-schema-definition-by-id` | `id` → `SchemaDefinition` |
| GET | `/schemas/unadapted-change-logs` | `get-unadapted-change-logs` | → pending change logs |
| GET | `/schemas/info` | `get-entity-collections` | `projectKey` → entity collections |
| GET | `/schemas/info-by-name` | `get-entity-collection-by-name` | `schemaName` → entity collection |
| POST | `/schemas/define` | `create-schema-definition` | `CreateSchemaDefinitionRequest` |
| POST | `/schemas/info` | `create-schema` | `CreateSchemaRequest` |
| POST | `/schemas/fields` | `save-schema-fields` | `SaveFieldDefinitionRequest` |
| PUT | `/schemas/define` | `update-schema-definition` | `UpdateSchemaDefinitionRequest` |
| PUT | `/schemas/info` | `update-schema` | `UpdateSchemaRequest` |
| DELETE | `/schemas` | `delete-schema-definition` | `id` |

> Note: the two `info` routes (GET `info`/`info-by-name` and POST/PUT `info`) are intentionally kept as-is (#218).

**`DataAccessController` — `/api/data-access`**
| Verb | Route | Scope | Request |
| --- | --- | --- | --- |
| POST | `security/change` | `configure-security` | `ConfigureSchemaSecurityRequest` |
| POST | `policy/create` | `create-data-access-policy` | `CreateDataAccessPolicyRequest` |
| POST | `policy/update` | `update-data-access-policy` | `UpdateDataAccessPolicyRequest` |
| DELETE | `policy/delete` | `delete-data-access-policy` | `itemId` |
| GET | `policy/get` | `get-data-access-policy` | `schemaName` |

**`DataValidationController` — `/api/data-validations`** — GET (list; `get-by-id`; `by-schema-id`; `by-schema-and-field`), POST (create), PUT (update), DELETE (by id). Scopes `get-data-validations`, `get-data-validation-by-id`, `get-validations-by-schema-id`, `get-validation-by-schema-and-field`, `create-data-validation`, `update-data-validation`, `delete-data-validation`.

**`ConfigurationController` — `/api/configurations`** — GET (`get-configuration`), POST (`create-data-source`, `CreateDataGatewayConfigurationRequest`), PUT (`update-data-source`, `UpdateDataGatewayConfigurationRequest`). *(DTOs renamed `DataServiceConfiguration…`→`DataGatewayConfiguration…` per #216.)*

**`SchemaConfigurationController` — `/api/schema-configurations`** — POST `reload` (`reload-data-gateway-server`) → `ServiceResponse<bool>`. Evicts the cached per-tenant GraphQL executor and marks all unadapted change logs as adapted. **This is the "Publish" action** (§8), not a deploy/build (#213/#214/#224).

**`MockDataController` — `/api/mock-data`** — GET (`get-mock-data`), DELETE (`delete-mock-data`, body `DeleteMockDataRequest`). **Decided (#218):** change `[HttpDelete]`→`[HttpPost("delete")]` (update frontend). **Gap:** still `[HttpDelete]`.

**`RegexAssistantController` — `/api/regex`** — POST `generateregex` (`generate-regex`, `RegexAssistantRequest`). **Decided (#218):** rename route `generateregex`→`generate-regex` (update frontend). **Gap:** route still `generateregex`.

**`SchemaExchangeController` — `/api/schema-exchange`** — POST `export` (`export-schemas`, `ExportSchemaRequest`), POST `import` (`import-schemas`, `ImportSchemaRequest`). Both return immediately; work runs async in the Worker, result delivered via notification.

### 3.4 Unstructured-data (Storage) endpoints

**`FilesController` — `/api/[controller]/[action]`** (i.e. `/api/Files/{Action}`). Actions: `GetFile`, `GetFiles`, `GetFilesInfo`, `GetPreSignedUrlForUpload`, `DeleteFile`, `UploadFileToLocalStorage`, `DownloadFile`, `updateFileAdditionalInfo`, `GetDmsFileAndFolder`, `UploadFile`, `CreateFolder`, `DeleteFolder`. Scopes `get-file`, `get-files`, `get-files-info`, `get-pre-signed-url-for-upload`, `delete-file`, `upload-file-to-local-storage`, `download-file`, `update-file-additional-info`, `get-dms-file-and-folder`, `upload-file`, `create-folder`, `delete-folder`.
- **Decided (#218):** Storage adopts the same kebab-case resource style as DataGateway, but keeps the old `[controller]/[action]` routes marked `[Obsolete]`, to be removed after 30–40 days. **Gap:** still only `[controller]/[action]`.
- **Decided (#219):** rename action `updateFileAdditionalInfo`→`UpdateFileAdditionalInfo`. **Gap:** still lowercase.

**`CertificateController` (`Storage/Certificate.cs`) — `/api/[controller]/[action]`** — POST `UploadCertificate` (`UploadCertificateRequest`).
- **Security decision (#215):** this endpoint is **not** intentionally anonymous — add `[ProtectedEndPoint("blocks-data::storage::upload-certificate")]`. **Gap:** the action currently has no `[ProtectedEndPoint]` and is effectively anonymous (it is the one endpoint outside the 45 protected scopes). This is tracked as a security fix.

### 3.5 Runtime GraphQL gateway

Not an MVC controller. Mapped in `Program.cs` as terminal middleware:
`app.MapDataGatewayGraphQL("/api/gateway")`. A single path serves all tenants and all schemas; the per-request tenant selects the GraphQL schema/executor (see §4/§5). The generated schema exposes, per Entity: typed queries (filter/sort/pagination) and `insert` / `update` / `delete` plus bulk mutations, built dynamically from schema definitions (`GraphqlSchemaBuilder`, `GraphTypes/`, `SchemaResolver`).

> **GraphQL-only:** the previously parallel REST data gateway (`GatewayController`, `RestAccessControlService`, `GatewayQueryService`/`GatewayMutationService`, `/gateway/{schema}/records`) has been **removed**. Blocks Data exposes exactly one runtime data interface — GraphQL (#190/#191, and the D1/C2 ambiguity is resolved). Any remaining REST-gateway-related dead code should be deleted (#190).

---

## 4. Data Model

Persisted entities extend `GraphQlBaseEntity : BaseEntity` (adds `IsDeleted`, `DeletedDate` for soft delete; `BaseEntity` from Genesis carries id/tenant/audit fields). Stored in MongoDB.

**Platform-metadata collections (per tenant):**
- **`SchemaDefinition`** — the unit an app developer creates. `SchemaName`, `SchemaType` (`Entity`=stored collection, `Dto`=reusable embedded shape), `CollectionName`, `Fields: List<FieldDefinition>`, `ProjectKey`/`ProjectShortKey`, and four independent access levels: `ReadAccessLevel`, `WriteAccessLevel`, `EditAccessLevel`, `DeleteAccessLevel` (each `SchemaAccessLevel` = `Inherited`|`User`|`Public`|`Custom`, default `User`).
- **`FieldDefinition`** — a field on a schema (name, `ScalarType` String/Int/Long/Float/Boolean/DateTime/ID, `isArray`, DTO reference for nesting, PII/unique flags, per-field access).
- **`DataAccessPolicy`** — declarative RLS/CLS policy. `PolicyType` (`RLS`|`CLS`), `Operation` (`READ`/`WRITE`/`EDIT`/`DELETE`/`ALL`), `SchemaName`/`SchemaId`, `FieldNames[]` (supports nested paths like `ContactInfo.Email`), `RuleGroup` (nested AND/OR `PolicyRuleGroup`→`PolicyRule`), `Priority`, `IsAllowPolicy` (allow vs deny). A rule's operands come from `ConditionSource` = `AUTH` (token claims: UserId, Email, Roles, Permissions, TenantId, custom), `SCHEMA_FIELD`, or `STATIC_VALUE`; operators cover EQUAL/IN/CONTAIN/REGEX/IS_NULL etc.
- **`DataValidation`** — per-field input rules (`ValidationType`: NotEmpty, Regex, Min/MaxLength, LengthRange, Equal/NotEqual, GreaterThan/LessThan(OrEqual), Range) with messages and active toggles.
- **`SchemaChangeLog`** — records unadapted (unpublished) schema/access/policy/validation changes (`SchemaChangeType`), driving the "unpublished changes" badge and cleared by `reload`.
- **`DataServiceConfiguration`** — the tenant's data-source connection (connection string + database name + collection-name pattern `sb_{SchemaName}s`). *(Rename to `DataGatewayConfiguration` per #216.)*
- **`SchemaExportRecord`**, **`DataGatewayInstance`**, **`DataMutationRecord`**, **`CloudBuildSecret`**, **`BlocksGuid`** — supporting records (export jobs, gateway instance bookkeeping, mutation audit, secrets, id helper).

**Tenant record collections:** each `Entity` schema maps to a MongoDB collection named `sb_{SchemaName}s`, holding the app's actual records; served exclusively via the GraphQL gateway.

**Per-tenant isolation:** every metadata record and every data collection is scoped to a tenant (resolved from token / `x-blocks-key`). One service process serves all tenants; a distinct GraphQL schema/executor is built per tenant so identically named schemas stay fully isolated.

**Terminology (decided, #224/#216):** use **Entity** for a stored collection of records (never "Table"); **Object** for the reusable shape (the `Dto` schema type). Operation labels are **Create / Read / Update / Delete** in the UI (frontend-only rename; backend enums keep `Write`/`Edit`, see §10).

---

## 5. Authentication & Authorization

**Identity** comes from **blocks-iam** via OIDC. The console (client) authenticates through blocks-iam (OIDC client id `BLOCKS_DATA_CLIENT_ID`, callback wiring in `Program.cs` runtime settings). API calls carry a bearer token; the token principal exposes claims UserId, Email, Roles, Permissions, TenantId.

**Tenancy** is multi-tenant via the `X-Blocks-Key` tenant key. `TenantContext`/`RequestContextAccessor` resolve the tenant per request: **access token first (when authenticated), else the `x-blocks-key` header**. If neither yields a tenant, the gateway returns 400.

**Console authorization** — management endpoints are gated by `[ProtectedEndPoint("blocks-data::<scope>")]` (Genesis enforces the permission from the caller's token). 45 scopes today; target grammar is 3-segment (§3.1).

**Runtime GraphQL authorization** — in `DataGatewayGraphQLEndpointExtensions.HandleDataGatewayRequestAsync`:
1. If a `blocksKey` is present, `DataGatewayTokenAuthenticator` attempts to build a principal from the request token; success marks the request authenticated.
2. **Introspection requires authentication** — an unauthenticated introspection query is rejected 401 ("you are not authorized to introspect the schema"). This is a deliberate stance: do not leak the data model to anonymous callers.
3. The tenant is resolved and pinned; the per-tenant pipeline/executor handles the request.
4. **Data-level enforcement:** for each operation, per-operation access middleware (`Read/Write/Edit/DeleteSchemaAccessMiddleware`) checks the schema's access level (`Public` = anyone; `User` = authenticated tenant user; `Custom` = evaluate policies). For `Custom`, the policy engine computes an RLS MongoDB filter (which rows) and applies CLS masking/projection (which fields), evaluated against the caller's token claims (`Helpers/` — policy rule evaluator, where→Mongo filter converter, CLS row masking, projection).

**Access-level model (decided, #212):** both **simple access levels** (Public / Logged-in User) and **Custom policies** are customer-facing peers (Custom is advanced in capability but not hidden behind an "advanced" gate). Start with Public or Logged-in User; reach for Custom for per-operation or conditional/attribute-based rules (e.g. only the data owner may edit; column-level rule such as requester email matching to view Salary). `Public` = anyone CRUD; `Logged-in User` = authenticated tenant users CRUD; `Custom` = per-operation allow/deny policies.

---

## 6. Integrations & Dependencies

**Other Blocks services:**
- **blocks-iam** — identity provider (OIDC); issues tokens and the `blocks-data::*` permissions that gate every endpoint.
- **blocks-os** — the console shell, projects, and environments/tenants that every schema and data source is scoped to. Blocks Data runs inside a blocks-os project; `Program.cs` wires callback/base URLs for the full service mesh (os, iam, localization, monitor, logic, agents, utilities, studio, release).
- **blocks-localization / blocks-monitor** — peers; no deep coupling in this repo (Blocks Data emits LMT logs/traces consumed by the platform's observability surface).

**External:**
- **MongoDB** — primary data store (platform metadata + tenant collections; also bring-your-own connection strings per tenant via data-source configuration).
- **Object storage** — via `Storage.Driver` (uploads, pre-signed URLs, DMS).
- **OpenAI Chat Completions** (`AiCompletionUrl` in appsettings) — powers the regex assistant (plain-English → regex). Uses an encrypted ChatGPT secret/key from configuration.
- **Kubernetes/AKS** — the runtime uses `KubernetesClient` (in-cluster config) for the data-gateway pod environment.

**Notable NuGet:** HotChocolate.AspNetCore/Types, MongoDB.Driver, SeliseBlocks.Genesis, SeliseBlocks.ConfigurationDriver, FluentValidation(.AspNetCore), KubernetesClient/k8s, YamlDotNet, Swashbuckle.AspNetCore.
**Notable npm:** @seliseblocks/blocks-kit, graphiql/monaco-graphql/graphql-ws, @tanstack/react-query & react-table, @microsoft/signalr, react-router-dom, zustand, react-hook-form + zod, Radix UI, tailwindcss.

---

## 7. Messaging / Eventing

Blocks Data uses the Genesis message bus (`IMessageClient`) for asynchronous work. The **Worker** project hosts consumers (registered in `Worker/Program.cs`):
- `SchemaExportEventConsumer` (`SchemaExportEvent`) — async export of a project's schema definitions / access policies / validation rules to a file (`SchemaExchangeController.Export` publishes it).
- `SchemaImportEventConsumer` (`SchemaImportEvent`) — async import of an exported file into a target project.
- `CreateDefaultFolderEventConsumer` (`CreateDefaultFolderEvent`) — default-folder creation for Storage.
- `MigrationCompletionEventConsumer` (`MigrationCompletionEvent`) — migration completion handling.

Results of async jobs are surfaced to the user via notifications (SignalR on the client). The API side also publishes **data-change events** (`DataChangeEventPublisher` / `IDataChangeEventPublisher`) to the bus on record insert/update/delete, so downstream workflow triggers can react to gateway data mutations.

The Worker additionally runs a `PeriodicPingBackgroundService` (health/readiness pinging).

---

## 8. Configuration & Environments

- **Config sources:** `appsettings.json` / `appsettings.dev.json` / `appsettings.Development.json`; MongoDB-backed secrets via `SeliseBlocks.ConfigurationDriver` (`Secrets` collection, key `blocks-secret-data`); Genesis vault (type resolved at startup) for the database connection string, root database name, and message-bus connection string.
- **Frontend runtime injection:** the API rewrites `__BLOCKS_*__` placeholder tokens in the built SPA assets at startup from the `FrontendRuntime` config section (base URLs, callback URLs, OIDC client ids for every Blocks service, Google site key, etc.), so one build runs in any environment.
- **Notable settings:** `DatagatewayClusterNames` (`aks-blocks-prod`), `DatagatewayClusterRevision`, `AiCompletionUrl` (OpenAI), `ChatGptTemperature`, `ChatGptEncryptedSecret`/`ChatGptEncryptionKey`, Swagger options, form upload limit 15 MB.
- **Environments/CI:** three GitHub Actions pipelines — `ci-dev.yml`, `ci-stg.yml`, `ci_prod.yml` — targeting dev/staging/prod AKS. Local dev via `run.sh` / `run.ps1` (`LOCAL_GUIDE.md`).
- **Publish (not deploy):** after editing an Entity's fields/validation/access, changes are tracked as unadapted change logs; the user clicks **Publish** which calls `POST /api/schema-configurations/reload` to evict the cached GraphQL executor and re-apply the schema. **All auto build/release/deploy is removed** — publishing is manual for every change, breaking or not (#213/#214/#224). The term "deploy/build/release" is deprecated for this action; it applies schema changes and refreshes the gateway, it is not a pod deployment.
  - **Naming note:** the enum `PipelineTypes.BuildPipeline` / `PipelineEventTypes` remnants and pipeline vocabulary in the domain reflect the old deploy model and should be treated as legacy (§10).

---

## 9. Testing & Quality

- **Backend:** xUnit (`XUnitTest`) with **Moq**, **FluentAssertions**, `coverlet.collector`, `JUnitLogger`, `Microsoft.NET.Test.Sdk`. Existing suites focus on the GraphQL/RLS/CLS core: policy rule evaluation, CLS row masking, projection, where→Mongo filter and order→Mongo sort conversion, mutation input/filter helpers, validators, data-validation helpers, resolver context, plus Storage and Worker (`PeriodicPingBackgroundService`) tests.
- **Frontend:** Vitest + @testing-library/react + jsdom + msw + `@vitest/coverage-v8`.
- **Coverage decision (#191):** re-measure and **top up GraphQL backend coverage to ~85% meaningful units**; do **not** restore deleted (REST-gateway) tests unless they are GraphQL-specific. The suite must be re-verified green after the GraphQL-only refactor, deleting any remaining REST-gateway dead code (#190).
- **CI / coverage gate:** in `ci-dev.yml`, `RUN_TESTS` defaults to `false` (disabled in dev for speed) and SonarQube/dotnet-coverage integration is present but gated by flags. **There is no enforced coverage gate on the dev pipeline today** — the ~85% target is a decision to be operationalized, not a currently enforced check.

---

## 10. Known Technical Debt & Decisions

| Item | Current state | Decided resolution | Ticket |
| --- | --- | --- | --- |
| Operation labels Read/Write/Edit/Delete | Backend enums keep `Write`/`Edit`; client already shows Create/Edit/Delete + CREATE/UPDATE constants | Rename to **Create/Read/Update/Delete** in the **frontend only**; no backend change, no data migration | #224 |
| "Table" terminology | — | Use **Entity** for stored collections; **Object** for the reusable shape | #224 |
| Product name sprawl (UDS / Data service) | Client still uses `UDS` API base, `dev-uds`, README mentions | Brand as **Blocks Data**; keep Data Gateway/DataGateway for the structured domain; remove "UDS"; rename `DataServiceConfiguration*`→`DataGatewayConfiguration*`; two domains = Data Gateway (structured) + Storage (unstructured) | #216 |
| Permission scope grammar | 2-segment `blocks-data::<action>` (all 45) | 3-segment `blocks-data::<controller_route_name>::<action>` | #217 |
| Return-type / envelope | Storage `FilesController` returns `BaseResponse`/`DmsResponse`/typed values | All actions return `IActionResult`; replace with `ServiceResponse<T>`; update frontend | #218 |
| `MockDataController` delete verb | `[HttpDelete]` | `[HttpPost("delete")]` (+ frontend) | #218 |
| `regex/generateregex` route | `generateregex` | `generate-regex` (+ frontend) | #218 |
| Storage routes style | `[controller]/[action]` only | Add kebab-case routes; keep old marked `[Obsolete]`, remove after 30–40 days | #218 |
| Anonymous certificate upload | `CertificateController.UploadCertificate` has no `[ProtectedEndPoint]` | Add `[ProtectedEndPoint("blocks-data::storage::upload-certificate")]` — **not** intentionally anonymous (security fix) | #215 |
| Async suffix consistency | Mixed | Add `Async` to service-level async `Task` methods; **not** to controller actions | #220 |
| DTO organization | `*Input` DTOs scattered | Move GraphQL `*Input` DTOs to `GraphModels`; controller request DTOs get `Request` suffix; shared DTOs no verb/suffix | #220 |
| Unused `TokenRepository`/`ITokenRepository` | Present under `Services/` | Remove | #220 |
| Identifier typos | `DataGatewayDriverServiceExtention`, `updateFileAdditionalInfo`, `'registery'`, file `Certificate.cs` | Fix to `…Extension`, `UpdateFileAdditionalInfo`, `registry`; rename file → `CertificateController.cs` | #219 |
| `enviroment` misspelling | Present | Fix to `environment` everywhere incl. all references | #222 |
| Client file casing | 8 files non-kebab | Rename all 8 to kebab-case | #221 |
| Legacy REST data gateway | Removed | GraphQL-only; delete any remaining REST-gateway dead code | #190/#191 |
| Legacy deploy/build/release model | `PipelineTypes.BuildPipeline`, pipeline vocabulary linger | Fully removed; keep only `/schema-configurations/reload` as the manual **Publish** (applies schema, refreshes gateway — not a deployment) | #213/#214/#224 |

---

## 11. Non-Functional Requirements

**Security**
- Every management endpoint is permission-gated (`[ProtectedEndPoint]`); the single unprotected endpoint (certificate upload) is a tracked security fix (#215).
- Runtime GraphQL blocks schema introspection for unauthenticated callers (don't leak the data model).
- Fine-grained data governance: RLS (row filtering) + CLS (field masking, incl. nested paths) + allow/deny policies with priority, driven by IAM token claims; fields can be flagged PII. This is a supporting compliance capability of the platform.
- Secrets resolved via Genesis vault / Mongo-backed secret store; AI keys stored encrypted.

**Multi-tenancy**
- One deployment serves all tenants; tenant resolved per request (token → `x-blocks-key`), and a distinct per-tenant GraphQL schema/executor guarantees isolation of identically named schemas and their data. All metadata and data collections are tenant-scoped. Bring-your-own MongoDB is supported per tenant.

**Performance**
- Per-tenant GraphQL executors are cached and only evicted on explicit Publish/reload, avoiding per-request schema rebuilds.
- GraphQL queries support typed filter/sort/pagination; RLS is pushed down to MongoDB filters (not post-filtered in memory) and CLS uses projection where possible.
- Upload body limit 15 MB; large file transfer via pre-signed URLs (Storage).

---

## Open Questions

The product decisions resolved the major structural questions (GraphQL-only, naming, access model, publish model, storage bundling). Remaining items are refinements rather than blockers:

- **Open / undecided:** the exact 3-segment `controller_route_name` token for each scope (e.g. `schemas`, `data-access`, `data-validations`, `configurations`, `schema-configurations`, `mock-data`, `regex`, `schema-exchange`, `files`/`storage`) is a naming choice to finalize when applying #217.
- **Open / undecided:** operational messaging for the manual Publish step — how the wait (if any) and the "unpublished changes" badge should be worded for less-technical users (the concept is retained per #213/#224, but the copy is not fixed).
