# Contributing to Blocks Data

Blocks Data has two domains: **Data Gateway** (structured data, GraphQL over MongoDB) and **Storage** (unstructured files / DMS). Follow the conventions below so naming and API shape stay consistent. Server-side naming rules are enforced as warnings by `server/.editorconfig`; the rest are reviewed in PRs.

## Branch model

- Day-to-day work happens on the **`inception`** branch. Do not create feature branches unless a maintainer asks for one.
- Open pull requests **from `inception` into `dev`**. Never commit to `dev` or `main` directly; both are protected.
- Never force-push and never rewrite published history.

## Commit conventions

Match the style already in the log:

- A short, imperative subject line ("Add unit tests for user-memberships-list", "fix: notification payload property name typo").
- A conventional prefix where it adds clarity: `feat:`, `fix:`, `chore:`, `ci:`, `test:`, optionally scoped like `chore(e2e):`.
- Keep commits small and reviewable; one logical change per commit.
- No AI attribution lines of any kind.

## Product and domain naming

- The customer-facing product name is **Blocks Data**. Use `blocks-data` only for keys, code identifiers, and permission scopes.
- Keep **Data Gateway** / `DataGateway` for the structured-data (GraphQL) domain.
- Do **not** use the retired names **Unified Data Service / UDS**, EuroLM, or UILM in new code or copy. On the client, use `API_BASES.BLOCKS_DATA` (the `UDS` key is a deprecated alias kept only so existing constants resolve).

## Domain vocabulary (client-facing copy)

- **Entity**: a stored collection of records. Never call it a "Table".
- **Object**: a reusable, nested shape referenced by fields. (In older backend code this is still typed as `Dto`.)
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
  - C# symbol rename: keep the old, mark it `[Obsolete("Renamed to <New>.")]`, forward it to the new.
  - Route rename: add the new `[HttpGet("new-route")]`, keep the old route marked with a `// Deprecated: use <new route>` comment, delegating to the new.
  - JSON field rename: add the corrected member and keep binding the old key too.
- Every controller action is protected with `[ProtectedEndPoint("...")]`. Permission scopes use the 2-segment grammar `<ApiServiceName>::<action>` (e.g. `blocks-data::get-configuration`, `blocks-data::update-schema-definition`). Scope strings are IAM-grant-breaking: coordinate any change with an IAM seed/grant update.

## Client naming

- File names are kebab-case (`schema-structure-table.tsx`), matching the repo's documented rule.
- Prefer descriptive, domain-aligned names; keep deprecated exports forwarding to the new name with a `/** @deprecated use <new> */` note rather than removing them.

## Before you open a PR

All commands run from the repo root:

- Backend: `dotnet test server/XUnitTest/XUnitTest.csproj`
- Frontend: `npm --prefix client run test`
- E2E: `npm --prefix e2e run test` (needs a running app and `e2e/.env.e2e`; see `e2e/README.md`)
- The unit suites must be green with zero failures, and your change must not lower coverage.
- Maintainers additionally run `scripts/scan.sh` (SAST, SCA, and secret scanning) before merging; new findings block the merge. Fix findings in real code or dependency versions, not with suppressions.

## Review expectations

- PRs are reviewed on the `inception` to `dev` pull request. Keep the PR description specific: what changed, why, and how it was tested.
- Do not mix unrelated changes in one PR.
- Documentation (`README.md` and any nested README the change touches) is updated in the same PR as the behavior change.

## Reporting a security issue

Do not open a public issue for a suspected vulnerability. Follow the private disclosure process in [SECURITY.md](SECURITY.md).
