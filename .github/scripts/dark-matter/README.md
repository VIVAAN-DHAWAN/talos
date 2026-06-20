# Dark Matter Cleaner

A scheduled GitHub Actions workflow that scans the repo for unused code and dependencies,
applies safe removals, and opens a PR for human review.

## How it works

1. `.github/workflows/dark-matter.yml` defines a workflow that runs:
   - On a weekly schedule (cron), or
   - When manually dispatched (`workflow_dispatch`).
2. `run.sh` detects the stack and runs the matching tools.
   Today: Node/TypeScript via [`knip`](https://knip.dev) and
   [`depcheck`](https://github.com/depcheck/depcheck).
3. `open-pr.sh` commits the changes to a fresh `chore/dark-matter-<timestamp>`
   branch and opens a PR against `main` using the GitHub CLI (`gh`).

## One-time setup

1. **Provide a GitHub Token**:
   - The workflow uses the built-in `GITHUB_TOKEN` to push branches and open PRs.
   - Ensure the repository settings allow GitHub Actions to create and approve pull requests (Settings > Actions > General > Workflow permissions > check "Read and write permissions" and "Allow GitHub Actions to create and approve pull requests").
   - Alternatively, you can configure a Personal Access Token (PAT) with `repo` scopes and add it as a repository secret named `GITHUB_TOKEN`.

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

Infrastructure is in place. The weekly scheduled run is configured to run automatically.
