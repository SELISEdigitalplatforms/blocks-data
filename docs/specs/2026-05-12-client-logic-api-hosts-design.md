# Client: Logic API host alignment

> **Repository note:** `.gitignore` excludes `docs/superpowers/` and root `change.md`, so this file is the **versioned** design spec for this change.

## Goal

Ensure the UDS client calls the listed REST endpoints on the **Logic** host (`BLOCKS_UTILITY_API_ORIGIN`, default `https://dev-logic.blocksdevelopers.com`), not **IdP** (`dev-idp`) or the **UDS** app base (`BLOCKS_API_BASE_URL`).

## Explicit scope (approved)

**In scope — must use Logic origin:**

1. `GET /api/Iam/GetUser` (and `GetUser` with `id` + `ProjectKey` for `getUserById`)
2. `GET /api/Project/Gets?page=&pageSize=&tenantGroupId=`
3. `GET /api/Project/GetAsset?TenantGroupId=`
4. `POST /api/Project/UpdateTenantGroup`

**Already correct (no behavioral change required unless regressions found):**

- `POST /api/People/Gets` — uses `getUtilityApiOrigin()` today
- `GET /api/Migration/GetMigrationStatus?tenantGroupId=` — uses `getUtilityApiOrigin()` today

**Out of scope (explicit product decision — Option B):**

- `GET /api/Project/Get?projectId=` via `client/app/services/project.service.ts` (`getProject`) remains on current wiring (`IDP_BASE_URL` + path) until backend routing is confirmed separately.

## Technical approach

- Use **`getUtilityApiOrigin()`** from `client/app/constants/endpoint.constant.ts` for all in-scope calls. It trims `BLOCKS_UTILITY_API_ORIGIN` when set; otherwise defaults to dev-logic.
- Use **`http.get` / `http.post` with `{ absoluteUrl: true }`** when the URL is built as `origin + /api/...`, matching existing patterns (`getMigrationStatus`, `getPeople`, `user.service` GetUser today uses absolute with IdP — same pattern, different origin).

## Files to touch (implementation preview)

| File | Change |
|------|--------|
| `client/app/idp/iam/services/user.service.ts` | Replace `IDP_BASE_URL` with `getUtilityApiOrigin()` for `getUser` and `getUserById` only. |
| `client/app/services/project.service.ts` | Replace `IDP_BASE_URL` with `getUtilityApiOrigin()` for **`getProjects` only**; do not change `getProject`. |
| `client/app/identifier/services/project.service.ts` | `getProjects`: `getUtilityApiOrigin()` instead of `IDP_BASE_URL`. `getAssets`, `updateTenantGroup`: full Logic URL + `absoluteUrl: true`. Remove `IDP_BASE_URL` import if unused. |
| `client/app/idp/iam/services/user.service.test.ts` | Assertions: expect Logic base (mock or default `getUtilityApiOrigin()`). |
| `client/app/identifier/services/project.service.test.ts` | Expect Logic URL for `getProjects`; add/adjust cases for `getAssets` / `updateTenantGroup` if covered. |

## Non-goals

- Changing IdP-only flows (token, OIDC redirect, MFA config pointing at dev-idp).
- Changing storage or other services that intentionally use `IDP_BASE_URL` unless they are the same misrouting class (not part of this spec).
- Renaming `getUtilityApiOrigin` to `getLogicApiOrigin` (optional future cleanup).

## Testing

- Unit tests updated for changed URL strings.
- Manual: with default env, network tab shows Logic host for GetUser, Project/Gets, GetAsset, UpdateTenantGroup; People/Gets and GetMigrationStatus unchanged.

## Risks

- If Logic does not expose `Iam/GetUser` in some environments, calls would fail until backend or env is aligned — assumed acceptable per stakeholder URLs.
