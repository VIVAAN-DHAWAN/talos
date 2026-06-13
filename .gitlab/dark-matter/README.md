# Dark Matter cleaner

A scheduled GitLab CI job that scans the repo for unused code and dependencies,
applies safe removals, and opens an MR for human review.

## How it works

1. `.gitlab-ci.yml` defines a `dark-matter` job that runs only when:
   - `CI_PIPELINE_SOURCE == "schedule"`, **and**
   - the schedule sets the variable `DARK_MATTER=1`.
2. `run.sh` detects the stack and runs the matching tools.
   Today: Node/TypeScript via [`knip`](https://knip.dev) and
   [`depcheck`](https://github.com/depcheck/depcheck).
3. `open-mr.sh` commits the changes to a fresh `chore/dark-matter-<timestamp>`
   branch and opens an MR against `main` via the GitLab REST API.

## One-time setup

1. **Create a project access token**
   - Settings > Access tokens
   - Role: `Developer` (or higher)
   - Scopes: `api`, `write_repository`
2. **Add it as a CI/CD variable**
   - Settings > CI/CD > Variables
   - Key: `DARK_MATTER_TOKEN`
   - Type: Variable, **Masked**, **Protected** off (so it works on the bot branch)
3. **Create the schedule**
   - Build > Pipeline schedules > New schedule
   - Cron: `0 3 * * 1` (Mondays 03:00 UTC) or your preference
   - Target branch: `main`
   - Variable: `DARK_MATTER` = `1`

## Extending to more stacks

Add a new block in `run.sh` guarded by a file probe, for example:

```bash
if [[ -f pyproject.toml ]]; then
  # vulture, deptry, ...
fi
if [[ -f go.mod ]]; then
  # deadcode, go mod tidy, ...
fi
```

Keep removals conservative — the human reviewer is the final gate.

## Status

Infrastructure is in place. The first scheduled run will only happen after the
one-time setup (token + schedule) above is completed.
