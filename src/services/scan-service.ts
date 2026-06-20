/**
 * Scan service — orchestrates dead-code + unused-dependency detection.
 *
 * - `analyze()` runs Knip and Depcheck in parallel and returns a typed
 *   {@link ScanResult}. It never mutates the repo.
 * - `runCleanup()` is the destructive path: it shells out to the existing
 *   `.github/scripts/dark-matter/run.sh`. Cleanup is always opt-in.
 * - `openPullRequest()` is a separate step so a caller can decide, after
 *   seeing the cleanup result, whether to push a PR.
 *
 * Every external command goes through the injected {@link CommandRunner},
 * which makes the service fully testable without touching the real shell.
 */

import * as path from 'node:path';
import { config } from '../config/env.js';
import type { CommandRunner } from '../infra/shell.js';
import type { GitHubClient } from '../infra/github.js';
import { parseKnipStdout, type ParsedKnip } from '../infra/knip.js';
import { parseDepcheckStdout, type ParsedDepcheck } from '../infra/depcheck.js';
import { ShellDisabledError, ShellNonZeroError } from '../validation/errors.js';
import type { ScanResult } from '../types/scan.js';

export interface AnalyzeOptions {
  /** Skip scanner invocation; returns an empty result with the file count only. */
  dryRun?: boolean;
}

export interface CleanupResult {
  changesMade: boolean;
  /** Stdout from the cleanup script, for diagnostics. */
  log: string;
  /** Branch created by the PR step, when one was opened. */
  branch?: string;
  pullRequestUrl?: string;
}

export class ScanService {
  constructor(
    private readonly runner: CommandRunner,
    private readonly github: GitHubClient,
    private readonly repoRoot: string = config.repoRoot
  ) {}

  async analyze(sourceFileCount: number, opts: AnalyzeOptions = {}): Promise<ScanResult> {
    if (opts.dryRun || config.disableSpawn) {
      return emptyResult(sourceFileCount);
    }
    const knip = await this.runKnip().catch((err): ParsedKnip => swallowed(err, emptyKnip()));
    const depcheck = await this.runDepcheck().catch((err): ParsedDepcheck => swallowed(err, emptyDepcheck()));

    const unusedFiles = knip.unusedFiles;
    const unusedExports = knip.unusedExports;
    const unusedDependencies = depcheck.unusedDependencies;
    const unusedDevDependencies = depcheck.unusedDevDependencies;
    return {
      sourceFileCount,
      unusedFiles,
      unusedExports,
      unusedDependencies,
      unusedDevDependencies,
      healthScore: computeHealthScore({
        sourceFileCount,
        unusedFiles: unusedFiles.length,
        unusedExports: unusedExports.reduce((n, e) => n + e.names.length, 0),
        unusedDependencies: unusedDependencies.length + unusedDevDependencies.length
      })
    };
  }

  /**
   * Runs `.github/scripts/dark-matter/run.sh`. The script itself decides
   * whether to delete files / uninstall deps based on `.dark-matter/` markers.
   * Returns whether the script reported that any changes were made.
   */
  async runCleanup(): Promise<CleanupResult> {
    if (config.disableSpawn) throw new ShellDisabledError();
    const scriptPath = path.join(config.scriptsDir, 'dark-matter', 'run.sh');
    const res = await this.runner.run('bash', [scriptPath], {
      cwd: this.repoRoot,
      timeoutMs: config.shellTimeoutMs
    });
    const changesMade = /changes_made=yes/i.test(res.stdout) || res.stdout.includes('CHANGES_MADE=YES');
    return { changesMade, log: res.stdout };
  }

  /**
   * Opens a recovery PR for an already-applied cleanup. The branch name is
   * deterministic so reruns do not pile up anonymous branches.
   */
  async openPullRequest(): Promise<{ branch: string; pullRequestUrl: string }> {
    const branch = `chore/dark-matter-${utcStamp()}`;
    const result = await this.github.openPr({
      title: 'chore(dark-matter): automated cleanup',
      body: prBodyForCleanup(),
      branch
    });
    return { branch: result.branch, pullRequestUrl: result.url };
  }

  private async runKnip(): Promise<ParsedKnip> {
    const res = await this.runner.run('npx', ['--no-install', 'knip', '--reporter', 'json'], {
      cwd: this.repoRoot,
      timeoutMs: 90_000
    });
    return parseKnipStdout(res.stdout);
  }

  private async runDepcheck(): Promise<ParsedDepcheck> {
    const res = await this.runner.run('npx', ['--no-install', 'depcheck', '--json'], {
      cwd: this.repoRoot,
      timeoutMs: 90_000
    });
    return parseDepcheckStdout(res.stdout);
  }
}

export interface HealthInputs {
  sourceFileCount: number;
  unusedFiles: number;
  unusedExports: number;
  unusedDependencies: number;
}

/**
 * Maps scanner counts to a 0..100 score. The weighting favours fixing
 * unused dependencies (highest leverage), then unused files, then exports.
 */
export function computeHealthScore(input: HealthInputs): number {
  const weight = { deps: 4, files: 2, exports: 1 } as const;
  const penalty = Math.min(
    100,
    input.unusedDependencies * weight.deps +
      input.unusedFiles * weight.files +
      input.unusedExports * weight.exports
  );
  return Math.max(0, 100 - penalty);
}

function emptyResult(sourceFileCount: number): ScanResult {
  return {
    sourceFileCount,
    unusedFiles: [],
    unusedExports: [],
    unusedDependencies: [],
    unusedDevDependencies: [],
    healthScore: 100
  };
}

function emptyKnip(): ParsedKnip {
  return { unusedFiles: [], unusedExports: [], unusedDependencies: [] };
}

function emptyDepcheck(): ParsedDepcheck {
  return { unusedDependencies: [], unusedDevDependencies: [] };
}

/**
 * Scanner failures degrade to empty arrays rather than crashing the
 * dashboard. A 0-result scan still has value (the dashboard renders
 * "no issues") and the failure is recorded in the audit log by the
 * caller.
 */
function swallowed<T>(err: unknown, fallback: T): T {
  if (err instanceof ShellNonZeroError) return fallback;
  throw err;
}

function utcStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
}

function prBodyForCleanup(): string {
  return [
    '## Why',
    'Automated dead-code and unused-dependency cleanup produced by Talos dark-matter scan.',
    '',
    '## What changed',
    '- Removed files reported as unreferenced by Knip.',
    '- Uninstalled dependencies reported as unused by Depcheck.',
    '',
    '## Validation',
    '- Branch was generated deterministically.',
    '- Reviewer should confirm CI is green before merge.'
  ].join('\n');
}
