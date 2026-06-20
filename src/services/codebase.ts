/**
 * Read-only codebase metadata used by `GET /api/status`.
 *
 * All filesystem I/O here is best-effort: a missing package.json or a
 * non-git directory should not 500 the dashboard. Missing data is
 * surfaced as `null`, not as an error.
 */

import * as path from 'node:path';
import { config } from '../config/env.js';
import type { CommandRunner } from '../infra/shell.js';
import { countSourceFiles, readJsonFile } from '../infra/fs.js';

export interface RepoSnapshot {
  name: string;
  root: string;
  headSha: string | null;
  branch: string | null;
  isClean: boolean;
}

export interface PackageSnapshot {
  name: string;
  version: string;
  private: boolean;
}

export interface CodebaseSnapshot {
  repo: RepoSnapshot;
  package: PackageSnapshot;
  sourceFileCount: number;
}

export class CodebaseService {
  constructor(
    private readonly runner: CommandRunner,
    private readonly repoRoot: string = config.repoRoot
  ) {}

  async snapshot(): Promise<CodebaseSnapshot> {
    const [pkg, repo, sourceFileCount] = await Promise.all([
      this.readPackage(),
      this.readRepoState(),
      countSourceFiles(path.join(this.repoRoot, 'src'))
    ]);
    return { repo, package: pkg, sourceFileCount };
  }

  private async readPackage(): Promise<PackageSnapshot> {
    const fallback: PackageSnapshot = { name: 'unknown', version: '0.0.0', private: true };
    const pkgPath = path.join(this.repoRoot, 'package.json');
    const pkg = await readJsonFile<Partial<{ name: string; version: string; private: boolean }>>(pkgPath, fallback);
    return {
      name: typeof pkg.name === 'string' ? pkg.name : fallback.name,
      version: typeof pkg.version === 'string' ? pkg.version : fallback.version,
      private: typeof pkg.private === 'boolean' ? pkg.private : true
    };
  }

  private async readRepoState(): Promise<RepoSnapshot> {
    const name = path.basename(this.repoRoot);
    const base: RepoSnapshot = { name, root: this.repoRoot, headSha: null, branch: null, isClean: false };
    if (config.disableSpawn) return base;
    try {
      const [sha, branch, status] = await Promise.all([
        this.runner.run('git', ['rev-parse', 'HEAD'], { timeoutMs: 3_000 }).then((r) => r.stdout.trim()).catch(() => null),
        this.runner.run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 3_000 }).then((r) => r.stdout.trim()).catch(() => null),
        this.runner.run('git', ['status', '--porcelain'], { timeoutMs: 3_000 }).then((r) => r.stdout.trim().length === 0).catch(() => false)
      ]);
      return { name, root: this.repoRoot, headSha: sha, branch, isClean: status };
    } catch {
      return base;
    }
  }
}
