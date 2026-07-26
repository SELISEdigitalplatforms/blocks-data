# Blocks Data

Blocks Data is the data service of the SELISE Blocks platform. It covers two domains:

- **Data Gateway**: schema-driven structured data on MongoDB. Users define schemas (entities and reusable objects), and the service exposes each project's data through a per-tenant GraphQL API with row-level and column-level access control (RLS/CLS), field validation rules, mock data generation, and schema import/export.
- **Storage**: unstructured file storage and document management (DMS) over multiple back ends (Azure Blob, AWS S3 and S3-compatible services, SFTP), including pre-signed upload/download URLs, file versioning, and folder structures.

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
                            migration completion, default folder creation) and a periodic ping
  DataGateway.Driver/       Source of the SeliseBlocks.DataGatewayDriver NuGet package
  Storage.Driver/           Source of the SeliseBlocks.StorageDriver NuGet package
  XUnitTest/                xUnit test suite for the backend
client/   React + Vite SPA (schema designer, data browser, GraphQL playground,
          access control and validation UIs, storage/DMS UIs)
e2e/      Playwright end-to-end tests (see e2e/README.md)
scripts/  Maintainer scripts (scan and deploy entry points)
```

Multi-tenancy: one instance serves all tenants. The tenant is resolved from the access token when the request is authenticated, otherwise from the `x-blocks-key` header. REST endpoints are protected with permission scopes of the form `blocks-data::<action>`.

## Prerequisites

- **.NET SDK 10.0** (the solution targets `net10.0`; the two driver packages target `net9.0`, which the 10.0 SDK builds)
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

## Scan and deploy

- `scripts/scan.sh` is the repository's scan entry point (SAST, SCA, and secret scanning). It runs in the maintainers' environment and is intentionally not tracked in git.
- `scripts/deploy.sh` builds and deploys to the maintainers' dev VM. **Warning:** it runs `git reset --hard origin/inception` on the working copy and rewrites systemd units; it is not a general-purpose installer.

## Configuration

Do not commit secrets. All values below are supplied per environment.

**Server** (`server/Api/appsettings.json`, `server/Worker/appsettings.json`, plus environment-specific overrides):

- `Logging`: standard .NET logging levels.
- `DatagatewayClusterNames`, `DatagatewayClusterRevision`: cluster identifiers used by the Data Gateway pipeline builder.
- `AiCompletionUrl`, `ChatGptTemperature` (Api): endpoint and temperature for the regex assistant's AI completion calls.
- `SwaggerOptions` (Api): OpenAPI document settings.
- `DownloadFilesControllerUrl`, `NotificationServiceUrl` (Worker): service URLs used by consumers.
- `FrontendRuntime` (Api): `BLOCKS_*` values injected into the built SPA at startup by replacing `__BLOCKS_*__` placeholders in `wwwroot`.
- `SecretManager`: how the Genesis secret vault is reached (see `server/Api/appsetting.Development.example`). Connection strings, certificates, and API keys are resolved from the vault at startup, not from appsettings.

**Client** (`client/.env.example`): `BLOCKS_`-prefixed variables read by Vite (API base URL, notification URL, utility API origin, tenant key, captcha site key, construct URL). Copy to `client/.env` and fill in values for your environment.

**E2E** (`e2e/.env.e2e.example`): target base URL and test-account credentials. Copy to `e2e/.env.e2e`; the file is gitignored.

## Contributing and security

- [CONTRIBUTING.md](CONTRIBUTING.md): branch model, conventions, and the checks a change must pass.
- [SECURITY.md](SECURITY.md): how to report a vulnerability privately.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): community standards.

## License

[MIT](LICENSE), Copyright (c) SELISE Digital Platforms.
