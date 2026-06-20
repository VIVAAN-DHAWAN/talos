# Contributing to Talos

Talos is a small, deliberately modular codebase. The guidelines below keep it that way as it grows.

## Project layout

See the README for the full tree. The short version:

- `src/` — backend, split into `config`, `types`, `infra`, `validation`, `services`, `routes`.
- `public/` — frontend, plain HTML + CSS + ES modules (no build step).
- `tests/unit/` — vitest, focused on one abstraction per file.
- `tests/e2e/` — Playwright, boots the real server.
- `.github/scripts/` — shell scripts invoked by the backend or by CI.
- `.github/workflows/` — CI workflows.

## Development setup

```bash
git clone <repo>
cd talos
npm install
npm run dev          # tsx watch, hot reload
```

The dev server listens on `http://127.0.0.1:3000`.

For running tests without spawning real scanners:

```bash
TALOS_DISABLE_SPAWN=1 npm test
TALOS_DISABLE_SPAWN=1 npm run test:e2e
```

## Architectural rules

### Backend

1. **No business logic in route handlers.** Routes validate input, call a service, map errors to HTTP. Nothing else.
2. **No direct `child_process` calls.** Everything goes through `src/infra/shell.ts`. New shell calls must use argument arrays and pass through the `CommandRunner` interface so they can be mocked.
3. **Services accept their dependencies via constructor injection.** A service that needs to run shell commands takes a `CommandRunner`. A service that needs to open PRs takes a `GitHubClient`. This is what makes the unit tests fast.
4. **Errors are typed.** Throw a subclass of `TalosError` with a stable `code`. Route handlers rely on the code mapping to HTTP status; do not parse error messages.
5. **History writes are atomic and serialised.** Never write to `.dark-matter/history.json` directly — go through `FileHistoryStore`.
6. **No `any`.** `strict` is on, `noUncheckedIndexedAccess` is on. If you need an escape hatch, justify it in a comment.

### Frontend

1. **Plain JS modules.** The browser loads `public/js/*.js` directly with no transpilation. Do not introduce TypeScript syntax (generics, type annotations) in frontend files. If you need types, write them as JSDoc.
2. **One responsibility per module.** `tabs.js` does tabs. `panic.js` does the panic panel. `state.js` is the store. Do not add unrelated code to an existing module.
3. **No inline event handlers.** Bind listeners in JS, not in HTML attributes.
4. **Accessibility is required.** New UI must:
   - Use semantic elements (`<button>`, `<nav>`, `<dialog>`-equivalent via `role="dialog"`).
   - Have visible focus states.
   - Be operable by keyboard (arrow keys for tablists, Esc for modals, Enter/Space for buttons).
   - Use `aria-live` for status updates that screen readers should announce.
5. **No glow effects.** The design language is calm dark with one accent (`--accent`). New components should reuse CSS variables from `:root`, not introduce new colors.

### Shell scripts

1. **`set -euo pipefail`** at the top of every script.
2. **Resolve `REPO_ROOT` from script location**, not from `pwd`. Scripts may be invoked from any cwd.
3. **No `cd` outside the resolved repo root.**
4. **Machine-parseable output.** Scripts emit a final line like `CHANGES_MADE=YES` or `PR_URL=https://...` so the backend can extract structured data without regex on prose.
5. **Validate inputs.** SHAs are checked via `git cat-file -e`. Branch names are deterministic. Merge commits are rejected.
6. **No force-push.** Pushes are `git push -u origin <branch>` only.

### Tests

1. **Unit tests use stubs, not real shell.** Inject `StubRunner` and `StubGitHub` from `tests/unit/_fixtures.ts`. Do not mock at the module level.
2. **One assertion concept per test.** If a test is checking more than one logical thing, split it.
3. **Test behaviour, not implementation.** Assert on the public return value or the HTTP response, not on which internal methods were called.
4. **E2E tests assume `TALOS_DISABLE_SPAWN=1`.** The Playwright config sets this. Do not write an e2e test that depends on real `gh` or real Knip output.
5. **Keep tests fast.** Unit tests should run in under 2s total. If a test sleeps, it's wrong.

## Commit messages

Use Conventional Commits:

```
<type>(<scope>): <subject>

Why
<one paragraph>

What changed
<bullet list>

Validation
<how you verified>

Notes / follow-ups
<if needed>
```

Types: `feat`, `fix`, `test`, `chore`, `docs`, `refactor`.

Scopes: `backend`, `frontend`, `scripts`, `workflows`, `test`, `docs`.

## Pull request body

Same structure as the commit body. Be specific about architecture, behaviour, and verification. Do not write a generic "I improved things" summary.

## Before opening a PR

```bash
npm run build         # tsc, must be clean
npm test              # 57 unit tests, must pass
npm run test:e2e      # 9 e2e tests, must pass
```

If your change touches `.github/scripts/`, also run `bash -n <script>` to syntax-check.

If your change touches the frontend, open the dashboard in a browser and verify:
- The relevant tab works.
- Keyboard navigation still works (Tab, Arrow keys, Esc on modals).
- No console errors.
- Responsive layout at <900px still looks right.

## Adding a new scanner

Talos is designed to grow additional ecosystems beyond Knip + Depcheck. To add a new scanner:

1. Add a parser in `src/infra/<tool>.ts` with a `parse<Tool>Stdout` function that returns a typed result.
2. Extend `ScanResult` in `src/types/scan.ts` if the new scanner surfaces a new category of finding.
3. Add a private `run<Tool>` method to `ScanService` that calls the runner and parses stdout.
4. Wire it into `ScanService.analyze`. Catch `ShellNonZeroError` so the dashboard degrades gracefully when the tool is not installed.
5. Add a unit test in `tests/unit/parsers.test.ts` for the new parser.
6. Add a unit test in `tests/unit/scan-service.test.ts` for the integration.

Do not add the new tool to the shell scripts in `.github/scripts/dark-matter/` unless it should also run in CI cleanup. If it should, update `run.sh` to call it and write a `.dark-matter/<tool>.json` artifact.

## Adding a new route

1. Add the request/response types to `src/types/api.ts`.
2. Add a zod schema in `src/validation/schemas.ts` if the route accepts a body.
3. Write the handler in `src/routes/index.ts` as a thin controller. Call a service, map errors.
4. Register the route in `src/app.ts`.
5. Add a unit test in `tests/unit/routes.test.ts` using the real Express pipeline (see existing tests for the pattern).
6. Update `README.md`'s API table.

## Licensing

By contributing, you agree that your contributions are licensed under the project's MIT license.
