# Blocks Data — Business Specification

> Status: authoritative spec. Grounded in the `blocks-data` repository and the answered product decisions (GitHub tickets #190–#224 + product-owner review). Where current code differs from a decision, the decision is the TARGET state and the gap is called out inline.

---

## 1. Overview

Blocks Data is the data layer of the SELISE Blocks platform. It lets a team stand up a secured, production-ready data API without writing or operating backend code. From the console, an app developer connects a database (a Blocks-managed MongoDB or their own bring-your-own connection), visually defines Entities (named record types with typed fields), and layers on field validation and access control. Blocks Data then generates and runs a live, per-tenant GraphQL API that exposes Create/Read/Update/Delete operations over those Entities, enforced by row- and field-level security driven by the caller's identity. Blocks Data has two domains: the Data Gateway (structured data) and Storage (unstructured files). It solves the "we need a database, a typed API over it, and per-user access rules — fast" problem for applications built on Blocks.

---

## 2. Problem & Market Context

Teams building applications repeatedly rebuild the same backend plumbing: a database, a hand-written CRUD API, input validation, and per-user/per-role authorization. This work is slow, error-prone, and a recurring source of security defects (over-permissive endpoints, leaked fields, missing tenant isolation). For multi-tenant SaaS, the burden multiplies: every tenant needs isolation, and the same data model must be served privately to many customers.

The market for this is the "backend-as-a-service" / managed-data-API space — reducing the distance between "we designed a data model" and "our app can safely read and write it." Blocks Data addresses this specifically for teams already standardizing on the SELISE Blocks platform, where identity, projects, and tenancy are already solved by sibling services and can be reused rather than reinvented.

---

## 3. Value Proposition & Positioning

**Value proposition:** Define your data model visually and instantly get a live, governed GraphQL API over it — multi-tenant, validated, and secured by the caller's identity — with no backend code to write or servers to run.

Positioning pillars:
- **Instant GraphQL over managed or bring-your-own MongoDB.** Point Blocks Data at a database it manages for you, or at your own MongoDB, and get a typed API immediately.
- **Governance built in.** Field validation, simple access levels, and custom policies (row-level and field-level security) are first-class, not bolt-ons.
- **Multi-tenant by construction.** One deployment serves every tenant in isolation; each request resolves to its own tenant schema.
- **Two clean domains.** Structured data (Data Gateway) and unstructured files (Storage) under one product.

**What Blocks Data is explicitly NOT:**
- **NOT a dual GraphQL + REST gateway.** The runtime data API is **GraphQL-only**. The former parallel REST data gateway (`GatewayController` and its REST access-control path) has been removed in the GraphQL-only refactor; there is no REST CRUD surface over Entities. (Confirmed: no `GatewayController.cs` remains in the server tree.)
- **NOT a deploy/build/release product.** There is no build pipeline, pod rebuild, or CI/CD release step for schema changes. The former deploy model is deprecated and removed. Publishing a schema change is a lightweight, manual "apply schema to the gateway" action (see §9), not a deployment.
- **NOT a spreadsheet/data-entry product.** The in-console surfaces (GraphQL Playground, records browser) are developer-facing tools for verifying the API, not an end-user data editor.
- **NOT an identity product.** It consumes identities, roles, and permissions from blocks-iam; it does not define them (see §6).

**Canonical terminology (use consistently):**
- **Blocks Data** — customer-facing product/branding term. `blocks-data` is reserved for keys and code.
- **Data Gateway** — the structured-data domain and the GraphQL runtime that serves it. `DataGateway` is retained in code.
- **Entity** — a stored collection of records (the unit a developer creates). Do **not** use the term "Table."
- **Object** — the reusable, embeddable shape used as a field type inside Entities (previously surfaced as "DTO").
- **Storage** — the unstructured-file domain.

---

## 4. Target Customers & Personas

**Primary persona — the App Developer building on Blocks.** The console is built for this person. They connect a data source, design Entities and fields, add validation, configure access (simple levels or custom policies), verify the live API in the Playground / records browser, publish schema changes, and then call the generated GraphQL API from their application.

Other personas that apply:
- **Platform / tenant administrator** — overlaps with the developer in this product; there is no separate admin-only UI. Distinctly administrative concerns exist by permission, not by screen: managing the database connection, and setting the security posture (access levels, RLS/CLS, policies). **Open / undecided:** whether a distinct administrator experience (e.g. only certain people may change the DB connection or loosen security) is wanted, or the single combined experience is correct.
- **End-user of an app built on Blocks** — indirectly applicable. End-users never open the Blocks Data console, but they are first-class at runtime: the app calls the GraphQL gateway carrying the end-user's identity token (plus the tenant key), and Blocks Data enforces row-level and field-level security against that user's claims. The end-user shapes what the gateway returns, but only through the app, never directly.

---

## 5. Business Use Cases

- **Backend-as-a-service for Blocks apps.** Teams get a database, a typed GraphQL API, and per-user security without writing or operating backend services.
- **Secure multi-tenant SaaS data.** One deployment serves many tenants in isolation; identically named Entities are served privately per tenant, keyed by token or the `X-Blocks-Key` tenant header.
- **Fine-grained data governance / compliance.** Row-Level Security, Column-Level Security, allow/deny custom policies, and PII field flags let teams enforce "each user sees only their rows," "hide salary/email unless the requester matches," etc., driven by IAM token claims.
- **Bring-your-own-database.** Point Blocks Data at an existing MongoDB and get a governed GraphQL API over it, without migrating the data into a Blocks-hosted store.
- **Rapid prototyping with disposable data.** Seed and inspect records, exercise the API in the Playground, then clean up test/mock data per collection.
- **Environment / project templating.** Export an Entity model plus its policies and validation rules and import them into another project to promote or clone a data model.
- **App file/document handling.** Store and manage user/app files and folders (Storage) alongside structured data.

---

## 6. Where it fits in the SELISE Blocks platform

SELISE Blocks is a multi-tenant platform of five services, each .NET (`server/`) + React/Vite (`client/`), multi-tenant via the `X-Blocks-Key` tenant key, authenticating through blocks-iam via OIDC. Blocks Data is the data service. Its relationships:

- **blocks-os (central console / control-plane).** Defines Projects, Environments (tenants), and People, and hosts the console shell Blocks Data runs inside. Every Entity and data source in Blocks Data is scoped to a Project / Environment that originates in blocks-os. blocks-os answers *where* the data lives (which project/tenant).
- **blocks-iam (identity & access).** The OIDC authorization server that issues the tokens Blocks Data trusts. Blocks Data reads token claims (user id, email, roles, permissions, tenant) to enforce row- and field-level security at runtime, and gates every console operation behind named `blocks-data::…` permission scopes. blocks-iam answers *who you are and what you may do*; Blocks Data answers *which data those identities may touch*. The division of responsibility: identities, roles, and permissions are defined in blocks-iam; the rules binding those identities to specific rows and fields live in Blocks Data.
- **blocks-localization, blocks-monitor.** Peer services with no deep coupling to Blocks Data at the code level. Blocks Data emits service logs/traces that the platform's LMT (logs + traces) surface in blocks-os can consume.

**Minimum platform footprint:** Blocks Data is designed to run inside a blocks-os Project and authenticate through blocks-iam; it is not positioned as a standalone product. **Open / undecided:** the exact minimum set of Blocks services a customer must adopt to get value from Blocks Data (i.e. whether it is ever used fully standalone).

---

## 7. Success Metrics / KPIs

**Open / undecided:** no formal product KPIs are defined in the repository. Candidate metrics consistent with the product's intent (to be confirmed by product owner):
- Time-to-first-live-API (data source connected → first Entity queried in the Playground).
- Number of Entities and active tenants served per deployment.
- Share of Entities using validation and access policies (governance adoption).
- Runtime query/mutation volume and error rate through the GraphQL gateway.
- Bring-your-own-database vs Blocks-managed adoption split.

A near-term engineering quality bar is decided: raise and maintain **~85% meaningful GraphQL backend test coverage**, and keep the backend suite green after the GraphQL-only refactor (per the coverage/refactor decisions).

---

## 8. Pricing, Packaging & Limits

**Open / undecided:** no pricing, packaging tiers, quotas, or hard limits are defined in the repository. Known packaging facts, not commercial terms:
- Two domains ship under one product: **Data Gateway** (structured) and **Storage** (unstructured files).
- Data-source options are **Blocks-managed MongoDB** or **bring-your-own MongoDB** — a packaging axis that may carry different commercial treatment, but none is specified.
- **Open / undecided:** per-tenant limits (Entities, fields, records, storage size), rate limits, and whether Storage is metered separately from structured data.

---

## 9. Scope & Non-Goals

### v1 scope
- **Data source configuration** — register a tenant against a Blocks-managed or bring-your-own MongoDB (connection string + database name).
- **Visual Entity/Object modelling** — define Entities (stored collections) and Objects (reusable embeddable shapes) with typed fields (String, Int, Long, Float, Boolean, DateTime, ID), arrays, and references.
- **Dynamic GraphQL data gateway** — per tenant, a GraphQL schema (queries + insert/update/delete/bulk mutations + typed filter/sort/pagination) generated at request time from the Entity definitions.
- **CRUD operations** — the four operations are **Create, Read, Update, Delete**. Note: the Read/Write/Edit/Delete → Create/Read/Update/Delete change is **frontend-only labelling**; the backend enum and stored access levels are unchanged and need no data migration.
- **Access control** — two customer-facing tiers, presented as peer options:
  - **Simple access levels:** **Public** (anyone may CRUD) and **Logged-in User** (only authenticated tenant users may CRUD). Start here.
  - **Custom policies:** per-operation and conditional/attribute-based rules — e.g. only the data owner may edit a record, or column-level rules such as requiring the requester's email to match before the Salary field is viewable. Custom is advanced in capability but is **not hidden behind an "advanced" gate**; it is offered as a peer option. (Backend enum: `Inherited`, `User`, `Public`, `Custom`; schema default is `User`.)
  - **Row-Level Security (RLS)** and **Column-Level Security (CLS)** are enforced by the runtime under Custom policies, evaluated against token claims.
- **Field validation** — per-field rules (required/NotEmpty, regex, length, range, comparisons) with custom messages and active toggles, including an AI assistant that generates a regex from a plain-English description.
- **Manual schema publish** — after modifying fields/validation/access on an Entity, the user clicks **Publish**, which calls `/schema-configurations/reload` (`SchemaConfigurationController` → `ReloadDataGatewayServerAsync` → `ReloadAsync`). This **applies** the Entity changes to GraphQL and refreshes the data gateway; it resolves the tracked unadapted change logs. Publishing is **manual for every change**, breaking or non-breaking; there is no auto-apply.
- **In-console verification** — GraphQL Playground (live query/mutation editor) and a records browser (table/list/JSON views, backed by GraphQL).
- **Mock/test-data management** — list counts of and clean up seeded/test documents per collection.
- **Schema exchange** — asynchronously export an Entity model (schema / access policies / validation rules / all) and import it into another project, delivered by notification.
- **Storage (files)** — upload (including pre-signed URLs), download, folders, listing, delete, and metadata.
- **Multi-tenancy** — one service process serves all tenants; the tenant resolves per request (token first, else `X-Blocks-Key`) and selects that tenant's GraphQL schema/executor.

### Non-goals (v1)
- **No REST data gateway.** GraphQL is the single runtime data API; the REST gateway is removed.
- **No deploy/build/release pipeline.** The former CI/CD pod-rebuild deploy model is removed; "Publish" is a schema-apply, not a deployment. Do not surface build/release as a customer concept.
- **No end-user spreadsheet/data-entry UI** in v1.
- **No separate administrator UI** in v1 (single combined console; split is by permission).

### Known code-vs-decision gaps (target state)
These decisions are the target; code may still be catching up:
- **Terminology cleanup, in progress.** "Unified Data Service (UDS)" must be removed in favour of "Blocks Data"; use "Entity" (not "Table") and "Object" (not "DTO"). Some code/docs/UI still carry the old names (e.g. the client API base and local dev domain named `UDS`, and the `DataServiceConfiguration` entity to be renamed to `DataGatewayConfiguration`). Target: single "Blocks Data" branding with "Data Gateway"/`DataGateway` retained for the structured domain.
- **Permission scopes, in progress.** The 45 permissions currently use a 2-segment pattern (`blocks-data::<action>`, e.g. `blocks-data::reload-data-gateway-server`). Target: the platform-standard 3-segment pattern `<ApiServiceName>::<controller_route_name>::<action>` (e.g. `blocks-data::configurations::get-configuration`).
- **Security fix (target).** The certificate-upload endpoint must not be anonymous; it is to be protected with `blocks-data::storage::upload-certificate`.
- **API consistency (target).** Standardize responses on `ServiceResponse<T>` (replacing `BaseResponse`/`DmsResponse`), keep DataGateway kebab-case routes, migrate Storage routes to the same style (old routes obsolete for 30–40 days), and apply naming/spelling fixes (`environment`, `registry`, kebab-case filenames, `Async` suffix rules).

---

## 10. Open Business Questions

- **Administrator vs developer separation (B3).** Should there be a distinct administrator experience — e.g. only certain people may change the database connection or loosen the security posture — or is the single combined console correct? Who in a customer org owns each job?
- **Standalone usage / minimum footprint (D4).** Is Blocks Data ever used standalone, or always inside a blocks-os Project authenticated via blocks-iam? What is the minimum set of Blocks services a customer must adopt?
- **Storage's role in the story (C4, D2).** Is "structured data + files, together" a deliberate combined value proposition, and how prominently should Storage feature in the product narrative versus being a supporting capability? (Decision fixes that Storage *is* part of Blocks Data as its unstructured domain; its marketing weight is still open.)
- **Managed vs bring-your-own as the lead story (C3).** Is the primary sell "we host your data" or "put a governed API over the database you already have," and does that shift the target customer?
- **Privacy/compliance as a headline (C5).** Should role-based field hiding / PII protection be a lead use case or a supporting feature?
- **Introspection-requires-auth as positioning (C1).** The GraphQL gateway refuses schema introspection to unauthenticated callers. Is "the data model is hidden from unauthenticated callers" a stated selling point, and does it ever impede legitimate public read-only or quick-onboarding use?
- **Default security posture (B5).** Is the current default (per-Entity, defaulting to "Logged-in User") the intended safe default across the product?
- **Schema-exchange UX (B4).** Is fire-and-forget import/export with a later notification the wanted experience, or do users expect immediate on-screen progress/confirmation?
- **Pricing, packaging, and limits (§8).** All commercial terms and per-tenant limits are undecided.
- **Success metrics (§7).** No product KPIs are defined.
