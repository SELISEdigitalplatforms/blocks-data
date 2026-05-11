# Changelog

All changes to this project will be documented in this file.

## [Unreleased]

- fix(storage): normalize Cloud Configuration `Storage/Gets` JSON to an array before React `useMemo` so `findIndex` never runs on wrapped/non-array payloads (dev `Unexpected Application Error`) (by assistant, 2026-05-11 16:25 UTC+6)
- fix(ci): replace broken `.cursor/vendor/agent-skills` submodule gitlink (no `.gitmodules` URL) with vendored files by removing nested `.git` and tracking contents normally so `git submodule sync` / `submodule update` succeed (by assistant, 2026-05-11 16:10 UTC+6)
- Added AI feature-removal design and implementation plan docs under `.cursor/docs` (route-first deactivation, no redirect policy, full module deletion target) (by assistant, 2026-05-11 14:57 UTC+6)
- refactor(client): execute cleanup checklist for login/data-gateway/storage by extracting login authorize URL builder, moving `/data-access/policy` constants to canonical `.../get|delete`, consolidating storage file URL builder, and extending runtime env keys (by assistant, 2026-05-11 14:48 UTC+6)
- Simplified cleanup plan doc to execution-checklist-only format and narrowed scope to login, data-gateway, and storage modules (by assistant, 2026-05-11 14:46 UTC+6)
- Added investigation, design, and execution plan docs for login/data-gateway/storage cleanup under `.cursor/docs` (by assistant, 2026-05-11 14:43 UTC+6)
- fix(worker): load CloudBuild secrets with the same `vaultType` as Genesis (`ResolveVaultType`) instead of always using Azure Key Vault (by assistant, 2026-05-10)
- fix(client): keep `--host dev-uds.blocksdevelopers.com` and add DNS preflight + `allowedHosts` so dev fails fast unless `/etc/hosts` maps the name to loopback (by assistant, 2026-05-10)
- feat(api): add Kestrel HTTPS endpoint for `dev-uds.blocksdevelopers.com:5001` with `dev-uds.pfx` and generate local dev PKCS#12 (by assistant, 2026-05-10)
- chore(cursor): install addyosmani agent-skills into `.cursor/rules` and vendor source under `.cursor/vendor/agent-skills` (by assistant, 2026-05-07 15:24 UTC+6)
- fix(client): align `monaco-editor` with `monaco-graphql` peer range so `npm ci` succeeds in Docker (by assistant, 2026-05-03)
- fix(playground): correct Data Gateway Playground wrapper padding and container framing to match the reference layout (by assistant, 2026-05-04 18:06 UTC+6)
- feat(client): route GraphQL playground execute requests to `https://dev-api.blocksdevelopers.com` while other UDS APIs keep the app `/api` proxy (by assistant, 2026-05-04)
- feat(client): route gateway pod ping (`getPodActiveStatus`) through `https://dev-api.blocksdevelopers.com` the same way as GraphQL execute (by assistant, 2026-05-04)
- fix(client): use `/uds/v1/{slug}/ping` for gateway pod ping on `dev-api` instead of `/api/{slug}/ping` (by assistant, 2026-05-04)
