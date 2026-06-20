/**
 * Typed application configuration resolved from environment variables.
 *
 * Centralises every env-driven knob so the rest of the codebase consumes
 * a single frozen `config` object instead of reading `process.env` ad hoc.
 * Defaults are tuned for local development; CI overrides via env.
 */

const PORT_DEFAULT = 3000;

function readPort(raw: string | undefined): number {
  if (!raw) return PORT_DEFAULT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`PORT must be an integer in 1..65535, got: ${raw}`);
  }
  return n;
}

export interface AppConfig {
  /** HTTP listen port. */
  readonly port: number;
  /** NODE_ENV-derived runtime mode. */
  readonly env: 'production' | 'test' | 'development';
  /** Root of the repository being inspected (defaults to cwd). */
  readonly repoRoot: string;
  /** Where the audit history file lives. */
  readonly historyPath: string;
  /** Directory used for scan artifacts (summary, changes_made). */
  readonly darkMatterDir: string;
  /** Optional pre-resolved GitHub token. Bypasses `gh auth token`. */
  readonly githubToken: string | undefined;
  /** Default timeout for shell invocations, in milliseconds. */
  readonly shellTimeoutMs: number;
  /** When true, the server refuses to spawn child processes. Used in tests and smoke runs. */
  readonly disableSpawn: boolean;
  /** Where the dark-matter helper scripts live. */
  readonly scriptsDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const repoRoot = env.TALOS_REPO_ROOT ?? process.cwd();
  const darkMatterDir = env.TALOS_DARK_MATTER_DIR ?? `${repoRoot}/.dark-matter`;
  return {
    port: readPort(env.PORT),
    env: (env.NODE_ENV as AppConfig['env']) ?? 'development',
    repoRoot,
    historyPath: env.TALOS_HISTORY_PATH ?? `${darkMatterDir}/history.json`,
    darkMatterDir,
    githubToken: env.GITHUB_TOKEN && env.GITHUB_TOKEN.length > 0 ? env.GITHUB_TOKEN : undefined,
    shellTimeoutMs: env.TALOS_SHELL_TIMEOUT_MS ? Number.parseInt(env.TALOS_SHELL_TIMEOUT_MS, 10) : 60_000,
    disableSpawn: env.TALOS_DISABLE_SPAWN === '1',
    scriptsDir: env.TALOS_SCRIPTS_DIR ?? `${repoRoot}/.github/scripts`
  };
}

export const config = loadConfig();
