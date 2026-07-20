# Blocks Data — Features Specification

> One-line note: derived from the Business/Product/Technical/Architecture specs + the code on `inception` + the authoritative product decisions (`DECISIONS-blocks-data.md`, tickets #190–#224). Status reflects the ACTUAL code as verified against the implementation (controllers, services, entities, enums, client constants/components) on 2026-07-20.

## How to Read

Status legend: **✅ Shipped** (implemented, matches intended behaviour) · **🟡 Partial** (implemented but with a gap vs the decision/intent) · **🔴 Defect** (implemented but broken/incorrect) · **🗺️ Roadmap** (decided, not yet built) · **❓ Undecided** (no decision yet). Every status is grounded in code.

**Product name:** **Blocks Data** (decision #216) — the customer-facing brand; `blocks-data` is the code/key identifier. It has two domains: **Data Gateway** (structured data, GraphQL over MongoDB) and **Storage** (unstructured files/DMS). "Unified Data Service (UDS)" is retired but still leaks in client constants (`API_BASES.UDS`, `endpoint.constant.ts:69`) — see Cross-Cutting.

---

## 1. Feature Inventory

### Area A — Data source & configuration

#### A1. Data source configuration — ✅ Shipped
- **What it does:** points a tenant at a Blocks-managed MongoDB or a bring-your-own connection string + database name; collection naming pattern `sb_{SchemaName}s`.
- **Current status:** `ConfigurationController` (`/api/configurations`, GET/POST/PUT) → `IDataGatewayConfigurationService`; persisted as `DataServiceConfiguration` entity. Request DTOs already renamed `CreateDataGatewayConfigurationRequest` / `UpdateDataGatewayConfigurationRequest`. Client `configure-data-source` flow present.
- **Limitations:** rename to `DataGatewayConfiguration*` is only half-applied (#216): the **entity** `Entities/DataServiceConfiguration.cs` and the **response** `DataServiceConfigurationResponse` (still referenced in `ConfigurationController` `ProducesResponseType`) keep the old name. Scopes `get-configuration` / `create-data-source` / `update-data-source` are 2-segment (#217). No bring-your-own connection-string validation/health-check visible before persistence.
- **Suggested changes:** finish the #216 rename (entity + response + `MigrationCompletionEventConsumer` reference); add a connection test on create/update before marking the source active; migrate the three scopes to 3-segment.

### Area B — Schema modeling (Data Gateway)

#### B1. Visual schema builder (Entities & Objects) — ✅ Shipped
- **What it does:** define Entities (stored collections) and Objects (reusable nested shapes) with typed fields; `SchemaController` (`/api/schemas`: define/info/fields, GET list/aggregation/by-id/info/info-by-name, PUT, DELETE); client `schema-structure/`.
- **Current status:** working. `SchemaType` enum = `{ Entity=1, Dto=2 }`; `SchemaDefinition` carries `Fields: List<FieldDefinition>` and four access levels (`Read/Write/Edit/DeleteAccessLevel`, default `User`).
- **Limitations:** the "Object" concept is still coded as `Dto` (`SchemaType.Dto`, `ServiceEnums.cs:6`) vs the decided customer term "Object" (#224) — naming gap only, no functional impact. Terminology "Table" must never appear (#224) — verify UI copy. Two intentional `info`/`info-by-name` route pairs are kept as-is by decision (#218). Schema/policy reads page at 1000 rows (repository cap).
- **Suggested changes:** rename `Dto`→`Object` across enum + DTOs + client labels (#224) as a coordinated frontend+backend cosmetic pass (no data migration); add an editorconfig/analyzer rule banning "Table" in UI strings (#223).

#### B2. Typed fields, arrays & nesting — ✅ Shipped
- **What it does:** fields carry `ScalarType` (String/Int/Long/Float/Boolean/DateTime/ID), `isArray`, PII/unique flags, an Object (Dto) reference for nesting, and per-field access.
- **Current status:** `FieldDefinition` + `ScalarType` enum verified; the generated GraphQL types/filters reflect field types and `isArray`.
- **Limitations:** scalar set is fixed (7 types) — no Decimal/Guid/enum/JSON blob type; nested references rely on the `Dto` schema type. No per-field default-value or computed-field concept.
- **Suggested changes:** consider a Decimal type for money and a native enum field type; document the supported scalar matrix in the schema-builder UI.

#### B3. Field validation — ✅ Shipped
- **What it does:** per-field input rules with custom messages and active toggles; `DataValidationController` (`/api/data-validations`: GET list/by-id/by-schema-id/by-schema-and-field, POST/PUT/DELETE).
- **Current status:** `ValidationType` enum covers NotEmpty, Regex, Min/MaxLength, LengthRange, Equal/NotEqual, GreaterThan/LessThan(OrEqual), Range. Enforced on mutations.
- **Limitations:** all 8 validation scopes are 2-segment (#217). No cross-field validation beyond the comparison operators; no async/uniqueness validation surfaced here (unique is a field flag, enforced elsewhere).
- **Suggested changes:** migrate scopes to 3-segment; expose validation-failure error shape in the GraphQL error contract explicitly.

#### B4. AI regex assistant — 🟡 Partial
- **What it does:** generate a regex from a plain-English description when authoring a Regex validation; `RegexAssistantController` → `IRegexAssistantService` → configurable AI completion endpoint (ChatGPT, encrypted key).
- **Current status:** functional (`POST /api/regex/generateregex`, scope `blocks-data::generate-regex`).
- **Limitations:** the **route is still `generateregex`**, not the decided `generate-regex` (#218) — a wire-contract gap the frontend also hardcodes. Depends on an external AI endpoint (`AiCompletionUrl`) with no visible fallback/offline path; failures return via `GetLastErrorMessage()`.
- **Suggested changes:** rename route `generateregex`→`generate-regex` and update the client together (#218); add a graceful degradation message when the AI endpoint is unreachable.

### Area C — Access & security (governance)

#### C1. Access levels (per operation) — ✅ Shipped
- **What it does:** Public / Logged-in User / Custom / Inherited, set independently per Create/Read/Update/Delete, at schema and field level; `DataAccessController` `security/change`, per-operation middleware at runtime.
- **Current status:** `SchemaAccessLevel { Inherited=0, User=1, Public=2, Custom=3 }`, default `User` (private-by-default). Client `PERMISSION_ACTIONS` shows View/Create/Edit/Delete and `ACCESS_TYPES` = logged-in/public/custom/inherited — matches the decided frontend-only CRUD relabel (#224).
- **Limitations:** backend enums deliberately keep `Write`/`Edit` (`PolicyOperation { READ, WRITE, EDIT, DELETE, ALL }`) — intended per #224 (frontend-only rename, no migration), so client↔backend operation names diverge and require the `crud→POLICY_OPERATION` mapping in `schema-access-control.ts`. The safe **default posture** (private/per-user vs open) is a live product question (B5) — code default is `User`.
- **Suggested changes:** keep the mapping table as the single translation point and unit-test it; ratify and document the default posture (B5) in UI copy.

#### C2. Custom policies — Row-Level Security (RLS) — ✅ Shipped
- **What it does:** restrict *which records* a caller sees via declarative policies over token claims + record fields; RLS compiles to a MongoDB filter pushed down to the query.
- **Current status:** `DataAccessController` policy create/update/delete/get; `DataAccessPolicy` with `PolicyType.RLS`, evaluated by the `Helpers/` policy engine.
- **Limitations:** only evaluated when the operation's access level is `Custom`; no policy simulation/"explain" tool to preview the effective filter for a given token. Policy list capped by repository paging.
- **Suggested changes:** add a "test this policy as user X" preview in the console; migrate `data-access` scopes to 3-segment (#217).

#### C3. Custom policies — Column-Level Security (CLS) — ✅ Shipped
- **What it does:** restrict/mask *which fields* are returned or writable, including nested paths (e.g. `ContactInfo.Email`); CLS computes excluded/masked field paths and uses projection where possible.
- **Current status:** `PolicyType.CLS`, `FieldNames[]` supporting nested paths; CLS masking/projection in `Helpers/`.
- **Limitations:** masking is omit/exclude-style, not value-redaction (no partial masking like `***@domain`); nested-path masking correctness depends on projection support for the shape. PII flag exists on fields but is a marker, not an automatic mask.
- **Suggested changes:** offer redaction/format-preserving masking as an option; auto-suggest CLS on PII-flagged fields.

#### C4. Policy engine (allow/deny, rule groups) — ✅ Shipped
- **What it does:** allow/deny policies with `Priority`, nested AND/OR `PolicyRuleGroup`→`PolicyRule`; operands from `ConditionSource` = AUTH (UserId/Email/Roles/Permissions/TenantId/custom), SCHEMA_FIELD, STATIC_VALUE; 15 operators (EQUAL…REGEX, IS_NULL etc.).
- **Current status:** enums + evaluator verified (`ServiceEnums.cs`, `Helpers/`); client `rule-set-form`.
- **Limitations:** no visible conflict detection when allow and deny policies overlap at the same priority; operator behaviour (e.g. REGEX, IN over arrays) is only as safe as the evaluator — depends on test coverage (#191).
- **Suggested changes:** add priority/allow-deny conflict warnings in the UI; ensure the policy evaluator and where→Mongo converter are in the ~85% covered core (#191).

### Area D — Runtime GraphQL gateway

#### D1. Dynamic GraphQL data gateway — ✅ Shipped
- **What it does:** per-tenant GraphQL schema generated at request time (HotChocolate) exposing, per Entity, typed queries (filter/sort/pagination) and insert/update/delete + bulk mutations; mapped at `/api/gateway`.
- **Current status:** `GraphqlSchemaBuilder`, `SchemaResolver`, `DataGatewayGraphQLEndpointExtensions` verified; the single official runtime interface.
- **Limitations:** HotChocolate binds an endpoint to a fixed schema name, so multi-tenancy needs the custom dispatcher (D2) — added machinery to maintain. No GraphQL subscriptions (queries/mutations only). Malformed schemas are caught/logged and skipped rather than surfaced to the author at build time.
- **Suggested changes:** surface schema-build errors back to the console (not just logs) so a bad edit is diagnosable; document the generated query/mutation/filter grammar for app developers.

#### D2. Multi-tenant single deployment & tenant resolution — ✅ Shipped
- **What it does:** one process serves all tenants; tenant resolved per request (bearer token first, else `x-blocks-key` header), pinned in `TenantContext`; a per-tenant HotChocolate pipeline is built and cached, evicted only on Publish.
- **Current status:** `DataGatewayPipelineDispatcher` with version-stamped schema names (`tenantId__vN`); 400 returned when no tenant resolvable (`DataGatewayGraphQLEndpointExtensions:60`).
- **Limitations:** in-process cached executors mean memory grows with active-tenant count; no per-tenant executor eviction on idle. Bring-your-own MongoDB per tenant increases connection footprint.
- **Suggested changes:** add an LRU/idle-eviction policy for cached tenant pipelines; expose a metric for cached-executor count.

#### D3. Runtime authorization & introspection guard — ✅ Shipped
- **What it does:** validates the bearer JWT against the tenant's cached public certificate (`DataGatewayTokenAuthenticator`); refuses schema introspection for unauthenticated callers (401 "you are not authorized to introspect the schema"); enforces per-operation access level + RLS/CLS.
- **Current status:** introspection guard and tenant-resolve fallback verified in `DataGatewayGraphQLEndpointExtensions` (lines 30–60).
- **Limitations:** security-critical token validation lives in service code (framework treats `/api/gateway` as anonymous), so it must be kept correct by tests (ADR-4). Certificate is cached under `tetocertpublic::{tenantId}` — staleness window on cert rotation.
- **Suggested changes:** add explicit unit/integration tests for the introspection-guard and token-validation paths; document cert-cache TTL/rotation behaviour.

#### D4. Data-change events — ✅ Shipped
- **What it does:** record insert/update/delete publish `DataChangeEvent` to the message bus so downstream workflow automation can react.
- **Current status:** `DataChangeEventPublisher` / `IDataChangeEventPublisher` verified.
- **Limitations:** at-least-once/ordering guarantees depend on the Genesis bus; no visible outbox pattern, so a mutation that succeeds in Mongo but fails to publish could drop an event.
- **Suggested changes:** consider a transactional-outbox for change events if downstream consumers require exactly-once/ordered delivery.

### Area E — Publish & operations

#### E1. Publish (manual schema apply) — ✅ Shipped
- **What it does:** user clicks Publish to apply schema/field/validation/access changes to the live gateway; `SchemaConfigurationController POST /schema-configurations/reload` evicts the cached executor and marks change logs adapted. **Not** a deploy/build.
- **Current status:** verified; client `schema-side-bar.tsx` calls `useSchemasReload()`, button labelled **"Publish"**, toast "Schemas published successfully".
- **Limitations:** the reload doc-comment still says "clear deployment badges" (legacy vocabulary). The final customer-facing label ("Publish" vs "Go live" vs "Apply changes") is not ratified (#224, A5/B1). Reload is tenant-wide (all unadapted changes go live together) — no partial/selective publish.
- **Suggested changes:** finalize the Publish wording (#224) and scrub residual "deploy/deployment" copy; consider a diff preview of what Publish will apply.

#### E2. Unpublished-changes badge — ✅ Shipped
- **What it does:** signals schema changes not yet published; backed by unadapted change logs; `GET /schemas/unadapted-change-logs`.
- **Current status:** `SchemaChangeLog` (`DoesServerAdaptChanges=false`), `SchemaChangeType` (11 change kinds) verified; cleared by reload.
- **Limitations:** badge is a boolean-ish signal; it does not itemize *which* entities/fields changed for the user. Wording for non-technical users not fixed (B1).
- **Suggested changes:** show a per-entity list of pending changes behind the badge.

#### E3. Mock data management — 🟡 Partial
- **What it does:** view counts of and delete seeded/test documents per collection; `MockDataController` (`/api/mock-data`).
- **Current status:** GET (`get-mock-data`) and DELETE (`delete-mock-data`, body `DeleteMockDataRequest`) verified; client "clean test data" modal present.
- **Limitations:** delete is still `[HttpDelete]` with a request body; the decision (#218) is `[HttpPost("delete")]` (a body on DELETE is non-idiomatic and some proxies strip it) — not yet applied. Scopes 2-segment (#217).
- **Suggested changes:** change to `[HttpPost("delete")]` and update the client (#218); migrate scopes.

### Area F — Developer console tooling

#### F1. GraphQL Playground — ✅ Shipped
- **What it does:** in-console Monaco/GraphiQL editor running live queries/mutations against the tenant gateway, with starter templates and a schemas drawer.
- **Current status:** `components/graphql-playground/` verified (page, schemas-drawer, clean-test-data-modal, tests present).
- **Limitations:** developer-facing only; no simpler spreadsheet-style editor for non-technical users (open question B2). Requires authentication (introspection guard) to load the schema.
- **Suggested changes:** decide B2 (is a low-code record editor needed); persist last-run queries per user.

#### F2. In-app records browser — ✅ Shipped
- **What it does:** table / list / JSON views of an Entity's records with filter, sort, projection, pagination, via GraphQL; `components/schema-data/` (table/list/json views + toolbar).
- **Current status:** three view components + tests verified.
- **Limitations:** reads go through the same RLS/CLS as any caller, so an admin browsing sees only what their token permits (by design, but can confuse). No inline record editing surfaced beyond what the views provide.
- **Suggested changes:** make the RLS/CLS filtering visible ("you are seeing a filtered view") in the browser to avoid confusion.

#### F3. Schema exchange (import/export) — ✅ Shipped
- **What it does:** async export/import of schema definitions, access policies, and validation rules between projects; delivered by notification (SignalR).
- **Current status:** `SchemaExchangeController` `POST export` / `POST import` return immediately with an ack; Worker consumers `SchemaExportEventConsumer` / `SchemaImportEventConsumer` verified; export options Schema | AccessPolicies | ValidationRules | All.
- **Limitations:** fire-and-forget with later notification — no on-screen progress/confirmation (open question B4); if the notification is missed the user has no in-app job-status view. Scopes 2-segment (#217).
- **Suggested changes:** add an export/import job-status list; decide B4 (progress vs notification); migrate scopes.

#### F4. Service logs — ✅ Shipped
- **What it does:** in-console Service Logs screen over the platform's LMT logging/tracing.
- **Current status:** client `service-logs/` module + `data-gateway/pages/logs` verified.
- **Limitations:** read-only surface dependent on the shared LMT tooling; scope/retention governed by the platform, not this repo.
- **Suggested changes:** none repo-local; ensure log correlation ids link gateway request → mutation → data-change event.

### Area G — Storage (unstructured domain)

#### G1. Object/file Storage (DMS) — 🟡 Partial
- **What it does:** upload (direct + pre-signed URL), download, folders, DMS tree listing, metadata update, delete, over Azure Blob; `FilesController` (`/api/Files/{Action}`), `Storage.DomainService`/`Storage.Driver`; client `storage/` module (configuration, detail, upload/folder modals).
- **Current status:** all 12 actions present and permission-gated (12 scopes). Functional.
- **Limitations (all decided-but-unapplied):** (a) routes are still `[controller]/[action]` only — kebab-case resource routes with the old ones marked `[Obsolete]` are decided but not added (#218); (b) return types are still raw/`BaseResponse`/`DmsResponse` (`Storage.DomainService/Storage/DmsResponse.cs` still exists) instead of `ServiceResponse<T>` — four envelope shapes across the API (#218); (c) action `updateFileAdditionalInfo` is still lowercase (#219) and this identifier leaks into a public URL; (d) 12 scopes 2-segment (#217); form upload capped at 15 MB.
- **Suggested changes:** apply #218 to `FilesController` (kebab routes + `ServiceResponse<T>`, delete `DmsResponse`, keep old routes `[Obsolete]` 30–40 days) and #219 rename `updateFileAdditionalInfo`→`UpdateFileAdditionalInfo`; update the client for all of it; migrate scopes.

#### G2. Public certificate upload — 🔴 Defect (security)
- **What it does:** upload a public certificate used in platform/tenant certificate handling; `CertificateController.UploadCertificate`.
- **Current status:** **the action has NO `[ProtectedEndPoint]`** (verified in `Storage/Certificate.cs`) — it is effectively anonymous, the one endpoint outside the 45 protected scopes. It is also hidden from Swagger (`[ApiExplorerSettings(IgnoreApi=true)]`), which masks the exposure.
- **Limitations:** an unauthenticated caller can POST a certificate (#215). The file is still named `Certificate.cs` while the class is `CertificateController` (#219). Route is `[controller]/[action]`.
- **Suggested changes:** **(P1)** add `[ProtectedEndPoint("blocks-data::storage::upload-certificate")]` (#215); rename file `Certificate.cs`→`CertificateController.cs` (#219); align route with #218.

### Removed / legacy (documented so they are not reintroduced)

#### R1. REST data gateway — ✅ Shipped (removal complete)
- **Current status:** removed; no `GatewayController`/`RestAccessControlService`/`GatewayQueryService` remain (grep-confirmed clean). GraphQL is the sole runtime interface (#190/#191). Green-suite re-verification and any residual dead-code deletion remain to be confirmed (#190).

#### R2. Auto deploy / build / release — 🟡 Partial (removed as product concept, code residue)
- **Current status:** removed as a concept; Publish/reload is the only apply path (#213/#214/#224). **But residual pipeline scaffolding still exists in the tree:** `PipelinerunBuilders/DataGatewayPipelineBuilder.cs`, `PipelineParamHelper.cs`, `Models/PipelineRunModels.cs`, `Utilities/PipeLineTaskConstants.cs`, `Assets/pipeline_run_uds.yaml`, and the `PipelineTypes { DataGatewayPipeline, BuildPipeline }` / `PipelineEventTypes` enums (`ServiceEnums.cs`). `Worker/PeriodicPingBackgroundService` and client cloud-build/repository-integration also linger.
- **Suggested changes:** delete the pipeline builder code, `pipeline_run_uds.yaml`, and the pipeline enums; confirm no live path references them before removal.

---

## 2. Cross-Cutting Limitations

- **Permission-scope grammar (#217) — platform-convention gap.** All ~45 `[ProtectedEndPoint]` scopes are 2-segment `blocks-data::<action>` (verified across all controllers) vs the decided 3-segment `blocks-data::<controller-route>::<action>` used by IAM/OS/Localization. This is the single largest AuthZ divergence and affects every endpoint. The exact middle token per controller is still an open naming choice.
- **Return-type / envelope inconsistency (#218).** DataGateway controllers return `IActionResult` + `ServiceResponse<T>`; Storage `FilesController` still returns raw typed values / `BaseResponse` / `DmsResponse` (three+ envelope shapes coexist). Frontend must handle both until unified.
- **Certificate endpoint unauthenticated (#215).** One endpoint bypasses the otherwise-uniform `[ProtectedEndPoint]` gating and is hidden from Swagger — a real security hole, not intended anonymity.
- **Residual UDS/legacy naming (#216/#219/#222).** Client `API_BASES.UDS = "/api"` drives every data-gateway endpoint; `DataServiceConfiguration` entity/response un-renamed; `pipeline_run_uds.yaml` present; `enviroment` misspelling baked into the JSON wire contract (found in `client/app/models/people.ts`, `people-management.tsx`) (#222); `ITokenRepository`/`TokenRepository` under `Services/` are unused but present (#220).
- **CI / coverage gate (#190/#191).** No enforced coverage gate on the dev pipeline (`RUN_TESTS` defaults to `false`); the ~85% GraphQL-core target is a decision to operationalize, and green-suite re-verification after the GraphQL-only refactor is still open. No analyzer/editorconfig enforces the naming conventions (#223).
- **Multi-tenancy caveats.** Cached per-tenant HotChocolate executors have no idle eviction (memory scales with active tenants); token validation for the gateway lives in service code, not framework middleware (ADR-4), so it is only as safe as its tests.
- **Frontend file hygiene (#221).** 8 client files violate the repo's own kebab-case rule; slated for rename.

---

## 3. Suggested Changes — Prioritised

| Priority | Area/Feature | Suggested change | Why it matters | Rough effort | Ref |
| --- | --- | --- | --- | --- | --- |
| P1 | G2 Certificate upload | Add `[ProtectedEndPoint("blocks-data::storage::upload-certificate")]`; un-hide from Swagger review | Unauthenticated endpoint = active security hole | S | #215 |
| P1 | Cross-cutting / all endpoints | Migrate all ~45 scopes to 3-segment `blocks-data::<route>::<action>` | Breaks the platform-wide IAM/OS/Localization convention; cross-service consistency | M | #217 |
| P1 | Testing / R1 REST removal | Re-verify backend suite green after GraphQL-only refactor; delete any residual REST-gateway dead code | Correctness gate; prevents dead-code drift and regressions | M | #190 |
| P2 | G1 Storage `FilesController` | Add kebab-case routes (old `[Obsolete]` 30–40d), replace `BaseResponse`/`DmsResponse` with `ServiceResponse<T>`, update client | Unifies four envelope shapes + two routing styles into one contract | M | #218 |
| P2 | E3 Mock data | `[HttpDelete]` → `[HttpPost("delete")]` (+ client) | Body-on-DELETE is non-idiomatic and proxy-fragile | S | #218 |
| P2 | B4 Regex assistant | Route `generateregex` → `generate-regex` (+ client) | Wire-contract consistency; decided | S | #218 |
| P2 | Testing / policy core | Top up GraphQL/RLS/CLS backend coverage to ~85% meaningful units; wire a coverage gate | RLS/CLS correctness is security-load-bearing; no gate today | M | #191 |
| P2 | A1 Data source config | Finish `DataServiceConfiguration*` → `DataGatewayConfiguration*` (entity + response + consumer ref) | Half-done rename leaves mixed identifiers on a live path | S | #216 |
| P3 | R2 Legacy deploy code | Delete `PipelinerunBuilders/`, `pipeline_run_uds.yaml`, `PipelineTypes`/`PipelineEventTypes` enums, unused `ITokenRepository`/`TokenRepository` | Removes dead scaffolding contradicting the "no build/deploy" decision | M | #214/#220 |
| P3 | B1 Schema builder | Rename `Dto` → `Object` across enum/DTOs/client labels; ban "Table" in UI copy | Aligns code with the customer-facing vocabulary | M | #224/#223 |
| P3 | Cross-cutting naming | Fix `enviroment`→`environment` (wire contract), `updateFileAdditionalInfo`→`UpdateFileAdditionalInfo`, rename `Certificate.cs`, kebab-case 8 client files, `registery`→`registry` | Removes typos that leak into JSON/URLs; enables an analyzer gate | M | #222/#219/#221/#223 |
| P3 | E1 Publish UX | Finalize "Publish" wording, scrub "deploy/deployment" copy, show pending-change diff | Consistent, non-technical-friendly mental model | S | #224 |

---

**Feature count:** 22 catalogued features (incl. 2 removed/legacy entries) — **✅ Shipped: 15** · **🟡 Partial: 5** (A-none; B4 regex, E3 mock data, G1 storage, R2 legacy-deploy residue, plus the storage envelope) · **🔴 Defect: 1** (G2 certificate upload) · **🗺️ Roadmap / ❓ Undecided: 0** (all open items are decided-but-unapplied gaps, not un-built features). **P1 suggestions: 3.**

> Biggest gaps: (1) the certificate-upload endpoint ships with no authentication (#215) — a real security hole hidden from Swagger; (2) every one of ~45 permission scopes uses the wrong 2-segment grammar (#217), and Storage still carries mixed routes/response-envelopes plus lingering UDS/pipeline/`enviroment` naming debt across an otherwise solid, decision-aligned GraphQL-only core.
