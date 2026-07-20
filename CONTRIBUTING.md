# Contributing to Blocks Data

Blocks Data has two domains: **Data Gateway** (structured data, GraphQL over MongoDB) and **Storage** (unstructured files / DMS). Follow the conventions below so naming and API shape stay consistent. Server-side naming rules are enforced as warnings by `server/.editorconfig`; the rest are reviewed in PRs.

## Product and domain naming

- The customer-facing product name is **Blocks Data**. Use `blocks-data` only for keys, code identifiers, and permission scopes.
- Keep **Data Gateway** / `DataGateway` for the structured-data (GraphQL) domain.
- Do **not** use the retired names **Unified Data Service / UDS**, EuroLM, or UILM in new code or copy. On the client, use `API_BASES.BLOCKS_DATA` (the `UDS` key is a deprecated alias kept only so existing constants resolve).

## Domain vocabulary (client-facing copy)

- **Entity** — a stored collection of records. Never call it a "Table".
- **Object** — a reusable, nested shape referenced by fields. (In older backend code this is still typed as `Dto`.)
- CRUD is presented to users as **Create / Read / Update / Delete**. The backend access levels remain `Read / Write / Edit / Delete`; the mapping lives in `client/app/data-gateway/constants/schema-access-control.ts`.
- There is no deploy / build / release step. Schema changes are published manually via the **Publish** action, which calls `/schema-configurations/reload`. Do not add auto-deploy language.

## C# naming (server)

- **Async suffix:** every `async` service-level method that returns `Task`/`Task<T>` ends in `Async`. Do **not** add the suffix to controller action methods.
- **Namespaces** follow the folder they live in; sibling classes share one namespace.
- **Interfaces** are `I`-prefixed and PascalCase; types and public members are PascalCase.
- Fix spelling in identifiers (e.g. `environment`, not `enviroment`; `registry`, not `registery`).

## API conventions

- Controller action methods return `IActionResult` / `Task<IActionResult>`.
- Prefer kebab-case resource routes (e.g. `generate-regex`, `mock-data/delete`).
- **Never delete or rename a live route or wire field in place.** Add the new one and keep the old accepted:
  - C# symbol rename → keep the old, mark it `[Obsolete("Renamed to <New>.")]`, forward it to the new.
  - Route rename → add the new `[HttpGet("new-route")]`, keep the old route marked `[Obsolete]` with a `// Deprecated: use <new route>` comment, delegating to the new.
  - JSON field rename → add the corrected member and keep binding the old key too.
- Permission scopes use the 3-segment grammar `<ApiServiceName>::<controller_route>::<action>` (e.g. `blocks-data::configurations::get-configuration`). Scope strings are IAM-grant-breaking — coordinate any change with an IAM seed/grant update.

## Client naming

- File names are kebab-case (`schema-structure-table.tsx`), matching the repo's documented rule.
- Prefer descriptive, domain-aligned names; keep deprecated exports forwarding to the new name with a `/** @deprecated use <new> */` note rather than removing them.

## Before you open a PR

- Backend: `dotnet test server/XUnitTest/XUnitTest.csproj`
- Frontend: `cd client && npx vitest run`
- Both suites must be green with zero failures.
