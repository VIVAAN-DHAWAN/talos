import { describe, it, expect } from 'vitest';
import { ShellRunner } from '../../src/infra/shell.js';
import { ShellDisabledError, ShellNonZeroError } from '../../src/validation/errors.js';
import { config } from '../../src/config/env.js';

describe('ShellRunner', () => {
  it('echoes args verbatim via argument-array invocation', async () => {
    const runner = new ShellRunner();
    const res = await runner.run('node', ['-e', 'process.stdout.write("hello world")'], { bypassDisableFlag: true });
    expect(res.stdout).toBe('hello world');
    expect(res.exitCode).toBe(0);
  });

  it('throws ShellNonZeroError on non-zero exit', async () => {
    const runner = new ShellRunner();
    await expect(
      runner.run('node', ['-e', 'process.exit(3)'], { bypassDisableFlag: true })
    ).rejects.toBeInstanceOf(ShellNonZeroError);
  });

  it('throws ShellDisabledError when kill switch is on', async () => {
    const original = config.disableSpawn;
    // mutate the in-memory config; restore after
    (config as { disableSpawn: boolean }).disableSpawn = true;
    try {
      const runner = new ShellRunner();
      await expect(runner.run('echo', ['hi'])).rejects.toBeInstanceOf(ShellDisabledError);
    } finally {
      (config as { disableSpawn: boolean }).disableSpawn = original;
    }
  });

  it('rejects command names containing shell metacharacters', async () => {
    const runner = new ShellRunner();
    await expect(
      runner.run('echo;rm -rf /', ['x'], { bypassDisableFlag: true })
    ).rejects.toBeInstanceOf(ShellNonZeroError);
  });

  it('times out and reports ShellTimeoutError', async () => {
    const runner = new ShellRunner();
    await expect(
      runner.run('node', ['-e', 'setTimeout(()=>{}, 5000)'], {
        bypassDisableFlag: true,
        timeoutMs: 200
      })
    ).rejects.toMatchObject({ name: 'ShellTimeoutError' });
  }, 5_000);
});
