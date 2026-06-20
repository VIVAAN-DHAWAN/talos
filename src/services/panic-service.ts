/**
 * Panic recovery service — reverts a commit and optionally opens a
 * recovery PR.
 *
 * Design rules:
 *   - SHA is validated against `git cat-file -e <sha>^{commit}` before
 *     anything destructive happens. An invalid SHA returns a structured
 *     error and never reaches `git revert`.
 *   - The actual revert and the PR creation are two distinct steps. A
 *     caller can run the revert alone (e.g. in a workflow that opens the
 *     PR itself), or chain both.
 *   - Merge commits are detected and rejected explicitly. `git revert`
 *     on a merge commit needs `-m`, and auto-passing that mask is the
 *     kind of decision a human should make.
 *   - Branch names are deterministic so repeated panic on the same SHA
 *     collide on the remote instead of producing duplicate PRs.
 */

import { config } from '../config/env.js';
import type { CommandRunner } from '../infra/shell.js';
import type { GitHubClient } from '../infra/github.js';
import {
  ShellDisabledError,
  ShellNonZeroError,
  ValidationError
} from '../validation/errors.js';

export interface RevertPlan {
  sha: string;
  isMerge: boolean;
}

export interface RevertOutcome {
  sha: string;
  branch: string;
  log: string;
}

export class PanicService {
  constructor(
    private readonly runner: CommandRunner,
    private readonly github: GitHubClient,
    private readonly repoRoot: string = config.repoRoot
  ) {}

  /**
   * Resolves a request SHA to a concrete commit. If `sha` is omitted,
   * returns `HEAD`. Validates that the SHA exists and is not a merge
   * commit before returning.
   */
  async planRevert(sha: string | undefined): Promise<RevertPlan> {
    if (config.disableSpawn) throw new ShellDisabledError();
    const resolved = sha ? await this.resolveSha(sha) : await this.resolveHead();
    const isMerge = await this.isMergeCommit(resolved);
    if (isMerge) {
      throw new ValidationError(
        `Commit ${resolved} is a merge commit. Reverting a merge requires specifying a parent; refusing to auto-revert.`,
        { sha: resolved }
      );
    }
    return { sha: resolved, isMerge };
  }

  /**
   * Performs `git revert <sha>` on a fresh branch. Does not push and
   * does not open a PR — use {@link openRecoveryPr} for that.
   */
  async performRevert(plan: RevertPlan): Promise<RevertOutcome> {
    if (config.disableSpawn) throw new ShellDisabledError();
    const branch = `panic/revert-${plan.sha.slice(0, 12)}`;
    // Create / checkout the branch in one call. `-B` resets an existing
    // branch to the current HEAD, which is the desired behaviour here:
    // a repeat panic on the same SHA should produce a clean replay, not
    // a divergent branch.
    await this.runner.run('git', ['checkout', '-B', branch], { cwd: this.repoRoot, timeoutMs: 5_000 });
    try {
      const res = await this.runner.run(
        'git',
        ['revert', '--no-edit', plan.sha],
        { cwd: this.repoRoot, timeoutMs: 30_000 }
      );
      return { sha: plan.sha, branch, log: res.stdout };
    } catch (err) {
      // Abort the in-progress revert so the working tree is clean for
      // the next attempt. Failure to abort is logged but not raised —
      // the original error is more useful to the operator.
      await this.runner
        .run('git', ['revert', '--abort'], { cwd: this.repoRoot, timeoutMs: 5_000 })
        .catch(() => undefined);
      throw err;
    }
  }

  /**
   * Pushes the branch and opens a recovery PR. Separate from
   * {@link performRevert} so a caller can inspect the local revert
   * before publishing it.
   */
  async openRecoveryPlan(plan: RevertPlan, outcome: RevertOutcome, reason: string): Promise<{ branch: string; pullRequestUrl: string }> {
    if (config.disableSpawn) throw new ShellDisabledError();
    await this.runner.run('git', ['push', '-u', 'origin', outcome.branch], {
      cwd: this.repoRoot,
      timeoutMs: 30_000,
      env: { GIT_TERMINAL_PROMPT: '0' }
    });
    const pr = await this.github.openPr({
      title: `panic: revert ${plan.sha.slice(0, 12)}`,
      body: renderRevertPrBody(plan, reason),
      branch: outcome.branch
    });
    return { branch: pr.branch, pullRequestUrl: pr.url };
  }

  private async resolveSha(sha: string): Promise<string> {
    // `git rev-parse` validates format and resolves abbreviations.
    let fullSha: string;
    try {
      const res = await this.runner.run('git', ['rev-parse', sha], { cwd: this.repoRoot, timeoutMs: 3_000 });
      fullSha = res.stdout.trim();
    } catch {
      throw new ValidationError(`Could not resolve SHA: ${sha}`, { sha });
    }
    // Confirm it points at an actual commit object.
    try {
      await this.runner.run('git', ['cat-file', '-e', `${fullSha}^{commit}`], { cwd: this.repoRoot, timeoutMs: 3_000 });
    } catch {
      throw new ValidationError(`SHA does not point at a commit: ${sha}`, { sha: fullSha });
    }
    return fullSha;
  }

  private async resolveHead(): Promise<string> {
    const res = await this.runner.run('git', ['rev-parse', 'HEAD'], { cwd: this.repoRoot, timeoutMs: 3_000 });
    return res.stdout.trim();
  }

  private async isMergeCommit(sha: string): Promise<boolean> {
    try {
      const res = await this.runner.run(
        'git',
        ['rev-list', '--parents', '-n', '1', sha],
        { cwd: this.repoRoot, timeoutMs: 3_000 }
      );
      // Output format: "<sha> <parent1> [<parent2> ...]". More than 2
      // whitespace-separated tokens means more than one parent.
      return res.stdout.trim().split(/\s+/).length > 2;
    } catch (err) {
      if (err instanceof ShellNonZeroError) return false;
      throw err;
    }
  }
}

function renderRevertPrBody(plan: RevertPlan, reason: string): string {
  return [
    '## Why',
    `Operator-initiated panic revert of \`${plan.sha}\`.`,
    '',
    '## Reason',
    '```',
    reason,
    '```',
    '',
    '## What changed',
    `- Reverts commit ${plan.sha}.`,
    '- Branch was created deterministically from the reverted SHA.',
    '',
    '## Validation',
    '- Reviewer should confirm CI is green before merge.',
    '- Reviewer should confirm the revert does not silently re-open a fixed vulnerability.'
  ].join('\n');
}
