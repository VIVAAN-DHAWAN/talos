/**
 * GitHub CLI (`gh`) wrapper.
 *
 * - Discovers a token from `GITHUB_TOKEN` or `gh auth token`, in that order.
 * - Surfaces structured errors when `gh` is missing or not authenticated.
 * - Never passes secrets back through return values.
 */

import { config } from '../config/env.js';
import type { CommandRunner, RunOptions } from './shell.js';
import { GitHubNotAvailableError, GitHubUnauthorizedError, ShellNonZeroError } from '../validation/errors.js';

export interface GhPrOptions {
  title: string;
  body: string;
  branch: string;
  base?: string;
}

export interface GhPrResult {
  url: string;
  branch: string;
}

export interface GitHubClient {
  /** Returns a non-empty token or throws a structured error. */
  resolveToken(): Promise<string>;
  /** Returns true if `gh` is installed and authenticated. */
  isAvailable(): Promise<boolean>;
  /** Opens a PR and returns its URL. */
  openPr(opts: GhPrOptions): Promise<GhPrResult>;
}

export class GhCliClient implements GitHubClient {
  constructor(
    private readonly runner: CommandRunner,
    private readonly tokenOverride: string | undefined = config.githubToken
  ) {}

  async resolveToken(): Promise<string> {
    if (this.tokenOverride && this.tokenOverride.length > 0) {
      return this.tokenOverride;
    }
    try {
      const res = await this.runner.run('gh', ['auth', 'token'], { timeoutMs: 5_000 });
      const token = res.stdout.trim();
      if (!token) throw new GitHubUnauthorizedError();
      return token;
    } catch (e) {
      if (e instanceof ShellNonZeroError) {
        // ENOENT on `gh` surfaces as exitCode -1 with the spawn error message.
        if (e.exitCode === -1 && /spawn/i.test(e.stderr)) {
          throw new GitHubNotAvailableError('GitHub CLI (`gh`) is not installed or not on PATH.');
        }
        throw new GitHubUnauthorizedError('`gh auth token` failed. Run `gh auth login`.');
      }
      throw e;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.resolveToken();
      return true;
    } catch {
      return false;
    }
  }

  async openPr(opts: GhPrOptions): Promise<GhPrResult> {
    const token = await this.resolveToken();
    const env: NodeJS.ProcessEnv = { GH_TOKEN: token };
    const args = [
      'pr', 'create',
      '--head', opts.branch,
      '--title', opts.title,
      '--body', opts.body
    ];
    if (opts.base) {
      args.push('--base', opts.base);
    }
    const runOpts: RunOptions = { env, timeoutMs: 30_000 };
    const res = await this.runner.run('gh', args, runOpts);
    const url = res.stdout.trim().split('\n').find((line) => line.startsWith('http'));
    if (!url) {
      throw new GitHubNotAvailableError('`gh pr create` did not return a URL.', { stdout: res.stdout, stderr: res.stderr });
    }
    return { url, branch: opts.branch };
  }
}

/**
 * In-memory stub used by tests and any environment where `gh` is known
 * to be unavailable. Never makes a network call.
 */
export class InMemoryGitHubClient implements GitHubClient {
  public readonly opened: GhPrOptions[] = [];
  private readonly token: string | undefined;

  constructor(opts: { token?: string; available?: boolean } = {}) {
    this.token = opts.token;
    this.available = opts.available ?? true;
  }

  private readonly available: boolean;

  async resolveToken(): Promise<string> {
    if (!this.available) throw new GitHubUnauthorizedError();
    return this.token ?? 'stub-token';
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async openPr(opts: GhPrOptions): Promise<GhPrResult> {
    if (!this.available) throw new GitHubNotAvailableError('GitHub stub is set to unavailable.');
    this.opened.push(opts);
    return { url: `https://github.com/example/repo/pull/${this.opened.length}`, branch: opts.branch };
  }
}
