# Blocks Data

Blocks Data is the data service of the SELISE Blocks platform. It covers two domains:

- **Data Gateway**: schema-driven structured data on MongoDB. Users define schemas (entities and reusable objects, with field types including enums), and the service exposes each project's data through a per-tenant GraphQL API with row-level and column-level access control (RLS/CLS), per-operation access lists, field validation rules and defaults, indexes, mock data generation, schema import/export, and a query log. Schema changes are drafted and published, and after a rollback the designer shows what is live next to the drafts. Schema, access policy, storage and bulk changes send built-in notifications.
- **Storage**: unstructured file storage and document management (DMS) over multiple back ends (Azure Blob, AWS S3 and S3-compatible services, SFTP), including pre-signed upload/download URLs, file versioning, and nested folders. Folders and files carry per-resource access policies scoped to users, roles, organizations or everyone, with inheritance from the parent and a per-resource override. Listings are access-resolved and cursor-paginated, so a caller sees only what they may view. Standard document-management features are included: search, a trash with restore, copy and move, and an audit trail of every access decision.

The repository ships a .NET backend, a React single-page application, and a Playwright end-to-end suite. It is released under the [MIT license](LICENSE).

## Repository layout

```
server/   .NET backend
  Api/                      ASP.NET Core host: REST controllers (under the /api prefix),
                            the per-tenant GraphQL endpoint at /api/gateway, and the
                            built SPA served from Api/wwwroot
  DataGateway.DomainService/  Data Gateway domain: GraphQL schema building, query/mutation
                              services, RLS/CLS policy evaluation, validators, repositories
  Storage.DomainService/    Storage domain: storage providers, file management, configuration
  Worker/                   Background host: message consumers (schema import/export,
                            migration completion, default folder creation), a periodic
                            ping, and opt-in one-off migration jobs (see Worker jobs below)
  DataGateway.Driver/       Source of the SeliseBlocks.DataGatewayDriver NuGet package
  Storage.Driver/           Source of the SeliseBlocks.StorageDriver NuGet package
  XUnitTest/                xUnit test suite for the backend
client/   React + Vite SPA (schema designer, data browser, GraphQL playground,
          access control and validation UIs, storage/DMS UIs)
e2e/      Playwright end-to-end tests (see e2e/README.md)
scripts/  CI helpers: junit-to-sonar.py (vitest JUnit -> SonarQube generic test
          format) and th-transform.py (TruffleHog output -> Shield explorer)
```

Multi-tenancy: one instance serves all tenants. The tenant is resolved from the access token when the request is authenticated, otherwise from the `x-blocks-key` header. REST endpoints are protected with permission scopes of the form `blocks-data::<area>::<action>`, for example `blocks-data::schema::…` or `blocks-data::object::grant-access`.

The API and Worker use Genesis (`SeliseBlocks.Genesis.OS`, pinned in `server/Directory.Packages.props`) to resolve each tenant's stored `DbConnectionString` and `DBName` from the central root registry. `BlocksRootDb` lookups remain on the main connection. The Data Gateway's explicitly configured external data source remains an override for GraphQL data operations; it does not change where tenant metadata, schemas, files, or import/export records are stored. Schema import/export messages carry the target project key, which is used for their database operations. Deploy both the API and Worker with the updated package before routing new environments to separate clusters.

The API also runs two background services in each pod:

- `AfterWriteQueue` takes after-write work (the change event and the bulk notification) off the request path. It is in-process and best effort: items still queued when the process dies are lost.
- `SchemaPublishSubscriber` listens for schema publishes over Redis so every pod picks up a new schema straight away. It is only a speed-up; without Redis, pods still catch up by polling.

## Prerequisites

- **.NET SDK 10.0** (every project, including the two driver packages, targets `net10.0`)
- **Node.js 20+** with **npm** (Node 22 is used in the Docker build; Node 24 is known to work)
- Backend runtime dependencies are provisioned through the Blocks Genesis platform (secret vault, MongoDB, cache, message bus). Without access to a Blocks environment you can build and unit-test everything, but the API and Worker will not start end to end.

## Setup

```bash
# backend
dotnet restore server/Blocks.slnx
dotnet build server/Blocks.slnx

# frontend
npm ci --prefix client

# e2e
npm ci --prefix e2e
```

`npm ci` installs exactly what `package-lock.json` specifies. Use `npm install` only when you are deliberately changing a dependency.

## Running locally

`run.sh` (Linux/macOS/Git Bash) and `run.ps1` (Windows PowerShell) are the local entry points:

```bash
./run.sh -f    # frontend dev server (Vite, port 4000)
./run.sh -b    # .NET API (port 5000)
./run.sh -w    # .NET Worker
./run.sh -a    # build frontend into server/Api/wwwroot, then run API + Worker
./run.sh -k    # free the API port
./run.sh -n …  # run an npm command in client/
./run.sh -h    # all options, including test shortcuts
```

Notes:

- The API resolves its secrets through the Blocks Genesis vault at startup, so `./run.sh -b` requires a configured Blocks environment (see Configuration below). In an environment without those backing services the process will not come up; build and unit tests still work.
- The frontend dev server binds to the named host `dev-data.blocksdevelopers.com`, which must resolve to `127.0.0.1` via a hosts entry. `npm --prefix client run local` starts plain Vite without the named host.
- Local HTTPS for both the Vite dev server and Kestrel is enabled by setting the OS environment variables `DATA_SSL_CERT` and `DATA_SSL_KEY` to a PEM certificate/key pair (for example from mkcert). When unset, both serve HTTP.

`Dockerfile` builds the API image (SPA baked into `wwwroot`), and `Dockerfile.worker` builds the Worker image.

## Tests

Run these from the repo root. The solution file is `server/Blocks.slnx` (the newer XML solution format; there is no `.sln`), and the test commands target the test project directly.

```bash
# backend unit tests
dotnet test server/XUnitTest/XUnitTest.csproj

# frontend unit tests
npm --prefix client run test

# end-to-end tests
npm --prefix e2e run test
```

Coverage:

```bash
dotnet test server/XUnitTest/XUnitTest.csproj --collect:"XPlat Code Coverage"
npm --prefix client run test -- --coverage
```

The e2e suite drives the real application through a browser. It needs a running app, a `.env.e2e` file with the target URL and test credentials, and a hosts entry for the named domain. See [e2e/README.md](e2e/README.md) for the full setup.

Backend tests that touch MongoDB run against an ephemeral server through `MongoFixture` and are marked `[Collection("Mongo")]`; `BlocksTestContext` seeds the ambient tenant and user. To use an already running local MongoDB server instead of downloading the ephemeral server, set `BLOCKS_DATA_TEST_MONGO_URI` to its connection URI for the test process. The fixture creates unique database names. Frontend tests mock the HTTP client and wrap hooks in the shared query-client provider from `client/app/test-utils`.

Two things worth knowing before reading a failure here:

- **Build before measuring coverage.** A combined `dotnet test` invocation has been seen returning partial totals with whole assemblies reporting zero and no error. Run `dotnet build server/XUnitTest/XUnitTest.csproj` first, then `dotnet test --no-build`, and compare the test total against the previous run before quoting a number.
- **Delete a leftover `.sonarqube` directory.** If `dotnet test` aborts with "Test host process crashed" and writes no coverage file, `scripts/scan.sh` left one at the repository root. It is ignored by git, so `rm -rf .sonarqube` and re-run.

## Document management

The DMS exposes three controllers under `server/Api/Controllers/Storage/`:

| Controller | Route | Covers |
|---|---|---|
| `DirectoryController` | `directory` | Folder create (including the root folder), read, update, move, delete |
| `FilesController` | `files` | File metadata, presigned upload and upload completion, download, versions, copy, move, rename |
| `ObjectController` | `objects` | Listing, search, trash, shared items, sharing, access policies, inheritance, access resolution |

Every action is authorised twice. `[ProtectedEndPoint("blocks-data::<area>::<action>")]` decides who may call it at all, and the service then resolves the caller's access to the specific resource through `IObjectAccessResolver`. Holding the endpoint permission does not grant access to any particular folder or file.

Access policies attach to a folder or a file and name a principal: a user, a role, an organization, or everyone. A resource inherits its parent's policies unless inheritance is switched off, which is refused while nothing else grants access, since the resource would otherwise become invisible to everyone including the person switching it. Deny beats allow, except that a deny aimed at the owner of the resource it sits on is rejected rather than stored.

Two conventions are easy to break by accident:

- **A read the caller may not perform answers 404, not 403.** Returning "forbidden" would confirm that a folder exists to someone who may not see it, which is enough to map a tree they have no access to.
- **The listing visibility shortcut is only valid for one folder's children.** It treats a purely inheriting resource as visible because its parent already was. Any query that crosses folders, such as search or the trash, resolves `View` per item instead.

### Storage configurations

A tenant's storage configurations live in its `KeyValueStores` under `storage-config:<Name>`. The secrets (connection strings and keys) are kept in SecretStore, and the row stores only their ids. Secrets are read on every call and never cached. The old `StorageConfigurations` collection is read only when a configuration has no row yet, until the migration's cleanup step drops it.

Blocks OS owns the storage configuration API (list, save, delete). The SPA reads the list from Blocks OS, which returns a status per secret, never a secret value.

## Worker jobs

The Worker hosts two migration jobs. Each does nothing unless its mode variable is set, and both take a Redis lock so only one Worker runs them.

- `DataSourceSecretMigrationJob` moves every tenant's data source configuration to the new model: a `data-source` secret in SecretStore plus one root document per tenant in `BlocksRootDb.DataServiceConfigurations`. It never touches the old tenant documents. Enable with `DataSourceSecretMigration__Mode` set to `plan`, `apply`, `verify` or `scrub-redis`. `scrub-redis` removes the legacy connection string from Redis and also requires `DataSourceSecretMigration__DataDeployed=yes`, meaning no pod running the old code is left.
- `StorageConfigMigrationJob` moves storage configurations from `StorageConfigurations` into `KeyValueStores` and SecretStore. Enable with `StorageConfigMigration__Mode` set to `plan`, `apply`, `verify` or `cleanup`. `cleanup` drops the old data and also requires `StorageConfigMigration__SnapshotTaken=yes`.

## Scan and deploy

Scanning and deployment run in CI and in the maintainers' environment. The two tracked helpers in `scripts/` are used there: `junit-to-sonar.py` converts the vitest JUnit report so SonarQube shows client test counts, and `th-transform.py` reshapes TruffleHog findings for the Shield explorer without printing them to the CI log. Install their dependency with `pip install -r scripts/requirements.txt`.

## Configuration

Do not commit secrets. All values below are supplied per environment.

**Server** (`server/Api/appsettings.json`, `server/Worker/appsettings.json`, plus environment-specific overrides):

- `Logging`: standard .NET logging levels.
- `DatagatewayClusterNames`, `DatagatewayClusterRevision`: cluster identifiers used by the Data Gateway pipeline builder.
- `AiCompletionUrl`, `ChatGptTemperature` (Api): endpoint and temperature for the regex assistant's AI completion calls.
- `SwaggerOptions` (Api): OpenAPI document settings.
- `DownloadFilesControllerUrl`, `NotificationServiceUrl` (Worker): service URLs used by consumers.
- `FrontendRuntime` (Api, set per environment): `BLOCKS_*` values injected into the built SPA at startup by replacing `__BLOCKS_*__` placeholders in `wwwroot`.
- `Csp` (Api): `ExtraConnectSrc` and `ExtraImgSrc` (space- or comma-separated, e.g. `Csp__ExtraConnectSrc`) add origins the SPA needs that no `FrontendRuntime` key describes, such as Rollbar, the CDN and the storage host for presigned uploads. The rest of the Content Security Policy is derived from `FrontendRuntime`.
- `DataGateway:MaxPageSize` (Api, optional): caps the page size of GraphQL queries. Unset, pages are read as requested and a `pageSize` of 0 reads every matching row. Set, larger pages are clamped, so check that no client pages through everything with a large or zero page size before turning it on.
- `PeriodicPingConfiguration` (Worker): `Enabled`, `PingIntervalInSeconds` and `PingUrl` for the periodic ping.
- `VerioSystemSettings` (Worker): `BaseUri` and `ApiKey`.
- `SecretManager`: how the Genesis secret vault is reached (see `server/Api/appsetting.Development.example`). Connection strings, certificates, and API keys are resolved from the vault at startup, not from appsettings.

**Client** (`client/.env.example`): `BLOCKS_`-prefixed variables read by Vite (API base URL, notification URL, GraphQL gateway origin, utility API origin, Blocks OS URL, tenant key, captcha site key, construct URL, Rollbar client token and environment). The GraphQL gateway origin is optional and is derived from the current environment when unset. Without the Blocks OS URL, storage configuration calls still derive it, but the secret management links and the app launcher entry need it set. Copy to `client/.env` and fill in values for your environment.

**E2E** (`e2e/.env.e2e.example`): target base URL and test-account credentials. Copy to `e2e/.env.e2e`; the file is gitignored.

## Contributing and security

- [CONTRIBUTING.md](CONTRIBUTING.md): branch model, conventions, and the checks a change must pass.
- [SECURITY.md](SECURITY.md): how to report a vulnerability privately.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): community standards.

## License

[MIT](LICENSE), Copyright (c) SELISE Digital Platforms.
