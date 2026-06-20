/**
 * Filesystem helpers — atomic writes, safe JSON read, recursive file count.
 *
 * Atomic writes use the write-temp-then-rename pattern so a crash mid-write
 * never leaves a truncated history file behind.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { HistoryIoError } from '../validation/errors.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** Writes `data` to `filePath` atomically via temp file + rename. */
export async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    // O_WRONLY | O_CREAT | O_EXCL guards against symlink races.
    const handle = await fs.open(tmp, 'wx', 0o600);
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/**
 * Reads and parses a JSON file. Returns `fallback` when the file does not
 * exist; throws {@link HistoryIoError} on parse failure so callers can
 * surface a 5xx instead of crashing the request.
 */
export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw new HistoryIoError(`Failed to read ${filePath}`, err);
  }
  if (raw.trim().length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new HistoryIoError(`Failed to parse JSON at ${filePath}`, err);
  }
}

/** Counts `ts/tsx/js/jsx` files under `dir`, recursively. Never throws. */
export async function countSourceFiles(dir: string): Promise<number> {
  let count = 0;
  async function walk(current: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        count++;
      }
    }
  }
  await walk(dir);
  return count;
}

/** Ensures `dir` exists. */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Reads `filePath` if it exists, returns null otherwise. */
export async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
