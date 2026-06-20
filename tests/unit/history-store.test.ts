import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { FileHistoryStore } from '../../src/services/history-store.js';
import { HistoryIoError } from '../../src/validation/errors.js';
import { tmpDir } from './_fixtures.js';

describe('FileHistoryStore', () => {
  let dir: { dir: string; cleanup: () => void };
  let filePath: string;

  beforeEach(() => {
    dir = tmpDir();
    filePath = path.join(dir.dir, 'history.json');
  });
  afterEach(() => dir.cleanup());

  it('returns empty list when the file does not exist', async () => {
    const store = new FileHistoryStore(filePath);
    await store.load();
    expect(store.list()).toEqual([]);
  });

  it('appends newest-first and persists to disk', async () => {
    const store = new FileHistoryStore(filePath);
    await store.load();
    await store.append({ kind: 'scan', status: 'success', message: 'first' });
    await store.append({ kind: 'scan', status: 'success', message: 'second' });
    expect(store.list().map((r) => r.message)).toEqual(['second', 'first']);
    const onDisk = JSON.parse(await fs.readFile(filePath, 'utf8'));
    expect(onDisk[0].message).toBe('second');
    expect(onDisk[1].message).toBe('first');
  });

  it('records an ISO timestamp and optional fields', async () => {
    const store = new FileHistoryStore(filePath);
    await store.load();
    const rec = await store.append({
      kind: 'revert',
      status: 'success',
      message: 'reverted',
      sha: 'abc123',
      branch: 'panic/revert-abc123',
      pullRequestUrl: 'https://example.com/pr/1'
    });
    expect(rec.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(rec.sha).toBe('abc123');
    expect(rec.branch).toBe('panic/revert-abc123');
  });

  it('survives a corrupted existing file by treating it as empty', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{not json');
    const store = new FileHistoryStore(filePath);
    await expect(store.load()).rejects.toBeInstanceOf(HistoryIoError);
  });

  it('drops malformed records on load (defensive sanitize)', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const seed = [
      { timestamp: '2025-01-01T00:00:00Z', kind: 'scan', status: 'success', message: 'ok' },
      { timestamp: '2025-01-01T00:00:00Z', kind: 'invalid-kind', status: 'success', message: 'dropped' },
      { timestamp: '2025-01-01T00:00:00Z', kind: 'scan', status: 'bogus', message: 'dropped' },
      { kind: 'scan', status: 'success', message: 'no timestamp, dropped' }
    ];
    await fs.writeFile(filePath, JSON.stringify(seed));
    const store = new FileHistoryStore(filePath);
    await store.load();
    expect(store.list().length).toBe(1);
    expect(store.list()[0]?.message).toBe('ok');
  });

  it('serialises concurrent appends without losing entries', async () => {
    const store = new FileHistoryStore(filePath);
    await store.load();
    await Promise.all([
      store.append({ kind: 'scan', status: 'success', message: 'a' }),
      store.append({ kind: 'scan', status: 'success', message: 'b' }),
      store.append({ kind: 'scan', status: 'success', message: 'c' }),
      store.append({ kind: 'scan', status: 'success', message: 'd' }),
      store.append({ kind: 'scan', status: 'success', message: 'e' })
    ]);
    expect(store.list().length).toBe(5);
    const messages = store.list().map((r) => r.message).sort();
    expect(messages).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
