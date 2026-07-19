# Blocks Data — Product Specification

> Scope: the `blocks-data` service of the SELISE Blocks platform. This document is the authoritative product specification. Where the current `inception` code disagrees with a ratified product decision, the **decision is the target state** and the gap is called out explicitly (look for **Gap:** notes). Grounded in the repository as of 2026-07-19.

---

## 1. Product Summary

**Blocks Data** is the data layer of the SELISE Blocks platform. It lets a team stand up a working, secured data API without writing backend code. From the console, an app developer connects a database, visually defines record types and their fields, layers on validation and access control, and Blocks Data generates and runs a live, per-tenant **GraphQL API** over that data. The same product also ships an object/file **Storage** capability.

Blocks Data is organized into **two domains**:

1. **Data Gateway** — the structured-data domain. Managed or bring-your-own **MongoDB**, visually defined schemas (Entities and Objects), field validation, row- and column-level access control, and a dynamically generated **GraphQL API** that serves create/read/update/delete operations per tenant. GraphQL is the single, official runtime interface.
2. **Storage** — the unstructured-data domain. File and folder management (upload, pre-signed URLs, download, DMS listing, metadata, delete).

Branding: the customer-facing product name is **Blocks Data**. `blocks-data` is the identifier used for keys and code. **Data Gateway** / `DataGateway` is retained as the name of the structured-data domain and its GraphQL runtime. The term **Unified Data Service (UDS)** is retired and replaced by "Blocks Data" everywhere.

Delivery shape: a **management API + console UI** (define data sources, schemas, validation, access), a **runtime GraphQL data gateway** (`/api/gateway`, per-tenant), a **Storage API**, and a **Worker** for async jobs (schema import/export, default-folder creation).

**Position in SELISE Blocks.** blocks-os defines *who and where* (Project / Environment / People); blocks-iam defines *who you are and what you may do* (OIDC identity, tokens, permissions); **Blocks Data defines and serves *the data itself*** — the schemas, the stored records, the files, and the API that customer apps call to read and write them. Every schema and data source is scoped to a Blocks Project/Environment, and every protected operation is gated by an IAM-issued permission. Blocks Data is used inside a Blocks Project, not standalone.

---

## 2. Personas & Jobs-to-be-Done

### App developer (primary persona)
The console is built for this person. Jobs:
- Connect a data source — a Blocks-managed MongoDB or a bring-your-own connection string. (`configure-data-source.tsx`, `ConfigurationController`)
- Design **Entities** (stored record types) and **Objects** (reusable nested shapes) with typed fields. (`add-edit-schema.tsx`, `schema-structure/`, `SchemaController`)
- Add **field validation** (required, length, range, regex, comparisons). (`schema-fields-validation/`, `DataValidationController`)
- Configure **access** — access levels per operation, RLS/CLS, allow/deny policies. (`schema-access-control/`, `DataAccessController`)
- **Publish** schema changes to make them live, then test in the **GraphQL Playground** and browse records in the in-app data browser. (`SchemaConfigurationController`, `graphql-playground/`, `schema-data/`)
- Call the generated GraphQL API from their application.

### Platform / tenant administrator (overlapping surface)
Same console screens; the boundary is by **permission**, not by a separate UI. Administrative concerns:
- Data source / connection management (DB connection string + database name per tenant).
- Security posture at the schema level (Public / Logged-in User / Custom, RLS/CLS toggles).
- Housekeeping — deleting seeded mock data, exporting/importing schema definitions between projects.

**Open / undecided:** whether a distinct administrator-only experience (e.g. only certain people may change the DB connection or loosen security) is wanted, or whether the single combined surface is correct (product question B3).

### End-user (of apps built on Blocks) — indirect
End-users never open the console. They are first-class citizens of the *runtime* gateway: a customer app calls GraphQL carrying the end-user's bearer token plus the tenant key (`x-blocks-key`). Blocks Data enforces Row-Level Security (which records they may see/change) and Column-Level Security (which fields are returned/masked) from that user's token claims. End-users shape what the gateway returns, but only through the app.

---

## 3. Terminology & Glossary

Canonical names per the ratified decisions. Retired and aliased terms are listed with their replacements.

| Canonical term | Meaning | Notes / retired aliases |
| --- | --- | --- |
| **Blocks Data** | Customer-facing product name | Branding term. `blocks-data` = key/code identifier. **Retires "Unified Data Service (UDS)".** |
| **Data Gateway** | The structured-data domain and its GraphQL runtime (`/api/gateway`) | Retained (`DataGateway`, sidebar label). Distinct from the product name. |
| **Storage** | The unstructured-data (file/document) domain | Formerly also "DMS"; "Storage" is the surface name. |
| **Entity** | A stored collection of records (maps to a MongoDB collection) | Canonical. **Do NOT use "Table."** Enum `SchemaType.Entity`. |
| **Object** | A reusable nested shape embedded as a field type inside Entities; not stored on its own | Canonical reusable-shape term. **Gap:** code/enum still calls this `Dto` (`SchemaType.Dto`); target name is "Object". |
| **Field** | A property on a schema: name, type, isArray, PII/unique flags, per-operation access | `FieldDefinition` |
| **Access level** | Per-operation posture: **Public**, **Logged-in User**, **Custom**, or **Inherited** | Enum `SchemaAccessLevel { Inherited=0, User=1, Public=2, Custom=3 }` |
| **Create / Read / Update / Delete** | The four operations each carrying an independent access level and policy set | **Frontend rename** of the older Read/Write/Edit/Delete labels. UI shows View/Create/Edit/Delete. **Gap (intended):** backend enum keeps `PolicyOperation { READ, WRITE, EDIT, DELETE, ALL }` — the CRUD rename is frontend-only, no backend or data migration (decision #224). |
| **Custom policy / Policy** | A declarative allow/deny rule (priority, nested AND/OR rule groups) for per-operation or conditional/attribute rules | Presented as a peer option to the simple access levels, not hidden behind an "advanced" gate. |
| **Row-Level Security (RLS)** | Policy restricting *which records* a caller can access | `PolicyType.RLS` |
| **Column-Level Security (CLS)** | Policy restricting/masking *which fields* are returned or writable (incl. nested paths) | `PolicyType.CLS` |
| **Rule group / Rule** | AND/OR-combined conditions; operands from AUTH claims, schema fields, or static values | `ConditionSource { AUTH, SCHEMA_FIELD, STATIC_VALUE }` |
| **Data validation** | Per-field input rules (NotEmpty, Regex, Min/MaxLength, LengthRange, Equal/NotEqual, comparisons, Range) | `ValidationType` |
| **Publish** | Manual action that applies schema changes to the live gateway | Invokes `/schema-configurations/reload`. **Not** deployment. See §Reload below. |
| **Reload** | Backend operation behind Publish: evicts the cached GraphQL executor and marks pending change logs as adapted | `SchemaConfigurationController.ReloadDataGatewayServerAsync`. |
| **Unadapted change log** | A schema/access/policy/validation change not yet published to the live gateway; drives the "unpublished changes" badge | `SchemaChangeType` |
| **Mock data** | Seeded/test documents in a collection that can be listed and cleaned up | `MockDataController` |
| **Schema exchange** | Async export/import of schema definitions, policies, and validations between projects, delivered by notification | `SchemaExchangeController`, Worker consumers |
| **x-blocks-key** | Tenant key header used to resolve the tenant when there is no token | `GraphQlConstant.BlocksKeyHeaderKey` |
| **Tenant / Environment** | The isolation boundary; one service serves all tenants, each with its own GraphQL schema/executor | `TenantContext` |
| **GraphQL Playground** | In-console live query/mutation editor (Monaco) running against the tenant's live gateway | `graphql-playground/` |
| **Records / Data browser** | In-console table/list/JSON viewer of an Entity's stored records (via GraphQL) | `schema-data/` |

**Retired terms:** "Unified Data Service (UDS)" → **Blocks Data**; "Data service" (config copy) → **Blocks Data / Data Gateway**; "Table" → **Entity**. **Gap:** the client API base is still literally named `UDS` (`endpoint.constant.ts`), and a `pipeline_run_uds.yaml` asset remains — residual UDS naming to remove.

---

## 4. Feature Catalog

| Feature | Description | Status | Notes |
| --- | --- | --- | --- |
| Data source configuration | Point a tenant at a Blocks-managed MongoDB or a bring-your-own connection string + database name | Shipped | `ConfigurationController`, `configure-data-source.tsx`. UI: "Blocks database" vs "others". |
| Visual schema builder | Define Entities (stored) and Objects (reusable shapes) with typed fields (String, Int, Long, Float, Boolean, DateTime, ID), arrays, references | Shipped | `SchemaController`, `schema-structure/`. **Gap:** Object still coded as `Dto`. |
| Dynamic GraphQL data gateway | Per-tenant GraphQL schema (queries + insert/update/delete/bulk mutations + typed filter/sort/pagination) generated at request time (HotChocolate) | Shipped | Mapped at `/api/gateway`. **Single official runtime interface.** |
| REST data gateway | Parallel REST CRUD surface over the same schemas | Removed | Deliberately removed in the GraphQL-only refactor; no `GatewayController`/REST access-control code remains. **GraphQL-only is the decision.** |
| Access levels (per operation) | Public / Logged-in User / Custom / Inherited, independently per Create/Read/Update/Delete, at schema and field level | Shipped | Both simple levels and Custom policies are customer-facing peers. |
| Custom policies (RLS) | Restrict *which records* a caller sees via declarative policies over token claims + record fields | Shipped | e.g. "only the data owner can edit." |
| Custom policies (CLS) | Restrict/mask *which fields* are returned/writable, including nested paths | Shipped | e.g. requester email must match to view Salary. |
| Policy engine | Allow/deny policies with priority, nested AND/OR rule groups; operands from AUTH claims, schema fields, or static values | Shipped | `DataAccessController`, `rule-set-form.tsx`. |
| Field validation | Per-field rules (required, length, range, regex, comparisons) with custom messages and active toggles | Shipped | `DataValidationController`. |
| AI regex assistant | Generate a regex from a plain-English description when authoring validation | Shipped | `RegexAssistantController`. **Gap:** route still `generateregex`; target `generate-regex`. |
| Publish (manual) | User clicks Publish to apply schema/field/validation/access changes to the live gateway | Shipped | Invokes `/schema-configurations/reload`. Manual for every change; no auto-deploy. |
| Auto deploy / build / release | Automatic CI/CD build+release of the gateway on schema change | Removed | Fully deprecated and removed as a product concept. **Gap:** pipeline builder code and `pipeline_run_uds.yaml` still linger in the repo and should be deleted. |
| Unpublished-changes badge | Signals schema changes not yet published | Shipped | Backed by unadapted change logs. |
| GraphQL Playground | In-console Monaco editor running live queries/mutations against the tenant gateway, with starter templates | Shipped | Developer-facing. |
| In-app records browser | Table / list / JSON views of an Entity's records with filter, sort, projection, pagination (via GraphQL) | Shipped | `schema-data/`. |
| Mock data management | View counts of and delete seeded/test documents per collection | Shipped | `MockDataController`. **Gap:** delete route still `[HttpDelete]`; target `[HttpPost("delete")]`. |
| Schema exchange (import/export) | Async export/import of schema definitions, policies, validations between projects; delivered by notification | Shipped | `SchemaExchangeController`, Worker consumers. |
| Object / file Storage | Upload (incl. pre-signed URLs), download, folders, DMS listing, metadata, delete | Shipped | `FilesController`, `Storage.DomainService`. |
| Public certificate upload | Upload a public certificate (used for platform/tenant certificate handling) | Shipped (hardening pending) | `CertificateController`. **Gap:** must be protected with `blocks-data::storage::upload-certificate`; it is not intentionally anonymous (decision #215). |
| Multi-tenant, single deployment | One process serves all tenants; tenant resolved per request (token first, else `x-blocks-key`) and selects that tenant's executor | Shipped | `DataGatewayGraphQLEndpointExtensions`, `TenantContext`. |

---

## 5. Key User Flows

### Flow A — App developer: define an Entity and publish (console)
1. Open the Project → sidebar **Data Gateway** → land on the schemas screen.
2. If no data source yet: click **Configure**, choose a **Blocks database** or **others** (enter your own MongoDB connection string + database name), review and confirm (`POST /api/configurations`).
3. Click **Add schema**: name it, pick **Entity** (a stored collection) or **Object** (a reusable shape), set the collection name.
4. Add **fields** in the structure editor — name, type, `isArray`, optionally an Object type for nesting.
5. (Optional) Add **validation** rules per field, and set **access** — per-operation access level (Public / Logged-in User / Custom), RLS/CLS, and allow/deny policies.
6. An **unpublished-changes badge** appears. Click **Publish**: this invokes `/schema-configurations/reload`, which evicts the cached GraphQL executor and marks pending changes as adapted. This is a schema apply, **not** a build/deploy.
7. Open the **Playground**, run the auto-generated query/mutation against the live gateway to confirm; browse records in the **data browser**.
→ *Result:* a live GraphQL API for that Entity, callable from the developer's app.

### Flow B — App / end-user: read data at runtime (GraphQL gateway)
1. The application sends a GraphQL request to `/api/gateway` with the tenant key header `x-blocks-key` and (for authenticated calls) the end-user's bearer token.
2. Blocks Data resolves the tenant (token → else header) and loads that tenant's GraphQL schema. Introspection requires authentication (the data model is not exposed to anonymous callers).
3. For a query it checks the operation's access level; when **Custom**, it evaluates **RLS** policies against the user's token claims to compute a MongoDB filter, then applies **CLS** masking to hide disallowed fields.
4. Records are returned, already filtered and field-masked for that specific user.
→ *Result:* the same endpoint safely serves different tenants and different users with different visibility.

### Flow C — Admin: move schemas between projects (schema exchange)
1. In the source project, trigger **Export** (Schema / AccessPolicies / ValidationRules / All) → returns immediately with a file id; the export runs async in the Worker and is delivered by notification.
2. In the target project, **Import** that file id → runs async; result delivered by notification.
→ *Result:* schema definitions and their governance are portable across projects/environments.
> **Open / undecided:** whether fire-and-forget with a later notification is the desired UX, or whether users expect immediate on-screen progress/confirmation (product question B4).

### Flow D — Developer/admin: manage files (Storage)
1. Create folders, upload files (directly or via pre-signed URL), list the DMS tree, update metadata, download, and delete.
→ *Result:* app documents/files are stored and managed alongside structured data.

---

## 6. UX Principles & Default Behaviours

- **GraphQL is the one runtime interface.** There is a single, official way for an app to read and write its data: the generated GraphQL API at `/api/gateway`. No parallel REST gateway is offered.
- **Simple access first, Custom when needed.** Start with **Public** (anyone may perform the operation) or **Logged-in User** (only authenticated tenant users). Reach for **Custom** only for per-operation or conditional/attribute-based rules (e.g. only the data owner can edit; column-level rules such as email-match to view Salary). Custom/Policies is advanced in capability but presented as a **peer option**, not hidden behind an "advanced" gate.
- **CRUD vocabulary.** Operations are presented as Create / Read (View) / Update (Edit) / Delete. This is a presentation-layer choice; the backend retains its internal operation names.
- **Publishing is explicit and manual.** After editing an Entity's fields, validation, or access, the change is not live until the user clicks **Publish**. This holds for every change, breaking or non-breaking. There is no auto-deploy, and there is no build/release step exposed to the customer — Publish is a fast schema apply, not a deployment.
- **Secure by default at runtime.** Introspection of the data model requires authentication. Access posture is set per operation; the default posture should keep data private to logged-in tenant users unless explicitly made Public.
  > **Open / undecided:** the ratified default posture (private/per-user vs open-unless-locked-down) is not fully settled (product question B5). Current code default: per-operation `Inherited`/`User`-oriented.
- **One combined console for developer and admin**, differentiated by IAM permission rather than by a separate admin UI.
- **Two domains, one product.** Structured data (Data Gateway) and files (Storage) are deliberately shipped together as "Blocks Data."

---

## 7. Functional Requirements & Acceptance Criteria

### FR-1 Data source configuration
- **Given** an app developer in a Project without a data source, **when** they choose "Blocks database" and confirm, **then** the tenant is configured against a Blocks-managed MongoDB and schemas can be created.
- **Given** they choose "others" and supply a connection string + database name, **when** they confirm, **then** the tenant's data operations target that bring-your-own MongoDB.

### FR-2 Entity & Object definition
- **Given** the schema builder, **when** the user creates a schema as **Entity**, **then** it maps to a stored MongoDB collection and appears in the records browser and GraphQL schema.
- **Given** a schema created as **Object**, **when** it is used as a field type on an Entity, **then** it is embedded as a nested shape and is **not** independently stored or exposed as a root collection.
- **Given** typed fields (String, Int, Long, Float, Boolean, DateTime, ID), **when** the schema is published, **then** the generated GraphQL types, filters, and sorts reflect those field types and `isArray` flags.

### FR-3 Publish (manual apply)
- **Given** unpublished changes to an Entity, **when** the user clicks **Publish**, **then** `/schema-configurations/reload` evicts the cached GraphQL executor, the change logs are marked adapted, and subsequent gateway requests reflect the new schema.
- **Given** any change (breaking or non-breaking), **then** it is **not** applied automatically; it becomes live only after Publish. No build/release pipeline is triggered.

### FR-4 Access levels
- **Given** an operation set to **Public**, **when** any caller invokes it, **then** it is permitted with no authentication requirement.
- **Given** an operation set to **Logged-in User**, **when** an authenticated tenant user invokes it, **then** it is permitted; **when** an unauthenticated caller invokes it, **then** it is denied.
- **Given** an operation set to **Custom**, **when** a caller invokes it, **then** the configured RLS/CLS policies are evaluated against the caller's token claims to permit/deny and to filter records and mask fields.
- **Given** an operation/field set to **Inherited**, **then** it takes the access level of its parent schema.

### FR-5 Row- and Column-Level Security
- **Given** a Custom RLS policy "owner can read own rows," **when** user U queries the Entity, **then** only records whose owner field matches U's UserId claim are returned.
- **Given** a Custom CLS policy hiding `Salary` unless requester email matches, **when** a non-matching user queries, **then** `Salary` is masked/omitted while other permitted fields are returned.

### FR-6 Field validation
- **Given** a field with a Regex or LengthRange rule (active), **when** a mutation supplies a violating value, **then** the write is rejected with the configured error message.

### FR-7 Runtime tenant resolution
- **Given** a GraphQL request with a bearer token, **then** the tenant is resolved from the token; **given** only an `x-blocks-key` header, **then** the tenant is resolved from that header.
- **Given** an unauthenticated caller, **when** they attempt introspection, **then** it is refused.

### FR-8 Schema exchange
- **Given** an Export request (Schema / AccessPolicies / ValidationRules / All), **when** submitted, **then** it returns a file id immediately, runs in the Worker, and delivers the result by notification; **and** Importing that file id into another project reproduces the definitions and governance there.

### FR-9 Storage
- **Given** an authenticated user with the relevant permission, **when** they upload/download/list/delete files or manage folders, **then** the operation is performed against the tenant's object storage and gated by the corresponding `blocks-data::*` permission.
- **Acceptance (hardening):** the public certificate upload endpoint must require `blocks-data::storage::upload-certificate` and must not be reachable anonymously. **Gap:** currently unprotected.

### FR-10 Permission model
- **Every** protected management/storage operation is gated by an IAM-issued permission under the `blocks-data::` namespace.
- **Target:** all permissions follow the 3-segment convention `<ApiServiceName>::<controller_route_name>::<action>` (e.g. `blocks-data::configurations::get-configuration`), consistent with IAM/OS/Localization. **Gap:** current scopes are 2-segment (e.g. `blocks-data::get-configuration`, `blocks-data::create-schema`); ~45 permissions are to be migrated to the 3-segment form.

---

## 8. Out of Scope / Roadmap

**Removed / out of scope (do not reintroduce):**
- **REST data gateway** — removed; GraphQL is the sole runtime interface.
- **Auto deploy / build / release of the gateway** — removed as a product concept; publishing is a manual schema apply, not a deployment. *Cleanup pending:* pipeline builder code (`PipelinerunBuilders/`, `DataGatewayPipelineDispatcher`, `pipeline_run_uds.yaml`, pipeline enums) still lingers and should be deleted.
- **"Unified Data Service (UDS)" naming** — retired in favor of "Blocks Data." *Cleanup pending:* residual `UDS` API-base name and `uds` asset naming.

**Roadmap / hardening (target state, gaps in current code):**
- Rename the **Object** concept in code (`Dto` → Object) to match the customer-facing term.
- Migrate all permission scopes to the **3-segment** convention.
- Protect the **certificate upload** endpoint (`blocks-data::storage::upload-certificate`).
- API-consistency cleanups: `generateregex` → `generate-regex`; MockData delete `[HttpDelete]` → `[HttpPost("delete")]`; replace `BaseResponse`/`DmsResponse` with `ServiceResponse<T>` (Storage still uses `DmsResponse`); Storage controllers to adopt kebab-case routes (old `[controller]/[action]` routes kept obsolete for 30–40 days); rename `Certificate.cs` file → `CertificateController.cs` (class already renamed).
- Spelling/naming fixes: `enviroment` → `environment`; kebab-case client file renames; `DataServiceConfiguration` → `DataGatewayConfiguration`; misc `Async`-suffix and namespace normalizations.
- Backend test coverage topped up to ~85% meaningful units, GraphQL-focused.

**Not in this product:** identity, users, roles, MFA, SSO (blocks-iam); Projects/Environments/People/logs (blocks-os); translation management (blocks-localization); uptime monitoring (blocks-monitor).

---

## 9. Open Product Questions

- **Default runtime posture (B5).** Is data private/per-user by default, or open-unless-locked-down? The safe default and how it is expressed in the UI are not fully ratified.
- **Administrator experience (B3).** Should there be a distinct administrator role/experience (e.g. only certain people may change the DB connection or loosen security), or is the single combined console correct? Who in a customer org owns each job?
- **Playground audience / non-technical editing (B2).** The Playground is developer-facing. Is a simpler spreadsheet-like editor expected for less technical users who just want to add/view a few records?
- **Schema exchange UX (B4).** Is fire-and-forget-with-notification the desired import/export experience, or do users expect immediate on-screen progress/confirmation?
- **Storage positioning (C4 / D2).** Is "structured data + files, together" a deliberate headline value proposition, and where should customers expect to find/manage files — inside Blocks Data, or as a shared platform capability? (Decision confirms Storage is one of Blocks Data's two domains; its marketing weight is undecided.)
- **Managed vs bring-your-own primary story (C3).** Is the lead story "we host your data" or "put a governed API over the database you already have," and does that change the target customer?
- **Compliance as headline (C5).** Is role-based hiding of sensitive/PII fields (CLS) a headline use case to lead with, or a supporting feature?
- **Public/unauthenticated data (C1).** Hiding the data model from unauthenticated callers is deliberate; does it ever get in the way of legitimate public read-only data or quick onboarding, and should it be stated as a selling point?
- **Deploy/build ownership across the platform (D5).** With auto-deploy removed, confirm no residual expectation that a separate CI/CD service owns any part of making schema changes live.
