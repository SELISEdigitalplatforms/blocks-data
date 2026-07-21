# Blocks Data — End-to-End Tests (Playwright)

E2E tests that drive the real app through the browser, including the dev-iam
login redirect flow.

## One-time setup

1. **Configure env** — copy the template and fill in your values:
   ```bash
   cd e2e
   cp .env.e2e.example .env.e2e
   ```
   Set `E2E_BASE_URL` (your named domain, e.g. `https://dev-data.blocksdevelopers.com:5000`),
   `E2E_USERNAME`, `E2E_PASSWORD`. `.env.e2e` is gitignored — never commit real
   credentials.

2. **Hosts entry** — `dev-data.blocksdevelopers.com` must resolve to `127.0.0.1`,
   otherwise the tests drive the **remote** dev server instead of your machine.

3. **Install** Playwright + the browser:
   ```bash
   cd e2e
   npm install
   npx playwright install chromium
   ```

## Run (single command)

From the repo root:

```bash
./run.sh -te
```

or directly:

```bash
cd e2e
npm test
```

`npm test` will:
1. start the API via `run.sh -b` from the repo root,
2. wait until `E2E_BASE_URL` responds,
3. run the tests, then
4. shut the server down.

If the app is **already** running at `E2E_BASE_URL`, it is reused (no rebuild).

> Auto-start uses `bash run.sh -b`, so **Git Bash's `bash` must be on PATH**
> (`run.ps1 -b` can't be automated). To manage the server yourself instead, run
> it manually and start tests with auto-start disabled:
> ```bash
> E2E_NO_WEBSERVER=1 npm test
> ```

> `run.sh -b` serves HTTPS only when `DATA_SSL_CERT` / `DATA_SSL_KEY` point at a
> valid `.pem` pair for this domain. Without them it serves **HTTP**, and an
> `https://` `E2E_BASE_URL` will hang until the webServer timeout.

### Other run modes
```bash
npm run test:headed   # watch it in a real browser
npm run test:ui       # Playwright UI mode
npm run report        # open the last HTML report
```

## Discovering / updating selectors

The username/password fields live on the dev-iam page. To capture or verify
selectors against the live page:

```bash
npm run codegen -- <E2E_BASE_URL>/login
```

## Knobs in `.env.e2e`

| Variable | Effect |
|---|---|
| `E2E_NO_WEBSERVER=1` | Don't auto-start the app; you manage the server. |
| `E2E_PAUSE_MS` | How long the browser holds after **each** test so you can see the result. Defaults to **10 s in headed mode**, 0 when headless; set a number to override either way; `0` disables. |
| `E2E_SLOWMO` | Milliseconds of delay per action, to watch the steps themselves. |

## Layout

```
e2e/
  tests/auth/login.spec.ts   # login through dev-iam -> /app/console
  support/test-base.ts       # shared test/expect with the headed pause
  fixtures/                  # auth storage state (gitignored)
  global-setup.ts            # points the served SPA at the local :5000 host
  playwright.config.ts       # baseURL + creds from .env.e2e
```
