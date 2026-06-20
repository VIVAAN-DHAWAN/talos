/**
 * History store — append-only audit log persisted to disk atomically.
 *
 * The store reads the file once at construction time and keeps an in-memory
 * copy. Mutations write the full file atomically and update the in-memory
 * copy on success. Concurrent appends are serialised via a per-instance
 * promise chain so two requests racing for a write never lose entries.
 */

import { writeFileAtomic, readJsonFile } from '../infra/fs.js';
import { HistoryIoError } from '../validation/errors.js';
import type {
  HistoryFile,
  HistoryKind,
  HistoryRecord,
  HistoryStatus
} from '../types/history.js';

export interface HistoryStore {
  list(): readonly HistoryRecord[];
  append(input: AppendInput): Promise<HistoryRecord>;
  /** Test helper: replace the on-disk file and refresh the cache. */
  replaceAll(records: HistoryRecord[]): Promise<void>;
}

export interface AppendInput {
  kind: HistoryKind;
  status: HistoryStatus;
  message: string;
  sha?: string;
  reason?: string;
  pullRequestUrl?: string;
  branch?: string;
  summary?: HistoryRecord['summary'];
}

const MAX_RECORDS = 1_000;

export class FileHistoryStore implements HistoryStore {
  private records: HistoryRecord[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    const initial = await readJsonFile<HistoryFile>(this.filePath, []);
    if (!Array.isArray(initial)) {
      throw new HistoryIoError(`History file ${this.filePath} is not an array.`);
    }
    this.records = sanitize(initial);
  }

  list(): readonly HistoryRecord[] {
    return this.records;
  }

  append(input: AppendInput): Promise<HistoryRecord> {
    const record: HistoryRecord = {
      timestamp: new Date().toISOString(),
      kind: input.kind,
      status: input.status,
      message: input.message,
      ...(input.sha !== undefined ? { sha: input.sha } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.pullRequestUrl !== undefined ? { pullRequestUrl: input.pullRequestUrl } : {}),
      ...(input.branch !== undefined ? { branch: input.branch } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {})
    };
    // Defer computing `next` until the chain runs so concurrent appends
    // see the most recent in-memory state, not a snapshot from when
    // append() was called.
    return this.enqueue(async () => {
      const next = [record, ...this.records].slice(0, MAX_RECORDS);
      try {
        await writeFileAtomic(this.filePath, JSON.stringify(next, null, 2) + '\n');
      } catch (err) {
        throw new HistoryIoError(`Failed to persist history to ${this.filePath}`, err);
      }
      this.records = next;
      return record;
    });
  }

  async replaceAll(records: HistoryRecord[]): Promise<void> {
    const sanitized = sanitize(records);
    await this.enqueue(async () => {
      try {
        await writeFileAtomic(this.filePath, JSON.stringify(sanitized, null, 2) + '\n');
      } catch (err) {
        throw new HistoryIoError(`Failed to persist history to ${this.filePath}`, err);
      }
      this.records = sanitized;
    });
  }

  /**
   * Runs `fn` after every previously-queued write completes. Rejects
   * propagate to the returned promise but do not break the chain — the
   * next enqueue will still run.
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    // Swallow rejections on the chain itself so a failed write does not
    // poison subsequent writes. The caller still sees the rejection via
    // the returned `run` promise.
    this.writeChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

function sanitize(records: unknown): HistoryRecord[] {
  if (!Array.isArray(records)) return [];
  const out: HistoryRecord[] = [];
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Partial<HistoryRecord>;
    if (typeof rec.timestamp !== 'string' || typeof rec.message !== 'string') continue;
    if (rec.kind !== 'scan' && rec.kind !== 'revert' && rec.kind !== 'system') continue;
    if (rec.status !== 'success' && rec.status !== 'failure' && rec.status !== 'partial') continue;
    out.push({
      timestamp: rec.timestamp,
      kind: rec.kind,
      status: rec.status,
      message: rec.message,
      ...(rec.sha !== undefined ? { sha: rec.sha } : {}),
      ...(rec.reason !== undefined ? { reason: rec.reason } : {}),
      ...(rec.pullRequestUrl !== undefined ? { pullRequestUrl: rec.pullRequestUrl } : {}),
      ...(rec.branch !== undefined ? { branch: rec.branch } : {}),
      ...(rec.summary !== undefined ? { summary: rec.summary } : {})
    });
  }
  return out;
}
