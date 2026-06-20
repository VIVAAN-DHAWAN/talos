/**
 * Safe shell execution wrapper.
 *
 * Every external command goes through this module. It enforces:
 *   - argument-array invocation (no `shell: true`, no string concatenation)
 *   - per-command timeouts
 *   - structured errors via {@link ShellNonZeroError} / {@link ShellTimeoutError}
 *   - a global kill switch via `config.disableSpawn` for test/smoke environments
 *
 * The interface is intentionally minimal so services can inject a mock
 * implementation in unit tests.
 */

import { spawn } from 'node:child_process';
import { config } from '../config/env.js';
import {
  ShellDisabledError,
  ShellNonZeroError,
  ShellTimeoutError,
  type TalosError
} from '../validation/errors.js';

export interface RunOptions {
  /** Working directory. Defaults to `config.repoRoot`. */
  cwd?: string;
  /** Per-command timeout in ms. Defaults to `config.shellTimeoutMs`. */
  timeoutMs?: number;
  /** Environment overrides merged on top of `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Extra args to pass to the binary. Always an array — never a string. */
  args?: readonly string[];
  /** When false, suppress the kill switch even if `TALOS_DISABLE_SPAWN=1`. For tests. */
  bypassDisableFlag?: boolean;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Command actually executed, for logging and error messages. */
  command: string;
}

export interface CommandRunner {
  run(command: string, args: readonly string[], opts?: RunOptions): Promise<RunResult>;
}

export class ShellRunner implements CommandRunner {
  constructor(private readonly defaultCwd: string = config.repoRoot) {}

  async run(command: string, args: readonly string[], opts: RunOptions = {}): Promise<RunResult> {
    if (config.disableSpawn && !opts.bypassDisableFlag) {
      throw new ShellDisabledError();
    }
    const cwd = opts.cwd ?? this.defaultCwd;
    const timeoutMs = opts.timeoutMs ?? config.shellTimeoutMs;
    const env = { ...process.env, ...(opts.env ?? {}) };

    // Reject anything that looks like an attempt to use a shell metacharacter
    // as part of a binary path. Argument-array invocation already prevents
    // injection inside args; this is a defensive guard against misuse.
    if (/[;&|<>`$]/.test(command)) {
      throw new ShellNonZeroError(command, -1, '', 'Refusing to execute command with shell metacharacters.');
    }

    return new Promise<RunResult>((resolve, reject) => {
      const child = spawn(command, [...args, ...(opts.args ?? [])], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Escalate if SIGTERM does not produce exit within 2s.
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 2_000).unref();
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(
          new ShellNonZeroError(`${command} ${args.join(' ')}`, -1, stdout, stderr.length ? stderr : err.message)
        );
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const fullCommand = `${command} ${[...args, ...(opts.args ?? [])].join(' ')}`;
        if (timedOut) {
          reject(new ShellTimeoutError(fullCommand, timeoutMs));
          return;
        }
        if (code !== 0) {
          reject(new ShellNonZeroError(fullCommand, code ?? -1, stdout, stderr));
          return;
        }
        resolve({ stdout, stderr, exitCode: 0, command: fullCommand });
      });
    });
  }
}

/**
 * Convenience helper for tests and small scripts. Prefer injecting a
 * `CommandRunner` into services.
 */
export async function runCommand(
  command: string,
  args: readonly string[],
  opts?: RunOptions
): Promise<RunResult> {
  return new ShellRunner().run(command, args, opts);
}

export type { TalosError };
