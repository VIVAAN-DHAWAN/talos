/**
 * Common test fixtures: in-memory command runner, stub GitHub client,
 * tmp history store factory.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CommandRunner, RunOptions, RunResult } from '../../src/infra/shell.js';
import type { GitHubClient, GhPrOptions, GhPrResult } from '../../src/infra/github.js';

export interface StubCommand {
  command: string;
  args: readonly string[];
  opts?: RunOptions;
}

export class StubRunner implements CommandRunner {
  public readonly calls: StubCommand[] = [];
  private responses = new Map<string, (cmd: StubCommand) => RunResult | Promise<RunResult> | Error>();
  public defaultResponse: RunResult = { stdout: '', stderr: '', exitCode: 0, command: '' };

  /**
   * Registers a handler keyed by a substring of the joined command line.
   * The first registered matcher whose key is a substring of the actual
   * command wins. This lets tests write expressive matchers like
   * `runner.when('npx knip', ...)` or `runner.when('git revert', ...)`.
   */
  when(matcher: string, fn: (cmd: StubCommand) => RunResult | Promise<RunResult> | Error): this {
    this.responses.set(matcher, fn);
    return this;
  }

  async run(command: string, args: readonly string[], opts: RunOptions = {}): Promise<RunResult> {
    const call: StubCommand = { command, args, opts };
    this.calls.push(call);
    const fullCmd = `${command} ${args.join(' ')}`;
    for (const [matcher, fn] of this.responses) {
      if (fullCmd.includes(matcher)) {
        const result = fn(call);
        if (result instanceof Error) throw result;
        return result;
      }
    }
    return { ...this.defaultResponse, command: fullCmd };
  }
}

export class StubGitHub implements GitHubClient {
  public readonly opened: GhPrOptions[] = [];
  constructor(
    private readonly token = 'stub-token',
    private readonly available = true,
    private readonly prUrl = (i: number) => `https://github.com/example/repo/pull/${i}`
  ) {}

  async resolveToken(): Promise<string> {
    if (!this.available) throw new Error('GitHub stub unavailable');
    return this.token;
  }
  async isAvailable(): Promise<boolean> { return this.available; }
  async openPr(opts: GhPrOptions): Promise<GhPrResult> {
    if (!this.available) throw new Error('GitHub stub unavailable');
    this.opened.push(opts);
    return { url: this.prUrl(this.opened.length), branch: opts.branch };
  }
}

/** Creates a unique tmp dir; returns the dir and a cleanup function. */
export function tmpDir(prefix = 'talos-test-'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
