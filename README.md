# Talos

Talos is a repository-health dashboard with dead-code scanning, safe cleanup, panic-recovery, and a full audit trail. It runs locally and in CI.

## What it does

- **Dashboard** — repository metadata, source-file count, unused files / deps / exports, and a 0–100 health score.
- **Scanner** — runs Knip + Depcheck; supports audit-only, audit-with-cleanup, and audit-with-cleanup-and-PR.
- **Panic** — reverts a commit on a fresh `panic/revert-<sha>` branch and opens a recovery PR. Merge commits are rejected. PR creation is a separate step from the revert itself.
- **Audit history** — every action is recorded in `.dark-matter/history.json` with timestamp, kind, status, and structured fields.
- **GitHub automation** — uses `gh` CLI for PR creation. Falls back gracefully when `gh` is missing.

## Architecture

```
src/
  config/env.ts              typed config from env, kill switch, timeouts
  types/                     api.ts, history.ts, scan.ts
  infra/
    shell.ts                 spawn-only runner, timeouts, structured errors
    github.ts                gh CLI wrapper with graceful degradation
    fs.ts                    atomic writes, JSON read, source-file counter
    knip.ts, depcheck.ts     parsers
  validation/
    errors.ts                typed error hierarchy
    schemas.ts               zod schemas for /scan and /revert
  services/
    history-store.ts         atomic append-only audit log
    codebase.ts              repo + package snapshot
    scan-service.ts          scan + cleanup + PR orchestration
    panic-service.ts         revert + recovery-PR orchestration
  routes/index.ts            thin controllers, validation, audit logging
  app.ts                     composition root
  server.ts                  entry point
public/
  index.html                 semantic, accessible single-page dashboard
  style.css                  calm dark theme, single accent, no glow
  js/                        modular ES modules (no build step)
    main.js, state.js, api.js, dom.js, toast.js
    tabs.js, modal.js, dashboard.js, scanner.js, panic.js, history.js
tests/
  unit/                      vitest, 57 tests
  e2e/smoke.spec.ts          Playwright, 9 tests
.github/
  scripts/dark-matter/       run.sh, open-pr.sh
  scripts/panic-button/      revert.sh
  workflows/                 smoke-tests.yml, dark-matter.yml, panic-button.yml
```

## Quick start

```bash
npm install
npm run build
npm start
# open http://127.0.0.1:3000
```

For development with hot reload:

```bash
npm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | TypeScript compile to `dist/` |
| `npm start` | Run `dist/server.js` |
| `npm run dev` | `tsx watch` for development |
| `npm test` | Run vitest unit tests |
| `npm run test:e2e` | Run Playwright smoke tests |
| `npm run lint` | ESLint |
| `npm run scan:knip` | Run Knip directly |
| `npm run scan:depcheck` | Run Depcheck directly |

## Configuration

Talos reads its configuration from environment variables. All have safe defaults for local development.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `development` | Runtime mode |
| `TALOS_REPO_ROOT` | `process.cwd()` | Repository to inspect |
| `TALOS_HISTORY_PATH` | `<repo>/.dark-matter/history.json` | Audit log location |
| `TALOS_DARK_MATTER_DIR` | `<repo>/.dark-matter` | Scan artifacts directory |
| `TALOS_SCRIPTS_DIR` | `<repo>/.github/scripts` | Helper script location |
| `TALOS_SHELL_TIMEOUT_MS` | `60000` | Per-command timeout |
| `TALOS_DISABLE_SPAWN` | unset | When `1`, all shell calls are refused (used for tests and read-only deployments) |
| `GITHUB_TOKEN` | unset | Pre-resolved GitHub token; bypasses `gh auth token` |

## API

All routes return JSON except `GET /` which serves the dashboard for browser clients and a greeting JSON for API clients.

| Method | Path | Behaviour |
| --- | --- | --- |
| `GET` | `/health` | `{ status: "ok", version: "..." }` |
| `GET` | `/api/status` | Repository metadata + scan result + scanner availability |
| `POST` | `/api/scan` | Run audit; optional `cleanup`, `openPullRequest` |
| `POST` | `/api/revert` | Revert a commit; optional `sha`, required `reason` |
| `GET` | `/api/history` | Audit log, newest first |

### Example: audit-only scan

```bash
curl -X POST http://127.0.0.1:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Example: audit + cleanup + PR

```bash
curl -X POST http://127.0.0.1:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"cleanup": true, "openPullRequest": true}'
```

### Example: panic revert

```bash
curl -X POST http://127.0.0.1:3000/api/revert \
  -H "Content-Type: application/json" \
  -d '{"sha": "abcdef1234", "reason": "production hotfix: bad release"}'
```

### Error responses

All errors return a structured envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body failed validation",
    "details": [{ "path": "cleanup", "message": "Expected boolean, received string" }]
  }
}
```

Error codes map to HTTP status:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Request body failed schema validation |
| `NOT_FOUND` | 404 | Unknown route |
| `SHELL_DISABLED` | 403 | `TALOS_DISABLE_SPAWN=1` is set |
| `SHELL_TIMEOUT` | 504 | Command exceeded the configured timeout |
| `SHELL_NON_ZERO` | 502 | External command exited non-zero |
| `SHELL_PARSE_ERROR` | 502 | Scanner stdout was not valid JSON |
| `GITHUB_UNAUTHORIZED` | 401 | `gh` not authenticated |
| `GITHUB_NOT_AVAILABLE` | 503 | `gh` not installed or PR creation failed |
| `HISTORY_IO_ERROR` | 500 | Audit log could not be read or written |
| `INTERNAL_ERROR` | 500 | Unexpected internal error |

## Scanning

Talos invokes `npx --no-install knip --reporter json` and `npx --no-install depcheck --json` against `TALOS_REPO_ROOT`. Results are merged into a single `ScanResult` with a derived health score.

Scanner failures degrade to empty arrays rather than crashing the dashboard — the failure is recorded in the audit log by the calling route.

### Cleanup flow

When `cleanup: true` is sent, the route invokes `.github/scripts/dark-matter/run.sh`. The script:

1. Runs Knip, removes unused files reported.
2. Runs Depcheck, uninstalls unused deps via `npm uninstall`.
3. Writes `.dark-matter/changes_made` with `YES` or `NO`.

When `openPullRequest: true` is also set and changes were made, the route calls the GitHub client to open a PR on a deterministic `chore/dark-matter-<utc-stamp>` branch.

### Panic flow

`POST /api/revert` with a `reason`:

1. Resolves `sha` (or defaults to `HEAD`).
2. Validates the SHA via `git cat-file -e <sha>^{commit}`.
3. Rejects merge commits.
4. Creates `panic/revert-<short-sha>` branch.
5. Runs `git revert --no-edit <sha>`. On failure, runs `git revert --abort` and rethrows.
6. Pushes the branch and opens a recovery PR.
7. Records both successful reverts and partial failures (revert succeeded, PR failed) in the audit log.

## CI workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `smoke-tests.yml` | push / PR to `main` | type-check, unit tests, Playwright smoke |
| `dark-matter.yml` | weekly cron + manual | run cleanup, open PR if changes |
| `panic-button.yml` | `repository_dispatch` + manual | revert a SHA and open recovery PR |

## Safety model

- **Shell execution** goes through one wrapper (`src/infra/shell.ts`) that uses argument arrays (never `shell: true`), enforces timeouts, and rejects commands containing shell metacharacters.
- **`TALOS_DISABLE_SPAWN=1`** short-circuits every shell call. Used by tests and by the Playwright `webServer` config so e2e tests never accidentally run real scanners.
- **Request validation** uses zod schemas with `.strict()` so unknown keys are rejected.
- **History writes** are atomic (temp file + rename) and serialised via a per-instance promise chain so concurrent appends never lose entries.
- **Panic flow** has four safety layers: required reason, SHA format validation, confirmation checkbox, and a confirmation modal that summarises the action before firing.
- **Merge commits** are detected via `git rev-list --parents -n 1` and rejected with a structured error; auto-reverting a merge requires picking a parent, which is a human decision.

## Testing

```bash
npm test           # 57 unit tests, ~1s
npm run test:e2e   # 9 Playwright tests, ~3s
```

Unit tests cover service behaviour with stubbed dependencies. E2E tests cover the real Express pipeline + real browser via Playwright.

See `CONTRIBUTING.md` for the development workflow.
