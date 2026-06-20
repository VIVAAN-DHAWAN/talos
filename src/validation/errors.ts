/**
 * Typed error hierarchy used across services and routes.
 *
 * Each error carries a stable `code` so route handlers can map to the right
 * HTTP status without inspecting the message string.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SHELL_DISABLED'
  | 'SHELL_TIMEOUT'
  | 'SHELL_NON_ZERO'
  | 'SHELL_PARSE_ERROR'
  | 'GITHUB_UNAUTHORIZED'
  | 'GITHUB_NOT_AVAILABLE'
  | 'HISTORY_IO_ERROR'
  | 'INTERNAL_ERROR';

export class TalosError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message: string, opts: { httpStatus?: number; details?: unknown; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.details = opts.details;
    this.httpStatus = opts.httpStatus ?? 500;
    // Restore prototype chain after subclassing Error in ES5-target transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends TalosError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, { httpStatus: 400, details });
  }
}

export class ShellDisabledError extends TalosError {
  constructor(message = 'Shell execution is disabled in this environment.') {
    super('SHELL_DISABLED', message, { httpStatus: 403 });
  }
}

export class ShellTimeoutError extends TalosError {
  constructor(cmd: string, ms: number) {
    super('SHELL_TIMEOUT', `Command timed out after ${ms}ms: ${cmd}`, { httpStatus: 504 });
  }
}

export class ShellNonZeroError extends TalosError {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  constructor(cmd: string, exitCode: number, stdout: string, stderr: string) {
    super('SHELL_NON_ZERO', `Command exited ${exitCode}: ${cmd}`, {
      httpStatus: 502,
      details: { cmd, exitCode, stdout: stdout.slice(0, 4_000), stderr: stderr.slice(0, 4_000) }
    });
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export class ShellParseError extends TalosError {
  constructor(cmd: string, message: string, stdout: string) {
    super('SHELL_PARSE_ERROR', `${cmd} did not emit parseable output: ${message}`, {
      httpStatus: 502,
      details: { cmd, stdout: stdout.slice(0, 4_000) }
    });
  }
}

export class GitHubNotAvailableError extends TalosError {
  constructor(message: string, details?: unknown) {
    super('GITHUB_NOT_AVAILABLE', message, { httpStatus: 503, details });
  }
}

export class GitHubUnauthorizedError extends TalosError {
  constructor(message = 'GitHub CLI is not authenticated.') {
    super('GITHUB_UNAUTHORIZED', message, { httpStatus: 401 });
  }
}

export class HistoryIoError extends TalosError {
  constructor(message: string, cause?: unknown) {
    super('HISTORY_IO_ERROR', message, { httpStatus: 500, cause });
  }
}

export function isTalosError(e: unknown): e is TalosError {
  return e instanceof TalosError;
}
