import { describe, it, expect, beforeEach } from 'vitest';
import { PanicService } from '../../src/services/panic-service.js';
import { StubRunner, StubGitHub } from './_fixtures.js';
import { ValidationError, ShellNonZeroError } from '../../src/validation/errors.js';
import { config } from '../../src/config/env.js';

describe('PanicService', () => {
  let runner: StubRunner;
  let github: StubGitHub;
  let service: PanicService;

  beforeEach(() => {
    runner = new StubRunner();
    github = new StubGitHub();
    service = new PanicService(runner, github);
    (config as { disableSpawn: boolean }).disableSpawn = false;
  });

  describe('planRevert', () => {
    it('resolves HEAD when no SHA is supplied', async () => {
      runner.when('git rev-parse', () => ({ stdout: 'abcd1234abcd1234abcd1234abcd1234abcd1234\n', stderr: '', exitCode: 0, command: 'git rev-parse HEAD' }));
      runner.when('git rev-list', () => ({ stdout: 'abcd1234 abcd1234\n', stderr: '', exitCode: 0, command: 'git rev-list' }));
      const plan = await service.planRevert(undefined);
      expect(plan.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(plan.isMerge).toBe(false);
    });

    it('resolves and validates a 7-char abbreviated SHA', async () => {
      runner.when('git rev-parse', () => ({ stdout: 'abcdef1234567890abcdef1234567890abcdef12\n', stderr: '', exitCode: 0, command: 'git rev-parse' }));
      runner.when('git cat-file', () => ({ stdout: '', stderr: '', exitCode: 0, command: 'git cat-file -e' }));
      runner.when('git rev-list', () => ({ stdout: 'abcdef12 abcdef12\n', stderr: '', exitCode: 0, command: 'git rev-list' }));
      const plan = await service.planRevert('abcdef1');
      expect(plan.sha).toMatch(/^[0-9a-f]{40}$/);
    });

    it('rejects a SHA that does not point at a commit', async () => {
      runner.when('git rev-parse', () => ({ stdout: 'abcdef1234567890abcdef1234567890abcdef12\n', stderr: '', exitCode: 0, command: 'git rev-parse' }));
      runner.when('git cat-file', () => new ShellNonZeroError('git cat-file -e', 128, '', 'not a commit'));
      await expect(service.planRevert('abcdef1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a merge commit', async () => {
      runner.when('git rev-parse', () => ({ stdout: 'abcdef1234567890abcdef1234567890abcdef12\n', stderr: '', exitCode: 0, command: 'git rev-parse HEAD' }));
      // 3 tokens = 2 parents = merge
      runner.when('git rev-list', () => ({ stdout: 'abcdef12 parent1 parent2\n', stderr: '', exitCode: 0, command: 'git rev-list' }));
      await expect(service.planRevert(undefined)).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('performRevert', () => {
    it('creates branch, reverts, returns outcome', async () => {
      runner.when('git checkout', () => ({ stdout: '', stderr: '', exitCode: 0, command: 'git checkout -B' }));
      runner.when('git revert', () => ({ stdout: '[panic/revert-abcdef123456 abcdef1] Revert abc\n', stderr: '', exitCode: 0, command: 'git revert' }));
      const outcome = await service.performRevert({ sha: 'abcdef1234567890abcdef1234567890abcdef12', isMerge: false });
      expect(outcome.branch).toBe('panic/revert-abcdef123456');
      expect(outcome.log).toContain('Revert');
    });

    it('calls git revert --abort on failure', async () => {
      // First revert call: fail with non-zero. Subsequent revert calls
      // (i.e. `git revert --abort`) fall through to the same stub key
      // and return success — which is fine, we only care that the
      // abort attempt was made.
      const failRunner = new StubRunner();
      const failGithub = new StubGitHub();
      const failService = new PanicService(failRunner, failGithub);
      failRunner.when('git checkout', () => ({ stdout: '', stderr: '', exitCode: 0, command: 'git checkout' }));
      failRunner.when('git revert', () => new ShellNonZeroError('git revert', 1, '', 'conflict'));

      await expect(
        failService.performRevert({ sha: 'abcdef1234567890abcdef1234567890abcdef12', isMerge: false })
      ).rejects.toBeInstanceOf(ShellNonZeroError);

      const abortAttempt = failRunner.calls.find(
        (c) => c.command === 'git' && c.args[0] === 'revert' && c.args[1] === '--abort'
      );
      expect(abortAttempt).toBeDefined();
    });
  });

  describe('openRecoveryPlan', () => {
    it('pushes and opens a PR', async () => {
      runner.when('git push', () => ({ stdout: '', stderr: '', exitCode: 0, command: 'git push' }));
      const result = await service.openRecoveryPlan(
        { sha: 'abcdef1234567890abcdef1234567890abcdef12', isMerge: false },
        { sha: 'abcdef1234567890abcdef1234567890abcdef12', branch: 'panic/revert-abcdef123456', log: '' },
        'production hotfix'
      );
      expect(result.branch).toBe('panic/revert-abcdef123456');
      expect(result.pullRequestUrl).toMatch(/^https:\/\//);
      expect(github.opened.length).toBe(1);
      expect(github.opened[0]?.body).toContain('production hotfix');
    });
  });
});
