import { describe, it, expect, beforeEach } from 'vitest';
import { ScanService, computeHealthScore } from '../../src/services/scan-service.js';
import { StubRunner, StubGitHub } from './_fixtures.js';
import { ShellNonZeroError } from '../../src/validation/errors.js';
import { config } from '../../src/config/env.js';

describe('computeHealthScore', () => {
  it('returns 100 for a clean repo', () => {
    expect(computeHealthScore({ sourceFileCount: 50, unusedFiles: 0, unusedExports: 0, unusedDependencies: 0 })).toBe(100);
  });

  it('penalises unused deps more than files more than exports', () => {
    const withDeps = computeHealthScore({ sourceFileCount: 50, unusedFiles: 0, unusedExports: 0, unusedDependencies: 5 });
    const withFiles = computeHealthScore({ sourceFileCount: 50, unusedFiles: 5, unusedExports: 0, unusedDependencies: 0 });
    const withExports = computeHealthScore({ sourceFileCount: 50, unusedFiles: 0, unusedExports: 5, unusedDependencies: 0 });
    expect(withDeps).toBeLessThan(withFiles);
    expect(withFiles).toBeLessThan(withExports);
  });

  it('clamps to 0 minimum', () => {
    expect(computeHealthScore({ sourceFileCount: 50, unusedFiles: 100, unusedExports: 100, unusedDependencies: 100 })).toBe(0);
  });
});

describe('ScanService.analyze', () => {
  let runner: StubRunner;
  let github: StubGitHub;
  let service: ScanService;

  beforeEach(() => {
    runner = new StubRunner();
    github = new StubGitHub();
    service = new ScanService(runner, github);
    // Ensure spawn is allowed for these tests.
    (config as { disableSpawn: boolean }).disableSpawn = false;
  });

  it('returns empty result in dryRun mode without touching the shell', async () => {
    const res = await service.analyze(42, { dryRun: true });
    expect(res.unusedFiles).toEqual([]);
    expect(res.sourceFileCount).toBe(42);
    expect(res.healthScore).toBe(100);
    expect(runner.calls.length).toBe(0);
  });

  it('parses knip + depcheck output and computes health score', async () => {
    runner.when('knip', () => ({
      stdout: JSON.stringify({
        files: [{ path: 'src/dead.ts' }],
        exports: [{ file: 'src/foo.ts', names: ['unused'] }],
        dependencies: [{ name: 'leftpad' }]
      }),
      stderr: '',
      exitCode: 0,
      command: 'knip'
    }));
    runner.when('depcheck', () => ({
      stdout: JSON.stringify({ dependencies: ['leftpad'] }),
      stderr: '',
      exitCode: 0,
      command: 'depcheck'
    }));
    const res = await service.analyze(10);
    expect(res.unusedFiles).toEqual(['src/dead.ts']);
    expect(res.unusedExports).toEqual([{ file: 'src/foo.ts', names: ['unused'] }]);
    expect(res.unusedDependencies).toEqual(['leftpad']);
    expect(res.healthScore).toBeLessThan(100);
  });

  it('degrades to empty arrays when knip exits non-zero', async () => {
    runner.when('knip', () => new ShellNonZeroError('knip', 1, '', 'no issues'));
    runner.when('depcheck', () => new ShellNonZeroError('depcheck', 1, '', 'no issues'));
    const res = await service.analyze(10);
    expect(res.unusedFiles).toEqual([]);
    expect(res.unusedDependencies).toEqual([]);
    expect(res.healthScore).toBe(100);
  });

  it('rethrows non-shell errors (no swallow)', async () => {
    runner.when('knip', () => new Error('network down'));
    runner.when('depcheck', () => ({ stdout: '{}', stderr: '', exitCode: 0, command: 'depcheck' }));
    await expect(service.analyze(10)).rejects.toThrow('network down');
  });
});

describe('ScanService.openPullRequest', () => {
  it('builds a deterministic branch name and delegates to GitHub client', async () => {
    const runner = new StubRunner();
    const github = new StubGitHub();
    const service = new ScanService(runner, github);
    const result = await service.openPullRequest();
    expect(result.branch).toMatch(/^chore\/dark-matter-\d{8}-\d{4}$/);
    expect(result.pullRequestUrl).toMatch(/^https:\/\/github\.com/);
    expect(github.opened.length).toBe(1);
    expect(github.opened[0]?.title).toContain('dark-matter');
  });
});
